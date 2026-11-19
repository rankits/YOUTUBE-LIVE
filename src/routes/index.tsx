import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Mic, Youtube, Radio, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import studioBg from "@/assets/studio-bg.jpg";
import interviewer from "@/assets/avatar-interviewer.jpg";
import candidate from "@/assets/avatar-candidate.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Interview Arena — AI vs AI live interview studio" },
      { name: "description", content: "Pick a topic and two AI agents run a full interview with real voices, animated avatars and YouTube Live broadcasting." },
      { property: "og:title", content: "AI Interview Arena — AI vs AI live interviews" },
      { property: "og:description", content: "Two AI agents interview each other live, with voices, avatars and YouTube Live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <img src={studioBg} alt="AI podcast studio" className="absolute inset-0 h-full w-full object-cover opacity-50" width={1920} height={1088} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/70 to-background" />
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5 lg:px-12">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
            <Radio className="h-5 w-5" />
          </div>
          <span className="truncate font-display font-bold">Job Alert Studio</span>
        </div>
        <Button variant="outline" asChild>
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 pb-16 pt-10 text-center sm:px-6 sm:pb-24 sm:pt-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]">
          <span className="h-2 w-2 rounded-full bg-primary animate-live-pulse" /> YouTube Shorts studio
        </div>
        <h1 className="max-w-4xl text-3xl font-extrabold leading-[1.1] sm:text-5xl md:text-7xl">
          Job alerts. <span className="text-gradient-primary">Quiz Shorts.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:mt-6 sm:text-lg">
          Create viral government job alert Shorts and quiz Shorts — connect YouTube, pick a voice, and publish.
        </p>
        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="hero" size="lg" className="w-full sm:w-auto" asChild>
            <Link to="/auth">Open the studio</Link>
          </Button>
        </div>
        <div className="mt-12 flex items-center gap-4 sm:mt-20 sm:gap-10">
          <img src={interviewer} alt="AI host" className="h-20 w-20 rounded-full object-cover ring-2 ring-primary shadow-glow sm:h-28 sm:w-28 md:h-36 md:w-36" width={816} height={816} />
          <div className="font-display text-xl font-bold text-muted-foreground sm:text-2xl">vs</div>
          <img src={candidate} alt="AI guest" className="h-20 w-20 rounded-full object-cover ring-2 ring-secondary shadow-glow-secondary sm:h-28 sm:w-28 md:h-36 md:w-36" width={816} height={816} />
        </div>
        <div className="mt-12 grid w-full gap-3 sm:mt-20 sm:gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            { icon: Bot, t: "Independent agents", d: "Separate personas, models and memory for host and guest." },
            { icon: Mic, t: "Real voices", d: "English, Hindi and Hinglish voices, played in turn." },
            { icon: Sparkles, t: "Visual explainers", d: "Code, diagrams and key points appear on screen." },
            { icon: Youtube, t: "YouTube Live", d: "OBS-ready scene and broadcast controls." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl glass p-5 text-left">
              <f.icon className="h-5 w-5 text-primary" />
              <div className="mt-3 font-semibold">{f.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
