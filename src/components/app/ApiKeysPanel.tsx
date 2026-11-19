import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getApiKeyStatus, saveApiKeys } from "@/backend/keys.functions";
import { DEFAULT_PREFS, KEY_FIELDS, type KeyField, type ProviderPrefs } from "@/lib/provider-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KEY_INFO: Record<KeyField, { name: string; hint: string; placeholder: string }> = {
  deepgram: { name: "Deepgram", hint: "Natural English voices. Leave empty to use the app's default Deepgram.", placeholder: "Deepgram API key" },
  sarvam: { name: "Sarvam AI", hint: "Best Hindi & Hinglish voices (Bulbul). dashboard.sarvam.ai", placeholder: "Sarvam API subscription key" },
  gemini: { name: "Google AI Studio (Gemini)", hint: "Gemini voices + Gemini chat backup. aistudio.google.com", placeholder: "AIza..." },
  googleCloud: { name: "Google Cloud Text-to-Speech", hint: "Large free monthly quota, Indian voices. Enable the Text-to-Speech API on the key.", placeholder: "AIza..." },
  groq: { name: "Groq", hint: "Fastest free chat brain. console.groq.com", placeholder: "gsk_..." },
  elevenlabs: { name: "ElevenLabs", hint: "Premium studio voices (optional).", placeholder: "ElevenLabs API key" },
};

const VOICE_OPTS = [
  { v: "agent", l: "Agent's own voice" },
  { v: "edge", l: "Microsoft voices (free, unlimited)" },
  { v: "deepgram", l: "Deepgram Aura (English)" },
  { v: "sarvam", l: "Sarvam AI (Hindi/Hinglish)" },
  { v: "gemini", l: "Gemini voice" },
  { v: "google_cloud", l: "Google Cloud TTS" },
  { v: "elevenlabs", l: "ElevenLabs" },
  { v: "lovable", l: "Built-in (uses credits)" },
];

export function ApiKeysPanel() {
  const statusFn = useServerFn(getApiKeyStatus);
  const saveFn = useServerFn(saveApiKeys);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["api-key-status"], queryFn: () => statusFn() });
  const [draft, setDraft] = useState<Partial<Record<KeyField, string | null>>>({});
  const [prefs, setPrefs] = useState<ProviderPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setPrefs(data.prefs);
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await saveFn({ data: { keys: draft, prefs } });
      setDraft({});
      toast.success("Keys & providers saved");
      qc.invalidateQueries({ queryKey: ["api-key-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> API keys & AI providers</h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Keys are encrypted on the server and never shown again after saving.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {KEY_FIELDS.map((f) => {
          const saved = data?.saved[f];
          const removing = draft[f] === null;
          return (
            <div key={f} className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>{KEY_INFO[f].name}</Label>
                <span className="text-xs text-muted-foreground">
                  {removing ? "Will be removed" : saved ? <span className="text-success">Your key saved</span> : data?.appDefaults[f] ? "Using app default" : "Not set"}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={saved ? "•••••••• (type to replace)" : KEY_INFO[f].placeholder}
                  value={typeof draft[f] === "string" ? (draft[f] as string) : ""}
                  onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                />
                {saved && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, [f]: null })}>Remove</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{KEY_INFO[f].hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t pt-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>Chat brain</Label>
          <Select value={prefs.chatPrimary} onValueChange={(v) => setPrefs({ ...prefs, chatPrimary: v as ProviderPrefs["chatPrimary"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (Groq → Gemini → Built-in)</SelectItem>
              <SelectItem value="groq">Groq first</SelectItem>
              <SelectItem value="gemini">Gemini first</SelectItem>
              <SelectItem value="lovable">Built-in first (credits)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Voice for English shows</Label>
          <Select value={prefs.voiceEnglish} onValueChange={(v) => setPrefs({ ...prefs, voiceEnglish: v as ProviderPrefs["voiceEnglish"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VOICE_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Voice for Hindi & Hinglish shows</Label>
          <Select value={prefs.voiceIndian} onValueChange={(v) => setPrefs({ ...prefs, voiceIndian: v as ProviderPrefs["voiceIndian"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VOICE_OPTS.filter((o) => o.v !== "deepgram").map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 rounded-xl bg-accent/40 p-3">
        <div>
          <Label>Auto-fallback (recommended)</Label>
          <p className="text-xs text-muted-foreground">If a provider fails or hits its limit, the next one takes over instantly so the live show never stops. Free Microsoft voices are the first backup; Deepgram is skipped for Hindi/Hinglish.</p>
        </div>
        <Switch checked={prefs.fallback} onCheckedChange={(v) => setPrefs({ ...prefs, fallback: v })} />
      </div>
      <Button variant="hero" onClick={save} disabled={busy || !data}>{busy ? "Saving…" : "Save keys & providers"}</Button>
    </section>
  );
}
