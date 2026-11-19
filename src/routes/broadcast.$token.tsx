import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { getBroadcastState } from "@/backend/broadcast.functions";
import { AudioEngine } from "@/lib/audio-engine";
import { StudioStage } from "@/components/app/StudioStage";
import type { Visual } from "@/components/app/VisualPanel";
import { formatLabel, topicLabel } from "@/lib/constants";
import { isSolo, maxTurns } from "@/lib/engine-rules";
import { MCQ_PAUSE_MS } from "@/lib/mcq-rules";
import { formatDuration } from "@/lib/queries";

export const Route = createFileRoute("/broadcast/$token")({
  ssr: false,
  validateSearch: (s) => z.object({ audio: z.coerce.number().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Broadcast scene — AI Interview Arena" },
      { name: "description", content: "Clean 1920×1080 broadcast scene for OBS Browser Source." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Broadcast scene — AI Interview Arena" },
      { property: "og:description", content: "Clean broadcast scene for OBS." },
    ],
  }),
  component: BroadcastScene,
});

type State = Awaited<ReturnType<typeof getBroadcastState>>;
type Found = Extract<State, { found: true }>;
type SceneMsg = Found["messages"][number];

function BroadcastScene() {
  const { token } = Route.useParams();
  const { audio } = Route.useSearch();
  const audioOn = audio !== 0;
  const fetchState = useServerFn(getBroadcastState);

  const [state, setState] = useState<Found | null>(null);
  const [missing, setMissing] = useState(false);
  const [needsClick, setNeedsClick] = useState(false);
  const [speaker, setSpeaker] = useState<"interviewer" | "candidate" | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [reveal, setReveal] = useState(1);
  const [level, setLevel] = useState(0);
  const [visual, setVisual] = useState<Visual | null>(null);
  // True while the speaking turn is the one that brought the current visual.
  const [visualOwn, setVisualOwn] = useState(false);
  const [liveTopic, setLiveTopic] = useState<string | null>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [turn, setTurn] = useState(0);
  const [mcqCountdown, setMcqCountdown] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const queue = useRef<Map<number, SceneMsg & { seenAt: number }>>(new Map());
  const lastPresented = useRef<number | null>(null);
  const busy = useRef(false);
  const engine = useRef<AudioEngine | null>(null);

  // Stage scales to the full window (OBS sets 1920x1080).
  useEffect(() => {
    const apply = () => document.documentElement.style.setProperty("--stage-scale", String(window.innerWidth / 1280));
    apply();
    window.addEventListener("resize", apply);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("resize", apply);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    engine.current = new AudioEngine();
    return () => {
      engine.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!speaker) return setLevel(0);
    let raf = 0;
    const tick = () => {
      setLevel(engine.current?.level() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaker]);

  // Poll for new turns.
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const after = lastPresented.current ?? -1;
        const s = await fetchState({ data: { token, afterTurn: after } });
        if (!alive) return;
        if (!s.found) return setMissing(true);
        setState(s);
        if (lastPresented.current === null) {
          // Joining mid-show: start from the newest turn instead of replaying everything.
          const latest = s.interview.turn_count - 1;
          lastPresented.current = s.interview.status === "running" ? Math.max(-1, latest - 1) : latest;
          setTurn(Math.max(0, s.interview.turn_count));
          setKeyPoints(((s.interview.key_points as string[] | null) ?? []).slice(-4));
        }
        for (const m of s.messages) {
          const prev = queue.current.get(m.turn_index);
          queue.current.set(m.turn_index, { ...m, seenAt: prev?.seenAt ?? Date.now() });
        }
        void drain();
      } catch {
        /* network blip — keep polling */
      }
    }
    poll();
    const id = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function drain() {
    if (busy.current || lastPresented.current === null) return;
    const next = queue.current.get(lastPresented.current + 1);
    if (!next) return;
    // Wait up to 90s for the voice so a slow clip is never skipped silently.
    const waitedLong = Date.now() - next.seenAt > 90_000;
    if (audioOn && !next.audioUrl && !waitedLong) return; // wait for the voice clip
    busy.current = true;
    try {
      setSpeaker(next.speaker as "interviewer" | "candidate");
      setSubtitle(next.content);
      setReveal(0);
      setTurn(next.turn_index + 1);
      if (next.visual) setVisual(next.visual as Visual);
      setVisualOwn(!!next.visual);
      if (next.topic) setLiveTopic(next.topic);
      if (next.key_point) setKeyPoints((k) => [...k, next.key_point!].slice(-4));
      let played = false;
      if (audioOn && next.audioUrl && engine.current) {
        try {
          const v = next.visual as Visual | null;
          await engine.current.play(next.audioUrl, { onProgress: (t, d) => d && setReveal(t / d), ...(v?.type === "mcq" ? { pauseAt: v.revealAt, pauseMs: MCQ_PAUSE_MS, onPause: setMcqCountdown } : {}) });
          played = true;
        } catch (e) {
          if (e instanceof DOMException && e.name === "NotAllowedError") setNeedsClick(true);
        }
      }
      if (!played) {
        const ms = Math.min(20_000, Math.max(2500, (next.content.split(/\s+/).length / 3) * 1000));
        const t0 = performance.now();
        await new Promise<void>((r) => {
          const id = setInterval(() => {
            const f = (performance.now() - t0) / ms;
            setReveal(Math.min(1, f));
            if (f >= 1) {
              clearInterval(id);
              r();
            }
          }, 100);
        });
      }
      queue.current.delete(next.turn_index);
      lastPresented.current = next.turn_index;
    } finally {
      setReveal(1);
      setSpeaker(null);
      busy.current = false;
    }
    void drain();
  }

  const revealed = useMemo(() => {
    const words = subtitle.split(/\s+/);
    const n = Math.ceil(words.length * reveal);
    return words.slice(Math.max(0, n - 45), n).join(" ");
  }, [subtitle, reveal]);

  if (missing) {
    return <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">This broadcast scene link is not valid.</div>;
  }
  if (!state) return <div className="h-screen bg-background" />;

  const iv = state.interview;
  const interviewer = state.agents.find((a) => a.id === iv.interviewer_agent_id) ?? null;
  const candidate = state.agents.find((a) => a.id === iv.candidate_agent_id) ?? null;
  const visuals = { subtitles: true, code: true, diagrams: true, keyPoints: true, ...((iv.visuals as object) ?? {}) };
  const elapsed = iv.started_at ? now - new Date(iv.started_at).getTime() : 0;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <StudioStage
        solo={isSolo(iv.format)}
        mcqCountdown={mcqCountdown}
        visualProgress={visualOwn ? reveal : 1}
        title={iv.title}
        topic={liveTopic ?? topicLabel(iv.topic, iv.custom_topic)}
        formatLabel={formatLabel(iv.format)}
        interviewer={interviewer}
        candidate={candidate}
        speaker={speaker}
        level={level}
        subtitle={revealed}
        subtitleSpeaker={speaker ? ((speaker === "interviewer" ? interviewer?.name : candidate?.name) ?? null) : null}
        turn={turn}
        maxTurns={maxTurns(iv.max_questions)}
        elapsedLabel={iv.status === "running" ? formatDuration(elapsed) : "--:--"}
        keyPoints={keyPoints}
        visual={visual}
        visuals={visuals}
        theme={(visuals as { theme?: string }).theme}
        live={iv.status === "running"}
        status={iv.status === "completed" ? "Ended" : "Starting soon"}
        branding={state.branding}
      />
      {needsClick && (
        <button
          className="fixed inset-0 flex items-center justify-center bg-background/70 text-lg font-semibold"
          onClick={async () => {
            await engine.current?.resume();
            setNeedsClick(false);
          }}
        >
          Click to enable audio
        </button>
      )}
    </div>
  );
}
