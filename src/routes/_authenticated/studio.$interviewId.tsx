import { STAGE_THEMES, stageTheme } from "@/lib/stage-themes";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Square, RotateCcw, Volume2, VolumeX, Mic, MonitorPlay, Youtube, AlertTriangle, Loader2, Info, Captions, Code2, Workflow, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { durationLabel } from "@/lib/constants";
import { agentsQuery, interviewQuery, messagesQuery, formatDuration, type Message } from "@/lib/queries";
import { formatLabel, topicLabel } from "@/lib/constants";
import { isSolo, maxTurns } from "@/lib/engine-rules";
import { MCQ_PAUSE_MS } from "@/lib/mcq-rules";
import { finishInterview, generateTurn, startInterview, synthesizeTurn } from "@/backend/interview.functions";
import { AudioEngine } from "@/lib/audio-engine";
import { ScaledStage } from "@/components/app/StudioStage";
import type { Visual } from "@/components/app/VisualPanel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import { QuestionBankPanel } from "@/components/app/QuestionBankPanel";

export const Route = createFileRoute("/_authenticated/studio/$interviewId")({
  head: () => ({
    meta: [
      { title: "Live Studio — AI Interview Arena" },
      { name: "description", content: "Run an autonomous AI vs AI interview with voices, avatars and subtitles." },
      { property: "og:title", content: "Live Studio — AI Interview Arena" },
      { property: "og:description", content: "Run an autonomous AI vs AI interview." },
    ],
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(interviewQuery(params.interviewId)),
      context.queryClient.ensureQueryData(agentsQuery()),
      context.queryClient.ensureQueryData(messagesQuery(params.interviewId)),
    ]),
  component: StudioPage,
});

type Phase = "idle" | "starting" | "running" | "stopping" | "error" | "finished";
type TurnResult = { ok: true; done: boolean; closing?: boolean; message?: Message } | { ok: false; error: string };

