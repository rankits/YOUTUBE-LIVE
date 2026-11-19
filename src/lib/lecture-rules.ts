/** Pure rules for solo lectures: sign-off line and code walkthrough steps. */

export type FocusStep = { from: number; to: number; note?: string };

const SIGN_OFF: Record<string, string> = {
  english: "Bye bye, see you in the next video!",
  hindi: "बाय बाय, अगले वीडियो में मिलते हैं!",
  hinglish: "Bye bye, milte hain next video mein!",
};

/** The goodbye every lecture must end with, in the show's language. */
export function signOffLine(language: string): string {
  return SIGN_OFF[language] ?? SIGN_OFF["english"]!;
}

/** Appends the sign-off when the teacher's final speech forgot to say goodbye. */
export function ensureSignOff(speech: string, language: string): string {
  const text = speech.trim();
  if (/\bbye\b|बाय|अलविदा|next video|अगले वीडियो/i.test(text)) return text;
  return `${text} ${signOffLine(language)}`.trim();
}

/** Validates model-provided focus steps against the code's line count. */
export function sanitizeFocus(raw: unknown, lineCount: number): FocusStep[] {
  if (!Array.isArray(raw) || lineCount < 1) return [];
  const out: FocusStep[] = [];
  for (const s of raw.slice(0, 8)) {
    if (!s || typeof s !== "object") continue;
    const o = s as { from?: unknown; to?: unknown; note?: unknown };
    const from = Math.round(Number(o.from));
    const to = Math.round(Number(o.to ?? o.from));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const a = Math.min(Math.max(1, Math.min(from, to)), lineCount);
    const b = Math.min(Math.max(1, Math.max(from, to)), lineCount);
    const note = typeof o.note === "string" ? o.note.replace(/[`<>{}]/g, "").trim().slice(0, 40) : "";
    out.push(note ? { from: a, to: b, note } : { from: a, to: b });
  }
  return out;
}

/** Fallback walkthrough when the model gave no steps: chunks of ~3 lines. */
export function defaultFocus(lineCount: number, chunk = 3): FocusStep[] {
  const out: FocusStep[] = [];
  for (let i = 1; i <= lineCount; i += chunk) out.push({ from: i, to: Math.min(lineCount, i + chunk - 1) });
  return out;
}

/**
 * Which step is being explained at speech progress `p` (0..1). The first 10%
 * of speech is usually an intro, so the walkthrough spans 10%..95%.
 */
export function focusIndexAt(progress: number, steps: number): number {
  if (steps <= 0) return -1;
  const p = Math.min(1, Math.max(0, (progress - 0.1) / 0.85));
  return Math.min(steps - 1, Math.floor(p * steps));
}
