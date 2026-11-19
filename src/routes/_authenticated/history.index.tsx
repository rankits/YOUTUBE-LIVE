import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { History, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { agentsQuery, formatDuration, interviewDurationMs, interviewsQuery } from "@/lib/queries";
import { FORMATS, formatLabel, topicLabel } from "@/lib/constants";
import { Page, PageHeader, EmptyState, StatusBadge } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/history/")({
  head: () => ({
    meta: [
      { title: "Interview History — AI Interview Arena" },
      { name: "description", content: "Search, filter and review every AI interview transcript." },
      { property: "og:title", content: "Interview History — AI Interview Arena" },
      { property: "og:description", content: "Every AI interview transcript." },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(interviewsQuery()), context.queryClient.ensureQueryData(agentsQuery())]),
  component: HistoryPage,
});

function HistoryPage() {
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const { data: agents } = useSuspenseQuery(agentsQuery());
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [fmt, setFmt] = useState("all");
  const name = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "—";

  const rows = useMemo(
    () =>
      interviews.filter(
        (i) =>
          (status === "all" || i.status === status) &&
          (fmt === "all" || i.format === fmt) &&
          (!q || `${i.title} ${topicLabel(i.topic, i.custom_topic)}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [interviews, q, status, fmt],
  );

  async function del(id: string) {
    if (!confirm("Delete this interview and its transcript?")) return;
    const { error } = await supabase.from("interviews").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Interview deleted");
    qc.invalidateQueries({ queryKey: ["interviews"] });
  }

  return (
    <>
      <PageHeader title="Interview history" description="Every show you've produced, with full transcripts." />
      <Page>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search title or topic" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "draft", "running", "completed", "stopped", "failed"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fmt} onValueChange={setFmt}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              {FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={History} title="No interviews found" description="Try a different search, or create a new interview." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Interview</th>
                  <th className="px-5 py-3">Agents</th>
                  <th className="px-5 py-3">Turns</th>
                  <th className="px-5 py-3">Duration</th>
                  <th className="px-5 py-3">Started</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-t hover:bg-accent/30">
                    <td className="px-5 py-3">
                      <Link to="/history/$interviewId" params={{ interviewId: i.id }} className="font-medium hover:text-primary">
                        {i.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {topicLabel(i.topic, i.custom_topic)} · {formatLabel(i.format)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {name(i.interviewer_agent_id)} × {name(i.candidate_agent_id)}
                    </td>
                    <td className="px-5 py-3 font-mono">{i.turn_count}</td>
                    <td className="px-5 py-3 font-mono">{formatDuration(interviewDurationMs(i))}</td>
                    <td className="px-5 py-3 text-muted-foreground">{i.started_at ? format(new Date(i.started_at), "d MMM, HH:mm") : "—"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="icon" variant="ghost" onClick={() => del(i.id)} aria-label="Delete">
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
