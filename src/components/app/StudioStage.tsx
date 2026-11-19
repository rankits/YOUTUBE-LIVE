import { McqBoard } from "./McqBoard";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import studioBg from "@/assets/studio-bg.jpg";
import { cn } from "@/lib/utils";
import { AgentAvatar, Waveform } from "./AgentAvatar";
import { VisualPanel, type Visual } from "./VisualPanel";

export type StageAgent = {
  name: string;
  personality: string;
  avatarUrl?: string | null;
  preset_avatar?: string | null;
  role?: string;
};

export type StageProps = {
  title: string;
  topic: string;
  formatLabel: string;
  interviewer: StageAgent | null;
  candidate: StageAgent | null;
  speaker: "interviewer" | "candidate" | null;
  level: number;
  subtitle: string;
  subtitleSpeaker: string | null;
  turn: number;
  maxTurns: number;
  elapsedLabel: string;
  keyPoints: string[];
  visual: Visual | null;
  visuals: { subtitles: boolean; code: boolean; diagrams: boolean; keyPoints: boolean };
  live: boolean;
  status: string;
  branding?: string | null;
  thinking?: boolean;
  /** Solo lecture: one teacher, wide teaching board. */
  solo?: boolean;
  /** 0..1 progress of the turn that owns the current visual (drives code scroll + pen). */
  visualProgress?: number;
  /** MCQ quiz: true while the 2-second answer countdown runs. */
  mcqCountdown?: boolean;
  /** Stage theme id from src/lib/stage-themes.ts. */
  theme?: string | undefined;
};

function AgentPanel({ agent, side, speaking, level, label }: { agent: StageAgent | null; side: "left" | "right"; speaking: boolean; level: number; label: string }) {
  const tone = side === "left" ? "primary" : "secondary";
  return (
    <div className={cn("flex flex-col items-center gap-4 transition-all duration-500", speaking ? "opacity-100" : "opacity-75")}>
      <AgentAvatar name={agent?.name ?? label} avatarUrl={agent?.avatarUrl} presetKey={agent?.preset_avatar} role={side === "left" ? "interviewer" : "candidate"} speaking={speaking} level={level} tone={tone} size="xl" />
      <div className="text-center">
        <div className={cn("text-[11px] font-semibold uppercase tracking-[0.2em]", tone === "primary" ? "text-primary" : "text-secondary")}>{label}</div>
        <div className="font-display text-2xl font-bold">{agent?.name ?? "—"}</div>
        <div className="text-sm text-muted-foreground">{agent?.personality}</div>
      </div>
      <div className="w-48">
        <Waveform active={speaking} level={level} tone={tone} />
      </div>
      <div className={cn("flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium", speaking ? "glass text-foreground" : "text-muted-foreground")}>
        <span className={cn("h-2 w-2 rounded-full", speaking ? (tone === "primary" ? "bg-primary animate-live-pulse" : "bg-secondary animate-live-pulse") : "bg-muted-foreground/40")} />
        {speaking ? "Speaking" : "Listening"}
      </div>
    </div>
  );
}

/** The 16:9 broadcast composition, used by both the studio and the OBS scene. */
export function StudioStage(p: StageProps) {
  const showVisual = p.visual && ((p.visual.type === "code" && p.visuals.code) || (p.visual.type === "mermaid" && p.visuals.diagrams));
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-2xl bg-background", `stage-theme-${p.theme ?? "studio"}`)}>
      {!p.theme || p.theme === "studio" ? (
        <img src={studioBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" width={1920} height={1088} />
      ) : (
        <div className="stage-bg absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/30 to-background/95" />
      <div className="absolute inset-0 bg-stage-glow" />

      <div className="absolute left-0 top-0 flex origin-top-left flex-col" style={{ width: 1280, height: 720, transform: "scale(var(--stage-scale, 0.5))" }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-10 pt-7">
          <div className="flex items-center gap-4">
            {p.live ? (
              <span className="flex items-center gap-2 rounded-md bg-live px-3 py-1.5 text-sm font-bold uppercase tracking-widest">
                <span className="h-2 w-2 rounded-full bg-foreground animate-live-pulse" /> Live
              </span>
            ) : (
              <span className="rounded-md glass px-3 py-1.5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{p.status}</span>
            )}
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">{p.formatLabel}</div>
              <div className="font-display text-3xl font-bold">{p.topic}</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Turn</div>
              <div className="font-mono text-2xl font-semibold">
                {p.turn}/{p.maxTurns}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Time</div>
              <div className="font-mono text-2xl font-semibold">{p.elapsedLabel}</div>
            </div>
            {p.branding && <div className="rounded-lg glass px-4 py-2 font-display text-lg font-bold text-gradient-primary">{p.branding}</div>}
          </div>
        </div>
        <div className="mx-10 mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full bg-gradient-primary" animate={{ width: `${Math.min(100, (p.turn / Math.max(1, p.maxTurns)) * 100)}%` }} />
        </div>

        {/* Stage */}
        <div className="relative flex flex-1 items-center justify-between px-12">
          <AgentPanel agent={p.interviewer} side="left" speaking={p.speaker === "interviewer"} level={p.level} label={p.solo ? "Teacher" : "Host"} />
          <div className="mx-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-6">
            <AnimatePresence mode="wait">
              {p.visual?.type === "mcq" ? (
                <motion.div key={`mcq-${p.visual.number}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full max-w-[800px]">
                  <McqBoard mcq={p.visual} countdown={!!p.mcqCountdown} revealed={!p.mcqCountdown && (p.visualProgress ?? 1) >= p.visual.revealAt} />
                </motion.div>
              ) : showVisual ? (
                <motion.div key="visual" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={cn("w-full", p.solo ? "max-w-[760px]" : "max-w-[520px]")}>
                  <VisualPanel visual={p.visual!} progress={p.visualProgress} maxHeight={p.solo ? 380 : 300} />
                </motion.div>
              ) : p.visuals.keyPoints && p.keyPoints.length ? (
                <motion.div key="kp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-[480px] space-y-3">
                  <div className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Key points</div>
                  {p.keyPoints.slice(-4).map((k, i, arr) => (
                    <motion.div
                      key={k + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: i === arr.length - 1 ? 1 : 0.6, x: 0 }}
                      className={cn("flex items-start gap-3 rounded-xl px-5 py-3 text-base", i === arr.length - 1 ? "glass shadow-glow" : "bg-surface/40")}
                    >
                      <Sparkles className="mt-1 h-5 w-5 shrink-0 text-primary" />
                      <span>{k}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : p.thinking ? (
                <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-lg text-muted-foreground">
                  Preparing the next turn…
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          {!p.solo && <AgentPanel agent={p.candidate} side="right" speaking={p.speaker === "candidate"} level={p.level} label="Guest" />}
        </div>

        {/* Subtitles */}
        <div className="px-12 pb-8">
          {p.visuals.subtitles && p.subtitle ? (
            <div className="mx-auto max-w-[1500px] rounded-2xl glass px-8 py-5">
              {p.subtitleSpeaker && <div className="mb-1 text-sm font-semibold uppercase tracking-widest text-primary">{p.subtitleSpeaker}</div>}
              <p className="line-clamp-3 text-[24px] font-medium leading-snug">{p.subtitle}</p>
            </div>
          ) : (
            <div className="h-[120px]" />
          )}
        </div>
      </div>
    </div>
  );
}

/** Wraps the fixed 1280x720 stage canvas and scales it to the container width. */
export function ScaledStage(props: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => el.style.setProperty("--stage-scale", String(el.clientWidth / 1280));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full">
      <StudioStage {...props} />
    </div>
  );
}
