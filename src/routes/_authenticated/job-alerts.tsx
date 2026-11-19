import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { youtubeConnectionQuery } from "@/lib/queries";
import { Page, PageHeader } from "@/components/app/AppShell";
import { NewsAlertsPanel } from "@/components/app/NewsAlertsPanel";

export const Route = createFileRoute("/_authenticated/job-alerts")({
  head: () => ({
    meta: [
      { title: "Job Alerts — Shorts Studio" },
      { name: "description", content: "Create viral government job alert YouTube Shorts." },
      { property: "og:title", content: "Job Alerts — Shorts Studio" },
      { property: "og:description", content: "Job alert Shorts from the latest recruitments." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(youtubeConnectionQuery()),
  component: JobAlertsPage,
});

function JobAlertsPage() {
  const { data: conn } = useSuspenseQuery(youtubeConnectionQuery());
  return (
    <>
      <PageHeader
        title="Job Alerts"
        description="Latest recruitments from SarkariExam and news — preview, approve, and schedule to YouTube Shorts."
      />
      <Page>
        <NewsAlertsPanel connected={conn?.status === "connected"} />
      </Page>
    </>
  );
}
