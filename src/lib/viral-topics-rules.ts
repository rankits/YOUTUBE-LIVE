/** Viral / trending headlines (India + World) for news-style YouTube Shorts. */

import { nextDailySlot, sceneLayout } from "@/lib/news-rules";

export type ViralRegion = "india" | "world";
export type ViralTopic = {
  title: string;
  link: string;
  source: string;
  published: string;
  region: ViralRegion;
  category: string;
};

export { nextDailySlot, sceneLayout };

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

const tag = (block: string, name: string) => decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "");

const realLink = (link: string) => {
  if (!/bing\.com\/news\/apiclick/i.test(link)) return link;
  try {
    return new URL(link).searchParams.get("url") || link;
  } catch {
    return link;
  }
};

/** Soft category for badges — not used to filter items out. */
export function classifyViral(title: string): string {
  const t = title.toLowerCase();
  if (/cricket|ipl|football|tennis|olympics|match|score|fifa|nba|sport/i.test(t)) return "Sports";
  if (/election|minister|parliament|bjp|congress|modi|trump|president|pm |cm /i.test(t)) return "Politics";
  if (/stock|market|rupee|dollar|crypto|sensex|nifty|economy|gdp|bank/i.test(t)) return "Business";
  if (/ai |chatgpt|tech|iphone|google|microsoft|app |cyber|startup/i.test(t)) return "Tech";
  if (/movie|bollywood|hollywood|netflix|celebrity|film|actor|actress/i.test(t)) return "Entertainment";
  if (/quake|flood|cyclone|weather|climate|disaster/i.test(t)) return "Weather";
  if (/war|israel|ukraine|gaza|attack|missile|army|defence|defense/i.test(t)) return "World";
  return "Trending";
}

export function viralFeeds(region: ViralRegion): { name: string; url: string }[] {
  if (region === "india") {
    return [
      { name: "Google News India", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en" },
      { name: "Google News India (Hindi)", url: "https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi" },
      { name: "Google India Top", url: "https://news.google.com/rss/headlines/section/geo/India?hl=en-IN&gl=IN&ceid=IN:en" },
      { name: "Bing India", url: "https://www.bing.com/news/search?q=India&format=rss&setmkt=en-IN" },
      { name: "Bing Trending India", url: "https://www.bing.com/news/search?q=trending+India&format=rss&setmkt=en-IN" },
    ];
  }
  return [
    { name: "Google World", url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en" },
    { name: "Google Top Stories", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en" },
    { name: "Bing World", url: "https://www.bing.com/news/search?q=world+news&format=rss&setmkt=en-US" },
    { name: "Bing Trending", url: "https://www.bing.com/news/search?q=trending+now&format=rss&setmkt=en-US" },
  ];
}

export function parseViralRss(xml: string, region: ViralRegion): ViralTopic[] {
  const out: ViralTopic[] = [];
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
    if (!source) source = channelTitle || "";
    if (!title || !link) continue;
    if (/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) continue;
    out.push({
      title,
      link,
      source,
      published: tag(b, "pubDate"),
      region,
      category: classifyViral(title),
    });
  }
  return out;
}

export function mergeViralTopics(lists: ViralTopic[][], now = Date.now(), maxAgeDays = 2, max = 40): ViralTopic[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60);
  const links = new Set<string>();
  const titles = new Set<string>();
  const out: ViralTopic[] = [];
  for (const item of lists.flat()) {
    const at = Date.parse(item.published);
    if (at && now - at > maxAgeDays * 86_400_000) continue;
    const n = norm(item.title);
    if (links.has(item.link) || titles.has(n)) continue;
    links.add(item.link);
    titles.add(n);
    out.push(item);
  }
  return out.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)).slice(0, max);
}

export function pickViralTopic(items: ViralTopic[], used: string[]): ViralTopic | null {
  const seen = new Set(used);
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const usedTitles = new Set(used.map(norm));
  const fresh = items
    .filter((i) => !seen.has(i.link) && !usedTitles.has(norm(i.title)))
    .sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  return fresh[0] ?? null;
}

export function pickViralTopicBatch(items: ViralTopic[], used: string[], n = 8): ViralTopic[] {
  const out: ViralTopic[] = [];
  const usedNow = [...used];
  for (let i = 0; i < n; i++) {
    const p = pickViralTopic(items, usedNow);
    if (!p) break;
    out.push(p);
    usedNow.push(p.link);
  }
  return out;
}

export function extractTopicLabel(title: string, maxLen = 28): string {
  const t = title.trim();
  if (!t) return "TRENDING";
  const head = t.split(/[:\-–—|]/)[0]?.trim() || t;
  const words = head.replace(/\s+/g, " ").split(" ").slice(0, 4).join(" ");
  return words.slice(0, maxLen).toUpperCase() || "TRENDING";
}

export const VIRAL_HASHTAGS = [
  "#Shorts",
  "#Trending",
  "#Viral",
  "#BreakingNews",
  "#IndiaNews",
  "#WorldNews",
  "#NewsShorts",
  "#DailyNews",
  "#TrendingNow",
  "#ViralNews",
];

export const VIRAL_TAGS = [
  "trending news",
  "viral news",
  "breaking news",
  "india news",
  "world news",
  "news shorts",
  "today news",
  "viral",
  "trending",
  "shorts",
  "current affairs",
  "latest news",
];

export function viralNewsTitle(opts: { topicLabel?: string; headline?: string; region?: ViralRegion; aiTitle?: string }): string {
  const label = (opts.topicLabel || "").trim();
  const head = (opts.headline || "").trim();
  const regionTag = opts.region === "world" ? "WORLD" : "INDIA";
  let base = (opts.aiTitle || "").replace(/#shorts/gi, "").replace(/\s+/g, " ").trim();
  if (!base || base.length < 40) {
    base = ["🔥", label || "Trending", regionTag, head || "What everyone is talking about", "Watch Now"].filter(Boolean).join(" | ");
  }
  if (!/🔥|🚨|📢|⚡/.test(base)) base = `🔥 ${base}`;
  base = base.replace(/\s+/g, " ").trim();
  if (base.length > 92) base = base.slice(0, 92).replace(/[\s|–—,:]+$/u, "").trimEnd();
  if (!/#shorts/i.test(base)) base = `${base} #Shorts`;
  return base.slice(0, 100);
}
