import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Play, Download, Clapperboard, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agentsQuery, formatDuration, interviewDurationMs, interviewQuery, messagesQuery } from "@/lib/queries";
import { formatLabel, modelLabel, topicLabel } from "@/lib/constants";
import { Page, PageHeader, StatusBadge } from "@/components/app/AppShell";
import { AgentAvatar } from "@/components/app/AgentAvatar";
import { VisualPanel, type Visual } from "@/components/app/VisualPanel";
import { McqBoard } from "@/components/app/McqBoard";
import { ShortsDialog } from "@/components/app/ShortsDialog";
import { BatchShortsDialog } from "@/components/app/BatchShortsDialog";
import type { McqVisual } from "@/lib/mcq-rules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/history/$interviewId")({
  head: () => ({
    meta: [
      { title: "Transcript — AI Interview Arena" },
      { name: "description", content: "Full transcript, summary and replay of an AI interview." },
      { property: "og:title", content: "Transcript — AI Interview Arena" },
      { property: "og:description", content: "Full transcript of an AI interview." },
    ],
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(interviewQuery(params.interviewId)),
      context.queryClient.ensureQueryData(messagesQuery(params.interviewId)),
      context.queryClient.ensureQueryData(agentsQuery()),
    ]),
  component: Transcript,
});

function Transcript() {
  const { interviewId } = Route.useParams();
  const { data: iv } = useSuspenseQuery(interviewQuery(interviewId));
  const { data: msgs } = useSuspenseQuery(messagesQuery(interviewId));
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const [playing, setPlaying] = useState<string | null>(null);
  const agent = (id: string | null) => agents.find((a) => a.id === id);

  async function play(path: string, id: string) {
    setPlaying(id);
    const { data } = await supabase.storage.from("interview-audio").createSignedUrl(path, 600);
    if (!data?.signedUrl) return setPlaying(null);
    const a = new Audio(data.signedUrl);
    a.onended = () => setPlaying(null);
    await a.play().catch(() => setPlaying(null));
  }

  function download() {
    const lines = msgs.map((m) => `${agent(m.agent_id)?.name ?? m.speaker}: ${m.content}`);
    const blob = new Blob([`${iv.title}\n${topicLabel(iv.topic, iv.custom_topic)}\n\n${iv.summary ?? ""}\n\n${lines.join("\n\n")}`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${iv.title.replace(/[^\w]+/g, "-")}.txt`;
    a.click();
  }

  return (
    <>
      <PageHeader
        title={iv.title}
        description={`${topicLabel(iv.topic, iv.custom_topic)} · ${formatLabel(iv.format)} · ${iv.language} · ${iv.started_at ? format(new Date(iv.started_at), "d MMM yyyy, HH:mm") : "not started"}`}
        actions={
          <>
            <Button variant="outline" onClick={download}>
              <Download /> Transcript
            </Button>
            <Button variant="hero" asChild>
              <Link to="/studio/$interviewId" params={{ interviewId }}>
                <Clapperboard /> Open in studio
              </Link>
            </Button>
          </>
        }
      />
      <Page className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {msgs.length === 0 && <p className="text-muted-foreground">No turns recorded yet.</p>}
          {msgs.map((m) => {
            const a = agent(m.agent_id);
            return (
              <div key={m.id} className={cn("flex gap-4", m.speaker === "candidate" && "flex-row-reverse text-right")}>
                <AgentAvatar name={a?.name ?? m.speaker} avatarUrl={a?.avatarUrl} presetKey={a?.preset_avatar} role={m.speaker} speaking={playing === m.id} size="sm" tone={m.speaker === "interviewer" ? "primary" : "secondary"} />
                <div className={cn("max-w-[75%] space-y-2 rounded-2xl border p-4", m.speaker === "interviewer" ? "bg-primary/5" : "bg-secondary/5")}>
                  <div className={cn("flex items-center gap-2 text-xs", m.speaker === "candidate" && "justify-end")}>
                    <span className="font-semibold">{a?.name ?? m.speaker}</span>
                    <span className="text-muted-foreground">
                      #{m.turn_index + 1} · {m.model ? modelLabel(m.model) : ""}
                    </span>
                    {m.audio_path && (
                      <button onClick={() => play(m.audio_path!, m.id)} className="text-primary" aria-label="Play turn audio">
                        {playing === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{m.content}</p>
                  {m.visual && (m.visual as { type?: string }).type === "mcq" ? (
                    <div className="space-y-2 text-left">
                      <McqBoard mcq={m.visual as McqVisual} revealed countdown={false} />
                      {m.audio_path && <ShortsDialog mcq={m.visual as McqVisual} audioPath={m.audio_path} topic={m.topic ?? topicLabel(iv.topic, iv.custom_topic)} theme={(iv.visuals as { theme?: string } | null)?.theme} />}
                    </div>
                  ) : m.visual ? (
                    <div className="text-left">
                      <VisualPanel visual={m.visual as Visual} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <aside className="space-y-4">
          {msgs.some((m) => m.audio_path && (m.visual as { type?: string } | null)?.type === "mcq") && (
            <BatchShortsDialog
              items={msgs.filter((m) => m.audio_path && (m.visual as { type?: string } | null)?.type === "mcq").map((m) => ({ mcq: m.visual as McqVisual, audioPath: m.audio_path!, topic: m.topic ?? topicLabel(iv.topic, iv.custom_topic) }))}
              theme={(iv.visuals as { theme?: string } | null)?.theme}
            />
          )}
          <div className="rounded-2xl border bg-card p-4 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Episode</h3>
              <StatusBadge status={iv.status} />
            </div>
            <dl className="space-y-2">
              <Row k="Duration" v={formatDuration(interviewDurationMs(iv))} />
              <Row k="Turns" v={String(iv.turn_count)} />
              <Row k="Host" v={agent(iv.interviewer_agent_id)?.name ?? "—"} />
              <Row k="Guest" v={agent(iv.candidate_agent_id)?.name ?? "—"} />
              <Row k="Tokens" v={msgs.reduce((s, m) => s + m.prompt_tokens + m.completion_tokens, 0).toLocaleString()} />
            </dl>
            {iv.youtube_broadcast_url && (
              <a href={iv.youtube_broadcast_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-primary hover:underline">
                YouTube broadcast <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-4 text-sm">
            <h3 className="mb-2 font-semibold">AI summary</h3>
            <p className="whitespace-pre-line text-muted-foreground">{iv.summary ?? "A summary is generated when the interview finishes."}</p>
          </div>
        </aside>
      </Page>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
