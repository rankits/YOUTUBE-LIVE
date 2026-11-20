/**
 * Build a 9:16 Short draft from a local video file the user provides
 * (owned / permitted recording — never fetched from a third-party live URL).
 */
import {
  assertCanRecordShort,
  createShortRecorder,
  pickRecorderMime,
  shortRenderProfile,
  unlockAudioContext,
  withScreenWakeLock,
  SHORT_LOGICAL_H,
  SHORT_LOGICAL_W,
} from "./media-record";

export type ClipFromVideoOpts = {
  file: File | Blob;
  startSec: number;
  durationSec: number;
  headline: string;
  brand?: string;
  onProgress?: (f: number) => void;
};

function loadVideo(file: File | Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = false;
    v.playsInline = true;
    v.src = url;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that video file."));
    };
  });
}

/** Duration in seconds for a local video file. */
export async function probeVideoDuration(file: File | Blob): Promise<number> {
  const v = await loadVideo(file);
  const d = v.duration;
  URL.revokeObjectURL(v.src);
  v.removeAttribute("src");
  v.load();
  if (!Number.isFinite(d) || d < 1) throw new Error("Video has no readable duration.");
  return d;
}

/** Clamp clip start so it always fits inside the file. */
export function clampClipStart(startSec: number, fileDuration: number, clipDuration: number) {
  const dur = Math.min(90, Math.max(8, clipDuration));
  const maxStart = Math.max(0, fileDuration - Math.min(dur, fileDuration));
  return Math.min(Math.max(0, startSec), maxStart);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dw: number,
  dh: number,
) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const scale = Math.max(dw / vw, dh / vh);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
}

function drawChrome(ctx: CanvasRenderingContext2D, headline: string, brand: string, t: number, dur: number) {
  // Top gradient + headline
  const g = ctx.createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, "rgba(0,0,0,0.75)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SHORT_LOGICAL_W, 280);

  ctx.fillStyle = "#e10600";
  roundRect(ctx, 60, 48, SHORT_LOGICAL_W - 120, 88, 16);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "italic 800 42px Sora, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = headline.slice(0, 48) || "HIGHLIGHT";
  ctx.fillText(title, SHORT_LOGICAL_W / 2, 94);

  // Bottom brand + progress
  ctx.fillStyle = "#f5c518";
  const bw = Math.min(520, Math.max(180, brand.length * 22));
  ctx.fillRect(SHORT_LOGICAL_W - 60 - bw, SHORT_LOGICAL_H - 120, bw, 64);
  ctx.fillStyle = "#111";
  ctx.font = "800 28px Sora, sans-serif";
  ctx.fillText(brand.slice(0, 22).toUpperCase() || "CLIP", SHORT_LOGICAL_W - 60 - bw / 2, SHORT_LOGICAL_H - 86);

  const prog = Math.min(1, Math.max(0, t / dur));
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(60, SHORT_LOGICAL_H - 40, SHORT_LOGICAL_W - 120, 8);
  ctx.fillStyle = "#e10600";
  ctx.fillRect(60, SHORT_LOGICAL_H - 40, (SHORT_LOGICAL_W - 120) * prog, 8);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderClipFromVideo(o: ClipFromVideoOpts): Promise<Blob> {
  assertCanRecordShort();
  const durationSec = Math.min(90, Math.max(8, o.durationSec));

  return withScreenWakeLock(async () => {
    const profile = shortRenderProfile();
    const video = await loadVideo(o.file);
    const srcUrl = video.src;

    try {
      if (!Number.isFinite(video.duration) || video.duration < 1) {
        throw new Error("Video has no readable duration.");
      }
      // Chat timestamps are from the full live; local files are often shorter clips — always clamp.
      const startSec = clampClipStart(o.startSec, video.duration, durationSec);
      const end = Math.min(video.duration, startSec + durationSec);
      const clipDur = Math.max(1, end - startSec);

      const canvas = document.createElement("canvas");
      canvas.width = profile.width;
      canvas.height = profile.height;
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      document.body.appendChild(canvas);

      const actx = new AudioContext();
      await unlockAudioContext(actx);
      const dest = actx.createMediaStreamDestination();
      let sourceNode: MediaElementAudioSourceNode | null = null;
      try {
        sourceNode = actx.createMediaElementSource(video);
        sourceNode.connect(dest);
        sourceNode.connect(actx.destination);
      } catch {
        // Some browsers only allow one MediaElementSource per element.
      }

      try {
        const ctx = canvas.getContext("2d")!;
        const sx = profile.width / SHORT_LOGICAL_W;
        const sy = profile.height / SHORT_LOGICAL_H;
        ctx.setTransform(sx, 0, 0, sy, 0, 0);

        const rec = createShortRecorder(canvas, dest, profile);
        video.currentTime = startSec;
        await new Promise<void>((res, rej) => {
          const onSeek = () => {
            video.removeEventListener("seeked", onSeek);
            res();
          };
          video.addEventListener("seeked", onSeek);
          window.setTimeout(() => rej(new Error("Seek timed out")), 15_000);
        });

        drawCover(ctx, video, SHORT_LOGICAL_W, SHORT_LOGICAL_H);
        drawChrome(ctx, o.headline, o.brand ?? "HIGHLIGHT", 0, clipDur);
        rec.start();
        await video.play().catch(() => {});

        const wall0 = performance.now();
        const frameMs = 1000 / profile.fps;
        await new Promise<void>((resolve) => {
          const iv = window.setInterval(() => {
            const elapsed = (performance.now() - wall0) / 1000;
            const t = Math.min(clipDur, Math.max(0, video.currentTime - startSec, elapsed));
            drawCover(ctx, video, SHORT_LOGICAL_W, SHORT_LOGICAL_H);
            drawChrome(ctx, o.headline, o.brand ?? "HIGHLIGHT", t, clipDur);
            o.onProgress?.(Math.min(1, t / clipDur));
            if (t >= clipDur - 0.05 || video.ended || video.currentTime >= end - 0.05) {
              window.clearInterval(iv);
              resolve();
            }
          }, frameMs);
        });

        video.pause();
        const blob = await rec.stop();
        await actx.close().catch(() => {});
        // silence unused mime helper reference for tree-shaking clarity
        void pickRecorderMime;
        return blob;
      } finally {
        canvas.remove();
        sourceNode?.disconnect();
      }
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(srcUrl);
    }
  });
}
