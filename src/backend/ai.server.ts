// Server-only AI helpers (Lovable AI Gateway). Import dynamically from server handlers.
import { generateChatCompletion, generateSpeech, GatewayError } from "@lovable.dev/ai-gateway";
import type { AgentModelId } from "@/lib/constants";
import type { ResolvedKeys } from "./keys.server";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  refused: boolean;
};

type Usage = { prompt_tokens?: number; completion_tokens?: number } | undefined;
type Choice = { message?: { content?: unknown; refusal?: unknown } ; finish_reason?: string | null };

function extract(res: { choices?: Choice[]; usage?: Usage }): ChatResult {
  const choice = res.choices?.[0];
  const raw = choice?.message?.content;
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : "";
  return {
    text: text.trim(),
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: res.usage?.completion_tokens ?? 0,
    refused: Boolean(choice?.message?.refusal),
  };
}

export async function chat(
  model: AgentModelId,
  messages: ChatMsg[],
  opts: { maxTokens: number; temperature: number; json?: boolean; signal?: AbortSignal },
  keys?: ResolvedKeys,
): Promise<ChatResult> {
  const { chatChain, DEFAULT_PREFS } = await import("@/lib/provider-rules");
  // Groq key pool: user key(s) then app keys; on 429/401 the next key is tried before other engines.
  const groqKeys = [
    ...(keys?.own.groq ?? "").split(/[\s,]+/),
    process.env["GROQ_API_KEY"],
    process.env["GROQ_API_KEY_2"],
    process.env["GROQ_API_KEY_3"],
  ].filter((k, i, a): k is string => !!k && a.indexOf(k) === i);
  const groqKey = groqKeys[0];
  const geminiKey = keys?.own.gemini || process.env["GEMINI_API_KEY"];
  const avail = new Set<"groq" | "gemini" | "lovable">();
  if (groqKey) avail.add("groq");
  if (geminiKey) avail.add("gemini");
  if (process.env["LOVABLE_API_KEY"]) avail.add("lovable");
  const chain = chatChain(keys?.prefs ?? DEFAULT_PREFS, avail);
  let lastErr: unknown;
  for (const engine of chain) {
    try {
      if (engine === "groq") {
        let groqErr: unknown;
        for (const k of groqKeys) {
          try {
            return await chatGroq(k, messages, opts);
          } catch (e) {
            if (opts.signal?.aborted) throw e;
            groqErr = e;
            const msg = String((e as Error)?.message ?? e);
            if (!/rate limit|invalid/i.test(msg)) break;
            console.error("groq key exhausted, rotating to next key");
          }
        }
        throw groqErr;
      }
      if (engine === "gemini") return await chatGemini(geminiKey!, messages, opts);
      return await chatLovable(model, messages, opts);
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.error(`chat engine ${engine} failed, trying next`, e);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No AI provider is available.");
}

async function chatGemini(key: string, messages: ChatMsg[], opts: { maxTokens: number; temperature: number; json?: boolean; signal?: AbortSignal }): Promise<ChatResult> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env["GEMINI_CHAT_MODEL"] || "gemini-2.5-flash",
      messages,
      max_tokens: Math.min(opts.maxTokens, 8000),
      temperature: opts.temperature,
      reasoning_effort: "none",
      response_format: opts.json ? { type: "json_object" } : { type: "text" },
    }),
    signal: opts.signal ?? AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return extract(await res.json());
}

