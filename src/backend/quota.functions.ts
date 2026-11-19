import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GOOGLE_CLOUD_TTS_FREE, cloudTtsMinutesLeft, nextPacificMonthStart, DEFAULT_TOKENS_PER_TURN, DEFAULT_TURN_SECONDS, GOOGLE_VOICE_FREE, GROQ_FREE, estimateRemaining, nextPacificMidnight, pacificDayKey } from "@/lib/quota-rules";

async function probeGroq() {
  const key = process.env["GROQ_API_KEY"];
  if (!key) return;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env["GROQ_MODEL"] || "openai/gpt-oss-120b", messages: [{ role: "user", content: "ok" }], max_tokens: 1 }),
  });
  const body = await res.text();
  let tokens = 0;
  try {
    const u = (JSON.parse(body) as { usage?: { total_tokens?: number } }).usage;
    tokens = u?.total_tokens ?? 0;
  } catch {
    /* ignore */
  }
  const { recordGroq } = await import("./quota.server");
  await recordGroq(res.headers, tokens, res.ok ? undefined : body);
}

export const getQuotaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ refresh: z.boolean().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { readQuota } = await import("./quota.server");
    type Groq = import("./quota.server").GroqSnapshot;
    type Voice = import("./quota.server").VoiceSnapshot;
    const groqConnected = Boolean(process.env["GROQ_API_KEY"]);
    const voiceConnected = Boolean(process.env["GEMINI_API_KEY"]);

    let groq = await readQuota<Groq>("groq");
    if (groqConnected && (data.refresh || !groq.snapshot.headersAt)) {
      try {
        await probeGroq();
        groq = await readQuota<Groq>("groq");
      } catch (e) {
        console.error("groq probe failed", e);
      }
    }
    const voice = await readQuota<Voice>("google_voice");
    const cloud = await readQuota<import("./quota.server").CloudTtsSnapshot>("google_cloud_tts");
    const { loadUserKeys } = await import("./keys.server");
    const ownKeys = await loadUserKeys(context.userId).catch(() => null);
    const cloudConnected = Boolean(ownKeys?.own.googleCloud || process.env["GOOGLE_CLOUD_TTS_KEY"]);

    // Typical turn size from this user's history.
    const { data: rows } = await context.supabase
      .from("usage_analytics")
      .select("kind, audio_ms, prompt_tokens, completion_tokens")
      .in("kind", ["chat", "tts"])
      .order("created_at", { ascending: false })
      .limit(300);
    const tts = (rows ?? []).filter((r) => r.kind === "tts" && r.audio_ms > 0);
    const chats = (rows ?? []).filter((r) => r.kind === "chat" && r.prompt_tokens + r.completion_tokens > 0);
    const secondsPerTurn = tts.length ? tts.reduce((s, r) => s + r.audio_ms, 0) / tts.length / 1000 + 0.5 : DEFAULT_TURN_SECONDS;
    const tokensPerTurn = chats.length ? Math.round(chats.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0) / chats.length) : DEFAULT_TOKENS_PER_TURN;

    const now = new Date();

    // Google voice (daily request quota, resets midnight Pacific).
    const v = voice.snapshot;
    const vToday = v.day === pacificDayKey(now);
    const voiceLimit = v.limit ?? GOOGLE_VOICE_FREE.requestsPerDay;
    const voiceUsed = vToday ? (v.used ?? 0) : 0;
    const voiceRemaining = Math.max(0, voiceLimit - voiceUsed);
    const blockedUntil = v.blockedUntil && new Date(v.blockedUntil) > now ? v.blockedUntil : null;

    // Groq (requests/day from live headers, tokens/day counted here).
    const g = groq.snapshot;
    const reqLimit = g.limitRequests ?? GROQ_FREE.requestsPerDay;
    const reqResetPassed = g.resetRequestsAt ? new Date(g.resetRequestsAt) <= now : true;
    const reqRemaining = g.remainingRequests === undefined || reqResetPassed ? reqLimit : g.remainingRequests;
    const utcDay = now.toISOString().slice(0, 10);
    const tokLimit = g.tpdLimit ?? GROQ_FREE.tokensPerDay;
    const tokUsed = g.day === utcDay ? (g.tokensToday ?? 0) : 0;
    const tokRemaining = Math.max(0, tokLimit - tokUsed);
    const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

    const estimate = estimateRemaining({
      voiceRemaining: voiceConnected ? voiceRemaining : 0,
      groqRequestsRemaining: reqRemaining,
      groqTokensRemaining: tokRemaining,
      tokensPerTurn,
      secondsPerTurn,
    });

    return {
      now: now.toISOString(),
      secondsPerTurn: Math.round(secondsPerTurn * 10) / 10,
      tokensPerTurn,
      fromHistory: { voice: tts.length > 0, text: chats.length > 0 },
      voice: {
        connected: voiceConnected,
        used: voiceUsed,
        limit: voiceLimit,
        limitSource: v.limitSource ?? "default",
        remaining: voiceRemaining,
        perMinute: GOOGLE_VOICE_FREE.requestsPerMinute,
        audioMsToday: vToday ? (v.audioMs ?? 0) : 0,
        resetAt: nextPacificMidnight(now).toISOString(),
        blockedUntil,
        lastError: v.lastError ?? null,
        lastErrorAt: v.lastErrorAt ?? null,
      },
      groq: {
        connected: groqConnected,
        requests: { used: reqLimit - reqRemaining, limit: reqLimit, remaining: reqRemaining, resetAt: reqResetPassed ? null : (g.resetRequestsAt ?? null) },
        tokens: { used: tokUsed, limit: tokLimit, remaining: tokRemaining, resetAt: nextUtcMidnight },
        perMinuteTokens: g.limitTokensMin ?? GROQ_FREE.tokensPerMinute,
        checkedAt: g.headersAt ?? null,
        lastError: g.lastError ?? null,
        lastErrorAt: g.lastErrorAt ?? null,
      },
      estimate,
      googleCloud: (() => {
        const month = pacificDayKey(now).slice(0, 7);
        const used = cloud.snapshot.month === month ? (cloud.snapshot.chars ?? 0) : 0;
        const remaining = Math.max(0, GOOGLE_CLOUD_TTS_FREE.charsPerMonth - used);
        return {
          connected: cloudConnected,
          used,
          limit: GOOGLE_CLOUD_TTS_FREE.charsPerMonth,
          remaining,
          requests: cloud.snapshot.month === month ? (cloud.snapshot.requests ?? 0) : 0,
          minutesLeft: cloudTtsMinutesLeft(remaining),
          resetAt: nextPacificMonthStart(now).toISOString(),
          lastError: cloud.snapshot.lastError ?? null,
        };
      })(),
    };
  });

export const setVoiceDailyLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ limit: z.number().int().min(1).max(100_000) }).parse(input))
  .handler(async ({ data }) => {
    const { setVoiceLimit } = await import("./quota.server");
    await setVoiceLimit(data.limit);
    return { ok: true };
  });
