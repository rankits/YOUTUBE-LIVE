// Pure helpers for "Job & Exam Alert" Shorts: RSS parsing, alert classification and picking the freshest unused alert.

export type NewsKind = "vacancy" | "exam" | "admit" | "result";
export type NewsItem = { title: string; link: string; source: string; published: string; kind: NewsKind | null };

export const NEWS_FEED_QUERY =
  '(भर्ती OR vacancy OR recruitment OR "admit card" OR "exam date" OR result OR "answer key") (SSC OR UPSC OR Railway OR RRB OR Police OR Bank OR IBPS OR NTA OR सरकारी) when:2d';

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "").trim();

const tag = (block: string, name: string) => decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "");

/** Bing wraps article links in a click-tracking redirect; keep the real article URL. */
const realLink = (link: string) => {
  if (!/bing\.com\/news\/apiclick/i.test(link)) return link;
  try { return new URL(link).searchParams.get("url") || link; } catch { return link; }
};

const NEWS_FEED_QUERY_EN =
  '(vacancy OR recruitment OR "admit card" OR "exam date" OR result OR "answer key") (SSC OR UPSC OR Railway OR RRB OR Police OR Bank OR IBPS OR NTA OR sarkari) when:2d';

/**
 * Free news feeds tried together. SarkariExam WordPress RSS is primary (direct job posts);
 * Google/Bing fill gaps when that feed is quiet. Any one working feed is enough.
 */
export function newsFeeds(year = new Date().getFullYear()): { name: string; url: string }[] {
  const g = (q: string, hl: string, ceid: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=IN&ceid=${ceid}`;
  const b = (q: string) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setmkt=en-IN`;
  return [
    { name: "SarkariExam", url: "https://www.sarkariexam.com/feed/" },
    { name: "Google News (Hindi)", url: g(NEWS_FEED_QUERY, "hi", "IN:hi") },
    { name: "Google News (English)", url: g(NEWS_FEED_QUERY_EN, "en-IN", "IN:en") },
    { name: "Bing: sarkari naukri", url: b("sarkari naukri") },
    { name: "Bing: recruitment", url: b(`recruitment ${year} vacancy`) },
    { name: "Bing: admit card", url: b(`admit card ${year}`) },
    { name: "Bing: result", url: b(`result ${year} declared`) },
    { name: "Bing: भर्ती", url: b("भर्ती परीक्षा") },
  ];
}

/** Joins several feeds: alerts only, no duplicate links/headlines, nothing older than `maxAgeDays`, newest first. */
export function mergeNews(lists: NewsItem[][], now = Date.now(), maxAgeDays = 4, max = 40): NewsItem[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60);
  const links = new Set<string>();
  const titles = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of lists.flat()) {
    if (!item.kind || /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.title)) continue;
    const at = Date.parse(item.published);
    if (at && now - at > maxAgeDays * 86_400_000) continue;
    const n = norm(item.title);
    if (links.has(item.link) || titles.has(n)) continue;
    links.add(item.link); titles.add(n); out.push(item);
  }
  return out
    .sort((a, b) => {
      const dt = (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0);
      if (dt) return dt;
      const pref = (x: NewsItem) => (/sarkariexam\.com/i.test(x.link) || x.source === "SarkariExam" ? 1 : 0);
      return pref(b) - pref(a);
    })
    .slice(0, max);
}

/** Classifies an education headline; null when it is not a job/exam/result alert. */
export function classifyNews(title: string): NewsKind | null {
  const t = title.toLowerCase();
  if (/result|परिणाम|रिजल्ट|answer key|आंसर की|cut ?off|कटऑफ|merit list/.test(t)) return "result";
  if (/admit card|एडमिट|प्रवेश पत्र|hall ticket/.test(t)) return "admit";
  if (/exam date|परीक्षा तिथि|परीक्षा की तारीख|exam calendar|schedule|डेट|date sheet|exam on/.test(t)) return "exam";
  if (/vacanc|recruit|भर्ती|bharti|नौकरी|naukri|post[s]? |पदों|पद |apply|आवेदन|notification/.test(t)) return "vacancy";
  return null;
}

