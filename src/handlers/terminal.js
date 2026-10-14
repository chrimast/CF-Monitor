import { checkAuth, checkWebSocketAuth, simpleAuthResponse } from '../middleware/auth.js';
import { loadSiteSettings } from '../utils/settings.js';

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message, code: status }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function isWebSocketUpgrade(request) {
  return request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}

async function getServer(env, id) {
  return env.DB.prepare('SELECT id, name, terminal_enabled FROM servers WHERE id = ?').bind(id).first();
}

export function isTerminalEnabled(server) {
  return String(server?.terminal_enabled || '0') === '1';
}

export async function handleBrowserTerminalUpgrade(request, env) {
  const settings = await loadSiteSettings(env.DB);
  if (!await checkWebSocketAuth(request, env, settings)) {
    return simpleAuthResponse();
  }
  if (!isWebSocketUpgrade(request)) {
    return new Response('Expected WebSocket upgrade request', { status: 426 });
  }
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) return jsonError('Missing server id', 400);
  const server = await getServer(env, id);
  if (!server) return jsonError('Server not found', 404);
  if (!isTerminalEnabled(server)) return jsonError('Terminal disabled', 403);
  return forwardTerminal(request, env, id, '/browser');
}

export async function handleAgentTerminalUpgrade(request, env) {
  if (!isWebSocketUpgrade(request)) {
    return new Response('Expected WebSocket upgrade request', { status: 426 });
  }
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').trim();
  const secret = String(url.searchParams.get('secret') || '').trim();
  if (!id || !secret) return jsonError('Missing id or secret', 400);
  if (secret !== env.API_SECRET) return jsonError('Invalid secret', 401);
  const server = await getServer(env, id);
  if (!server) return jsonError('Server not found', 404);
  if (!isTerminalEnabled(server)) return jsonError('Terminal disabled', 403);
  return forwardTerminal(request, env, id, '/agent');
}

export async function handleToggleTerminal(request, env, sys) {
  if (!await checkAuth(request, env, sys)) return simpleAuthResponse();
  let data;
  try {
    data = await request.json();
  } catch (_) {
    return jsonError('invalidJson', 400);
  }
  const id = String(data?.id || '').trim();
  const enabled = data?.enabled === true || data?.enabled === '1' || data?.enabled === 1;
  if (!id) return jsonError('Missing server id', 400);
  const server = await getServer(env, id);
  if (!server) return jsonError('Server not found', 404);
  await env.DB.prepare('UPDATE servers SET terminal_enabled = ? WHERE id = ?')
    .bind(enabled ? '1' : '0', id)
    .run();
  return Response.json({ success: true, id, terminal_enabled: enabled ? '1' : '0' });
}

async function forwardTerminal(request, env, serverId, path) {
  if (!env.TERMINAL_HUB) {
    return jsonError('Terminal not enabled', 503);
  }
  const id = env.TERMINAL_HUB.idFromName(serverId);
  const stub = env.TERMINAL_HUB.get(id);
  const headers = new Headers(request.headers);
  return stub.fetch(new Request(`https://terminal.internal${path}?id=${encodeURIComponent(serverId)}`, {
    method: request.method,
    headers
  }));
}

export function terminalEnabledHeader(server) {
  return isTerminalEnabled(server) ? '1' : '0';
}
