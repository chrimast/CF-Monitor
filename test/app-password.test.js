import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { createNodeApp } from '../src/runtime/node-host.js';
import { clearSiteSettingsCache } from '../src/utils/settings.js';

const apiSecret = 'fixture-admin-and-agent-secret';
const appPassword = randomBytes(32).toString('hex');
const wrongPassword = randomBytes(32).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');
const appHeader = { 'X-App-Password': appPassword };
const id = '00000000-0000-4000-8000-000000000001';
const hidden = '00000000-0000-4000-8000-000000000002';
const detail = server => `/api/server?id=${server}`;
const history = (server, hours = 24) => `/api/history/all?id=${server}&hours=${hours}`;
const reads = ['/api/servers', detail(id), history(id)];

async function fixture(options = {}) {
  const app = await createNodeApp({ apiSecret, appPassword, dbPath: ':memory:', ...options });
  for (const [server, name, isHidden, partition] of [[id, 'Visible', '0', 1], [hidden, 'Hidden', '1', 2]]) {
    await app.env.DB.prepare('INSERT INTO servers (id, name, is_hidden, history_partition_id) VALUES (?, ?, ?, ?)')
      .bind(server, name, isHidden, partition).run();
  }
  const configure = async (settings = {}) => {
    await app.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind('site_options', JSON.stringify({ is_public: 'false', jwt_secret: jwtSecret, ...settings })).run();
    clearSiteSettingsCache();
  };
  await configure();
  const request = (path, headers = {}, body, method = body === undefined ? 'GET' : 'POST') =>
    app.fetch(new Request(new URL(path, 'https://panel.test'), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    }));
  const loginBody = { action: 'login', username: 'admin', password: apiSecret };
  const admin = (body, headers) => request('/admin/api', headers, body);
  return { app, configure, request, admin, loginBody };
}

async function expectStatus(response, status, route = '') {
  assert.equal((await response).status, status, route);
}

