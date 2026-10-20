import { applyPreferredIps, fetchPreferredIps } from "./optimize.js";
import { createProvider } from "./providers/factory.js";
import { PROVIDER_META } from "./providers/types.js";
import { D1Store } from "./store/d1.js";
const PROVIDERS = new Set(Object.keys(PROVIDER_META));

function boundFetch(fetchImpl) {
  if (!fetchImpl || fetchImpl === fetch) {
    return (...args) => globalThis.fetch(...args);
  }
  return fetchImpl;
}

function publicAccount(account) {
  return { id: account.id, name: account.name, provider: account.provider, createdAt: account.createdAt };
}
function json(data, status = 200) {
  return Response.json(data, { status });
}
function jsonError(message, status) {
  return json({ success: false, error: message, code: status }, status);
}
async function ensureDnshubSchema(db) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS dnshub_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        credentials TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
  ).run();
}
function match(pathname, pattern) {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
async function readBody(request) {
  return await request.json().catch(() => ({}));
}
async function loadProvider(store, accountId, domain, domainId, fetchImpl) {
  const account = await store.getAccount(accountId);
  if (!account) return null;
  return createProvider({
    provider: account.provider,
    credentials: account.credentials,
    domain,
    domainId,
    fetchImpl: boundFetch(fetchImpl)
  });
}
async function handleDnshubRequest(request, env, authenticated) {
  if (!authenticated) return jsonError("Unauthorized", 401);
  if (!env.DB) return jsonError("D1 \u672A\u7ED1\u5B9A", 500);
  await ensureDnshubSchema(env.DB);
  const store = new D1Store(env.DB);
  const fetchImpl = boundFetch(env.fetchImpl);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (method === "GET" && path === "/api/dnshub/providers") {
    return json({
      success: true,
      data: Object.entries(PROVIDER_META).map(([id, meta]) => ({ id, ...meta }))
    });
  }
  if (method === "GET" && path === "/api/dnshub/accounts") {
    const accounts = await store.listAccounts();
    return json({ success: true, data: accounts.map(publicAccount) });
  }
  if (method === "POST" && path === "/api/dnshub/accounts") {
    const body = await readBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const provider = typeof body.provider === "string" ? body.provider : "";
    const credentials = body.credentials && typeof body.credentials === "object" ? body.credentials : null;
    if (!name) return jsonError("\u8BF7\u586B\u5199\u8D26\u53F7\u540D\u79F0", 422);
    if (!PROVIDERS.has(provider)) return jsonError("\u4E0D\u652F\u6301\u7684\u5382\u5546", 422);
    if (!credentials) return jsonError("\u8BF7\u586B\u5199\u51ED\u8BC1", 422);
    const account = {
      id: crypto.randomUUID(),
      name,
      provider,
      credentials,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await store.saveAccount(account);
    return json({ success: true, data: publicAccount(account) }, 201);
  }
  const oneAccount = match(path, "/api/dnshub/accounts/:id");
  if (method === "PATCH" && oneAccount) {
    const existing = await store.getAccount(oneAccount.id);
    if (!existing) return jsonError("账号不存在", 404);
    const body = await readBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    const provider = typeof body.provider === "string" ? body.provider : existing.provider;
    const incoming = body.credentials && typeof body.credentials === "object" ? body.credentials : {};
    if (!name) return jsonError("请填写账号名称", 422);
    if (!PROVIDERS.has(provider)) return jsonError("不支持的厂商", 422);
    const credentials = { ...existing.credentials };
    for (const [key, value] of Object.entries(incoming)) {
      if (typeof value === "string" && value.trim()) credentials[key] = value.trim();
    }
    const account = { ...existing, name, provider, credentials };
    await store.updateAccount(account);
    return json({ success: true, data: publicAccount(account) });
  }
  const deleteAccount = match(path, "/api/dnshub/accounts/:id");
  if (method === "DELETE" && deleteAccount) {
    await store.deleteAccount(deleteAccount.id);
    return json({ success: true });
  }
  const domains = match(path, "/api/dnshub/accounts/:id/domains");
  if (domains && method === "GET") {
    const provider = await loadProvider(store, domains.id, void 0, void 0, fetchImpl);
    if (!provider) return jsonError("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
    try {
      const data = await provider.getDomainList(url.searchParams.get("q"), Number(url.searchParams.get("page") ?? "1"), 50);
      return json({ success: true, data });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  if (domains && method === "POST") {
    const body = await readBody(request);
    const Domain = typeof body.Domain === "string" ? body.Domain : "";
    if (!Domain) return jsonError("\u8BF7\u586B\u5199\u57DF\u540D", 422);
    const provider = await loadProvider(store, domains.id, void 0, void 0, fetchImpl);
    if (!provider?.addDomain) return jsonError("\u5F53\u524D\u5382\u5546\u4E0D\u652F\u6301\u6DFB\u52A0\u57DF\u540D", 400);
    try {
      const data = await provider.addDomain(Domain);
      return json({ success: true, data }, 201);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  const records = match(path, "/api/dnshub/accounts/:id/records");
  if (records && method === "GET") {
    const provider = await loadProvider(
      store,
      records.id,
      url.searchParams.get("domain") ?? "",
      url.searchParams.get("domainId") ?? "",
      fetchImpl
    );
    if (!provider) return jsonError("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
    try {
      const data = await provider.getDomainRecords({
        page: Number(url.searchParams.get("page") ?? "1"),
        pageSize: Number(url.searchParams.get("pageSize") ?? "50"),
        keyword: url.searchParams.get("q"),
        subDomain: url.searchParams.get("name"),
        type: url.searchParams.get("type")
      });
      return json({ success: true, data });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  if (records && method === "POST") {
    const body = await readBody(request);
    const Name = typeof body.Name === "string" ? body.Name : "";
    const Type = typeof body.Type === "string" ? body.Type : "";
    const Value = typeof body.Value === "string" ? body.Value : "";
    if (!Name || !Type || !Value) return jsonError("\u8BB0\u5F55\u5B57\u6BB5\u4E0D\u5B8C\u6574", 422);
    const provider = await loadProvider(
      store,
      records.id,
      typeof body.domain === "string" ? body.domain : void 0,
      typeof body.domainId === "string" ? body.domainId : void 0,
      fetchImpl
    );
    if (!provider) return jsonError("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
    try {
      const RecordId = await provider.addDomainRecord(
        Name,
        Type,
        Value,
        typeof body.Line === "string" ? body.Line : "0",
        typeof body.TTL === "number" ? body.TTL : 600,
        typeof body.MX === "number" ? body.MX : null,
        typeof body.Remark === "string" ? body.Remark : null
      );
      return json({ success: true, data: { RecordId } }, 201);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  const lines = match(path, "/api/dnshub/accounts/:id/lines");
  if (lines && method === "GET") {
    const provider = await loadProvider(
      store,
      lines.id,
      url.searchParams.get("domain") ?? "",
      url.searchParams.get("domainId") ?? "",
      fetchImpl
    );
    if (!provider) return jsonError("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
    const data = provider.getRecordLine ? await provider.getRecordLine() : [{ id: "0", name: "\u9ED8\u8BA4" }];
    return json({ success: true, data });
  }
  const oneRecord = match(path, "/api/dnshub/accounts/:id/records/:recordId");
  if (oneRecord && method === "PATCH") {
    const body = await readBody(request);
    const provider = await loadProvider(
      store,
      oneRecord.id,
      typeof body.domain === "string" ? body.domain : void 0,
      typeof body.domainId === "string" ? body.domainId : void 0,
      fetchImpl
    );
    if (!provider) return jsonError("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
    try {
      if (typeof body.Status === "string" && provider.setDomainRecordStatus) {
        await provider.setDomainRecordStatus(oneRecord.recordId, body.Status);
        return json({ success: true });
      }
      const Name = typeof body.Name === "string" ? body.Name : "";
      const Type = typeof body.Type === "string" ? body.Type : "";
      const Value = typeof body.Value === "string" ? body.Value : "";
      if (!Name || !Type || !Value) return jsonError("\u8BB0\u5F55\u5B57\u6BB5\u4E0D\u5B8C\u6574", 422);
      await provider.updateDomainRecord(
        oneRecord.recordId,
        Name,
        Type,
        Value,
        typeof body.Line === "string" ? body.Line : "0",
        typeof body.TTL === "number" ? body.TTL : 600,
        typeof body.MX === "number" ? body.MX : null,
        typeof body.Remark === "string" ? body.Remark : null
      );
      return json({ success: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  if (oneRecord && method === "DELETE") {
    const provider = await loadProvider(
      store,
      oneRecord.id,
      url.searchParams.get("domain") ?? "",
      url.searchParams.get("domainId") ?? "",
      fetchImpl
    );
    if (!provider) return jsonError("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
    try {
      await provider.deleteDomainRecord(oneRecord.recordId);
      return json({ success: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  if (method === "GET" && path === "/api/dnshub/optimize/preview") {
    try {
      const info = await fetchPreferredIps(fetchImpl, url.searchParams.get("cdnType") || "1", url.searchParams.get("ipType") || "v4");
      return json({ success: true, data: info });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  if (method === "POST" && path === "/api/dnshub/optimize/apply") {
    const body = await readBody(request);
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const domain = typeof body.domain === "string" ? body.domain : "";
    const name = typeof body.name === "string" ? body.name : "";
    if (!accountId || !domain || !name) return jsonError("\u8BF7\u586B\u5199\u8D26\u53F7\u3001\u57DF\u540D\u548C\u4E3B\u673A\u8BB0\u5F55", 422);
    try {
      const data = await applyPreferredIps(store, fetchImpl, {
        accountId,
        domain,
        domainId: typeof body.domainId === "string" ? body.domainId : void 0,
        name,
        cdnType: typeof body.cdnType === "string" ? body.cdnType : void 0,
        ipType: typeof body.ipType === "string" ? body.ipType : void 0,
        recordNum: typeof body.recordNum === "number" ? body.recordNum : void 0,
        ttl: typeof body.ttl === "number" ? body.ttl : void 0
      });
      return json({ success: true, data });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 502);
    }
  }
  return jsonError("Not Found", 404);
}
export {
  ensureDnshubSchema,
  handleDnshubRequest
};
