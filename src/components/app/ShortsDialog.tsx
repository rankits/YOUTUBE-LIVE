import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Smartphone, Upload, Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { McqVisual } from "@/lib/mcq-rules";
import { buildShortMeta } from "@/lib/shorts-rules";
import { SHORT_THEMES, shortTheme } from "@/lib/stage-themes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Turns one quiz question into a 9:16 YouTube Short and uploads it to the connected channel. */
export function ShortsDialog({ mcq, audioPath, topic, theme }: { mcq: McqVisual; audioPath: string; topic: string; theme?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [themeId, setThemeId] = useState(shortTheme(theme).id);
  const [brand, setBrand] = useState("AI Interview Arena");
  const [meta] = useState(() => buildShortMeta({ question: mcq.question, options: mcq.options, answer: mcq.answer, topic, number: mcq.number, language: "english" }));
  const [title, setTitle] = useState(meta.title);
  const [desc, setDesc] = useState(meta.description);
  const [privacy, setPrivacy] = useState("public");
  const [progress, setProgress] = useState<number | null>(null);
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function render() {
    setProgress(0);
    setDone(null);
    try {
      const { assertCanRecordShort } = await import("@/lib/media-record");
      assertCanRecordShort();
      const { data } = await supabase.storage.from("interview-audio").createSignedUrl(audioPath, 600);
      if (!data?.signedUrl) throw new Error("Voice clip for this question is missing.");
      const { renderMcqShort } = await import("@/lib/shorts-render");
      const blob = await renderMcqShort({ mcq, audioUrl: data.signedUrl, palette: shortTheme(themeId).canvas, brand, topic, hook: meta.hook, onProgress: setProgress });
      if (video) URL.revokeObjectURL(video.url);
      setVideo({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast.error("Short could not be made", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setProgress(null);
    }
  }

  async function upload() {
    if (!video) return;
    setUploading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ title, description: desc, privacy, tags: meta.tags.join(",") });
      const { uploadShortVideo } = await import("@/lib/youtube-upload-client");
      const j = await uploadShortVideo({ token: s.session?.access_token ?? "", blob: video.blob, searchParams: qs });
      setDone(j.url);
      toast.success("Short uploaded to YouTube");
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Smartphone /> Make Short
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>YouTube Short — Q{mcq.number}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[240px_1fr]">
          <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-xl border bg-muted">
            {video ? <video src={video.url} controls className="h-full w-full object-contain" /> : <Smartphone className="h-10 w-10 text-muted-foreground" />}
          </div>
          <div className="space-y-3 text-left">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Theme</Label>
                <Select value={themeId} onValueChange={(v) => setThemeId(v as typeof themeId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SHORT_THEMES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Channel name on video</Label>
                <Input value={brand} maxLength={40} onChange={(e) => setBrand(e.target.value)} />
              </div>
            </div>
            {progress !== null ? (
              <div className="space-y-1">
                <Progress value={progress * 100} />
                <p className="text-xs text-muted-foreground">Recording the Short in real time — keep this tab open…</p>
              </div>
            ) : (
              <Button onClick={render} variant={video ? "outline" : "hero"} className="w-full">
                <Smartphone /> {video ? "Make again" : "Make 9:16 Short"}
              </Button>
            )}
            <div className="space-y-1">
              <Label>Title ({title.length}/100)</Label>
              <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Visibility</Label>
              <Select value={privacy} onValueChange={setPrivacy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (review first)</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={upload} disabled={!video || uploading} variant="hero">
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload to YouTube
              </Button>
              {video && (
                <Button variant="outline" asChild>
                  <a href={video.url} download={`short-q${mcq.number}.${video.blob.type?.includes("mp4") ? "mp4" : "webm"}`}><Download /> Download</a>
                </Button>
              )}
            </div>
            {done && (
              <a href={done} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Open on YouTube <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
