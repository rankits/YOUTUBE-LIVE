import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, ListChecks, Mic2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agentsQuery, type AgentWithAvatar } from "@/lib/queries";
import { DIFFICULTIES, DURATIONS, FORMATS, INTERVIEW_STYLES, LANGUAGES, LEVELS, TOPICS, durationLabel, formatLabel } from "@/lib/constants";
import { isSolo, MAX_DURATION_MINUTES, MAX_QUESTIONS, maxTurns, suggestedQuestions } from "@/lib/engine-rules";
import { Page, PageHeader } from "@/components/app/AppShell";
import { AgentAvatar } from "@/components/app/AgentAvatar";
import { DefaultAgentsButton } from "@/components/app/DefaultAgentsButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/interviews/new")({
  head: () => ({
    meta: [
      { title: "Create Interview — AI Interview Arena" },
      { name: "description", content: "Configure topic, format, agents, language and duration for a new AI interview." },
      { property: "og:title", content: "Create Interview — AI Interview Arena" },
      { property: "og:description", content: "Configure a new AI vs AI interview." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery()),
  component: CreateInterview,
});

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateInterview() {
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const navigate = useNavigate();
  const qc = useQueryClient();
  const interviewers = agents.filter((a) => a.role !== "candidate");
  const candidates = agents.filter((a) => a.role !== "interviewer");

  const [f, setF] = useState({
    topic: "React.js",
    custom_topic: "",
    format: "technical",
    difficulty: "intermediate",
    duration: 10,
    customDuration: false,
    language: "english",
    max_questions: 8,
    max_response_words: 120,
    temperature: 0.8,
    speaking_speed: 1,
    interview_style: "balanced",
    topic_depth: "medium",
    followup_frequency: "medium",
    interviewer: interviewers[0]?.id ?? "",
    candidate: candidates.find((c) => c.id !== interviewers[0]?.id)?.id ?? candidates[0]?.id ?? "",
    text_only: false,
    title: "",
    multi: false,
    playlist: [] as string[],
    extraTopics: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  // Pre-select host + guest once agents exist (e.g. right after adding the default agents).
  useEffect(() => {
    setF((p) => {
      const interviewer = p.interviewer || interviewers[0]?.id || "";
      const candidate = p.candidate || candidates.find((c) => c.id !== interviewer)?.id || "";
      return interviewer === p.interviewer && candidate === p.candidate ? p : { ...p, interviewer, candidate };
    });
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!f.interviewer || (!isSolo(f.format) && !f.candidate)) { toast.error("Pick both an interviewer and a candidate agent."); return; }
    const lecture = isSolo(f.format);
    if (!lecture && f.interviewer === f.candidate) { toast.error("Interviewer and candidate must be different agents."); return; }
    const playlist = f.multi
      ? [...f.playlist.filter((t) => t !== "Custom Topic"), ...f.extraTopics.split(",").map((t) => t.trim()).filter(Boolean)]
          .map((t) => t.slice(0, 300))
          .slice(0, 30)
      : [];
    if (f.multi && playlist.length < 2) { toast.error("Pick at least 2 topics for a multi-topic show."); return; }
    if (!f.multi && f.topic === "Custom Topic" && !f.custom_topic.trim()) { toast.error("Enter your custom topic."); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const topicName = f.multi ? `${playlist.length} topics` : f.topic === "Custom Topic" ? f.custom_topic.trim() : f.topic;
    const { data, error } = await supabase
      .from("interviews")
      .insert({
        user_id: u.user!.id,
        title: f.title.trim() || `${formatLabel(f.format)}: ${topicName}`.slice(0, 160),
        topic: f.multi ? playlist[0]! : f.topic,
        custom_topic: !f.multi && f.topic === "Custom Topic" ? f.custom_topic.trim().slice(0, 300) : null,
        topics: playlist,
        format: f.format,
        difficulty: f.difficulty,
        duration_minutes: f.duration,
        language: f.language,
        max_questions: f.max_questions,
        max_response_words: f.max_response_words,
        temperature: f.temperature,
        speaking_speed: f.speaking_speed,
        interview_style: f.interview_style,
        topic_depth: f.topic_depth,
        followup_frequency: f.followup_frequency,
        interviewer_agent_id: f.interviewer,
        candidate_agent_id: lecture ? f.interviewer : f.candidate,
        text_only: f.text_only,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Could not create interview"); return; }
    qc.invalidateQueries({ queryKey: ["interviews"] });
    navigate({ to: "/studio/$interviewId", params: { interviewId: data.id } });
  }

  return (
    <>
      <PageHeader title={f.format === "mcq" ? "Create MCQ quiz" : isSolo(f.format) ? "Create solo lecture" : "Create interview"} description={isSolo(f.format) ? "Pick a course or topics — one teacher explains everything with examples and diagrams." : "Set up the show — the two agents take it from there."} />
      <Page className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Show type">
            {([
              { mode: "interview", icon: Mic2, title: "AI vs AI Interview", text: "Host asks, guest answers — two agents." },
              { mode: "lecture", icon: GraduationCap, title: "Solo Lecture / Course", text: "One teacher explains the full course step by step." },
              { mode: "mcq", icon: ListChecks, title: "Competitive Exam MCQ", text: "Question + 4 options, 2-second pause, correct answer turns green." },
            ] as const).map((m) => {
              const current = isSolo(f.format) ? f.format : "interview";
              const active = current === m.mode;
              return (
                <button
                  key={m.title}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set("format", m.mode !== "interview" ? m.mode : isSolo(f.format) ? "technical" : f.format)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors",
                    active ? "border-primary bg-primary/10 shadow-glow" : "hover:border-primary/50",
                  )}
                >
                  <m.icon className={cn("mt-0.5 h-6 w-6 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <span>
                    <span className="block font-semibold">{m.title}</span>
                    <span className="block text-sm text-muted-foreground">{m.text}</span>
                  </span>
                </button>
              );
            })}
          </section>
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{f.multi ? `Topics (${f.playlist.filter((t) => t !== "Custom Topic").length + f.extraTopics.split(",").filter((t) => t.trim()).length} selected)` : "Topic"}</h2>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Multiple topics
                <Switch checked={f.multi} onCheckedChange={(v) => set("multi", v)} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    f.multi
                      ? set("playlist", f.playlist.includes(t) ? f.playlist.filter((x) => x !== t) : [...f.playlist, t])
                      : set("topic", t)
                  }
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    (f.multi ? f.playlist.includes(t) : f.topic === t) ? "border-primary bg-primary/15 text-foreground shadow-glow" : "text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {!f.multi && f.topic === "Custom Topic" && (
              <Input className="mt-4" maxLength={300} placeholder="e.g. Should startups adopt Rust in 2026?" value={f.custom_topic} onChange={(e) => set("custom_topic", e.target.value)} />
            )}
            {f.multi && (
              <div className="mt-4 space-y-2">
                <Input maxLength={1000} placeholder="More topics, comma separated (e.g. Rust, Kubernetes, Web3)" value={f.extraTopics} onChange={(e) => set("extraTopics", e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Topics run in the order you pick them. The show time is split evenly, and the host moves to the next topic on their own.
                </p>
              </div>
            )}
          </section>

          <section className="grid gap-4 rounded-2xl border bg-card p-5 md:grid-cols-2">
            <h2 className="font-semibold md:col-span-2">Show settings</h2>
            <Field label="Episode title (optional)" className="md:col-span-2">
              <Input maxLength={160} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Auto-generated if empty" />
            </Field>
            {!isSolo(f.format) && (
              <Field label="Format">
                <Pick value={f.format} onChange={(v) => set("format", v)} options={FORMATS.filter((o) => !isSolo(o.value))} />
              </Field>
            )}
            <Field label="Difficulty">
              <Pick value={f.difficulty} onChange={(v) => set("difficulty", v)} options={DIFFICULTIES} />
            </Field>
            <Field label="Language">
              <Pick value={f.language} onChange={(v) => set("language", v)} options={LANGUAGES} />
            </Field>
            <Field label="Duration">
              <div className="flex gap-2">
                <Select
                  value={f.customDuration ? "custom" : String(f.duration)}
                  onValueChange={(v) =>
                    v === "custom"
                      ? set("customDuration", true)
                      : setF((p) => ({ ...p, customDuration: false, duration: Number(v), max_questions: suggestedQuestions(Number(v)) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {durationLabel(d)}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {f.customDuration && <Input type="number" min={1} max={MAX_DURATION_MINUTES} className="w-24" value={f.duration} onChange={(e) => { const d = Math.min(MAX_DURATION_MINUTES, Math.max(1, Number(e.target.value))); setF((p) => ({ ...p, duration: d, max_questions: suggestedQuestions(d) })); }} />}
              </div>
            </Field>
            {!isSolo(f.format) && (
              <Field label="Interview style">
                <Pick value={f.interview_style} onChange={(v) => set("interview_style", v)} options={INTERVIEW_STYLES} />
              </Field>
            )}
            <Field label="Topic depth">
              <Pick value={f.topic_depth} onChange={(v) => set("topic_depth", v)} options={LEVELS} />
            </Field>
            {!isSolo(f.format) && (
              <Field label="Follow-up frequency">
                <Pick value={f.followup_frequency} onChange={(v) => set("followup_frequency", v)} options={LEVELS} />
              </Field>
            )}
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <Label>Text-only mode</Label>
                <div className="text-xs text-muted-foreground">No voices, subtitles only</div>
              </div>
              <Switch checked={f.text_only} onCheckedChange={(v) => set("text_only", v)} />
            </div>
          </section>

          <section className="grid gap-6 rounded-2xl border bg-card p-5 md:grid-cols-2">
            <h2 className="font-semibold md:col-span-2">Limits & tuning</h2>
            <SliderField label="Maximum questions" value={f.max_questions} min={1} max={MAX_QUESTIONS} step={1} onChange={(v) => set("max_questions", v)} suffix={` · ${maxTurns(f.max_questions)} turns max`} />
            {f.duration >= 120 && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground md:col-span-2">
                Long show ({durationLabel(f.duration)}, up to {maxTurns(f.max_questions)} turns): keep the Studio tab open the whole time, and raise the daily turn limit in Settings above {maxTurns(f.max_questions)}.
              </p>
            )}
            <SliderField label="Max response length" value={f.max_response_words} min={20} max={400} step={10} onChange={(v) => set("max_response_words", v)} suffix=" words" />
            <SliderField label="Conversation temperature" value={f.temperature} min={0} max={1.5} step={0.05} onChange={(v) => set("temperature", v)} />
            <SliderField label="Speaking speed" value={f.speaking_speed} min={0.5} max={2} step={0.05} onChange={(v) => set("speaking_speed", v)} suffix="×" />
          </section>
        </div>

        <aside className="space-y-4">
          {agents.length < (isSolo(f.format) ? 1 : 2) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-card p-4">
              <p className="text-sm text-muted-foreground">Need a host and a guest? Add the ready-made pair with free voices.</p>
              <DefaultAgentsButton existingNames={agents.map((a) => a.name)} variant="hero" />
            </div>
          )}
          <AgentPicker title={isSolo(f.format) ? "Teacher (solo lecture)" : "Interviewer / Host"} agents={isSolo(f.format) ? agents : interviewers} value={f.interviewer} onChange={(v) => set("interviewer", v)} tone="primary" />
          {f.format === "mcq" && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">MCQ quiz: the teacher reads each question and 4 options, waits 2 seconds, then says the answer and it turns green. Set Questions to how many MCQs you want; pick Hindi in Language.</p>}
          {f.format === "lecture" && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Solo lecture: one teacher explains the whole course step by step with examples, code and diagrams. Pick 3–5 hours in Duration for a full course.</p>}
          {!isSolo(f.format) && <AgentPicker title="Candidate / Guest" agents={candidates} value={f.candidate} onChange={(v) => set("candidate", v)} tone="secondary" />}
          <Button variant="hero" size="lg" className="w-full" disabled={busy} onClick={create}>
            <Wand2 /> {busy ? "Creating…" : isSolo(f.format) ? "Create lecture & open studio" : "Create & open studio"}
          </Button>
        </aside>
      </Page>
    </>
  );
}

function SliderField({ label, value, min, max, step, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-mono text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} />
    </div>
  );
}

function AgentPicker({ title, agents, value, onChange, tone }: { title: string; agents: AgentWithAvatar[]; value: string; onChange: (v: string) => void; tone: "primary" | "secondary" }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents for this role yet — add the default agents above or create one in AI Agents.</p>}
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => onChange(a.id)}
            className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors", value === a.id ? (tone === "primary" ? "border-primary bg-primary/10" : "border-secondary bg-secondary/10") : "hover:bg-accent/40")}
          >
            <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} presetKey={a.preset_avatar} role={a.role} speaking={false} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{a.name}</div>
              <div className="truncate text-xs text-muted-foreground">{a.personality}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
