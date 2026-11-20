import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarClock, CheckCircle2, Download, ExternalLink, Loader2, Smartphone, XCircle, Zap, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listShortQuestions, markShortUploaded, prepareShortClip } from "@/backend/shorts.functions";
import { getUploadPool, getYoutubeAuthUrl } from "@/backend/youtube.functions";
import { API_UPLOADS_PER_DAY, MAX_INSTANT, UPLOADS_PER_PROJECT, intervalSlots, planSlots, poolLeft, type PoolSlot } from "@/lib/shorts-rules";
import { MAX_BANK } from "@/lib/mcq-rules";
import { SHORT_THEMES, shortThemeForClip, type ShortThemeId } from "@/lib/stage-themes";
import { pickShuffleTheme } from "@/lib/shuffle-rules";
import { freshToken } from "@/lib/fresh-token";
import { QuestionBankPanel } from "@/components/app/QuestionBankPanel";
import { DailyAutoBar } from "@/components/app/DailyAutoBar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Show = { id: string; title: string; format: string; visuals?: unknown };
type Mode = "public" | "schedule" | "download";
type Row = { label: string; state: "wait" | "voice" | "render" | "upload" | "done" | "fail"; note?: string | undefined; url?: string; title?: string };
type Bank = Awaited<ReturnType<typeof listShortQuestions>>;

