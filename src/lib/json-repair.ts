/**
 * Best-effort repair for model JSON: escapes raw newlines/tabs inside strings
 * (common when a model puts code in a JSON string) and closes a truncated object.
 */
export function repairJson(raw: string): string {
  const s = raw.slice(Math.max(0, raw.indexOf("{")));
  let out = "";
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') {
      // Stray quote after a closed value, e.g. `"}"}}` — models often emit this. Drop it.
      const prev = out.trimEnd().slice(-1);
      const next = chars.slice(i + 1).join("").trimStart()[0];
      if ((prev === "}" || prev === "]" || prev === '"') && (next === "}" || next === "]" || next === undefined)) continue;
      inStr = true;
    } else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      out += ch;
      if (stack.length === 0) return out; // ignore trailing junk after the object
      continue;
    }
    out += ch;
  }
  if (esc) out = out.slice(0, -1);
  if (inStr) out += '"';
  out = out.replace(/[,:]\s*$/, "");
  while (stack.length) out += stack.pop();
  return out;
}

/** Parses model JSON, repairing it when strict parsing fails. Returns null when hopeless. */
export function parseModelJson<T = unknown>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { /* repair below */ }
  }
  if (start < 0) return null;
  try { return JSON.parse(repairJson(cleaned)) as T; } catch { return null; }
}
