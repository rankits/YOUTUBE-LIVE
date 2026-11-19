// Browser-only: Job Alert Short (poster + photo mix) + clickbait thumbnail.
import { loadShortFonts } from "./shorts-render";
import type { JobFacts } from "./news-rules";

const W = 1080;
const H = 1920;
const RED = "#dc1428";
const NAVY = "#0b1736";
const YELLOW = "#ffd400";

export type NewsShortInput = {
  headline: string;
  jobName?: string;
  points: string[];
  facts?: JobFacts;
  kindLabel: string;
  source: string;
  brand: string;
  image?: HTMLImageElement | null;
  scenes?: NewsScene[];
};
export type NewsScene = {
  say: string;
  keyword: string;
  layout?: "poster" | "photo";
  image?: HTMLImageElement | null;
};

export function sceneAt(scenes: { say: string }[], t: number, total: number) {
  const sum = scenes.reduce((a, x) => a + x.say.length, 0) || 1;
  const speak = Math.max(1, total - 1.5);
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const len = ((scenes[i]?.say.length ?? 0) / sum) * speak;
    if (t < acc + len + 0.3) return { i, local: Math.max(0, t - acc - 0.3), len };
    acc += len;
  }
  return { i: scenes.length - 1, local: 99, len: 1 };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

const YATRA = '"Yatra One", "Baloo 2", Sora, sans-serif';
const F = (w: number, s: number, display = false) => `${w} ${s}px ${display ? YATRA : '"Baloo 2", Sora, sans-serif'}`;

