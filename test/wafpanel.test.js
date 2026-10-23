import assert from 'node:assert/strict'
import { handleWafpanelRequest } from '../src/wafpanel/handler.js'

function makeMemoryDb() {
  const nodes = new Map()
  return {
    prepare(sql) {
      const statement = {
        params: [],
        bind(...params) {
          statement.params = params
          return statement
        },
        async all() {
          if (/FROM wafpanel_nodes/.test(sql) && /ORDER BY/.test(sql)) {
            const results = [...nodes.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
            if (!/token/.test(sql)) {
              return { results: results.map(({ token, ...rest }) => rest) }
            }
            return { results }
          }
          return { results: [] }
        },
        async first() {
          if (/FROM sqlite_master/.test(sql)) return { name: 'wafpanel_nodes' }
          if (/FROM wafpanel_nodes WHERE id = \?/.test(sql)) return nodes.get(statement.params[0]) || null
          return null
        },
        async run() {
          if (/CREATE TABLE/.test(sql)) return { success: true }
          if (/INSERT INTO wafpanel_nodes/.test(sql)) {
            const [id, name, url, token, created_at] = statement.params
            nodes.set(id, { id, name, url, token, created_at })
            return { success: true }
          }
          if (/UPDATE wafpanel_nodes/.test(sql)) {
            const [name, url, token, id] = statement.params
            const existing = nodes.get(id)
            if (existing) nodes.set(id, { ...existing, name, url, token })
            return { success: true }
          }
          if (/DELETE FROM wafpanel_nodes/.test(sql)) {
            nodes.delete(statement.params[0])
            return { success: true }
          }
          return { success: true }
        }
      }
      return statement
    }
  }
}

function jsonRequest(method, path, body, headers = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : JSON.stringify(body)
  })
}

async function readJson(response) {
  return { status: response.status, body: await response.json() }
}

const env = { DB: makeMemoryDb() }

{
  const { status } = await readJson(await handleWafpanelRequest(jsonRequest('GET', '/api/wafpanel/nodes'), env, false))
  assert.equal(status, 401)
}

{
  const { status, body } = await readJson(await handleWafpanelRequest(jsonRequest('GET', '/api/wafpanel/nodes'), {}, true))
  assert.equal(status, 500)
  assert.match(body.error, /D1/)
}

{
  const { status, body } = await readJson(await handleWafpanelRequest(jsonRequest('GET', '/api/wafpanel/nodes'), env, true))
  assert.equal(status, 200)
  assert.equal(body.success, true)
  assert.deepEqual(body.data, [])
}

{
  const { status, body } = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '香港 1',
    url: 'https://waf-hk.example.com',
    token: '"agent-token"'
  }), env, true))
  assert.equal(status, 201)
  assert.equal(body.data.name, '香港 1')
  assert.equal(body.data.url, 'https://waf-hk.example.com')
  assert.equal(body.data.token, undefined)
  const listed = await readJson(await handleWafpanelRequest(jsonRequest('GET', '/api/wafpanel/nodes'), env, true))
  assert.equal(listed.body.data[0].token, undefined)
}

