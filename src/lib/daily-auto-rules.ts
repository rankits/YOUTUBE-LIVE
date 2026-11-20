/** Client-side daily Job/Viral/MCQ automation prefs (tab must stay open to render Shorts). */

export const DAILY_AUTO_KEY = "daily-auto-prefs-v1";

export type DailyAutoKind = "job" | "viral" | "mcq";

export type DailyAutoPrefs = {
  jobEnabled: boolean;
  viralEnabled: boolean;
  mcqEnabled: boolean;
  /** Local wall-clock "HH:mm" (24h). */
  timeLocal: string;
  jobCount: number;
  viralCount: number;
  mcqCount: number;
  /** Calendar day yyyy-mm-dd in local time when that pipeline last ran. */
  lastJobRunDay: string | null;
  lastViralRunDay: string | null;
  lastMcqRunDay: string | null;
};

export const DEFAULT_DAILY_AUTO: DailyAutoPrefs = {
  jobEnabled: false,
  viralEnabled: false,
  mcqEnabled: false,
  timeLocal: "09:00",
  jobCount: 8,
  viralCount: 8,
  mcqCount: 10,
  lastJobRunDay: null,
  lastViralRunDay: null,
  lastMcqRunDay: null,
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

export function clampDailyCount(n: unknown, max = 8) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return Math.min(max, 8);
  return Math.min(max, Math.max(1, Math.floor(x)));
}

export function countMaxForKind(kind: DailyAutoKind) {
  return kind === "mcq" ? 24 : 8;
}

export function readDailyAutoPrefs(): DailyAutoPrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_DAILY_AUTO };
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_AUTO_KEY) ?? "{}") as Partial<DailyAutoPrefs>;
    return {
      jobEnabled: !!raw.jobEnabled,
      viralEnabled: !!raw.viralEnabled,
      mcqEnabled: !!raw.mcqEnabled,
      timeLocal: parseTimeLocal(raw.timeLocal ?? "") ? (raw.timeLocal as string) : DEFAULT_DAILY_AUTO.timeLocal,
      jobCount: clampDailyCount(raw.jobCount ?? 8, 8),
      viralCount: clampDailyCount(raw.viralCount ?? 8, 8),
      mcqCount: clampDailyCount(raw.mcqCount ?? 10, 24),
      lastJobRunDay: typeof raw.lastJobRunDay === "string" ? raw.lastJobRunDay : null,
      lastViralRunDay: typeof raw.lastViralRunDay === "string" ? raw.lastViralRunDay : null,
      lastMcqRunDay: typeof raw.lastMcqRunDay === "string" ? raw.lastMcqRunDay : null,
    };
  } catch {
    return { ...DEFAULT_DAILY_AUTO };
  }
}

export function writeDailyAutoPrefs(prefs: DailyAutoPrefs) {
  localStorage.setItem(DAILY_AUTO_KEY, JSON.stringify(prefs));
}

function enabledFor(prefs: DailyAutoPrefs, kind: DailyAutoKind) {
  if (kind === "job") return prefs.jobEnabled;
  if (kind === "viral") return prefs.viralEnabled;
  return prefs.mcqEnabled;
}

function lastRunFor(prefs: DailyAutoPrefs, kind: DailyAutoKind) {
  if (kind === "job") return prefs.lastJobRunDay;
  if (kind === "viral") return prefs.lastViralRunDay;
  return prefs.lastMcqRunDay;
}

export function countForKind(prefs: DailyAutoPrefs, kind: DailyAutoKind) {
  if (kind === "job") return prefs.jobCount;
  if (kind === "viral") return prefs.viralCount;
  return prefs.mcqCount;
}

/** True when local clock has reached today's scheduled time and this pipeline hasn't run today. */
export function shouldRunDailyAuto(prefs: DailyAutoPrefs, kind: DailyAutoKind, now = new Date()): boolean {
  if (!enabledFor(prefs, kind)) return false;
  const t = parseTimeLocal(prefs.timeLocal);
  if (!t) return false;
  const day = localDayKey(now);
  if (lastRunFor(prefs, kind) === day) return false;
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const minsDue = t.h * 60 + t.m;
  return minsNow >= minsDue;
}

export function markDailyAutoRan(prefs: DailyAutoPrefs, kind: DailyAutoKind, day = localDayKey()): DailyAutoPrefs {
  if (kind === "job") return { ...prefs, lastJobRunDay: day };
  if (kind === "viral") return { ...prefs, lastViralRunDay: day };
  return { ...prefs, lastMcqRunDay: day };
}

export function withEnabled(prefs: DailyAutoPrefs, kind: DailyAutoKind, enabled: boolean): DailyAutoPrefs {
  if (kind === "job") return { ...prefs, jobEnabled: enabled };
  if (kind === "viral") return { ...prefs, viralEnabled: enabled };
  return { ...prefs, mcqEnabled: enabled };
}

export function withCount(prefs: DailyAutoPrefs, kind: DailyAutoKind, count: number): DailyAutoPrefs {
  const n = clampDailyCount(count, countMaxForKind(kind));
  if (kind === "job") return { ...prefs, jobCount: n };
  if (kind === "viral") return { ...prefs, viralCount: n };
  return { ...prefs, mcqCount: n };
}

export function kindLabel(kind: DailyAutoKind) {
  if (kind === "job") return "Job Alerts";
  if (kind === "viral") return "Viral Topics";
  return "MCQ Shorts";
}
