// Browser-only: renders a 1080x1920 MCQ Short (canvas + quiz audio) to a video Blob.
import { LETTERS, type McqVisual } from "./mcq-rules";
import { hookFooter, hookText, shortTimeline } from "./shorts-rules";
import type { CanvasPalette } from "./stage-themes";

type Palette = CanvasPalette;
const W = 1080;
const H = 1920;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

let HAND = false;
// Whiteboard theme: swap fonts for a marker-pen handwriting face.
function ff(font: string) {
  return HAND ? font.replace(/Sora|Manrope/g, "Kalam").replace(/\b[5-9]00\b/, "700") : font;
}
// Pen-writing reveal: how many characters are "written" so far.
function typed(text: string, t: number, from: number, dur: number) {
  if (!HAND) return text;
  const f = Math.min(1, Math.max(0, (t - from) / Math.max(0.1, dur)));
  return text.slice(0, Math.ceil(text.length * f));
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number, start: number, weight = 700, family = "Sora, Manrope, sans-serif") {
  let size = start;
  let lines: string[] = [];
  while (size > 26) {
    ctx.font = ff(`${weight} ${size}px ${family}`);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) break;
    size -= 4;
  }
  return { size, lines: lines.slice(0, maxLines) };
}

/**
 * Picture via `/api/short-image`.
 * `mode: "real"` → Wikimedia + Openverse first (Job Alerts), then AI fallback.
 * Default → Cloudflare FLUX / Pollinations.
 * Returns null on failure so the Short still renders.
 */
export async function loadShortImage(
  question: string,
  seed: number,
  token: string,
  deadlineMs = 120_000,
  opts?: { mode?: "ai" | "real" },
): Promise<HTMLImageElement | null> {
  const mode = opts?.mode === "real" ? "&mode=real" : "";
  const url = `/api/short-image?q=${encodeURIComponent(question.slice(0, 200))}&seed=${seed}${mode}`;
  const end = Date.now() + deadlineMs;
  const maxAttempts = opts?.mode === "real" ? 2 : 4;
  for (let attempt = 0; attempt < maxAttempts && Date.now() < end; attempt++) {
    let wait = opts?.mode === "real" ? 4_000 : 15_000;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(Math.max(1000, end - Date.now())) });
      if (res.ok) {
        const blobUrl = URL.createObjectURL(await res.blob());
        return await new Promise<HTMLImageElement | null>((resolve) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => resolve(null);
          el.src = blobUrl;
        });
      }
      if (res.status === 401 || res.status === 400) return null;
      const j = (await res.json().catch(() => ({}))) as { retryAfter?: number };
      if (j.retryAfter) wait = Math.min(50, j.retryAfter + 1) * 1000;
    } catch {
      /* network hiccup: retry below */
    }
    if (Date.now() + wait >= end) return null;
    await new Promise((r) => setTimeout(r, wait));
  }
  return null;
}

