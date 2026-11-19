import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getApiKeyStatus, saveApiKeys } from "@/backend/keys.functions";
import { DEFAULT_PREFS } from "@/lib/provider-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** One ElevenLabs free API key — paste from elevenlabs.io (single account). */
export function ElevenLabsKeyPanel() {
  const statusFn = useServerFn(getApiKeyStatus);
  const saveFn = useServerFn(saveApiKeys);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["api-key-status"], queryFn: () => statusFn() });
  const [key, setKey] = useState("");
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => {
    if (data) setPrefs(data.prefs);
  }, [data]);

  const saved = data?.saved.elevenlabs;
  const appDefault = data?.appDefaults.elevenlabs;

  async function save() {
    if (!remove && !key.trim() && !saved) {
      toast.error("Paste your ElevenLabs API key first.");
      return;
    }
    setBusy(true);
    try {
      await saveFn({
        data: {
          keys: { elevenlabs: remove ? null : key.trim() || undefined },
          prefs,
        },
      });
      setKey("");
      setRemove(false);
      toast.success(remove ? "ElevenLabs key removed" : "ElevenLabs key saved");
      qc.invalidateQueries({ queryKey: ["api-key-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> ElevenLabs (1 free key)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Free plan ~10,000 credits/month. Get key:{" "}
          <a className="text-primary underline" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">
            elevenlabs.io → API Keys
          </a>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Encrypted on server — not shown again after save.
        </p>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>API key</Label>
          <span className="text-xs text-muted-foreground">
            {remove ? "Will be removed" : saved ? <span className="text-success">Your key saved</span> : appDefault ? "Using app default" : "Not set"}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            autoComplete="off"
            className="flex-1"
            placeholder={saved ? "•••••••• (type to replace)" : "sk_... or xi-..."}
            value={remove ? "" : key}
            disabled={remove || busy}
            onChange={(e) => {
              setRemove(false);
              setKey(e.target.value);
            }}
          />
          {saved && !remove && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemove(true)}>
              Remove
            </Button>
          )}
          {remove && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemove(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      <Button variant="hero" className="w-fit" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : remove ? "Remove key" : "Save ElevenLabs key"}
      </Button>
      <p className="text-xs text-muted-foreground">
        After save: Job Alerts / Viral Topics / Agents → Voice provider → <b>ElevenLabs</b>. Daily Shorts ke liye Microsoft (free) better hai jab quota khatam ho.
      </p>
    </section>
  );
}
