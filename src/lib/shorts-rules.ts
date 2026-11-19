import { cleanHashtags, cleanTags } from "./promo-rules";
// YouTube Shorts rules (pure, tested): clip timeline and upload metadata.
export const SHORT_PAUSE_S = 2;
export const SHORT_TAIL_S = 1.5;
export const SHORT_MAX_S = 180;
/** Seconds the bold hook poster stays on screen before the voice starts (it is also the feed thumbnail frame). */
export const SHORT_HOOK_S = 1.2;

/** Hook poster first, then question audio, a silent countdown, then the answer audio. split/revealTime count from the end of the hook. */
export function shortTimeline(audioSeconds: number, revealAt: number) {
  const split = Math.max(0, Math.min(1, revealAt)) * audioSeconds;
  const revealTime = split + SHORT_PAUSE_S;
  const total = SHORT_HOOK_S + audioSeconds + SHORT_PAUSE_S + SHORT_TAIL_S;
  return { start: SHORT_HOOK_S, split, revealTime, total, fits: total <= SHORT_MAX_S };
}

const TAGS = ["#Shorts", "#Quiz", "#MCQ"];

/** Title ≤100 chars that always contains #Shorts so YouTube files it as a Short. */
export function shortTitle(question: string, topic: string) {
  const suffix = " #Shorts";
  const base = (question || topic).replace(/\s+/g, " ").trim();
  const room = 100 - suffix.length;
  const cut = base.length > room ? base.slice(0, room - 1).trimEnd() + "…" : base;
  return cut + suffix;
}