export function drawShortFrame(ctx: CanvasRenderingContext2D, o: { mcq: McqVisual; t: number; split: number; revealTime: number; p: Palette; brand: string; topic: string; exam?: string | undefined; image?: HTMLImageElement | null | undefined }): void {
  const { mcq, t, p } = o;
  HAND = !!p.hand;
  if (p.viral) return drawViralFrame(ctx, o);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.bg1);
  g.addColorStop(1, p.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (HAND) {
    // aluminium board frame + marker tray
    ctx.strokeStyle = "#9aa3ad";
    ctx.lineWidth = 22;
    ctx.strokeRect(11, 11, W - 22, H - 22);
    ctx.fillStyle = "#b8c0c8";
    ctx.fillRect(140, H - 46, W - 280, 24);
  }
  ctx.textBaseline = "middle";

  ctx.textAlign = "center";
  const img = o.image ?? null;
  const exam = o.exam?.trim();
  let y = 110;
  if (exam) {
    ctx.font = ff("900 50px Sora, sans-serif");
    const label = `🏆 ${exam.toUpperCase()}`.slice(0, 34);
    const bw = Math.min(980, ctx.measureText(label).width + 90);
    ctx.fillStyle = p.primary;
    rr(ctx, W / 2 - bw / 2, y - 48, bw, 96, 48);
    ctx.fill();
    ctx.fillStyle = p.bg2;
    ctx.fillText(label, W / 2, y + 2);
    y += 90;
  }
  if (!img) {
    ctx.fillStyle = p.primary;
    ctx.font = ff("800 44px Sora, sans-serif");
    ctx.fillText("🔥 Can you answer this?", W / 2, y + 60);
    y += 60;
  }
  ctx.fillStyle = p.muted;
  ctx.font = ff("600 34px Manrope, sans-serif");
  ctx.fillText(`${o.topic} · Q${mcq.number}`.slice(0, 48), W / 2, y + 60);
  y += 110;

  // AI visual card
  if (img) {
    const cw = 960, ch = 380, cx = 60;
    const s2 = Math.max(cw / img.width, ch / img.height);
    const sw = cw / s2, sh = ch / s2;
    const zoom = 1 + Math.min(0.06, t * 0.01);
    ctx.save();
    ctx.shadowColor = p.primary;
    ctx.shadowBlur = 40;
    ctx.fillStyle = p.card;
    rr(ctx, cx, y, cw, ch, 36);
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, cx, y, cw, ch, 36);
    ctx.clip();
    ctx.drawImage(img, (img.width - sw / zoom) / 2, (img.height - sh / zoom) / 2, sw / zoom, sh / zoom, cx, y, cw, ch);
    ctx.restore();
    ctx.strokeStyle = p.primary;
    ctx.lineWidth = 5;
    rr(ctx, cx, y, cw, ch, 36);
    ctx.stroke();
    y += ch + 30;
  }

  // Question card
  const q = fitText(ctx, mcq.question, 900, img ? 4 : 6, img ? 52 : 60);
  const qh = q.lines.length * q.size * 1.25 + 90;
  ctx.fillStyle = p.card;
  rr(ctx, 60, y, 960, qh, 36);
  ctx.fill();
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = p.text;
  ctx.font = ff(`700 ${q.size}px Sora, sans-serif`);
  const qDur = o.split * 0.32;
  let used = 0;
  const qTotal = q.lines.join("").length || 1;
  q.lines.forEach((l, i) => {
    const lt = typed(l, t, (used / qTotal) * qDur, (l.length / qTotal) * qDur);
    used += l.length;
    const ly = y + 45 + q.size * 0.6 + i * q.size * 1.25;
    ctx.fillText(lt, W / 2, ly);
  });

  // Options (2x2), appear one by one during the question
  const revealed = t >= o.revealTime;
  const top = y + qh + (img ? 40 : 60);
  const ow = 465;
  const oh = img ? 200 : 260;
  mcq.options.forEach((opt, i) => {
    const appear = Math.min(1, Math.max(0, (t - (o.split * (0.35 + i * 0.15))) / 0.4));
    if (appear <= 0) return;
    const x = 60 + (i % 2) * (ow + 30);
    const y = top + Math.floor(i / 2) * (oh + 30);
    const correct = revealed && i === mcq.answer;
    ctx.globalAlpha = appear * (revealed && !correct ? 0.45 : 1);
    ctx.fillStyle = correct ? p.success : p.card;
    rr(ctx, x, y, ow, oh, 30);
    ctx.fill();
    ctx.strokeStyle = correct ? p.success : p.border;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = correct ? p.bg2 : p.primary;
    ctx.beginPath();
    ctx.arc(x + 60, y + 60, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = correct ? p.success : p.bg2;
    ctx.font = ff("800 38px Sora, sans-serif");
    ctx.fillText(correct ? "✓" : LETTERS[i] ?? "", x + 60, y + 61);
    const f = fitText(ctx, opt, ow - 50, 3, 40, 600);
    ctx.fillStyle = correct ? p.bg2 : p.text;
    ctx.font = ff(`600 ${f.size}px Manrope, sans-serif`);
    const ot = (s: string) => typed(s, t, o.split * (0.35 + i * 0.15), 0.6);
    f.lines.forEach((l, k) => ctx.fillText(ot(l), x + ow / 2, y + oh * 0.58 + (k - (f.lines.length - 1) / 2) * f.size * 1.2));
    ctx.globalAlpha = 1;
    if (HAND && correct) {
      // marker circle drawn around the right answer
      const prog = Math.min(1, (t - o.revealTime) / 0.6);
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.ellipse(x + ow / 2, y + oh / 2, ow / 2 + 14, oh / 2 + 18, -0.04, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2.1 * prog);
      ctx.stroke();
    }
  });

  // Countdown / answer area
  const by = top + 2 * oh + 30 + (img ? 70 : 90);
  if (t >= o.split && !revealed) {
    const left = Math.max(0, o.revealTime - t);
    ctx.fillStyle = p.primary;
    ctx.font = ff("800 150px Sora, sans-serif");
    ctx.fillText(String(Math.ceil(left)), W / 2, by + 60);
    ctx.fillStyle = p.border;
    rr(ctx, 190, by + 170, 700, 18, 9);
    ctx.fill();
    ctx.fillStyle = p.primary;
    rr(ctx, 190, by + 170, 700 * (left / (o.revealTime - o.split || 1)), 18, 9);
    ctx.fill();
  } else if (revealed) {
    ctx.fillStyle = p.success;
    ctx.font = ff("800 52px Sora, sans-serif");
    ctx.fillText(`✅ Answer: ${LETTERS[mcq.answer]}`, W / 2, by + 20);
    if (mcq.explanation) {
      const e = fitText(ctx, mcq.explanation, 900, img ? 2 : 4, 38, 500);
      ctx.fillStyle = p.text;
      ctx.font = ff(`500 ${e.size}px Manrope, sans-serif`);
      e.lines.forEach((l, i) => ctx.fillText(l, W / 2, by + 100 + i * e.size * 1.3));
    }
  } else {
    ctx.fillStyle = p.muted;
    ctx.font = ff("600 40px Manrope, sans-serif");
    ctx.fillText("Comment your answer 👇", W / 2, by + 40);
  }

  // Footer
  ctx.fillStyle = p.muted;
  ctx.font = ff("700 36px Sora, sans-serif");
  ctx.fillText(o.brand, W / 2, H - 120);
}

