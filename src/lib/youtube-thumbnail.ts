/** Upload a custom YouTube Shorts thumbnail with retries (API often needs a short delay after upload). */
export async function uploadShortThumbnail(opts: {
  videoId: string;
  blob: Blob;
  token: string;
  slot?: number;
  attempts?: number;
}): Promise<void> {
  const attempts = opts.attempts ?? 3;
  const slot = opts.slot ?? 1;
  let lastErr = "Thumbnail failed";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
    const res = await fetch(
      `/api/youtube/short-thumbnail?videoId=${encodeURIComponent(opts.videoId)}&slot=${slot}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": opts.blob.type || "image/jpeg",
        },
        body: opts.blob,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (res.ok) return;
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    lastErr = j.error || `Thumbnail HTTP ${res.status}`;
  }
  throw new Error(lastErr);
}
