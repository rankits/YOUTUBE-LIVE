import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 90 * 1024 * 1024;

// Signed-in users only: uploads a rendered Short to the caller's own connected channel.
export const Route = createFileRoute("/api/youtube/upload-short")({
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

        const q = new URL(request.url).searchParams;
        const { ensureShortsTitle } = await import("@/lib/shorts-rules");
        const title = ensureShortsTitle(q.get("title") ?? "Quiz");
        const description = (q.get("description") ?? "").slice(0, 5000);
        const privacy = ["public", "unlisted", "private"].includes(q.get("privacy") ?? "") ? q.get("privacy")! : "public";
        const publishAtRaw = q.get("publishAt");
        const publishAt = publishAtRaw && !Number.isNaN(Date.parse(publishAtRaw)) && Date.parse(publishAtRaw) > Date.now() + 60_000 ? new Date(publishAtRaw).toISOString() : null;
        const { cleanTags } = await import("@/lib/promo-rules");
        const tags = cleanTags((q.get("tags") ?? "").split(","));
        const type = request.headers.get("content-type") || "video/webm";
        const bytes = await request.arrayBuffer();
        if (!bytes.byteLength) return Response.json({ error: "Empty video." }, { status: 400 });
        if (bytes.byteLength > MAX_BYTES) return Response.json({ error: "Video is too large." }, { status: 413 });

        const { getAccessToken, uploadPool, recordSlotUse } = await import("@/backend/youtube.server");
        const { usableSlots, isProjectQuotaError } = await import("@/lib/shorts-rules");
        const slots = usableSlots(await uploadPool(u.user.id));
        if (!slots.length) return Response.json({ error: "Today's upload quota is used up on all Google projects (quotaExceeded). Try again tomorrow." }, { status: 429 });

        let lastErr = "Upload failed";
        for (const slot of slots) {
          try {
            const access = await getAccessToken(u.user.id, slot);
            const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${access}`,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": type,
                "X-Upload-Content-Length": String(bytes.byteLength),
              },
              body: JSON.stringify({
                snippet: { title, description, tags, categoryId: "27" },
                // containsSyntheticMedia stays false: quiz/news graphics are not realistic altered media, so no "AI content" label.
                status: publishAt
                  ? { privacyStatus: "private", publishAt, selfDeclaredMadeForKids: false, containsSyntheticMedia: false }
                  : { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
              }),
            });
            const loc = init.headers.get("location");
            if (!init.ok || !loc) {
              const t = await init.text();
              let msg = t.slice(0, 300);
              try {
                const j = JSON.parse(t) as { error?: { message?: string; errors?: { reason?: string }[] } };
                msg = `${j.error?.errors?.[0]?.reason ?? ""} ${j.error?.message ?? msg}`.trim();
              } catch {
                /* raw */
              }
              lastErr = `Project ${slot}: YouTube refused the upload [${init.status}]: ${msg}`;
              if (isProjectQuotaError(msg)) { await recordSlotUse(u.user.id, slot, { exhausted: true }); continue; }
              return Response.json({ error: lastErr }, { status: 502 });
            }
            const put = await fetch(loc, { method: "PUT", headers: { "Content-Type": type }, body: bytes });
            const body = (await put.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
            if (!put.ok || !body.id) return Response.json({ error: `Upload failed [${put.status}]: ${body.error?.message ?? "unknown"}` }, { status: 502 });
            await recordSlotUse(u.user.id, slot, { upload: true });
            return Response.json({ id: body.id, url: `https://youtube.com/shorts/${body.id}`, slot });
          } catch (e) {
            lastErr = e instanceof Error ? e.message : "Upload failed";
            if (slots.length === 1) break;
          }
        }
        return Response.json({ error: lastErr }, { status: 502 });
      },
    },
  },
});
