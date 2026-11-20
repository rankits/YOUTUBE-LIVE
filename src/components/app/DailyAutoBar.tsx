import { useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clampDailyCount,
  countForKind,
  countMaxForKind,
  kindLabel,
  markDailyAutoRan,
  readDailyAutoPrefs,
  shouldRunDailyAuto,
  withCount,
  withEnabled,
  writeDailyAutoPrefs,
  type DailyAutoKind,
  type DailyAutoPrefs,
} from "@/lib/daily-auto-rules";

/**
 * Keep this page/tab open. At the local time you set, runs today's pipeline
 * (browser Shorts render). One run per calendar day per kind.
 */
export function DailyAutoBar({
  kind,
  connected,
  locked,
  onRun,
}: {
  kind: DailyAutoKind;
  connected: boolean;
  locked: boolean;
  /** Returns how many Shorts succeeded. */
  onRun: (count: number) => Promise<number>;
}) {
  const [prefs, setPrefs] = useState<DailyAutoPrefs>(() => readDailyAutoPrefs());
  const [autoRunning, setAutoRunning] = useState(false);
  const runningRef = useRef(false);
  const max = countMaxForKind(kind);

  const enabled = kind === "job" ? prefs.jobEnabled : kind === "viral" ? prefs.viralEnabled : prefs.mcqEnabled;
  const count = countForKind(prefs, kind);
  const lastRun = kind === "job" ? prefs.lastJobRunDay : kind === "viral" ? prefs.lastViralRunDay : prefs.lastMcqRunDay;

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
      const n = clampDailyCount(countForKind(readDailyAutoPrefs(), kind), max);
      const ok = await onRun(n);
      const next = markDailyAutoRan(readDailyAutoPrefs(), kind);
      save(next);
      if (fromAuto) toast.success(`Daily ${kindLabel(kind)} auto: ${ok} Short(s) scheduled`);
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
  }, [kind, connected, locked, prefs.jobEnabled, prefs.viralEnabled, prefs.mcqEnabled, prefs.timeLocal, prefs.jobCount, prefs.viralCount, prefs.mcqCount]);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Daily auto ({kindLabel(kind)})</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Enable</span>
          <Switch checked={enabled} onCheckedChange={(v) => save(withEnabled(prefs, kind, v))} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Keep this tab open. At the time below (your computer clock), we schedule today’s Shorts once.
        Video still renders in the browser.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>Time</Label>
          <Input type="time" value={prefs.timeLocal} onChange={(e) => save({ ...prefs, timeLocal: e.target.value || "09:00" })} />
        </div>
        <div className="space-y-1">
          <Label>Shorts / day</Label>
          <Input
            type="number"
            min={1}
            max={max}
            value={count}
            onChange={(e) => save(withCount(prefs, kind, Number(e.target.value)))}
          />
        </div>
        <div className="col-span-2 flex flex-wrap items-end gap-2">
          <Button variant="hero" className="w-full sm:w-auto" disabled={!connected || locked || autoRunning} onClick={() => void run(false)}>
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
