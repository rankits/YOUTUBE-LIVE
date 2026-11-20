import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { youtubeConnectionQuery } from "@/lib/queries";
import { Page, PageHeader } from "@/components/app/AppShell";
import { LiveMonitorPanel } from "@/components/app/LiveMonitorPanel";

export const Route = createFileRoute("/_authenticated/live-monitor")({
  head: () => ({
    meta: [
      { title: "Live Monitor — Highlight Detection" },
      { name: "description", content: "Monitor YouTube lives via official APIs; chat highlights and creator captions." },
      { property: "og:title", content: "Live Monitor — Highlight Detection" },
      { property: "og:description", content: "Detect live status and chat highlights without downloading third-party video." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(youtubeConnectionQuery()),
  component: LiveMonitorPage,
});

function LiveMonitorPage() {
  const { data: conn } = useSuspenseQuery(youtubeConnectionQuery());
  return (
    <>
      <PageHeader
        title="Live Monitor"
        description="Official YouTube APIs: live detection, chat highlight timestamps, creator caption analysis. Clip drafts only for your channel."
      />
      <Page>
        <LiveMonitorPanel connected={conn?.status === "connected"} />
      </Page>
    </>
  );
}
