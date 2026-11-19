import { describe, expect, it } from "vitest";
import { estimateRemaining, nextPacificMidnight, pacificDayKey, pacificDayStart, parseGoogleQuotaError, parseGroqDuration, parseGroqTpdError } from "./quota-rules";

describe("Google quota day (midnight Pacific)", () => {
  it("resets at 08:00 UTC in winter (PST)", () => {
    const now = new Date("2026-11-10T17:52:00Z");
    expect(nextPacificMidnight(now).toISOString()).toBe("2026-11-11T08:00:00.000Z");
    expect(pacificDayStart(now).toISOString()).toBe("2026-11-10T08:00:00.000Z");
    expect(pacificDayKey(now)).toBe("2026-11-10");
  });
  it("resets at 07:00 UTC in summer (PDT)", () => {
    expect(nextPacificMidnight(new Date("2026-07-01T12:00:00Z")).toISOString()).toBe("2026-07-02T07:00:00.000Z");
  });
  it("before 08:00 UTC it is still the previous Pacific day", () => {
    expect(pacificDayKey(new Date("2026-11-10T05:00:00Z"))).toBe("2026-11-09");
  });
});

describe("Groq reset durations", () => {
  it("parses minutes+seconds, seconds and ms", () => {
    expect(parseGroqDuration("53m16.799s")).toBe(3_196_799);
    expect(parseGroqDuration("577ms")).toBe(577);
    expect(parseGroqDuration("1h2m3s")).toBe(3_723_000);
    expect(parseGroqDuration("")).toBeNull();
  });
});

describe("quota errors", () => {
  it("reads Google's daily limit from a 429", () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_requests_per_model_per_day", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "10" }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" },
        ],
      },
    });
    expect(parseGoogleQuotaError(body)).toEqual({ limit: 10, daily: true, retryMs: 34_000 });
  });
  it("reads Groq's tokens-per-day 429", () => {
    expect(parseGroqTpdError("Rate limit reached on tokens per day (TPD): Limit 200000, Used 199655, Requested 1200.")).toEqual({ limit: 200000, used: 199655 });
    expect(parseGroqTpdError("tokens per minute (TPM): Limit 8000")).toBeNull();
  });
});

describe("remaining video estimate", () => {
  it("voiced minutes are capped by voice clips left", () => {
    const e = estimateRemaining({ voiceRemaining: 10, groqRequestsRemaining: 960, groqTokensRemaining: 200_000, tokensPerTurn: 2500, secondsPerTurn: 15 });
    expect(e.textTurns).toBe(80);
    expect(e.voicedMinutes).toBe(2);
    expect(e.textOnlyMinutes).toBe(20);
  });
  it("nothing left means zero minutes", () => {
    const e = estimateRemaining({ voiceRemaining: 0, groqRequestsRemaining: 0, groqTokensRemaining: 0, tokensPerTurn: 2500, secondsPerTurn: 15 });
    expect(e.voicedMinutes).toBe(0);
    expect(e.textOnlyMinutes).toBe(0);
  });
});

import { cloudTtsMinutesLeft as _cm, nextPacificMonthStart as _nm, GOOGLE_CLOUD_TTS_FREE as _gc } from "./quota-rules";
describe("google cloud tts quota", () => {
  it("free tier is 4M chars/month", () => expect(_gc.charsPerMonth).toBe(4_000_000));
  it("4M chars ≈ 83 hours", () => expect(_cm(4_000_000)).toBe(5000));
  it("resets on the 1st Pacific", () => expect(_nm(new Date("2026-11-11T04:00:00Z")).toISOString()).toBe("2026-12-01T08:00:00.000Z"));
});