export async function loadShortFonts() {
  await Promise.all(
    [
      document.fonts?.load("700 48px Kalam"),
      document.fonts?.load('800 48px "Baloo 2"', "Aकअ"),
      document.fonts?.load('400 64px "Yatra One"', "Aकअरेलवे"),
    ].map((f) => f?.catch(() => undefined)),
  );
  await document.fonts?.ready;
}

// ---------- Viral 3D GK theme (wooden signboard, gold picture card, pill options) ----------
type FrameOpts = Parameters<typeof drawShortFrame>[1];
const BALOO = '"Baloo 2", Sora, sans-serif';
const V = { navy: "#1e2a5a", red: "#d62828", gold: "#f5c518", blue: "#1d4ed8", deep: "#0f1f5c", cream: "#fdf6e3", green: "#22c55e", greenDark: "#15803d" };
const vf = (w: number, s: number, italic = false) => `${italic ? "italic " : ""}${w} ${s}px ${BALOO}`;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const norm = (w: string) => w.replace(/[\p{P}\p{S}]/gu, "").toLowerCase();

/** Word(s) shown in red: a quoted phrase if the question has one, else its longest word. */
function keywordSet(question: string): Set<string> {
  const quoted = /[‘'"“]([^’'"”]{2,40})[’'"”]/.exec(question)?.[1];
  const words = (quoted ?? "").split(/\s+/).map(norm).filter(Boolean);
  if (words.length) return new Set(words);
  const longest = question.split(/\s+/).map(norm).filter((w) => w.length >= 5).sort((x, y) => y.length - x.length)[0];
  return new Set(longest ? [longest] : []);
}

