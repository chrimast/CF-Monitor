import { md5Hex } from "../md5.js";
class WestProvider {
  constructor(username, apiPassword, fetchImpl, domain) {
    this.username = username;
    this.apiPassword = apiPassword;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
  }
  kind = "west";
  async request(params) {
    const time = String(Date.now());
    const token = md5Hex(`${this.username}${this.apiPassword}${time}`);
    const body = new URLSearchParams({ ...params, username: this.username, time, token });
    const res = await this.fetchImpl("https://api.west.cn/api/v2/domain/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const json = await res.json();
    if (json.result !== 200) throw new Error(json.msg || "\u897F\u90E8\u6570\u7801\u8BF7\u6C42\u5931\u8D25");
    return json.data ?? {};
  }
  async getDomainList(keyword, page = 1, pageSize = 20) {
    const extra = { act: "getdomains", page: String(page), limit: String(pageSize) };
    if (keyword) extra.domain = keyword;
    const data = await this.request(extra);
    const items = data.items ?? [];
    return {
      total: Number(data.total) || items.length,
      list: items.map((row) => ({ DomainId: row.domain, Domain: row.domain, RecordCount: 0 }))
    };
  }
  async getDomainRecords() {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const data = await this.request({ act: "getdnsrecord", domain: this.domain, pageno: "1", limit: "100" });
    const items = data.items ?? [];
    return {
      total: Number(data.total) || items.length,
      list: items.map((row) => ({
        RecordId: String(row.id),
        Domain: this.domain,
        Name: row.item,
        Type: row.type,
        Value: row.value,
        Line: row.line || "",
        TTL: Number(row.ttl),
        MX: null,
        Status: row.pause === 1 ? "0" : "1",
        Weight: null,
        Remark: null,
        UpdateTime: null
      }))
    };
  }
  async addDomainRecord(name, type, value, line = "", ttl = 600) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const data = await this.request({
      act: "adddnsrecord",
      domain: this.domain,
      host: name,
      type,
      value,
      ttl: String(ttl),
      line
    });
    return String(data.id);
  }
  async updateDomainRecord(recordId, _name, type, value, line = "", ttl = 600) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    await this.request({
      act: "moddnsrecord",
      domain: this.domain,
      id: recordId,
      type,
      value,
      ttl: String(ttl),
      line
    });
    return true;
  }
  async deleteDomainRecord(recordId) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    await this.request({ act: "deldnsrecord", domain: this.domain, id: recordId });
    return true;
  }
}
export {
  WestProvider
};
