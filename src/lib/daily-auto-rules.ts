/** Client-side daily Job/Viral automation prefs (tab must stay open to render Shorts). */

export const DAILY_AUTO_KEY = "daily-auto-prefs-v1";

export type DailyAutoPrefs = {
  jobEnabled: boolean;
  viralEnabled: boolean;
  /** Local wall-clock "HH:mm" (24h). */
  timeLocal: string;
  jobCount: number;
  viralCount: number;
  /** Calendar day yyyy-mm-dd in local time when Job batch last ran. */
  lastJobRunDay: string | null;
  lastViralRunDay: string | null;
};

export const DEFAULT_DAILY_AUTO: DailyAutoPrefs = {
  jobEnabled: false,
  viralEnabled: false,
  timeLocal: "09:00",
  jobCount: 8,
  viralCount: 8,
  lastJobRunDay: null,
  lastViralRunDay: null,
};

export function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseTimeLocal(hhmm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function clampDailyCount(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 8;
  return Math.min(8, Math.max(1, Math.floor(x)));
}

export function readDailyAutoPrefs(): DailyAutoPrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_DAILY_AUTO };
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_AUTO_KEY) ?? "{}") as Partial<DailyAutoPrefs>;
    return {
      jobEnabled: !!raw.jobEnabled,
      viralEnabled: !!raw.viralEnabled,
      timeLocal: parseTimeLocal(raw.timeLocal ?? "") ? (raw.timeLocal as string) : DEFAULT_DAILY_AUTO.timeLocal,
      jobCount: clampDailyCount(raw.jobCount ?? 8),
      viralCount: clampDailyCount(raw.viralCount ?? 8),
      lastJobRunDay: typeof raw.lastJobRunDay === "string" ? raw.lastJobRunDay : null,
      lastViralRunDay: typeof raw.lastViralRunDay === "string" ? raw.lastViralRunDay : null,
    };
  } catch {
    return { ...DEFAULT_DAILY_AUTO };
  }
}

export function writeDailyAutoPrefs(prefs: DailyAutoPrefs) {
  localStorage.setItem(DAILY_AUTO_KEY, JSON.stringify(prefs));
}

/** True when local clock has reached today's scheduled time and this pipeline hasn't run today. */
export function shouldRunDailyAuto(
  prefs: DailyAutoPrefs,
  kind: "job" | "viral",
  now = new Date(),
): boolean {
  const enabled = kind === "job" ? prefs.jobEnabled : prefs.viralEnabled;
  if (!enabled) return false;
  const t = parseTimeLocal(prefs.timeLocal);
  if (!t) return false;
  const day = localDayKey(now);
  const last = kind === "job" ? prefs.lastJobRunDay : prefs.lastViralRunDay;
  if (last === day) return false;
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const minsDue = t.h * 60 + t.m;
  return minsNow >= minsDue;
}

export function markDailyAutoRan(prefs: DailyAutoPrefs, kind: "job" | "viral", day = localDayKey()): DailyAutoPrefs {
  return kind === "job" ? { ...prefs, lastJobRunDay: day } : { ...prefs, lastViralRunDay: day };
}
