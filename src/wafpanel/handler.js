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

function probeStatus(ok, status, payload) {
  if (ok && payload && payload.ok !== false) return { online: true, status: 'ok', message: '' }
  if (status === 401 || status === 403) return { online: false, status: 'auth', message: 'Token 无效' }
  return { online: false, status: 'error', message: payload?.error || payload?.message || `HTTP ${status}` }
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
  const value = String(raw || '').trim().replace(/\/+$/, '')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return ''
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host) return ''
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
    return publicNode(node, probeStatus(response.ok, response.status, payload))
  } catch (err) {
    return publicNode(node, { online: false, status: 'offline', message: err instanceof Error ? err.message : String(err) })
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
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!name) return jsonError('请填写节点名称', 422)
    if (!nodeUrl) return jsonError('远程节点地址无效', 422)
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
    const token = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : existing.token
    if (!nodeUrl) return jsonError('远程节点地址无效', 422)
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
