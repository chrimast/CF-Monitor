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
  assert.equal(ip.status, 201)
  assert.equal(ip.body.data.url, 'http://192.0.2.8:10087')

  const privateIp = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '内网节点',
    url: 'http://192.168.1.8:10087',
    token: 'agent-token'
  }), env, true))
  assert.equal(privateIp.status, 422)
  assert.match(privateIp.body.error, /内网|私网|localhost/)

  const customPort = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: '自定义端口',
    url: 'http://waf.example.com:10087',
    token: 'agent-token'
  }), env, true))
  assert.equal(customPort.status, 201)
  assert.equal(customPort.body.data.url, 'http://waf.example.com:10087')
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
  const i18n = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/utils/i18n.js', import.meta.url), 'utf8'))
  assert.match(source, /setActiveTab\('wafpanel'\)/)
  assert.match(source, /WafPanel/)
  assert.match(panel, /wafpanelPages/)
  assert.match(panel, /toggleLogBan/)
  assert.match(panel, /saveGeo/)
  assert.ok(panel.includes('wafpanel-geo-codes'))
  assert.ok(panel.includes('wafpanel-geo-codes-row'))
  assert.match(panel, /wafpanel-geo-codes-row[\s\S]*geoRulesText[\s\S]*saveGeo/)
  assert.equal(/class="form-group dnshub-actions"[\s\S]{0,180}@click="saveGeo"/.test(panel), false)
  assert.match(panel, /lookupASN/)
  assert.match(panel, /toggleAutobanProtection/)
  assert.ok(panel.includes('wafpanel-autoban-top'))
  assert.match(panel, /wafpanel-autoban-top[\s\S]*wafpanelProtection[\s\S]*wafpanelPreset/)
  assert.equal(/class="wafpanel-autoban-top"[\s\S]{0,900}wafpanelManualIp/.test(panel), false)
  assert.match(panel, /wafpanelBlocks[\s\S]*wafpanel-temp-ban-ip[\s\S]*wafpanelManualIp[\s\S]*manualAutoban/)
  assert.ok(panel.includes('wafpanel-bans-split'))
  assert.ok(panel.includes('wafpanel-bans-temp'))
  assert.ok(panel.includes('wafpanel-bans-lists'))
  assert.ok(panel.includes("ipRuleState(rule) === 'on' ? 'btn wafpanel-rule-on' : 'btn'"))
  assert.match(panel, /r\.message \|\| \(op === 'ban' \? '已封禁' : '已解封'\)/)
  assert.match(i18n, /wafpanelBlocks: 'Temporary ban records'/)
  assert.match(i18n, /wafpanelBlocks: '临时封禁记录'/)
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
  assert.ok(panel.includes('wafpanel-log-row'))
  assert.ok(panel.includes('wafpanel-log-head'))
  assert.match(panel, /status_codes/)
  assert.match(panel, /ignore_regex/)
  assert.match(panel, /detectAutobanLogpaths/)
  assert.ok(panel.includes('/autoban_detect_logpaths'))
  assert.match(i18n, /wafpanelDetectLogs: 'Detect log paths'/)
  assert.match(i18n, /wafpanelDetectLogs: '探测日志路径'/)
  assert.equal(i18n.includes('再次探测日志路径'), false)
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
  assert.equal(panel.includes('showDetail'), false)
  assert.equal(panel.includes('logDetail'), false)
  assert.equal(panel.includes('/log_detail'), false)
  assert.ok(panel.includes('dashboard.recent'))
  assert.ok(panel.includes('row.is_block ? trans.wafpanelIntercepted : trans.wafpanelLogged'))
  assert.match(panel, /count4xx/)
  assert.match(panel, /row\.rule/)
  assert.match(panel, /jailEditor\.ignoreIpsText/)
  assert.match(panel, /jailEditor\.cloudflare_ban/)
  assert.match(panel, /is_block/)
  assert.match(panel, /item\.mtime/)
  assert.match(panel, /\/reload/)
  assert.match(panel, /wafpanelUrlHint/)
  assert.ok(panel.includes('placeholder="http://203.0.113.10:10087"'))
  assert.match(panel, /wafpanel-node-form/)
  assert.match(panel, /wafpanel-node-actions/)
  assert.match(panel, /@click="probeNodes"/)
  assert.ok(panel.includes("item.state === 'on' ? 'btn wafpanel-rule-on' : 'btn'"))
  assert.ok(panel.includes('files/d3.min.js'))
  assert.ok(panel.includes('files/topojson.min.js'))
  assert.ok(panel.includes('files/datamaps.world.min.js'))
  assert.ok(panel.includes('new Datamap'))
  assert.ok(panel.includes("projection: 'mercator'"))
  assert.ok(panel.includes('wafpanel-map-wrap'))
  assert.ok(panel.includes('setProjection'))
  assert.ok(panel.includes('preserveAspectRatio'))
  assert.ok(panel.includes('xMidYMid meet'))
  assert.ok(panel.includes('fitMapProjection'))
  assert.ok(panel.includes('popupOnHover: true'))
  assert.ok(panel.includes('geography.properties.name'))
  assert.ok(panel.includes("agentGet('/map')"))
  assert.ok(panel.includes('mapInstance.bubbles'))
  assert.ok(panel.includes('buildBubbles'))
  assert.ok(panel.includes('countryKey'))
  assert.ok(panel.includes('separateOverlappingBubbles'))
  assert.ok(panel.includes('projection.invert'))
  assert.ok(panel.includes('maxOffset'))
  assert.ok(panel.includes('wafpanel-bubble-label'))
  assert.ok(panel.includes('point.countryCode') || panel.includes('point.country'))
  assert.ok(panel.includes('point.city'))
  assert.match(panel, /item\.count \+= Number\(point\.count\) \|\| 0/)
  assert.match(panel, /projection\.scale\(scale\)\.translate\(\[tx,\s*ty\]\)/)
  assert.match(panel, /offsetWidth/)
  assert.match(panel, /offsetHeight/)
  assert.equal(panel.includes('width / 6.2'), false)
  assert.equal(panel.includes('height / 1.7'), false)
  assert.equal(panel.includes('basemaps.cartocdn'), false)
  assert.equal(panel.includes('files/world.zh.json'), false)
  assert.equal(panel.includes('ensureLeaflet'), false)
  assert.equal(panel.includes('updateChoropleth'), false)
  assert.equal(panel.includes('buildChoroplethData'), false)
  assert.equal(panel.includes('CHORO_FILLS'), false)
  assert.equal(panel.includes('ISO2_TO_ISO3'), false)
  assert.equal(panel.includes('locationKey'), false)
  assert.match(i18n, /wafpanelBans: 'Ban management'/)
  assert.match(i18n, /wafpanelBans: '封禁管理'/)
}