/** Parses Google / Bing / WordPress RSS; strips " - Source" suffix; labels SarkariExam posts. */
export function parseNewsRss(xml: string): NewsItem[] {
  const out: NewsItem[] = [];
  const channelTitle = tag(xml.match(/<channel>([\s\S]*?)<item>/i)?.[1] ?? "", "title");
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1]!;
    let title = tag(b, "title");
    const link = realLink(tag(b, "link"));
    let source = tag(b, "source") || tag(b, "News:Source") || tag(b, "dc:creator");
    if (!source && title.includes(" - ")) {
      const suffix = title.split(" - ").pop() || "";
      if (suffix && title.endsWith(` - ${suffix}`)) {
        source = suffix;
        title = title.slice(0, -(suffix.length + 3)).trim();
      }
    } else if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }
    if (!source) {
      source = /sarkariexam\.com/i.test(link) ? "SarkariExam" : channelTitle || "";
    } else if (/sarkariexam\.com/i.test(link)) {
      source = "SarkariExam";
    }
    if (!title || !link) continue;
    out.push({ title, link, source, published: tag(b, "pubDate"), kind: classifyNews(title) });
  }
  return out;
}

/** Newest alert (job/exam/admit/result only) whose link and headline were not used before. */
export function pickViralNews(items: NewsItem[], used: string[]): NewsItem | null {
  const seen = new Set(used);
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const usedTitles = new Set(used.map(norm));
  const fresh = items
    .filter((i) => i.kind && !seen.has(i.link) && !usedTitles.has(norm(i.title)))
    .sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  return fresh[0] ?? null;
}

/** Next N unused viral alerts (for filling daily Short slots). */
export function pickViralNewsBatch(items: NewsItem[], used: string[], n = 8): NewsItem[] {
  const out: NewsItem[] = [];
  const usedNow = [...used];
  for (let i = 0; i < n; i++) {
    const p = pickViralNews(items, usedNow);
    if (!p) break;
    out.push(p);
    usedNow.push(p.link);
  }
  return out;
}

/** Structured vacancy facts for poster cards. */
export type JobFacts = {
  posts?: string;
  startDate?: string;
  endDate?: string;
  qualification?: string;
  ageLimit?: string;
  pattern?: string[];
};

/** Early + late = poster; middle = full-bleed photo. */
export function sceneLayout(index: number, total: number): "poster" | "photo" {
  if (total <= 0) return "poster";
  if (index <= 1) return "poster";
  if (index === total - 1) return "poster";
  if (total >= 6 && index === total - 2) return "poster";
  return "photo";
}

export const KIND_LABEL: Record<NewsKind, string> = { vacancy: "NEW VACANCY", exam: "EXAM DATE", admit: "ADMIT CARD", result: "RESULT OUT" };
export const NEWS_HASHTAGS = [
  "#Shorts",
  "#SarkariNaukri",
  "#GovtJobs",
  "#JobAlert",
  "#SarkariResult",
  "#ExamUpdate",
  "#Vacancy2026",
  "#SarkariJob",
  "#GovernmentJobs",
  "#Bharti2026",
  "#ApplyOnline",
  "#LatestVacancy",
  "#Rozgar",
  "#NaukriAlert",
  "#IndiaJobs",
];

/** High-search YouTube tags for Job Alert Shorts (trending / viral discovery). */
export const VIRAL_JOB_TAGS = [
  "sarkari naukri",
  "govt jobs",
  "government jobs 2026",
  "job alert",
  "sarkari result",
  "latest vacancy",
  "bharti 2026",
  "apply online",
  "railway jobs",
  "police bharti",
  "ssc jobs",
  "rrb ntpc",
  "upsc",
  "banking jobs",
  "sarkari exam",
  "admit card",
  "result out",
  "vacancy alert",
  "naukri",
  "rozgar",
  "india jobs",
  "shorts",
  "viral",
  "trending",
  "breaking news",
  "job notification",
  "recruitment 2026",
  "sarkari naukri 2026",
];

