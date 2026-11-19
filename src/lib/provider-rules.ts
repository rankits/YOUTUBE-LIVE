// Pure provider routing + fallback rules shared by server and Settings UI. Unit-tested.

export const KEY_FIELDS = ["groq", "gemini", "deepgram", "sarvam", "googleCloud", "elevenlabs"] as const;
export type KeyField = (typeof KEY_FIELDS)[number];

export type VoiceEngine = "edge" | "deepgram" | "sarvam" | "gemini" | "google_cloud" | "elevenlabs" | "lovable";
export type ChatEngine = "groq" | "gemini" | "lovable";
export type ShowLanguage = "english" | "hindi" | "hinglish";

export type ProviderPrefs = {
  chatPrimary: "auto" | ChatEngine;
  /** Voice for English shows; "agent" = the voice picked on each agent. */
  voiceEnglish: "agent" | VoiceEngine;
  /** Voice for Hindi + Hinglish shows. */
  voiceIndian: "agent" | VoiceEngine;
  fallback: boolean;
};

export const DEFAULT_PREFS: ProviderPrefs = { chatPrimary: "auto", voiceEnglish: "agent", voiceIndian: "agent", fallback: true };

const VOICE_ENGINES: VoiceEngine[] = ["edge", "deepgram", "sarvam", "gemini", "google_cloud", "elevenlabs", "lovable"];
const CHAT_ENGINES: ChatEngine[] = ["groq", "gemini", "lovable"];

export function normalizePrefs(raw: unknown): ProviderPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voice = (v: unknown) => (v === "agent" || VOICE_ENGINES.includes(v as VoiceEngine) ? (v as ProviderPrefs["voiceEnglish"]) : "agent");
  return {
    chatPrimary: r["chatPrimary"] === "auto" || CHAT_ENGINES.includes(r["chatPrimary"] as ChatEngine) ? (r["chatPrimary"] as ProviderPrefs["chatPrimary"]) : "auto",
    voiceEnglish: voice(r["voiceEnglish"]),
    voiceIndian: voice(r["voiceIndian"]),
    fallback: typeof r["fallback"] === "boolean" ? r["fallback"] : true,
  };
}

/** Maps an agent's saved voice_provider to the engine that speaks it. */
export function agentEngine(provider: string): VoiceEngine {
  if (provider === "edge" || provider === "deepgram" || provider === "elevenlabs" || provider === "sarvam" || provider === "google_cloud") return provider;
  return "gemini";
}

/**
 * Ordered voice engines to try when fallback is on.
 * Preferred backups: Built-in (lovable/gemini) → Microsoft Edge (always free) → others.
 * Example: ElevenLabs quota/error → Built-in → Microsoft.
 * Deepgram is English-only, so it is skipped for Hindi/Hinglish.
 */
export function voiceChain(lang: ShowLanguage, agentProvider: string, prefs: ProviderPrefs, available: ReadonlySet<VoiceEngine>): VoiceEngine[] {
  const indian = lang !== "english";
  const pref = indian ? prefs.voiceIndian : prefs.voiceEnglish;
  const primary = pref === "agent" ? agentEngine(agentProvider) : pref;
  const order: VoiceEngine[] = indian
    ? [primary, "lovable", "gemini", "edge", "sarvam", "google_cloud", "elevenlabs"]
    : [primary, "lovable", "gemini", "edge", "deepgram", "google_cloud", "sarvam", "elevenlabs"];
  const out: VoiceEngine[] = [];
  for (const e of order) {
    if (indian && e === "deepgram") continue;
    if (e === "gemini" && !available.has("gemini") && available.has("lovable")) {
      // Same Gemini voices through workspace credits.
      if (!out.includes("lovable")) out.push("lovable");
      continue;
    }
    if (e === "lovable" && !available.has("lovable") && available.has("gemini")) {
      if (!out.includes("gemini")) out.push("gemini");
      continue;
    }
    if (available.has(e) && !out.includes(e)) out.push(e);
  }
  // Microsoft Edge is always the last-resort free backup.
  if (prefs.fallback && available.has("edge") && !out.includes("edge")) out.push("edge");
  if (out.length === 0) return available.has("edge") ? ["edge"] : ["lovable"];
  return prefs.fallback ? out : out.slice(0, 1);
}

export function chatChain(prefs: ProviderPrefs, available: ReadonlySet<ChatEngine>): ChatEngine[] {
  const order: ChatEngine[] = prefs.chatPrimary === "auto" ? ["groq", "gemini", "lovable"] : [prefs.chatPrimary, "groq", "gemini", "lovable"];
  const out = order.filter((e, i) => available.has(e) && order.indexOf(e) === i);
  if (out.length === 0) return ["lovable"];
  return prefs.fallback ? out : out.slice(0, 1);
}

/** Gender read from a voice label ("(F)"/"(M)") or known ids; defaults to F. */
export function voiceGender(label: string | undefined): "F" | "M" {
  return label && /\(M\)|\bmale\b/i.test(label) && !/female/i.test(label) ? "M" : "F";
}

/** Voice to use on an engine that isn't the agent's own (keeps gender + language). */
export function fallbackVoice(engine: VoiceEngine, gender: "F" | "M", lang: ShowLanguage): string {
  const indian = lang !== "english";
  switch (engine) {
    case "edge":
      return indian ? (gender === "M" ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural") : gender === "M" ? "en-US-BrianMultilingualNeural" : "en-US-AvaMultilingualNeural";
    case "deepgram":
      return gender === "M" ? "aura-2-apollo-en" : "aura-2-thalia-en";
    case "sarvam":
      return gender === "M" ? "abhilash" : "anushka";
    case "google_cloud":
      return indian ? (gender === "M" ? "hi-IN-Neural2-B" : "hi-IN-Neural2-A") : gender === "M" ? "en-US-Neural2-D" : "en-US-Neural2-F";
    case "elevenlabs":
      return gender === "M" ? "JBFqnCBsd6RMkjVDRZzb" : "EXAVITQu4vr4xnSDxMaL";
    default:
      return gender === "M" ? "Puck" : "Kore";
  }
}

/** Edge voice for a show: pure-Hindi shows swap a non-Hindi, non-multilingual voice for the same-gender Hindi voice (Devanagari text). */
export function edgeVoiceForShow(voiceId: string, gender: "F" | "M", lang: ShowLanguage): string {
  if (lang !== "hindi" || voiceId.startsWith("hi-IN-") || /Multilingual/i.test(voiceId)) return voiceId;
  return gender === "M" ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural";
}
