import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { Clapperboard, Radio, AudioLines, Timer, Cpu, Coins, Mic } from "lucide-react";
import { agentsQuery, broadcastsQuery, formatDuration, interviewDurationMs, interviewsQuery, usageQuery } from "@/lib/queries";
import { topicLabel } from "@/lib/constants";
import { Page, PageHeader, StatusBadge } from "@/components/app/AppShell";
import { Stat } from "./dashboard";
import { QuotaTracker } from "@/components/app/QuotaTracker";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — AI Interview Arena" },
      { name: "description", content: "Interview, streaming, token and cost analytics for your AI shows." },
      { property: "og:title", content: "Analytics — AI Interview Arena" },
      { property: "og:description", content: "Analytics for your AI shows." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(interviewsQuery()),
      context.queryClient.ensureQueryData(usageQuery()),
      context.queryClient.ensureQueryData(broadcastsQuery()),
      context.queryClient.ensureQueryData(agentsQuery()),
    ]),
  component: Analytics,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" };

function Analytics() {
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const { data: usage } = useSuspenseQuery(usageQuery());
  const { data: broadcasts } = useSuspenseQuery(broadcastsQuery());
  const { data: agents } = useSuspenseQuery(agentsQuery());

  const m = useMemo(() => {
    const durations = interviews.map(interviewDurationMs).filter((d) => d > 0);
    const liveMs = broadcasts.reduce((s, b) => (b.started_at ? s + ((b.ended_at ? new Date(b.ended_at) : new Date()).getTime() - new Date(b.started_at).getTime()) : s), 0);
    const audioMs = usage.filter((u) => u.kind === "tts").reduce((s, u) => s + u.audio_ms, 0);
    const chatCost = usage.filter((u) => u.kind !== "tts").reduce((s, u) => s + Number(u.cost_credits), 0);
    const ttsCost = usage.filter((u) => u.kind === "tts").reduce((s, u) => s + Number(u.cost_credits), 0);
    const tokens = usage.reduce((s, u) => s + u.prompt_tokens + u.completion_tokens, 0);

    const topics = new Map<string, number>();
    interviews.forEach((i) => topics.set(topicLabel(i.topic, i.custom_topic), (topics.get(topicLabel(i.topic, i.custom_topic)) ?? 0) + 1));
    const agentTurns = new Map<string, number>();
    usage.filter((u) => u.kind === "chat" && u.agent_id).forEach((u) => agentTurns.set(u.agent_id!, (agentTurns.get(u.agent_id!) ?? 0) + 1));

    const days = Array.from({ length: 14 }).map((_, i) => {
      const d = subDays(new Date(), 13 - i);
      const key = format(d, "yyyy-MM-dd");
      const dayUsage = usage.filter((u) => u.created_at.startsWith(key));
      return {
        day: format(d, "d MMM"),
        tokens: dayUsage.reduce((s, u) => s + u.prompt_tokens + u.completion_tokens, 0),
        credits: +dayUsage.reduce((s, u) => s + Number(u.cost_credits), 0).toFixed(3),
      };
    });
    return {
      avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      liveMs,
      audioMs,
      chatCost,
      ttsCost,
      tokens,
      topics: [...topics.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6),
      agents: [...agentTurns.entries()].map(([id, turns]) => ({ name: agents.find((a) => a.id === id)?.name ?? "Deleted agent", turns })).sort((a, b) => b.turns - a.turns).slice(0, 6),
      days,
    };
  }, [interviews, usage, broadcasts, agents]);

  return (
    <>
      <PageHeader title="Analytics" description="Usage and costs are estimates from catalog rates, in workspace credits." />
      <Page>
        <QuotaTracker />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Clapperboard} label="Total interviews" value={String(interviews.length)} />
          <Stat icon={Radio} label="Live streaming hours" value={(m.liveMs / 3_600_000).toFixed(2)} />
          <Stat icon={AudioLines} label="Generated audio" value={formatDuration(m.audioMs)} />
          <Stat icon={Timer} label="Avg. interview" value={formatDuration(m.avg)} />
          <Stat icon={Cpu} label="AI tokens" value={m.tokens.toLocaleString()} />
          <Stat icon={Coins} label="AI conversation cost" value={`${m.chatCost.toFixed(3)} cr`} />
          <Stat icon={Mic} label="Voice generation cost" value={`${m.ttsCost.toFixed(3)} cr`} />
          <Stat icon={Coins} label="Total estimated" value={`${(m.chatCost + m.ttsCost).toFixed(3)} cr`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Token usage — last 14 days">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={m.days}>
                <defs>
                  <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="tokens" stroke="var(--chart-1)" fill="url(#tok)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Estimated credits — last 14 days">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.days}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="credits" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Most popular topics">
            {m.topics.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={m.topics} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                    {m.topics.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card title="Most active agents (turns)">
            {m.agents.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={m.agents} layout="vertical">
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis type="category" dataKey="name" width={120} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="turns" fill="var(--chart-3)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        <Card title="YouTube broadcast history">
          {broadcasts.length === 0 ? (
            <Empty text="No broadcasts yet." />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-2">{b.title}</td>
                    <td className="py-2 capitalize text-muted-foreground">{b.privacy}</td>
                    <td className="py-2 text-muted-foreground">{format(new Date(b.created_at), "d MMM, HH:mm")}</td>
                    <td className="py-2">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Page>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </div>
  );
}
function Empty({ text = "No data yet — run an interview." }: { text?: string }) {
  return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">{text}</div>;
}