export function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1,
) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function studioBg(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#071a44");
  g.addColorStop(0.45, "#0b2f6b");
  g.addColorStop(1, "#05122e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Soft ceiling lights
  for (const x of [180, 540, 900]) {
    const lg = ctx.createRadialGradient(x, 80, 10, x, 80, 160);
    lg.addColorStop(0, "rgba(255,255,255,0.35)");
    lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(x - 160, 0, 320, 220);
  }
}

function drawBreakingBar(ctx: CanvasRenderingContext2D) {
  // BREAKING (red) + NEWS (yellow) slanted look
  ctx.save();
  ctx.translate(40, 70);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(0, 0, 340, 88, 10);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = F(800, 52);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BREAKING", 170, 46);
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(320, 0, 220, 88, 10);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.fillText("NEWS", 430, 46);
  ctx.restore();

  // LIVE pill
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(W - 220, 78, 180, 64, 32);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(W - 175, 110, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = F(800, 36);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LIVE", W - 150, 112);
}

function pointsFallback(o: NewsShortInput) {
  return (o.points?.[0] || o.kindLabel || "").trim();
}

function highlightRows(o: NewsShortInput, sc?: NewsScene): { label: string; value: string }[] {
  const f = o.facts ?? {};
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Key Fact", value: sc?.keyword || f.posts || o.points?.[0] || "Update" });
  rows.push({ label: "Total Posts", value: f.posts || o.points?.[1] || "TBA" });
  rows.push({ label: "Qualification", value: f.qualification || "As notified" });
  rows.push({ label: "Last Date", value: f.endDate || f.startDate || "Soon" });
  rows.push({ label: "Age Limit", value: f.ageLimit || "As per rules" });
  return rows;
}

/**
 * TV news-studio Short:
 * - Left green-slot → scene image
 * - Right panel → job name + highlights (light up as voice speaks)
 * - BREAKING NEWS / LIVE + Hindi CTA + ticker
 */
function drawNewsStudio(ctx: CanvasRenderingContext2D, o: NewsShortInput, t: number, total: number) {
  const scenes = o.scenes ?? [];
  const { i, local } = scenes.length ? sceneAt(scenes, t, total) : { i: 0, local: 1 };
  const sc = scenes[i];
  const img = sc?.image ?? o.image ?? null;
  const job = (o.jobName || "GOVT JOBS").slice(0, 22);

  studioBg(ctx);
  drawBreakingBar(ctx);

  // Left media window (was green screen)
  const mx = 36;
  const my = 200;
  const mw = 560;
  const mh = 980;
  ctx.save();
  ctx.shadowColor = "rgba(80,180,255,0.55)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#0a1f4a";
  ctx.beginPath();
  ctx.roundRect(mx - 8, my - 8, mw + 16, mh + 16, 28);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 22);
  ctx.clip();
  if (img) coverDraw(ctx, img, mx, my, mw, mh, 1.04 + 0.03 * Math.min(1, t / 25));
  else {
    ctx.fillStyle = "#00c853";
    ctx.fillRect(mx, my, mw, mh);
  }
  // Dark scrim so big text stays readable on the photo
  const scrim = ctx.createLinearGradient(mx, my + mh * 0.35, mx, my + mh);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(0.45, "rgba(0,0,0,0.35)");
  scrim.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = scrim;
  ctx.fillRect(mx, my, mw, mh);
  ctx.restore();

  const postsLabel = (o.facts?.posts || "").trim() || "New Vacancy";
  const cx = mx + mw / 2;

  // 1) HUGE bharti name on the video image (always visible)
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let bSize = 78;
  ctx.font = F(400, bSize, true);
  while (ctx.measureText(job).width > mw - 48 && bSize > 40) {
    bSize -= 3;
    ctx.font = F(400, bSize, true);
  }
  const bLines = wrap(ctx, job, mw - 48).slice(0, 2);
  const bBoxH = bLines.length * bSize * 1.15 + 36;
  const bY = my + mh * 0.42;
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(mx + 20, bY, mw - 40, bBoxH, 22);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#111111";
  bLines.forEach((l, li) => ctx.fillText(l, cx, bY + 22 + bSize * 0.55 + li * bSize * 1.1));
  ctx.restore();

  // 2) HUGE posts / pad count under bharti name
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padText = postsLabel.toLowerCase().includes("post") || /पद|pad|vacanc/i.test(postsLabel)
    ? postsLabel
    : `${postsLabel} Posts`;
  let pSize = 56;
  ctx.font = F(400, pSize, true);
  while (ctx.measureText(padText).width > mw - 56 && pSize > 32) {
    pSize -= 2;
    ctx.font = F(400, pSize, true);
  }
  const pW = Math.min(mw - 40, ctx.measureText(padText).width + 56);
  const pY = bY + bBoxH + 24;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(cx - pW / 2, pY, pW, pSize + 40, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(padText.slice(0, 28), cx, pY + (pSize + 40) / 2 + 2);
  ctx.restore();

  // 3) Spoken-beat keyword — large readable banner on the video image
  const punch = (sc?.keyword || pointsFallback(o) || "").slice(0, 32);
  if (punch) {
    const pop = Math.min(1, local / 0.22);
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.8 * pop;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 58;
    ctx.font = F(400, size, true);
    while (ctx.measureText(punch).width > mw - 48 && size > 34) {
      size -= 2;
      ctx.font = F(400, size, true);
    }
    const boxH = size + 44;
    const boxY = my + mh - boxH - 28;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = YELLOW;
    ctx.beginPath();
    ctx.roundRect(mx + 18, boxY, mw - 36, boxH, 18);
    ctx.fill();
    ctx.shadowBlur = 0;
    // red accent edge so it reads as a key fact
    ctx.fillStyle = RED;
    ctx.fillRect(mx + 18, boxY, 14, boxH);
    ctx.fillStyle = "#111111";
    ctx.fillText(punch, cx, boxY + boxH / 2 + 2);
    ctx.restore();
  }

  // Right info panel
  const px = 620;
  const py = 200;
  const pw = 420;
  const ph = 980;
  const pg = ctx.createLinearGradient(px, py, px + pw, py + ph);
  pg.addColorStop(0, "#0d2a66");
  pg.addColorStop(1, "#081a40");
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 26);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,212,0,0.35)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = F(800, 36);
  ctx.fillText("Government Jobs", px + pw / 2, py + 50);
  ctx.fillStyle = YELLOW;
  ctx.font = F(400, 52, true);
  ctx.fillText("2026", px + pw / 2, py + 108);

  // Big bharti name
  let jSize = 48;
  ctx.font = F(400, jSize, true);
  while (ctx.measureText(job).width > pw - 40 && jSize > 28) {
    jSize -= 2;
    ctx.font = F(400, jSize, true);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(job, px + pw / 2, py + 175);

  // बड़ी भर्ती banner
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(px + 36, py + 220, pw - 72, 64, 12);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.font = F(400, 40, true);
  ctx.fillText("बड़ी भर्ती!", px + pw / 2, py + 254);

  // Highlights list — rows light up with scene / time
  const rows = highlightRows(o, sc);
  const activeRow = Math.min(rows.length - 1, Math.max(0, i % rows.length));
  let ry = py + 320;
  rows.forEach((row, idx) => {
    const appear = Math.min(1, Math.max(0, (local + (i > idx ? 1 : 0) - idx * 0.08) / 0.35));
    const lit = idx === activeRow;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * Math.max(appear, lit ? 1 : 0.5);
    ctx.fillStyle = lit ? "#ffffff" : "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.roundRect(px + 24, ry, pw - 48, 86, 16);
    ctx.fill();
    // icon circle
    ctx.fillStyle = lit ? RED : "#1d4ed8";
    ctx.beginPath();
    ctx.arc(px + 70, ry + 43, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = F(800, 22);
    ctx.fillText(String(idx + 1), px + 70, ry + 45);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(11,23,54,0.65)";
    ctx.font = F(700, 22);
    ctx.fillText(row.label, px + 110, ry + 28);
    ctx.fillStyle = lit ? RED : NAVY;
    ctx.font = F(800, 28);
    ctx.fillText(wrap(ctx, row.value, pw - 160)[0] ?? row.value, px + 110, ry + 58);
    ctx.textAlign = "center";
    ctx.restore();
    ry += 100;
  });

  // Mid strip: posts / pad count (replaces empty red desk circle)
  const midY = my + mh + 28;
  const padLine = (() => {
    const p = (o.facts?.posts || "").trim();
    if (!p) return "नई भर्ती — Apply Now";
    return /post|पद|pad|vacanc/i.test(p) ? p : `${p} Posts`;
  })();
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(40, midY, W - 80, 100, 20);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.font = F(400, 48, true);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let midSize = 48;
  while (ctx.measureText(padLine).width > W - 120 && midSize > 30) {
    midSize -= 2;
    ctx.font = F(400, midSize, true);
  }
  ctx.fillText(padLine.slice(0, 36), W / 2, midY + 52);

  // Bottom: HUGE bharti name so viewers instantly see whose vacancy it is
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(24, H - 400, W - 48, 150, 20);
  ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.fillRect(24, H - 400, W - 48, 14);
  let botSize = 88;
  ctx.font = F(400, botSize, true);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  while (ctx.measureText(job).width > W - 100 && botSize > 48) {
    botSize -= 4;
    ctx.font = F(400, botSize, true);
  }
  const botLines = wrap(ctx, job, W - 100).slice(0, 2);
  botLines.forEach((l, li) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(l, W / 2, H - 320 + li * (botSize * 0.95) - ((botLines.length - 1) * botSize * 0.4));
  });

  // JOB ALERT strip under bharti name
  ctx.fillStyle = "#111111";
  ctx.fillRect(24, H - 240, W - 48, 72);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(24, H - 240, 240, 72);
  ctx.fillStyle = "#111111";
  ctx.font = F(800, 34);
  ctx.fillText("JOB ALERT", 144, H - 202);
  ctx.fillStyle = "#ffffff";
  ctx.font = F(400, 30, true);
  ctx.fillText((o.kindLabel || "NEW VACANCY").slice(0, 28), W / 2 + 80, H - 202);

  // Footer ticker — bharti name repeated big in scroll
  ctx.fillStyle = "#0a1f4a";
  ctx.fillRect(0, H - 150, W, 150);
  ctx.textAlign = "left";
  const tick = `${job}   ★   ${job}   ★   VACANCY   ★   `;
  ctx.font = F(400, 48, true);
  const tw = ctx.measureText(tick).width || 1;
  const x0 = W - ((t * 200) % tw);
  ctx.fillStyle = YELLOW;
  ctx.fillText(tick, x0, H - 70);
  ctx.fillText(tick, x0 - tw, H - 70);

  // Progress dots
  const n = scenes.length || 1;
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = k === i ? YELLOW : "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(W / 2 + (k - (n - 1) / 2) * 36, H - 120, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawNewsFrame(ctx: CanvasRenderingContext2D, o: NewsShortInput, t: number, total: number) {
  drawNewsStudio(ctx, o, t, total);
}

/**
 * Attractive feed thumbnail — Breaking News poster:
 * big bharti name, left image, right Highlights card, Hindi CTA.
 */
export function drawClickbaitThumbnail(ctx: CanvasRenderingContext2D, o: NewsShortInput) {
  const img = o.image ?? o.scenes?.find((s) => s.image)?.image ?? null;
  const job = (o.jobName || "GOVT JOBS").trim().slice(0, 22);
  const rows = highlightRows(o).slice(0, 4);

  // Blue sky / studio gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1a4a9e");
  bg.addColorStop(0.45, "#0d2f6e");
  bg.addColorStop(1, "#061530");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawBreakingBar(ctx);

  // Government Jobs
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = F(800, 64);
  ctx.fillText("Government Jobs", W / 2, 220);

  // Vacancy 2026 yellow slant banner
  ctx.save();
  ctx.translate(W / 2, 310);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(-420, -48, 840, 96, 14);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.font = F(800, 58);
  ctx.fillText("Vacancy 2026", 0, 4);
  ctx.restore();

  // Huge bharti name (whose vacancy)
  let jSize = 88;
  ctx.font = F(400, jSize, true);
  while (ctx.measureText(job).width > W - 80 && jSize > 48) {
    jSize -= 4;
    ctx.font = F(400, jSize, true);
  }
  ctx.fillStyle = YELLOW;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 18;
  ctx.fillText(job, W / 2, 430);
  ctx.shadowBlur = 0;

  // Hindi red brush banner
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(70, 490, W - 140, 78, 12);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = F(400, 40, true);
  ctx.fillText("सरकारी नौकरी का सुनहरा मौका!", W / 2, 532);

  // Left image panel
  const ix = 40;
  const iy = 600;
  const iw = 480;
  const ih = 780;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(ix - 6, iy - 6, iw + 12, ih + 12, 26);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(ix, iy, iw, ih, 22);
  ctx.clip();
  if (img) coverDraw(ctx, img, ix, iy, iw, ih, 1.05);
  else {
    ctx.fillStyle = "#1e3a6e";
    ctx.fillRect(ix, iy, iw, ih);
  }
  ctx.restore();

  // Dark scrim + HUGE bharti + posts on left image (same as video)
  const tScrim = ctx.createLinearGradient(ix, iy + ih * 0.4, ix, iy + ih);
  tScrim.addColorStop(0, "rgba(0,0,0,0)");
  tScrim.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = tScrim;
  ctx.fillRect(ix, iy, iw, ih);

  const postsRaw = (o.facts?.posts || rows[0]?.value || "New Vacancy").trim();
  const padText = /post|पद|pad|vacanc/i.test(postsRaw) ? postsRaw : `${postsRaw} Posts`;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let chipSize = 52;
  ctx.font = F(400, chipSize, true);
  while (ctx.measureText(job).width > iw - 48 && chipSize > 32) {
    chipSize -= 2;
    ctx.font = F(400, chipSize, true);
  }
  const chipH = chipSize + 36;
  const chipY = iy + ih - 220;
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(ix + 20, chipY, iw - 40, chipH, 18);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.fillText(job, ix + iw / 2, chipY + chipH / 2);

  let padSize = 40;
  ctx.font = F(400, padSize, true);
  while (ctx.measureText(padText).width > iw - 48 && padSize > 26) {
    padSize -= 2;
    ctx.font = F(400, padSize, true);
  }
  const padH = padSize + 28;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(ix + 20, chipY + chipH + 14, iw - 40, padH, 16);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(padText.slice(0, 28), ix + iw / 2, chipY + chipH + 14 + padH / 2);

  // Right Highlights card
  const cx = 540;
  const cy = 600;
  const cw = 500;
  const ch = 780;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 28);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.roundRect(cx + 80, cy + 28, cw - 160, 56, 28);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = F(800, 28);
  ctx.fillText("— Highlights —", cx + cw / 2, cy + 58);

  rows.forEach((r, i) => {
    const y = cy + 130 + i * 140;
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(cx + 70, y + 30, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = F(800, 26);
    ctx.fillText(String(i + 1), cx + 70, y + 32);
    ctx.textAlign = "left";
    ctx.fillStyle = "#222222";
    ctx.font = F(700, 26);
    ctx.fillText(r.label, cx + 120, y + 12);
    ctx.fillStyle = RED;
    ctx.font = F(800, 32);
    ctx.fillText(wrap(ctx, r.value, cw - 180)[0] ?? r.value, cx + 120, y + 52);
    ctx.textAlign = "center";
  });

  // Bottom yellow CTA
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(50, H - 360, W - 100, 110, 18);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(130, H - 305, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = F(800, 36);
  ctx.fillText("▶", 130, H - 302);
  ctx.fillStyle = "#111111";
  ctx.font = F(400, 34, true);
  ctx.fillText("Watch the video for full details!", W / 2 + 40, H - 302);

  // Footer chips
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, H - 200, W, 200);
  ctx.fillStyle = "#ffffff";
  ctx.font = F(700, 28);
  ctx.fillText("Eligibility  |  Age Limit  |  Selection  |  Dates", W / 2, H - 120);
  ctx.fillStyle = YELLOW;
  ctx.font = F(800, 36);
  ctx.fillText((o.brand || "Job Alert").slice(0, 28), W / 2, H - 60);
}

export async function renderNewsThumbnail(o: NewsShortInput): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  await loadShortFonts();
  drawClickbaitThumbnail(c.getContext("2d")!, o);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Thumbnail render failed"))), "image/jpeg", 0.92));
}

export async function renderNewsShort(o: NewsShortInput & { audioUrl: string; onProgress?: (f: number) => void }): Promise<Blob> {
  const ab = await (await fetch(o.audioUrl)).arrayBuffer();
  const actx = new AudioContext();
  await actx.resume().catch(() => {});
  const buf = await actx.decodeAudioData(ab);
  const total = Math.min(178, buf.duration + 1.5);
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
  drawNewsFrame(ctx, o, 0, total);
  rec.start(500);
  const t0 = actx.currentTime + 0.1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  src.start(t0 + 0.3);
  const wall0 = performance.now();
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      const wall = (performance.now() - wall0) / 1000 - 0.1;
      const t = Math.max(0, actx.state === "running" ? actx.currentTime - t0 : wall, wall - 2);
      drawNewsFrame(ctx, o, t, total);
      o.onProgress?.(Math.min(1, t / total));
      if (t >= total) {
        clearInterval(iv);
        resolve();
      }
    }, 1000 / 30);
  });
  rec.stop();
  await done;
  await actx.close();
  return new Blob(chunks, { type: mime?.split(";")[0] || "video/webm" });
}
