// Sec-MS-GEC v2 token for Microsoft Edge's free "Read Aloud" voices.
// Line-for-line BigInt port of rany2/edge-tts drm.py (v7.3.x) — verified against its output in edge-drm.test.ts.
// Pure + runtime-agnostic (no Node APIs) so it runs on the Worker.

export const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const EDGE_CHROMIUM_FULL_VERSION = "143.0.3650.75";
export const EDGE_SEC_MS_GEC_VERSION = `2-${EDGE_CHROMIUM_FULL_VERSION}`;

const M = 0xffffffffn;
const WIN_EPOCH = 11644473600n;
const INITIAL = [0x6A09E667n, 0xBB67AE85n, 0x3C6EF372n, 0xA54FF53An, 0x510E527Fn, 0x9B05688Cn, 0x1F83D9ABn, 0x5BE0CD19n];
const STATE0 = [0xFD9FBEA2n, 0x91243CE7n, 0xBE499094n, 0xCD2E1E0An, 0x6C006F49n, 0x04BD35ABn, 0xFEB0A7E4n, 0x03EFFBD2n];
const SCHEDULE = [0xEB24BF9En, 0x1558691Fn, 0xA0C09EE2n, 0x0CFA32BAn, 0xA622EE8Cn, 0xD1DD9491n, 0xC0DD25A0n, 0xF9E70AB6n, 0xF0C31573n, 0x7058CE4En, 0x7188E606n, 0x00E5AB33n, 0xD258B060n, 0x72766564n];
const K = [0x428A2F98n, 0x71374491n, 0xB5C0FBCFn, 0xE9B5DBA5n, 0x3956C25Bn, 0x59F111F1n, 0x923F82A4n, 0xAB1C5ED5n, 0xD807AA98n, 0x12835B01n, 0x243185BEn, 0x550C7DC3n, 0x72BE5D74n, 0x80DEB1FEn, 0x9BDC06A7n, 0xC19BF174n, 0xE49B69C1n, 0xEFBE4786n, 0x0FC19DC6n, 0x240CA1CCn, 0x2DE92C6Fn, 0x4A7484AAn, 0x5CB0A9DCn, 0x76F988DAn, 0x983E5152n, 0xA831C66Dn, 0xB00327C8n, 0xBF597FC7n, 0xC6E00BF3n, 0xD5A79147n, 0x06CA6351n, 0x14292967n, 0x27B70A85n, 0x2E1B2138n, 0x4D2C6DFCn, 0x53380D13n, 0x650A7354n, 0x766A0ABBn, 0x81C2C92En, 0x92722C85n, 0xA2BFE8A1n, 0xA81A664Bn, 0xC24B8B70n, 0xC76C51A3n, 0xD192E819n, 0xD6990624n, 0xF40E3585n, 0x106AA070n, 0x19A4C116n, 0x1E376C08n, 0x2748774Cn, 0x34B0BCB5n, 0x391C0CB3n, 0x4ED8AA4An, 0x5B9CCA4Fn, 0x682E6FF3n, 0x748F82EEn, 0x78A5636Fn, 0x84C87814n, 0x8CC70208n, 0x90BEFFFAn, 0xA4506CEBn, 0xBEF9A3F7n, 0xC67178F2n];
const ADJ = 0xC9DC06A7n; const SIG0_ADJ = 0x059C0B80n; const SIG1_ADJ = 0x000B92C0n;
const CS64: [bigint, bigint][] = [[0xE82E91B1n, 0xB32700D0n], [0x44DE24C6n, 0x88DFF51Dn], [0x3BEB65BCn, 0x29514038n], [0xC89C5933n, 0xB328CBDFn], [0x8D1EC211n, 0xD405B4D5n], [0x314EF5D5n, 0x26E55F3Cn], [0xE92491B1n, 0x607801C6n], [0xF0A5B9D5n, 0x82B2C1FBn], [0x06064CF3n, 0xFA51A3DAn], [0xDA79FA60n, 0x207CC464n], [0xBED20560n, 0x3C3C74F3n], [0x89F9C9F8n, 0xD2D14B61n], [0x35FA38C6n, 0xBB04A2C1n], [0xCB49E3C6n, 0xC5626167n]];
const CS64_FACTOR = 0x82893933n; const CS64_ADJ0 = 0xF2F90B1An; const CS64_ADJ1 = 0x0B1A0000n;


