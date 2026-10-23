function boundFetch(fetchImpl) {
  if (!fetchImpl || fetchImpl === fetch) {
    return (...args) => globalThis.fetch(...args)
  }
  return fetchImpl
}

function json(data, status = 200) {
  return Response.json(data, { status })
}

function jsonError(message, status) {
  return json({ success: false, error: message, code: status }, status)
}

function publicNode(node, extra = {}) {
  return {
    id: node.id,
    name: node.name,
    url: node.url,
    createdAt: node.createdAt || node.created_at || '',
    ...extra
  }
}

function probeMessage(payload, text = '', status) {
  const message = payload?.message || payload?.detail || payload?.error
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (typeof payload?.raw === 'string' && payload.raw.trim()) return payload.raw.trim()
  if (typeof text === 'string' && text.trim() && !text.trim().startsWith('{')) return text.trim()
  return `HTTP ${status}`
}

function probeStatus(ok, status, payload, text = '') {
  if (ok && payload && payload.ok !== false && payload.error !== true) {
    return { online: true, status: 'ok', message: '' }
  }
  if (status === 401) return { online: false, status: 'auth', message: 'Token 无效' }
  const raw = `${text || ''} ${typeof payload?.error === 'string' ? payload.error : ''} ${payload?.message || ''} ${payload?.raw || ''}`
  if (/disallowed|private network|localhost/i.test(raw)) {
    return { online: false, status: 'error', message: '不能访问内网/localhost。请填公网 IP:端口，例如 http://203.0.113.10:10087' }
  }
  if (status === 403 || /error code:\s*1003|Direct IP/i.test(raw)) {
    return {
      online: false,
      status: 'error',
      message: 'Worker 访问失败。请填公网 http://IP:端口，并放行该端口。'
    }
  }
  return { online: false, status: 'error', message: probeMessage(payload, text, status) }
}

function isPrivateIPv4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return false
  const oct = match.slice(1).map(Number)
  if (oct.some((n) => n > 255)) return true
  const [a, b] = oct
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function isPrivateIPv6(host) {
  const value = String(host || '').toLowerCase()
  if (!value.includes(':')) return false
  if (value === '::1' || value === '::') return true
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80')) return true
  return false
}

