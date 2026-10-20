const S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21
];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(2 ** 32 * Math.abs(Math.sin(i + 1))));
function rotl(x, n) {
  return x << n | x >>> 32 - n;
}
function md5Hex(text) {
  const raw = new TextEncoder().encode(text);
  const len = raw.length;
  const withOne = len + 1;
  const total = withOne + 8 + 63 >> 6 << 6;
  const bytes = new Uint8Array(total);
  bytes.set(raw);
  bytes[len] = 128;
  const view = new DataView(bytes.buffer);
  view.setUint32(total - 8, len * 8 >>> 0, true);
  view.setUint32(total - 4, Math.floor(len * 8 / 2 ** 32), true);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  for (let i = 0; i < total; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let j = 0; j < 64; j++) {
      let F;
      let g;
      if (j < 16) {
        F = B & C | ~B & D;
        g = j;
      } else if (j < 32) {
        F = D & B | ~D & C;
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * j % 16;
      }
      const temp = A + F + K[j] + M[g] >>> 0;
      A = D;
      D = C;
      C = B;
      B = B + rotl(temp, S[j]) >>> 0;
    }
    a0 = a0 + A >>> 0;
    b0 = b0 + B >>> 0;
    c0 = c0 + C >>> 0;
    d0 = d0 + D >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return [...new Uint8Array(out.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export {
  md5Hex
};
