if (typeof globalThis.WebSocketPair === 'undefined') {
  globalThis.WebSocketPair = class WebSocketPair {
    constructor() {
      throw new Error('WebSocketPair is unavailable in the Docker host')
    }
  }
}
if (typeof globalThis.WebSocketRequestResponsePair === 'undefined') {
  globalThis.WebSocketRequestResponsePair = class WebSocketRequestResponsePair {}
}

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

function rewriteSql(sql) {
  return String(sql)
}

function columnNames(stmt) {
  try {
    return stmt.columnNames()
  } catch {
    return []
  }
}

function rowToObject(columns, values) {
  if (!values) return null
  const row = {}
  columns.forEach((name, index) => {
    row[name] = values[index]
  })
  return row
}

export function createSqliteD1(dbPath) {
  if (dbPath && dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const sqlite = new DatabaseSync(dbPath || ':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')

  return {
    sqlite,
    prepare(sql) {
      const rewritten = rewriteSql(sql)
      let statement
      try {
        statement = sqlite.prepare(rewritten)
      } catch (error) {
        statement = null
        statement = { _error: error }
      }
      const bound = {
        params: [],
        bind(...params) {
          bound.params = params
          return bound
        },
        async first() {
          if (statement?._error) throw statement._error
          const columns = columnNames(statement)
          const values = statement.get(...bound.params)
          if (!values) return null
          return Array.isArray(values) ? rowToObject(columns, values) : values
        },
        async all() {
          if (statement?._error) throw statement._error
          const columns = columnNames(statement)
          const rows = statement.all(...bound.params)
          const results = (rows || []).map((row) => (
            Array.isArray(row) ? rowToObject(columns, row) : row
          ))
          return { results }
        },
        async run() {
          if (statement?._error) throw statement._error
          const info = statement.run(...bound.params)
          return {
            success: true,
            meta: {
              changes: info?.changes ?? 0,
              last_row_id: info?.lastInsertRowid ?? 0
            }
          }
        }
      }
      return bound
    }
  }
}

export function createInMemoryDurableNamespace(factory, env) {
  const instances = new Map()
  return {
    idFromName(name) {
      return { name: String(name) }
    },
    get(id) {
      const key = id?.name || String(id)
      if (!instances.has(key)) {
        const state = {
          waitUntil(promise) {
            Promise.resolve(promise).catch(() => {})
          },
          acceptWebSocket() {},
          getWebSockets() {
            return []
          },
          setWebSocketAutoResponse() {},
          storage: {
            async get() { return null },
            async put() {}
          }
        }
        const instance = factory(state, env)
        const originalFetch = instance.fetch.bind(instance)
        instance.fetch = async (request) => {
          try {
            let req
            if (typeof request === 'string') {
              req = new Request(new URL(request, 'http://do.internal').toString())
            } else if (request instanceof Request) {
              const raw = String(request.url || '').replace('http://internal', 'http://do.internal')
              const url = new URL(raw, 'http://do.internal')
              req = new Request(url.toString(), request)
            } else {
              req = new Request(String(request))
            }
            return await originalFetch(req)
          } catch (error) {
            if (/WebSocket|Invalid URL/i.test(String(error?.message || error))) {
              return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'websocket-unavailable' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              })
            }
            throw error
          }
        }
        instances.set(key, instance)
      }
      return instances.get(key)
    }
  }
}

export function createWaitUntilContext() {
  const pending = []
  return {
    waitUntil(promise) {
      pending.push(Promise.resolve(promise).catch(() => {}))
    },
    async flush() {
      await Promise.all(pending.splice(0))
    }
  }
}

function nodeConnect({ hostname, port }, options = {}) {
  return import('node:net').then(async ({ connect }) => {
    const socket = connect({ host: hostname, port: Number(port) })
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    if (options.secureTransport === 'on') {
      const { connect: tlsConnect } = await import('node:tls')
      const tls = tlsConnect({ socket, servername: hostname })
      await new Promise((resolve, reject) => {
        tls.once('secureConnect', resolve)
        tls.once('error', reject)
      })
      return wrapNodeSocket(tls)
    }
    return wrapNodeSocket(socket)
  })
}

