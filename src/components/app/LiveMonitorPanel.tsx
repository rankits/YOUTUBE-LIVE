import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Radio, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatOffset, type LiveHighlight } from "@/lib/live-monitor-rules";
import { analyzeCaptionText, pollLiveHighlights, resolveLiveStream } from "@/backend/live-monitor.functions";
import { freshToken } from "@/lib/fresh-token";

type HighlightRow = LiveHighlight & { previewUrl?: string | null };

type Session = {
  id: string;
  url: string;
  videoId: string;
  title: string;
  channelTitle: string;
  isLive: boolean;
  ownChannel: boolean;
  canDraftClip: boolean;
  activeLiveChatId: string | null;
  actualStartTime: string | null;
  concurrentViewers: number | null;
  note: string;
  highlights: HighlightRow[];
  messageCount: number;
  status: "idle" | "polling" | "error" | "ended";
  error?: string;
  lastPollAt?: string;
  /** Local recording the user owns / has rights to cut Shorts from. */
  recording?: File | null;
  rightsOk?: boolean;
};

type DraftState = {
  sessionId: string;
  highlight: HighlightRow;
  duration: 15 | 30 | 60;
  /** Editable start inside the attached file (seconds). */
  startSec: number;
  fileDurationSec: number;
  progress: number;
  blob?: Blob;
  url?: string;
  uploading?: boolean;
  clamped?: boolean;
};

