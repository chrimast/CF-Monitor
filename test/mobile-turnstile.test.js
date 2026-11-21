import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createNodeApp } from '../src/runtime/node-host.js';
import worker from '../src/index.js';

const path = '/verify/turnstile';
const key = '0xPublic_Widget_Key';
const settings = {
  turnstile_login_enabled: 'true', turnstile_site_key: key,
  turnstile_secret_key: 'private-siteverify-key',
};

async function checkPage(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('content-security-policy'), /form-action 'none'/);
  const html = await response.text();
  assert.match(html, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.ok(html.includes(key));
  assert.ok(!html.includes(settings.turnstile_secret_key));
  assert.doesNotMatch(html, /<form|\/admin\/api|api\/config|cf_clearance/);
  return html;
}

test('shared Worker serves a widget-only, non-cacheable page from configured public key', async () => {
  const app = await createNodeApp({ apiSecret: 'fixture-secret-for-tests', dbPath: ':memory:' });
  await app.env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)')
    .bind('site_options', JSON.stringify(settings)).run();
  await checkPage(await worker.fetch(new Request(`https://panel.test${path}`), app.env, {}));
  // The Docker HTTP adapter sees reverse-proxied TLS requests as internal HTTP.
  await checkPage(await app.fetch(new Request(`http://panel.test${path}`)));
});

test('widget refuses to render for disabled or malformed configuration', async () => {
  const app = await createNodeApp({ apiSecret: 'fixture-secret-for-tests', dbPath: ':memory:' });
  const url = `https://panel.test${path}`;
  assert.equal((await app.fetch(new Request(url))).status, 404);
  const malformedApp = await createNodeApp({ apiSecret: 'fixture-secret-for-tests', dbPath: ':memory:' });
  await malformedApp.env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)')
    .bind('site_options', JSON.stringify({ ...settings, turnstile_site_key: '</script><script>alert(1)</script>' })).run();
  assert.equal((await malformedApp.fetch(new Request(url))).status, 404);
});

test('global verification independently redeems login and config tokens before protected API access', async (t) => {
  const secret = 'fixture-secret-for-tests';
  const app = await createNodeApp({ apiSecret: secret, dbPath: ':memory:' });
  await app.env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)')
    .bind('site_options', JSON.stringify({ ...settings, turnstile_enabled: 'true', is_public: 'false' })).run();
  const redeemed = new Set();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const { secret, response } = JSON.parse(options.body);
    assert.equal(secret, settings.turnstile_secret_key);
    if (redeemed.has(response)) return Response.json({ success: false });
    redeemed.add(response);
    return Response.json({ success: true });
  });
  const request = (route, options) => app.fetch(new Request(`https://panel.test${route}`, options));
  assert.equal((await request('/api/config').then(res => res.json())).turnstile_login_enabled, true);
  const login = await request('/admin/api', {
    method: 'POST', headers: { 'X-Turnstile-Token': 'fresh-login' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: secret }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.ok(token);
  const exchange = (token) => request('/api/config', { headers: { 'X-Turnstile-Token': token } });
  assert.equal((await exchange('fresh-login')).status, 403);
  const { verified, turnstile_verified: proof } = await exchange('fresh-global').then(res => res.json());
  assert.equal(verified, true);
  assert.ok(proof);
  const authorization = `Bearer ${token}`;
  assert.equal((await request('/api/servers', { headers: { authorization } })).status, 403);
  assert.equal((await request('/api/servers', {
    headers: { authorization, 'X-App-Password': secret, 'User-Agent': 'cfsm', Cookie: 'cfsm_ua=cfsm' },
  })).status, 403);
  assert.equal((await request('/admin/api', {
    method: 'POST', headers: { 'X-App-Password': secret, 'User-Agent': 'cfsm', Cookie: 'cfsm_ua=cfsm' },
    body: JSON.stringify({ action: 'login', username: 'admin', password: secret }),
  })).status, 403);
  assert.equal((await request('/api/servers', { headers: { 'X-Turnstile-Verified': proof } })).status, 401);
  assert.equal((await request('/api/servers', { headers: { authorization, 'X-Turnstile-Verified': proof } })).status, 200);
  assert.deepEqual([...redeemed], ['fresh-login', 'fresh-global']);
});

test('widget starts only for a native main-frame port and sends exactly one provider result', async () => {
  const app = await createNodeApp({ apiSecret: 'fixture-secret-for-tests', dbPath: ':memory:' });
  await app.env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)')
    .bind('site_options', JSON.stringify(settings)).run();
  const html = await checkPage(await app.fetch(new Request(`https://panel.test${path}`)));
  const script = html.match(/<script nonce="[^"]+">([\s\S]+?)<\/script>/)[1];
  for (const [event, value, result] of [
    ['callback', 'fixture-turnstile-result', 'token:fixture-turnstile-result'],
    ['error-callback', 'fixture-provider-error', 'failed'],
    ['expired-callback', undefined, 'failed'],
    ['timeout-callback', undefined, 'failed'],
  ]) {
    let listener;
    let options;
    const messages = [];
    const port = { postMessage: (message) => messages.push(message), close() {} };
    const window = { addEventListener: (type, callback) => { assert.equal(type, 'message'); listener = callback; } };
    window.top = window;
    vm.runInNewContext(script, { window, turnstile: { render(selector, opts) { options = opts; } } });
    listener({ isTrusted: true, source: {}, data: 'vpstool-turnstile-v1', ports: [port] });
    listener({ isTrusted: false, source: null, data: 'vpstool-turnstile-v1', ports: [port] });
    assert.equal(options, undefined);
    listener({ isTrusted: true, source: null, data: 'vpstool-turnstile-v1', ports: [port] });
    assert.equal(options.sitekey, key);
    assert.equal(options['response-field'], false);
    assert.equal(options.retry, 'never');
    options[event](value);
    options.callback('second-result');
    assert.deepEqual(messages, ['ready', result]);
  }
});
