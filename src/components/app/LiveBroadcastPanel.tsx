import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Radio, Square, RefreshCw, Eye, EyeOff, Copy, ExternalLink, Loader2, MonitorPlay, Sparkles, ImageIcon, Wand2, Check, GraduationCap, Mic } from "lucide-react";
import { agentsQuery, broadcastsQuery, interviewsQuery, youtubeConnectionQuery, type Broadcast } from "@/lib/queries";
import { generatePromoMeta } from "@/backend/promo.functions";
import { buildDescription } from "@/lib/promo-rules";
import { drawVsThumbnail, toYoutubeThumb } from "@/lib/thumbnail";
import { streamImage } from "@/lib/stream-image";
import { presetAvatar } from "@/lib/avatars";
import { topicLabel } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import studioBg from "@/assets/studio-bg.jpg";
import { cn } from "@/lib/utils";
import { createBroadcast, refreshBroadcast, revealStreamKey, transitionBroadcast } from "@/backend/youtube.functions";
import { StatusBadge } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** Create / manage YouTube Live broadcasts (hidden from default sidebar). */
export function LiveBroadcastPanel({ interviewId }: { interviewId?: string }) {
  const qc = useQueryClient();
  const { data: conn } = useSuspenseQuery(youtubeConnectionQuery());
  const { data: broadcasts } = useSuspenseQuery(broadcastsQuery());
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const promoFn = useServerFn(generatePromoMeta);
  const create = useServerFn(createBroadcast);

  const [busy, setBusy] = useState(false);
  const [showMode, setShowMode] = useState<"interview" | "lecture">(() =>
    interviews.find((i) => i.id === interviewId)?.format === "lecture" ? "lecture" : "interview",
  );
  const modeShows = interviews.filter((i) => (i.format === "lecture") === (showMode === "lecture"));
  const [form, setForm] = useState({
    interviewId: interviewId ?? modeShows.find((i) => i.status !== "completed")?.id ?? "",
    title: "",
    description: "An autonomous AI vs AI interview, produced with AI Interview Arena.",
    privacy: "private" as "private" | "unlisted" | "public",
    approve: false,
    thumb: null as string | null,
    tags: "",
  });
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof generatePromoMeta>> | null>(null);
  const [writing, setWriting] = useState(false);
  const [thumbBusy, setThumbBusy] = useState<"vs" | "ai" | null>(null);
  const [thumbIdea, setThumbIdea] = useState("");
  const [aiPreview, setAiPreview] = useState<{ src: string; final: boolean } | null>(null);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const selectedIv = interviews.find((i) => i.id === form.interviewId);

  function changeShowMode(value: string) {
    const mode = value === "lecture" ? "lecture" : "interview";
    const next =
      interviews.find((i) => (i.format === "lecture") === (mode === "lecture") && i.status !== "completed") ??
      interviews.find((i) => (i.format === "lecture") === (mode === "lecture"));
    setShowMode(mode);
    setMeta(null);
    setAiPreview(null);
    setForm((f) => ({
      ...f,
      interviewId: next?.id ?? "",
      title: next?.title.slice(0, 100) ?? "",
      description:
        mode === "lecture"
          ? "An AI-led solo lecture, produced with AI Interview Arena."
          : "An autonomous AI vs AI interview, produced with AI Interview Arena.",
      tags: "",
      thumb: null,
    }));
  }

  const hostAgent = agents.find((a) => a.id === selectedIv?.interviewer_agent_id);
  const guestAgent = agents.find((a) => a.id === selectedIv?.candidate_agent_id);
  const topicLine = meta?.topicLine ?? (selectedIv ? (selectedIv.topics?.length ? selectedIv.topics.join(" · ") : topicLabel(selectedIv.topic, selectedIv.custom_topic)) : "");
  const headline = meta?.thumbnailText ?? selectedIv?.title ?? form.title;

  async function writeWithAi() {
    if (!form.interviewId) {
      toast.error("Choose an interview first.");
      return;
    }
    setWriting(true);
    try {
      const m = await promoFn({ data: { interviewId: form.interviewId } });
      setMeta(m);
      setForm((f) => ({ ...f, title: m.titles[0] ?? f.title, description: buildDescription(m.description, m.hashtags), tags: m.tags.join(", ") }));
      toast.success("Title, description, tags and hashtags ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not write the details");
    } finally {
      setWriting(false);
    }
  }

  async function makeVsThumb() {
    setThumbBusy("vs");
    setAiPreview(null);
    try {
      const thumb = await drawVsThumbnail({
        background: studioBg,
        host: { name: hostAgent?.name ?? "Host", src: hostAgent?.avatarUrl || presetAvatar(hostAgent?.preset_avatar, "interviewer"), fallback: presetAvatar(null, "interviewer"), color: hostAgent?.accent_color },
        guest: { name: guestAgent?.name ?? "Guest", src: guestAgent?.avatarUrl || presetAvatar(guestAgent?.preset_avatar, "candidate"), fallback: presetAvatar(null, "candidate"), color: guestAgent?.accent_color },
        headline: headline || "AI vs AI Interview",
        sub: topicLine.toUpperCase(),
      });
      setForm((f) => ({ ...f, thumb }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make the thumbnail");
    } finally {
      setThumbBusy(null);
    }
  }

  async function makeAiThumb() {
    setThumbBusy("ai");
    setAiPreview(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) throw new Error("Sign in again, then retry.");
      let finalSrc: string | null = null;
      await streamImage(
        "/api/generate-thumbnail",
        { headline: (headline || "AI vs AI Interview").slice(0, 80), topic: topicLine.slice(0, 200), hostName: hostAgent?.name ?? "Host", guestName: guestAgent?.name ?? "Guest", ...(thumbIdea.trim() ? { idea: thumbIdea.trim().slice(0, 600) } : {}) },
        (src, final) => {
          setAiPreview({ src, final });
          if (final) finalSrc = src;
        },
        undefined,
        { Authorization: `Bearer ${token}` },
      );
      if (finalSrc) {
        const thumb = await toYoutubeThumb(finalSrc);
        setForm((f) => ({ ...f, thumb }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setAiPreview(null);
      toast.error(
        /\b402\b/.test(msg)
          ? "AI credits are used up for this workspace. Use the free VS thumbnail, or add credits."
          : /\b429\b/.test(msg)
            ? "The image AI is busy right now. Wait a minute, then try again."
            : /\b403\b/.test(msg)
              ? "AI image generation isn't allowed for this workspace right now."
              : "Could not generate the AI thumbnail. Try the free VS thumbnail instead.",
      );
    } finally {
      setThumbBusy(null);
    }
  }

  useEffect(() => {
    const iv = interviews.find((i) => i.id === form.interviewId);
    if (iv && !form.title) setForm((f) => ({ ...f, title: iv.title.slice(0, 100) }));
  }, [form.interviewId, interviews, form.title]);

  async function doCreate() {
    if (form.privacy === "public" && !form.approve) {
      toast.error("Tick the approval box to create a public broadcast.");
      return;
    }
    setBusy(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await create({
        data: {
          interviewId: form.interviewId || null,
          title: form.title,
          description: form.description,
          privacy: form.privacy,
          approvePublic: form.approve,
          thumbnailDataUri: form.thumb,
          tags,
        },
      });
      toast.success("Broadcast created on YouTube");
      if (res.warning) toast.warning(res.warning);
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      qc.invalidateQueries({ queryKey: ["interviews"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create broadcast");
    } finally {
      setBusy(false);
      setConfirmPublic(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1fr_320px]">
        <div className="order-2 space-y-6 xl:order-1">
          <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-5 md:grid-cols-2">
            <h2 className="font-semibold md:col-span-2">New live broadcast</h2>
            <Tabs value={showMode} onValueChange={changeShowMode} className="md:col-span-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="interview" className="gap-2">
                  <Mic className="h-4 w-4" /> Interview
                </TabsTrigger>
                <TabsTrigger value="lecture" className="gap-2">
                  <GraduationCap className="h-4 w-4" /> Solo Lecture
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>{showMode === "lecture" ? "Lecture" : "Interview"}</Label>
              <Select
                value={form.interviewId}
                onValueChange={(v) => {
                  setMeta(null);
                  setForm({ ...form, interviewId: v, title: "" });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={showMode === "lecture" ? "Choose a lecture" : "Choose an interview"} />
                </SelectTrigger>
                <SelectContent>
                  {modeShows.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modeShows.length === 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{showMode === "lecture" ? "No solo lectures yet." : "No interviews yet."}</span>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/interviews/new">Create show</Link>
                  </Button>
                </div>
              )}
              {selectedIv && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link to="/studio/$interviewId" params={{ interviewId: selectedIv.id }}>
                    <MonitorPlay /> Open {showMode === "lecture" ? "lecture" : "interview"} studio
                  </Link>
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 md:col-span-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">Write with AI</div>
                <div className="text-muted-foreground">Title options, description, tags and hashtags for this {showMode === "lecture" ? "lecture" : "interview"}.</div>
              </div>
              <Button variant="hero" size="sm" disabled={writing || !form.interviewId} onClick={writeWithAi}>
                {writing ? <Loader2 className="animate-spin" /> : <Wand2 />} {meta ? "Write again" : "Write it"}
              </Button>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Stream title</Label>
              <Input maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              {meta && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {meta.titles.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, title: t }))}
                      className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-left text-xs transition-colors", form.title === t ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:border-primary/50")}
                    >
                      {form.title === t && <Check className="h-3 w-3" />} {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={meta ? 8 : 3} maxLength={4500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <span className="text-xs text-muted-foreground">Hashtags at the end of the description show above your stream title on YouTube.</span>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Tags (comma separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="ai interview, react, system design" />
            </div>
            <div className="grid gap-1.5">
              <Label>Visibility</Label>
              <Select value={form.privacy} onValueChange={(v) => setForm({ ...form, privacy: v as typeof form.privacy, approve: false })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:col-span-2">
              <Label>Thumbnail</Label>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted/40">
                  {aiPreview && !aiPreview.final ? (
                    <img src={aiPreview.src} alt="Thumbnail being generated" className="h-full w-full object-cover blur-2xl transition-[filter]" />
                  ) : form.thumb ? (
                    <img src={form.thumb} alt="Thumbnail preview" className="h-full w-full object-cover blur-0 transition-[filter]" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-8 w-8" /> No thumbnail yet
                    </div>
                  )}
                  {thumbBusy === "ai" && (
                    <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" /> Painting your thumbnail…
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" disabled={!!thumbBusy || !form.interviewId} onClick={makeVsThumb}>
                    {thumbBusy === "vs" ? <Loader2 className="animate-spin" /> : <ImageIcon />} Free VS thumbnail
                  </Button>
                  <Textarea
                    rows={3}
                    maxLength={600}
                    value={thumbIdea}
                    onChange={(e) => setThumbIdea(e.target.value)}
                    placeholder="Your idea for the AI thumbnail (optional)"
                    aria-label="Your idea for the AI thumbnail"
                    className="text-xs"
                  />
                  <Button variant="hero" disabled={!!thumbBusy || !form.interviewId} onClick={makeAiThumb}>
                    {thumbBusy === "ai" ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate with AI
                  </Button>
                  <span className="text-xs text-muted-foreground">AI images use workspace credits. The VS thumbnail is free.</span>
                  <Label className="mt-1 text-xs text-muted-foreground">Or upload (JPG/PNG, under 2 MB)</Label>
                  <Input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error("Thumbnail must be under 2 MB");
                        return;
                      }
                      const r = new FileReader();
                      r.onload = () => {
                        setAiPreview(null);
                        setForm((f) => ({ ...f, thumb: String(r.result) }));
                      };
                      r.readAsDataURL(file);
                    }}
                  />
                  {form.thumb && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAiPreview(null);
                        setForm((f) => ({ ...f, thumb: null }));
                      }}
                    >
                      Remove thumbnail
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {form.privacy === "public" && (
              <label className="flex items-start gap-3 rounded-lg border border-live/40 bg-live/5 p-3 text-sm md:col-span-2">
                <Checkbox checked={form.approve} onCheckedChange={(v) => setForm({ ...form, approve: v === true })} />
                <span>I approve broadcasting this AI-generated show publicly on my YouTube channel.</span>
              </label>
            )}
            <div className="md:col-span-2">
              <Button
                variant="hero"
                disabled={!conn || conn.status !== "connected" || busy || !form.title}
                onClick={() => (form.privacy === "public" ? setConfirmPublic(true) : doCreate())}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Radio />} Create broadcast
              </Button>
              {!conn && <span className="ml-3 text-sm text-muted-foreground">Connect your channel first on YouTube page.</span>}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold">Broadcasts</h2>
            {broadcasts.length === 0 && <p className="text-sm text-muted-foreground">No broadcasts yet.</p>}
            {broadcasts.map((b) => (
              <BroadcastCard key={b.id} b={b} />
            ))}
          </div>
        </div>

        <aside className="order-1 space-y-4 xl:order-2 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border bg-card p-4 text-sm shadow-card sm:p-5">
            <h3 className="mb-3 font-semibold">How going live works</h3>
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>Create a broadcast here.</li>
              <li>
                In OBS, add the{" "}
                <Link to="/obs" className="text-primary underline">
                  broadcast scene
                </Link>{" "}
                as a Browser Source.
              </li>
              <li>Reveal the stream key and paste server + key into OBS → Settings → Stream. Start Streaming.</li>
              <li>When the stream shows “active”, press Go Live, then start the interview in the studio.</li>
              <li>Press End broadcast when the show is over.</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Browsers can't push video to YouTube directly, so OBS does the encoding and streaming.</p>
          </div>
        </aside>
      </div>

      <AlertDialog open={confirmPublic} onOpenChange={setConfirmPublic}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create a public broadcast?</AlertDialogTitle>
            <AlertDialogDescription>Anyone will be able to watch this stream on your channel once you go live.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doCreate}>Yes, create public broadcast</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BroadcastCard({ b }: { b: Broadcast }) {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshBroadcast);
  const reveal = useServerFn(revealStreamKey);
  const transition = useServerFn(transitionBroadcast);
  const [key, setKey] = useState<{ server: string; streamKey: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    }
  }
  const ended = b.status === "complete" || b.status === "revoked";
  const obsActive = (b.stream_status ?? "").toLowerCase().startsWith("active");

  useEffect(() => {
    if (ended || b.status === "live") return;
    const t = setInterval(() => {
      refresh({ data: { broadcastSessionId: b.id } })
        .then(() => qc.invalidateQueries({ queryKey: ["broadcasts"] }))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [b.id, b.status, ended, refresh, qc]);

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{b.title}</div>
          <div className="text-xs text-muted-foreground">
            <span className="capitalize">{b.privacy}</span> · stream: {b.stream_status ?? "unknown"}
          </div>
        </div>
        <StatusBadge status={b.status} />
        {b.watch_url && (
          <a href={b.watch_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Watch <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {b.error && <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{b.error}</div>}
      {!ended && b.status !== "live" && !obsActive && (
        <div className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
          YouTube isn't receiving video yet. In OBS: Settings → Stream → paste this broadcast's stream key → <b>Start Streaming</b>.
        </div>
      )}
      {!ended && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("refresh", () => refresh({ data: { broadcastSessionId: b.id } }))}>
            {busy === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check status
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => (key ? setKey(null) : run("key", async () => setKey(await reveal({ data: { broadcastSessionId: b.id } }))))}>
            {key ? <EyeOff /> : <Eye />} {key ? "Hide stream key" : "Reveal stream key"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/obs">
              <MonitorPlay /> OBS setup
            </Link>
          </Button>
          {b.status !== "live" ? (
            <Button size="sm" variant="live" disabled={!!busy || !obsActive} title={obsActive ? undefined : "Start streaming in OBS first"} onClick={() => run("live", () => transition({ data: { broadcastSessionId: b.id, to: "live" } }))}>
              {busy === "live" ? <Loader2 className="animate-spin" /> : <Radio />} {obsActive ? "Go live" : "Waiting for OBS…"}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => confirm("End this broadcast on YouTube?") && run("end", () => transition({ data: { broadcastSessionId: b.id, to: "complete" } }))}>
            <Square /> End broadcast
          </Button>
        </div>
      )}
      {key && (
        <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-xs">
          <CopyRow label="Server" value={key.server} />
          <CopyRow label="Stream key" value={key.streamKey} secret />
          <p className="text-muted-foreground">Keep the stream key private — anyone with it can stream to your channel.</p>
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-muted-foreground">{label}</span>
      <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono">{secret ? value.replace(/.(?=.{4})/g, "•") : value}</code>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        }}
        aria-label={`Copy ${label}`}
      >
        <Copy />
      </Button>
    </div>
  );
}
