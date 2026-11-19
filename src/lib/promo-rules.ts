// YouTube metadata limits, shared by server (sanitizing AI output) and UI.
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 4500;
export const TAGS_TOTAL_MAX = 500;
export const HASHTAGS_MAX = 15;

export function cleanTitle(t: string) {
  return t.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

/** Dedupes tags and keeps the list within YouTube's 500-character total. */
export function cleanTags(tags: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const raw of tags) {
    const t = raw.replace(/[<>,#]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    const cost = t.length + (t.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
    if (total + cost > TAGS_TOTAL_MAX) break;
    seen.add(k);
    out.push(t);
    total += cost;
  }
  return out;
}

/** Hashtags: "#" + letters/digits only, deduped, at most 15 (YouTube ignores all beyond 15). */
export function cleanHashtags(tags: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const body = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!body || seen.has(body.toLowerCase())) continue;
    seen.add(body.toLowerCase());
    out.push(`#${body}`);
    if (out.length >= HASHTAGS_MAX) break;
  }
  return out;
}

export function buildDescription(description: string, hashtags: string[]) {
  const tagLine = hashtags.join(" ");
  const body = description.trim().slice(0, DESCRIPTION_MAX - tagLine.length - 2);
  return tagLine ? `${body}\n\n${tagLine}` : body;
}
