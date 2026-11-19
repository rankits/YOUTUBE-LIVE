import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Clapperboard, PlusCircle } from "lucide-react";
import { Page, PageHeader, EmptyState, StatusBadge } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { interviewsQuery } from "@/lib/queries";
import { formatLabel, topicLabel } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/studio/")({
  head: () => ({
    meta: [
      { title: "Live Interview Studio — AI Interview Arena" },
      { name: "description", content: "Open an interview in the live studio." },
      { property: "og:title", content: "Live Interview Studio — AI Interview Arena" },
      { property: "og:description", content: "Open an interview in the live studio." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(interviewsQuery()),
  component: StudioIndex,
});

function StudioIndex() {
  const { data } = useSuspenseQuery(interviewsQuery());
  const open = data.filter((i) => i.status !== "completed");
  return (
    <>
      <PageHeader
        title="Live Interview Studio"
        description="Pick a show to open on stage."
        actions={
          <Button variant="hero" asChild>
            <Link to="/interviews/new">
              <PlusCircle /> New interview
            </Link>
          </Button>
        }
      />
      <Page>
        {data.length === 0 ? (
          <EmptyState icon={Clapperboard} title="Nothing on stage yet" description="Create an interview to open the studio." action={<Button variant="hero" asChild><Link to="/interviews/new">Create interview</Link></Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(open.length ? open : data).map((iv) => (
              <Link key={iv.id} to="/studio/$interviewId" params={{ interviewId: iv.id }} className="group rounded-2xl border bg-gradient-surface p-5 transition-all hover:border-primary/60 hover:shadow-glow">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold group-hover:text-primary">{iv.title}</h3>
                  <StatusBadge status={iv.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {topicLabel(iv.topic, iv.custom_topic)} · {formatLabel(iv.format)} · {iv.duration_minutes} min · {iv.language}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">{iv.turn_count} turns so far</p>
              </Link>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
