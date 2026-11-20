import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { Page, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/automation")({
  head: () => ({
    meta: [
      { title: "Daily Automation — Shorts Studio" },
      { name: "description", content: "Schedule Job, Viral, and MCQ Shorts while this browser tab stays open." },
    ],
  }),
  component: AutomationPage,
});

function AutomationPage() {
  return (
    <>
      <PageHeader
        title="Daily Automation"
        description="Browser-side auto fill for Job Alerts, Viral Topics, and MCQ Shorts. Keep the matching page open at your chosen time."
      />
      <Page>
        <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">How it works</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Open Job Alerts, Viral Topics, or YouTube (MCQ Shorts).</li>
            <li>Turn on Daily auto, set time + Shorts/day.</li>
            <li>Leave that tab open (computer awake). At that time it schedules today’s Shorts once.</li>
            <li>Or press “Run today now” anytime.</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Shorts still render in the browser (canvas). Fully unattended server rendering is not on Hobby yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/job-alerts">Open Job Alerts</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/viral-topics">Open Viral Topics</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/youtube">Open MCQ Shorts</Link>
            </Button>
          </div>
        </div>
      </Page>
    </>
  );
}
