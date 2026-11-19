// Pure text-to-speech helpers shared by server code. Unit-tested.

/** Deepgram's /v1/speak accepts at most 2,000 characters per request. */
export const DEEPGRAM_MAX_CHARS = 2000;

/** Splits text into pieces of at most `max` chars, preferring sentence, then word boundaries. */
export function splitForTts(text: string, max = DEEPGRAM_MAX_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if ((cur + s).length <= max) {
      cur += s;
      continue;
    }
    push();
    if (s.length <= max) {
      cur = s;
      continue;
    }
    // A single very long sentence: break on words, then hard-cut.
    for (const w of s.split(" ")) {
      if ((cur + " " + w).trim().length <= max) cur = (cur + " " + w).trim();
      else {
        push();
        let rest = w;
        while (rest.length > max) {
          out.push(rest.slice(0, max));
          rest = rest.slice(max);
        }
        cur = rest;
      }
    }
  }
  push();
  return out;
}

/** Microsoft Edge voices take ~4 KB of SSML per request; 1,000 chars keeps Devanagari (3 bytes/char) safely under it. */
export const EDGE_MAX_CHARS = 1000;

/** Agent speaking speed (0.5–2) → Edge prosody rate like "+15%" / "-20%". */
export function edgeRate(speed: number): string {
  const pct = Math.round((Math.min(2, Math.max(0.5, Number(speed) || 1)) - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** Escapes text for SSML and replaces control characters the service rejects. */
export function escapeSsml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Edge MP3 is 48 kbps CBR: 6 bytes per millisecond. */
export function edgeMp3DurationMs(bytes: number): number {
  return Math.round(bytes / 6);
}
