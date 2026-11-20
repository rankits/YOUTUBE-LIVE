/** Pure rules: YouTube live URL parsing + chat/caption highlight scoring (no downloads). */

export type LiveHighlightKind =
  | "reaction"
  | "announcement"
  | "breaking"
  | "question"
  | "topic"
  | "chat_spike";

export type LiveHighlight = {
  id: string;
  kind: LiveHighlightKind;
  title: string;
  description: string;
  /** Seconds from stream start when known; else null. */
  offsetSec: number | null;
  /** Absolute ISO time of the signal. */
  at: string;
  score: number;
  source: "chat" | "caption" | "manual";
  sample?: string;
};

const KEYWORDS: { kind: LiveHighlightKind; re: RegExp; title: string }[] = [
  { kind: "breaking", re: /\b(breaking|urgent|alert|just\s+in|तोड़\s*फोड़|ब्रेकिंग)\b/i, title: "Breaking / urgent" },
  { kind: "announcement", re: /\b(announc|launch|releas|declare|official|घोषणा|लॉन्च|रिलीज)\b/i, title: "Announcement" },
  { kind: "question", re: /\b(why|how|what|kaun|kya|kyun|क्या|क्यों|कौन)\b/i, title: "Audience question" },
  { kind: "reaction", re: /\b(omg|wow|insane|goat|🔥|😮|😱|lol|wtf|दिमाग|कमाल)\b/i, title: "Strong reaction" },
  { kind: "topic", re: /\b(election|budget|match|score|goal|result|चुनाव|बजट|गोल|नतीजा)\b/i, title: "Topic spike" },
];

/** Extract a YouTube video id from common watch / live / short / youtu.be URLs. */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "live" || p === "embed" || p === "shorts" || p === "v");
      if (i >= 0 && parts[i + 1] && /^[\w-]{11}$/.test(parts[i + 1]!)) return parts[i + 1]!;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function youtubeWatchUrl(videoId: string, offsetSec?: number | null) {
  const t = offsetSec != null && offsetSec > 0 ? `&t=${Math.floor(offsetSec)}s` : "";
  return `https://www.youtube.com/watch?v=${videoId}${t}`;
}

export function offsetFromStart(publishedAt: string, actualStartTime: string | null | undefined): number | null {
  if (!actualStartTime) return null;
  const a = Date.parse(actualStartTime);
  const b = Date.parse(publishedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

/** Score one chat/caption line; returns null if not interesting enough. */
export function scoreHighlightText(text: string, at: string, offsetSec: number | null, source: LiveHighlight["source"]): LiveHighlight | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return null;
  let best: { kind: LiveHighlightKind; title: string; score: number } | null = null;
  for (const k of KEYWORDS) {
    if (!k.re.test(clean)) continue;
    const score = 40 + Math.min(40, clean.length / 4);
    if (!best || score > best.score) best = { kind: k.kind, title: k.title, score };
  }
  // Very long emphatic messages still count as discussion.
  if (!best && clean.length >= 80) best = { kind: "topic", title: "Long discussion", score: 25 };
  if (!best) return null;
  const id = `${source}-${at}-${best.kind}-${clean.slice(0, 24)}`;
  return {
    id,
    kind: best.kind,
    title: best.title,
    description: clean.slice(0, 180),
    offsetSec,
    at,
    score: Math.round(best.score),
    source,
    sample: clean.slice(0, 120),
  };
}

/** Chat velocity: many messages in a short window → spike highlight. */
export function detectChatSpike(
  messages: { at: string; text: string }[],
  actualStartTime: string | null,
  windowSec = 20,
  minCount = 8,
): LiveHighlight | null {
  if (messages.length < minCount) return null;
  const sorted = [...messages].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi++) {
    const tHi = Date.parse(sorted[hi]!.at);
    while (lo < hi && tHi - Date.parse(sorted[lo]!.at) > windowSec * 1000) lo++;
    const count = hi - lo + 1;
    if (count >= minCount) {
      const at = sorted[hi]!.at;
      const offsetSec = offsetFromStart(at, actualStartTime);
      return {
        id: `spike-${at}`,
        kind: "chat_spike",
        title: "Chat spike",
        description: `${count} messages in ~${windowSec}s — audience reacting hard.`,
        offsetSec,
        at,
        score: 55 + Math.min(30, count),
        source: "chat",
      };
    }
  }
  return null;
}

export function mergeHighlights(list: LiveHighlight[], limit = 40): LiveHighlight[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.score - a.score || Date.parse(b.at) - Date.parse(a.at))
    .filter((h) => {
      const key = `${h.kind}:${h.offsetSec ?? h.at}:${h.description.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function formatOffset(sec: number | null) {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
