import { createProvider } from "./providers/factory.js";
const LINE_MAP = {
  aliyun: { DEF: "default", CT: "telecom", CU: "unicom", CM: "mobile" },
  dnspod: { DEF: "0", CT: "10=0", CU: "10=1", CM: "10=3" },
  huawei: { DEF: "default_view", CT: "Dianxin", CU: "Liantong", CM: "Yidong" },
  west: { DEF: "", CT: "LTEL", CU: "LCNC", CM: "LMOB" },
  dnsla: { DEF: "0", CT: "84613316902921216", CU: "84613316923892736", CM: "84613316953252864" },
  namesilo: { DEF: "default" },
  cloudflare: { DEF: "0" }
};
const CDN_PATH = {
  "1": "get_cloudflare_ip",
  "2": "get_cloudfront_ip",
  "3": "get_gcore_ip",
  "4": "get_edgeone_ip"
};
async function fetchPreferredIps(fetchImpl, cdnType = "1", ipType = "v4") {
  const path = CDN_PATH[cdnType] || CDN_PATH["1"];
  const res = await fetchImpl(`https://www.wetest.vip/api/cf2dns/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "o1zrmHAF", type: ipType })
  });
  const json = await res.json();
  if (json.code !== 200 || !json.info) throw new Error(json.msg || "\u83B7\u53D6\u4F18\u9009 IP \u5931\u8D25");
  return json.info;
}
async function applyPreferredIps(store, fetchImpl, input) {
  const account = await store.getAccount(input.accountId);
  if (!account) throw new Error("\u8D26\u53F7\u4E0D\u5B58\u5728");
  const recordNum = Math.min(Math.max(input.recordNum || 1, 1), 5);
  const ttl = input.ttl || 600;
  const ipType = input.ipType === "v6" ? "v6" : "v4";
  const recordType = ipType === "v6" ? "AAAA" : "A";
  const info = await fetchPreferredIps(fetchImpl, input.cdnType || "1", ipType);
  const lines = LINE_MAP[account.provider] || LINE_MAP.aliyun;
  const provider = createProvider({
    provider: account.provider,
    credentials: account.credentials,
    domain: input.domain,
    domainId: input.domainId,
    fetchImpl
  });
  const existing = await provider.getDomainRecords({
    page: 1,
    pageSize: 100,
    subDomain: input.name,
    type: recordType
  });
  let added = 0;
  let changed = 0;
  let deleted = 0;
  const useCtAsDefault = !info.DEF?.length;
  for (const [group, lineId] of Object.entries(lines)) {
    let ips = (info[group] || []).map((row) => row.ip).filter(Boolean);
    if (group === "DEF" && !ips.length && useCtAsDefault) {
      ips = (info.CT || []).map((row) => row.ip).filter(Boolean);
    }
    if (!ips.length) continue;
    ips = ips.slice(0, account.provider === "huawei" ? ips.length : recordNum);
    if (account.provider === "huawei") ips = [ips.slice(0, recordNum).sort().join(",")];
    const result = await syncLine(provider, existing.list, input.name, recordType, lineId, ips, ttl);
    added += result.added;
    changed += result.changed;
    deleted += result.deleted;
  }
  return { added, changed, deleted };
}
async function syncLine(provider, records, name, type, line, desired, ttl) {
  let added = 0;
  let changed = 0;
  let deleted = 0;
  const onLine = records.filter((r) => r.Name === name && String(r.Line) === String(line));
  for (const rec of onLine.filter((r) => r.Type === "CNAME")) {
    await provider.deleteDomainRecord(rec.RecordId);
    deleted += 1;
  }
  const ipRecords = onLine.filter((r) => r.Type === type);
  const exist = ipRecords.map((r) => r.Value);
  const addIps = desired.filter((ip) => !exist.includes(ip));
  const delIps = exist.filter((ip) => !desired.includes(ip));
  for (const rec of ipRecords) {
    if (!delIps.includes(rec.Value)) continue;
    const next = addIps.pop();
    if (next) {
      await provider.updateDomainRecord(rec.RecordId, name, type, next, line, ttl);
      changed += 1;
    } else {
      await provider.deleteDomainRecord(rec.RecordId);
      deleted += 1;
    }
  }
  const remain = exist.filter((ip) => desired.includes(ip)).length + changed;
  for (const ip of addIps) {
    if (remain + added >= desired.length) break;
    await provider.addDomainRecord(name, type, ip, line, ttl);
    added += 1;
  }
  return { added, changed, deleted };
}
function providerSupportsOptimize(kind) {
  return Boolean(LINE_MAP[kind]);
}
export {
  CDN_PATH,
  LINE_MAP,
  applyPreferredIps,
  fetchPreferredIps,
  providerSupportsOptimize
};
