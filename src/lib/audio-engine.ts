// Browser-only audio queue: plays one clip at a time, exposes a live level for
// waveforms/avatars, and can record everything it plays into a single file.
// Construct only in effects or event handlers.

export class AudioEngine {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private gain: GainNode;
  private recordDest: MediaStreamAudioDestinationNode;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private current: HTMLAudioElement | null = null;
  private data: Uint8Array<ArrayBuffer>;
  volume = 1;
  muted = false;

  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.gain = this.ctx.createGain();
    this.recordDest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.analyser.connect(this.recordDest);
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    this.gain.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.gain.gain.value = m ? 0 : this.volume;
  }

  /** 0..1 RMS-ish level of what's currently playing. */
  level() {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = ((this.data[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 4);
  }

  /** Plays a clip to completion. Calls onProgress with (currentTime, duration). */
  async play(url: string, opts: {
      rate?: number;
      onProgress?: (t: number, d: number) => void;
      signal?: AbortSignal;
      /** Pause once at this fraction of the clip for pauseMs (MCQ answer countdown). */
      pauseAt?: number;
      pauseMs?: number;
      onPause?: (paused: boolean) => void;
    } = {},
  ) {
    await this.resume();
    // Retry the download: a single network blip must not make the show go silent.
    let res: Response | null = null;
    for (let i = 0; i < 3 && !res; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) res = r;
      } catch {
        /* retry */
      }
      if (!res) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
    if (!res) throw new Error("Could not load the audio clip");
    const blobUrl = URL.createObjectURL(await res.blob());
    const el = new Audio(blobUrl);
    el.preservesPitch = true;
    el.playbackRate = opts.rate ?? 1;
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.analyser);
    this.current = el;
    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          el.pause();
          resolve();
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        let pausedOnce = false;
        el.ontimeupdate = () => {
          const d = el.duration || 0;
          opts.onProgress?.(el.currentTime, d);
          if (!pausedOnce && opts.pauseAt != null && d && el.currentTime / d >= opts.pauseAt) {
            pausedOnce = true;
            el.pause();
            opts.onPause?.(true);
            setTimeout(() => {
              opts.onPause?.(false);
              if (!opts.signal?.aborted) el.play().catch(reject);
            }, opts.pauseMs ?? 2000);
          }
        };
        el.onended = () => resolve();
        el.onerror = () => reject(new Error("Audio playback failed"));
        el.play().catch(reject);
      });
    } finally {
      src.disconnect();
      URL.revokeObjectURL(blobUrl);
      this.current = null;
    }
  }

  stop() {
    this.current?.pause();
  }

  startRecording() {
    if (this.recorder || typeof MediaRecorder === "undefined") return false;
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    this.chunks = [];
    this.recorder = new MediaRecorder(this.recordDest.stream, type ? { mimeType: type } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(1000);
    return true;
  }

  async stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return null;
    this.recorder = null;
    if (rec.state === "inactive") return null;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    if (!this.chunks.length) return null;
    return new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
  }

  isRecording() {
    return Boolean(this.recorder);
  }

  async close() {
    this.stop();
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
