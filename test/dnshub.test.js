import assert from 'node:assert/strict';
import { handleDnshubRequest } from '../src/dnshub/handler.js';

function makeMemoryDb() {
  const accounts = new Map();
  return {
    prepare(sql) {
      const statement = {
        params: [],
        bind(...params) {
          statement.params = params;
          return statement;
        },
        async all() {
          if (/FROM dnshub_accounts/.test(sql) && /ORDER BY/.test(sql)) {
            const results = [...accounts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
            return { results };
          }
          return { results: [] };
        },
        async first() {
          if (/FROM sqlite_master/.test(sql)) {
            return { name: 'dnshub_accounts' };
          }
          if (/FROM dnshub_accounts WHERE id = \?/.test(sql)) {
            return accounts.get(statement.params[0]) || null;
          }
          return null;
        },
        async run() {
          if (/CREATE TABLE/.test(sql)) return { success: true };
          if (/INSERT INTO dnshub_accounts/.test(sql)) {
            const [id, name, provider, credentials, created_at] = statement.params;
            accounts.set(id, { id, name, provider, credentials, created_at });
            return { success: true };
          }
          if (/UPDATE dnshub_accounts/.test(sql)) {
            const [name, provider, credentials, id] = statement.params;
            const existing = accounts.get(id);
            if (existing) accounts.set(id, { ...existing, name, provider, credentials });
            return { success: true };
          }
          if (/DELETE FROM dnshub_accounts/.test(sql)) {
            accounts.delete(statement.params[0]);
            return { success: true };
          }
          return { success: true };
        }
      };
      return statement;
    }
  };
}

function jsonRequest(method, path, body, headers = {}) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : JSON.stringify(body)
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

const env = { DB: makeMemoryDb() };

{
  const { status } = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/providers'), env, false));
  assert.equal(status, 401);
}

{
  const { status, body } = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/providers'), {}, true));
  assert.equal(status, 500);
  assert.match(body.error, /D1/);
}

{
  const { status, body } = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/providers'), env, true));
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.some((item) => item.id === 'cloudflare'));
  assert.ok(body.data.some((item) => item.id === 'aliyun'));
}

{
  const created = await readJson(await handleDnshubRequest(jsonRequest('POST', '/api/dnshub/accounts', {
    name: 'cf-demo',
    provider: 'cloudflare',
    credentials: { apikey: 'token-demo', auth: '1' }
  }), env, true));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.name, 'cf-demo');
  assert.equal(created.body.data.provider, 'cloudflare');
  assert.equal(created.body.data.credentials, undefined);

  const listed = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/accounts'), env, true));
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].name, 'cf-demo');
  assert.equal(listed.body.data[0].credentials, undefined);

  const renamed = await readJson(await handleDnshubRequest(jsonRequest('PATCH', `/api/dnshub/accounts/${listed.body.data[0].id}`, {
    name: 'cf-renamed'
  }), env, true));
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.name, 'cf-renamed');
  assert.equal(renamed.body.data.credentials, undefined);

  const secretKept = await env.DB.prepare('SELECT credentials FROM dnshub_accounts WHERE id = ?').bind(listed.body.data[0].id).first();
  assert.equal(JSON.parse(secretKept.credentials).apikey, 'token-demo');

  const rotated = await readJson(await handleDnshubRequest(jsonRequest('PATCH', `/api/dnshub/accounts/${listed.body.data[0].id}`, {
    credentials: { apikey: 'token-new' }
  }), env, true));
  assert.equal(rotated.status, 200);
  assert.equal(rotated.body.data.credentials, undefined);
  const secretRotated = await env.DB.prepare('SELECT credentials FROM dnshub_accounts WHERE id = ?').bind(listed.body.data[0].id).first();
  assert.equal(JSON.parse(secretRotated.credentials).apikey, 'token-new');
  assert.equal(JSON.parse(secretRotated.credentials).auth, '1');
}

{
  const listed = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/accounts'), env, true));
  const accountId = listed.body.data[0].id;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function workersFetch() {
    if (this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect this reference.');
    }
    return new Response(JSON.stringify({
      success: true,
      result: [{ id: 'zone-bound', name: 'bound.example.com' }],
      result_info: { total_count: 1 }
    }));
  };
  try {
    const domains = await readJson(await handleDnshubRequest(
      jsonRequest('GET', `/api/dnshub/accounts/${accountId}/domains`),
      env,
      true
    ));
    assert.equal(domains.status, 200);
    assert.equal(domains.body.data.list[0].Domain, 'bound.example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const preview = await readJson(await handleDnshubRequest(
    jsonRequest('GET', '/api/dnshub/optimize/preview?cdnType=1&ipType=v4'),
    { ...env, fetchImpl: async () => new Response(JSON.stringify({
      code: 200,
      info: { DEF: [{ ip: '1.1.1.1' }], CT: [{ ip: '1.0.0.1' }] }
    })) },
    true
  ));
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.DEF[0].ip, '1.1.1.1');
}

