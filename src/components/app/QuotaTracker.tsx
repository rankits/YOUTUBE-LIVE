import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Mic, Cpu, RefreshCw, Clapperboard, AlertTriangle, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { getQuotaStatus, setVoiceDailyLimit } from "@/backend/quota.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function until(iso: string | null, now: number) {
  if (!iso) return "now";
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.ceil((ms % 3_600_000) / 60_000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

function minutesLabel(min: number) {
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min} min`;
}

function Meter({ used, limit, label, unit }: { used: number; limit: number; label: string; unit: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {used.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-right", strong && "font-semibold text-foreground")}>{v}</span>
    </div>
  );
}

export function QuotaTracker() {
  const fn = useServerFn(getQuotaStatus);
  const setLimitFn = useServerFn(setVoiceDailyLimit);
  const qc = useQueryClient();
  const now = useNow();
  const { data: q, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["quota-status"],
    queryFn: () => fn({ data: {} }),
    refetchInterval: 60_000,
  });
  const refresh = useMutation({
    mutationFn: () => fn({ data: { refresh: true } }),
    onSuccess: (d) => qc.setQueryData(["quota-status"], d),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not refresh"),
  });
  const [editing, setEditing] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");
  const saveLimit = useMutation({
    mutationFn: (limit: number) => setLimitFn({ data: { limit } }),
    onSuccess: () => {
      setEditing(false);
      void refetch();
      toast.success("Daily voice limit updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (isLoading || !q) {
    return <div className="h-48 animate-pulse rounded-2xl border bg-card" />;
  }

  const v = q.voice;
  const g = q.groq;
  const e = q.estimate;
  const voiceMinutes = Math.floor((e.voiceClips * q.secondsPerTurn) / 60);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Free usage left today</h2>
          <p className="text-sm text-muted-foreground">Your own Google voice and Groq keys — what's used, what's left, and when it resets.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending || isFetching}>
          <RefreshCw className={cn("h-4 w-4", (refresh.isPending || isFetching) && "animate-spin")} /> Check now
        </Button>
      </div>

      <div className="rounded-2xl border border-primary/30 bg-accent/40 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Video you can still make with voice</div>
              <div className="font-display text-3xl font-semibold">≈ {minutesLabel(e.voicedMinutes)}</div>
              <div className="text-xs text-muted-foreground">{Math.min(e.voiceClips, e.textTurns)} more spoken turns</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Without voice (subtitles only)</div>
              <div className="font-display text-3xl font-semibold">≈ {minutesLabel(e.textOnlyMinutes)}</div>
              <div className="text-xs text-muted-foreground">{e.textTurns} more AI turns</div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Based on {q.fromHistory.voice ? "your shows" : "a typical show"}: about {q.secondsPerTurn}s of speech and {q.tokensPerTurn.toLocaleString()} tokens per turn.
        </p>
      </div>

      {q.googleCloud && (
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <span className="font-semibold">Google Cloud voice (monthly free)</span>
            {!q.googleCloud.connected && <span className="text-xs text-muted-foreground">Add your key in Settings → API keys</span>}
          </div>
          <Meter used={q.googleCloud.used} limit={q.googleCloud.limit} label="Characters used this month" unit="chars" />
          <Row k="Characters left" v={q.googleCloud.remaining.toLocaleString()} strong />
          <Row k="Speech you can still make" v={`≈ ${minutesLabel(q.googleCloud.minutesLeft)}`} strong />
          <Row k="Voice clips this month" v={q.googleCloud.requests.toLocaleString()} />
          <Row k="Resets" v={`${format(new Date(q.googleCloud.resetAt), "d MMM, h:mm a")} (${until(q.googleCloud.resetAt, now)})`} />
          {q.googleCloud.lastError && <p className="text-xs text-destructive">Last error: {q.googleCloud.lastError}</p>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <span className="font-semibold">Google voice (free)</span>
            {!v.connected && <span className="text-xs text-muted-foreground">Not connected</span>}
          </div>
          <Meter used={v.used} limit={v.limit} label="Voice clips today" unit="clips" />
          <div className="space-y-1.5">
            <Row k="Left" v={`${v.remaining} clips (≈ ${minutesLabel(voiceMinutes)} of speech)`} strong />
            <Row k="Speech made today" v={minutesLabel(Math.round(v.audioMsToday / 60_000))} />
            <Row k="Resets" v={`${until(v.resetAt, now)} · ${format(new Date(v.resetAt), "d MMM, h:mm a")}`} />
            <Row k="Speed limit" v={`${v.perMinute} clips per minute`} />
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Daily limit</span>
              {editing ? (
                <span className="flex items-center gap-1">
                  <Input value={limitDraft} onChange={(ev) => setLimitDraft(ev.target.value.replace(/\D/g, ""))} className="h-8 w-24" inputMode="numeric" aria-label="Daily voice limit" />
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Save limit" disabled={!limitDraft || saveLimit.isPending} onClick={() => saveLimit.mutate(Number(limitDraft))}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancel" onClick={() => setEditing(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-primary"
                  onClick={() => {
                    setLimitDraft(String(v.limit));
                    setEditing(true);
                  }}
                >
                  {v.limit} clips {v.limitSource === "google" ? "(from Google)" : v.limitSource === "user" ? "(set by you)" : "(free tier)"}
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {v.blockedUntil && (
            <div className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Google paused your voice {until(v.blockedUntil, now)}. Shows keep running with subtitles only until then.
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="font-semibold">Groq AI (free)</span>
            {!g.connected && <span className="text-xs text-muted-foreground">Not connected</span>}
          </div>
          <Meter used={g.tokens.used} limit={g.tokens.limit} label="Tokens today" unit="" />
          <Meter used={g.requests.used} limit={g.requests.limit} label="Requests today" unit="" />
          <div className="space-y-1.5">
            <Row k="Tokens left" v={g.tokens.remaining.toLocaleString()} strong />
            <Row k="Requests left" v={g.requests.remaining.toLocaleString()} strong />
            <Row k="Tokens reset" v={`${until(g.tokens.resetAt, now)} · ${format(new Date(g.tokens.resetAt), "d MMM, h:mm a")}`} />
            <Row k="Requests fully refilled" v={g.requests.resetAt ? until(g.requests.resetAt, now) : "already full"} />
            <Row k="Speed limit" v={`${g.perMinuteTokens.toLocaleString()} tokens per minute`} />
            {g.checkedAt && <Row k="Last checked with Groq" v={format(new Date(g.checkedAt), "h:mm a")} />}
          </div>
        </div>
      </div>
    </section>
  );
}
