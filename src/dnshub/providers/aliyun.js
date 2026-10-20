import { hmacSha1Base64 } from "../crypto.js";
import { mapAliyunRecord } from "./map.js";
function percentEncode(str) {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}
async function signAliyun(parameters, accessKeySecret, method) {
  const keys = Object.keys(parameters).sort();
  let canonical = "";
  for (const key of keys) {
    const value = parameters[key];
    if (value === void 0 || value === null) continue;
    canonical += `&${percentEncode(key)}=${percentEncode(String(value))}`;
  }
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonical.slice(1))}`;
  return hmacSha1Base64(`${accessKeySecret}&`, stringToSign);
}
function formBody(params) {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}
class AliyunProvider {
  constructor(accessKeyId, accessKeySecret, fetchImpl, domain) {
    this.accessKeyId = accessKeyId;
    this.accessKeySecret = accessKeySecret;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
  }
  kind = "aliyun";
  async request(param) {
    const data = {
      Format: "JSON",
      Version: "2015-01-09",
      AccessKeyId: this.accessKeyId,
      SignatureMethod: "HMAC-SHA1",
      Timestamp: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
      SignatureVersion: "1.0",
      SignatureNonce: crypto.randomUUID().slice(0, 8),
      ...param
    };
    data.Signature = await signAliyun(data, this.accessKeySecret, "POST");
    const res = await this.fetchImpl("https://alidns.aliyuncs.com/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.Message || "\u963F\u91CC\u4E91\u8BF7\u6C42\u5931\u8D25");
    return json;
  }
  async getDomainList(keyword, page = 1, pageSize = 20) {
    const param = {
      Action: "DescribeDomains",
      PageNumber: page,
      PageSize: pageSize
    };
    if (keyword) param.KeyWord = keyword;
    const data = await this.request(param);
    const domains = data.Domains?.Domain ?? [];
    const list = (Array.isArray(domains) ? domains : []).map((row) => {
      const r = row;
      return { DomainId: String(r.DomainId), Domain: r.DomainName, RecordCount: Number(r.RecordCount) || 0 };
    });
    return { total: Number(data.TotalCount) || list.length, list };
  }
  async getDomainRecords(opts = {}) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const param = {
      Action: "DescribeDomainRecords",
      DomainName: this.domain,
      PageNumber: opts.page ?? 1,
      PageSize: opts.pageSize ?? 20
    };
    if (opts.subDomain || opts.type || opts.line) {
      param.SearchMode = "ADVANCED";
      if (opts.subDomain) param.RRKeyWord = opts.subDomain;
      if (opts.type) param.Type = opts.type;
      if (opts.line) param.Line = opts.line;
    } else if (opts.keyword) {
      param.KeyWord = opts.keyword;
    }
    const data = await this.request(param);
    const records = data.DomainRecords?.Record ?? [];
    const list = (Array.isArray(records) ? records : []).map(
      (row) => mapAliyunRecord(row)
    );
    return { total: Number(data.TotalCount) || list.length, list };
  }
  async addDomainRecord(name, type, value, line = "default", ttl = 600, mx, remark) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const param = {
      Action: "AddDomainRecord",
      DomainName: this.domain,
      RR: name,
      Type: type,
      Value: value,
      Line: line || "default",
      TTL: ttl
    };
    if (mx) param.Priority = mx;
    if (remark) param.Remark = remark;
    const data = await this.request(param);
    return String(data.RecordId);
  }
  async updateDomainRecord(recordId, name, type, value, line = "default", ttl = 600, mx, remark) {
    const param = {
      Action: "UpdateDomainRecord",
      RecordId: recordId,
      RR: name,
      Type: type,
      Value: value,
      Line: line || "default",
      TTL: ttl
    };
    if (mx) param.Priority = mx;
    if (remark) param.Remark = remark;
    await this.request(param);
    return true;
  }
  async deleteDomainRecord(recordId) {
    await this.request({ Action: "DeleteDomainRecord", RecordId: recordId });
    return true;
  }
  async setDomainRecordStatus(recordId, status) {
    await this.request({
      Action: "SetDomainRecordStatus",
      RecordId: recordId,
      Status: status === "1" ? "Enable" : "Disable"
    });
    return true;
  }
  async addDomain(domain) {
    const data = await this.request({ Action: "AddDomain", DomainName: domain });
    return { DomainId: String(data.DomainId || domain), Domain: domain, RecordCount: 0 };
  }
}
export {
  AliyunProvider,
  percentEncode,
  signAliyun
};
