import { useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clampDailyCount,
  markDailyAutoRan,
  readDailyAutoPrefs,
  shouldRunDailyAuto,
  writeDailyAutoPrefs,
  type DailyAutoPrefs,
} from "@/lib/daily-auto-rules";

type Kind = "job" | "viral";

/**
 * Keep this page/tab open. At the local time you set, runs today's Job or Viral
 * fill (browser Shorts render). One run per calendar day per pipeline.
 */
export function DailyAutoBar({
  kind,
  connected,
  locked,
  onRun,
}: {
  kind: Kind;
  connected: boolean;
  locked: boolean;
  /** Returns how many Shorts succeeded. */
  onRun: (count: number) => Promise<number>;
}) {
  const [prefs, setPrefs] = useState<DailyAutoPrefs>(() => readDailyAutoPrefs());
  const [autoRunning, setAutoRunning] = useState(false);
  const runningRef = useRef(false);

  const enabled = kind === "job" ? prefs.jobEnabled : prefs.viralEnabled;
  const count = kind === "job" ? prefs.jobCount : prefs.viralCount;
  const lastRun = kind === "job" ? prefs.lastJobRunDay : prefs.lastViralRunDay;

  const save = (next: DailyAutoPrefs) => {
    setPrefs(next);
    writeDailyAutoPrefs(next);
  };

  const run = async (fromAuto: boolean) => {
    if (runningRef.current || locked || autoRunning) return;
    if (!connected) {
      toast.error("Connect YouTube first.");
      return;
    }
    runningRef.current = true;
    setAutoRunning(true);
    try {
      const n = kind === "job" ? prefs.jobCount : prefs.viralCount;
      const ok = await onRun(clampDailyCount(n));
      const next = markDailyAutoRan(readDailyAutoPrefs(), kind);
      save(next);
      if (fromAuto) {
        toast.success(`Daily ${kind === "job" ? "Job" : "Viral"} auto: ${ok} Short(s) scheduled`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      runningRef.current = false;
      setAutoRunning(false);
    }
  };

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (locked || runningRef.current) return;
      const p = readDailyAutoPrefs();
      if (!shouldRunDailyAuto(p, kind)) return;
      void run(true);
    };
    const id = window.setInterval(tick, 30_000);
    tick();
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, connected, locked, prefs.jobEnabled, prefs.viralEnabled, prefs.timeLocal, prefs.jobCount, prefs.viralCount]);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Daily auto ({kind === "job" ? "Job Alerts" : "Viral Topics"})</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Enable</span>
          <Switch
            checked={enabled}
            onCheckedChange={(v) =>
              save(
                kind === "job"
                  ? { ...prefs, jobEnabled: v }
                  : { ...prefs, viralEnabled: v },
              )
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Keep this tab open. At the time below (your computer clock), we fill today’s slots automatically — once per day.
        Video still renders in the browser (cannot run fully on the server yet).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>Time</Label>
          <Input
            type="time"
            value={prefs.timeLocal}
            onChange={(e) => save({ ...prefs, timeLocal: e.target.value || "09:00" })}
          />
        </div>
        <div className="space-y-1">
          <Label>Shorts / day</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => {
              const n = clampDailyCount(e.target.value);
              save(kind === "job" ? { ...prefs, jobCount: n } : { ...prefs, viralCount: n });
            }}
          />
        </div>
        <div className="col-span-2 flex flex-wrap items-end gap-2">
          <Button
            variant="hero"
            className="w-full sm:w-auto"
            disabled={!connected || locked || autoRunning}
            onClick={() => void run(false)}
          >
            {autoRunning ? <Loader2 className="animate-spin" /> : <Play />} Run today now
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Last auto run: {lastRun ?? "never"} · Status: {enabled ? "armed" : "off"}
      </p>
    </div>
  );
}
