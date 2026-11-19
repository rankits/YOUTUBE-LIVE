import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 8 * 1024 * 1024;

// Signed-in users only: sets the custom thumbnail of a video on the caller's own connected channel.
export const Route = createFileRoute("/api/youtube/short-thumbnail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const url = process.env["SUPABASE_URL"];
        const anon = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!token || !url || !anon) return Response.json({ error: "Sign in first." }, { status: 401 });
        const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return Response.json({ error: "Sign in first." }, { status: 401 });

        const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
        if (!/^[\w-]{6,20}$/.test(videoId)) return Response.json({ error: "Bad video id." }, { status: 400 });
        const type = request.headers.get("content-type") || "image/jpeg";
        if (!/^image\/(jpeg|png)$/.test(type)) return Response.json({ error: "JPEG or PNG only." }, { status: 400 });
        const bytes = await request.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return Response.json({ error: "Image size not allowed." }, { status: 400 });

        try {
          const { getAccessToken } = await import("@/backend/youtube.server");
          const slot = Math.min(7, Math.max(1, Number(new URL(request.url).searchParams.get("slot")) || 1));
          const access = await getAccessToken(u.user.id, slot);
          const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access}`, "Content-Type": type },
            body: bytes,
          });
          if (!res.ok) {
            const t = await res.text();
            let msg = t.slice(0, 300);
            try {
              msg = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? msg;
            } catch {
              /* raw */
            }
            return Response.json({ error: msg, status: res.status }, { status: 502 });
          }
          return Response.json({ ok: true });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "Thumbnail failed" }, { status: 500 });
        }
      },
    },
  },
});
