import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SECRET = 'docker-mvp-secret-please-change-32b'

async function loadRuntime() {
  return import('../src/runtime/node-host.js')
}

test('docker files exist for self-hosted panel', () => {
  const root = new URL('..', import.meta.url)
  const dockerfile = new URL('Dockerfile', root)
  const compose = new URL('docker-compose.yml', root)
  assert.equal(existsSync(dockerfile), true)
  assert.equal(existsSync(compose), true)
  const composeText = readFileSync(compose, 'utf8')
  assert.match(composeText, /cf-monitor/)
  assert.match(composeText, /8787:8787/)
  assert.match(composeText, /cf-monitor-data/)
  assert.match(composeText, /API_SECRET/)
  const dockerfileText = readFileSync(dockerfile, 'utf8')
  assert.match(dockerfileText, /node:22/)
  assert.match(dockerfileText, /build:frontend/)
  assert.match(dockerfileText, /src\/runtime\/node-host.js/)
})

test('SQLite D1 adapter supports prepare/bind/first/all/run and json helpers', async () => {
  const { createSqliteD1 } = await loadRuntime()
  const db = createSqliteD1(':memory:')
  await db.prepare(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run()
  const secret = 'a'.repeat(32)
  await db.prepare(`
    INSERT INTO settings (key, value)
    VALUES ('site_options', json_object('jwt_secret', ?))
  `).bind(secret).run()
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'site_options'").first()
  assert.ok(row)
  const parsed = JSON.parse(row.value)
  assert.equal(parsed.jwt_secret, secret)
  const { results } = await db.prepare('SELECT * FROM settings').all()
  assert.equal(results.length, 1)
  const missing = await db.prepare("SELECT value FROM settings WHERE key = ?").bind('nope').first()
  assert.equal(missing, null)
})

test('node host rejects empty API_SECRET, then login/add/update/list servers persist in SQLite', async () => {
  const { createNodeApp } = await loadRuntime()
  await assert.rejects(() => createNodeApp({ apiSecret: '', dbPath: ':memory:' }), /API_SECRET/)

  const dir = mkdtempSync(join(tmpdir(), 'cf-monitor-'))
  const dbPath = join(dir, 'cf-monitor.sqlite')
  const app = await createNodeApp({ apiSecret: SECRET, dbPath })

  const health = await app.fetch(new Request('http://cf-monitor.test/health'))
  assert.equal(health.status, 200)
  assert.equal((await health.json()).ok, true)

  const configOk = await app.fetch(new Request('http://cf-monitor.test/api/config'))
  assert.equal(configOk.status, 200)
  const configBody = await configOk.json()
  assert.equal(configBody.is_public, true)

  const login = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: SECRET })
  }))
  assert.equal(login.status, 200)
  const loginBody = await login.json()
  assert.equal(loginBody.success, true)
  assert.ok(loginBody.token)

  const add = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`
    },
    body: JSON.stringify({ action: 'add', name: 'docker-node' })
  }))
  assert.equal(add.status, 200)
  const addBody = await add.json()
  assert.equal(addBody.success, true)
  assert.ok(addBody.id)

  const update = await app.fetch(new Request('http://cf-monitor.test/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: addBody.id,
      secret: SECRET,
      metrics: {
        cpu: 12,
        ram_total: 1024,
        ram_used: 256,
        timestamp: Date.now()
      }
    })
  }))
  assert.equal(update.status, 200)

  const list = await app.fetch(new Request('http://cf-monitor.test/api/servers', {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  }))
  assert.equal(list.status, 200)
  const listBody = await list.json()
  assert.equal(listBody.stats.total, 1)
  assert.equal(listBody.servers[0].id, addBody.id)
  assert.equal(listBody.servers[0].name, 'docker-node')
  assert.equal(Number(listBody.servers[0].cpu), 12)

  const restarted = await createNodeApp({ apiSecret: SECRET, dbPath })
  const again = await restarted.fetch(new Request('http://cf-monitor.test/api/servers', {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  }))
  const againBody = await again.json()
  assert.equal(againBody.stats.total, 1)
  assert.equal(againBody.servers[0].id, addBody.id)
})

test('node host upgrades live websocket and broadcasts HTTP updates', async () => {
  const { createNodeApp } = await loadRuntime()
  const app = await createNodeApp({ apiSecret: SECRET, dbPath: ':memory:' })
  const login = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: SECRET })
  }))
  const { token, id } = await (async () => {
    const loginBody = await login.json()
    const add = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginBody.token}`
      },
      body: JSON.stringify({ action: 'add', name: 'ws-node' })
    }))
    const addBody = await add.json()
    return { token: loginBody.token, id: addBody.id }
  })()

  const pair = new WebSocketPair()
  const response = await app.fetch(new Request('http://cf-monitor.test/api/ws?subscribe=all', {
    headers: {
      Upgrade: 'websocket',
      Authorization: `Bearer ${token}`
    },
    webSocket: pair[0]
  }))
  assert.equal(response.status, 101)
  assert.ok(response.webSocket)

  const messages = []
  response.webSocket.addEventListener('message', (event) => messages.push(event.data))
  await app.fetch(new Request('http://cf-monitor.test/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      secret: SECRET,
      metrics: { cpu: 41, ram_total: 1024, ram_used: 100, timestamp: Date.now() }
    })
  }))
  await new Promise((resolve) => setTimeout(resolve, 5200))
  const joined = messages.map(String).join('\n')
  assert.match(joined, /hello|cpu|41/)
  response.webSocket.close()
})

