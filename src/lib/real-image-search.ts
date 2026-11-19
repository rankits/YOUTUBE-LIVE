/**
 * Free real-photo lookup for Job Alert Shorts (no API key / no card).
 * Tries Wikimedia Commons, then Openverse (CC / public-domain).
 */

type TopicSearch = { re: RegExp; queries: string[] };

/** Short English search phrases — better recall than long AI prompts. */
const REAL_TOPIC_QUERIES: TopicSearch[] = [
  { re: /police|दरोगा|सिपाही|पुलिस|constable|sipahi|daroga|khaki/i, queries: ["Indian police officers khaki", "India police station", "police recruitment India"] },
  { re: /railway|railways|ट्रेन|रेलवे|आरआरबी|rrb|train|loco|ntpc alp/i, queries: ["Indian Railways train station", "India railway platform", "passenger train India"] },
  { re: /army|navy|air\s*force|सैन्य|सेना|defence|defense|soldier|military/i, queries: ["Indian Army soldiers parade", "Indian armed forces", "military parade India"] },
  { re: /bank|बैंकिंग|sbi|rbi|ibps|atm|finance/i, queries: ["Indian bank branch interior", "bank counter India", "ATM India bank"] },
  { re: /admit\s*card|एडमिट|प्रवेश पत्र|hall ticket|result|परिणाम|रिजल्ट|answer key/i, queries: ["students checking exam results computer", "admit card exam India", "examination results office"] },
  { re: /\bssc\b|upsc|परीक्षा|भर्ती|bharti|recruitment|vacancy|naukri|नौकरी|exam|nta|competitive/i, queries: ["examination hall students India", "competitive exam India classroom", "students writing exam desks"] },
  { re: /संसद|parliament|constitution|lok sabha|supreme court/i, queries: ["Indian Parliament New Delhi", "Sansad Bhavan India", "Supreme Court of India"] },
  { re: /farmer|कृषि|खेत|agriculture|crop/i, queries: ["Indian farmers field", "agriculture India farmland", "wheat harvest India"] },
  { re: /computer|software|coding|ai\b|internet/i, queries: ["computer lab India students", "coding laptop desk", "IT office India"] },
  { re: /cricket|क्रिकेट|stadium|olympic/i, queries: ["Indian cricket stadium", "cricket match India crowd", "sports stadium India"] },
];

const UA = "AvatarShowtimeStudio/1.0 (job-alert-shorts; educational; contact: local-dev)";

/** Picks a short search phrase for Wikimedia / Openverse from the scene query. */
export function realPhotoQuery(raw: string, seed = 0): string {
  const q = raw.trim();
  for (const rule of REAL_TOPIC_QUERIES) {
    if (rule.re.test(q)) {
      const list = rule.queries;
      return list[Math.abs(seed) % list.length]!;
    }
  }
  const ascii = q
    .replace(/[\u0900-\u097F]/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return ascii.length >= 6 ? `${ascii} India` : "government job exam India students";
}

async function fetchJson(url: string, ms = 12_000): Promise<unknown | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(ms),
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

/** Wikimedia Commons bitmap search → direct image URLs (prefer jpeg/png). */
export async function searchWikimedia(query: string, limit = 12): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(20, Math.max(3, limit))),
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "1280",
    format: "json",
    origin: "*",
  });
  const data = (await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`)) as {
    query?: { pages?: Record<string, { imageinfo?: { url?: string; thumburl?: string; mime?: string; size?: number }[] }> };
  } | null;
  if (!data?.query?.pages) return [];
  const out: string[] = [];
  for (const page of Object.values(data.query.pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const mime = (info.mime || "").toLowerCase();
    if (mime && !/^image\/(jpeg|jpg|png|webp)$/.test(mime)) continue;
    if (info.size && info.size > 15_000_000) continue;
    const url = info.thumburl || info.url;
    if (url?.startsWith("http")) out.push(url);
  }
  return out;
}

/** Openverse CC / public-domain commercial-safe images. */
export async function searchOpenverse(query: string, limit = 12): Promise<string[]> {
  const url =
    `https://api.openverse.org/v1/images/?` +
    new URLSearchParams({
      q: query,
      page_size: String(Math.min(20, Math.max(3, limit))),
      license_type: "commercial",
      filter_dead: "true",
    }).toString();
  const data = (await fetchJson(url)) as { results?: { url?: string; thumbnail?: string }[] } | null;
  if (!data?.results?.length) return [];
  return data.results
    .map((r) => r.url || r.thumbnail)
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u));
}

/** Collects unique image URLs from free sources; order is stable for a given seed pick. */
export async function findRealImageUrls(rawQuery: string, seed = 0): Promise<{ urls: string[]; search: string; source: string }> {
  const search = realPhotoQuery(rawQuery, seed);
  const [wiki, open] = await Promise.all([
    searchWikimedia(search).catch(() => [] as string[]),
    searchOpenverse(search).catch(() => [] as string[]),
  ]);
  const seen = new Set<string>();
  const urls: string[] = [];
  // Prefer Wikimedia first (India govt / landmarks often stronger), then Openverse.
  for (const u of [...wiki, ...open]) {
    const key = u.split("?")[0]!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(u);
  }
  const source = wiki.length ? (open.length ? "wikimedia+openverse" : "wikimedia") : open.length ? "openverse" : "none";
  return { urls, search, source };
}

/** Downloads one real photo as bytes for proxying to the browser. */
export async function fetchRealImageBytes(
  rawQuery: string,
  seed: number,
): Promise<{ bytes: ArrayBuffer; contentType: string; source: string; search: string } | null> {
  const { urls, search, source } = await findRealImageUrls(rawQuery, seed);
  if (!urls.length) return null;
  const pick = urls[Math.abs(seed) % urls.length]!;
  // Try a few nearby picks if one URL fails (hotlink / 403).
  const order = [pick, ...urls.filter((u) => u !== pick)].slice(0, 4);
  for (const imageUrl of order) {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    }).catch(() => null);
    if (!res?.ok) continue;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim();
    if (!type.startsWith("image/")) continue;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 2_000) continue;
    return { bytes, contentType: type, source, search };
  }
  return null;
}
