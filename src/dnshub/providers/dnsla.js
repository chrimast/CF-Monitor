class DnslaProvider {
  constructor(apiid, apisecret, fetchImpl, domain, domainId) {
    this.apiid = apiid;
    this.apisecret = apisecret;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
    this.domainId = domainId;
  }
  kind = "dnsla";
  auth() {
    return `Basic ${btoa(`${this.apiid}:${this.apisecret}`)}`;
  }
  async request(method, path, params) {
    let url = `https://api.dns.la${path}`;
    const init = {
      method,
      headers: { Authorization: this.auth(), "Content-Type": "application/json; charset=utf-8" }
    };
    if (method === "GET" || method === "DELETE") {
      if (params) {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v !== void 0 && v !== null && v !== "") q.set(k, String(v));
        }
        url += `?${q.toString()}`;
      }
    } else if (params) {
      init.body = JSON.stringify(params);
    }
    const res = await this.fetchImpl(url, init);
    const json = await res.json();
    if (json.code !== 200) throw new Error(json.msg || "DNSLA \u8BF7\u6C42\u5931\u8D25");
    return json.data;
  }
  async getDomainList(_keyword, page = 1, pageSize = 20) {
    const data = await this.request("GET", "/api/domainList", { pageIndex: page, pageSize });
    const rows = data.results ?? [];
    return {
      total: Number(data.total) || rows.length,
      list: rows.map((row) => ({
        DomainId: row.id,
        Domain: row.displayDomain.replace(/\.$/, ""),
        RecordCount: 0
      }))
    };
  }
  async getDomainRecords() {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const data = await this.request("GET", "/api/recordList", { domainId: this.domainId, pageIndex: 1, pageSize: 100 });
    const rows = data.results ?? [];
    const types = { 1: "A", 2: "NS", 5: "CNAME", 15: "MX", 16: "TXT", 28: "AAAA" };
    return {
      total: Number(data.total) || rows.length,
      list: rows.map((row) => ({
        RecordId: row.id,
        Domain: this.domain ?? "",
        Name: row.host || "@",
        Type: types[row.type] || String(row.type),
        Value: row.data,
        Line: String(row.lineId ?? "0"),
        TTL: row.ttl,
        MX: null,
        Status: row.disable ? "0" : "1",
        Weight: null,
        Remark: null,
        UpdateTime: null
      }))
    };
  }
  async addDomainRecord(name, type, value, line = "0", ttl = 600) {
    if (!this.domainId) throw new Error("\u7F3A\u5C11\u57DF\u540D ID");
    const types = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
    const data = await this.request("POST", "/api/record", {
      domainId: this.domainId,
      type: types[type] || 1,
      host: name,
      data: value,
      ttl,
      lineId: line
    });
    return String(data.id);
  }
  async updateDomainRecord(recordId, name, type, value, line = "0", ttl = 600) {
    const types = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
    await this.request("PUT", "/api/record", {
      id: recordId,
      type: types[type] || 1,
      host: name,
      data: value,
      ttl,
      lineId: line
    });
    return true;
  }
  async deleteDomainRecord(recordId) {
    await this.request("DELETE", "/api/record", { id: recordId });
    return true;
  }
  async setDomainRecordStatus(recordId, status) {
    await this.request("PUT", "/api/recordDisable", { id: recordId, disable: status === "0" });
    return true;
  }
}
export {
  DnslaProvider
};
