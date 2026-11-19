import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/queries";
import { OPTIONAL_NAV, defaultNavPrefs, readNavPrefs, writeNavPrefs, type NavPrefs, type OptionalNavId } from "@/lib/nav-prefs";
import { Page, PageHeader } from "@/components/app/AppShell";
import { ElevenLabsKeyPanel } from "@/components/app/ElevenLabsKeyPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Job Alert Studio" },
      { name: "description", content: "Profile, ElevenLabs key, and sidebar menus." },
      { property: "og:title", content: "Settings — Job Alert Studio" },
      { property: "og:description", content: "Profile, ElevenLabs key, and sidebar menus." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery()),
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useSuspenseQuery(settingsQuery());
  const qc = useQueryClient();
  const [s, setS] = useState({
    display_name: data.profile?.display_name ?? "",
    channel_name: data.profile?.channel_name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [nav, setNav] = useState<NavPrefs>(() => readNavPrefs());

  function setNavItem(id: OptionalNavId, on: boolean) {
    const next = { ...nav, [id]: on };
    setNav(next);
    writeNavPrefs(next);
    toast.success(on ? "Menu shown" : "Menu hidden");
  }

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user!.id;
    const { error } = await supabase.from("profiles").upsert({ id, display_name: s.display_name, channel_name: s.channel_name });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <>
      <PageHeader title="Settings" description="Profile, one ElevenLabs free key, and sidebar menus." />
      <Page className="mx-auto max-w-3xl">
        <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-5 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Profile</h2>
          <div className="grid gap-1.5">
            <Label>Display name</Label>
            <Input value={s.display_name} onChange={(e) => setS({ ...s, display_name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Show / channel name</Label>
            <Input value={s.channel_name} onChange={(e) => setS({ ...s, channel_name: e.target.value })} />
          </div>
        </section>

        <ElevenLabsKeyPanel />

        <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <div>
            <h2 className="font-semibold">Sidebar menus</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Always visible: Job Alerts, Viral Topics, YouTube, AI Agents, Settings. Toggle extra pages below.
            </p>
          </div>
          <div className="space-y-3">
            {OPTIONAL_NAV.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border px-3 py-2.5">
                <div>
                  <Label className="text-sm font-medium">{item.label}</Label>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <Switch checked={nav[item.id]} onCheckedChange={(v) => setNavItem(item.id, v)} />
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => {
              const next = defaultNavPrefs();
              setNav(next);
              writeNavPrefs(next);
              toast.success("Restored default menus");
            }}
          >
            Reset to defaults
          </Button>
        </section>

        <Button variant="hero" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </Page>
    </>
  );
}
