import { describe, expect, it } from "vitest";
import { localDayKey, parseTimeLocal, shouldRunDailyAuto, type DailyAutoPrefs } from "./daily-auto-rules";

const base: DailyAutoPrefs = {
  jobEnabled: true,
  viralEnabled: false,
  mcqEnabled: true,
  timeLocal: "09:00",
  jobCount: 8,
  viralCount: 4,
  mcqCount: 10,
  lastJobRunDay: null,
  lastViralRunDay: null,
  lastMcqRunDay: null,
};

describe("daily-auto-rules", () => {
  it("parses HH:mm", () => {
    expect(parseTimeLocal("9:05")).toEqual({ h: 9, m: 5 });
    expect(parseTimeLocal("25:00")).toBeNull();
  });

  it("runs once per day after scheduled time for job and mcq", () => {
    const morning = new Date(2026, 10, 20, 9, 1);
    expect(shouldRunDailyAuto(base, "job", morning)).toBe(true);
    expect(shouldRunDailyAuto(base, "viral", morning)).toBe(false);
    expect(shouldRunDailyAuto(base, "mcq", morning)).toBe(true);
    const already = { ...base, lastMcqRunDay: localDayKey(morning) };
    expect(shouldRunDailyAuto(already, "mcq", morning)).toBe(false);
    const early = new Date(2026, 10, 20, 8, 59);
    expect(shouldRunDailyAuto(base, "job", early)).toBe(false);
  });
});
