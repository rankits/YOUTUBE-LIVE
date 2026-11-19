import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { youtubeConnectionQuery } from "@/lib/queries";
import { Page, PageHeader } from "@/components/app/AppShell";
import { ViralTopicsPanel } from "@/components/app/ViralTopicsPanel";

export const Route = createFileRoute("/_authenticated/viral-topics")({
  head: () => ({
    meta: [
      { title: "Viral Topics — Shorts Studio" },
      { name: "description", content: "Trending India and World topics as YouTube Shorts." },
      { property: "og:title", content: "Viral Topics — Shorts Studio" },
      { property: "og:description", content: "Turn viral India and World headlines into Shorts." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(youtubeConnectionQuery()),
  component: ViralTopicsPage,
});

function ViralTopicsPage() {
  const { data: conn } = useSuspenseQuery(youtubeConnectionQuery());
  return (
    <>
      <PageHeader
        title="Viral Topics"
        description="See what is trending in India and the world — preview, approve, and schedule YouTube Shorts."
      />
      <Page>
        <ViralTopicsPanel connected={conn?.status === "connected"} />
      </Page>
    </>
  );
}
