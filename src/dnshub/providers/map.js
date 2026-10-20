function pad(n) {
  return String(n).padStart(2, "0");
}
function formatUtcStamp(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
function extractHost(fullName, domain) {
  if (fullName === domain) return "@";
  if (fullName.endsWith(`.${domain}`)) return fullName.slice(0, -(domain.length + 1));
  return fullName;
}
function mapCloudflareRecord(row, domain) {
  let name = extractHost(row.name, domain);
  const status = name.endsWith("_pause") ? "0" : "1";
  if (status === "0") name = name.slice(0, -6);
  if (name === "__root__") name = "@";
  return {
    RecordId: row.id,
    Domain: domain,
    Name: name,
    Type: row.type,
    Value: row.content,
    Line: row.proxied ? "1" : "0",
    TTL: row.ttl ?? 1,
    MX: row.priority ?? null,
    Status: status,
    Weight: null,
    Remark: row.comment ?? null,
    UpdateTime: row.modified_on ?? null
  };
}
function mapAliyunRecord(row) {
  return {
    RecordId: String(row.RecordId),
    Domain: row.DomainName,
    Name: row.RR,
    Type: row.Type,
    Value: row.Value,
    Line: row.Line,
    TTL: Number(row.TTL),
    MX: row.Priority ?? null,
    Status: String(row.Status).toUpperCase() === "ENABLE" ? "1" : "0",
    Weight: row.Weight ?? null,
    Remark: row.Remark ?? null,
    UpdateTime: row.UpdateTimestamp ? formatUtcStamp(Number(row.UpdateTimestamp)) : null
  };
}
function mapDnspodRecord(row, domain) {
  return {
    RecordId: String(row.RecordId),
    Domain: domain,
    Name: row.Name,
    Type: row.Type,
    Value: row.Value,
    Line: String(row.LineId),
    TTL: Number(row.TTL),
    MX: row.MX ?? null,
    Status: String(row.Status).toUpperCase() === "ENABLE" ? "1" : "0",
    Weight: row.Weight ?? null,
    Remark: row.Remark ?? null,
    UpdateTime: row.UpdatedOn ?? null
  };
}
export {
  extractHost,
  formatUtcStamp,
  mapAliyunRecord,
  mapCloudflareRecord,
  mapDnspodRecord
};