export function ensureShortsTitle(title: string) {
  const t = title.replace(/\s+/g, " ").trim();
  if (/#shorts/i.test(t)) return t.slice(0, 100);
  return (t.slice(0, 92).trimEnd() + " #Shorts").slice(0, 100);
}

export function shortDescription(question: string, topic: string) {
  return [`Can you answer this? 🤔`, question, "", `Topic: ${topic}`, "Comment your answer before the reveal!", "", TAGS.join(" ")].join("\n").slice(0, 5000);
}

/** Most Shorts a plan may publish per day, and longest plan in days. */
export const MAX_SHORTS_PER_DAY = 24;
export const MAX_PLAN_DAYS = 31;
/** YouTube's own upload limit for API uploads (separate bucket since June 2026); scheduled and instant uploads count the same. */
export const API_UPLOADS_PER_DAY = 100;
/** Most instant public uploads in one click. */
export const MAX_INSTANT = 50;

/**
 * Next `count` publish times following a daily pattern of `perDay` slots spread from startHour to endHour (local time).
 * The first slot is the earliest pattern slot after both now+15 min and `after` (the last already-scheduled Short),
 * so clicking again continues the plan instead of double-booking.
 */
export function planSlots(count: number, perDay: number, now: Date, after?: Date | null, startHour = 9, endHour = 21): Date[] {
  const n = Math.max(1, Math.min(MAX_SHORTS_PER_DAY, Math.floor(perDay)));
  const total = Math.max(0, Math.min(MAX_SHORTS_PER_DAY * MAX_PLAN_DAYS, Math.floor(count)));
  const gap = n === 1 ? 0 : ((endHour - startHour) * 60) / (n - 1);
  const floor = Math.max(now.getTime() + 15 * 60_000, after ? after.getTime() + 60_000 : 0);
  const day = new Date(Math.max(now.getTime(), after?.getTime() ?? 0));
  day.setHours(0, 0, 0, 0);
  const out: Date[] = [];
  for (let guard = 0; out.length < total && guard < MAX_PLAN_DAYS * 3; guard++) {
    for (let i = 0; i < n && out.length < total; i++) {
      const d = new Date(day);
      d.setMinutes(Math.round(startHour * 60 + gap * i));
      if (d.getTime() >= floor) out.push(d);
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

const HOOKS: Record<string, string[]> = {
  hindi: ["99% लोग गलत हैं! 😱", "सिर्फ जीनियस बताएगा 🧠", "क्या आप जानते हैं? 🤔", "3 सेकंड चैलेंज ⏱️", "परीक्षा में आ चुका है! 📚"],
  hinglish: ["99% Log Galat Hain! 😱", "Sirf Genius Batayega 🧠", "Kya Aap Jaante Ho? 🤔", "3 Second Challenge ⏱️", "Exam Me Aa Chuka Hai! 📚"],
  english: ["99% Get This Wrong! 😱", "Only Geniuses Know 🧠", "Do You Know This? 🤔", "3 Second Challenge ⏱️", "Asked In Exams! 📚"],
};
const FOOTERS: Record<string, string> = { hindi: "जवाब अंत में 👀", hinglish: "Answer end me 👀", english: "Answer at the end 👀" };

/** Fallback hook line for the first frame when the AI gives none; rotates by question number. */
export function hookText(number: number, language: string) {
  const list = HOOKS[language] ?? HOOKS["english"]!;
  return list[Math.abs(Math.floor(number)) % list.length]!;
}
export function hookFooter(language: string) {
  return FOOTERS[language] ?? FOOTERS["english"]!;
}

/** Always-on trending hashtags/tags for quiz Shorts; AI suggestions are added after these. */
export const BASE_HASHTAGS = ["#Shorts", "#Quiz", "#GK", "#GKQuiz", "#Viral", "#Trending", "#ShortsFeed", "#YouTubeShorts"];
export const BASE_TAGS = ["shorts", "quiz", "gk quiz", "mcq", "general knowledge", "competitive exams", "daily quiz", "viral shorts", "trending quiz"];

/** True when a title gives away the correct option (so viewers have no reason to watch). */
export function revealsAnswer(title: string, answer: string) {
  const a = answer.trim().toLowerCase();
  return a.length >= 3 && title.toLowerCase().includes(a);
}

export type ShortMetaInput = {
  question: string;
  options: string[];
  answer: number;
  topic: string;
  number: number;
  language: string;
  ai?: { title?: unknown; hook?: unknown; tags?: unknown; hashtags?: unknown } | null;
};

/** Viral title (with #Shorts, never revealing the answer), description, tags and hashtags for one quiz Short. */
export function buildShortMeta(i: ShortMetaInput) {
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim() : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const correct = i.options[i.answer] ?? "";
  const aiTitle = str(i.ai?.title).replace(/#shorts/gi, "").trim();
  const hook = (str(i.ai?.hook) && !revealsAnswer(str(i.ai?.hook), correct) ? str(i.ai?.hook) : hookText(i.number, i.language)).slice(0, 40);
  // The title always opens with the viral hook (unless the AI title already does).
  const body = aiTitle && !revealsAnswer(aiTitle, correct) ? aiTitle : i.question;
  const title = ensureShortsTitle(body.toLowerCase().startsWith(hook.toLowerCase()) ? body : `${hook} ${body}`);
  const topicTag = i.topic.replace(/[^\p{L}\p{N}]/gu, "");
  const hashtags = cleanHashtags([...BASE_HASHTAGS.slice(0, 3), ...(topicTag ? [`#${topicTag}`] : []), ...arr(i.ai?.hashtags), ...BASE_HASHTAGS.slice(3)]);
  const tags = cleanTags([...arr(i.ai?.tags), i.topic, ...BASE_TAGS]);
  const letters = ["A", "B", "C", "D"];
  const description = [
    hook,
    "",
    i.question,
    ...i.options.map((o, k) => `${letters[k]}) ${o}`),
    "",
    "Comment your answer 👇 Answer video ke end me!",
    "Daily quiz ke liye Subscribe karein 🔔",
    "",
    `Topic: ${i.topic}`,
    "",
    hashtags.join(" "),
  ].join("\n").slice(0, 4900);
  return { title, hook, description, tags, hashtags };
}

/** Upload slots starting at an exact time, one every `minutes` (15 = quarter-hour, 30 = half-hour). Never earlier than now + 10 min, since YouTube rejects near-past publishAt. */
export function intervalSlots(count: number, start: Date, minutes: number, now: Date = new Date()): Date[] {
  const n = Math.max(0, Math.min(MAX_SHORTS_PER_DAY * MAX_PLAN_DAYS, Math.floor(count)));
  const gap = Math.max(5, Math.floor(minutes)) * 60_000;
  const first = Math.max(start.getTime(), now.getTime() + 10 * 60_000);
  return Array.from({ length: n }, (_, i) => new Date(first + i * gap));
}

/** YouTube Data API: 10,000 units/day per Google project, one upload costs 1,600 → 6 uploads. */
export const UPLOADS_PER_PROJECT = 6;
/** Quota resets at midnight Pacific time; this key identifies "today" for the tracker. */
export function quotaDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
}

export type PoolSlot = { slot: number; configured: boolean; connected: boolean; uploads: number; exhausted: boolean };
/** Slots that can still upload today, in order. A slot is skipped once YouTube says its quota is used or it hit ~6 uploads. */
export function usableSlots(pool: PoolSlot[]): number[] {
  return pool.filter((p) => p.configured && p.connected && !p.exhausted && p.uploads < UPLOADS_PER_PROJECT).sort((a, b) => a.slot - b.slot).map((p) => p.slot);
}
/** Uploads left today across the whole pool. */
export function poolLeft(pool: PoolSlot[]): number {
  return pool.filter((p) => p.configured && p.connected && !p.exhausted).reduce((n, p) => n + Math.max(0, UPLOADS_PER_PROJECT - p.uploads), 0);
}
/** API project quota ran out (try next project) vs the channel's own daily upload cap (stop everything). */
export function isProjectQuotaError(msg: string): boolean {
  return /quotaExceeded|exceeded your quota|quota/i.test(msg) && !/uploadLimitExceeded|exceeded the number of videos/i.test(msg);
}
