import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Youtube, ShieldAlert, Unplug } from "lucide-react";
import { interviewsQuery, youtubeConnectionQuery } from "@/lib/queries";
import { disconnectYoutube, getYoutubeAuthUrl } from "@/backend/youtube.functions";
import { getIntegrationStatus } from "@/backend/interview.functions";
import { Page, StatusBadge } from "@/components/app/AppShell";
import { ShortsStudio } from "@/components/app/ShortsStudio";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/youtube")({
  validateSearch: (s) =>
    z
      .object({
        interview: z.string().optional(),
        yt_connected: z.coerce.string().optional(),
        yt_error: z.string().optional(),
        yt_slot_connected: z.coerce.string().optional(),
      })
      .parse(s),
  head: () => ({
    meta: [
      { title: "YouTube — Shorts Studio" },
      { name: "description", content: "Connect your channel and publish quiz Shorts." },
      { property: "og:title", content: "YouTube — Shorts Studio" },
      { property: "og:description", content: "Connect YouTube and publish Shorts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(youtubeConnectionQuery()),
      context.queryClient.ensureQueryData(interviewsQuery()),
    ]),
  component: YoutubePage,
});

function YoutubePage() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const { data: conn } = useSuspenseQuery(youtubeConnectionQuery());
  const { data: interviews } = useSuspenseQuery(interviewsQuery());
  const statusFn = useServerFn(getIntegrationStatus);
  const { data: status } = useQuery({ queryKey: ["integration-status"], queryFn: () => statusFn() });
  const authUrl = useServerFn(getYoutubeAuthUrl);
  const disconnect = useServerFn(disconnectYoutube);

  useEffect(() => {
    if (search.yt_connected) toast.success("YouTube channel connected");
    if (search.yt_slot_connected) toast.success(`Project ${search.yt_slot_connected} connected — +6 uploads per day`);
    if (search.yt_error) toast.error(`YouTube connection failed: ${search.yt_error.replace(/_/g, " ")}`);
  }, [search.yt_connected, search.yt_error, search.yt_slot_connected]);

  async function connect() {
    try {
      const { url } = await authUrl({ data: { origin: window.location.origin } });
      window.open(url, "_top");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start YouTube sign-in");
    }
  }

  const configured = status?.youtubeOAuth;
  const callbackUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/youtube/callback` : "";

  return (
    <>
      <div className="z-20 flex shrink-0 flex-col gap-3 border-b border-border/80 bg-card px-4 py-5 sm:gap-4 sm:px-6 sm:py-6 lg:px-10">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF0000] text-white shadow-card sm:h-14 sm:w-14">
            <Youtube className="h-6 w-6 sm:h-8 sm:w-8" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">YouTube Shorts</h1>
            <p className="mt-1 text-sm text-muted-foreground">Connect your channel and make quiz Shorts.</p>
          </div>
        </div>
      </div>
      <Page className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        {status && !configured && (
          <div className="space-y-3 rounded-2xl border border-warning/40 bg-warning/5 p-5 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4 text-warning" /> YouTube needs one-time setup
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>
                In Google Cloud Console, create a project and enable <b>YouTube Data API v3</b>.
              </li>
              <li>Configure the OAuth consent screen (External) and add your Google account as a test user.</li>
              <li>
                Create an <b>OAuth client ID</b> of type Web application, and add this Authorized redirect URI:
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{callbackUrl}</code>
              </li>
              <li>Add the Client ID and Client Secret in env / Integrations.</li>
            </ol>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Channel</h2>
          {conn ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {conn.channel_thumbnail && (
                  <img src={conn.channel_thumbnail} alt="" className="h-12 w-12 rounded-full ring-2 ring-primary/20" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-bold text-foreground">{conn.channel_title}</div>
                  <div className="mt-1">
                    <StatusBadge status={conn.status} />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {conn.status !== "connected" && (
                  <Button variant="hero" className="w-full sm:w-auto" onClick={connect}>
                    Reconnect
                  </Button>
                )}
                <Button
                  variant="destructiveOutline"
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    await disconnect();
                    qc.invalidateQueries({ queryKey: ["youtube-connection"] });
                  }}
                >
                  <Unplug /> Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">No channel connected.</p>
              <Button variant="hero" className="w-full sm:w-auto" onClick={connect} disabled={!configured}>
                <Youtube /> Connect YouTube
              </Button>
            </div>
          )}
        </div>

        <ShortsStudio shows={interviews} connected={conn?.status === "connected"} />
      </Page>
    </>
  );
}
