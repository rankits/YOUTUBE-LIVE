// Browser-only: builds 1280x720 JPEG thumbnails on a canvas.
const W = 1280;
const H = 720;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

async function avatar(ctx: CanvasRenderingContext2D, src: string, fallback: string, cx: number, cy: number, r: number, ring: string) {
  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    img = await loadImage(fallback);
  }
  ctx.save();
  ctx.shadowColor = ring;
  ctx.shadowBlur = 60;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  cover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

export async function drawVsThumbnail(opts: {
  background: string;
  host: { name: string; src: string; fallback: string; color?: string | null | undefined };
  guest: { name: string; src: string; fallback: string; color?: string | null | undefined };
  headline: string;
  sub: string;
}): Promise<string> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const primary = opts.host.color || cssVar("--primary", "#6d6cf6");
  const secondary = opts.guest.color || cssVar("--secondary", "#a35cf5");
  const live = cssVar("--live", "#ef4444");
  const bgDark = cssVar("--background", "#0b0f1e");
  const fg = cssVar("--foreground", "#f8fafc");

  cover(ctx, await loadImage(opts.background), 0, 0, W, H);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = bgDark;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  await avatar(ctx, opts.host.src, opts.host.fallback, 250, 300, 170, primary);
  await avatar(ctx, opts.guest.src, opts.guest.fallback, W - 250, 300, 170, secondary);

  // VS badge
  ctx.save();
  ctx.shadowColor = live;
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(W / 2, 290, 78, 0, Math.PI * 2);
  ctx.fillStyle = live;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 72px Sora, sans-serif";
  ctx.fillText("VS", W / 2, 294);

  // names
  ctx.font = "700 34px Sora, sans-serif";
  ctx.fillText(opts.host.name.toUpperCase(), 250, 510);
  ctx.fillText(opts.guest.name.toUpperCase(), W - 250, 510);

  // LIVE pill
  ctx.fillStyle = live;
  ctx.beginPath();
  ctx.roundRect(40, 36, 150, 54, 12);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = "800 30px Sora, sans-serif";
  ctx.fillText("● LIVE", 115, 64);

  // headline band
  const grad = ctx.createLinearGradient(0, 540, 0, H);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.35, bgDark);
  grad.addColorStop(1, bgDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 540, W, H - 540);
  ctx.font = "800 58px Sora, sans-serif";
  const lines = wrap(ctx, opts.headline.toUpperCase(), W - 120, 2);
  ctx.save();
  ctx.shadowColor = bgDark;
  ctx.shadowBlur = 12;
  ctx.fillStyle = fg;
  const startY = lines.length === 1 ? 640 : 605;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * 66));
  ctx.restore();
  ctx.font = "600 24px Manrope, sans-serif";
  ctx.fillStyle = primary;
  ctx.fillText(opts.sub, W / 2, 140);

  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Scales any image (e.g. AI output) to an exact 1280x720 JPEG for YouTube. */
export async function toYoutubeThumb(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  cover(ctx, img, 0, 0, W, H);
  return canvas.toDataURL("image/jpeg", 0.9);
}
