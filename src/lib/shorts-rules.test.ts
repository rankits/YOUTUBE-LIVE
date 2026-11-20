import { describe, expect, it } from "vitest";
import { ensureShortsTitle, shortTimeline, shortTitle } from "./shorts-rules";
import { intervalSlots, isProjectQuotaError, poolLeft, quotaDay, usableSlots } from "./shorts-rules";

describe("shorts rules", () => {
  it("inserts a 1 second countdown before the answer", () => {
    const t = shortTimeline(10, 0.6);
    expect(t.split).toBe(6);
    expect(t.revealTime).toBe(7);
    expect(t.total).toBeCloseTo(10 + 1 + 0.5 + 0.8);
    expect(t.fits).toBe(true);
  });
  it("rejects clips longer than 3 minutes", () => {
    expect(shortTimeline(178, 0.5).fits).toBe(false);
  });
  it("titles always carry #Shorts within 100 chars", () => {
    const long = shortTitle("x".repeat(300), "GK");
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("#Shorts")).toBe(true);
    expect(ensureShortsTitle("My quiz")).toBe("My quiz #Shorts");
    expect(ensureShortsTitle("Quiz #shorts")).toBe("Quiz #shorts");
  });
});

import { planSlots } from "./shorts-rules";
describe("planSlots", () => {
  it("spreads 10 a day from 9am to 9pm and fills a whole month", () => {
    const now = new Date(2026, 10, 13, 6, 0);
    const s = planSlots(300, 10, now);
    expect(s.length).toBe(300);
    expect(s[0]!.getHours()).toBe(9);
    expect(s[9]!.getHours()).toBe(21);
    expect(s[10]!.getDate()).toBe(14);
    expect(s[299]!.getDate()).toBe(12); // 30th day = 12 Dec
    expect(s[299]!.getMonth()).toBe(11);
  });
  it("skips slots that already passed today", () => {
    const s = planSlots(5, 5, new Date(2026, 10, 13, 16, 30));
    expect(s[0]!.getHours()).toBe(18);
    expect(s[0]!.getDate()).toBe(13);
  });
  it("continues after the last scheduled Short instead of double-booking", () => {
    const last = new Date(2026, 10, 20, 15, 0);
    const s = planSlots(3, 10, new Date(2026, 10, 13, 6, 0), last);
    expect(s[0]!.getTime()).toBeGreaterThan(last.getTime());
    expect(s[0]!.getDate()).toBe(20);
  });
});

import { buildShortMeta, revealsAnswer, SHORT_HOOK_S } from "./shorts-rules";
describe("short metadata", () => {
  const base = { question: "Bharat ka rashtriya pashu kaun hai?", options: ["Sher", "Baagh", "Haathi", "Mor"], answer: 1, topic: "General Knowledge", number: 3, language: "hinglish" };
  it("starts with the hook poster before the voice", () => {
    const t = shortTimeline(10, 0.6);
    expect(t.start).toBe(SHORT_HOOK_S);
    expect(t.total).toBeCloseTo(10 + 1 + 0.5 + SHORT_HOOK_S);
  });
  it("never uses an AI title that gives away the answer", () => {
    expect(revealsAnswer("Baagh hi hai rashtriya pashu!", "Baagh")).toBe(true);
    const m = buildShortMeta({ ...base, ai: { title: "Rashtriya pashu Baagh hai 😱" } });
    expect(m.title.toLowerCase()).not.toContain("baagh");
    expect(m.title).toContain("#Shorts");
  });
  it("keeps a good AI title and always adds #Shorts within 100 chars", () => {
    const m = buildShortMeta({ ...base, ai: { title: "99% log galat batate hain 😱 Rashtriya pashu?" } });
    expect(m.title.startsWith(m.hook)).toBe(true);
    expect(m.title).toContain("99% log galat batate hain 😱 Rashtriya pashu?");
    expect(m.title.endsWith("#Shorts")).toBe(true);
    expect(m.title.length).toBeLessThanOrEqual(100);
  });
  it("always carries trending hashtags (max 15) and tags", () => {
    const m = buildShortMeta({ ...base, ai: { hashtags: Array.from({ length: 30 }, (_, i) => `#Tag${i}`), tags: ["ssc gk"] } });
    expect(m.hashtags[0]).toBe("#Shorts");
    expect(m.hashtags).toContain("#GeneralKnowledge");
    expect(m.hashtags.length).toBeLessThanOrEqual(15);
    expect(m.tags).toContain("ssc gk");
    expect(m.tags).toContain("gk quiz");
    expect(m.description).toContain("#Shorts");
  });
  it("falls back to a hook line when the AI gives nothing", () => {
    const m = buildShortMeta({ ...base, ai: null });
    expect(m.hook.length).toBeGreaterThan(0);
    expect(m.title.endsWith("#Shorts")).toBe(true);
  });
});

describe("short title hook", () => {
  it("always opens with the viral hook", () => {
    const m = buildShortMeta({ question: "Bharat ka rashtriya pashu?", options: ["Sher", "Baagh", "Haathi", "Mor"], answer: 1, topic: "GK", number: 1, language: "hinglish", ai: { title: "Rashtriya pashu kaun? 🤔", hook: "Sirf Genius Batayega 🧠" } });
    expect(m.title).toBe("Sirf Genius Batayega 🧠 Rashtriya pashu kaun? 🤔 #Shorts");
  });
});

describe("intervalSlots", () => {
  const now = new Date("2026-11-14T06:00:00Z");
  it("spaces slots by 15 minutes", () => {
    const s = intervalSlots(3, new Date("2026-11-14T08:00:00Z"), 15, now);
    expect(s.map((d) => d.toISOString())).toEqual(["2026-11-14T08:00:00.000Z", "2026-11-14T08:15:00.000Z", "2026-11-14T08:30:00.000Z"]);
  });
  it("never starts in the past", () => {
    expect(intervalSlots(1, new Date("2026-11-14T05:00:00Z"), 30, now)[0]!.toISOString()).toBe("2026-11-14T06:10:00.000Z");
  });
  it("uses Pacific date for quota day", () => {
    expect(quotaDay(new Date("2026-11-14T06:00:00Z"))).toBe("2026-11-13");
  });
});

describe("upload pool", () => {
  const pool = [
    { slot: 2, configured: true, connected: true, uploads: 0, exhausted: false },
    { slot: 1, configured: true, connected: true, uploads: 6, exhausted: false },
    { slot: 3, configured: true, connected: false, uploads: 0, exhausted: false },
    { slot: 4, configured: true, connected: true, uploads: 1, exhausted: true },
  ];
  it("uses only connected slots with quota left, in order", () => expect(usableSlots(pool)).toEqual([2]));
  it("3 fresh projects give 18 uploads", () => expect(poolLeft([1, 2, 3].map((slot) => ({ slot, configured: true, connected: true, uploads: 0, exhausted: false })))).toBe(18));
  it("project quota rotates, channel cap does not", () => {
    expect(isProjectQuotaError("The request cannot be completed because you have exceeded your quota.")).toBe(true);
    expect(isProjectQuotaError("uploadLimitExceeded")).toBe(false);
  });
});
