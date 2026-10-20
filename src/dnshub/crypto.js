const te = new TextEncoder();
function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
async function importHmac(secret, hash) {
  const keyData = typeof secret === "string" ? te.encode(secret) : secret;
  return crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash }, false, ["sign"]);
}
async function hmacSha1Base64(secret, data) {
  const key = await importHmac(secret, "SHA-1");
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(data));
  return toBase64(sig);
}
async function hmacSha256Raw(secret, data) {
  const key = await importHmac(secret, "SHA-256");
  return crypto.subtle.sign("HMAC", key, te.encode(data));
}
async function hmacSha256Hex(secret, data) {
  return toHex(await hmacSha256Raw(secret, data));
}
async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", te.encode(data));
  return toHex(digest);
}
function bytesToBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(text) {
  const pad = (4 - text.length % 4) % 4;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export {
  base64UrlToBytes,
  bytesToBase64Url,
  hmacSha1Base64,
  hmacSha256Hex,
  hmacSha256Raw,
  sha256Hex
};
