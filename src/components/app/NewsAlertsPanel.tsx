import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarDays, Check, Download, ExternalLink, Loader2, Newspaper, RefreshCw, RotateCcw, Trash2, Zap } from "lucide-react";
import { freshToken } from "@/lib/fresh-token";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listJobNews, prepareNewsShort } from "@/backend/news.functions";
import { KIND_LABEL, nextDailySlot, pickViralNews, pickViralNewsBatch, sceneLayout, type NewsItem } from "@/lib/news-rules";
import { agentsQuery } from "@/lib/queries";
import { voiceShortName, voicesFor, type VoiceProvider } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceSelectItems } from "@/components/app/VoiceOptions";

const USED_KEY = "news-shorts-used";
const SLOTS_KEY = "news-shorts-slots";
const CACHE_KEY = "news-feed-cache";
const BRAND_KEY = "shorts-brand";
const AGENT_KEY = "news-shorts-agent";
const VOICE_KEY = "news-shorts-voice";
const PROVIDER_KEY = "news-shorts-voice-provider";
const VOICE_PROVIDERS: { value: VoiceProvider; label: string }[] = [
  { value: "edge", label: "Microsoft (free)" },
  { value: "google_cloud", label: "Google Cloud" },
  { value: "lovable", label: "Built-in" },
  { value: "deepgram", label: "Deepgram" },
  { value: "elevenlabs", label: "ElevenLabs" },
];
const AUTO_REFRESH_MS = 30 * 60_000;
const read = (k: string): unknown[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; } };

type ThumbInput = {
  scenes: import("@/lib/news-render").NewsScene[];
  headline: string;
  jobName: string;
  points: string[];
  facts?: import("@/lib/news-rules").JobFacts;
  kindLabel: string;
  source: string;
  brand: string;
  image: HTMLImageElement | null;
};

type Preview = {
  item: NewsItem;
  blob: Blob;
  url: string;
  title: string;
  description: string;
  tags: string[];
  thumbInput: ThumbInput;
};

type BuiltClip = {
  item: NewsItem;
  blob: Blob;
  title: string;
  description: string;
  tags: string[];
  thumbInput: ThumbInput;
};

