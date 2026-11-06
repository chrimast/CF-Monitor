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
