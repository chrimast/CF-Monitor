class NamesiloProvider {
  constructor(apikey, fetchImpl, domain) {
    this.apikey = apikey;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
  }
  kind = "namesilo";
  async request(operation, extra = {}) {
    const q = new URLSearchParams({ version: "1", type: "json", key: this.apikey, ...extra });
    const res = await this.fetchImpl(`https://www.namesilo.com/api/${operation}?${q.toString()}`);
    const json = await res.json();
    if (json.reply?.code !== 300) throw new Error(json.reply?.detail || "NameSilo \u8BF7\u6C42\u5931\u8D25");
    return json.reply;
  }
  async getDomainList() {
    const data = await this.request("listDomains");
    const domains = data.domains ?? [];
    const list = (Array.isArray(domains) ? domains : []).map((row) => ({
      DomainId: row.domain,
      Domain: row.domain,
      RecordCount: 0
    }));
    const total = Number(data.pager?.total) || list.length;
    return { total, list };
  }
  async getDomainRecords() {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const data = await this.request("dnsListRecords", { domain: this.domain });
    const rows = data.resource_record ?? [];
    return {
      total: rows.length,
      list: rows.map((row) => ({
        RecordId: row.record_id,
        Domain: this.domain,
        Name: row.host || "@",
        Type: row.type,
        Value: row.value,
        Line: "default",
        TTL: Number(row.ttl),
        MX: row.distance ?? null,
        Status: "1",
        Weight: null,
        Remark: null,
        UpdateTime: null
      }))
    };
  }
  async addDomainRecord(name, type, value, _line, ttl = 600, mx) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const extra = {
      domain: this.domain,
      rrtype: type,
      rrhost: name === "@" ? "" : name,
      rrvalue: value,
      rrttl: String(ttl)
    };
    if (type === "MX" && mx) extra.rrdistance = String(mx);
    const data = await this.request("dnsAddRecord", extra);
    return String(data.record_id);
  }
  async updateDomainRecord(recordId, name, type, value, _line, ttl = 600, mx) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const extra = {
      domain: this.domain,
      rrid: recordId,
      rrtype: type,
      rrhost: name === "@" ? "" : name,
      rrvalue: value,
      rrttl: String(ttl)
    };
    if (type === "MX" && mx) extra.rrdistance = String(mx);
    await this.request("dnsUpdateRecord", extra);
    return true;
  }
  async deleteDomainRecord(recordId) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    await this.request("dnsDeleteRecord", { domain: this.domain, rrid: recordId });
    return true;
  }
}
export {
  NamesiloProvider
};