async function chatGroq(groqKey: string, messages: ChatMsg[], opts: { maxTokens: number; temperature: number; json?: boolean; signal?: AbortSignal }): Promise<ChatResult> {
  const response_format = opts.json ? { type: "json_object" as const } : { type: "text" as const };
    // Own Groq key: every agent runs on Groq (fast, no workspace credits).
    const groqCall = (format: typeof response_format) =>
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env["GROQ_MODEL"] || "openai/gpt-oss-120b",
          reasoning_effort: "low",
          messages,
          max_tokens: Math.min(opts.maxTokens, 8000),
          temperature: opts.temperature,
          response_format: format,
        }),
        signal: opts.signal ?? null,
      });
    let res = await groqCall(response_format);
    if (res.status === 400 && opts.json) {
      // Groq's strict JSON check rejects answers with raw newlines in code. Salvage the draft, else retry as plain text.
      const body = await res.text();
      let failed: string | undefined;
      try {
        failed = (JSON.parse(body) as { error?: { code?: string; failed_generation?: string } }).error?.failed_generation;
      } catch {
        /* not JSON */
      }
      if (failed && /"speech"\s*:/.test(failed)) {
        await recordGroqSafe(res.headers, 0);
        return { text: failed, promptTokens: 0, completionTokens: 0, refused: false };
      }
      await recordGroqSafe(res.headers, 0);
      res = await groqCall({ type: "text" });
    }
    if (!res.ok) {
      const body = await res.text();
      await recordGroqSafe(res.headers, 0, body);
      if (res.status === 429) throw new Error("Groq rate limit reached. Wait a moment, then retry.");
      if (res.status === 401) throw new Error("Groq key is invalid. Update GROQ_API_KEY.");
      throw new Error(`Groq request failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const out = extract(await res.json());
    await recordGroqSafe(res.headers, out.promptTokens + out.completionTokens);
    return out;
}

async function chatLovable(model: AgentModelId, messages: ChatMsg[], opts: { maxTokens: number; temperature: number; json?: boolean; signal?: AbortSignal }): Promise<ChatResult> {
  const response_format = opts.json ? { type: "json_object" as const } : { type: "text" as const };
  const call = opts.signal ? { signal: opts.signal } : {};
  switch (model) {
    case "openai/gpt-6-astra":
      return extract(
        await generateChatCompletion(
          { model, messages, max_completion_tokens: opts.maxTokens, reasoning_effort: "low", response_format },
          call,
        ),
      );
    case "openai/gpt-6.1-terra":
      return extract(
        await generateChatCompletion(
          { model, messages, max_completion_tokens: opts.maxTokens, temperature: opts.temperature, response_format },
          call,
        ),
      );
    case "google/gemini-3.8-flash":
      return extract(
        await generateChatCompletion(
          // No hidden thinking: answers start in ~2s instead of ~9s.
          { model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, reasoning_effort: "none", response_format },
          call,
        ),
      );
    case "google/gemini-4-argon":
      return extract(
        await generateChatCompletion(
          { model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, response_format },
          call,
        ),
      );
    case "google/gemini-3.1-pro-preview":
      return extract(
        await generateChatCompletion(
          { model, messages, max_tokens: opts.maxTokens, temperature: opts.temperature, response_format },
          call,
        ),
      );
    default: {
      const never: never = model;
      throw new Error(`Unsupported model ${String(never)}`);
    }
  }
}

/** Built-in TTS. Returns WAV bytes. */
export async function speakLovable(text: string, voice: string, language: string, opts?: { gatewayOnly?: boolean }): Promise<{ bytes: Uint8Array; contentType: string }> {
  const style =
    language === "hindi"
      ? "Speak naturally in Hindi, like a podcast conversation:"
      : language === "hinglish"
        ? "Speak naturally in Hinglish (mix of Hindi and English), like a podcast conversation:"
        : "Speak naturally, like a podcast conversation:";
  const prompt = `${style}\n${text}`;
  if (process.env["GEMINI_API_KEY"] && !opts?.gatewayOnly) return speakGoogle(prompt, voice);
  const res = await generateSpeech({
    model: "google/gemini-3.1-flash-tts-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  const blob = await res.blob();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: res.contentType || "audio/wav" };
}

/** True when voices run on the user's own Google AI Studio key (no workspace credits). */
export function usesOwnGoogleVoice() {
  return Boolean(process.env["GEMINI_API_KEY"]);
}

/** Same Gemini TTS model and voices, called directly with the user's Google AI Studio key. Returns WAV bytes. */
/** Gemini voice key pool: user keys (comma-separated) then GEMINI_API_KEY, _2, _3. Free quota is per Google account, so a 429 rotates to the next key. */
export function geminiKeyPool(userKey?: string): string[] {
  return [
    ...(userKey ? userKey.split(",").map((k) => k.trim()) : []),
    process.env["GEMINI_API_KEY"],
    process.env["GEMINI_API_KEY_2"],
    process.env["GEMINI_API_KEY_3"],
  ].filter((k, i, a): k is string => !!k && a.indexOf(k) === i);
}

export async function speakGoogle(prompt: string, voice: string, apiKey?: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const pool = geminiKeyPool(apiKey);
  let lastErr: unknown;
  for (const key of pool) {
    try {
      return await speakGoogleOnce(prompt, voice, key);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : "";
      if (!/limit is used up|invalid|can't use voice/i.test(msg)) throw e;
    }
  }
  throw lastErr ?? new Error("No Google AI Studio key configured.");
}

async function speakGoogleOnce(prompt: string, voice: string, apiKey: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const model = process.env["GEMINI_TTS_MODEL"] || "gemini-3.1-flash-tts-preview";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text();
    await recordVoiceSafe(false, { chars: prompt.length, errorBody: body });
    if (res.status === 429) throw new Error("Your free Google voice limit is used up for now. Wait a bit (or until tomorrow), then retry.");
    if (res.status === 400 && /API key not valid/i.test(body)) throw new Error("Google API key is invalid. Update GEMINI_API_KEY.");
    if (res.status === 403) throw new Error("Your Google key can't use voice generation. Check the key in Google AI Studio.");
    throw new Error(`Google voice request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new Error("Google returned no audio for this turn. Retry the turn.");
  const pcm = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
  const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? "")?.[1] ?? 24000);
  const wav = part.mimeType?.includes("wav") ? pcm : pcmToWav(pcm, rate);
  await recordVoiceSafe(true, { chars: prompt.length, audioMs: wavDurationMs(wav) ?? 0 });
  return { bytes: wav, contentType: "audio/wav" };
}