{
  const missing = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/nope'), env, true));
  assert.equal(missing.status, 404);
}

{
  const listed = await readJson(await handleDnshubRequest(jsonRequest('GET', '/api/dnshub/accounts'), env, true));
  const accountId = listed.body.data[0].id;
  const calls = [];
  const zones = [{ id: 'zone-1', name: 'example.com' }];
  const records = [
    { id: 'rec-1', name: 'www.example.com', type: 'A', content: '1.1.1.1', ttl: 600, proxied: false, comment: '', modified_on: '2026-01-01T00:00:00Z' }
  ];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ method, url, body: init.body });
    if (url.includes('/zones') && method === 'GET' && !url.includes('/dns_records')) {
      return new Response(JSON.stringify({ success: true, result: zones, result_info: { total_count: 1 } }));
    }
    if (url.endsWith('/zones') && method === 'POST') {
      return new Response(JSON.stringify({ success: true, result: { id: 'zone-2', name: 'new.example' } }));
    }
    if (url.includes('/dns_records') && method === 'GET' && !/dns_records\/[^/]+$/.test(url)) {
      return new Response(JSON.stringify({ success: true, result: records, result_info: { total_count: records.length } }));
    }
    if (/dns_records\/rec-1$/.test(url) && method === 'GET') {
      return new Response(JSON.stringify({ success: true, result: records[0] }));
    }
    if (url.includes('/dns_records') && method === 'POST') {
      records.push({ id: 'rec-2', name: 'api.example.com', type: 'A', content: '2.2.2.2', ttl: 600, proxied: false });
      return new Response(JSON.stringify({ success: true, result: { id: 'rec-2' } }));
    }
    if (url.includes('/dns_records/rec-1') && method === 'PATCH') {
      return new Response(JSON.stringify({ success: true, result: { id: 'rec-1' } }));
    }
    if (url.includes('/dns_records/rec-2') && method === 'DELETE') {
      return new Response(JSON.stringify({ success: true, result: { id: 'rec-2' } }));
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  const vendorEnv = { ...env, fetchImpl };

  const domains = await readJson(await handleDnshubRequest(jsonRequest('GET', `/api/dnshub/accounts/${accountId}/domains`), vendorEnv, true));
  assert.equal(domains.status, 200);
  assert.equal(domains.body.data.list[0].Domain, 'example.com');

  const addedDomain = await readJson(await handleDnshubRequest(jsonRequest('POST', `/api/dnshub/accounts/${accountId}/domains`, { Domain: 'new.example' }), vendorEnv, true));
  assert.equal(addedDomain.status, 201);
  assert.equal(addedDomain.body.data.Domain, 'new.example');

  const recordList = await readJson(await handleDnshubRequest(
    jsonRequest('GET', `/api/dnshub/accounts/${accountId}/records?domain=example.com&domainId=zone-1`),
    vendorEnv,
    true
  ));
  assert.equal(recordList.status, 200);
  assert.equal(recordList.body.data.list[0].Name, 'www');

  const lines = await readJson(await handleDnshubRequest(
    jsonRequest('GET', `/api/dnshub/accounts/${accountId}/lines?domain=example.com&domainId=zone-1`),
    vendorEnv,
    true
  ));
  assert.equal(lines.status, 200);
  assert.ok(lines.body.data.some((item) => item.id === '0'));

  const createdRecord = await readJson(await handleDnshubRequest(jsonRequest('POST', `/api/dnshub/accounts/${accountId}/records`, {
    domain: 'example.com',
    domainId: 'zone-1',
    Name: 'api',
    Type: 'A',
    Value: '2.2.2.2'
  }), vendorEnv, true));
  assert.equal(createdRecord.status, 201);
  assert.equal(createdRecord.body.data.RecordId, 'rec-2');

  const patched = await readJson(await handleDnshubRequest(jsonRequest('PATCH', `/api/dnshub/accounts/${accountId}/records/rec-1`, {
    domain: 'example.com',
    domainId: 'zone-1',
    Name: 'www',
    Type: 'A',
    Value: '1.0.0.1'
  }), vendorEnv, true));
  assert.equal(patched.status, 200);

  const paused = await readJson(await handleDnshubRequest(jsonRequest('PATCH', `/api/dnshub/accounts/${accountId}/records/rec-1`, {
    domain: 'example.com',
    domainId: 'zone-1',
    Status: '0'
  }), vendorEnv, true));
  assert.equal(paused.status, 200);

  const deleted = await readJson(await handleDnshubRequest(
    jsonRequest('DELETE', `/api/dnshub/accounts/${accountId}/records/rec-2?domain=example.com&domainId=zone-1`),
    vendorEnv,
    true
  ));
  assert.equal(deleted.status, 200);

  const apply = await readJson(await handleDnshubRequest(jsonRequest('POST', '/api/dnshub/optimize/apply', {
    accountId,
    domain: 'example.com',
    domainId: 'zone-1',
    name: 'www',
    cdnType: '1',
    ipType: 'v4',
    recordNum: 1
  }), {
    ...env,
    fetchImpl: async (input, init = {}) => {
      const url = String(input);
      if (url.includes('wetest.vip')) {
        return new Response(JSON.stringify({ code: 200, info: { DEF: [{ ip: '1.1.1.1' }] } }));
      }
      return fetchImpl(input, init);
    }
  }, true));
  assert.equal(apply.status, 200);
  assert.equal(typeof apply.body.data.added, 'number');
  assert.ok(calls.some((item) => item.url.includes('wetest.vip') === false));
}