const rol16 = (v: bigint) => {
  v &= M;
  return ((v << 16n) | (v >> 16n)) & M;
};
const sigma0 = (v: bigint) => ((v >> 7n) ^ (v << 25n) ^ (v >> 18n) ^ (v << 14n) ^ (v >> 3n)) & M;
const sigma1 = (v: bigint) => ((v >> 17n) ^ (v << 15n) ^ (v >> 19n) ^ (v << 13n) ^ (v >> 10n)) & M;
const rotr = (v: bigint, n: bigint) => ((v >> n) | (v << (32n - n))) & M;

const BLOCK_K = [...K.slice(0, 14), ADJ, ...K.slice(15)];

function rounds(state: bigint[], w: bigint[], first = 0): bigint[] {
  let [a, b, c, d, e, f, g, h] = state as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  const k = first === 14 ? BLOCK_K : K;
  for (let i = first; i < 64; i++) {
    const s1 = rotr(e, 6n) ^ rotr(e, 11n) ^ rotr(e, 25n);
    const ch = g ^ (e & (f ^ g));
    const t1 = h + s1 + ch + k[i]! + w[i]!;
    const s0 = rotr(a, 2n) ^ rotr(a, 13n) ^ rotr(a, 22n);
    const maj = (a & b) | (c & (a | b));
    const t2 = s0 + maj;
    h = g; g = f; f = e; e = (d + t1) & M; d = c; c = b; b = a; a = (t1 + t2) & M;
  }
  return [a, b, c, d, e, f, g, h];
}

function expand(w: bigint[], firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    const x = w[i - 2]!, y = w[i - 15]!;
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    w.push((s1 + w[i - 7]! + s0 + w[i - 16]!) & M);
  }
}

const be = (bytes: Uint8Array) => bytes.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);

function shaInit(data: Uint8Array): bigint[] {
  const w: bigint[] = [...Array<bigint>(14).fill(0n), be(data.slice(0, 3)), be(data.slice(3, 7))];
  for (let i = 16; i < 30; i++) {
    let v = SCHEDULE[i - 16]!;
    if (i - 2 >= 14) v += i === 16 ? sigma1(w[i - 2]!) ^ SIG1_ADJ : sigma1(w[i - 2]!);
    if (i - 7 >= 14) v += w[i - 7]!;
    if (i - 15 >= 14) v += i === 29 ? sigma0(w[i - 15]!) ^ SIG0_ADJ : sigma0(w[i - 15]!);
    w.push(v & M);
  }
  w.push((sigma1(w[28]!) + w[23]! + sigma0(w[15]!) + w[14]! + ADJ - K[14]!) & ((1n << 64n) - 1n) & M);
  expand(w, 31);
  const working = rounds(STATE0, w, 14);
  return INITIAL.map((x, i) => (x + working[i]!) & M);
}