async function recordGroqSafe(headers: Headers, tokens: number, errorBody?: string) {
  try {
    const { recordGroq } = await import("./quota.server");
    await recordGroq(headers, tokens, errorBody);
  } catch (e) {
    console.error("groq quota record failed", e);
  }
}

async function recordVoiceSafe(ok: boolean, info: { chars: number; audioMs?: number; errorBody?: string }) {
  try {
    const { recordGoogleVoice } = await import("./quota.server");
    await recordGoogleVoice(ok, info);
  } catch (e) {
    console.error("voice quota record failed", e);
  }
}

/** Wraps 16-bit mono PCM in a WAV header. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Deepgram Aura-2 TTS through the connector gateway (user's own Deepgram credits). Returns WAV bytes. */
export async function speakDeepgram(text: string, voice: string, ownKey?: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const dgKey = process.env["UDC_DEEPGRAM_API_KEY"];
  if (!ownKey && (!lovableKey || !dgKey)) throw new Error("Deepgram is not connected. Connect it, or switch this agent to a built-in voice.");
  const { splitForTts } = await import("@/lib/tts-rules");
  const rate = 24000;
  const pieces: Uint8Array[] = [];
  for (const part of splitForTts(text)) {
    const q = `/v1/speak?model=${encodeURIComponent(voice)}&encoding=linear16&sample_rate=${rate}&container=none`;
    const url = ownKey ? `https://api.deepgram.com${q}` : `https://connector-gateway.lovable.dev/udc_deepgram${q}`;
    const res = await fetch(url, {
      method: "POST",
      headers: ownKey
        ? { Authorization: `Token ${ownKey}`, "Content-Type": "application/json" }
        : { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": dgKey!, "Content-Type": "application/json" },
      body: JSON.stringify({ text: part }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Deepgram request failed [${res.status}]: ${body}`);
      if (res.status === 402) throw new Error("Your Deepgram credits are used up. Add credits on Deepgram, then retry.");
      if (res.status === 429) throw new Error("Deepgram is rate limiting right now. Wait a moment, then retry.");
      if (res.status === 401 || res.status === 403) throw new Error("Deepgram rejected the key. Reconnect Deepgram with a valid API key.");
      throw new Error(`Deepgram request failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    pieces.push(new Uint8Array(await res.arrayBuffer()));
  }
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const pcm = new Uint8Array(total);
  let o = 0;
  for (const p of pieces) {
    pcm.set(p, o);
    o += p.length;
  }
  return { bytes: pcmToWav(pcm, rate), contentType: "audio/wav" };
}

/** ElevenLabs TTS (only when the ElevenLabs connection is linked). Returns MP3 bytes. */
export async function speakElevenLabs(text: string, voiceId: string, speed: number, ownKey?: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const key = ownKey || process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("ElevenLabs is not connected. Open Integrations to connect it or switch this agent to a built-in voice.");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, speed)) },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

/** WAV duration from header; null when not a parsable WAV. */
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || bytes[0] !== 0x52 || bytes[1] !== 0x49) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteRate = view.getUint32(28, true);
  if (!byteRate) return null;
  // find "data" chunk
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      const dataSize = Math.min(size, bytes.length - offset - 8);
      return Math.round((dataSize / byteRate) * 1000);
    }
    offset += 8 + size;
  }
  return null;
}

