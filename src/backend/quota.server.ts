// Server-only: remembers free-tier quota signals from the user's own Groq / Google keys.
// Writes are best-effort and never break a turn.
import { GOOGLE_VOICE_FREE, nextPacificMidnight, pacificDayKey, parseGoogleQuotaError, parseGroqDuration, parseGroqTpdError } from "@/lib/quota-rules";

export type GroqSnapshot = {
  day?: string | undefined; // UTC day of the token counter
  tokensToday?: number | undefined;
  requestsToday?: number | undefined;
  limitRequests?: number | undefined;
  remainingRequests?: number | undefined;
  resetRequestsAt?: string | undefined;
  limitTokensMin?: number | undefined;
  remainingTokensMin?: number | undefined;
  headersAt?: string | undefined;
  tpdLimit?: number | undefined;
  lastError?: string | undefined;
  lastErrorAt?: string | undefined;
};

export type VoiceSnapshot = {
  day?: string | undefined; // Pacific day of the counter
  used?: number | undefined;
  chars?: number | undefined;
  audioMs?: number | undefined;
  limit?: number | undefined; // learned from Google or set by the user
  limitSource?: "default" | "google" | "user" | undefined;
  blockedUntil?: string | undefined;
  lastError?: string | undefined;
  lastErrorAt?: string | undefined;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readQuota<T>(provider: "groq" | "google_voice" | "google_cloud_tts"): Promise<{ snapshot: T; updatedAt: string | null }> {
  const db = await admin();
  const { data } = await db.from("provider_quota").select("snapshot, updated_at").eq("provider", provider).maybeSingle();
  return { snapshot: ((data?.snapshot as T | undefined) ?? ({} as T)), updatedAt: data?.updated_at ?? null };
}

async function writeQuota(provider: "groq" | "google_voice" | "google_cloud_tts", snapshot: object) {
  const db = await admin();
  await db.from("provider_quota").upsert({ provider, snapshot: snapshot as never, updated_at: new Date().toISOString() });
}

async function update<T extends object>(provider: "groq" | "google_voice" | "google_cloud_tts", fn: (s: T) => T) {
  try {
    const { snapshot } = await readQuota<T>(provider);
    await writeQuota(provider, fn(snapshot));
  } catch (e) {
    console.error("quota write failed", provider, e);
  }
}

/** Call after every Groq request (success or failure). */
export async function recordGroq(headers: Headers, tokens: number, errorBody?: string) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const num = (k: string) => {
    const v = headers.get(k);
    return v === null || v === "" ? undefined : Number(v);
  };
  const resetMs = parseGroqDuration(headers.get("x-ratelimit-reset-requests"));
  await update<GroqSnapshot>("groq", (s) => {
    const fresh = s.day === day ? s : { ...s, day, tokensToday: 0, requestsToday: 0 };
    const next: GroqSnapshot = {
      ...fresh,
      tokensToday: (fresh.tokensToday ?? 0) + tokens,
      requestsToday: (fresh.requestsToday ?? 0) + 1,
    };
    const limitRequests = num("x-ratelimit-limit-requests");
    if (limitRequests !== undefined) {
      next.limitRequests = limitRequests;
      next.remainingRequests = num("x-ratelimit-remaining-requests");
      next.limitTokensMin = num("x-ratelimit-limit-tokens");
      next.remainingTokensMin = num("x-ratelimit-remaining-tokens");
      next.resetRequestsAt = resetMs !== null ? new Date(now.getTime() + resetMs).toISOString() : undefined;
      next.headersAt = now.toISOString();
    }
    if (errorBody) {
      next.lastError = errorBody.slice(0, 300);
      next.lastErrorAt = now.toISOString();
      const tpd = parseGroqTpdError(errorBody);
      if (tpd) {
        next.tpdLimit = tpd.limit;
        next.tokensToday = Math.max(next.tokensToday ?? 0, tpd.used);
      }
    }
    return next;
  });
}

/** Call after every Google AI Studio voice request. */
export async function recordGoogleVoice(ok: boolean, info: { chars: number; audioMs?: number; errorBody?: string }) {
  const now = new Date();
  const day = pacificDayKey(now);
  await update<VoiceSnapshot>("google_voice", (s) => {
    const fresh: VoiceSnapshot = s.day === day ? s : { ...s, day, used: 0, chars: 0, audioMs: 0, blockedUntil: undefined };
    if (ok) {
      return { ...fresh, used: (fresh.used ?? 0) + 1, chars: (fresh.chars ?? 0) + info.chars, audioMs: (fresh.audioMs ?? 0) + (info.audioMs ?? 0) };
    }
    const next: VoiceSnapshot = { ...fresh, lastError: info.errorBody?.slice(0, 300), lastErrorAt: now.toISOString() };
    const q = parseGoogleQuotaError(info.errorBody ?? "");
    if (q.daily) {
      if (q.limit && next.limitSource !== "user") {
        next.limit = q.limit;
        next.limitSource = "google";
      }
      next.used = Math.max(next.used ?? 0, next.limit ?? q.limit ?? GOOGLE_VOICE_FREE.requestsPerDay);
      next.blockedUntil = nextPacificMidnight(now).toISOString();
    } else if (q.retryMs) {
      next.blockedUntil = new Date(now.getTime() + q.retryMs).toISOString();
    }
    return next;
  });
}

export async function setVoiceLimit(limit: number) {
  await update<VoiceSnapshot>("google_voice", (s) => ({ ...s, limit, limitSource: "user" }));
}

export type CloudTtsSnapshot = { month?: string | undefined; chars?: number | undefined; requests?: number | undefined; lastError?: string | undefined; lastErrorAt?: string | undefined };

/** Call after every Google Cloud Text-to-Speech request (characters are what Google bills). */
export async function recordGoogleCloudTts(ok: boolean, info: { chars: number; errorBody?: string }) {
  const now = new Date();
  const month = pacificDayKey(now).slice(0, 7);
  await update<CloudTtsSnapshot>("google_cloud_tts", (s) => {
    const fresh: CloudTtsSnapshot = s.month === month ? s : { ...s, month, chars: 0, requests: 0 };
    if (ok) return { ...fresh, chars: (fresh.chars ?? 0) + info.chars, requests: (fresh.requests ?? 0) + 1 };
    return { ...fresh, lastError: info.errorBody?.slice(0, 300), lastErrorAt: now.toISOString() };
  });
}
