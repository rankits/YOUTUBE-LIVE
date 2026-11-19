import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Disc3, Download, Play, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration, interviewsQuery, recordingsQuery } from "@/lib/queries";
import { Page, PageHeader, EmptyState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/recordings")({
  head: () => ({
    meta: [
      { title: "Recordings — AI Interview Arena" },
      { name: "description", content: "Replay and download audio recordings of your AI interviews." },
      { property: "og:title", content: "Recordings — AI Interview Arena" },
      { property: "og:description", content: "Replay and download AI interview recordings." },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(recordingsQuery()), context.queryClient.ensureQueryData(interviewsQuery())]),
  component: Recordings,
});

function Recordings() {
  const { data: recs } = useSuspenseQuery(recordingsQuery());
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const qc = useQueryClient();
  const [urls, setUrls] = useState<Record<string, string>>({});

  async function signed(path: string, id: string) {
    if (urls[id]) return urls[id];
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error("Recording file is unavailable");
      return null;
    }
    setUrls((u) => ({ ...u, [id]: data.signedUrl }));
    return data.signedUrl;
  }

  async function del(id: string, path: string) {
    if (!confirm("Delete this recording?")) return;
    await supabase.storage.from("recordings").remove([path]);
    await supabase.from("recordings").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["recordings"] });
  }

  return (
    <>
      <PageHeader title="Recordings" description="Audio recordings captured by the studio while a show runs with voices on." />
      <Page>
        {recs.length === 0 ? (
          <EmptyState icon={Disc3} title="No recordings yet" description="Run an interview with voices and 'Record audio' on. Full video recordings of live streams are kept by YouTube on your channel." />
        ) : (
          <div className="space-y-3">
            {recs.map((r) => {
              const iv = interviews.find((i) => i.id === r.interview_id);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                    <Disc3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {iv ? (
                      <Link to="/history/$interviewId" params={{ interviewId: iv.id }} className="font-medium hover:text-primary">
                        {iv.title}
                      </Link>
                    ) : (
                      <span className="font-medium">Recording</span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "d MMM yyyy, HH:mm")} · {r.duration_ms ? formatDuration(r.duration_ms) : "—"} · {((r.size_bytes ?? 0) / 1_048_576).toFixed(1)} MB
                    </div>
                  </div>
                  {urls[r.id] ? (
                    <audio controls src={urls[r.id]} className="h-9" />
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => signed(r.storage_path, r.id)}>
                      <Play /> Replay
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const u = await signed(r.storage_path, r.id);
                      if (u) window.open(u, "_blank");
                    }}
                  >
                    <Download /> Download
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => del(r.id, r.storage_path)} aria-label="Delete recording">
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
