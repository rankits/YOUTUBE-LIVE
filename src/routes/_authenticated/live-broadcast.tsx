import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { agentsQuery, broadcastsQuery, interviewsQuery, youtubeConnectionQuery } from "@/lib/queries";
import { Page, PageHeader } from "@/components/app/AppShell";
import { LiveBroadcastPanel } from "@/components/app/LiveBroadcastPanel";

export const Route = createFileRoute("/_authenticated/live-broadcast")({
  validateSearch: (s) => z.object({ interview: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Live Broadcast — YouTube" },
      { name: "description", content: "Create and manage YouTube Live broadcasts." },
      { property: "og:title", content: "Live Broadcast" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(youtubeConnectionQuery()),
      context.queryClient.ensureQueryData(broadcastsQuery()),
      context.queryClient.ensureQueryData(interviewsQuery()),
      context.queryClient.ensureQueryData(agentsQuery()),
    ]),
  component: LiveBroadcastPage,
});

function LiveBroadcastPage() {
  const search = Route.useSearch();
  return (
    <>
      <PageHeader title="Live Broadcast" description="Create a YouTube Live stream for AI interviews or lectures." />
      <Page>
        <LiveBroadcastPanel interviewId={search.interview} />
      </Page>
    </>
  );
}