function drawNatureBg(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1f5f4a");
  g.addColorStop(0.3, "#2e7d6b");
  g.addColorStop(0.55, "#3b8fd9");
  g.addColorStop(0.8, "#8fd0f0");
  g.addColorStop(1, "#4caf50");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // soft bokeh light
  for (let i = 0; i < 26; i++) {
    const x = rand(i) * W + Math.sin(t * 0.3 + i) * 20;
    const y = rand(i + 50) * H * 0.85;
    const r = 20 + rand(i + 90) * 70;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, "rgba(255,255,230,0.22)");
    rg.addColorStop(1, "rgba(255,255,230,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grass blades
  for (let i = 0; i < 140; i++) {
    const x = rand(i + 200) * W;
    const h = 60 + rand(i + 300) * 140;
    const sway = Math.sin(t * 1.5 + i) * 6 + (rand(i + 400) - 0.5) * 40;
    ctx.strokeStyle = ["#2e7d32", "#43a047", "#66bb6a", "#1b5e20"][i % 4]!;
    ctx.lineWidth = 6 + rand(i + 500) * 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, H + 10);
    ctx.quadraticCurveTo(x + sway * 0.4, H - h * 0.5, x + sway, H - h);
    ctx.stroke();
  }
  // white flowers in the corners
  for (const [fx, fy, fs] of [[70, H - 170, 30], [150, H - 90, 22], [W - 80, H - 190, 28], [W - 170, H - 100, 20]] as const) {
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + t * 0.2;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * fs * 0.7, fy + Math.sin(a) * fs * 0.7, fs * 0.55, fs * 0.35, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(fx, fy, fs * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRays(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, len = 34) {
  ctx.strokeStyle = V.gold;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  for (const a of [-0.6, 0, 0.6]) {
    const ca = Math.cos(a) * dir, sa = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x + ca * 12, y + sa * 12);
    ctx.lineTo(x + ca * (12 + len), y + sa * (12 + len));
    ctx.stroke();
  }
}

function drawQMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = vf(800, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.26;
  ctx.strokeText("?", 0, 0);
  ctx.strokeStyle = V.blue;
  ctx.lineWidth = size * 0.15;
  ctx.strokeText("?", 0, 0);
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, "#ffe14d");
  g.addColorStop(1, "#f59e0b");
  ctx.fillStyle = g;
  ctx.fillText("?", 0, 0);
  ctx.restore();
}

function drawBulb(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const glow = ctx.createRadialGradient(x, y - s * 0.1, 0, x, y - s * 0.1, s * 0.9);
  glow.addColorStop(0, `rgba(255,230,80,${0.55 + Math.sin(t * 4) * 0.15})`);
  glow.addColorStop(1, "rgba(255,230,80,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  const bg = ctx.createRadialGradient(x - s * 0.1, y - s * 0.2, 4, x, y - s * 0.1, s * 0.4);
  bg.addColorStop(0, "#fff7b0");
  bg.addColorStop(1, "#facc15");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.12, s * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#64748b";
  rr(ctx, x - s * 0.17, y + s * 0.2, s * 0.34, s * 0.26, 6);
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  for (let k = 1; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.17, y + s * 0.2 + k * s * 0.085);
    ctx.lineTo(x + s * 0.17, y + s * 0.2 + k * s * 0.085);
    ctx.stroke();
  }
  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y + s * 0.15);
  ctx.lineTo(x - s * 0.06, y - s * 0.1);
  ctx.lineTo(x + s * 0.06, y - s * 0.1);
  ctx.lineTo(x + s * 0.1, y + s * 0.15);
  ctx.stroke();
}