export function NewsAlertsPanel({ connected }: { connected: boolean }) {
  const listFn = useServerFn(listJobNews);
  const prepFn = useServerFn(prepareNewsShort);
  const { data: agents = [] } = useQuery(agentsQuery());
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<string[]>([]);
  const [mode, setMode] = useState<"schedule" | "now">("schedule");
  const [language, setLanguage] = useState<"hindi" | "hinglish" | "english">("english");
  const [agentId, setAgentId] = useState<string>("");
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("edge");
  const [voiceId, setVoiceId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [step, setStep] = useState("");
  const [sub, setSub] = useState(0);
  const [last, setLast] = useState<{ url: string; when: string } | null>(null);
  const [brand, setBrand] = useState("Job Alert");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const selectedAgent = useMemo(() => agents.find((a) => a.id === agentId) ?? agents[0] ?? null, [agents, agentId]);
  const voiceOptions = useMemo(() => {
    const all = voicesFor(voiceProvider);
    if (voiceProvider === "elevenlabs") return all;
    const preferred = all.filter((v) => /hi-IN|en-IN|Hindi|India|Indian/i.test(`${v.id} ${v.label}`));
    return preferred.length ? preferred : all;
  }, [voiceProvider]);

  useEffect(() => {
    if (!agents.length) return;
    const saved = localStorage.getItem(AGENT_KEY);
    const pick = (saved && agents.some((a) => a.id === saved) ? saved : agents[0]!.id);
    setAgentId((cur) => cur || pick);
  }, [agents]);

  useEffect(() => {
    if (!selectedAgent) return;
    const saved = localStorage.getItem(PROVIDER_KEY) as VoiceProvider | null;
    const valid = saved && VOICE_PROVIDERS.some((p) => p.value === saved);
    const next = (valid ? saved : (selectedAgent.voice_provider as VoiceProvider) || "edge") as VoiceProvider;
    setVoiceProvider(next);
  }, [selectedAgent?.id]);

  useEffect(() => {
    if (!voiceOptions.length) return;
    const savedVoice = localStorage.getItem(VOICE_KEY);
    const valid = voiceOptions.some((v) => v.id === savedVoice);
    const agentMatch = selectedAgent?.voice_id && voiceOptions.some((v) => v.id === selectedAgent.voice_id)
      ? selectedAgent.voice_id
      : "";
    const next = valid ? savedVoice! : agentMatch || voiceOptions[0]?.id || "";
    setVoiceId(next);
  }, [voiceProvider, voiceOptions, selectedAgent?.voice_id]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const cached = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { at: number; items: NewsItem[] } | null; } catch { return null; } })();
    try {
      const r = await listFn();
      if (r.items.length) {
        setItems(r.items); setStatus(`Updated ${format(new Date(), "h:mm a")} · ${r.sources}`);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: r.items }));
      } else if (cached?.items.length) {
        setItems(cached.items); setStatus(`Saved alerts from ${format(cached.at, "d MMM, h:mm a")}`); setError(r.error);
      } else setError(r.error);
    } catch (e) {
      if (cached?.items.length) { setItems(cached.items); setStatus(`Saved alerts from ${format(cached.at, "d MMM, h:mm a")}`); }
      setError(`Could not refresh the news (${e instanceof Error ? e.message : String(e)}). Press Refresh to try again.`);
    } finally { setLoading(false); }
  }, [listFn]);

  useEffect(() => {
    setUsed(read(USED_KEY) as string[]);
    const b = localStorage.getItem(BRAND_KEY); if (b) setBrand(b);
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) void load(); }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const clearPreview = useCallback(() => {
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
  }, []);

  const buildClip = async (item: NewsItem, onStep?: (s: string) => void, onSub?: (n: number) => void): Promise<BuiltClip> => {
    const { assertCanRecordShort } = await import("@/lib/media-record");
    assertCanRecordShort();
    onStep?.("Writing script & voice…");
    const clip = await prepFn({
      data: {
        title: item.title.slice(0, 300),
        source: item.source.slice(0, 120),
        kind: item.kind ?? "vacancy",
        language,
        ...(selectedAgent?.id ? { agentId: selectedAgent.id } : {}),
        ...(voiceProvider ? { voiceProvider } : {}),
        ...(voiceId ? { voiceId } : {}),
      },
    });
    onStep?.("Drawing poster + photo scenes…");
    const token = await freshToken();
    const { loadShortImage } = await import("@/lib/shorts-render");
    const batchSeed = (Date.now() % 900_000) + Math.floor(Math.random() * 100_000);
    const { renderNewsShort } = await import("@/lib/news-render");
    const scenes: import("@/lib/news-render").NewsScene[] = [];
    const sceneList = clip.scenes?.length
      ? clip.scenes
      : [{ say: clip.headline, keyword: clip.jobName || clip.headline.slice(0, 24), image: item.title, layout: "poster" as const }];
    for (const [k, sc] of sceneList.entries()) {
      const layout = sc.layout ?? sceneLayout(k, sceneList.length);
      const sceneSeed = batchSeed + (k + 1) * 9973 + Math.floor(Math.random() * 9000);
      const q = (sc.image || sc.keyword || item.title).slice(0, 200);
      onStep?.(`${layout === "poster" ? "Poster" : "Photo"} ${k + 1}/${sceneList.length}…`);
      const im = await Promise.race([
        loadShortImage(q, sceneSeed, token, 35_000, { mode: "real" }).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 35_000)),
      ]);
      scenes.push({ say: sc.say, keyword: sc.keyword, layout, image: im });
    }
    const image = scenes.find((s) => s.image)?.image ?? null;
    onStep?.("Rendering video…");
    const thumbInput: ThumbInput = {
      scenes,
      headline: clip.headline,
      jobName: clip.jobName || item.title.slice(0, 28),
      points: clip.points,
      facts: clip.facts,
      kindLabel: clip.kindLabel,
      source: item.source,
      brand: brand.trim() || "Job Alert",
      image,
    };
    const blob = await renderNewsShort({ ...thumbInput, audioUrl: clip.audioUrl, onProgress: onSub });
    return {
      item,
      blob,
      title: clip.meta.title,
      description: clip.meta.description,
      tags: clip.meta.tags,
      thumbInput,
    };
  };

  const uploadBuilt = async (built: BuiltClip, forceSchedule: boolean) => {
    let token = await freshToken();
    const taken = (read(SLOTS_KEY) as number[]).filter((t) => t > Date.now());
    const slot = forceSchedule || mode === "schedule" ? nextDailySlot(new Date(), taken) : null;
    const qs = new URLSearchParams({
      title: built.title,
      description: built.description,
      privacy: "public",
      tags: built.tags.join(","),
      ...(slot ? { publishAt: slot.toISOString() } : {}),
    });
    const res = await fetch(`/api/youtube/upload-short?${qs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": built.blob.type || "video/webm" },
      body: built.blob,
      signal: AbortSignal.timeout(180_000),
    });
    const j = (await res.json().catch(() => ({ error: `Server error [${res.status}]` }))) as { id?: string; url?: string; error?: string; slot?: number };
    if (!res.ok || !j.url || !j.id) throw new Error(j.error ?? "Upload failed");
    if (slot) localStorage.setItem(SLOTS_KEY, JSON.stringify([...taken, slot.getTime()]));
    const nextUsed = [...(read(USED_KEY) as string[]), built.item.link].slice(-300);
    localStorage.setItem(USED_KEY, JSON.stringify(nextUsed));
    setUsed(nextUsed);
    try {
      token = await freshToken();
      const { renderNewsThumbnail } = await import("@/lib/news-render");
      const { uploadShortThumbnail } = await import("@/lib/youtube-thumbnail");
      const img = await renderNewsThumbnail(built.thumbInput);
      await uploadShortThumbnail({ videoId: j.id, blob: img, token, slot: j.slot ?? 1 });
      toast.success("Custom thumbnail set on Short");
    } catch (e) {
      toast.message(`Video uploaded; thumbnail: ${e instanceof Error ? e.message : "could not be set"}`);
    }
    return { url: j.url, when: slot ? format(slot, "d MMM, h:mm a") : "now" };
  };

  const renderPreview = async (item: NewsItem) => {
    if (!connected) { toast.error("Connect YouTube first."); return; }
    setBusy(item.link); setError(null); setLast(null); setSub(0); clearPreview();
    try {
      const built = await buildClip(item, setStep, setSub);
      setPreview({ ...built, url: URL.createObjectURL(built.blob) });
      toast.success("Preview ready — check, then Approve to upload.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); setStep(""); }
  };

  const approveUpload = async () => {
    if (!preview) return;
    if (!connected) { toast.error("Connect YouTube first."); return; }
    setUploading(true); setError(null); setStep("Uploading to YouTube…");
    try {
      const result = await uploadBuilt(preview, false);
      setLast(result);
      toast.success(result.when === "now" ? "Uploaded!" : `Scheduled for ${result.when}`);
      clearPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setUploading(false); setStep(""); }
  };

  const auto = () => {
    const pick = pickViralNews(items, used);
    if (!pick) { toast.error("No new alert found — press refresh."); return; }
    void renderPreview(pick);
  };

  /** Build + upload up to 8 Shorts into the next daily schedule slots. */
  const fillDailySlots = async () => {
    if (!connected) { toast.error("Connect YouTube first."); return; }
    if (preview || busy || uploading) { toast.error("Finish or discard the current preview first."); return; }
    const picks = pickViralNewsBatch(items, used, 8);
    if (!picks.length) { toast.error("No unused alerts — press Refresh."); return; }
    setBatchBusy(true); setError(null); setLast(null);
    let ok = 0;
    try {
      for (const [i, item] of picks.entries()) {
        setBusy(item.link);
        setStep(`Daily slot ${i + 1}/${picks.length}: preparing…`);
        setSub(0);
        try {
          const built = await buildClip(
            item,
            (s) => setStep(`Daily ${i + 1}/${picks.length}: ${s}`),
            setSub,
          );
          setStep(`Daily ${i + 1}/${picks.length}: uploading + thumbnail…`);
          const result = await uploadBuilt(built, true);
          ok += 1;
          setLast(result);
        } catch (e) {
          toast.error(`Slot ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      toast.success(ok ? `${ok} Short(s) scheduled into daily slots.` : "No Shorts uploaded.");
    } finally {
      setBatchBusy(false); setBusy(null); setStep(""); setSub(0);
    }
  };

  const locked = !!busy || uploading || batchBusy || !!preview;

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg"><Newspaper className="size-5 shrink-0" /> Breaking Job & Exam Alerts</h2>
        <Button size="sm" variant="outline" onClick={load} disabled={loading || locked}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Preview first, then Approve. Thumbnails are set automatically. Poster + photo scenes and 8 daily slots are supported.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Speaking agent</Label>
          <Select
            value={selectedAgent?.id || ""}
            onValueChange={(v) => {
              setAgentId(v);
              localStorage.setItem(AGENT_KEY, v);
              const a = agents.find((x) => x.id === v);
              if (a?.voice_provider) {
                const p = a.voice_provider as VoiceProvider;
                setVoiceProvider(p);
                localStorage.setItem(PROVIDER_KEY, p);
              }
              if (a?.voice_id) {
                setVoiceId(a.voice_id);
                localStorage.setItem(VOICE_KEY, a.voice_id);
              }
            }}
            disabled={locked || !agents.length}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select agent" /></SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {voiceShortName(a.voice_id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Voice provider</Label>
          <Select
            value={voiceProvider}
            onValueChange={(v) => {
              const p = v as VoiceProvider;
              setVoiceProvider(p);
              localStorage.setItem(PROVIDER_KEY, p);
              const nextVoice = voicesFor(p).find((x) => /hi-IN|en-IN|Hindi|India|Indian/i.test(`${x.id} ${x.label}`))?.id
                || voicesFor(p)[0]?.id
                || "";
              setVoiceId(nextVoice);
              if (nextVoice) localStorage.setItem(VOICE_KEY, nextVoice);
            }}
            disabled={locked}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              {VOICE_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <Label className="text-xs text-muted-foreground">Voice</Label>
          <Select
            value={voiceId}
            onValueChange={(v) => {
              setVoiceId(v);
              localStorage.setItem(VOICE_KEY, v);
            }}
            disabled={locked || !voiceOptions.length}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select voice" /></SelectTrigger>
            <SelectContent>
              <VoiceSelectItems provider={voiceProvider} options={voiceOptions} />
            </SelectContent>
          </Select>
        </div>
      </div>
      {voiceProvider === "deepgram" && language !== "english" && (
        <p className="text-xs text-amber-600">Deepgram is English-only — Hindi or Hinglish may sound accented.</p>
      )}
      {!agents.length && (
        <p className="text-xs text-amber-600">Create an agent on the Agents page first (or add Default Agents).</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)} disabled={locked}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="schedule">Schedule (8 slots/day)</SelectItem><SelectItem value="now">Publish now</SelectItem></SelectContent>
        </Select>
        <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)} disabled={locked}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="hindi">Hindi</SelectItem><SelectItem value="hinglish">Hinglish</SelectItem><SelectItem value="english">English</SelectItem></SelectContent>
        </Select>
        <Input className="w-full sm:w-40" value={brand} maxLength={40} placeholder="Channel name" aria-label="Channel name on video" disabled={locked} onChange={(e) => { setBrand(e.target.value); localStorage.setItem(BRAND_KEY, e.target.value); }} />
        <Button variant="live" className="w-full sm:w-auto" onClick={auto} disabled={locked || !items.length}><Zap /> 1-Click Viral (preview)</Button>
        <Button variant="hero" className="w-full sm:w-auto" onClick={() => void fillDailySlots()} disabled={locked || !items.length}>
          {batchBusy ? <Loader2 className="animate-spin" /> : <CalendarDays />} Fill 8 daily slots
        </Button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      {(busy || batchBusy) && <div className="space-y-1 text-sm"><div className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{step}</div>{/render/i.test(step) && <Progress value={sub * 100} />}</div>}
      {uploading && <div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{step || "Uploading…"}</div>}
      {error && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {last && <a href={last.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary underline">Short ready ({last.when}) <ExternalLink className="size-3" /></a>}

      {preview && (
        <div className="grid gap-4 rounded-xl border border-primary/40 bg-primary/5 p-3 sm:p-4 md:grid-cols-[200px_1fr]">
          <div className="mx-auto flex aspect-[9/16] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border bg-muted md:mx-0 md:max-w-none">
            <video src={preview.url} controls playsInline className="h-full w-full object-contain" />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Preview — approve to upload</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preview.item.title}</p>
            </div>
            <div className="space-y-1">
              <Label>Title ({preview.title.length}/100)</Label>
              <Input value={preview.title} maxLength={100} disabled={uploading} onChange={(e) => setPreview((p) => p && { ...p, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={4} value={preview.description} disabled={uploading} onChange={(e) => setPreview((p) => p && { ...p, description: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="hero" className="w-full sm:w-auto" disabled={uploading} onClick={() => void approveUpload()}>
                {uploading ? <Loader2 className="animate-spin" /> : <Check />} Approve & Upload
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" disabled={uploading} onClick={() => void renderPreview(preview.item)}>
                <RotateCcw /> Re-make
              </Button>
              <Button variant="ghost" className="w-full sm:w-auto" disabled={uploading} onClick={clearPreview}>
                <Trash2 /> Discard
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" asChild>
                <a href={preview.url} download={`job-alert-preview.${preview.blob.type?.includes("mp4") ? "mp4" : "webm"}`}><Download /> Download</a>
              </Button>
            </div>
          </div>
        </div>
      )}

      <ul className="max-h-96 divide-y overflow-auto">
        {items.map((it) => (
          <li key={it.link} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:gap-3">
            <span className="w-fit shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{it.kind ? KIND_LABEL[it.kind] : "NEWS"}</span>
            <div className="min-w-0 flex-1">
              <a href={it.link} target="_blank" rel="noreferrer" className="line-clamp-2 hover:underline">{it.title}</a>
              <div className="text-xs text-muted-foreground">{it.source}{used.includes(it.link) && " • posted"}</div>
            </div>
            <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled={locked} onClick={() => void renderPreview(it)}>
              {busy === it.link ? <Loader2 className="animate-spin" /> : "Make Short"}
            </Button>
          </li>
        ))}
        {!items.length && !loading && <li className="py-4 text-center text-sm text-muted-foreground">No alerts loaded.</li>}
      </ul>
    </div>
  );
}