function shaDigest(data: Uint8Array): Uint8Array {
  if (data.length < 7) throw new Error("Token salt must contain at least seven bytes");
  const length = 57 + data.length;
  const zeros = (((55 - length) % 64) + 64) % 64;
  const tail = data.slice(7);
  const padded = new Uint8Array(tail.length + 1 + zeros + 8);
  padded.set(tail, 0);
  padded[tail.length] = 0x80;
  const bits = BigInt(length * 8);
  for (let i = 0; i < 8; i++) padded[padded.length - 1 - i] = Number((bits >> BigInt(8 * i)) & 0xffn);
  let state = shaInit(data.slice(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const w: bigint[] = [];
    for (let j = 0; j < 16; j++) w.push(be(padded.slice(off + j * 4, off + j * 4 + 4)));
    expand(w);
    const working = rounds(state, w);
    state = state.map((x, i) => (x + working[i]!) & M);
  }
  const out = new Uint8Array(32);
  state.forEach((x, i) => {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = Number((x >> BigInt(24 - 8 * j)) & 0xffn);
  });
  return out;
}

const le32 = (b: Uint8Array, o: number) => BigInt(b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) + (BigInt(b[o + 3]!) << 24n);

function wordsLe4Even(data: Uint8Array): bigint[] {
  const len = data.length + ((4 - (data.length % 4)) % 4);
  if (!len) return [];
  const p = new Uint8Array(len);
  p.set(data);
  const w: bigint[] = [];
  for (let o = 0; o < len; o += 4) w.push(le32(p, o));
  if (w.length % 2) w.push(0n);
  return w;
}

function cs64(data: Uint8Array, digest: Uint8Array): [bigint, bigint] {
  const keyA = le32(digest, 0) | 1n;
  const keyB = le32(digest, 4) | 1n;
  const factors = [(keyA * CS64_FACTOR) & M, (keyB * CS64_FACTOR) & M];
  const terms = CS64.map(([c], i) => (c * factors[i % 2]!) & M);
  const offsets = CS64.map(([, o]) => o);
  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1);
  wordsLe4Even(prefixed).forEach((word, i) => {
    let term = word * (i % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (i % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (i === 0) {
      term += CS64_ADJ0 * factors[0]!;
      offset += CS64_ADJ1;
    }
    terms.push(term & M);
    offsets.push(offset & M);
  });
  let swapAcc = 0n, swapLast = 0n, state = 0n, acc = 0n;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i]!, y = terms[i + 1]!;
    let t = rol16((offsets[i]! + x) & M);
    let q = (t * 0x76f50f34n) & M;
    swapAcc += (rol16(q) * 0xc3efea97n + q) & M;
    t = rol16((offsets[i + 1]! + y) & M);
    q = (t * 0x1881ce3cn) & M;
    swapLast = (rol16(q) * 0x35bd1ec9n + q) & M;
    swapAcc = (swapAcc + swapLast) & M;

    state = (state * keyA + x) & M;
    state = (rol16(state) * 0xcf98b111n) & M;
    state = (rol16(state) * 0x87085b9fn) & M;
    state = (rol16(state) * 0x12ceb96dn) & M;
    state = (rol16(state) * 0x257e1d83n) & M;
    acc += state;
    t = (state * keyB + y) & M;
    t = (rol16(t) * 0xa27416f5n) & M;
    t = (rol16(t) * 0xd38396ffn) & M;
    state = (rol16((rol16(t) * 0x7c932b89n) & M) * 0xbfa49f69n) & M;
    acc = (acc + state) & M;
  }
  return [swapLast ^ state, swapAcc ^ acc];
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
const le32Bytes = (v: bigint) => Uint8Array.from([0, 1, 2, 3], (i) => Number((v >> BigInt(8 * i)) & 0xffn));

let cache: { key: string; value: string } | null = null;

/** Sec-MS-GEC v2 for a unix timestamp (seconds). Stable within each 5-minute window. */
export function secMsGec(unixSeconds: number = Date.now() / 1000): string {
  let ticks = BigInt(Math.floor(unixSeconds)) + WIN_EPOCH;
  ticks -= ticks % 300n;
  const key = `${ticks * 10_000_000n}${EDGE_TRUSTED_CLIENT_TOKEN}`;
  if (cache?.key === key) return cache.value;
  const data = new TextEncoder().encode(key);
  const digest = shaDigest(data);
  const [c0, c1] = cs64(data, digest);
  const out = new Uint8Array(8);
  out.set(le32Bytes(c0), 0);
  out.set(le32Bytes(c1), 4);
  const value = `${hex(out)}-${hex(digest)}`;
  cache = { key, value };
  return value;
}
