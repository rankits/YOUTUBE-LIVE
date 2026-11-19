// Microsoft Edge "Read Aloud" neural voices — free, no API key.
// Protocol mirrors rany2/edge-tts: one WebSocket per text piece, speech.config + SSML, binary MP3 frames until turn.end.
import { EDGE_SEC_MS_GEC_VERSION, EDGE_TRUSTED_CLIENT_TOKEN, secMsGec } from "@/lib/edge-drm";
import { EDGE_MAX_CHARS, edgeRate, escapeSsml, splitForTts } from "@/lib/tts-rules";

const HOST = "speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const MAJOR = "143";
const HEADERS: Record<string, string> = {
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
  "Accept-Language": "en-US,en;q=0.9",
};

const hexId = () => crypto.randomUUID().replace(/-/g, "");
const jsDate = () => new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");

type Sock = {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, fn: (ev: { data?: unknown; code?: number; reason?: string; message?: string }) => void): void;
};

/** Opens the socket on the Worker (fetch upgrade) or Node/Bun (WebSocket with headers). */
async function openSocket(): Promise<Sock> {
  const query = `TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}&ConnectionId=${hexId()}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${EDGE_SEC_MS_GEC_VERSION}`;
  const muid = hexId().toUpperCase();
  const headers = { ...HEADERS, Cookie: `muid=${muid};` };
  const g = globalThis as unknown as { WebSocketPair?: unknown };
  if (typeof g.WebSocketPair !== "undefined") {
    const res = await fetch(`https://${HOST}?${query}`, { headers: { ...headers, Upgrade: "websocket" } });
    const ws = (res as unknown as { webSocket?: Sock & { accept(): void } }).webSocket;
    if (!ws) throw new Error(`Microsoft voice handshake failed [${res.status}]`);
    ws.accept();
    return ws;
  }
  const Ctor = WebSocket as unknown as new (url: string, opts: { headers: Record<string, string> }) => Sock & { binaryType: string };
  const ws = new Ctor(`wss://${HOST}?${query}`, { headers });
  ws.binaryType = "arraybuffer";
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(new Error(`Microsoft voice connection failed: ${e.message ?? "handshake rejected"}`)));
  });
  return ws;
}

async function toBytes(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
}

async function speakPiece(text: string, voice: string, rate: string): Promise<Uint8Array> {
  const ws = await openSocket();
  const chunks: Uint8Array[] = [];
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Microsoft voice timed out."));
    }, 45_000);
    let pending = Promise.resolve();
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        if (ev.data.includes("Path:turn.end")) {
          pending.then(() => {
            clearTimeout(timer);
            ws.close();
            resolve();
          });
        }
        return;
      }
      pending = pending.then(async () => {
        const b = await toBytes(ev.data);
        if (!b || b.length < 2) return;
        const headerLen = (b[0]! << 8) | b[1]!;
        const head = new TextDecoder().decode(b.subarray(2, 2 + headerLen));
        if (!head.includes("Path:audio")) return;
        const body = b.subarray(2 + headerLen);
        if (body.length) chunks.push(body.slice());
      });
    });
    ws.addEventListener("close", (ev) => {
      clearTimeout(timer);
      pending.then(() => (chunks.length ? resolve() : reject(new Error(`Microsoft voice closed early (${ev.code ?? ""} ${ev.reason ?? ""}).`.trim()))));
    });
    ws.addEventListener("error", (ev) => {
      clearTimeout(timer);
      reject(new Error(`Microsoft voice error: ${ev.message ?? "unknown"}`));
    });
  });
  const ts = jsDate();
  ws.send(
    `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}\r\n`,
  );
  const lang = voice.split("-").slice(0, 2).join("-");
  ws.send(
    `X-RequestId:${hexId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'>` +
      `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escapeSsml(text)}</prosody></voice></speak>`,
  );
  await done;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new Error("Microsoft voice returned no audio.");
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Speaks text with a Microsoft Edge neural voice. Returns one MP3 (pieces concatenate cleanly at frame level). */
export async function speakEdge(text: string, voice: string, speed = 1): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!/^[a-z]{2,3}-[A-Za-z]{2,}(-[A-Za-z]+)?-\w+Neural$/.test(voice)) throw new Error(`Unknown Microsoft voice: ${voice}`);
  const rate = edgeRate(speed);
  const pieces = splitForTts(text, EDGE_MAX_CHARS);
  // Pieces are synthesized in parallel (a long answer has only a few), each with one retry.
  const parts = await Promise.all(
    pieces.map(async (p) => {
      try {
        return await speakPiece(p, voice, rate);
      } catch {
        return speakPiece(p, voice, rate);
      }
    }),
  );
  const total = parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of parts) {
    out.set(c, o);
    o += c.length;
  }
  return { bytes: out, contentType: "audio/mpeg" };
}