export function friendlyAiError(e: unknown): string {
  if (e instanceof GatewayError) {
    const name = e.constructor.name;
    if (name === "PaymentRequiredError") return "AI credits are exhausted for this workspace. Add credits, then retry.";
    if (name === "RateLimitError") return "The AI service is rate limited right now. Wait a moment, then retry.";
    if (name === "TimeoutError") return "The AI took too long to respond. Retry this turn.";
    if (name === "PermissionDeniedError") return "This AI model isn't available for your workspace. Pick another model for the agent.";
    return `AI request failed (${e.code ?? name}). Retry this turn.`;
  }
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}

export function bytesToBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function stylePrompt(text: string, language: string) {
  const style =
    language === "hindi"
      ? "Speak naturally in Hindi, like a podcast conversation:"
      : language === "hinglish"
        ? "Speak naturally in Hinglish (mix of Hindi and English), like a podcast conversation:"
        : "Speak naturally, like a podcast conversation:";
  return `${style}\n${text}`;
}

/** Extracts raw PCM + sample rate from a WAV file. */
function wavToPcm(bytes: Uint8Array): { pcm: Uint8Array; rate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rate = view.getUint32(24, true);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    if (id === "data") return { pcm: bytes.subarray(offset + 8, Math.min(bytes.length, offset + 8 + size)), rate };
    offset += 8 + size;
  }
  return { pcm: bytes.subarray(44), rate };
}

function joinWavs(wavs: Uint8Array[]): Uint8Array {
  const parts = wavs.map(wavToPcm);
  const total = parts.reduce((n, p) => n + p.pcm.length, 0);
  const pcm = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    pcm.set(p.pcm, o);
    o += p.pcm.length;
  }
  return pcmToWav(pcm, parts[0]?.rate ?? 24000);
}

const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

/** Sarvam AI Bulbul — natural Hindi / Hinglish / Indian English. */
export async function speakSarvam(text: string, speaker: string, language: string, key: string, speed = 1) {
  const { splitForTts } = await import("@/lib/tts-rules");
  const wavs: Uint8Array[] = [];
  for (const part of splitForTts(text, 1000)) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: part,
        target_language_code: language === "english" ? "en-IN" : "hi-IN",
        speaker,
        model: "bulbul:v2",
        pace: Math.min(2, Math.max(0.5, speed)),
        speech_sample_rate: 24000,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Sarvam request failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { audios?: string[] };
    for (const a of json.audios ?? []) wavs.push(b64ToBytes(a));
  }
  if (!wavs.length) throw new Error("Sarvam returned no audio.");
  return { bytes: joinWavs(wavs), contentType: "audio/wav" };
}

/** Google Cloud Text-to-Speech (Neural2) — large free monthly quota. */
export async function speakGoogleCloud(text: string, voiceName: string, key: string, speed = 1) {
  const { splitForTts } = await import("@/lib/tts-rules");
  const languageCode = voiceName.split("-").slice(0, 2).join("-");
  const wavs: Uint8Array[] = [];
  for (const part of splitForTts(text, 1400)) {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: part },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000, speakingRate: Math.min(2, Math.max(0.5, speed)) },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Google Cloud voice failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { audioContent?: string };
    if (json.audioContent) wavs.push(b64ToBytes(json.audioContent));
  }
  if (!wavs.length) throw new Error("Google Cloud returned no audio.");
  return { bytes: joinWavs(wavs), contentType: "audio/wav" };
}

