import { describe, expect, it } from "vitest";
import { localDayKey, parseTimeLocal, shouldRunDailyAuto, type DailyAutoPrefs } from "./daily-auto-rules";

const base: DailyAutoPrefs = {
  jobEnabled: true,
  viralEnabled: false,
  timeLocal: "09:00",
  jobCount: 8,
  viralCount: 4,
  lastJobRunDay: null,
  lastViralRunDay: null,
};

describe("daily-auto-rules", () => {
  it("parses HH:mm", () => {
    expect(parseTimeLocal("9:05")).toEqual({ h: 9, m: 5 });
    expect(parseTimeLocal("25:00")).toBeNull();
  });

  it("runs once per day after scheduled time", () => {
    const morning = new Date(2026, 10, 20, 9, 1);
    expect(shouldRunDailyAuto(base, "job", morning)).toBe(true);
    expect(shouldRunDailyAuto(base, "viral", morning)).toBe(false);
    const already = { ...base, lastJobRunDay: localDayKey(morning) };
    expect(shouldRunDailyAuto(already, "job", morning)).toBe(false);
    const early = new Date(2026, 10, 20, 8, 59);
    expect(shouldRunDailyAuto(base, "job", early)).toBe(false);
  });
});
