/** Browser video capture helpers — desktop + mobile (Safari/Chrome). */

export const SHORT_LOGICAL_W = 1080;
export const SHORT_LOGICAL_H = 1920;

export type ShortRenderProfile = {
  width: number;
  height: number;
  fps: number;
  videoBitsPerSecond: number;
  timesliceMs: number;
  mobile: boolean;
};

export function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ""));
}

export function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

/** Smaller canvas + bitrate so Shorts finish on phones and stay upload-friendly. */
export function shortRenderProfile(): ShortRenderProfile {
  const mobile = isMobileBrowser();
  if (!mobile) {
    // 720p @ ~2Mbps ≈ 15MB/min — safer for staging + YouTube transfer on Hobby.
    return { width: 720, height: 1280, fps: 30, videoBitsPerSecond: 2_000_000, timesliceMs: 500, mobile: false };
  }
  return { width: 720, height: 1280, fps: 24, videoBitsPerSecond: 1_500_000, timesliceMs: 1000, mobile: true };
}

/** Prefer MP4 on Safari/iOS; WebM elsewhere. */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const safari = isSafariBrowser() || /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const candidates = safari
    ? [
        "video/mp4",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]
    : [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
  return candidates.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

export function assertCanRecordShort() {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot record Shorts. Use Chrome on Android, or desktop Chrome / Edge.");
  }
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    throw new Error("This browser cannot capture canvas video. Update your browser, or use desktop Chrome.");
  }
  const mime = pickRecorderMime();
  if (!mime && isSafariBrowser()) {
    // Some Safari builds accept MediaRecorder without an explicit mime.
    return;
  }
  if (!mime) {
    throw new Error("No supported video format on this phone. Try Chrome on Android, or make Shorts on a computer.");
  }
}

export function scaleShortCanvas(ctx: CanvasRenderingContext2D, profile: ShortRenderProfile) {
  const sx = profile.width / SHORT_LOGICAL_W;
  const sy = profile.height / SHORT_LOGICAL_H;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
}

export async function unlockAudioContext(actx: AudioContext) {
  if (actx.state === "suspended") {
    await actx.resume().catch(() => {});
  }
  // Extra resume after a microtask helps some mobile browsers after long awaits.
  await new Promise((r) => setTimeout(r, 0));
  if (actx.state === "suspended") {
    await actx.resume().catch(() => {});
  }
}

export function blobExtForMime(mime: string | undefined) {
  if (mime?.includes("mp4")) return "mp4";
  return "webm";
}

export type ShortRecorder = {
  mime: string | undefined;
  blobType: string;
  profile: ShortRenderProfile;
  start: () => void;
  stop: () => Promise<Blob>;
};

/** Canvas + audio → MediaRecorder with mobile-safe settings. */
export function createShortRecorder(
  canvas: HTMLCanvasElement,
  audioDest: MediaStreamAudioDestinationNode,
  profile: ShortRenderProfile,
): ShortRecorder {
  assertCanRecordShort();
  const mime = pickRecorderMime();
  const videoTracks = canvas.captureStream(profile.fps).getVideoTracks();
  if (!videoTracks.length) {
    throw new Error("Video capture failed on this device. Try Chrome on Android, or use a computer.");
  }
  const stream = new MediaStream([...videoTracks, ...audioDest.stream.getAudioTracks()]);
  const opts: MediaRecorderOptions = { videoBitsPerSecond: profile.videoBitsPerSecond };
  if (mime) opts.mimeType = mime;

  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, opts);
  } catch {
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      throw new Error("Could not start video recording on this phone. Use Chrome on Android, or desktop Chrome / Edge.");
    }
  }

  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const blobType = (mime?.split(";")[0] || rec.mimeType || "video/webm").split(";")[0];

  return {
    mime,
    blobType,
    profile,
    start: () => {
      try {
        rec.start(profile.timesliceMs);
      } catch {
        rec.start();
      }
    },
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        rec.onerror = () => reject(new Error("Recording failed on this device."));
        rec.onstop = () => {
          for (const t of stream.getTracks()) t.stop();
          if (!chunks.length) {
            reject(new Error("Recording produced an empty file. Try Chrome on Android, or make Shorts on a computer."));
            return;
          }
          resolve(new Blob(chunks, { type: blobType }));
        };
        try {
          rec.stop();
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Could not finish recording."));
        }
      }),
  };
}

export async function withScreenWakeLock<T>(fn: () => Promise<T>): Promise<T> {
  let lock: WakeLockSentinel | null = null;
  try {
    lock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    /* unsupported / denied */
  }
  try {
    return await fn();
  } finally {
    await lock?.release().catch(() => {});
  }
}
