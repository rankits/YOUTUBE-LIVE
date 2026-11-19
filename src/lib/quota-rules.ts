// Free-tier quota math shared by server and UI. Pure and unit-tested.

/** Groq free plan for openai/gpt-oss-120b (requests/day and tokens/minute are also reported live in headers). */
export const GROQ_FREE = { requestsPerDay: 1000, requestsPerMinute: 30, tokensPerMinute: 8000, tokensPerDay: 200_000 };
/** Google AI Studio free tier for Gemini Flash TTS. Learned from Google's 429 details when it differs. */
export const GOOGLE_VOICE_FREE = { requestsPerDay: 10, requestsPerMinute: 3 };
/** Google Cloud TTS free tier: 4M chars/month (Standard/WaveNet), resets on the 1st (Pacific). ~800 chars ≈ 1 minute of speech. */
export const GOOGLE_CLOUD_TTS_FREE = { charsPerMonth: 4_000_000, charsPerMinute: 800 };
/** Minutes of speech left from a character budget. */
export const cloudTtsMinutesLeft = (remainingChars: number) => Math.max(0, Math.floor(remainingChars / GOOGLE_CLOUD_TTS_FREE.charsPerMinute));
/** Next 1st-of-month midnight in Pacific time. */
export function nextPacificMonthStart(now: Date): Date {
  let d = nextPacificMidnight(now);
  while (pacificDayKey(d).slice(8, 10) !== "01") d = nextPacificMidnight(new Date(d.getTime() + 3_600_000));
  return d;
}
/** Fallbacks until the user has history: one spoken turn ≈ 15 s, ≈ 2,500 tokens. */
export const DEFAULT_TURN_SECONDS = 15;
export const DEFAULT_TOKENS_PER_TURN = 2500;

const PACIFIC = "America/Los_Angeles";

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function pacificMidnight(now: Date, addDays: number): Date {
  const local = new Date(now.getTime() + tzOffsetMs(now, PACIFIC));
  const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + addDays);
  const guess = target - tzOffsetMs(now, PACIFIC);
  return new Date(target - tzOffsetMs(new Date(guess), PACIFIC));
}

/** Google's daily quotas reset at midnight Pacific time. */
export const pacificDayStart = (now: Date) => pacificMidnight(now, 0);
export const nextPacificMidnight = (now: Date) => pacificMidnight(now, 1);
/** Key for "today" in Google's quota day, e.g. "2026-11-10". */
export const pacificDayKey = (now: Date) => new Date(now.getTime() + tzOffsetMs(now, PACIFIC)).toISOString().slice(0, 10);

/** Parses Groq reset durations like "53m16.799s", "7.66s", "577ms", "1h2m3s" into ms. */
export function parseGroqDuration(v: string | null | undefined): number | null {
  if (!v) return null;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let hit = false;
  for (const [, num, unit] of v.matchAll(re)) {
    hit = true;
    const x = Number(num);
    total += unit === "h" ? x * 3_600_000 : unit === "m" ? x * 60_000 : unit === "s" ? x * 1000 : x;
  }
  return hit ? Math.round(total) : null;
}

/** Reads Google's 429 body: quota limit value, whether it is the daily quota, and retry delay. */
export function parseGoogleQuotaError(body: string): { limit: number | null; daily: boolean; retryMs: number | null } {
  let limit: number | null = null;
  let daily = false;
  let retryMs: number | null = null;
  try {
    const details = (JSON.parse(body) as { error?: { details?: Record<string, unknown>[] } }).error?.details ?? [];
    for (const d of details) {
      const violations = (d["violations"] as { quotaId?: string; quotaMetric?: string; quotaValue?: string }[] | undefined) ?? [];
      for (const v of violations) {
        const isDay = /PerDay/i.test(v.quotaId ?? "") || /per_day/i.test(v.quotaMetric ?? "");
        if (isDay) daily = true;
        if (v.quotaValue && (isDay || limit === null)) limit = Number(v.quotaValue);
      }
      if (typeof d["retryDelay"] === "string") retryMs = parseGroqDuration(d["retryDelay"] as string);
    }
  } catch {
    /* not JSON */
  }
  return { limit: Number.isFinite(limit) ? limit : null, daily, retryMs };
}

/** Reads Groq's tokens-per-day 429 message: "... tokens per day (TPD): Limit 200000, Used 199655, Requested 1200". */
export function parseGroqTpdError(body: string): { limit: number; used: number } | null {
  const m = /tokens per day[^]*?Limit (\d+), Used (\d+)/i.exec(body);
  return m ? { limit: Number(m[1]), used: Number(m[2]) } : null;
}

export type Estimate = { voiceClips: number; textTurns: number; voicedMinutes: number; textOnlyMinutes: number };

/**
 * How much more show fits in what is left. Every turn = 1 Groq request + 1 voice clip.
 * Voiced minutes are limited by both; text-only (subtitles) minutes only by Groq.
 */
export function estimateRemaining(i: {
  voiceRemaining: number;
  groqRequestsRemaining: number;
  groqTokensRemaining: number;
  tokensPerTurn: number;
  secondsPerTurn: number;
}): Estimate {
  const tokensPerTurn = Math.max(1, i.tokensPerTurn);
  const textTurns = Math.max(0, Math.min(i.groqRequestsRemaining, Math.floor(i.groqTokensRemaining / tokensPerTurn)));
  const voiceClips = Math.max(0, i.voiceRemaining);
  const toMin = (turns: number) => Math.floor((turns * i.secondsPerTurn) / 60);
  return { voiceClips, textTurns, voicedMinutes: toMin(Math.min(voiceClips, textTurns)), textOnlyMinutes: toMin(textTurns) };
}
