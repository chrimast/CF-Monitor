import { hmacSha256Hex, sha256Hex } from "../crypto.js";
function escapeHuawei(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%7E/gi, "~");
}
function canonicalQuery(query) {
  if (!query) return "";
  return Object.keys(query).sort().map((key) => `${escapeHuawei(key)}=${escapeHuawei(query[key] ?? "")}`).join("&");
}
async function signHuawei(opts) {
  const algorithm = "SDK-HMAC-SHA256";
  const canonicalUri = opts.path.endsWith("/") ? opts.path : `${opts.path}/`;
  const canonicalHeaders = `host:${opts.host}
x-sdk-date:${opts.date}
`;
  const signedHeaders = "host;x-sdk-date";
  const hashedPayload = await sha256Hex(opts.body);
  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery(opts.query),
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join("\n");
  const stringToSign = [algorithm, opts.date, await sha256Hex(canonicalRequest)].join("\n");
  const signature = await hmacSha256Hex(opts.secretAccessKey, stringToSign);
  return `${algorithm} Access=${opts.accessKeyId}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
class HuaweiProvider {
  constructor(accessKeyId, secretAccessKey, fetchImpl, domain, domainId) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
    this.domainId = domainId;
  }
  kind = "huawei";
  host = "dns.myhuaweicloud.com";
  async request(method, path, query, body) {
    const payload = body ? JSON.stringify(body) : "";
    const date = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const authorization = await signHuawei({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      method,
      host: this.host,
      path,
      date,
      body: payload,
      query
    });
    let url = `https://${this.host}${path}`;
    if (query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v) q.set(k, v);
      }
      const qs = q.toString();
      if (qs) url += `?${qs}`;
    }
    const headers = {
      "X-Sdk-Date": date,
      Authorization: authorization
    };
    if (payload) headers["Content-Type"] = "application/json";
    const res = await this.fetchImpl(url, { method, headers, body: payload || void 0 });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error_msg || json.message || "\u534E\u4E3A\u4E91\u8BF7\u6C42\u5931\u8D25");
    return json;
  }
  async getDomainList(keyword, page = 1, pageSize = 20) {
    const offset = String((page - 1) * pageSize);
    const query = { offset, limit: String(pageSize) };
    if (keyword) query.name = keyword;
    const data = await this.request("GET", "/v2/zones", query);
    const zones = data.zones ?? [];
    return {
      total: Number(data.metadata?.total_count) || zones.length,
      list: zones.map((z) => ({
        DomainId: z.id,
        Domain: z.name.replace(/\.$/, ""),
        RecordCount: Number(z.record_num) || 0
      }))
    };
  }
  async getDomainRecords(opts = {}) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const query = {
      offset: String((page - 1) * pageSize),
      limit: String(pageSize)
    };
    if (opts.type) query.type = opts.type;
    if (opts.line) query.line_id = opts.line;
    if (opts.subDomain) {
      const host = opts.subDomain === "@" ? `${this.domain}.` : `${opts.subDomain}.${this.domain}.`;
      query.name = host;
      query.search_mode = "equal";
    } else if (opts.keyword) {
      query.name = opts.keyword;
    }
    const data = await this.request("GET", `/v2.1/zones/${this.domainId}/recordsets`, query);
    const rows = data.recordsets ?? [];
    const domain = this.domain ?? "";
    return {
      total: Number(data.metadata?.total_count) || rows.length,
      list: rows.map((row) => ({
        RecordId: row.id,
        Domain: domain,
        Name: row.name.replace(`.${domain}.`, "").replace(/\.$/, "") || "@",
        Type: row.type,
        Value: (row.records || []).join(","),
        Line: row.line || "default_view",
        TTL: row.ttl,
        MX: null,
        Status: row.status === "DISABLE" ? "0" : "1",
        Weight: null,
        Remark: null,
        UpdateTime: null
      }))
    };
  }
  async addDomainRecord(name, type, value, line = "default_view", ttl = 600) {
    if (!this.domainId || !this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const host = name === "@" ? `${this.domain}.` : `${name}.${this.domain}.`;
    const data = await this.request("POST", `/v2.1/zones/${this.domainId}/recordsets`, void 0, {
      name: host,
      type,
      records: value.split(",").map((v) => v.trim()),
      line: line || "default_view",
      ttl
    });
    return String(data.id);
  }
  async updateDomainRecord(recordId, name, type, value, line = "default_view", ttl = 600) {
    if (!this.domainId || !this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const host = name === "@" ? `${this.domain}.` : `${name}.${this.domain}.`;
    await this.request("PUT", `/v2.1/zones/${this.domainId}/recordsets/${recordId}`, void 0, {
      name: host,
      type,
      records: value.split(",").map((v) => v.trim()),
      line: line || "default_view",
      ttl
    });
    return true;
  }
  async deleteDomainRecord(recordId) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    await this.request("DELETE", `/v2/zones/${this.domainId}/recordsets/${recordId}`);
    return true;
  }
}
export {
  HuaweiProvider,
  canonicalQuery,
  signHuawei
};