const STEP: Record<Row["state"], string> = { wait: "", voice: "Generating voice…", render: "Rendering video…", upload: "Uploading to YouTube + thumbnail…", done: "", fail: "" };
const COUNTS = [1, 3, 5, 10, 20, 30, MAX_INSTANT];
const PER_DAY = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24];
const DAYS = [1, 3, 7, 15, 30];
const GAPS = [["15", "Every 15 min"], ["30", "Every 30 min"], ["60", "Every 1 hour"], ["120", "Every 2 hours"], ["spread", "All day (9 AM – 9 PM)"]] as const;
const toLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out (${Math.round(ms / 1000)}s) — network or server was slow, press Retry.`)), ms))]);
const AVG_SHORT_S = 12;
function friendly(msg: string): string {
  if (/timeout/i.test(msg)) return msg;
  if (/quota|uploadLimitExceeded|exceeded the number of videos/i.test(msg)) return "Today's YouTube upload limit is used up. Try again after the daily reset (~1:30 PM IST).";
  if (/not connected|no youtube|reconnect|invalid_grant|401/i.test(msg)) return "YouTube channel is not connected or the login expired — reconnect above.";
  if (/voice|tts|speech|audio/i.test(msg)) return `Voice generation failed: ${msg}`;
  if (/fetch|network|Failed to fetch/i.test(msg)) return "Connection to the server was lost — please try again.";
  return msg;
}

/** YouTube page: pick a quiz show, then one click makes 9:16 Shorts from its question bank and posts/schedules them. */
export function ShortsStudio({ shows, connected }: { shows: Show[]; connected: boolean }) {
  const quiz = shows.filter((s) => s.format === "mcq");
  const [showId, setShowId] = useState(quiz[0]?.id ?? "");
  const listFn = useServerFn(listShortQuestions);
  const prepFn = useServerFn(prepareShortClip);
  const markFn = useServerFn(markShortUploaded);
  const [bank, setBank] = useState<Bank | null>(null);
  const [count, setCount] = useState("5");
  const [perDay, setPerDay] = useState("10");
  const [days, setDays] = useState("30");
  const [mode, setMode] = useState<Mode>("public");
  const [themeId, setThemeId] = useState<ShortThemeId | "shuffle">("quizsheet");
  const [voiceMix, setVoiceMix] = useState(true);
  const [brand, setBrand] = useState("AI Interview Arena");
  useEffect(() => { const b = localStorage.getItem("shorts-brand"); if (b) setBrand(b); }, []);
  const [exam, setExam] = useState("");
  const [withImage, setWithImage] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState(0);
  const stop = useRef(false);
  const [gap, setGap] = useState<string>("spread");
  const [startAt, setStartAt] = useState(() => toLocal(new Date(Date.now() + 60 * 60_000)));
  const poolFn = useServerFn(getUploadPool);
  const authFn = useServerFn(getYoutubeAuthUrl);
  const [pool, setPool] = useState<PoolSlot[]>([]);
  const loadPool = useCallback(() => { poolFn().then((r) => setPool(r.slots)).catch(() => setPool([])); }, [poolFn]);
  const [err, setErr] = useState<string | null>(null);
  const [clock, setClock] = useState<{ start: number; item: number; idx: number; total: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { if (!clock) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [clock]);
  useEffect(() => { if (connected) loadPool(); }, [connected, loadPool]);
  async function connectSlot(slot: number) {
    try { const { url } = await authFn({ data: { origin: window.location.origin, slot } }); window.location.href = url; } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }
  const makeSlots = (n: number, last: string | null) =>
    gap === "spread" ? planSlots(n, Number(perDay), new Date(startAt), last ? new Date(last) : null) : intervalSlots(n, new Date(startAt), Number(gap));

  const reload = useCallback(() => {
    if (!showId) { setBank(null); return; }
    listFn({ data: { interviewId: showId } }).then(setBank).catch(() => setBank(null));
  }, [showId, listFn]);
  useEffect(() => { setRows([]); reload(); }, [reload]);

  async function run(opts?: { countOverride?: number; forceSchedule?: boolean }): Promise<number> {
    // Fresh bank when called from daily auto (state may be stale).
    let active = bank;
    if (!active && showId) {
      try {
        active = await listFn({ data: { interviewId: showId } });
        setBank(active);
      } catch {
        active = null;
      }
    }
    if (!active) {
      toast.error("Pick a quiz show with a question bank first.");
      return 0;
    }
    try {
      const { assertCanRecordShort } = await import("@/lib/media-record");
      assertCanRecordShort();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "This device cannot record Shorts.");
      return 0;
    }
    const effectiveMode: Mode = opts?.forceSchedule ? "schedule" : mode;
    const wanted = opts?.countOverride
      ?? (effectiveMode === "schedule" ? Number(perDay) * Number(days) : Number(count));
    const pick = active.pending.slice(0, wanted);
    if (!pick.length) { toast.error("No new questions left. Generate questions first."); return 0; }
    if (effectiveMode !== "download" && !connected) { toast.error("Connect a YouTube channel first."); return 0; }
    const slots =
      opts?.forceSchedule
        ? planSlots(pick.length, pick.length, new Date(Date.now() + 60 * 60_000), active.lastScheduled ? new Date(active.lastScheduled) : null)
        : makeSlots(pick.length, gap === "spread" ? active.lastScheduled : null);
    setErr(null);
    let thumbOff = false;
    const when = (i: number) => (effectiveMode === "schedule" ? ` → ${format(slots[i]!, "d MMM, h:mm a")}` : "");
    setRows(pick.map((p, i) => ({ label: `Q${p.number}${when(i)}`, state: "wait" })));
    setBusy(true); stop.current = false;
    const upd = (i: number, r: Partial<Row>) => setRows((old) => old.map((o, j) => (j === i ? { ...o, ...r } : o)));
    let ok = 0;
    // Pictures load in the background (free tier: ~1 per 45 s), one ahead of the Short being made.
    const imgs = new Map<number, Promise<HTMLImageElement | null>>();
    const wantImg = async (j: number) => {
      const q = pick[j];
      if (!withImage || !q) return null;
      if (!imgs.has(j)) {
        const { loadShortImage } = await import("@/lib/shorts-render");
        imgs.set(j, loadShortImage(q.question, q.number, await freshToken()));
      }
      return imgs.get(j)!;
    };
    for (let i = 0; i < pick.length && !stop.current; i++) {
      const p = pick[i]!;
      const imgP = wantImg(i);
      try {
        upd(i, { state: "voice" }); setSub(0);
        setClock((c) => ({ start: c?.start ?? Date.now(), item: Date.now(), idx: i, total: pick.length }));
        // Shuffle continues across runs (offset by Shorts already made) so the look/voice keeps changing.
        const n = active.done + i;
        const picked = themeId === "shuffle" ? pickShuffleTheme(SHORT_THEMES.map((t) => t.id), n) : themeId;
        const palette = shortThemeForClip(picked, p.number + n);
        const clip = await withTimeout(prepFn({ data: { questionId: p.id, ...(voiceMix ? { voiceSlot: n } : {}) } }), 90_000, "Voice step");
        upd(i, { state: "render", title: clip.meta.title });
        const { renderMcqShort } = await import("@/lib/shorts-render");
        const image = await imgP;
        void wantImg(i + 1);
        const blob = await withTimeout(renderMcqShort({ exam, image, mcq: clip.mcq, audioUrl: clip.audioUrl, palette, brand, topic: clip.topic, hook: clip.meta.hook, language: clip.language, onProgress: setSub }), 240_000, "Video render");
        if (effectiveMode === "download") {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `short-q${p.number}.${blob.type?.includes("mp4") ? "mp4" : "webm"}`;
          a.click();
          upd(i, { state: "done" }); ok++;
          continue;
        }
        upd(i, { state: "upload" });
        const token = await freshToken(); // a long batch outlives the 1-hour sign-in token
        const qs = new URLSearchParams({
          title: clip.meta.title,
          description: clip.meta.description,
          privacy: "public",
          tags: clip.meta.tags.join(","),
          ...(effectiveMode === "schedule" ? { publishAt: slots[i]!.toISOString() } : {}),
        });
        const { uploadShortVideo } = await import("@/lib/youtube-upload-client");
        const j = await uploadShortVideo({
          token,
          blob,
          searchParams: qs,
          signal: AbortSignal.timeout(180_000),
        }).catch((e) => {
          throw new Error(
            e?.name === "TimeoutError" || /timed out|TimeoutError/i.test(String(e?.message ?? e))
              ? "YouTube upload timed out (180s) — slow internet, press Retry."
              : e instanceof Error
                ? e.message
                : `Upload request fail: ${e}`,
          );
        });
        let note: string | undefined;
        try {
          await markFn({ data: { questionId: p.id, url: j.url, publishAt: effectiveMode === "schedule" ? slots[i]!.toISOString() : null } });
        } catch (e) {
          note = `Uploaded, but bank mark failed: ${e instanceof Error ? e.message : String(e)} — may show as pending again.`;
          toast.error("Short uploaded, but could not mark question done", { description: note });
        }
        // Custom thumbnail = the hook poster. Needs a verified channel; a failure never fails the Short.
        if (!thumbOff) {
          try {
            const { renderHookThumbnail } = await import("@/lib/shorts-render");
            const img = await renderHookThumbnail({ mcq: clip.mcq, palette, brand, topic: clip.topic, hook: clip.meta.hook, language: clip.language });
            const tr = await fetch(`/api/youtube/short-thumbnail?videoId=${encodeURIComponent(j.id)}&slot=${j.slot ?? 1}`, { method: "POST", headers: { Authorization: `Bearer ${await freshToken()}`, "Content-Type": "image/jpeg" }, body: img, signal: AbortSignal.timeout(60_000) });
            if (!tr.ok) {
              const tj = (await tr.json().catch(() => ({}))) as { error?: string };
              thumbOff = true;
              note = /permission|verif|forbidden|custom thumbnail/i.test(tj.error ?? "") ? "Thumbnail not set: verify your channel (youtube.com/verify)" : `Thumbnail not set: ${tj.error ?? tr.status}`;
            }
          } catch (e) {
            note = `Thumbnail not set: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        upd(i, { state: "done", url: j.url, note }); ok++; loadPool();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const nice = friendly(msg);
        upd(i, { state: "fail", note: nice });
        setErr(`Q${p.number}: ${nice}`);
        if (/quota|uploadLimitExceeded|exceeded the number of videos/i.test(msg)) { toast.error(nice); break; }
      }
    }
    setBusy(false); setClock(null);
    reload(); loadPool();
    if (ok) toast.success(effectiveMode === "download" ? `${ok} Shorts downloaded` : effectiveMode === "schedule" ? `${ok} Shorts scheduled on YouTube` : `${ok} Shorts published on YouTube`);
    return ok;
  }

  const icon = (r: Row) => r.state === "done" ? <CheckCircle2 className="h-4 w-4 text-success" /> : r.state === "fail" ? <XCircle className="h-4 w-4 text-destructive" /> : r.state === "wait" ? <CalendarClock className="h-4 w-4 text-muted-foreground" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  const pendingCount = bank?.pending.length ?? 0;
  const planTotal = Number(perDay) * Number(days);
  const preview = mode === "schedule" && bank && startAt ? makeSlots(Math.min(planTotal, Math.max(1, pendingCount)), gap === "spread" ? bank.lastScheduled : null) : [];
  const live = pool.filter((p) => p.connected && p.configured);
  const cap = live.length * UPLOADS_PER_PROJECT;
  const left = poolLeft(pool);
  const used = live.reduce((n, p) => n + p.uploads, 0);
  const actionLabel = mode === "download" ? `Make & download ${Math.min(Number(count), pendingCount)} Shorts` : mode === "schedule" ? `Schedule ${Math.min(planTotal, pendingCount)} Shorts (${perDay}/day)` : `Publish ${Math.min(Number(count), pendingCount)} Shorts now (public)`;
  const shortBy = mode === "schedule" ? planTotal - pendingCount : 0;
  const bankTarget = mode === "schedule" && bank ? Math.min(MAX_BANK, bank.done + planTotal) : undefined;

  const nextQ = bank?.pending[0];
  const letters = ["A", "B", "C", "D"] as const;

  return (
    <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="order-2 space-y-5 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5 xl:order-1">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">YouTube Shorts</h2>
            <p className="text-sm text-muted-foreground">Pick a quiz show → publish 9:16 Shorts with voice, countdown, and viral titles.</p>
          </div>
        </div>

        <DailyAutoBar
          kind="mcq"
          connected={connected}
          locked={busy}
          onRun={(n) => run({ countOverride: n, forceSchedule: true })}
        />

        {quiz.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <span>No MCQ quiz show yet. Create a show with the "Competitive Exam MCQ Quiz" format.</span>
            <Button asChild variant="outline" size="sm"><Link to="/interviews/new">Create quiz show</Link></Button>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label>Quiz show</Label>
              <Select value={showId} onValueChange={setShowId} disabled={busy}>
                <SelectTrigger><SelectValue placeholder="Choose a quiz show" /></SelectTrigger>
                <SelectContent>{quiz.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {connected && pool.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Today's upload quota</span>
                  <span>
                    <b className={left === 0 ? "text-destructive" : "text-primary"}>{left}</b>
                    <span className="text-muted-foreground"> / {cap} left</span>
                  </span>
                </div>
                <Progress className="mt-2 h-2" value={cap ? (Math.min(used, cap) / cap) * 100 : 0} />
                <div className="mt-3 grid gap-1.5">
                  {pool.map((p) => (
                    <div key={p.slot} className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", p.connected && !p.exhausted ? "bg-secondary" : p.exhausted ? "bg-destructive" : "bg-muted-foreground/40")} />
                        Project {p.slot}
                      </span>
                      {!p.configured ? <span className="text-muted-foreground">Client ID not saved</span>
                        : !p.connected ? <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => connectSlot(p.slot)}>Connect channel</Button>
                        : p.exhausted ? <span className="text-destructive">Used up today</span>
                        : <span className="text-muted-foreground">{p.uploads} / {UPLOADS_PER_PROJECT} used</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bank && (
              <div className="grid grid-cols-3 gap-2 text-center text-sm sm:gap-3">
                <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-3">
                  <div className="font-display text-xl font-bold text-secondary">{bank.total}</div>
                  <div className="text-xs text-muted-foreground">Questions</div>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="font-display text-xl font-bold text-primary">{pendingCount}</div>
                  <div className="text-xs text-muted-foreground">Shorts left</div>
                </div>
                <div className="rounded-xl border border-destructive/15 bg-destructive/5 p-3">
                  <div className="font-display text-xl font-bold text-destructive">{bank.done}</div>
                  <div className="text-xs text-muted-foreground">On YouTube</div>
                </div>
              </div>
            )}

            {showId && !busy && (
              <QuestionBankPanel key={`${showId}-${bankTarget ?? 0}`} interviewId={showId} onChange={reload} target={bankTarget} />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>How to post</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={busy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Publish now</SelectItem>
                    <SelectItem value="schedule">Schedule plan (X Shorts per day)</SelectItem>
                    <SelectItem value="download">Download only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "schedule" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Per day</Label>
                    <Select value={perDay} onValueChange={setPerDay} disabled={busy}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PER_DAY.map((n) => <SelectItem key={n} value={String(n)}>{n} / day</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Days</Label>
                    <Select value={days} onValueChange={setDays} disabled={busy}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS.map((n) => <SelectItem key={n} value={String(n)}>{n === 30 ? "1 month (30)" : `${n} days`}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-1"><Label>How many Shorts</Label>
                  <Select value={count} onValueChange={setCount} disabled={busy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COUNTS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {mode === "schedule" && (
                <>
                  <div className="space-y-1"><Label>First Short at (date & time)</Label>
                    <Input type="datetime-local" value={startAt} min={toLocal(new Date())} disabled={busy} onChange={(e) => setStartAt(e.target.value)} />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[["+1h", 1], ["+2h", 2], ["+4h", 4]].map(([l, h]) => <Button key={l} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setStartAt(toLocal(new Date(Date.now() + Number(h) * 3600_000)))}>{l}</Button>)}
                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); setStartAt(toLocal(d)); }}>Tomorrow 9 AM</Button>
                    </div>
                  </div>
                  <div className="space-y-1"><Label>Gap between Shorts</Label>
                    <Select value={gap} onValueChange={setGap} disabled={busy}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{GAPS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-1"><Label>Theme</Label>
                <Select value={themeId} onValueChange={(v) => setThemeId(v as typeof themeId)} disabled={busy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="shuffle">Shuffle (new theme every Short)</SelectItem>{SHORT_THEMES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Channel name (on video)</Label><Input value={brand} maxLength={40} disabled={busy} onChange={(e) => { setBrand(e.target.value); localStorage.setItem("shorts-brand", e.target.value); }} /></div>
              <div className="space-y-1"><Label>Exam / Topic badge (optional)</Label><Input value={exam} maxLength={30} placeholder="e.g. SSC CGL 2024 — leave empty to hide" disabled={busy} onChange={(e) => setExam(e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={voiceMix} disabled={busy} onChange={(e) => setVoiceMix(e.target.checked)} /> Voice mix (rotate voices)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={withImage} disabled={busy} onChange={(e) => setWithImage(e.target.checked)} /> AI photo card above the question</label>
            </div>

            {mode === "schedule" && preview.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <div>Plan: <b className="text-foreground">{planTotal} Shorts</b> · {gap === "spread" ? `${perDay} per day (9 AM – 9 PM) · ${days} days` : `every ${gap} min`}</div>
                <div>First: {format(preview[0]!, "d MMM, h:mm a")} → Last: {format(preview[preview.length - 1]!, "d MMM, h:mm a")}</div>
                {gap === "spread" && bank?.lastScheduled && <div>Existing schedule runs until {format(new Date(bank.lastScheduled), "d MMM, h:mm a")} — the new plan continues after it.</div>}
                {shortBy > 0 && <div className="text-destructive">{shortBy} questions short — press "Continue generating" above (max {MAX_BANK}).</div>}
                <div>YouTube allows ~{API_UPLOADS_PER_DAY} uploads per day. Keep this tab open while publishing.</div>
              </div>
            )}

            {err && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="flex-1">{err}</span>
                <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy}>Retry</Button>
              </div>
            )}

            {busy ? (
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => { stop.current = true; }}><Loader2 className="animate-spin" /> Working… (stop after current)</Button>
            ) : (
              <Button variant="hero" size="lg" className="w-full sm:w-auto" onClick={() => void run()} disabled={!bank || pendingCount === 0 || (mode !== "download" && !connected)}>
                {mode === "download" ? <Download /> : mode === "public" ? <Zap /> : <CalendarClock />} {actionLabel}
              </Button>
            )}
            {!connected && mode !== "download" && <p className="text-xs text-muted-foreground">Connect a YouTube channel above to upload.</p>}
            {busy && clock && (() => {
              const cur = Math.round((Date.now() - clock.item) / 1000);
              const all = Math.round((Date.now() - clock.start) / 1000);
              const leftSec = Math.max(0, (clock.total - clock.idx) * AVG_SHORT_S - cur);
              const step = rows[clock.idx]?.state === "voice" ? "[1/3] Voice" : rows[clock.idx]?.state === "render" ? "[2/3] Video record" : "[3/3] Upload + thumbnail";
              return <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-2 text-center text-xs"><div><b className="block text-sm">{cur}s / ~{AVG_SHORT_S}s</b>Short {clock.idx + 1}/{clock.total}</div><div><b className="block text-sm">{step}</b>Current step</div><div><b className="block text-sm">~{Math.floor(leftSec / 60)}m {leftSec % 60}s</b>Time left ({all}s elapsed)</div></div>;
            })()}
            {busy && <><Progress value={sub * 100} /><p className="text-xs text-muted-foreground">Keep this tab open — each Short records in real time (~10–15 sec each).</p></>}

            {rows.length > 0 && (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
                {rows.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">{icon(r)}
                    <span className="min-w-0 flex-1">{r.label}{STEP[r.state] && <span className="ml-2 text-xs text-muted-foreground">{STEP[r.state]}</span>}{r.title && <span className="block truncate text-xs text-muted-foreground">{r.title}</span>}{r.note && <span className={`block text-xs ${r.state === "fail" ? "text-destructive" : "text-muted-foreground"}`}>{r.note}</span>}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open <ExternalLink className="h-3 w-3" /></a>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Right column — matches mockup: 9:16 preview + recent + tips */}
      <aside className="order-1 space-y-4 xl:order-2 xl:sticky xl:top-6 xl:self-start">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Short preview</div>
          <div className="mx-auto w-full max-w-[220px] sm:max-w-[240px]">
            <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-border bg-slate-900 text-white shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-b from-slate-800 via-slate-900 to-black" />
              <div className="relative flex h-full flex-col p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] text-white/70">
                  <span className="rounded-full bg-white/10 px-2 py-0.5">{exam.trim() || nextQ?.topic || "GK / GS Quiz"}</span>
                  <span className="truncate pl-2">{brand.slice(0, 18)}</span>
                </div>
                <div className="mt-2 rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold leading-snug text-white">
                    {nextQ?.question
                      ? `Q${nextQ.number}. ${nextQ.question.slice(0, 120)}${nextQ.question.length > 120 ? "…" : ""}`
                      : "Your next quiz Short will appear here once questions are ready."}
                  </p>
                </div>
                <div className="mt-3 space-y-1.5">
                  {(nextQ?.options?.length ? nextQ.options : ["Option A", "Option B", "Option C", "Option D"]).map((opt, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px]",
                        i === 0 ? "border-primary/60 bg-primary/20 text-white" : "border-white/15 bg-white/5 text-white/90",
                      )}
                    >
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold", i === 0 ? "bg-primary text-white" : "bg-white/15")}>
                        {letters[i] ?? String(i + 1)}
                      </span>
                      <span className="line-clamp-1">{opt}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-3 text-center text-[10px] text-white/50">9:16 · Before publish</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Shorts</div>
          {bank?.recent?.length ? (
            <ul className="space-y-2.5">
              {bank.recent.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 rounded-xl border border-transparent p-1.5 hover:border-border hover:bg-muted/40">
                    <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[9px] font-bold text-white">Q{r.number}</div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium text-foreground">{r.question}</p>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Published
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Published Shorts will show up here.</p>
          )}
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Lightbulb className="h-4 w-4" /> Quick tips
          </div>
          <ul className="space-y-1.5 text-xs text-foreground/80">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Preview the next question before you publish.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Keep a dedicated quiz show for Shorts (don’t finish it in studio).</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Channel must be verified for custom thumbnails.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