{
  const created = await readJson(await handleDnshubRequest(jsonRequest('POST', '/api/dnshub/accounts', {
    name: 'huawei-demo',
    provider: 'huawei',
    credentials: { AccessKeyId: 'ak-demo', SecretAccessKey: 'sk-demo' }
  }), env, true));
  assert.equal(created.status, 201);
  const huaweiId = created.body.data.id;
  let huaweiHeaders = null;
  const huaweiEnv = {
    ...env,
    fetchImpl: async (input, init = {}) => {
      huaweiHeaders = init.headers || {};
      const names = Object.keys(huaweiHeaders).map((name) => name.toLowerCase());
      if (names.includes('host')) {
        throw new TypeError("Fetch API cannot load. Request with forbidden header name 'Host'.");
      }
      return new Response(JSON.stringify({
        zones: [{ id: 'hz-1', name: 'huawei.example.', record_num: 1 }],
        metadata: { total_count: 1 }
      }), { status: 200 });
    }
  };
  const domains = await readJson(await handleDnshubRequest(
    jsonRequest('GET', `/api/dnshub/accounts/${huaweiId}/domains`),
    huaweiEnv,
    true
  ));
  assert.equal(domains.status, 200);
  assert.equal(domains.body.data.list[0].Domain, 'huawei.example');
  assert.ok(huaweiHeaders);
  assert.equal(Object.keys(huaweiHeaders).some((name) => name.toLowerCase() === 'host'), false);
  assert.ok(huaweiHeaders['X-Sdk-Date'] || huaweiHeaders['x-sdk-date']);
  assert.ok(huaweiHeaders.Authorization || huaweiHeaders.authorization);
}

{
  const html = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/views/admin/index.vue', import.meta.url), 'utf8'));
  assert.match(html, /activeTab === 'dnshub'/);
  assert.match(html, /DnsHubPanel/);
  const panel = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/views/admin/components/DnsHubPanel.vue', import.meta.url), 'utf8'));
  assert.match(panel, /\/api\/dnshub\/providers/);
  assert.match(panel, /\/api\/dnshub\/optimize\/apply/);
  assert.match(panel, /startEditAccount/);
  assert.match(panel, /dnshubSaveAccount/);
  assert.match(panel, /dnshub-split/);
  assert.match(panel, /page === 'home'/);
  assert.doesNotMatch(panel, /page === 'accounts'/);
  assert.doesNotMatch(panel, /page === 'optimize'/);
  assert.doesNotMatch(panel, /return result\?\.data$/m);
  assert.match(panel, /dnshub-record-form/);
  assert.match(panel, /dnshub-domain-toolbar/);
  assert.match(panel, /dnshub-domain-table/);
  assert.match(panel, /dnshub-domain-row/);
  assert.match(panel, /dnshub-record-table/);
  const css = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/frontend/styles/main.css', import.meta.url), 'utf8'));
  assert.match(css, /\.dnshub-split \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.dnshub-record-form \{[\s\S]*grid-template-columns:/);
  assert.match(css, /\.dnshub-domain-toolbar \{[\s\S]*display: flex/);
  assert.match(panel, /dnshub-field-host/);
  assert.match(css, /\.dnshub-record-row \{[\s\S]*padding: 8px 8px/);
  assert.match(css, /--dnshub-record-columns:/);
}

console.log('dnshub tests passed');
