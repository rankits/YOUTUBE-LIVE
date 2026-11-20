import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatOffset, type LiveHighlight } from "@/lib/live-monitor-rules";
import { analyzeCaptionText, pollLiveHighlights, resolveLiveStream } from "@/backend/live-monitor.functions";

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
  highlights: (LiveHighlight & { previewUrl?: string | null })[];
  messageCount: number;
  status: "idle" | "polling" | "error" | "ended";
  error?: string;
  lastPollAt?: string;
};

type HighlightRow = LiveHighlight & { previewUrl?: string | null };

export function LiveMonitorPanel({ connected }: { connected: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [captions, setCaptions] = useState("");
  const [captionVideoId, setCaptionVideoId] = useState("");
  const [captionHits, setCaptionHits] = useState<HighlightRow[]>([]);
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
                  {s.canDraftClip ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        toast.message("Own-channel draft", {
                          description: "Use this timestamp on your VOD / recording. Full auto-cut ships next once VOD is ready.",
                        })
                      }
                    >
                      Draft Short
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled title="Only for your channel or uploaded media">
                      No re-upload
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

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