function normalizeToken(raw) {
  return String(raw || '').trim().replace(/^['"]+|['"]+$/g, '').trim()
}

function urlError(raw) {
  const value = String(raw || '').trim()
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return '远程节点地址无效'
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '请填写 http://公网IP:端口 或 https://域名'
  const host = String(parsed.hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return '不能使用 localhost 或内网地址'
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return '不能使用内网/私网地址。请填公网 IP:端口，例如 http://203.0.113.10:10087'
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '端口无效'
  if (port === 25) return '不能使用 25 端口'
  return ''
}

function needsSocketTransport(parsed) {
  const host = String(parsed.hostname || '').replace(/^\[|\]$/g, '')
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return true
  return port !== '80' && port !== '443'
}

function concatBytes(chunks) {
  const total = chunks.reduce((n, chunk) => n + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function decodeChunkedBody(body) {
  let remaining = body
  let decoded = ''
  while (remaining) {
    const lineEnd = remaining.indexOf('\r\n')
    if (lineEnd < 0) break
    const size = Number.parseInt(remaining.slice(0, lineEnd), 16)
    if (!Number.isFinite(size) || size < 0) break
    remaining = remaining.slice(lineEnd + 2)
    if (size === 0) break
    decoded += remaining.slice(0, size)
    remaining = remaining.slice(size)
    if (remaining.startsWith('\r\n')) remaining = remaining.slice(2)
  }
  return decoded
}

function httpBodyBytes(bytes, headerEnd) {
  return bytes.slice(headerEnd + 4)
}

function chunkedComplete(body) {
  let remaining = body
  while (remaining) {
    const lineEnd = remaining.indexOf('\r\n')
    if (lineEnd < 0) return false
    const size = Number.parseInt(remaining.slice(0, lineEnd), 16)
    if (!Number.isFinite(size) || size < 0) return false
    remaining = remaining.slice(lineEnd + 2)
    if (size === 0) return true
    if (remaining.length < size + 2) return false
    remaining = remaining.slice(size)
    if (remaining.startsWith('\r\n')) remaining = remaining.slice(2)
  }
  return false
}

function tryParseHttpResponse(bytes, { complete = false } = {}) {
  const text = new TextDecoder().decode(bytes)
  const split = text.indexOf('\r\n\r\n')
  if (split < 0) {
    if (!complete) return null
    return new Response(JSON.stringify({ error: true, message: text.trim() || 'Agent 没有返回 HTTP 响应' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  const head = text.slice(0, split)
  const lines = head.split('\r\n')
  const status = Number(lines[0]?.split(' ')[1] || 0)
  const headers = {}
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':')
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
  }
  const bodyBytes = httpBodyBytes(bytes, split)
  let body = new TextDecoder().decode(bodyBytes)
  if (String(headers['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
    if (!complete && !chunkedComplete(body)) return null
    body = decodeChunkedBody(body)
  } else if (headers['content-length'] != null && headers['content-length'] !== '') {
    const need = Number(headers['content-length'])
    if (Number.isFinite(need) && bodyBytes.byteLength < need && !complete) return null
    if (Number.isFinite(need)) body = new TextDecoder().decode(bodyBytes.slice(0, Math.max(0, need)))
  } else if (!complete) {
    return null
  }
  return new Response(body, { status: status || 502, headers })
}

function parseHttpResponse(bytes) {
  return tryParseHttpResponse(bytes, { complete: true })
}

async function resolveConnect(connectImpl) {
  if (connectImpl) return connectImpl
  const mod = await import('cloudflare:sockets')
  return mod.connect
}

async function socketHttpRequest(parsed, init, connectImpl) {
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
  const connect = await resolveConnect(connectImpl)
  const options = {
    allowHalfOpen: true,
    ...(parsed.protocol === 'https:' ? { secureTransport: 'on' } : { secureTransport: 'off' })
  }
  const socket = connect({ hostname: parsed.hostname, port }, options)
  if (socket.opened) await socket.opened
  const encoder = new TextEncoder()
  const method = (init.method || 'GET').toUpperCase()
  const path = `${parsed.pathname || '/'}${parsed.search || ''}`
  const headers = new Headers(init.headers || {})
  if (!headers.has('Host')) headers.set('Host', parsed.host)
  if (!headers.has('Connection')) headers.set('Connection', 'close')
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  headers.set('Accept-Encoding', 'identity')
  const bodyText = init.body == null ? '' : String(init.body)
  if (bodyText && !headers.has('Content-Length')) {
    headers.set('Content-Length', String(encoder.encode(bodyText).byteLength))
  } else if (!bodyText) {
    headers.delete('Content-Type')
  }
  let requestText = `${method} ${path} HTTP/1.1\r\n`
  for (const [key, value] of headers.entries()) requestText += `${key}: ${value}\r\n`
  requestText += `\r\n${bodyText}`
  const writer = socket.writable.getWriter()
  await writer.write(encoder.encode(requestText))
  const reader = socket.readable.getReader()
  const chunks = []
  let response
  try {
    while (true) {
      response = tryParseHttpResponse(concatBytes(chunks), { complete: false })
      if (response) break
      const { done, value } = await reader.read()
      if (value) chunks.push(value)
      if (done) {
        response = tryParseHttpResponse(concatBytes(chunks), { complete: true })
        break
      }
    }
  } finally {
    try { reader.releaseLock() } catch {}
    try { writer.releaseLock() } catch {}
    try { await socket.close?.() } catch {}
  }
  return response
}

async function agentRequest(node, method, pathWithQuery, { headers, body, fetchImpl, connectImpl } = {}) {
  const target = agentApiUrl(node.url, pathWithQuery)
  const parsed = new URL(target)
  const init = { method, headers, body }
  if (needsSocketTransport(parsed)) return socketHttpRequest(parsed, init, connectImpl)
  return fetchImpl(target, init)
}

function match(pathname, pattern) {
  const pathParts = pathname.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)
  if (pathParts.length !== patternParts.length) return null
  const params = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}

async function readBody(request) {
  return await request.json().catch(() => ({}))
}

function normalizeUrl(raw) {
  if (urlError(raw)) return ''
  const parsed = new URL(String(raw || '').trim())
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`
}

export async function ensureWafpanelSchema(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS wafpanel_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
  ).run()
}

async function listNodes(db) {
  const { results } = await db.prepare('SELECT id, name, url, created_at FROM wafpanel_nodes ORDER BY created_at DESC').all()
  return (results || []).map((row) => publicNode({
    id: row.id,
    name: row.name,
    url: row.url,
    createdAt: row.created_at
  }))
}

async function listNodesWithToken(db) {
  const { results } = await db.prepare('SELECT id, name, url, token, created_at FROM wafpanel_nodes ORDER BY created_at DESC').all()
  return (results || []).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    token: row.token,
    createdAt: row.created_at
  }))
}

async function probeNode(node, fetchImpl, connectImpl) {
  try {
    const response = await agentRequest(node, 'GET', '/agent/health', {
      headers: { Authorization: `Bearer ${node.token}` },
      fetchImpl,
      connectImpl
    })
    const text = await response.text()
    let payload = {}
    try { payload = text ? JSON.parse(text) : {} } catch { payload = { raw: text } }
    return publicNode(node, probeStatus(response.ok, response.status, payload, text))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/disallowed|private network|localhost/i.test(message)) {
      return publicNode(node, probeStatus(false, 0, { message }, message))
    }
    return publicNode(node, { online: false, status: 'offline', message })
  }
}

async function getNode(db, id) {
  const row = await db.prepare('SELECT id, name, url, token, created_at FROM wafpanel_nodes WHERE id = ?').bind(id).first()
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    token: row.token,
    createdAt: row.created_at
  }
}

function agentApiUrl(baseUrl, pathWithQuery) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const raw = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`
  if (raw.startsWith('/agent/')) return `${base}${raw}`
  if (raw.startsWith('/api/')) return `${base}/agent${raw}`
  return `${base}/agent/api${raw}`
}

async function forwardNode(node, request, fetchImpl, extraPath = '', connectImpl) {
  const url = new URL(request.url)
  const suffix = extraPath || url.pathname.replace(/^\/api\/wafpanel\/nodes\/[^/]+/, '') || '/'
  const init = {
    headers: {
      Authorization: `Bearer ${node.token}`,
      'Content-Type': request.headers.get('Content-Type') || 'application/json'
    },
    fetchImpl,
    connectImpl
  }
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    init.body = await request.clone().text()
  }
  const response = await agentRequest(node, request.method, `${suffix}${url.search || ''}`, init)
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }
  return json(payload, response.status)
}

export async function handleWafpanelRequest(request, env, authenticated) {
  if (!authenticated) return jsonError('Unauthorized', 401)
  if (!env.DB) return jsonError('D1 未绑定', 500)
  await ensureWafpanelSchema(env.DB)
  const fetchImpl = boundFetch(env.fetchImpl)
  const connectImpl = env.connectImpl
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method.toUpperCase()

  if (method === 'GET' && path === '/api/wafpanel/nodes') {
    if (url.searchParams.get('probe') === '1') {
      const nodes = await listNodesWithToken(env.DB)
      const data = await Promise.all(nodes.map((node) => probeNode(node, fetchImpl, connectImpl)))
      return json({ success: true, data })
    }
    return json({ success: true, data: await listNodes(env.DB) })
  }

  if (method === 'POST' && path === '/api/wafpanel/nodes') {
    const body = await readBody(request)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const nodeUrl = normalizeUrl(body.url)
    const token = normalizeToken(body.token)
    if (!name) return jsonError('请填写节点名称', 422)
    if (!nodeUrl) return jsonError(urlError(body.url) || '远程节点地址无效', 422)
    if (!token) return jsonError('请填写 Agent Token', 422)
    const node = {
      id: crypto.randomUUID(),
      name,
      url: nodeUrl,
      token,
      createdAt: new Date().toISOString()
    }
    await env.DB.prepare('INSERT INTO wafpanel_nodes (id, name, url, token, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(node.id, node.name, node.url, node.token, node.createdAt)
      .run()
    return json({ success: true, data: publicNode(node) }, 201)
  }

  const oneNode = match(path, '/api/wafpanel/nodes/:id')
  if (method === 'DELETE' && oneNode) {
    await env.DB.prepare('DELETE FROM wafpanel_nodes WHERE id = ?').bind(oneNode.id).run()
    return json({ success: true })
  }
  if (method === 'PATCH' && oneNode) {
    const existing = await getNode(env.DB, oneNode.id)
    if (!existing) return jsonError('节点不存在', 404)
    const body = await readBody(request)
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name
    const nodeUrl = body.url ? normalizeUrl(body.url) : existing.url
    const token = typeof body.token === 'string' && body.token.trim() ? normalizeToken(body.token) : existing.token
    if (body.url && !nodeUrl) return jsonError(urlError(body.url) || '远程节点地址无效', 422)
    await env.DB.prepare('UPDATE wafpanel_nodes SET name = ?, url = ?, token = ? WHERE id = ?')
      .bind(name, nodeUrl, token, oneNode.id)
      .run()
    return json({ success: true, data: publicNode({ ...existing, name, url: nodeUrl, token }) })
  }

  const nested = path.match(/^\/api\/wafpanel\/nodes\/([^/]+)(\/.*)?$/)
  if (nested && nested[2]) {
    const node = await getNode(env.DB, nested[1])
    if (!node) return jsonError('节点不存在', 404)
    const extraPath = nested[2] || '/agent/health'
    try {
      return await forwardNode(node, request, fetchImpl, extraPath === '/' ? '/agent/health' : extraPath, connectImpl)
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502)
    }
  }

  return jsonError('Not Found', 404)
}
