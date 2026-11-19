import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Clapperboard, Radio, Clock, Film, Cpu, Coins, Youtube, PlusCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Page, PageHeader, EmptyState, StatusBadge } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { broadcastsQuery, formatDuration, interviewDurationMs, interviewsQuery, usageQuery, youtubeConnectionQuery } from "@/lib/queries";
import { topicLabel } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AI Interview Arena" },
      { name: "description", content: "Your AI interview shows, live streams and usage at a glance." },
      { property: "og:title", content: "Dashboard — AI Interview Arena" },
      { property: "og:description", content: "Your AI interview shows at a glance." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(interviewsQuery()),
      context.queryClient.ensureQueryData(broadcastsQuery()),
      context.queryClient.ensureQueryData(usageQuery()),
      context.queryClient.ensureQueryData(youtubeConnectionQuery()),
    ]),
  component: Dashboard,
});

export function Stat({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-gradient-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-3 font-display text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const { data: broadcasts } = useSuspenseQuery(broadcastsQuery());
  const { data: usage } = useSuspenseQuery(usageQuery());
  const { data: yt } = useSuspenseQuery(youtubeConnectionQuery());

  const liveMs = broadcasts.reduce((s, b) => (b.started_at ? s + ((b.ended_at ? new Date(b.ended_at) : new Date()).getTime() - new Date(b.started_at).getTime()) : s), 0);
  const tokens = usage.reduce((s, u) => s + u.prompt_tokens + u.completion_tokens, 0);
  const credits = usage.reduce((s, u) => s + Number(u.cost_credits), 0);
  const episodes = interviews.filter((i) => i.status === "completed").length;

  return (
    <>
      <PageHeader
        title="Production dashboard"
        description="Everything happening in your AI interview studio."
        actions={
          <Button variant="hero" asChild>
            <Link to="/interviews/new">
              <PlusCircle /> New interview
            </Link>
          </Button>
        }
      />
      <Page>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Clapperboard} label="Total AI interviews" value={String(interviews.length)} />
          <Stat icon={Radio} label="Total live streams" value={String(broadcasts.filter((b) => b.started_at).length)} />
          <Stat icon={Clock} label="Streaming hours" value={(liveMs / 3_600_000).toFixed(1)} />
          <Stat icon={Film} label="Completed episodes" value={String(episodes)} />
          <Stat icon={Cpu} label="AI token usage" value={tokens.toLocaleString()} hint={`${usage.length} AI calls`} />
          <Stat icon={Coins} label="Estimated AI cost" value={`${credits.toFixed(2)} credits`} hint="Estimate from catalog rates" />
          <div className="rounded-2xl border bg-gradient-surface p-5 shadow-card sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Connected YouTube channel</span>
              <Youtube className="h-4 w-4 text-live" />
            </div>
            {yt ? (
              <div className="mt-3 flex items-center gap-3">
                {yt.channel_thumbnail && <img src={yt.channel_thumbnail} alt="" className="h-10 w-10 rounded-full" />}
                <div>
                  <div className="font-display text-lg font-bold">{yt.channel_title}</div>
                  <div className="text-xs capitalize text-muted-foreground">{yt.status}</div>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-muted-foreground">Not connected</span>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/youtube">Connect</Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Recent episodes</h2>
            <Link to="/history" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {interviews.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Clapperboard}
                title="No interviews yet"
                description="Create your first AI vs AI interview — your two starter agents are ready."
                action={
                  <Button variant="hero" asChild>
                    <Link to="/interviews/new">Create interview</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Episode</th>
                    <th className="px-5 py-3">Duration</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Broadcast</th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.slice(0, 8).map((iv) => (
                    <tr key={iv.id} className="border-t hover:bg-accent/30">
                      <td className="px-5 py-3">
                        <Link to="/studio/$interviewId" params={{ interviewId: iv.id }} className="font-medium hover:text-primary">
                          {iv.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">{topicLabel(iv.topic, iv.custom_topic)}</div>
                      </td>
                      <td className="px-5 py-3 font-mono">{formatDuration(interviewDurationMs(iv))}</td>
                      <td className="px-5 py-3 text-muted-foreground">{format(new Date(iv.created_at), "d MMM yyyy")}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={iv.status} />
                      </td>
                      <td className="px-5 py-3">
                        {iv.youtube_broadcast_url ? (
                          <a href={iv.youtube_broadcast_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Watch <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Page>
    </>
  );
}