export function LiveMonitorPanel({ connected }: { connected: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [captions, setCaptions] = useState("");
  const [captionVideoId, setCaptionVideoId] = useState("");
  const [captionHits, setCaptionHits] = useState<HighlightRow[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const pageTokens = useRef<Record<string, string | null>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const addSession = async () => {
    if (!connected) {
      toast.error("Connect YouTube first (Integrations / YouTube page).");
      return;
    }
    setBusy(true);
    try {
      const info = await resolveLiveStream({ data: { url } });
      const session: Session = {
        id: `${info.videoId}-${Date.now()}`,
        url,
        videoId: info.videoId,
        title: info.title,
        channelTitle: info.channelTitle,
        isLive: info.isLive,
        ownChannel: info.ownChannel,
        canDraftClip: info.canDraftClip,
        activeLiveChatId: info.activeLiveChatId,
        actualStartTime: info.actualStartTime,
        concurrentViewers: info.concurrentViewers,
        note: info.note,
        highlights: [],
        messageCount: 0,
        status: info.isLive && info.activeLiveChatId ? "polling" : info.ended ? "ended" : "idle",
      };
      setSessions((s) => [session, ...s.filter((x) => x.videoId !== info.videoId)]);
      pageTokens.current[session.id] = null;
      toast.success(info.isLive ? "Live detected — monitoring chat." : "Resolved (not live / no chat).");
      setUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pollOne = useCallback(async (session: Session) => {
    if (!session.activeLiveChatId || !session.isLive) return;
    try {
      const res = await pollLiveHighlights({
        data: {
          videoId: session.videoId,
          liveChatId: session.activeLiveChatId,
          actualStartTime: session.actualStartTime,
          ...(pageTokens.current[session.id] ? { pageToken: pageTokens.current[session.id]! } : {}),
        },
      });
      pageTokens.current[session.id] = res.nextPageToken;
      setSessions((all) =>
        all.map((s) => {
          if (s.id !== session.id) return s;
          const merged = [...res.highlights, ...s.highlights];
          const seen = new Set<string>();
          const highlights = merged.filter((h) => {
            if (seen.has(h.id)) return false;
            seen.add(h.id);
            return true;
          }).slice(0, 50);
          return {
            ...s,
            highlights,
            messageCount: s.messageCount + res.messageCount,
            status: res.offlineAt ? "ended" : "polling",
            lastPollAt: res.analyzedAt,
            error: undefined,
          };
        }),
      );
      return res.pollingIntervalMs;
    } catch (e) {
      setSessions((all) =>
        all.map((s) =>
          s.id === session.id
            ? { ...s, status: "error", error: e instanceof Error ? e.message : String(e) }
            : s,
        ),
      );
      return 15_000;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handles: number[] = [];

    const tick = async (sessionId: string) => {
      const session = sessionsRef.current.find((x) => x.id === sessionId);
      if (!session || session.status !== "polling" || !session.activeLiveChatId) return;
      const wait = (await pollOne(session)) ?? 5000;
      if (cancelled) return;
      handles.push(window.setTimeout(() => void tick(sessionId), Math.max(5000, wait)) as unknown as number);
    };

    for (const s of sessions) {
      if (s.status === "polling" && s.activeLiveChatId) void tick(s.id);
    }

    return () => {
      cancelled = true;
      for (const h of handles) window.clearTimeout(h);
    };
    // Only restart when which sessions are polling changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.filter((s) => s.status === "polling").map((s) => s.id).join(","), pollOne]);

  const runCaptions = async () => {
    setBusy(true);
    try {
      const res = await analyzeCaptionText({
        data: {
          text: captions,
          ...(captionVideoId.trim() ? { videoId: captionVideoId.trim() } : {}),
        },
      });
      setCaptionHits(res.highlights);
      toast.success(`${res.highlights.length} highlight(s) from captions.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    setSessions((s) => s.filter((x) => x.id !== id));
    delete pageTokens.current[id];
  };

  const canCut = (s: Session) => !!(s.recording && s.rightsOk);

  const openDraft = async (sessionId: string, highlight: HighlightRow) => {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s?.recording || !s.rightsOk) {
      toast.error("Attach your recording first and confirm you have rights to use it.");
      return;
    }
    setClipBusy(true);
    try {
      const { clampClipStart, probeVideoDuration } = await import("@/lib/clip-from-video");
      const fileDurationSec = await probeVideoDuration(s.recording);
      const wanted = Math.max(0, (highlight.offsetSec ?? 0) - 2);
      const startSec = clampClipStart(wanted, fileDurationSec, 15);
      const clamped = wanted > fileDurationSec - 1;
      if (draft?.url) URL.revokeObjectURL(draft.url);
      setDraft({
        sessionId,
        highlight,
        duration: 15,
        startSec,
        fileDurationSec,
        progress: 0,
        clamped,
      });
      if (clamped) {
        toast.message("Highlight time is past this file", {
          description: `Live timestamp was ${Math.floor(wanted)}s but file is only ${Math.floor(fileDurationSec)}s. Adjust Start, then Make Short.`,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setClipBusy(false);
    }
  };

  const makeClip = async () => {
    if (!draft) return;
    const s = sessions.find((x) => x.id === draft.sessionId);
    if (!s?.recording) return;
    setClipBusy(true);
    try {
      const { clampClipStart, renderClipFromVideo } = await import("@/lib/clip-from-video");
      const startSec = clampClipStart(draft.startSec, draft.fileDurationSec, draft.duration);
      const blob = await renderClipFromVideo({
        file: s.recording,
        startSec,
        durationSec: draft.duration,
        headline: draft.highlight.title,
        brand: s.channelTitle || "HIGHLIGHT",
        onProgress: (f) => setDraft((d) => (d ? { ...d, progress: f } : d)),
      });
      if (draft.url) URL.revokeObjectURL(draft.url);
      setDraft((d) => (d ? { ...d, blob, url: URL.createObjectURL(blob), progress: 1, startSec } : d));
      toast.success("Short draft ready — preview, then upload.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setClipBusy(false);
    }
  };

  const uploadClip = async () => {
    if (!draft?.blob || !connected) return;
    const s = sessions.find((x) => x.id === draft.sessionId);
    setDraft((d) => (d ? { ...d, uploading: true } : d));
    try {
      const token = await freshToken();
      const { uploadShortVideo } = await import("@/lib/youtube-upload-client");
      const title = `${draft.highlight.title} #Shorts`.slice(0, 100);
      const qs = new URLSearchParams({
        title,
        description: `${draft.highlight.description}\n\nFrom: ${s?.title ?? ""}\n#Shorts #Highlights`,
        privacy: "public",
        tags: "shorts,highlights,live",
      });
      const j = await uploadShortVideo({ token, blob: draft.blob, searchParams: qs, signal: AbortSignal.timeout(180_000) });
      toast.success("Uploaded to YouTube Shorts");
      window.open(j.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDraft((d) => (d ? { ...d, uploading: false } : d));
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Monitor a public YouTube live</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Official Data API only: live status + public chat highlights. Third-party AV is never downloaded.
          Short drafts unlock only for <span className="font-medium text-foreground">your</span> channel or
          creator-provided captions/files.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://www.youtube.com/watch?v=… or /live/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy || !connected}
          />
          <Button onClick={() => void addSession()} disabled={busy || !url.trim() || !connected}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add stream
          </Button>
        </div>
        {!connected && <p className="text-sm text-destructive">Connect YouTube to use the monitor.</p>}
      </section>

      {sessions.map((s) => (
        <section key={s.id} className="space-y-3 rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{s.title}</h3>
              <p className="text-xs text-muted-foreground">
                {s.channelTitle} · {s.videoId}
                {s.concurrentViewers != null ? ` · ~${s.concurrentViewers} watching` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={s.isLive ? "default" : "secondary"}>{s.isLive ? "LIVE" : "Not live"}</Badge>
              {s.ownChannel && <Badge variant="outline">Your channel</Badge>}
              <Badge variant="outline">{s.status}</Badge>
              <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                <Trash2 />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{s.note}</p>
          {s.error && <p className="text-sm text-destructive">{s.error}</p>}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Chat msgs scanned: {s.messageCount}</span>
            {s.lastPollAt && <span>Last poll: {new Date(s.lastPollAt).toLocaleTimeString()}</span>}
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://www.youtube.com/watch?v=${s.videoId}`} target="_blank" rel="noreferrer">
              Open on YouTube <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <Label className="text-sm font-medium">Your recording (required to cut a Short)</Label>
            <p className="text-xs text-muted-foreground">
              We never download the live URL. Upload a file you own or have permission to use (OBS recording, your VOD download, etc.).
            </p>
            <Input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSessions((all) => all.map((x) => (x.id === s.id ? { ...x, recording: file } : x)));
              }}
            />
            {s.recording && <p className="text-xs text-muted-foreground">Attached: {s.recording.name}</p>}
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!s.rightsOk}
                onChange={(e) =>
                  setSessions((all) => all.map((x) => (x.id === s.id ? { ...x, rightsOk: e.target.checked } : x)))
                }
              />
              <span>I own this recording or have permission to edit and upload clips from it.</span>
            </label>
          </div>

          <ul className="divide-y rounded-xl border">
            {s.highlights.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">No highlights yet — waiting for chat signals…</li>
            )}
            {s.highlights.map((h) => (
              <li key={h.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{h.kind}</Badge>
                    <span className="text-sm font-medium">{h.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">{formatOffset(h.offsetSec)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{h.description}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {h.previewUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={h.previewUrl} target="_blank" rel="noreferrer">
                        Preview
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" disabled={!canCut(s) || clipBusy} onClick={() => void openDraft(s.id, h)}>
                    Cut Short
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {draft && (
        <section className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Cut Short from your recording</h2>
          <p className="text-sm text-muted-foreground">
            {draft.highlight.title}
            {draft.clamped && " · live timestamp was past this file — set Start manually"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Start in file (seconds)</Label>
              <Input
                type="number"
                min={0}
                max={Math.max(0, Math.floor(draft.fileDurationSec - 1))}
                step={1}
                value={Math.round(draft.startSec)}
                disabled={clipBusy || draft.uploading}
                onChange={(e) => {
                  if (draft.url) URL.revokeObjectURL(draft.url);
                  setDraft({
                    ...draft,
                    startSec: Math.max(0, Number(e.target.value) || 0),
                    blob: undefined,
                    url: undefined,
                    progress: 0,
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                File length: {formatOffset(Math.floor(draft.fileDurationSec))} · live hint was{" "}
                {formatOffset(draft.highlight.offsetSec)}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Length</Label>
              <div className="flex flex-wrap gap-2">
                {([15, 30, 60] as const).map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={draft.duration === d ? "default" : "outline"}
                    disabled={clipBusy}
                    onClick={() => {
                      if (draft.url) URL.revokeObjectURL(draft.url);
                      setDraft({ ...draft, duration: d, blob: undefined, url: undefined, progress: 0 });
                    }}
                  >
                    {d}s
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {(clipBusy || draft.progress > 0) && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(draft.progress * 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{clipBusy ? "Recording Short…" : "Ready"}</p>
            </div>
          )}
          {draft.url && (
            <video src={draft.url} controls playsInline className="mx-auto max-h-[420px] w-full max-w-sm rounded-xl bg-black object-contain" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void makeClip()} disabled={clipBusy || draft.uploading}>
              {clipBusy ? <Loader2 className="animate-spin" /> : <Upload />} {draft.blob ? "Re-cut" : "Make Short"}
            </Button>
            <Button variant="default" disabled={!draft.blob || clipBusy || draft.uploading || !connected} onClick={() => void uploadClip()}>
              {draft.uploading ? <Loader2 className="animate-spin" /> : null} Upload to YouTube
            </Button>
            <Button
              variant="ghost"
              disabled={clipBusy || draft.uploading}
              onClick={() => {
                if (draft.url) URL.revokeObjectURL(draft.url);
                setDraft(null);
              }}
            >
              Close
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Creator-provided captions / transcript</h2>
        <p className="text-sm text-muted-foreground">
          Paste your own captions (optional lines like <code className="rounded bg-muted px-1">1:23 announcement text</code>).
          Fully permitted analysis path — no stream download.
        </p>
        <Label>Optional video id (for preview links)</Label>
        <Input value={captionVideoId} onChange={(e) => setCaptionVideoId(e.target.value)} placeholder="dQw4w9WgXcQ" />
        <Textarea rows={6} value={captions} onChange={(e) => setCaptions(e.target.value)} placeholder={"0:45 Breaking update from the stage\n1:20 Official announcement starts"} />
        <Button onClick={() => void runCaptions()} disabled={busy || captions.trim().length < 20}>
          Analyze captions
        </Button>
        {captionHits.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {captionHits.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <span className="font-medium">{h.title}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{formatOffset(h.offsetSec)}</span>
                  <p className="text-muted-foreground">{h.description}</p>
                </div>
                {h.previewUrl && (
                  <a className="text-primary hover:underline" href={h.previewUrl} target="_blank" rel="noreferrer">
                    Preview
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
