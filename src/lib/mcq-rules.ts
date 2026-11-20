// Competitive-exam MCQ quiz rules (pure, tested): parsing a model question and
// composing the spoken script so the stage can pause, then reveal the answer.

export type McqVisual = {
  type: "mcq";
  number: number;
  question: string;
  options: [string, string, string, string];
  answer: number; // 0..3
  explanation: string;
  /** Fraction (0..1) of the spoken clip where the question ends and the answer begins. */
  revealAt: number;
};

/** Silent beat between question and answer on Shorts (keep short for retention). */
export const MCQ_PAUSE_MS = 1000;
export const LETTERS = ["A", "B", "C", "D"] as const;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validates a model's MCQ object; returns null if it is not a usable 4-option question. */
export function parseMcq(obj: unknown): Omit<McqVisual, "type" | "number" | "revealAt"> | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { question?: unknown; options?: unknown; answer?: unknown; explanation?: unknown };
  const question = clean(o.question, 400);
  const opts = Array.isArray(o.options) ? o.options.map((x) => clean(x, 120).replace(/^\(?[A-Da-d][).:-]\s*/, "")) : [];
  let answer = typeof o.answer === "number" ? o.answer : typeof o.answer === "string" ? LETTERS.indexOf(o.answer.trim().toUpperCase().charAt(0) as "A") : -1;
  if (typeof o.answer === "string" && /^\d$/.test(o.answer.trim())) answer = Number(o.answer.trim());
  if (!question || opts.length !== 4 || opts.some((x) => !x) || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  return { question, options: opts as McqVisual["options"], answer, explanation: clean(o.explanation, 400) };
}

const WORDS = {
  hindi: { think: "जल्दी सोचो!", ans: "सही जवाब" },
  hinglish: { think: "Jaldi socho!", ans: "Sahi jawab" },
  english: { think: "Quick — what's your answer?", ans: "Correct answer" },
} as const;

/**
 * Compact Shorts script (~10–15s): question + A/B/C/D labels, then answer only.
 * Options are also shown on screen immediately — no long read / no explanation.
 */
export function composeMcqSpeech(mcq: Omit<McqVisual, "type" | "revealAt">, language: string): { speech: string; revealAt: number } {
  const w = WORDS[language as keyof typeof WORDS] ?? WORDS.english;
  const opts = mcq.options.map((o, i) => `${LETTERS[i]} ${o}`).join(", ");
  const ask = `${mcq.question} ${opts}. ${w.think}`;
  const reveal = `${w.ans}: ${LETTERS[mcq.answer]}, ${mcq.options[mcq.answer]}.`;
  const speech = `${ask} ${reveal}`;
  return { speech, revealAt: +(ask.length / speech.length).toFixed(3) };
}

/** Seconds one quiz question takes on stage (ask + options + countdown + reveal). */
export const SECONDS_PER_QUESTION = 48;
export const MAX_BANK = 600;

/** How many questions a quiz show of this length needs (capped by the show's question limit). */
export function questionsNeeded(durationMinutes: number, maxQuestions?: number): number {
  const byTime = Math.ceil((durationMinutes * 60) / SECONDS_PER_QUESTION);
  const n = maxQuestions && maxQuestions > 0 ? Math.min(byTime, maxQuestions) : byTime;
  return Math.max(1, Math.min(MAX_BANK, n));
}

/** A question is kept only when an independent solver picked the same answer index. */
export function isVerified(answer: number, solved: unknown): boolean {
  const s = typeof solved === "number" ? solved : typeof solved === "string" ? LETTERS.indexOf(solved.trim().toUpperCase().charAt(0) as "A") : -1;
  return s === answer;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Drops near-duplicate questions (same normalized text) against an existing list. */
export function dedupeQuestions<T extends { question: string }>(items: T[], existing: string[]): T[] {
  const seen = new Set(existing.map(norm));
  return items.filter((q) => {
    const k = norm(q.question);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