test('node host reverse terminal relays agent data to the browser socket', async () => {
  const { createNodeApp } = await loadRuntime()
  const app = await createNodeApp({ apiSecret: SECRET, dbPath: ':memory:' })
  const login = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: SECRET })
  }))
  const loginBody = await login.json()
  const add = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`
    },
    body: JSON.stringify({ action: 'add', name: 'term-node' })
  }))
  const { id } = await add.json()
  const toggle = await app.fetch(new Request('http://cf-monitor.test/admin/api/terminal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`
    },
    body: JSON.stringify({ id, enabled: true })
  }))
  assert.equal(toggle.status, 200)

  const agentPair = new WebSocketPair()
  const agentRes = await app.fetch(new Request(`http://cf-monitor.test/agent/term?id=${id}&secret=${SECRET}`, {
    headers: { Upgrade: 'websocket' },
    webSocket: agentPair[0]
  }))
  assert.equal(agentRes.status, 101)
  const browserPair = new WebSocketPair()
  const browserRes = await app.fetch(new Request(`http://cf-monitor.test/api/term?id=${id}`, {
    headers: {
      Upgrade: 'websocket',
      Authorization: `Bearer ${loginBody.token}`
    },
    webSocket: browserPair[0]
  }))
  assert.equal(browserRes.status, 101)
  const browserMessages = []
  browserRes.webSocket.addEventListener('message', (event) => browserMessages.push(String(event.data)))
  agentRes.webSocket.send(JSON.stringify({ type: 'data', data: 'uname -a' }))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(browserMessages.some((item) => item.includes('uname -a')), true)
  agentRes.webSocket.close()
  browserRes.webSocket.close()
})

test('node host runs scheduled jobs and Node SMTP sendMail', async () => {
  const { createNodeApp } = await loadRuntime()
  const sent = []
  const app = await createNodeApp({
    apiSecret: SECRET,
    dbPath: ':memory:',
    smtpSendMail: async (config, mail) => {
      sent.push({ config, mail })
    }
  })
  assert.equal(typeof app.tickScheduled, 'function')
  await app.tickScheduled()
  const { sendNotification } = await import('../src/services/notification.js')
  await sendNotification({
    tg_bot_token: 'smtp://user:pass@smtp.example.com:587?from=a@example.com&to=b@example.com&secure=starttls'
  }, 'docker smtp', { event: '测试', emoji: '📧' })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].config.host, 'smtp.example.com')
  assert.match(String(sent[0].mail.subject || sent[0].mail.text || ''), /测试|docker smtp/)
})

test('node host accepts Agent WSS reports on GET /update', async () => {
  const { createNodeApp } = await loadRuntime()
  const app = await createNodeApp({ apiSecret: SECRET, dbPath: ':memory:' })
  const login = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: SECRET })
  }))
  const loginBody = await login.json()
  const add = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`
    },
    body: JSON.stringify({ action: 'add', name: 'wss-node' })
  }))
  const { id } = await add.json()

  const agentRes = await app.fetch(new Request('http://cf-monitor.test/update', {
    headers: { Upgrade: 'websocket' }
  }))
  assert.equal(agentRes.status, 101)
  assert.ok(agentRes.webSocket)
  const acks = []
  agentRes.webSocket.addEventListener('message', (event) => acks.push(String(event.data)))
  await new Promise((resolve) => setTimeout(resolve, 20))
  agentRes.webSocket.send(JSON.stringify({
    id,
    secret: SECRET,
    metrics: { cpu: 77, ram_total: 2048, ram_used: 512, timestamp: Date.now() }
  }))
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(acks.some((item) => item.includes('"type":"ack"') || item.includes('"type":"hello"')), true)

  const list = await app.fetch(new Request('http://cf-monitor.test/api/servers', {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  }))
  const listBody = await list.json()
  assert.equal(Number(listBody.servers[0].cpu), 77)
  agentRes.webSocket.close()
})

test('node host serves frontend assets, DNSHub accounts, and WAF nodes', async () => {
  const { createNodeApp } = await loadRuntime()
  const dir = mkdtempSync(join(tmpdir(), 'cf-monitor-assets-'))
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(join(dir, 'static'), { recursive: true })
  writeFileSync(join(dir, 'dashboard.html'), '<html><title>docker-dashboard</title></html>')
  writeFileSync(join(dir, 'static', 'app.js'), 'console.log("ok")')

  const app = await createNodeApp({ apiSecret: SECRET, dbPath: ':memory:', assetsDir: dir })
  const home = await app.fetch(new Request('http://cf-monitor.test/'))
  assert.equal(home.status, 200)
  assert.match(await home.text(), /<html>/)
  const admin = await app.fetch(new Request('http://cf-monitor.test/admin'))
  assert.equal(admin.status, 200)
  const asset = await app.fetch(new Request('http://cf-monitor.test/static/app.js'))
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type') || '', /javascript/)
  assert.equal(await asset.text(), 'console.log("ok")')

  const login = await app.fetch(new Request('http://cf-monitor.test/admin/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: SECRET })
  }))
  const { token } = await login.json()
  const dns = await app.fetch(new Request('http://cf-monitor.test/api/dnshub/accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'cf-account',
      provider: 'cloudflare',
      credentials: { email: 'ops@example.com', apiKey: 'k' }
    })
  }))
  assert.equal(dns.status, 201)
  const dnsBody = await dns.json()
  assert.equal(dnsBody.success, true)
  assert.equal(dnsBody.data.name, 'cf-account')
  assert.equal(dnsBody.data.credentials, undefined)

  const waf = await app.fetch(new Request('http://cf-monitor.test/api/wafpanel/nodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'edge-1',
      url: 'http://203.0.113.10:10087',
      token: 'agent-token'
    })
  }))
  assert.equal(waf.status, 201)
  const wafBody = await waf.json()
  assert.equal(wafBody.success, true)
  assert.equal(wafBody.data.name, 'edge-1')
  assert.equal(wafBody.data.token, undefined)
})

