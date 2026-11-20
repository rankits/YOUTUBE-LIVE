import { supabase } from "@/integrations/supabase/client";

export type UploadShortResult = {
  id: string;
  url: string;
  slot: number;
};

/**
 * Bypass Vercel’s ~4.5MB request body limit:
 * 1) stage the video in Supabase Storage
 * 2) tell our API the path (tiny JSON)
 * 3) server pulls the file and uploads to YouTube
 */
export async function uploadShortVideo(opts: {
  token: string;
  blob: Blob;
  searchParams: URLSearchParams;
  signal?: AbortSignal;
}): Promise<UploadShortResult> {
  if (!opts.token.trim()) throw new Error("Sign-in required — please sign in again.");
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Sign in first.");

  const ext = (opts.blob.type || "").includes("mp4") ? "mp4" : "webm";
  const path = `${userData.user.id}/shorts-upload/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = opts.blob.type || (ext === "mp4" ? "video/mp4" : "video/webm");

  const { error: upErr } = await supabase.storage.from("recordings").upload(path, opts.blob, {
    contentType,
    upsert: false,
  });
  if (upErr) throw new Error(`Could not stage video for upload: ${upErr.message}`);

  try {
    const res = await fetch(`/api/youtube/upload-short?${opts.searchParams}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, contentType, bucket: "recordings" }),
      signal: opts.signal ?? AbortSignal.timeout(180_000),
    });
    const j = (await res.json().catch(() => ({}))) as {
      id?: string;
      url?: string;
      slot?: number;
      error?: string;
    };
    if (!res.ok || !j.id || !j.url) {
      throw new Error(j.error ?? `Upload failed [${res.status}]`);
    }
    return { id: j.id, url: j.url, slot: j.slot ?? 1 };
  } finally {
    void supabase.storage.from("recordings").remove([path]).catch(() => {});
  }
}