{
  const ip = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: 'IP 节点',
    url: 'http://192.0.2.8:10087',
    token: 'agent-token'
  }), env, true))
  assert.equal(ip.status, 422)
  assert.match(ip.body.error, /公网 HTTPS|443|不能使用 IP/)

  const customPort = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '自定义端口',
    url: 'https://waf.example.com:10087',
    token: 'agent-token'
  }), env, true))
  assert.equal(customPort.status, 422)
  assert.match(customPort.body.error, /80|443/)
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '转发节点',
    url: 'https://waf-fwd.example.com',
    token: 'fwd-token'
  }), env, true))
  const nodeId = created.body.data.id
  const captured = []
  const fetchImpl = async (url, options = {}) => {
    captured.push({ url: String(url), method: options.method || 'GET', headers: options.headers, body: options.body })
    return new Response(JSON.stringify({
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
      data: [{ ip: '203.0.113.9', count: 12, first_seen: '2026-10-13 01:00:00', last_seen: '2026-10-20 12:00:00' }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const { status, body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', `/api/wafpanel/nodes/${nodeId}/logs?page=1&limit=20`),
    { ...env, fetchImpl },
    true
  ))
  assert.equal(status, 200)
  assert.equal(body.data[0].count, 12)
  assert.equal(captured[0].url, 'https://waf-fwd.example.com/agent/api/logs?page=1&limit=20')
  assert.equal(captured[0].headers.Authorization, 'Bearer fwd-token')
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '写操作节点',
    url: 'https://waf-write.example.com',
    token: 'write-token'
  }), env, true))
  const nodeId = created.body.data.id
  const captured = []
  const fetchImpl = async (url, options = {}) => {
    captured.push({ url: String(url), method: options.method || 'GET', body: options.body })
    return new Response(JSON.stringify({ ok: true, message: '已保存' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const { status, body } = await readJson(await handleWafpanelRequest(
    jsonRequest('POST', `/api/wafpanel/nodes/${nodeId}/log_ban`, { ip: '203.0.113.9', ban_type: 'temporary', banned: true }),
    { ...env, fetchImpl },
    true
  ))
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(captured[0].method, 'POST')
  assert.equal(captured[0].url, 'https://waf-write.example.com/agent/api/log_ban')
  assert.match(String(captured[0].body), /203\.0\.113\.9/)
}

{
  const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8'))
  const panel = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/views/admin/components/WafPanel.vue', import.meta.url), 'utf8'))
  assert.match(source, /setActiveTab\('wafpanel'\)/)
  assert.match(source, /WafPanel/)
  assert.match(panel, /wafpanelPages/)
  assert.match(panel, /toggleLogBan/)
  assert.match(panel, /saveGeo/)
  assert.match(panel, /lookupASN/)
  assert.match(panel, /toggleAutobanProtection/)
  assert.match(panel, /savePage/)
  assert.match(panel, /blacklist_add/)
  assert.match(panel, /autoban_config/)
  assert.match(panel, /editAutobanJail/)
  assert.match(panel, /commitAutobanJail/)
  assert.match(panel, /editAutobanFilter/)
  assert.match(panel, /commitAutobanFilter/)
  assert.match(panel, /testAutobanFilter/)
  assert.match(panel, /showSystemFilters/)
  assert.match(panel, /previewAutobanConfig/)
  assert.match(panel, /exportAutobanConfig/)
  assert.match(panel, /importAutobanConfig/)
  assert.match(panel, /autoban_filter_test/)
  assert.match(panel, /autoban_preview/)
  assert.match(panel, /autoban_validate/)
  assert.match(panel, /wafpanelInstallCommand/)
  assert.match(panel, /wafpanelUninstallCommand/)
  assert.match(panel, /copyInstallCommand/)
  assert.match(panel, /copyUninstallCommand/)
  assert.match(panel, /--role agent/)
  assert.ok(panel.includes('uninstall.sh'))
  assert.match(panel, /probe=1/)
  assert.match(panel, /probeNodes/)
  assert.match(panel, /loadLogs\(logPage/)
  assert.match(panel, /logPages/)
  assert.match(panel, /status_codes/)
  assert.match(panel, /ignore_regex/)
  assert.match(panel, /detectAutobanLogpaths/)
  assert.match(panel, /refreshAutobanJailStatuses/)
  assert.match(panel, /refreshAutobanStatus/)
  assert.match(panel, /mainJailGenerated/)
  assert.match(panel, /cf_real_ip_enabled/)
  assert.match(panel, /real_ip_header/)
  assert.match(panel, /real_ip_recursive/)
  assert.match(panel, /rule_toggle/)
  assert.match(panel, /cc_config/)
  assert.match(panel, /retryCurrentNode/)
  assert.match(panel, /loadBans\(/)
  assert.match(panel, /banPage/)
  assert.match(panel, /logDetail\.method/)
  assert.match(panel, /count4xx/)
  assert.match(panel, /row\.rule/)
  assert.match(panel, /jailEditor\.ignoreIpsText/)
  assert.match(panel, /jailEditor\.cloudflare_ban/)
  assert.match(panel, /is_block/)
  assert.match(panel, /item\.mtime/)
  assert.match(panel, /\/reload/)
  assert.match(panel, /wafpanelUrlHint/)
  assert.ok(panel.includes('placeholder="https://waf.example.com"'))
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '探活节点',
    url: 'https://waf-probe.example.com',
    token: 'probe-token'
  }), env, true))
  const captured = []
  const fetchImpl = async (url, options = {}) => {
    captured.push({ url: String(url), headers: options.headers })
    return new Response(JSON.stringify({ ok: true, role: 'agent' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const { status, body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, fetchImpl },
    true
  ))
  assert.equal(status, 200)
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, true)
  assert.equal(probed.status, 'ok')
  assert.equal(probed.token, undefined)
  assert.equal(captured.some((item) => item.url === 'https://waf-probe.example.com/agent/health'), true)
  assert.equal(captured.find((item) => item.url.endsWith('/agent/health')).headers.Authorization, 'Bearer probe-token')
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '403 节点',
    url: 'https://waf-blocked.example.com',
    token: 'blocked-token'
  }), env, true))
  const fetchImpl = async () => new Response('error code: 1003', { status: 403 })
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, fetchImpl },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, false)
  assert.equal(probed.status, 'error')
  assert.match(probed.message, /1003|公网 HTTPS|443|不能使用 IP|Worker/)
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '401 节点',
    url: 'https://waf-auth.example.com',
    token: 'wrong-token'
  }), env, true))
  const fetchImpl = async () => new Response(JSON.stringify({ error: true, message: 'Agent Token 无效' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, fetchImpl },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, false)
  assert.equal(probed.status, 'auth')
  assert.equal(probed.message, 'Token 无效')
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '离线节点',
    url: 'https://waf-offline.example.com',
    token: 'offline-token'
  }), env, true))
  const fetchImpl = async () => {
    throw new Error('fetch failed')
  }
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, fetchImpl },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, false)
  assert.equal(probed.status, 'offline')
}