test('private monitoring reads require admin auth or a configured valid App header', async () => {
  const { request } = await fixture();
  for (const route of reads) {
    for (const headers of [{}, { 'X-App-Password': wrongPassword }, { 'X-App-Password': `${appPassword}, ${appPassword}` }, { Cookie: `cfsm_ua=cfsm; X-App-Password=${appPassword}`, 'User-Agent': 'cfsm' }]) {
      await expectStatus(request(route, headers), 401, route);
    }
    await expectStatus(request(`${route}${route.includes('?') ? '&' : '?'}app_password=${appPassword}`), 401, route);
    const response = await request(route, appHeader);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const report = await request('/update', {}, { id, secret: apiSecret, metrics: { cpu: 17, timestamp: Date.now() } });
  assert.equal(report.status, 200);
  const data = await request(history(id, 1), appHeader).then(response => response.json());
  assert.ok(data.some(row => Number(row.cpu) === 17));
});

test('App access defaults to disabled, rejects short config, and accepts only the current credential', async () => {
  for (const configured of ['', 'short-password', wrongPassword]) {
    const { request } = await fixture({ appPassword: configured });
    await expectStatus(request(reads[0], { 'X-App-Password': configured === 'short-password' ? configured : appPassword }), 401);
    if (configured === wrongPassword) {
      await expectStatus(request(reads[0], { 'X-App-Password': wrongPassword }), 200);
    }
  }
  const { request } = await fixture({ apiSecret: appPassword });
  await expectStatus(request(reads[0], appHeader), 401);
});

test('Docker host reads the opt-in App credential from the environment', async t => {
  const previous = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = appPassword;
  t.after(() => {
    if (previous === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = previous;
  });
  const { request } = await fixture({ appPassword: undefined });
  await expectStatus(request(reads[0], appHeader), 200);
});

test('public behavior stays anonymous and App access keeps the same hidden-node and 24h history limits', async () => {
  const { request, configure, admin, loginBody } = await fixture();
  const { token } = await admin(loginBody).then(res => res.json());
  assert.ok(token);
  const bearer = { Authorization: `Bearer ${token}` };
  for (const is_public of ['false', 'true']) {
    await configure({ is_public });
    const adminList = await request(reads[0], bearer).then(res => res.json());
    assert.equal(adminList.servers.length, 2);
    await expectStatus(request(detail(hidden), bearer), 200);
    await expectStatus(request(history(hidden, 48), bearer), 200);
    const readHeaders = is_public === 'true' ? [{}, { 'X-App-Password': wrongPassword }, appHeader] : [appHeader];
    for (const headers of readHeaders) {
      const response = await request(reads[0], headers);
      assert.equal(response.status, 200);
      const list = await response.json();
      assert.deepEqual(list.servers.map(server => server.id), [id]);
      assert.equal(list.stats.total, 1);
      await expectStatus(request(detail(id), headers), 200);
      await expectStatus(request(history(id), headers), 200);
      await expectStatus(request(detail(hidden), headers), 404);
      await expectStatus(request(history(hidden), headers), 404);
      await expectStatus(request(history(id, 48), headers), 401);
    }
  }
});

test('App password grants no login, management, terminal, agent or private monitoring WS access', async () => {
  const { request, admin, loginBody } = await fixture();
  await expectStatus(admin({ ...loginBody, password: appPassword }, appHeader), 401);
  for (const action of ['get_settings', 'export_servers', 'add', 'save_settings']) {
    await expectStatus(admin({ action, name: 'Denied' }, appHeader), 401, action);
  }
  for (const route of ['/api/theme_options', '/admin/api/terminal', '/clearHistory', '/updateDatabase']) {
    await expectStatus(request(route, appHeader, { id, enabled: true }), 401, route);
  }
  for (const route of ['/api/dnshub/accounts', '/api/wafpanel/nodes']) {
    await expectStatus(request(route, appHeader), 401, route);
    await expectStatus(request(route, appHeader, {}), 401, route);
  }
  await expectStatus(request('/update', appHeader, { id, secret: appPassword, metrics: { cpu: 17 } }), 401);
  const upgrade = { ...appHeader, Upgrade: 'websocket' };
  for (const route of ['/api/ws', `/api/ws?subscribe=${id}`, `/api/ws?subscribe=${hidden}`, `/api/term?id=${id}`, `/agent/term?id=${id}&secret=${appPassword}`]) {
    await expectStatus(request(route, upgrade), 401, route);
  }
  const config = await request('/api/config', appHeader).then(res => res.json());
  assert.equal(config.authorization, false);
});

test('App password stays out of admin settings, exports and persistent settings', async () => {
  const { app, request, admin, loginBody } = await fixture();
  const { token } = await admin(loginBody).then(res => res.json());
  assert.ok(token);
  for (const response of [await admin({ action: 'get_settings' }, { Authorization: `Bearer ${token}` }), await admin({ action: 'export_servers' }, { Authorization: `Bearer ${token}` }), await request('/api/config', appHeader)]) {
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes(appPassword));
    assert.doesNotMatch(body, /app_password/i);
  }
  const { results } = await app.env.DB.prepare('SELECT * FROM settings').all();
  assert.ok(!JSON.stringify(results).includes(appPassword));
});

test('global Turnstile independently gates App reads and login-only Turnstile gates login', async t => {
  const { request, admin, configure, loginBody } = await fixture();
  const challenge = { turnstile_site_key: 'fixture-site-key', turnstile_secret_key: 'fixture-siteverify-key' };
  const redeemed = new Set();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const { secret, response } = JSON.parse(options.body);
    assert.equal(secret, challenge.turnstile_secret_key);
    if (redeemed.has(response)) return Response.json({ success: false });
    redeemed.add(response);
    return Response.json({ success: true });
  });
  await configure({ ...challenge, turnstile_enabled: 'true' });
  for (const route of reads) {
    await expectStatus(request(route, { ...appHeader, 'User-Agent': 'cfsm', Cookie: 'cfsm_ua=cfsm' }), 403, route);
  }
  await expectStatus(admin(loginBody, appHeader), 403);
  const { turnstile_verified: proof } = await request('/api/config', { ...appHeader, 'X-Turnstile-Token': 'fresh-global' }).then(res => res.json());
  assert.ok(proof);
  for (const route of reads) {
    await expectStatus(request(route, { 'X-Turnstile-Verified': proof }), 401, route);
    await expectStatus(request(route, { ...appHeader, 'X-Turnstile-Verified': proof }), 200, route);
  }
  await expectStatus(admin(loginBody, { ...appHeader, 'X-Turnstile-Verified': proof }), 403);
  await expectStatus(admin(loginBody, { ...appHeader, 'X-Turnstile-Token': 'fresh-global' }), 403);
  await expectStatus(admin(loginBody, { ...appHeader, 'X-Turnstile-Token': 'fresh-login' }), 200);
  await configure({ ...challenge, turnstile_login_enabled: 'true' });
  await expectStatus(request(reads[0], appHeader), 200);
  await expectStatus(admin(loginBody, appHeader), 403);
  await expectStatus(admin(loginBody, { ...appHeader, 'X-Turnstile-Token': 'fresh-login-only' }), 200);
  assert.deepEqual([...redeemed], ['fresh-global', 'fresh-login', 'fresh-login-only']);
});
