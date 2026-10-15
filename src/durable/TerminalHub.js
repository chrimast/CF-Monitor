// Durable Object: 每台服务器一条反向终端会话。
// Agent 主动连上 /agent/term；管理员浏览器连 /api/term。
// 不与 MetricsBroadcaster 混用。

const AGENT_KIND = 'agent-term';
const BROWSER_KIND = 'browser-term';
const IDLE_MS = 10 * 60 * 1000;
const MAX_FRAME = 96 * 1024;

export const AGENT_FORWARD_TYPES = new Set([
  'data',
  'exit',
  'error',
  'ready',
  'fs_list_result',
  'fs_data',
  'fs_ok',
  'fs_error'
]);

export const BROWSER_FORWARD_TYPES = new Set([
  'input',
  'resize',
  'open',
  'ping',
  'fs_list',
  'fs_read',
  'fs_write',
  'fs_mkdir',
  'fs_rm',
  'fs_rename'
]);

function jsonMessage(type, extra = {}) {
  return JSON.stringify({ type, ...extra });
}

export class TerminalHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.idleTimer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    if (url.pathname === '/agent') {
      return this._accept(request, AGENT_KIND, url.searchParams.get('id') || '');
    }
    if (url.pathname === '/browser') {
      return this._accept(request, BROWSER_KIND, url.searchParams.get('id') || '');
    }
    return new Response('Not found', { status: 404 });
  }

  _accept(request, kind, serverId) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ kind, serverId, openedAt: Date.now() });
    this._armIdle();
    if (kind === AGENT_KIND) {
      try { server.send(jsonMessage('hello')); } catch (_) {}
      this._notifyBrowsers({ type: 'agent_online' });
    } else {
      const agent = this._find(AGENT_KIND);
      try {
        server.send(jsonMessage(agent ? 'ready' : 'waiting', {
          message: agent ? 'agent connected' : 'waiting for agent'
        }));
      } catch (_) {}
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    const attachment = ws.deserializeAttachment() || {};
    this._armIdle();
    let msg;
    try {
      msg = typeof message === 'string' ? JSON.parse(message) : JSON.parse(new TextDecoder().decode(message));
    } catch (_) {
      try { ws.close(1008, 'invalid json'); } catch (__) {}
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (JSON.stringify(msg).length > MAX_FRAME) {
      try { ws.close(1009, 'frame too large'); } catch (_) {}
      return;
    }

    if (attachment.kind === AGENT_KIND) {
      this._fromAgent(ws, msg);
      return;
    }
    if (attachment.kind === BROWSER_KIND) {
      this._fromBrowser(ws, msg);
    }
  }

  webSocketClose(ws) {
    const attachment = ws?.deserializeAttachment?.() || {};
    if (attachment.kind === BROWSER_KIND && !this._find(BROWSER_KIND, ws)) {
      this._closeKind(AGENT_KIND, 'browser closed');
      return;
    }
    if (attachment.kind === AGENT_KIND && !this._find(AGENT_KIND, ws)) {
      this._notifyBrowsers({ type: 'agent_offline' });
    }
  }

  webSocketError() {}

  _fromAgent(_ws, msg) {
    if (AGENT_FORWARD_TYPES.has(msg.type)) {
      this._notifyBrowsers(msg);
    }
  }

  _fromBrowser(ws, msg) {
    const agent = this._find(AGENT_KIND);
    if (!agent) {
      try { ws.send(jsonMessage('waiting', { message: 'waiting for agent' })); } catch (_) {}
      return;
    }
    if (BROWSER_FORWARD_TYPES.has(msg.type)) {
      try { agent.send(JSON.stringify(msg)); } catch (_) {}
    }
  }

  _find(kind, except = null) {
    for (const socket of this.state.getWebSockets()) {
      if (except && socket === except) continue;
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.kind === kind) return socket;
    }
    return null;
  }

  _closeKind(kind, reason) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.kind !== kind) continue;
      try { socket.close(1000, reason); } catch (_) {}
    }
  }

  _notifyBrowsers(msg) {
    const payload = JSON.stringify(msg);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.kind !== BROWSER_KIND) continue;
      try { socket.send(payload); } catch (_) {}
    }
  }

  _armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      for (const socket of this.state.getWebSockets()) {
        try { socket.close(1000, 'idle timeout'); } catch (_) {}
      }
    }, IDLE_MS);
  }
}

export default TerminalHub;
