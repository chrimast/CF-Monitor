import { mapCloudflareRecord } from "./map.js";
class CloudflareProvider {
  constructor(credentials, fetchImpl, domain, domainId) {
    this.credentials = credentials;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
    this.domainId = domainId;
  }
  kind = "cloudflare";
  base = "https://api.cloudflare.com/client/v4";
  headers() {
    const auth = this.credentials.auth ?? "1";
    if (auth === "0") {
      return {
        "X-Auth-Email": this.credentials.email ?? "",
        "X-Auth-Key": this.credentials.apikey ?? ""
      };
    }
    return { Authorization: `Bearer ${this.credentials.apikey ?? ""}` };
  }
  async request(method, path, params) {
    let url = `${this.base}${path}`;
    const init = { method, headers: { ...this.headers() } };
    if (method === "GET" || method === "DELETE") {
      if (params) {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v !== void 0 && v !== null && v !== "") q.set(k, String(v));
        }
        const qs = q.toString();
        if (qs) url += `?${qs}`;
      }
    } else if (params) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(params);
    }
    const res = await this.fetchImpl(url, init);
    const json = await res.json();
    if (!json.success) throw new Error(json.errors?.[0]?.message || "Cloudflare \u8BF7\u6C42\u5931\u8D25");
    return json;
  }
  async getDomainList(keyword, page = 1, pageSize = 20) {
    const param = { page, per_page: pageSize };
    if (keyword) param.name = keyword;
    const data = await this.request("GET", "/zones", param);
    const rows = data.result ?? [];
    return {
      total: Number(data.result_info?.total_count) || rows.length,
      list: rows.map((row) => ({ DomainId: row.id, Domain: row.name, RecordCount: 0 }))
    };
  }
  async getDomainRecords(opts = {}) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const param = {
      page: opts.page ?? 1,
      per_page: opts.pageSize ?? 20
    };
    if (opts.type) param.type = opts.type;
    if (opts.keyword) param.search = opts.keyword;
    if (opts.subDomain) {
      const host = opts.subDomain === "@" ? this.domain : `${opts.subDomain}.${this.domain}`;
      param.name = host;
    }
    if (opts.line === "1" || opts.line === "0") param.proxied = opts.line === "1" ? "true" : "false";
    const data = await this.request("GET", `/zones/${this.domainId}/dns_records`, param);
    const rows = data.result ?? [];
    const domain = this.domain ?? "";
    return {
      total: Number(data.result_info?.total_count) || rows.length,
      list: rows.map((row) => mapCloudflareRecord(row, domain))
    };
  }
  async getDomainRecordInfo(recordId) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const data = await this.request("GET", `/zones/${this.domainId}/dns_records/${recordId}`);
    return mapCloudflareRecord(data.result, this.domain ?? "");
  }
  async addDomainRecord(name, type, value, line = "0", ttl = 600, mx, remark) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const param = {
      name,
      type,
      content: value,
      proxied: line === "1",
      ttl: Number(ttl),
      comment: remark ?? void 0
    };
    if (type === "MX" && mx != null) param.priority = mx;
    const data = await this.request("POST", `/zones/${this.domainId}/dns_records`, param);
    return data.result.id;
  }
  async updateDomainRecord(recordId, name, type, value, line = "0", ttl = 600, mx, remark) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const param = {
      name,
      type,
      content: value,
      proxied: line === "1",
      ttl: Number(ttl),
      comment: remark ?? void 0
    };
    if (type === "MX" && mx != null) param.priority = mx;
    await this.request("PATCH", `/zones/${this.domainId}/dns_records/${recordId}`, param);
    return true;
  }
  async deleteDomainRecord(recordId) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    await this.request("DELETE", `/zones/${this.domainId}/dns_records/${recordId}`);
    return true;
  }
  async setDomainRecordStatus(recordId, status) {
    const info = await this.getDomainRecordInfo(recordId);
    let name = status === "1" ? info.Name.replace("_pause", "") : `${info.Name}_pause`;
    if (name === "__root__") name = "@";
    else if (name === "@_pause") name = "__root___pause";
    return this.updateDomainRecord(recordId, name, info.Type, info.Value, info.Line, info.TTL, info.MX, info.Remark);
  }
  async getRecordLine() {
    return [
      { id: "0", name: "\u4EC5 DNS" },
      { id: "1", name: "\u5DF2\u4EE3\u7406" }
    ];
  }
  async addDomain(domain) {
    const data = await this.request("POST", "/zones", { name: domain });
    const result = data.result;
    return { DomainId: result.id, Domain: result.name, RecordCount: 0 };
  }
}
export {
  CloudflareProvider
};
