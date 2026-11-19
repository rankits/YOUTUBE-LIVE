import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { McqVisual } from "@/lib/mcq-rules";
import { buildShortMeta, planSlots } from "@/lib/shorts-rules";
import { SHORT_THEMES, shortTheme } from "@/lib/stage-themes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Item = { mcq: McqVisual; audioPath: string; topic: string };
type Row = { label: string; state: "wait" | "render" | "upload" | "done" | "fail"; note?: string; url?: string };

/** One click: renders the next 5-6 quiz Shorts and schedules them on YouTube across the day. */
export function BatchShortsDialog({ items, theme }: { items: Item[]; theme?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(Math.min(5, items.length)));
  const [start, setStart] = useState(0);
  const [themeId, setThemeId] = useState(shortTheme(theme).id);
  const [brand, setBrand] = useState("AI Interview Arena");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState(0);
  const stop = useRef(false);

  async function run() {
    const pick = items.slice(start, start + Number(count));
    if (!pick.length) { toast.error("No more questions left for Shorts."); return; }
    const slots = planSlots(pick.length, pick.length, new Date());
    const list: Row[] = pick.map((p, i) => ({ label: `Q${p.mcq.number} → ${format(slots[i]!, "d MMM, h:mm a")}`, state: "wait" }));
    setRows(list); setBusy(true); stop.current = false;
    const upd = (i: number, r: Partial<Row>) => setRows((old) => old.map((o, j) => (j === i ? { ...o, ...r } : o)));
    let ok = 0;
    for (let i = 0; i < pick.length && !stop.current; i++) {
      const p = pick[i]!;
      try {
        upd(i, { state: "render" }); setSub(0);
        const { data } = await supabase.storage.from("interview-audio").createSignedUrl(p.audioPath, 600);
        if (!data?.signedUrl) throw new Error("Voice clip missing");
        const { renderMcqShort } = await import("@/lib/shorts-render");
        const meta = buildShortMeta({ question: p.mcq.question, options: p.mcq.options, answer: p.mcq.answer, topic: p.topic, number: p.mcq.number, language: "english" });
        const blob = await renderMcqShort({ mcq: p.mcq, audioUrl: data.signedUrl, palette: shortTheme(themeId).canvas, brand, topic: p.topic, hook: meta.hook, onProgress: setSub });
        upd(i, { state: "upload" });
        const { data: s } = await supabase.auth.getSession();
        const qs = new URLSearchParams({ title: meta.title, description: meta.description, privacy: "public", tags: meta.tags.join(","), publishAt: slots[i]!.toISOString() });
        const res = await fetch(`/api/youtube/upload-short?${qs}`, { method: "POST", headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}`, "Content-Type": blob.type || "video/webm" }, body: blob });
        const j = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !j.url) throw new Error(j.error ?? "Upload failed");
        upd(i, { state: "done", url: j.url }); ok++;
        if (/quota/i.test(j.error ?? "")) break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        upd(i, { state: "fail", note: msg });
        if (/quota/i.test(msg)) { toast.error("YouTube daily quota finished. Try again tomorrow."); break; }
      }
    }
    setStart((s) => s + pick.length);
    setBusy(false);
    toast.success(`${ok} Shorts scheduled on YouTube`);
  }

  const icon = (r: Row) => r.state === "done" ? <CheckCircle2 className="h-4 w-4 text-success" /> : r.state === "fail" ? <XCircle className="h-4 w-4 text-destructive" /> : r.state === "wait" ? <CalendarClock className="h-4 w-4 text-muted-foreground" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="hero" className="w-full"><CalendarClock /> Auto-schedule Shorts</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Auto-schedule daily Shorts</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">One click: 9:16 Shorts are made from the next questions and scheduled on YouTube between 9 AM and 9 PM. Each Short goes public at its time. Plan a full month from the Shorts box on the YouTube page. {items.length - start} questions left.</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Shorts</Label>
            <Select value={count} onValueChange={setCount} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Theme</Label>
            <Select value={themeId} onValueChange={(v) => setThemeId(v as typeof themeId)} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SHORT_THEMES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Channel</Label><Input value={brand} maxLength={40} disabled={busy} onChange={(e) => setBrand(e.target.value)} /></div>
        </div>
        {busy ? (
          <Button variant="outline" onClick={() => { stop.current = true; }}><Loader2 className="animate-spin" /> Working… (stop after current)</Button>
        ) : (
          <Button variant="hero" onClick={run} disabled={start >= items.length}><CalendarClock /> Make & schedule {count} Shorts</Button>
        )}
        {busy && <><Progress value={sub * 100} /><p className="text-xs text-muted-foreground">Keep this tab open — each Short records in real time.</p></>}
        <ul className="space-y-2 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-2">{icon(r)}<span className="flex-1">{r.label}{r.note && <span className="block text-xs text-destructive">{r.note}</span>}</span>
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open</a>}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