export type SpokenAudio = { bytes: Uint8Array; contentType: string; engine: string; voice: string; ownKey: boolean; fellBack: boolean };

/** Speaks with the preferred engine, silently falling back to the next one on any failure. */
export async function speakWithFallback(
  text: string,
  agent: { voice_provider: string; voice_id: string; speaking_speed: number | string },
  language: string,
  keys?: ResolvedKeys,
): Promise<SpokenAudio> {
  const rules = await import("@/lib/provider-rules");
  const { voicesFor } = await import("@/lib/constants");
  const own = keys?.own ?? {};
  const env = process.env;
  const lang = (["english", "hindi", "hinglish"].includes(language) ? language : "english") as "english" | "hindi" | "hinglish";
  const avail = new Set<import("@/lib/provider-rules").VoiceEngine>(["edge"]); // free, no key
  if (own.deepgram || (env["UDC_DEEPGRAM_API_KEY"] && env["LOVABLE_API_KEY"])) avail.add("deepgram");
  if (own.sarvam || env["SARVAM_API_KEY"]) avail.add("sarvam");
  if (own.gemini || env["GEMINI_API_KEY"]) avail.add("gemini");
  if (own.googleCloud || env["GOOGLE_CLOUD_TTS_KEY"]) avail.add("google_cloud");
  if (own.elevenlabs || env["ELEVENLABS_API_KEY"]) avail.add("elevenlabs");
  if (env["LOVABLE_API_KEY"]) avail.add("lovable");
  const chain = rules.voiceChain(lang, agent.voice_provider, keys?.prefs ?? rules.DEFAULT_PREFS, avail);
  const agentEng = rules.agentEngine(agent.voice_provider);
  const label = voicesFor(agent.voice_provider as import("@/lib/constants").VoiceProvider).find((v) => v.id === agent.voice_id)?.label;
  const gender = rules.voiceGender(label);
  const speed = Number(agent.speaking_speed) || 1;
  const errors: string[] = [];
  for (const [i, engine] of chain.entries()) {
    const sameFamily = engine === agentEng || (agentEng === "gemini" && engine === "lovable");
    const voice = sameFamily ? agent.voice_id : rules.fallbackVoice(engine, gender, lang);
    try {
      let out: { bytes: Uint8Array; contentType: string };
      let ownKey = true;
      switch (engine) {
        case "edge": {
          const { speakEdge } = await import("./edge-tts.server");
          out = await speakEdge(text, rules.edgeVoiceForShow(voice, gender, lang), speed);
          ownKey = false;
          break;
        }
        case "deepgram":
          out = await speakDeepgram(text, voice, own.deepgram);
          break;
        case "sarvam":
          out = await speakSarvam(text, voice, lang, (own.sarvam || env["SARVAM_API_KEY"])!, speed);
          break;
        case "google_cloud":
        {
          const { recordGoogleCloudTts } = await import("./quota.server");
          try {
            out = await speakGoogleCloud(text, voice, (own.googleCloud || env["GOOGLE_CLOUD_TTS_KEY"])!, speed);
            await recordGoogleCloudTts(true, { chars: text.length });
          } catch (err) {
            await recordGoogleCloudTts(false, { chars: 0, errorBody: err instanceof Error ? err.message : String(err) });
            throw err;
          }
          break;
        }
        case "elevenlabs":
          out = await speakElevenLabs(text, voice, speed, own.elevenlabs);
          break;
        case "gemini":
          out = await speakGoogle(stylePrompt(text, lang), voice, own.gemini);
          break;
        default:
          out = await speakLovable(text, voice, lang, { gatewayOnly: true });
          ownKey = false;
      }
      return { ...out, engine, voice, ownKey, fellBack: i > 0 };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`voice engine ${engine} failed, trying next`, msg);
      errors.push(`${engine}: ${msg}`);
    }
  }
  throw new Error(errors.length > 1 ? `All voice providers failed. ${errors.join(" | ")}`.slice(0, 600) : (errors[0] ?? "No voice provider available."));
}
