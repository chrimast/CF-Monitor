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

function probeStatus(ok, status, payload, text = '') {
  if (ok && payload && payload.ok !== false) return { online: true, status: 'ok', message: '' }
  if (status === 401) return { online: false, status: 'auth', message: 'Token 无效' }
  const raw = `${text || ''} ${payload?.error || ''} ${payload?.message || ''} ${payload?.raw || ''}`
  if (status === 403 || /error code:\s*1003|Direct IP/i.test(raw)) {
    return {
      online: false,
      status: 'error',
      message: 'Worker 访问不到这台 Agent。请填公网 https://域名（443），不要用 IP 或 :10087。可用 cloudflared tunnel。'
    }
  }
  return { online: false, status: 'error', message: payload?.error || payload?.message || `HTTP ${status}` }
}

function isBlockedHostname(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true
  if (host.includes(':')) return true
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
  if (parsed.protocol !== 'https:') return 'Worker 只能访问公网 HTTPS（443）。不要填 http://IP:10087'
  if (isBlockedHostname(parsed.hostname)) return '不能使用 IP 或 localhost。请填 https://域名，并用 Cloudflare Tunnel 或反代到 443'
  if (parsed.port && parsed.port !== '443') return 'Worker 不能访问非 80/443 端口。请用 https://域名（443）'
  return ''
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
  return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`
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

async function probeNode(node, fetchImpl) {
  const target = agentApiUrl(node.url, '/agent/health')
  try {
    const response = await fetchImpl(target, {
      method: 'GET',
      headers: { Authorization: `Bearer ${node.token}` }
    })
    const text = await response.text()
    let payload = {}
    try { payload = text ? JSON.parse(text) : {} } catch { payload = { raw: text } }
    return publicNode(node, probeStatus(response.ok, response.status, payload, text))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/1003|Direct IP/i.test(message)) {
      return publicNode(node, probeStatus(false, 403, { message }, message))
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

async function forwardNode(node, request, fetchImpl, extraPath = '') {
  const url = new URL(request.url)
  const suffix = extraPath || url.pathname.replace(/^\/api\/wafpanel\/nodes\/[^/]+/, '') || '/'
  const target = agentApiUrl(node.url, `${suffix}${url.search || ''}`)
  const init = {
    method: request.method,
    headers: {
      Authorization: `Bearer ${node.token}`,
      'Content-Type': request.headers.get('Content-Type') || 'application/json'
    }
  }
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    init.body = await request.clone().text()
  }
  const response = await fetchImpl(target, init)
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
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method.toUpperCase()

  if (method === 'GET' && path === '/api/wafpanel/nodes') {
    if (url.searchParams.get('probe') === '1') {
      const nodes = await listNodesWithToken(env.DB)
      const data = await Promise.all(nodes.map((node) => probeNode(node, fetchImpl)))
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
      return await forwardNode(node, request, fetchImpl, extraPath === '/' ? '/agent/health' : extraPath)
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502)
    }
  }

  return jsonError('Not Found', 404)
}