{
  const css = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/styles/main.css', import.meta.url), 'utf8'))
  assert.match(css, /\.wafpanel-node-form\s*\{[\s\S]*grid-template-columns:/)
  assert.match(css, /\.wafpanel-node-form\s*\{[\s\S]*align-items:\s*end/)
  assert.match(css, /\.wafpanel-node-name\s*\{/)
  assert.match(css, /\.wafpanel-node-url\s*\{/)
  assert.match(css, /\.wafpanel-node-token\s*\{/)
  assert.match(css, /\.wafpanel-rule-on\s*\{/)
  assert.match(css, /\.wafpanel-rule-on\s*\{[\s\S]*background:/)
  assert.match(css, /\.wafpanel-map-wrap/)
  assert.match(css, /\.wafpanel-map\s*\{[\s\S]*min-height:\s*560px/)
  assert.match(css, /\.wafpanel-map\s*\{[\s\S]*position:\s*relative/)
  assert.match(css, /\.wafpanel-map svg/)
  assert.match(css, /\.wafpanel-map svg[\s\S]*max-width:\s*100%/)
  assert.match(css, /\.wafpanel-map svg[\s\S]*max-height:\s*100%/)
  assert.equal(/\.wafpanel-map svg[\s\S]*height:\s*100%\s*!important/.test(css), false)
  assert.match(css, /\.hoverinfo/)
  assert.match(css, /\.wafpanel-bubble-label/)
  assert.match(css, /\.wafpanel-log-row\s*\{[\s\S]*grid-template-columns:/)
  assert.match(css, /\.wafpanel-log-row\s*\{[\s\S]*white-space:\s*nowrap/)
  assert.match(css, /\.wafpanel-log-head,\s*\n\.wafpanel-log-row \{\n    display: grid;\n    grid-template-columns: minmax\(110px, 1fr\) 52px minmax\(72px, 0\.9fr\) minmax\(0, 1\.6fr\) minmax\(118px, 0\.8fr\) minmax\(118px, 0\.8fr\) 88px 104px;/)
  assert.match(css, /\.wafpanel-geo-codes\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/)
  assert.match(css, /\.wafpanel-geo-codes-row\s*\{[\s\S]*display:\s*flex/)
  assert.match(css, /\.wafpanel-geo-codes-row \.form-input\s*\{[\s\S]*flex:\s*1/)
  assert.match(css, /\.wafpanel-autoban-top\s*\{[\s\S]*grid-template-columns:/)
  assert.match(css, /\.wafpanel-bans-split\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.5fr\)\s*minmax\(0,\s*1fr\)/)
  assert.match(css, /\.wafpanel-temp-ban-ip \.form-input\s*\{[\s\S]*flex:\s*1/)
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

function fakeTcpSocket(httpText, { requireReaderFirst = false, opened = Promise.resolve({ remoteAddress: '203.0.113.10:10087' }) } = {}) {
  const encoder = new TextEncoder()
  const payload = encoder.encode(httpText)
  let written = ''
  let readerAttached = false
  let closedWrite = false
  return {
    written: () => written,
    opened,
    writable: {
      getWriter() {
        return {
          async write(chunk) { written += new TextDecoder().decode(chunk) },
          async close() { closedWrite = true }
        }
      }
    },
    readable: {
      getReader() {
        readerAttached = true
        let done = false
        return {
          async read() {
            if (done) return { done: true, value: undefined }
            done = true
            if (requireReaderFirst && closedWrite && !readerAttached) {
              return { done: true, value: undefined }
            }
            if (requireReaderFirst && !readerAttached) {
              return { done: true, value: undefined }
            }
            return { done: false, value: payload }
          }
        }
      }
    }
  }
}

function delayedPayloadSocket(httpText) {
  const encoder = new TextEncoder()
  const payload = encoder.encode(httpText)
  let written = ''
  let closedWrite = false
  const waiters = []
  return {
    written: () => written,
    opened: Promise.resolve({}),
    writable: {
      getWriter() {
        return {
          async write(chunk) {
            written += new TextDecoder().decode(chunk)
            while (waiters.length) waiters.shift()()
          },
          async close() { closedWrite = true }
        }
      }
    },
    readable: {
      getReader() {
        let done = false
        return {
          async read() {
            if (done) return { done: true, value: undefined }
            if (!written) await new Promise((resolve) => waiters.push(resolve))
            done = true
            if (closedWrite) return { done: true, value: undefined }
            return { done: false, value: payload }
          }
        }
      }
    }
  }
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: 'TCP 节点',
    url: 'http://203.0.113.10:10087',
    token: 'tcp-token'
  }), env, true))
  const sockets = []
  const connectImpl = (address) => {
    sockets.push({ address, method: 'GET' })
    return fakeTcpSocket('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 24\r\nConnection: close\r\n\r\n{"ok":true,"role":"agent"}')
  }
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true, role: 'agent' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, connectImpl, fetchImpl },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, true)
  assert.equal(probed.status, 'ok')
  assert.equal(probed.token, undefined)
  assert.equal(sockets[0].address.hostname, '203.0.113.10')
  assert.equal(sockets[0].address.port, 10087)

  const forwarded = []
  const forwardConnect = (address) => {
    forwarded.push(address)
    return fakeTcpSocket('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 12\r\nConnection: close\r\n\r\n{"ok":true}')
  }
  const forwardedResult = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', `/api/wafpanel/nodes/${created.body.data.id}/dashboard`),
    { ...env, connectImpl: forwardConnect, fetchImpl: async () => new Response('should-not-fetch', { status: 500 }) },
    true
  ))
  assert.equal(forwardedResult.status, 200)
  assert.equal(forwarded[0].hostname, '203.0.113.10')
  assert.equal(forwarded[0].port, 10087)
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: 'TCP 半关闭节点',
    url: 'http://198.51.100.10:10087',
    token: 'half-token'
  }), env, true))
  let writerClosed = false
  const connectImpl = () => {
    const socket = delayedPayloadSocket('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 24\r\nConnection: close\r\n\r\n{"ok":true,"role":"agent"}')
    const inner = socket.writable.getWriter()
    socket.writable.getWriter = () => ({
      write: inner.write,
      close: async () => {
        writerClosed = true
        return inner.close()
      }
    })
    return socket
  }
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, connectImpl, fetchImpl: async () => new Response('should-not-fetch', { status: 500 }) },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(writerClosed, false)
  assert.equal(probed.online, true)
  assert.equal(probed.status, 'ok')
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: 'TCP chunked 节点',
    url: 'http://198.51.100.11:10087',
    token: 'chunk-token'
  }), env, true))
  const connectImpl = () => fakeTcpSocket('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n18\r\n{"ok":true,"role":"agent"}\r\n0\r\n\r\n')
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, connectImpl, fetchImpl: async () => new Response('should-not-fetch', { status: 500 }) },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, true)
  assert.equal(probed.status, 'ok')
}

{
  const created = await readJson(await handleWafpanelRequest(jsonRequest('POST', '/api/wafpanel/nodes', {
    name: 'TCP 502 节点',
    url: 'http://198.51.100.12:10087',
    token: 'empty-token'
  }), env, true))
  const connectImpl = () => fakeTcpSocket('')
  const { body } = await readJson(await handleWafpanelRequest(
    jsonRequest('GET', '/api/wafpanel/nodes?probe=1'),
    { ...env, connectImpl, fetchImpl: async () => new Response('should-not-fetch', { status: 500 }) },
    true
  ))
  const probed = body.data.find((item) => item.id === created.body.data.id)
  assert.equal(probed.online, false)
  assert.equal(typeof probed.message, 'string')
  assert.notEqual(probed.message, 'true')
  assert.match(probed.message, /HTTP 502|没有返回/)
}

{
  const panel = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/views/admin/components/WafPanel.vue', import.meta.url), 'utf8'))
  assert.ok(panel.includes(':disabled="item.online !== true"'))
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