function StudioPage() {
  const { interviewId } = Route.useParams();
  const qc = useQueryClient();
  const { data: iv } = useSuspenseQuery(interviewQuery(interviewId));
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const { data: initialMessages } = useSuspenseQuery(messagesQuery(interviewId));

  const start = useServerFn(startInterview);
  const turn = useServerFn(generateTurn);
  const synth = useServerFn(synthesizeTurn);
  const finish = useServerFn(finishInterview);

  const interviewer = agents.find((a) => a.id === iv.interviewer_agent_id) ?? null;
  const candidate = agents.find((a) => a.id === iv.candidate_agent_id) ?? null;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [phase, setPhase] = useState<Phase>(iv.status === "completed" ? "finished" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<"interviewer" | "candidate" | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [reveal, setReveal] = useState(1);
  const [level, setLevel] = useState(0);
  const [visual, setVisual] = useState<Visual | null>(null);
  // True while the speaking turn is the one that brought the current visual.
  const [visualOwn, setVisualOwn] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [textOnly, setTextOnly] = useState(iv.text_only);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [record, setRecord] = useState(true);
  const [visuals, setVisuals] = useState(() => ({ subtitles: true, code: true, diagrams: true, keyPoints: true, ...(iv.visuals as object) }));
  const [startedAt, setStartedAt] = useState<number | null>(iv.started_at && iv.status === "running" ? new Date(iv.started_at).getTime() : null);
  const [now, setNow] = useState(() => Date.now());

  const engineRef = useRef<AudioEngine | null>(null);
  const stopRef = useRef(false);
  const playAbort = useRef<AbortController | null>(null);
  const sessionRef = useRef<string | null>(null);
  const textOnlyRef = useRef(textOnly);
  textOnlyRef.current = textOnly;

  const total = maxTurns(iv.max_questions);
  const keyPoints = useMemo(() => messages.map((m) => m.key_point).filter(Boolean) as string[], [messages]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Level meter while speaking
  useEffect(() => {
    if (!speaker) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setLevel(engineRef.current?.level() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaker]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
    engineRef.current?.setMuted(muted);
  }, [volume, muted]);

  useEffect(
    () => () => {
      stopRef.current = true;
      playAbort.current?.abort();
      engineRef.current?.close();
    },
    [],
  );

  const agentFor = useCallback((m: Message) => (m.speaker === "interviewer" ? interviewer : candidate), [interviewer, candidate]);

  const nextTurn = useCallback(
    async (sessionId: string): Promise<TurnResult> => {
      try {
        const r = await turn({ data: { interviewId, sessionId } });
        return r.done ? { ok: true, done: true } : { ok: true, done: false, closing: r.closing, message: r.message as Message };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Turn failed" };
      }
    },
    [turn, interviewId],
  );

  const [mcqCountdown, setMcqCountdown] = useState(false);
  const mcqPause = (v: Visual | null) => (v?.type === "mcq" ? { pauseAt: v.revealAt, pauseMs: MCQ_PAUSE_MS, onPause: setMcqCountdown } : {});

  async function present(m: Message, audio: Promise<{ url: string | null; durationMs: number | null }> | null) {
    const agent = agentFor(m);
    setSpeaker(m.speaker as "interviewer" | "candidate");
    setSubtitle(m.content);
    setReveal(0);
    const v = m.visual as Visual | null;
    if (v) setVisual(v);
    setVisualOwn(!!v);
    const rate = Number(agent?.speaking_speed ?? 1) * Number(iv.speaking_speed ?? 1);
    let played = false;
    if (audio) {
      try {
        const { url } = await audio;
        if (url && !stopRef.current) {
          const ac = new AbortController();
          playAbort.current = ac;
          await engineRef.current!.play(url, { rate, signal: ac.signal, onProgress: (t, d) => d && setReveal(t / d), ...mcqPause(v) });
          played = true;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Voice failed", { description: "Showing this turn as text instead." });
      }
    }
    if (!played && !stopRef.current) {
      // Text-only pacing: ~3 words per second adjusted by speed.
      const words = m.content.split(/\s+/).length;
      const ms = Math.min(25_000, Math.max(2500, (words / (3 * rate)) * 1000));
      const startT = performance.now();
      await new Promise<void>((resolve) => {
        const id = setInterval(() => {
          const f = (performance.now() - startT) / ms;
          setReveal(Math.min(1, f));
          if (f >= 1 || stopRef.current) {
            clearInterval(id);
            resolve();
          }
        }, 100);
      });
    }
    setReveal(1);
    setSpeaker(null);
  }

  async function loop(sessionId: string) {
    setPhase("running");
    setError(null);
    setThinking(true);
    type Prepared = { r: TurnResult; audio: ReturnType<typeof synth> | null };
    // Start the voice as soon as a turn's text exists, so the next speaker's
    // audio is ready by the time the current speaker finishes.
    const prepare = (p: Promise<TurnResult>): Promise<Prepared> =>
      p.then((r) => {
        // One automatic retry so a brief voice-provider hiccup doesn't make a turn silent.
        const id = r.ok && !r.done && r.message ? r.message.id : null;
        const audio = id && !textOnlyRef.current
          ? synth({ data: { messageId: id } }).catch(() => new Promise<void>((ok) => setTimeout(ok, 800)).then(() => synth({ data: { messageId: id } })))
          : null;
        audio?.catch(() => {}); // handled when presented
        return { r, audio };
      });
    let pending = prepare(nextTurn(sessionId));
    let finalStatus: "completed" | "stopped" = "completed";
    while (true) {
      if (stopRef.current) {
        finalStatus = "stopped";
        break;
      }
      const { r, audio } = await pending;
      setThinking(false);
      if (!r.ok) {
        setError(r.error);
        setPhase("error");
        return; // Wait for the user to retry or stop.
      }
      if (r.done || !r.message) break;
      const msg = r.message;
      setMessages((prev) => [...prev.filter((x) => x.turn_index !== msg.turn_index), msg]);
      // Pipeline: prepare the next turn's text AND voice while this one plays.
      pending = r.closing ? Promise.resolve({ r: { ok: true, done: true } as TurnResult, audio: null }) : prepare(nextTurn(sessionId));
      await present(msg, audio);
      setThinking(true);
    }
    setThinking(false);
    await finalize(sessionId, stopRef.current ? "stopped" : finalStatus);
  }

  async function finalize(sessionId: string | null, status: "completed" | "stopped" | "failed", err?: string) {
    setPhase("stopping");
    try {
      const blob = await engineRef.current?.stopRecording();
      if (blob && blob.size > 0) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const ext = blob.type.includes("mp4") ? "m4a" : "webm";
          const path = `${u.user.id}/${interviewId}/${Date.now()}.${ext}`;
          const up = await supabase.storage.from("recordings").upload(path, blob, { contentType: blob.type });
          if (up.error) {
            toast.error("Recording could not be saved", { description: up.error.message });
          } else {
            await supabase.from("recordings").insert({
              user_id: u.user.id,
              interview_id: interviewId,
              storage_path: path,
              mime_type: blob.type,
              size_bytes: blob.size,
              duration_ms: startedAt ? Date.now() - startedAt : null,
            });
            toast.success("Audio recording saved");
          }
        }
      }
      const res = await finish({ data: { interviewId, sessionId: sessionId ?? undefined, status, error: err } });
      toast.success(status === "completed" ? "Interview complete — summary generated" : "Interview stopped");
      if (res.youtubeEnded > 0) toast.success("YouTube live broadcast ended");
      else if (res.youtubeError) toast.error("Could not end the YouTube broadcast", { description: `${res.youtubeError} End it from the YouTube Live page.` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish the interview");
    }
    setPhase(status === "completed" ? "finished" : "idle");
    qc.invalidateQueries({ queryKey: ["interview", interviewId] });
    qc.invalidateQueries({ queryKey: ["messages", interviewId] });
    qc.invalidateQueries({ queryKey: ["interviews"] });
    qc.invalidateQueries({ queryKey: ["recordings"] });
    qc.invalidateQueries({ queryKey: ["usage"] });
  }

  async function begin(restart: boolean) {
    if (!interviewer || !candidate) { toast.error("Assign both agents to this interview first."); return; }
    stopRef.current = false;
    setPhase("starting");
    try {
      engineRef.current ??= new AudioEngine();
      await engineRef.current.resume();
      engineRef.current.setVolume(volume);
      engineRef.current.setMuted(muted);
      if (record && !textOnly) engineRef.current.startRecording();
      const { sessionId } = await start({ data: { interviewId, restart } });
      sessionRef.current = sessionId;
      if (restart) {
        setMessages([]);
        setVisual(null);
      }
      setStartedAt(Date.now());
      await loop(sessionId);
    } catch (e) {
      setPhase("idle");
      toast.error(e instanceof Error ? e.message : "Could not start");
    }
  }

  function stop() {
    stopRef.current = true;
    playAbort.current?.abort();
    if (phase === "error") void finalize(sessionRef.current, "stopped");
    else setPhase("stopping");
  }

  async function updateTheme(theme: string) {
    const next = { ...visuals, theme };
    setVisuals(next);
    await supabase.from("interviews").update({ visuals: next }).eq("id", interviewId);
  }

  async function updateVisuals(key: keyof typeof visuals, value: boolean) {
    const next = { ...visuals, [key]: value };
    setVisuals(next);
    await supabase.from("interviews").update({ visuals: next }).eq("id", interviewId);
  }

  const revealed = useMemo(() => {
    const words = subtitle.split(/\s+/);
    const n = Math.ceil(words.length * reveal);
    return words.slice(Math.max(0, n - 45), n).join(" ");
  }, [subtitle, reveal]);

  const running = phase === "running" || phase === "starting" || phase === "stopping";
  const elapsed = startedAt ? now - startedAt : 0;
  const scenePath = `/broadcast/${iv.broadcast_token}`;

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-xl font-bold md:text-2xl">{iv.title}</h1>
            <StatusBadge status={running ? "running" : iv.status === "running" ? "stopped" : phase === "finished" ? "completed" : iv.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {iv.topics?.length > 1 ? `${iv.topics.length} topics` : topicLabel(iv.topic, iv.custom_topic)} · {formatLabel(iv.format)} · {iv.language} · up to {durationLabel(iv.duration_minutes)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="glass" asChild>
            <a href={scenePath} target="_blank" rel="noreferrer">
              <MonitorPlay /> OBS scene
            </a>
          </Button>
          <Button variant="glass" asChild>
            <Link to="/youtube" search={{ interview: interviewId }}>
              <Youtube /> Go live
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border shadow-card">
            <ScaledStage
        solo={isSolo(iv.format)}
        mcqCountdown={mcqCountdown}
        visualProgress={visualOwn ? reveal : 1}
              title={iv.title}
              topic={messages[messages.length - 1]?.topic ?? iv.topics?.[0] ?? topicLabel(iv.topic, iv.custom_topic)}
              formatLabel={formatLabel(iv.format)}
              interviewer={interviewer}
              candidate={candidate}
              speaker={speaker}
              level={level}
              subtitle={revealed}
              subtitleSpeaker={speaker ? (speaker === "interviewer" ? interviewer?.name : candidate?.name) ?? null : null}
              turn={messages.length}
              maxTurns={total}
              elapsedLabel={formatDuration(elapsed)}
              keyPoints={keyPoints}
              visual={visual}
              visuals={visuals}
              theme={(visuals as { theme?: string }).theme}
              live={running}
              status={phase === "finished" ? "Completed" : phase === "error" ? "Paused" : "Standby"}
              thinking={thinking}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
            {!running && phase !== "error" && (
              <>
                {messages.length === 0 ? (
                  <Button variant="hero" size="lg" onClick={() => begin(true)} disabled={!interviewer || !candidate}>
                    <Play /> Start interview
                  </Button>
                ) : (
                  <>
                    {phase !== "finished" && messages.length < total && (
                      <Button variant="hero" size="lg" onClick={() => begin(false)}>
                        <Play /> Continue
                      </Button>
                    )}
                    <Button variant="outline" size="lg" onClick={() => begin(true)}>
                      <RotateCcw /> Start over
                    </Button>
                  </>
                )}
              </>
            )}
            {(running || phase === "error") && (
              <Button variant="live" size="lg" onClick={stop} disabled={phase === "stopping"}>
                {phase === "stopping" ? <Loader2 className="animate-spin" /> : <Square />} {phase === "stopping" ? "Finishing…" : "Stop"}
              </Button>
            )}
            {phase === "error" && sessionRef.current && (
              <Button variant="hero" size="lg" onClick={() => loop(sessionRef.current!)}>
                <RotateCcw /> Retry turn
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <VolumeX /> : <Volume2 />}
              </Button>
              <Slider className="w-32" value={[volume * 100]} max={100} step={5} onValueChange={(v) => setVolume((v[0] ?? 100) / 100)} aria-label="Volume" />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <div className="font-semibold">The show paused</div>
                <div className="text-muted-foreground">{error}</div>
              </div>
            </div>
          )}
          {(!interviewer || !candidate) && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
              This interview is missing an agent. <Link to="/interviews/new" className="text-primary underline">Create a new interview</Link> with both agents.
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {iv.format === "mcq" && <QuestionBankPanel interviewId={iv.id} disabled={running} />}
          <div className="space-y-4 rounded-2xl border bg-card p-4">
            <h3 className="font-semibold">Production controls</h3>
            <Toggle icon={Mic} label="Voices" hint="Off = text-only mode" checked={!textOnly} onChange={(v) => setTextOnly(!v)} disabled={running} />
            <Toggle icon={Mic} label="Record audio" hint="Saved to Recordings when the show ends" checked={record && !textOnly} onChange={setRecord} disabled={running || textOnly} />
            <Toggle icon={Volume2} label="Studio speakers muted" hint="Use when the OBS scene plays the audio" checked={muted} onChange={setMuted} />
            <div className="border-t pt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Stage theme</div>
            <div className="grid grid-cols-2 gap-2">
              {STAGE_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.hint}
                  onClick={() => updateTheme(t.id)}
                  className={cn("flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-medium", stageTheme((visuals as { theme?: string }).theme).id === t.id ? "border-primary bg-primary/10" : "hover:bg-muted")}
                >
                  <span className="h-5 w-5 shrink-0 rounded" style={{ background: `linear-gradient(135deg, ${t.canvas.bg1}, ${t.canvas.primary})` }} />
                  {t.label}
                </button>
              ))}
            </div>
            <div className="border-t pt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">On-screen visuals</div>
            <Toggle icon={Captions} label="Subtitles" checked={visuals.subtitles} onChange={(v) => updateVisuals("subtitles", v)} />
            <Toggle icon={Code2} label="Code snippets" checked={visuals.code} onChange={(v) => updateVisuals("code", v)} />
            <Toggle icon={Workflow} label="Diagrams" checked={visuals.diagrams} onChange={(v) => updateVisuals("diagrams", v)} />
            <Toggle icon={Sparkles} label="Key points" checked={visuals.keyPoints} onChange={(v) => updateVisuals("keyPoints", v)} />
            <p className="flex gap-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" /> Avatars are animated portraits driven by the voice level — not lip-synced video.
            </p>
          </div>

          <div className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">Transcript</h3>
              <span className="text-xs text-muted-foreground">{messages.length} turns</span>
            </div>
            <div className="max-h-[480px] space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && <p className="text-sm text-muted-foreground">The conversation will appear here once the show starts.</p>}
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <div className={cn("text-xs font-semibold", m.speaker === "interviewer" ? "text-primary" : "text-secondary")}>
                    {agentFor(m)?.name ?? m.speaker}
                  </div>
                  <p className="text-foreground/90">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Toggle({ icon: Icon, label, hint, checked, onChange, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <Label className="text-sm">{label}</Label>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