function drawSign(ctx: CanvasRenderingContext2D, label: string, t: number) {
  const cx = W / 2, cy = 125;
  ctx.strokeStyle = "#6b4423";
  ctx.lineWidth = 7;
  for (const dx of [-150, 150]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx, 0);
    ctx.lineTo(cx + dx, cy - 55);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 1.6) * 0.015);
  let size = 76;
  ctx.font = vf(800, size);
  while (ctx.measureText(label).width > 560 && size > 36) ctx.font = vf(800, (size -= 4));
  const bw = Math.max(440, ctx.measureText(label).width + 130), bh = 124;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  const wood = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  wood.addColorStop(0, "#f0c088");
  wood.addColorStop(0.5, "#d9985a");
  wood.addColorStop(1, "#b9773e");
  ctx.fillStyle = wood;
  rr(ctx, -bw / 2, -bh / 2, bw, bh, 28);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#7a4a21";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(122,74,33,0.28)";
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 5; k++) {
    const gy = -bh / 2 + 18 + k * 22;
    ctx.beginPath();
    for (let gx = -bw / 2 + 24; gx <= bw / 2 - 24; gx += 20) ctx.lineTo(gx, gy + Math.sin(gx * 0.04 + k) * 3);
    ctx.stroke();
  }
  ctx.fillStyle = "#6b7280";
  for (const [nx, ny] of [[-bw / 2 + 22, -bh / 2 + 22], [bw / 2 - 22, -bh / 2 + 22], [-bw / 2 + 22, bh / 2 - 22], [bw / 2 - 22, bh / 2 - 22]] as const) {
    ctx.beginPath();
    ctx.arc(nx, ny, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3b82f6";
  for (const nx of [-bw / 2 + 8, bw / 2 - 8]) {
    ctx.beginPath();
    ctx.arc(nx, -bh / 2 + 2, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3b2412";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 6);
  ctx.restore();
  drawRays(ctx, cx - bw / 2 - 18, cy, -1);
  drawRays(ctx, cx + bw / 2 + 18, cy, 1);
  drawBulb(ctx, 105, 120, 150, t);
  drawQMark(ctx, W - 105, 120 + Math.sin(t * 2.5) * 6, 150, 0.12);
}

function drawRichLine(ctx: CanvasRenderingContext2D, line: string, cx: number, y: number, keys: Set<string>, ink: string) {
  const words = line.split(" ");
  const space = ctx.measureText(" ").width;
  let x = cx - ctx.measureText(line).width / 2;
  ctx.textAlign = "left";
  for (const w of words) {
    ctx.fillStyle = keys.has(norm(w)) ? V.red : ink;
    ctx.fillText(w, x, y);
    x += ctx.measureText(w).width + space;
  }
  ctx.textAlign = "center";
}

function drawBrushRibbon(ctx: CanvasRenderingContext2D, y: number, h: number) {
  const x0 = 110, x1 = W - 110;
  ctx.fillStyle = V.deep;
  ctx.beginPath();
  ctx.moveTo(x0, y + 12);
  for (let x = x0; x <= x1; x += 30) ctx.lineTo(x, y + (rand(x) - 0.5) * 14);
  ctx.lineTo(x1 + 40, y + h * 0.25);
  ctx.lineTo(x1 + 10, y + h * 0.5);
  ctx.lineTo(x1 + 50, y + h * 0.8);
  for (let x = x1; x >= x0; x -= 30) ctx.lineTo(x, y + h + (rand(x + 7) - 0.5) * 14);
  ctx.lineTo(x0 - 50, y + h * 0.75);
  ctx.lineTo(x0 - 15, y + h * 0.5);
  ctx.lineTo(x0 - 45, y + h * 0.2);
  ctx.closePath();
  ctx.fill();
}

function drawViralFrame(ctx: CanvasRenderingContext2D, o: FrameOpts) {
  const { mcq, t } = o;
  drawNatureBg(ctx, t);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const exam = o.exam?.trim();
  drawSign(ctx, `${(exam || o.topic || "GK/GS").toUpperCase().slice(0, 20)} • Q${mcq.number}`, t);

  const img = o.image ?? null;
  let y = 250;
  if (img) {
    const cx = 50, cw = 980, ch = 470;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 30;
    const gold = ctx.createLinearGradient(0, y, 0, y + ch);
    gold.addColorStop(0, "#fde68a");
    gold.addColorStop(0.5, V.gold);
    gold.addColorStop(1, "#d4a017");
    ctx.fillStyle = gold;
    rr(ctx, cx - 10, y - 10, cw + 20, ch + 20, 44);
    ctx.fill();
    ctx.restore();
    const s2 = Math.max(cw / img.width, ch / img.height);
    const zoom = 1 + Math.min(0.06, t * 0.01);
    const sw = cw / s2 / zoom, sh = ch / s2 / zoom;
    ctx.save();
    rr(ctx, cx, y, cw, ch, 36);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx, y, cw, ch);
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, cx, y, cw, ch);
    // warm sketch-paper tone over the pencil drawing
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(244,233,208,0.55)";
    ctx.fillRect(cx, y, cw, ch);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    rr(ctx, cx, y, cw, ch, 36);
    ctx.stroke();
    y += ch + 40;
  } else y += 20;

  // Stitched question card with the keyword in red
  const q = fitText(ctx, mcq.question, 860, img ? 3 : 5, img ? 62 : 72, 800, BALOO);
  const qh = q.lines.length * q.size * 1.22 + 84;
  ctx.fillStyle = "#1e40af";
  rr(ctx, 50, y + 12, 980, qh, 40);
  ctx.fill();
  ctx.fillStyle = V.cream;
  rr(ctx, 50, y, 980, qh, 40);
  ctx.fill();
  ctx.setLineDash([16, 11]);
  ctx.strokeStyle = "#b08850";
  ctx.lineWidth = 3;
  rr(ctx, 70, y + 18, 940, qh - 36, 30);
  ctx.stroke();
  ctx.setLineDash([]);
  drawRays(ctx, 62, y + 34, -1, 26);
  drawRays(ctx, W - 62, y + qh - 34, 1, 26);
  ctx.font = vf(800, q.size);
  const keys = keywordSet(mcq.question);
  q.lines.forEach((l, i) => drawRichLine(ctx, l, W / 2, y + 42 + q.size * 0.62 + i * q.size * 1.22, keys, V.navy));
  y += qh + 40;

  // Pill options (stacked) + question-mark / countdown column on the right
  const revealed = t >= o.revealTime;
  const ow = 740, oh = img ? 112 : 140, gap = 22;
  mcq.options.forEach((opt, i) => {
    const a = clamp01((t - o.split * (0.3 + i * 0.12)) / 0.35);
    if (a <= 0) return;
    const x = 50 - (1 - a) * 90;
    const oy = y + i * (oh + gap);
    const correct = revealed && i === mcq.answer;
    ctx.globalAlpha = a * (revealed && !correct ? 0.5 : 1);
    ctx.fillStyle = correct ? V.greenDark : "#1e40af";
    rr(ctx, x, oy + 8, ow, oh, oh / 2);
    ctx.fill();
    ctx.fillStyle = correct ? V.green : "#fffaf0";
    rr(ctx, x, oy, ow, oh, oh / 2);
    ctx.fill();
    ctx.strokeStyle = correct ? V.greenDark : V.blue;
    ctx.lineWidth = 6;
    ctx.stroke();
    const r = oh / 2 - 12, bx = x + oh / 2, by = oy + oh / 2;
    const bg = ctx.createLinearGradient(bx, by - r, bx, by + r);
    bg.addColorStop(0, correct ? "#4ade80" : "#3b82f6");
    bg.addColorStop(1, correct ? V.greenDark : "#1e3a8a");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = vf(800, oh * 0.46);
    ctx.fillText(correct ? "✓" : (LETTERS[i] ?? ""), bx, by + 4);
    const f = fitText(ctx, opt, ow - oh - 60, 2, oh * 0.42, 800, BALOO);
    ctx.fillStyle = correct ? "#ffffff" : V.navy;
    ctx.font = vf(800, f.size);
    const tx = x + oh + (ow - oh - 20) / 2;
    f.lines.forEach((l, k) => ctx.fillText(l, tx, by + 4 + (k - (f.lines.length - 1) / 2) * f.size * 1.15));
    ctx.globalAlpha = 1;
  });
  const optsH = 4 * oh + 3 * gap;
  const rx = 915, ry = y + optsH / 2;
  if (revealed) {
    const pop = Math.min(1, (t - o.revealTime) / 0.3);
    ctx.fillStyle = V.green;
    ctx.beginPath();
    ctx.arc(rx, ry, 100 * pop, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = vf(800, 120 * pop);
    ctx.fillText("✓", rx, ry + 8);
  } else if (t >= o.split) {
    const total = o.revealTime - o.split || 1;
    const left = Math.max(0, o.revealTime - t);
    ctx.fillStyle = V.gold;
    ctx.beginPath();
    ctx.arc(rx, ry, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = V.blue;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = V.red;
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(rx, ry, 118, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / total));
    ctx.stroke();
    ctx.fillStyle = V.navy;
    ctx.font = vf(800, 130);
    ctx.fillText(String(Math.ceil(left)), rx, ry + 10);
  } else {
    drawRays(ctx, rx - 110, ry - 40, -1, 30);
    drawQMark(ctx, rx, ry - 20 + Math.sin(t * 3) * 12, 230, 0.1);
    drawQMark(ctx, rx + 75, ry + 110 + Math.sin(t * 3 + 1) * 8, 100, 0.2);
  }
  y += optsH + 24;

  // Explanation after the reveal
  if (revealed && mcq.explanation) {
    const e = fitText(ctx, mcq.explanation, 900, 2, 36, 700, BALOO);
    const eh = e.lines.length * e.size * 1.25 + 30;
    ctx.fillStyle = "rgba(15,31,92,0.78)";
    rr(ctx, 60, y, 960, eh, 26);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = vf(700, e.size);
    e.lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 15 + e.size * 0.65 + i * e.size * 1.25));
  }

  // Bottom brush ribbon CTA / answer
  const ry2 = H - 200, rh = 116;
  drawBrushRibbon(ctx, ry2, rh);
  ctx.font = vf(800, 66, true);
  const parts: [string, string][] = revealed ? [["Answer: ", "#ffffff"], [LETTERS[mcq.answer] ?? "", V.gold]] : [["Com", "#ffffff"], ["ment", V.gold], [" your answer", "#ffffff"]];
  const full = parts.map((p2) => p2[0]).join("");
  let px = W / 2 - (ctx.measureText(full).width + (revealed ? 0 : 60)) / 2;
  ctx.textAlign = "left";
  for (const [txt, col] of parts) {
    ctx.fillStyle = col;
    ctx.fillText(txt, px, ry2 + rh / 2 + 4);
    px += ctx.measureText(txt).width;
  }
  ctx.textAlign = "center";
  if (!revealed) {
    // little pointing-down arrow
    const ax = px + 34, ay = ry2 + rh / 2 + Math.sin(t * 5) * 5;
    ctx.fillStyle = V.gold;
    ctx.beginPath();
    ctx.moveTo(ax - 22, ay - 10);
    ctx.lineTo(ax + 22, ay - 10);
    ctx.lineTo(ax, ay + 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(ax - 8, ay - 34, 16, 26);
  }
  ctx.font = vf(700, 34);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(o.brand, W / 2, H - 45);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(o.brand, W / 2, H - 45);
}

// Fixed high-contrast poster colours (YouTube feed thumbnails need loud yellow/black regardless of theme).
const HOOK_YELLOW = "#FFD60A";
const HOOK_INK = "#0B0B0F";

/** First ~1 s of the Short: a loud poster (hook banner + huge question) that YouTube uses as the feed thumbnail. */
export function drawHookFrame(ctx: CanvasRenderingContext2D, o: { mcq: McqVisual; t: number; p: Palette; brand: string; topic: string; hook: string; footer: string }) {
  const { p } = o;
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H * 0.45, H * 0.8);
  g.addColorStop(0, p.bg1);
  g.addColorStop(1, HOOK_INK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Light rays
  ctx.save();
  ctx.translate(W / 2, H * 0.45);
  ctx.rotate(o.t * 0.25);
  ctx.fillStyle = p.primary;
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-90, -H);
    ctx.lineTo(90, -H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Tilted yellow hook banner with a slight pop-in
  const pop = 1 + Math.max(0, 0.15 - o.t * 0.6);
  ctx.save();
  ctx.translate(W / 2, 330);
  ctx.rotate(-0.05);
  ctx.scale(pop, pop);
  const hk = fitText(ctx, o.hook.toUpperCase(), 900, 2, 104, 900);
  const bh = hk.lines.length * hk.size * 1.15 + 70;
  ctx.fillStyle = HOOK_INK;
  rr(ctx, -495, -bh / 2 + 14, 990, bh, 28);
  ctx.fill();
  ctx.fillStyle = HOOK_YELLOW;
  rr(ctx, -500, -bh / 2, 990, bh, 28);
  ctx.fill();
  ctx.fillStyle = HOOK_INK;
  ctx.font = `900 ${hk.size}px Sora, sans-serif`;
  hk.lines.forEach((l, i) => ctx.fillText(l, -5, (i - (hk.lines.length - 1) / 2) * hk.size * 1.15));
  ctx.restore();

  // Question number badge
  ctx.fillStyle = HOOK_YELLOW;
  ctx.beginPath();
  ctx.arc(W / 2, 600, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HOOK_INK;
  ctx.font = "900 56px Sora, sans-serif";
  ctx.fillText(`Q${o.mcq.number}`, W / 2, 603);

  // Huge question with a dark outline so it reads on any phone
  const q = fitText(ctx, o.mcq.question, 960, 7, 92, 900);
  const qTop = Math.max(720, 1100 - (q.lines.length * q.size * 1.22) / 2);
  ctx.font = `900 ${q.size}px Sora, sans-serif`;
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = HOOK_INK;
  ctx.fillStyle = p.text;
  q.lines.forEach((l, i) => {
    const y = qTop + q.size * 0.6 + i * q.size * 1.22;
    ctx.strokeText(l, W / 2, y);
    ctx.fillText(l, W / 2, y);
  });

  // Footer pill
  const fy = H - 360;
  ctx.fillStyle = HOOK_YELLOW;
  rr(ctx, W / 2 - 330, fy - 55, 660, 110, 55);
  ctx.fill();
  ctx.fillStyle = HOOK_INK;
  ctx.font = "800 52px Sora, sans-serif";
  ctx.fillText(o.footer, W / 2, fy + 2);
  ctx.fillStyle = p.muted;
  ctx.font = "700 40px Sora, sans-serif";
  ctx.fillText(`${o.topic}`.slice(0, 40), W / 2, H - 210);
  ctx.fillStyle = p.text;
  ctx.font = "800 38px Sora, sans-serif";
  ctx.fillText(o.brand, W / 2, H - 140);
}

/** The hook poster as a 1080x1920 JPEG, uploaded as the video's custom thumbnail. */
export async function renderHookThumbnail(o: { mcq: McqVisual; palette: Palette; brand: string; topic: string; hook?: string; language?: string }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await loadShortFonts();
  const lang = o.language ?? "english";
  drawHookFrame(ctx, { mcq: o.mcq, t: 1, p: o.palette, brand: o.brand, topic: o.topic, hook: o.hook || hookText(o.mcq.number, lang), footer: hookFooter(lang) });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Thumbnail render failed"))), "image/jpeg", 0.9));
}

export async function renderMcqShort(o: { mcq: McqVisual; audioUrl: string; palette: Palette; brand: string; topic: string; hook?: string; language?: string; exam?: string; image?: HTMLImageElement | null; onProgress?: (f: number) => void }): Promise<Blob> {
  const ab = await (await fetch(o.audioUrl)).arrayBuffer();
  const actx = new AudioContext();
  // Browsers start an AudioContext created after awaits as "suspended"; its clock then never moves.
  await actx.resume().catch(() => {});
  const buf = await actx.decodeAudioData(ab);
  const tl = shortTimeline(buf.duration, o.mcq.revealAt);
  if (!tl.fits) throw new Error("This question is too long for a Short (max 3 minutes).");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await loadShortFonts();
  const dest = actx.createMediaStreamDestination();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));

  const lang = o.language ?? "english";
  const hook = o.hook || hookText(o.mcq.number, lang);
  const footer = hookFooter(lang);
  const draw = (t: number) =>
    t < tl.start
      ? drawHookFrame(ctx, { mcq: o.mcq, t, p: o.palette, brand: o.brand, topic: o.topic, hook, footer })
      : drawShortFrame(ctx, { mcq: o.mcq, t: t - tl.start, split: tl.split, revealTime: tl.revealTime, p: o.palette, brand: o.brand, topic: o.topic, exam: o.exam, image: o.image });
  draw(0);
  rec.start(500);
  const t0 = actx.currentTime + 0.1;
  const a = actx.createBufferSource();
  a.buffer = buf;
  a.connect(dest);
  a.start(t0 + tl.start, 0, tl.split);
  const b = actx.createBufferSource();
  b.buffer = buf;
  b.connect(dest);
  b.start(t0 + tl.start + tl.revealTime, tl.split);

  const wall0 = performance.now();
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      // Fall back to the wall clock if the audio clock is stalled, so the render always finishes.
      const wall = (performance.now() - wall0) / 1000 - 0.1;
      const t = Math.max(0, actx.state === "running" ? actx.currentTime - t0 : wall, wall - 2);
      draw(t);
      o.onProgress?.(Math.min(1, t / tl.total));
      if (t >= tl.total) {
        clearInterval(iv);
        resolve();
      }
    }, 1000 / 30);
  });
  rec.stop();
  await done;
  await actx.close();
  return new Blob(chunks, { type: mime?.split(";")[0] ?? "video/webm" });
}
