import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, MonitorPlay, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { interviewsQuery } from "@/lib/queries";
import { getBroadcastState } from "@/backend/broadcast.functions";
import { Page, PageHeader, EmptyState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/obs")({
  head: () => ({
    meta: [
      { title: "OBS Output — AI Interview Arena" },
      { name: "description", content: "Browser Source URL and setup steps to stream your AI interview with OBS Studio." },
      { property: "og:title", content: "OBS Output — AI Interview Arena" },
      { property: "og:description", content: "Stream your AI interview with OBS Studio." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(interviewsQuery()),
  component: ObsPage,
});

function ObsPage() {
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const [id, setId] = useState(interviews.find((i) => i.status !== "completed")?.id ?? interviews[0]?.id ?? "");
  const [test, setTest] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  const probe = useServerFn(getBroadcastState);
  const iv = interviews.find((i) => i.id === id);
  const url = iv && typeof window !== "undefined" ? `${window.location.origin}/broadcast/${iv.broadcast_token}` : "";

  async function testConnection() {
    if (!iv) return;
    setTest("busy");
    try {
      const r = await probe({ data: { token: iv.broadcast_token, afterTurn: 1000 } });
      setTest(r.found ? "ok" : "fail");
    } catch {
      setTest("fail");
    }
  }

  if (!interviews.length) {
    return (
      <>
        <PageHeader title="OBS output" />
        <Page>
          <EmptyState icon={MonitorPlay} title="Create an interview first" description="Each interview gets its own clean broadcast scene URL." action={<Button variant="hero" asChild><Link to="/interviews/new">Create interview</Link></Button>} />
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader title="OBS output" description="A clean 1920×1080 scene with avatars, audio, subtitles and topic — no dashboard controls." />
      <Page className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="space-y-4 rounded-2xl border bg-card p-5">
            <Select value={id} onValueChange={(v) => { setId(v); setTest("idle"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {interviews.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <div className="mb-1 text-sm text-muted-foreground">Browser Source URL</div>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">{url}</code>
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast.success("URL copied"); }} aria-label="Copy URL">
                  <Copy />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={url} target="_blank" rel="noreferrer" aria-label="Open scene">
                    <ExternalLink />
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Anyone with this link can view the scene. Add <code>?audio=0</code> to mute it.</p>
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed">
                <div className="mb-1 font-semibold">So the sound never cuts out on stream</div>
                In the Browser Source properties untick <b>Shutdown source when not visible</b> and <b>Refresh browser when scene becomes active</b>, and tick <b>Control audio via OBS</b>. Mute <b>Desktop Audio</b> and <b>Mic/Aux</b> in the OBS mixer so your own voice and the Studio tab are not mixed in. Keep the Studio tab open (not minimised) during the show.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={testConnection} disabled={test === "busy"}>
                {test === "busy" ? <Loader2 className="animate-spin" /> : null} Test connection
              </Button>
              {test === "ok" && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" /> Scene reachable
                </span>
              )}
              {test === "fail" && (
                <span className="flex items-center gap-1 text-sm text-destructive">
                  <XCircle className="h-4 w-4" /> Scene not reachable
                </span>
              )}
            </div>
          </div>
          {url && (
            <div className="overflow-hidden rounded-2xl border">
              <div className="border-b px-4 py-2 text-xs text-muted-foreground">Live preview</div>
              <div className="relative aspect-video">
                <iframe title="Broadcast preview" src={`${url}?audio=0`} className="absolute left-0 top-0 h-[1080px] w-[1920px] origin-top-left border-0" style={{ transform: "scale(var(--p, 0.4))" }} ref={(el) => { if (el?.parentElement) el.style.setProperty("--p", String(el.parentElement.clientWidth / 1920)); }} />
              </div>
            </div>
          )}
        </div>
        <aside className="space-y-4 rounded-2xl border bg-card p-5 text-sm">
          <h3 className="font-semibold">OBS Studio setup</h3>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>Settings → Video: Base & Output resolution <b>1920×1080</b>, <b>30 FPS</b>.</li>
            <li>Sources → + → <b>Browser</b>. Paste the URL above, width 1920, height 1080.</li>
            <li>Tick <b>Control audio via OBS</b> so the agents' voices go into the stream.</li>
            <li>Right-click the source → Interact → click once if it asks to enable audio.</li>
            <li>Settings → Stream: Service “Custom…”, paste the server and stream key from the YouTube Live page.</li>
            <li>Start Streaming, then Go Live on the YouTube Live page, then press Start in the studio.</li>
            <li>In the studio, mute studio speakers so audio isn't played twice on your computer.</li>
          </ol>
          <p className="text-xs text-muted-foreground">Optional: use OBS Virtual Camera to send the same scene into Zoom/Meet.</p>
        </aside>
      </Page>
    </>
  );
}
