import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, Plus, Play, X, Pencil, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agentsQuery, scheduledQuery, type Scheduled } from "@/lib/queries";
import { FORMATS, LANGUAGES, TOPICS, formatLabel } from "@/lib/constants";
import { Page, PageHeader, EmptyState, StatusBadge } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — AI Interview Arena" },
      { name: "description", content: "Plan upcoming AI interview shows and their YouTube details." },
      { property: "og:title", content: "Schedule — AI Interview Arena" },
      { property: "og:description", content: "Plan upcoming AI interview shows." },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(scheduledQuery()), context.queryClient.ensureQueryData(agentsQuery())]),
  component: SchedulePage,
});

type Draft = Partial<Scheduled> & { when: string };

function SchedulePage() {
  const { data: items } = useSuspenseQuery(scheduledQuery());
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null>(null);

  const newDraft = (): Draft => ({
    title: "",
    topic: "System Design",
    format: "podcast",
    language: "english",
    duration_minutes: 20,
    interviewer_agent_id: agents.find((a) => a.role !== "candidate")?.id ?? null,
    candidate_agent_id: agents.find((a) => a.role !== "interviewer")?.id ?? null,
    privacy: "private",
    auto_publish: false,
    requires_approval: true,
    youtube_title: "",
    youtube_description: "",
    when: format(new Date(Date.now() + 86_400_000), "yyyy-MM-dd'T'HH:mm"),
  });

  async function save() {
    if (!draft) return;
    if (!draft.title?.trim()) { toast.error("Add a title"); return; }
    const { data: u } = await supabase.auth.getUser();
    const row = {
      user_id: u.user!.id,
      title: draft.title.trim(),
      topic: draft.topic!,
      format: draft.format!,
      language: draft.language!,
      duration_minutes: draft.duration_minutes!,
      interviewer_agent_id: draft.interviewer_agent_id ?? null,
      candidate_agent_id: draft.candidate_agent_id ?? null,
      scheduled_at: new Date(draft.when).toISOString(),
      youtube_title: draft.youtube_title || null,
      youtube_description: draft.youtube_description || null,
      privacy: draft.privacy as "public" | "unlisted" | "private",
      auto_publish: !!draft.auto_publish,
      requires_approval: draft.privacy === "public" ? true : !!draft.requires_approval,
      approved: draft.privacy === "public" ? false : !!draft.approved,
    };
    const res = draft.id ? await supabase.from("scheduled_interviews").update(row).eq("id", draft.id) : await supabase.from("scheduled_interviews").insert(row);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Episode scheduled");
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["scheduled"] });
  }

  async function setStatus(id: string, patch: Partial<Scheduled>) {
    const { error } = await supabase.from("scheduled_interviews").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["scheduled"] });
  }

  async function startNow(s: Scheduled) {
    if (s.requires_approval && !s.approved) { toast.error("Approve this episode before starting it."); return; }
    if (!s.interviewer_agent_id || !s.candidate_agent_id) { toast.error("Assign both agents first."); return; }
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("interviews")
      .insert({
        user_id: u.user!.id,
        title: s.title,
        topic: TOPICS.includes(s.topic as (typeof TOPICS)[number]) ? s.topic : "Custom Topic",
        custom_topic: TOPICS.includes(s.topic as (typeof TOPICS)[number]) ? null : s.topic,
        format: s.format,
        language: s.language as "english" | "hindi" | "hinglish",
        duration_minutes: s.duration_minutes,
        interviewer_agent_id: s.interviewer_agent_id,
        candidate_agent_id: s.candidate_agent_id,
      })
      .select("id")
      .single();
    if (error || !data) { toast.error(error?.message ?? "Could not create interview"); return; }
    await setStatus(s.id, { status: "started", interview_id: data.id });
    navigate({ to: "/studio/$interviewId", params: { interviewId: data.id } });
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Plan episodes ahead. Public streams always require your explicit approval."
        actions={
          <Button variant="hero" onClick={() => setDraft(newDraft())}>
            <Plus /> Schedule episode
          </Button>
        }
      />
      <Page>
        <div className="flex gap-2 rounded-xl border bg-surface p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          The show runs from the studio window, so at the scheduled time open the episode and press Start (or “Start now” here). Nothing is published automatically.
        </div>
        {items.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No scheduled episodes" description="Schedule your next AI show with its topic, agents and YouTube details." />
        ) : (
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
                <div className="w-20 rounded-xl bg-gradient-primary p-2 text-center">
                  <div className="text-xs uppercase">{format(new Date(s.scheduled_at), "MMM")}</div>
                  <div className="font-display text-2xl font-bold">{format(new Date(s.scheduled_at), "d")}</div>
                  <div className="text-xs">{format(new Date(s.scheduled_at), "HH:mm")}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.title}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {s.topic} · {formatLabel(s.format)} · {s.duration_minutes} min · <span className="capitalize">{s.privacy}</span>
                    {s.auto_publish && " · auto-create YouTube broadcast"}
                  </div>
                </div>
                {s.status === "scheduled" && (
                  <div className="flex flex-wrap gap-2">
                    {s.requires_approval && !s.approved && (
                      <Button size="sm" variant="success" onClick={() => setStatus(s.id, { approved: true })}>
                        <ShieldCheck /> Approve
                      </Button>
                    )}
                    <Button size="sm" variant="hero" onClick={() => startNow(s)}>
                      <Play /> Start now
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDraft({ ...s, when: format(new Date(s.scheduled_at), "yyyy-MM-dd'T'HH:mm") })}>
                      <Pencil /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, { status: "cancelled" })}>
                      <X /> Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Page>

      {draft && (
        <Dialog open onOpenChange={(o) => !o && setDraft(null)}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{draft.id ? "Edit episode" : "Schedule episode"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <L label="Title">
                <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </L>
              <div className="grid grid-cols-2 gap-3">
                <L label="Topic">
                  <Pick value={draft.topic!} onChange={(v) => setDraft({ ...draft, topic: v })} options={TOPICS.filter((t) => t !== "Custom Topic").map((t) => ({ value: t, label: t }))} />
                </L>
                <L label="Format">
                  <Pick value={draft.format!} onChange={(v) => setDraft({ ...draft, format: v })} options={FORMATS} />
                </L>
                <L label="Interviewer">
                  <Pick value={draft.interviewer_agent_id ?? ""} onChange={(v) => setDraft({ ...draft, interviewer_agent_id: v })} options={agents.filter((a) => a.role !== "candidate").map((a) => ({ value: a.id, label: a.name }))} />
                </L>
                <L label="Candidate">
                  <Pick value={draft.candidate_agent_id ?? ""} onChange={(v) => setDraft({ ...draft, candidate_agent_id: v })} options={agents.filter((a) => a.role !== "interviewer").map((a) => ({ value: a.id, label: a.name }))} />
                </L>
                <L label="Date & time">
                  <Input type="datetime-local" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} />
                </L>
                <L label="Duration (min)">
                  <Input type="number" min={1} max={120} value={draft.duration_minutes ?? 20} onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })} />
                </L>
                <L label="Language">
                  <Pick value={draft.language!} onChange={(v) => setDraft({ ...draft, language: v })} options={LANGUAGES} />
                </L>
                <L label="YouTube visibility">
                  <Pick value={draft.privacy!} onChange={(v) => setDraft({ ...draft, privacy: v as Scheduled["privacy"] })} options={[{ value: "private", label: "Private" }, { value: "unlisted", label: "Unlisted" }, { value: "public", label: "Public" }]} />
                </L>
              </div>
              <L label="YouTube title">
                <Input value={draft.youtube_title ?? ""} onChange={(e) => setDraft({ ...draft, youtube_title: e.target.value })} />
              </L>
              <L label="YouTube description">
                <Textarea rows={3} value={draft.youtube_description ?? ""} onChange={(e) => setDraft({ ...draft, youtube_description: e.target.value })} />
              </L>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Create the YouTube broadcast for me</Label>
                  <div className="text-xs text-muted-foreground">Still needs your approval and a Go Live click.</div>
                </div>
                <Switch checked={!!draft.auto_publish} onCheckedChange={(v) => setDraft({ ...draft, auto_publish: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Require approval before starting</Label>
                  <div className="text-xs text-muted-foreground">Always on for public streams.</div>
                </div>
                <Switch checked={draft.privacy === "public" || !!draft.requires_approval} disabled={draft.privacy === "public"} onCheckedChange={(v) => setDraft({ ...draft, requires_approval: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button variant="hero" onClick={save}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select" />
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
