import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Pencil, Plus, Trash2, Volume2, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agentsQuery, type AgentWithAvatar } from "@/lib/queries";
import { AGENT_MODELS, CANDIDATE_PERSONALITIES, ELEVENLABS_VOICES, INTERVIEWER_PERSONALITIES, LANGUAGES, RESPONSE_STYLES, elevenLabsVoiceGroups, modelLabel, voicesFor, voiceProviderLabel, voiceShortName, type VoiceProvider } from "@/lib/constants";
import { BEST_NATURAL_GROUP, BEST_NATURAL_IDS, EDGE_VOICES, edgeVoiceGroups } from "@/lib/edge-voices";
import { DefaultAgentsButton } from "@/components/app/DefaultAgentsButton";
import { previewVoice, getIntegrationStatus } from "@/backend/interview.functions";
import { Page, PageHeader, EmptyState } from "@/components/app/AppShell";
import { AgentAvatar } from "@/components/app/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "AI Agents — AI Interview Arena" },
      { name: "description", content: "Build interviewer and candidate AI agents with personalities, models and voices." },
      { property: "og:title", content: "AI Agents — AI Interview Arena" },
      { property: "og:description", content: "Build interviewer and candidate AI agents." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery()),
  component: AgentsPage,
});

type Draft = {
  id?: string;
  name: string;
  role: "interviewer" | "candidate" | "both";
  personality: string;
  background: string;
  knowledge_domain: string;
  system_instructions: string;
  model: string;
  voice_provider: VoiceProvider;
  voice_id: string;
  speaking_speed: number;
  response_style: string;
  language: "english" | "hindi" | "hinglish";
  creativity: number;
  preset_avatar: string | null;
  avatar_path: string | null;
  avatarUrl?: string | null;
};

const blank: Draft = {
  name: "",
  role: "interviewer",
  personality: "Senior Technical Interviewer",
  background: "",
  knowledge_domain: "",
  system_instructions: "",
  model: "openai/gpt-6-astra",
  voice_provider: "edge",
  voice_id: "en-US-AriaNeural",
  speaking_speed: 1,
  response_style: "conversational",
  language: "english",
  creativity: 0.7,
  preset_avatar: "interviewer",
  avatar_path: null,
};

