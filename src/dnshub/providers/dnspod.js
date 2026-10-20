import { hmacSha256Hex, hmacSha256Raw, sha256Hex } from "../crypto.js";
import { mapDnspodRecord } from "./map.js";
async function signTencentTc3(opts) {
  const algorithm = "TC3-HMAC-SHA256";
  const date = new Date(opts.timestamp * 1e3).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json; charset=utf-8
host:${opts.host}
`;
  const signedHeaders = "content-type;host";
  const hashedPayload = await sha256Hex(opts.payload);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join("\n");
  const credentialScope = `${date}/${opts.service}/tc3_request`;
  const hashedCanonical = await sha256Hex(canonicalRequest);
  const stringToSign = [algorithm, String(opts.timestamp), credentialScope, hashedCanonical].join("\n");
  const secretDate = await hmacSha256Raw(`TC3${opts.secretKey}`, date);
  const secretService = await hmacSha256Raw(secretDate, opts.service);
  const secretSigning = await hmacSha256Raw(secretService, "tc3_request");
  const signature = await hmacSha256Hex(secretSigning, stringToSign);
  return `${algorithm} Credential=${opts.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
class DnspodProvider {
  constructor(secretId, secretKey, fetchImpl, domain) {
    this.secretId = secretId;
    this.secretKey = secretKey;
    this.fetchImpl = fetchImpl;
    this.domain = domain;
  }
  kind = "dnspod";
  host = "dnspod.tencentcloudapi.com";
  service = "dnspod";
  version = "2021-03-23";
  async request(action, param) {
    const filtered = {};
    for (const [k, v] of Object.entries(param)) {
      if (v !== null && v !== void 0 && v !== "") filtered[k] = v;
    }
    const payload = JSON.stringify(Object.keys(filtered).length ? filtered : {});
    const timestamp = Math.floor(Date.now() / 1e3);
    const authorization = await signTencentTc3({
      secretId: this.secretId,
      secretKey: this.secretKey,
      service: this.service,
      host: this.host,
      timestamp,
      payload
    });
    const res = await this.fetchImpl(`https://${this.host}/`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json; charset=utf-8",
        "X-TC-Action": action,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Version": this.version
      },
      body: payload
    });
    const json = await res.json();
    if (json.Response?.Error) throw new Error(json.Response.Error.Message);
    if (!json.Response) throw new Error("\u817E\u8BAF\u4E91\u8FD4\u56DE\u6570\u636E\u89E3\u6790\u5931\u8D25");
    return json.Response;
  }
  async getDomainList(keyword, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const data = await this.request("DescribeDomainList", {
      Offset: offset,
      Limit: pageSize,
      Keyword: keyword ?? void 0
    });
    const rows = data.DomainList ?? [];
    const list = rows.map((row) => {
      const r = row;
      return { DomainId: String(r.DomainId), Domain: r.Name, RecordCount: Number(r.RecordCount) || 0 };
    });
    const total = Number(data.DomainCountInfo?.DomainTotal) || list.length;
    return { total, list };
  }
  async getDomainRecords(opts = {}) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const offset = ((opts.page ?? 1) - 1) * (opts.pageSize ?? 20);
    const data = await this.request("DescribeRecordList", {
      Domain: this.domain,
      Subdomain: opts.subDomain ?? void 0,
      RecordType: opts.type ?? void 0,
      RecordLineId: opts.line ?? void 0,
      Keyword: opts.keyword ?? void 0,
      Offset: offset,
      Limit: opts.pageSize ?? 20
    });
    const rows = data.RecordList ?? [];
    const list = rows.map(
      (row) => mapDnspodRecord(row, this.domain)
    );
    const total = Number(data.RecordCountInfo?.TotalCount) || list.length;
    return { total, list };
  }
  async addDomainRecord(name, type, value, line = "0", ttl = 600, mx) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const param = {
      Domain: this.domain,
      SubDomain: name,
      RecordType: type,
      Value: value,
      RecordLine: line,
      RecordLineId: line,
      TTL: ttl
    };
    if (type === "MX" && mx) param.MX = mx;
    const data = await this.request("CreateRecord", param);
    return String(data.RecordId);
  }
  async updateDomainRecord(recordId, name, type, value, line = "0", ttl = 600, mx) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    const param = {
      Domain: this.domain,
      RecordId: Number(recordId),
      SubDomain: name,
      RecordType: type,
      Value: value,
      RecordLine: line,
      RecordLineId: line,
      TTL: ttl
    };
    if (type === "MX" && mx) param.MX = mx;
    await this.request("ModifyRecord", param);
    return true;
  }
  async deleteDomainRecord(recordId) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    await this.request("DeleteRecord", { Domain: this.domain, RecordId: Number(recordId) });
    return true;
  }
  async setDomainRecordStatus(recordId, status) {
    if (!this.domain) throw new Error("\u7F3A\u5C11\u57DF\u540D");
    await this.request("ModifyRecordStatus", {
      Domain: this.domain,
      RecordId: Number(recordId),
      Status: status === "1" ? "ENABLE" : "DISABLE"
    });
    return true;
  }
}
export {
  DnspodProvider,
  signTencentTc3
};