/** Build a ~100 char viral YouTube Shorts title (emoji + job + hook + #Shorts). */
export function viralJobTitle(opts: { jobName?: string; headline?: string; kindLabel?: string; aiTitle?: string }): string {
  const job = (opts.jobName || "").trim();
  const kind = (opts.kindLabel || "JOB ALERT").trim();
  const head = (opts.headline || "").trim();
  let base = (opts.aiTitle || "").replace(/#shorts/gi, "").replace(/\s+/g, " ").trim();
  if (!base || base.length < 40) {
    const bits = [
      "🚨",
      job || "Sarkari Naukri",
      kind,
      head && head.toUpperCase() !== job.toUpperCase() ? head : "Latest Vacancy Update",
      "Apply Now",
    ].filter(Boolean);
    base = bits.join(" | ");
  }
  if (!/🚨|🔥|✅|📢/.test(base)) base = `🚨 ${base}`;
  base = base.replace(/\s+/g, " ").trim();
  // Leave room for " #Shorts" (8 chars) → body max 92
  if (base.length > 92) base = base.slice(0, 92).replace(/[\s|–—,:]+$/u, "").trimEnd();
  if (!/#shorts/i.test(base)) base = `${base} #Shorts`;
  return base.slice(0, 100);
}

/**
 * Short bold on-screen name for whose bharti / exam this is (e.g. "MP POLICE", "RRB NTPC").
 * Prefer known exam/org tokens; fall back to the first meaningful headline words.
 */
export function extractJobLabel(title: string, maxLen = 28): string {
  const t = title.trim();
  if (!t) return "JOB ALERT";
  const known: { re: RegExp; label: string }[] = [
    { re: /mp\s*police|मध्य\s*प्रदेश\s*पुलिस|मप्र\s*पुलिस/i, label: "MP POLICE" },
    { re: /up\s*police|उत्तर\s*प्रदेश\s*पुलिस|यूपी\s*पुलिस/i, label: "UP POLICE" },
    { re: /delhi\s*police|दिल्ली\s*पुलिस/i, label: "DELHI POLICE" },
    { re: /bihar\s*police|बिहार\s*पुलिस/i, label: "BIHAR POLICE" },
    { re: /rrb\s*ntpc|आरआरबी\s*एनटीपीसी/i, label: "RRB NTPC" },
    { re: /rrb\s*alp|आरआरबी\s*एएलपी/i, label: "RRB ALP" },
    { re: /rrb\s*group\s*d|आरआरबी\s*ग्रुप\s*डी/i, label: "RRB GROUP D" },
    { re: /\bssc\s*cgl\b/i, label: "SSC CGL" },
    { re: /\bssc\s*chsl\b/i, label: "SSC CHSL" },
    { re: /\bssc\s*gd\b/i, label: "SSC GD" },
    { re: /\bssc\s*mts\b/i, label: "SSC MTS" },
    { re: /\bupsc\b|यूपीएससी/i, label: "UPSC" },
    { re: /\bibps\b/i, label: "IBPS" },
    { re: /\bsbi\b/i, label: "SBI" },
    { re: /\bnta\b|नीट|neet|jee/i, label: "NTA / EXAM" },
    { re: /railway|रेलवे|आरआरबी|\brrb\b/i, label: "RAILWAY" },
    { re: /police|पुलिस|दरोगा|सिपाही/i, label: "POLICE JOBS" },
    { re: /army|navy|air\s*force|सेना|सैन्य/i, label: "DEFENCE JOBS" },
    { re: /bank|बैंकिंग/i, label: "BANK JOBS" },
  ];
  for (const k of known) if (k.re.test(t)) return k.label.slice(0, maxLen);

  // Keep Latin tokens / numbers if present (SSC 2026, etc.)
  const latin = t.match(/[A-Za-z][A-Za-z0-9.&/\-]{1,}/g)?.slice(0, 3).join(" ");
  if (latin && latin.length >= 3) return latin.toUpperCase().slice(0, maxLen);

  // Hindi: first few words before colon/dash
  const head = t.split(/[:\-–—|]/)[0]?.trim() || t;
  return head.replace(/\s+/g, " ").slice(0, maxLen).toUpperCase() || "JOB ALERT";
}

/** Daily publish times (local hours) for the 8-Shorts-a-day plan, ~2h apart. */
export const DAILY_SLOT_HOURS = [8, 10, 12, 14, 16, 18, 20, 22];

/** Next free daily slot after `now` that is at least 15 min away and not already taken. */
export function nextDailySlot(now: Date, taken: number[] = []): Date {
  for (let d = 0; d < 60; d++) {
    for (const h of DAILY_SLOT_HOURS) {
      const t = new Date(now); t.setDate(now.getDate() + d); t.setHours(h, 0, 0, 0);
      if (t.getTime() > now.getTime() + 15 * 60_000 && !taken.includes(t.getTime())) return t;
    }
  }
  return new Date(now.getTime() + 3600_000);
}
