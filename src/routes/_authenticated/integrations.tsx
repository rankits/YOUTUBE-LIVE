import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Mic, Youtube, MonitorPlay, ShieldCheck, CheckCircle2, CircleDashed } from "lucide-react";
import { getIntegrationStatus } from "@/backend/interview.functions";
import { youtubeConnectionQuery } from "@/lib/queries";
import { Page, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — AI Interview Arena" },
      { name: "description", content: "Status and setup for AI models, voices, YouTube Live and OBS." },
      { property: "og:title", content: "Integrations — AI Interview Arena" },
      { property: "og:description", content: "Status and setup for AI, voices, YouTube and OBS." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(youtubeConnectionQuery()),
  component: Integrations,
});

function Integrations() {
  const fn = useServerFn(getIntegrationStatus);
  const { data: s, isLoading } = useQuery({ queryKey: ["integration-status"], queryFn: () => fn() });
  const { data: yt } = useSuspenseQuery(youtubeConnectionQuery());

  const items = [
    { icon: Brain, name: "AI models (OpenAI & Gemini)", ok: s?.ai, detail: "Built in — GPT-6 and Gemini models run without your own API keys. Usage is billed to workspace credits.", action: null },
    { icon: Mic, name: "Built-in voices", ok: s?.ai, detail: "English, Hindi and Hinglish speech with 10 voices. Preview them on any agent.", action: <Button size="sm" variant="outline" asChild><Link to="/agents">Open agents</Link></Button> },
    { icon: Mic, name: "Free Google voice", ok: s?.googleVoice, detail: s?.googleVoice ? "Connected. Built-in voices run on your Google AI Studio key, with no workspace credits." : "Not connected. Built-in voices use workspace credits.", action: null },
    { icon: Mic, name: "Deepgram Aura voices", ok: s?.deepgram, detail: s?.deepgram ? "Connected. Choose Deepgram as the voice provider on an agent — runs on your Deepgram credits, English voices only." : "Not connected.", action: <Button size="sm" variant="outline" asChild><Link to="/agents">Pick voices</Link></Button> },
    { icon: Mic, name: "ElevenLabs voices (optional)", ok: s?.elevenlabs, detail: s?.elevenlabs ? "Connected. Choose ElevenLabs as the voice provider on an agent." : "Not connected. Ask Lovable to connect ElevenLabs if you want its voice library.", action: null },
    { icon: Youtube, name: "YouTube OAuth app", ok: s?.youtubeOAuth, detail: s?.youtubeOAuth ? "Google OAuth client configured." : "Needs your Google OAuth Client ID & Secret — see the YouTube Live page for steps.", action: <Button size="sm" variant="outline" asChild><Link to="/youtube">Set up</Link></Button> },
    { icon: Youtube, name: "YouTube channel", ok: yt?.status === "connected", detail: yt ? `${yt.channel_title} (${yt.status})` : "No channel connected yet.", action: <Button size="sm" variant="outline" asChild><Link to="/youtube">Manage</Link></Button> },
    { icon: MonitorPlay, name: "OBS Browser Source", ok: true, detail: "Every interview has its own clean 1920×1080 scene URL.", action: <Button size="sm" variant="outline" asChild><Link to="/obs">Open</Link></Button> },
    { icon: ShieldCheck, name: "Token encryption", ok: s?.tokenEncryption, detail: "YouTube refresh tokens are encrypted (AES-GCM) and only readable by the server.", action: null },
  ];

  return (
    <>
      <PageHeader title="Integrations" description="What's connected, and what still needs setup. Nothing here is faked." />
      <Page>
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.name} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-card sm:gap-4 sm:p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                <it.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{it.name}</span>
                  {isLoading ? null : it.ok ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active
                    </span>
                  ) : (
                    <span className={cn("flex items-center gap-1 text-xs text-muted-foreground")}>
                      <CircleDashed className="h-3.5 w-3.5" /> Not set up
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{it.detail}</p>
                {it.action && <div className="mt-3">{it.action}</div>}
              </div>
            </div>
          ))}
        </div>
      </Page>
    </>
  );
}