function wrapNodeSocket(socket) {
  const encoder = new TextEncoder()
  return {
    opened: Promise.resolve(),
    writable: {
      getWriter() {
        return {
          write(chunk) {
            const data = typeof chunk === 'string' ? chunk : Buffer.from(chunk)
            return new Promise((resolve, reject) => {
              socket.write(data, (error) => error ? reject(error) : resolve())
            })
          },
          releaseLock() {}
        }
      }
    },
    readable: {
      getReader() {
        const queue = []
        let done = false
        let waiter = null
        socket.on('data', (buf) => {
          const value = new Uint8Array(buf)
          if (waiter) {
            const resolve = waiter
            waiter = null
            resolve({ done: false, value })
          } else {
            queue.push(value)
          }
        })
        socket.on('end', () => {
          done = true
          if (waiter) {
            const resolve = waiter
            waiter = null
            resolve({ done: true, value: undefined })
          }
        })
        socket.on('error', () => {
          done = true
          if (waiter) {
            const resolve = waiter
            waiter = null
            resolve({ done: true, value: undefined })
          }
        })
        return {
          read() {
            if (queue.length) return Promise.resolve({ done: false, value: queue.shift() })
            if (done) return Promise.resolve({ done: true, value: undefined })
            return new Promise((resolve) => { waiter = resolve })
          },
          releaseLock() {}
        }
      }
    },
    async close() {
      socket.destroy()
    }
  }
}

export async function createNodeApp(options = {}) {
  const apiSecret = String(options.apiSecret ?? process.env.API_SECRET ?? '')
  if (!apiSecret) {
    throw new Error('API_SECRET is required')
  }
  const dbPath = options.dbPath || process.env.CF_MONITOR_DB || '/data/cf-monitor.sqlite'
  const { resetDatabaseInitFlag } = await import('../database/schema.js')
  resetDatabaseInitFlag()
  const { clearAllCaches } = await import('../utils/cache.js')
  const { clearDashboardLatencyHistoryCache } = await import('../database/schema.js')
  clearAllCaches()
  clearDashboardLatencyHistoryCache()

  const DB = createSqliteD1(dbPath)
  const env = {
    API_SECRET: apiSecret,
    API_USER_NAME: options.apiUserName || process.env.API_USER_NAME || 'admin',
    DEBUG: options.debug || process.env.DEBUG || '',
    CORS_ALLOWED_ORIGINS: options.cors || process.env.CORS_ALLOWED_ORIGINS || '',
    RUNTIME: 'docker',
    DB,
    ASSETS: createAssetsBinding(options.assetsDir || process.env.ASSETS_DIR || new URL('../../dist', import.meta.url).pathname),
    connectImpl: options.connectImpl || ((addr, opts) => nodeConnect(addr, opts)),
    fetchImpl: options.fetchImpl
  }

  const { MetricsBroadcaster } = await import('../durable/MetricsBroadcaster.js')
  const { TerminalHub } = await import('../durable/TerminalHub.js')
  env.METRICS_BROADCASTER = createInMemoryDurableNamespace((state, boundEnv) => new MetricsBroadcaster(state, boundEnv), env)
  env.TERMINAL_HUB = createInMemoryDurableNamespace((state, boundEnv) => new TerminalHub(state, boundEnv), env)

  const worker = (await import('../index.js')).default
  const { initDatabase } = await import('../database/schema.js')
  await initDatabase(DB)

  return {
    env,
    async fetch(request, ctx = createWaitUntilContext()) {
      return worker.fetch(request, env, ctx)
    }
  }
}

function createAssetsBinding(rootDir) {
  return {
    async fetch(request) {
      const { readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const url = new URL(request.url)
      const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      try {
        const body = await readFile(join(rootDir, name))
        return new Response(body, { status: 200 })
      } catch {
        return new Response('Not Found', { status: 404 })
      }
    }
  }
}

export async function listen(options = {}) {
  const app = await createNodeApp(options)
  const { createServer } = await import('node:http')
  const port = Number(options.port || process.env.PORT || 8787)
  const host = options.host || process.env.HOST || '0.0.0.0'
  const server = createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host || `127.0.0.1:${port}`}${req.url}`
      const body = await readIncomingBody(req)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue
        if (Array.isArray(value)) value.forEach((item) => headers.append(key, item))
        else headers.set(key, value)
      }
      const request = new Request(url, {
        method: req.method,
        headers,
        body
      })
      const response = await app.fetch(request)
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          res.appendHeader(key, value)
        } else {
          res.setHeader(key, value)
        }
      })
      const buffer = Buffer.from(await response.arrayBuffer())
      res.end(buffer)
    } catch (error) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: error.message || 'Internal Server Error', code: 500 }))
    }
  })
  await new Promise((resolve) => server.listen(port, host, resolve))
  return { server, app, port, host }
}

async function readIncomingBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return undefined
  return Buffer.concat(chunks)
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
  listen().then(({ port, host }) => {
    console.log(`cf-monitor listening on http://${host}:${port}`)
  }).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