function AgentsPage() {
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<AgentWithAvatar | null>(null);

  async function remove() {
    if (!toDelete) return;
    const { error } = await supabase.from("ai_agents").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else toast.success("Agent deleted");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["agents"] });
  }

  return (
    <>
      <PageHeader
        title="AI Agents"
        description="Each agent has its own persona, instructions, model and voice."
        actions={
          <div className="flex flex-wrap gap-2">
            {agents.length > 0 && <DefaultAgentsButton existingNames={agents.map((a) => a.name)} />}
            <Button variant="hero" onClick={() => setDraft({ ...blank })}>
              <Plus /> New agent
            </Button>
          </div>
        }
      />
      <Page>
        {agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Add the ready-made host and guest, or create your own."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <DefaultAgentsButton existingNames={[]} variant="hero" />
                <Button variant="outline" onClick={() => setDraft({ ...blank })}>Create agent</Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <div key={a.id} className="rounded-2xl border bg-gradient-surface p-5 shadow-card">
                <div className="flex items-start gap-4">
                  <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} presetKey={a.preset_avatar} role={a.role} speaking={false} size="md" tone={a.role === "candidate" ? "secondary" : "primary"} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">{a.role === "both" ? "Host or guest" : a.role}</div>
                    <h3 className="truncate font-display text-lg font-bold">{a.name}</h3>
                    <p className="text-sm text-muted-foreground">{a.personality}</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-muted-foreground">Model</dt>
                    <dd className="font-medium">{modelLabel(a.model)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-muted-foreground">Voice</dt>
                    <dd className="font-medium">
                      {voiceShortName(a.voice_id)} · {voiceProviderLabel(a.voice_provider)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...(a as unknown as Draft), speaking_speed: Number(a.speaking_speed), creativity: Number(a.creativity) })}>
                    <Pencil /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(a)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Page>
      {draft && <AgentDialog draft={draft} onClose={() => setDraft(null)} />}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Past transcripts stay, but this agent can't be used in new interviews.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AgentDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const preview = useServerFn(previewVoice);
  const status = useServerFn(getIntegrationStatus);
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const personalities = d.role === "candidate" ? CANDIDATE_PERSONALITIES : d.role === "interviewer" ? INTERVIEWER_PERSONALITIES : [...INTERVIEWER_PERSONALITIES, ...CANDIDATE_PERSONALITIES];
  const voices = voicesFor(d.voice_provider);
  const edgeGroups = edgeVoiceGroups();
  const elGroups = elevenLabsVoiceGroups();
  const [edgeGroup, setEdgeGroup] = useState<string>(() =>
    (BEST_NATURAL_IDS as readonly string[]).includes(draft.voice_id) ? BEST_NATURAL_GROUP : (EDGE_VOICES.find((v) => v.id === draft.voice_id)?.group ?? BEST_NATURAL_GROUP),
  );
  const [elGroup, setElGroup] = useState<"Indian" | "Other">(() =>
    ELEVENLABS_VOICES.find((v) => v.id === draft.voice_id)?.group ?? "Indian",
  );

  async function doPreview() {
    setPreviewing(true);
    try {
      if (d.voice_provider === "elevenlabs") {
        const s = await status();
        if (!s.elevenlabs) throw new Error("ElevenLabs isn't connected yet. Open Integrations to connect it.");
      }
      if (d.voice_provider === "deepgram") {
        const s = await status();
        if (!s.deepgram) throw new Error("Deepgram isn't connected yet. Open Integrations to check it.");
      }
      const { dataUri } = await preview({ data: { provider: d.voice_provider, voiceId: d.voice_id, language: d.language, speed: d.speaking_speed } });
      const audio = new Audio(dataUri);
      audio.playbackRate = d.speaking_speed;
      await audio.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    if (!d.name.trim()) { toast.error("Give the agent a name"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;
      let avatar_path = d.avatar_path;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("Avatar must be under 5 MB");
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        avatar_path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("agent-avatars").upload(avatar_path, file, { contentType: file.type });
        if (up.error) throw new Error(up.error.message);
      }
      const row = {
        user_id: userId,
        name: d.name.trim().slice(0, 80),
        role: d.role,
        personality: d.personality,
        background: d.background,
        knowledge_domain: d.knowledge_domain,
        system_instructions: d.system_instructions.slice(0, 4000),
        model: d.model,
        voice_provider: d.voice_provider,
        voice_id: d.voice_id,
        speaking_speed: d.speaking_speed,
        response_style: d.response_style,
        language: d.language,
        creativity: d.creativity,
        preset_avatar: avatar_path ? null : (d.preset_avatar ?? (d.role === "candidate" ? "candidate" : "interviewer")),
        avatar_path,
      };
      const res = d.id ? await supabase.from("ai_agents").update(row).eq("id", d.id) : await supabase.from("ai_agents").insert(row);
      if (res.error) throw new Error(res.error.message);
      toast.success(d.id ? "Agent updated" : "Agent created");
      qc.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d.id ? `Edit ${d.name}` : "New AI agent"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-4 md:col-span-2">
            <AgentAvatar name={d.name || "Agent"} avatarUrl={file ? URL.createObjectURL(file) : d.avatarUrl} presetKey={d.preset_avatar} role={d.role} speaking={false} size="md" />
            <div className="space-y-2">
              <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" /> Upload avatar
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Label>
              <div className="flex gap-2 text-xs">
                {["interviewer", "candidate"].map((p) => (
                  <button key={p} className="text-primary hover:underline" onClick={() => { setFile(null); setD((x) => ({ ...x, preset_avatar: p, avatar_path: null, avatarUrl: null })); }}>
                    Use {p} portrait
                  </button>
                ))}
              </div>
            </div>
          </div>
          <F label="Name">
            <Input value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
          </F>
          <F label="Role">
            <Sel value={d.role} onChange={(v) => set("role", v as Draft["role"])} options={[{ value: "interviewer", label: "Interviewer / Host" }, { value: "candidate", label: "Candidate / Guest" }, { value: "both", label: "Either role" }]} />
          </F>
          <F label="Personality">
            <Sel value={personalities.includes(d.personality) ? d.personality : (personalities[0] ?? "")} onChange={(v) => set("personality", v)} options={personalities.map((p) => ({ value: p, label: p }))} />
          </F>
          <F label="Response style">
            <Sel value={d.response_style} onChange={(v) => set("response_style", v)} options={RESPONSE_STYLES} />
          </F>
          <F label="Professional background" className="md:col-span-2">
            <Input value={d.background} onChange={(e) => set("background", e.target.value)} placeholder="e.g. 10 years as a backend engineer at a fintech" />
          </F>
          <F label="Knowledge domain" className="md:col-span-2">
            <Input value={d.knowledge_domain} onChange={(e) => set("knowledge_domain", e.target.value)} placeholder="e.g. Distributed systems, Kubernetes" />
          </F>
          <F label="System instructions" className="md:col-span-2">
            <Textarea rows={4} maxLength={4000} value={d.system_instructions} onChange={(e) => set("system_instructions", e.target.value)} placeholder="How this agent should think, speak and behave." />
          </F>
          <F label="AI model">
            <Sel value={d.model} onChange={(v) => set("model", v)} options={AGENT_MODELS.map((m) => ({ value: m.id, label: `${m.label} · ${m.vendor} — ${m.note}` }))} />
          </F>
          <F label="Language">
            <Sel value={d.language} onChange={(v) => set("language", v as Draft["language"])} options={LANGUAGES} />
          </F>
          <F label="Voice provider">
            <Sel
              value={d.voice_provider}
              onChange={(v) => {
                if (v === "edge") setEdgeGroup(BEST_NATURAL_GROUP);
                const next = v as VoiceProvider;
                if (next === "edge") setEdgeGroup(BEST_NATURAL_GROUP);
                if (next === "elevenlabs") setElGroup("Indian");
                const first =
                  next === "edge"
                    ? "en-US-AriaNeural"
                    : next === "elevenlabs"
                      ? ELEVENLABS_VOICES.find((x) => x.group === "Indian")?.id ?? voicesFor(next)[0]!.id
                      : voicesFor(next)[0]!.id;
                setD((x) => ({ ...x, voice_provider: next, voice_id: first }));
              }}
              options={[
                { value: "edge", label: "Microsoft voices (free, unlimited)" },
                { value: "google_cloud", label: "Google Cloud TTS (your key, 40 lakh free chars/month)" },
                { value: "lovable", label: "Built-in voices" },
                { value: "deepgram", label: "Deepgram Aura (English, your credits)" },
                { value: "elevenlabs", label: "ElevenLabs (needs connection)" },
              ]}
            />
            {d.voice_provider === "deepgram" && d.language !== "english" && (
              <p className="mt-1 text-xs text-warning">Deepgram speaks English only — Hindi/Hinglish words will sound accented.</p>
            )}
          </F>
          {d.voice_provider === "edge" && (
            <F label={`Voice language (${EDGE_VOICES.length} voices)`}>
              <Sel
                value={edgeGroup}
                onChange={(g) => {
                  setEdgeGroup(g);
                  set("voice_id", edgeGroups.find((x) => x.group === g)?.voices[0]?.id ?? d.voice_id);
                }}
                options={edgeGroups.map((g) => ({ value: g.group, label: `${g.group} · ${g.voices.length}` }))}
              />
            </F>
          )}
          {d.voice_provider === "elevenlabs" && (
            <F label={`Voice region (${ELEVENLABS_VOICES.length} voices)`}>
              <Sel
                value={elGroup}
                onChange={(g) => {
                  const next = g as "Indian" | "Other";
                  setElGroup(next);
                  set("voice_id", elGroups.find((x) => x.group === next)?.voices[0]?.id ?? d.voice_id);
                }}
                options={elGroups.map((g) => ({
                  value: g.group,
                  label: `${g.group === "Indian" ? "Indian / Hindi" : "Other"} · ${g.voices.length}`,
                }))}
              />
            </F>
          )}
          <F label="Voice">
            <div className="flex gap-2">
              <Sel
                value={d.voice_id}
                onChange={(v) => set("voice_id", v)}
                options={(
                  d.voice_provider === "edge"
                    ? (edgeGroups.find((g) => g.group === edgeGroup)?.voices ?? [])
                    : d.voice_provider === "elevenlabs"
                      ? (elGroups.find((g) => g.group === elGroup)?.voices ?? [])
                      : voices
                ).map((v) => ({ value: v.id, label: v.label }))}
              />
              <Button variant="outline" size="icon" onClick={doPreview} disabled={previewing} aria-label="Preview voice">
                {previewing ? <Loader2 className="animate-spin" /> : <Volume2 />}
              </Button>
            </div>
          </F>
          <SliderRow label="Speaking speed" value={d.speaking_speed} min={0.5} max={2} step={0.05} onChange={(v) => set("speaking_speed", v)} />
          <SliderRow label="Creativity" value={d.creativity} min={0} max={1.5} step={0.05} onChange={(v) => set("creativity", v)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="hero" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-0 flex-1">
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

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-mono text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} />
    </div>
  );
}
