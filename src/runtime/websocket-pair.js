function listenersOf(target, type) {
  if (!target.listeners.has(type)) target.listeners.set(type, [])
  return target.listeners.get(type)
}

export class NodeWebSocket {
  constructor() {
    this.listeners = new Map()
    this.readyState = 1
    this._peer = null
    this._attachment = null
    this._buffer = []
  }

  addEventListener(type, handler) {
    listenersOf(this, type).push(handler)
    if (type === 'message') {
      while (this._buffer.length) {
        const data = this._buffer.shift()
        handler({ data })
      }
    }
  }

  _emit(type, event) {
    const handlers = this.listeners.get(type) || []
    if (type === 'message' && handlers.length === 0) {
      this._buffer.push(event.data)
      return
    }
    for (const handler of handlers) handler(event)
  }

  send(data) {
    if (this.readyState !== 1 || !this._peer || this._peer.readyState !== 1) return
    this._peer._emit('message', { data })
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return
    this.readyState = 3
    const peer = this._peer
    this._emit('close', { code, reason })
    if (peer && peer.readyState !== 3) peer.close(code, reason)
  }

  serializeAttachment(value) {
    this._attachment = value
  }

  deserializeAttachment() {
    return this._attachment
  }
}

export class WebSocketPair {
  constructor() {
    const client = new NodeWebSocket()
    const server = new NodeWebSocket()
    client._peer = server
    server._peer = client
    this[0] = client
    this[1] = server
  }
}

export function installWebSocketGlobals() {
  if (!globalThis.WebSocketPair || globalThis.WebSocketPair.name !== 'WebSocketPair' || globalThis.WebSocketPair.prototype?.constructor === WebSocketPair) {
    globalThis.WebSocketPair = WebSocketPair
  }
  globalThis.WebSocketPair = WebSocketPair
  if (typeof globalThis.WebSocketRequestResponsePair === 'undefined') {
    globalThis.WebSocketRequestResponsePair = class WebSocketRequestResponsePair {
      constructor(request, response) {
        this.request = request
        this.response = response
      }
    }
  }

  const NativeResponse = globalThis.Response
  if (!NativeResponse.__cfMonitorPatched) {
    globalThis.Response = class Response extends NativeResponse {
      constructor(body, init = {}) {
        const webSocket = init?.webSocket
        const status = init?.status
        if (status === 101) {
          const headers = init.headers
          super(null, { status: 200, statusText: init.statusText, headers })
          this.__status = 101
          this.webSocket = webSocket
        } else {
          super(body, init)
          if (webSocket) this.webSocket = webSocket
        }
      }

      get status() {
        return this.__status ?? super.status
      }
    }
    globalThis.Response.__cfMonitorPatched = true
  }
}

export function createMemoryDurableState(getInstance) {
  const sockets = []
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch(() => {})
    },
    acceptWebSocket(ws) {
      sockets.push(ws)
      ws.addEventListener('message', (event) => {
        getInstance()?.webSocketMessage?.(ws, event.data)
      })
      ws.addEventListener('close', () => {
        const index = sockets.indexOf(ws)
        if (index >= 0) sockets.splice(index, 1)
        getInstance()?.webSocketClose?.(ws)
      })
    },
    getWebSockets() {
      return sockets.filter((ws) => ws.readyState === 1)
    },
    setWebSocketAutoResponse() {},
    storage: {
      async get() { return null },
      async put() {}
    }
  }
}
