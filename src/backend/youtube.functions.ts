import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const getYoutubeAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ origin: z.string().url(), slot: z.number().int().min(1).max(7).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { oauthConfig, YT_SCOPES } = await import("./youtube.server");
    const slot = data.slot ?? 1;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clientId } = oauthConfig(slot);
    const origin = new URL(data.origin).origin;
    const redirectUri = `${origin}/api/public/youtube/callback`;
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    // Clean old states, then store this one.
    await supabaseAdmin.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
    await supabaseAdmin.from("oauth_states").insert({ state, user_id: context.userId, redirect_uri: redirectUri, slot });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: YT_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirectUri };
  });

export const disconnectYoutube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decrypt } = await import("./youtube.server");
    const { data: row } = await supabaseAdmin.from("youtube_tokens").select("encrypted_refresh_token").eq("user_id", context.userId).maybeSingle();
    if (row) {
      try {
        const token = await decrypt(row.encrypted_refresh_token);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
      } catch {
        /* best effort */
      }
    }
    await supabaseAdmin.from("youtube_tokens").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("youtube_slot_tokens").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("youtube_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

/** Per-project upload quota for today, so the Shorts panel can show how many uploads are left. */
export const getUploadPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { uploadPool } = await import("./youtube.server");
    return { slots: await uploadPool(context.userId) };
  });

type LiveBroadcast = { id: string; status?: { lifeCycleStatus?: string; privacyStatus?: string }; snippet?: { title?: string } };
type LiveStream = {
  id: string;
  cdn?: { ingestionInfo?: { ingestionAddress?: string; streamName?: string; backupIngestionAddress?: string } };
  status?: { streamStatus?: string; healthStatus?: { status?: string } };
};

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        interviewId: uuid.nullable(),
        title: z.string().min(1).max(100),
        description: z.string().max(4500),
        privacy: z.enum(["public", "unlisted", "private"]),
        approvePublic: z.boolean(),
        thumbnailDataUri: z.string().max(3_000_000).nullable().optional(),
        tags: z.array(z.string().max(60)).max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.privacy === "public" && !data.approvePublic) {
      throw new Error("Public broadcasts need your explicit approval. Tick the approval box first.");
    }
    const { yt, getAccessToken } = await import("./youtube.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const broadcast = await yt<LiveBroadcast>(userId, "/liveBroadcasts?part=snippet,status,contentDetails", {
      method: "POST",
      body: JSON.stringify({
        snippet: { title: data.title, description: data.description, scheduledStartTime: new Date(Date.now() + 60_000).toISOString() },
        status: { privacyStatus: data.privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
        contentDetails: { enableAutoStart: false, enableAutoStop: false, monitorStream: { enableMonitorStream: false } },
      }),
    });
    const stream = await yt<LiveStream>(userId, "/liveStreams?part=snippet,cdn,status,contentDetails", {
      method: "POST",
      body: JSON.stringify({
        snippet: { title: `${data.title} — stream` },
        cdn: { ingestionType: "rtmp", resolution: "1080p", frameRate: "30fps" },
        contentDetails: { isReusable: false },
      }),
    });
    await yt(userId, `/liveBroadcasts/bind?id=${broadcast.id}&part=id,contentDetails&streamId=${stream.id}`, { method: "POST" });

    // Live broadcasts don't accept tags directly; set them on the underlying video (best effort).
    let warning: string | null = null;
    if (data.tags?.length) {
      const { cleanTags } = await import("@/lib/promo-rules");
      try {
        await yt(userId, "/videos?part=snippet", {
          method: "PUT",
          body: JSON.stringify({ id: broadcast.id, snippet: { title: data.title, description: data.description, tags: cleanTags(data.tags), categoryId: "28" } }),
        });
      } catch {
        warning = "Tags couldn't be saved on YouTube. You can add them in YouTube Studio.";
      }
    }

    if (data.thumbnailDataUri) {
      const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(data.thumbnailDataUri);
      if (m && m[1] && m[2]) {
        const mime = m[1];
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        const token = await getAccessToken(userId);
        const tr = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${broadcast.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
          body: bytes,
        });
        if (!tr.ok) {
          warning = tr.status === 403
            ? "Thumbnail not uploaded: your channel needs to be verified in YouTube Studio to use custom thumbnails."
            : "Thumbnail couldn't be uploaded to YouTube.";
        }
      }
    }

    const watchUrl = `https://www.youtube.com/watch?v=${broadcast.id}`;
    const { data: row, error } = await supabaseAdmin
      .from("broadcast_sessions")
      .insert({
        user_id: userId,
        interview_id: data.interviewId,
        youtube_broadcast_id: broadcast.id,
        youtube_stream_id: stream.id,
        title: data.title,
        description: data.description,
        privacy: data.privacy,
        status: broadcast.status?.lifeCycleStatus ?? "created",
        stream_status: stream.status?.streamStatus ?? null,
        watch_url: watchUrl,
        ingestion_address: stream.cdn?.ingestionInfo?.ingestionAddress ?? null,
        approved_public: data.privacy === "public" ? data.approvePublic : false,
        approved_at: data.privacy === "public" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw new Error("Broadcast created on YouTube but could not be saved here.");
    if (data.interviewId) {
      await supabaseAdmin.from("interviews").update({ youtube_broadcast_url: watchUrl }).eq("id", data.interviewId).eq("user_id", userId);
    }
    return { ...row, warning };
  });

/** Reveals the stream key on explicit request only, for pasting into OBS. Never stored by this app. */
export const revealStreamKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ broadcastSessionId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bs } = await context.supabase.from("broadcast_sessions").select("*").eq("id", data.broadcastSessionId).single();
    if (!bs?.youtube_stream_id) throw new Error("Broadcast not found");
    const { yt } = await import("./youtube.server");
    const res = await yt<{ items: LiveStream[] }>(context.userId, `/liveStreams?part=cdn&id=${bs.youtube_stream_id}`);
    const info = res.items?.[0]?.cdn?.ingestionInfo;
    if (!info?.streamName) throw new Error("YouTube did not return a stream key.");
    return { server: info.ingestionAddress ?? "", streamKey: info.streamName };
  });

export const refreshBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ broadcastSessionId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bs } = await context.supabase.from("broadcast_sessions").select("*").eq("id", data.broadcastSessionId).single();
    if (!bs?.youtube_broadcast_id) throw new Error("Broadcast not found");
    const { yt } = await import("./youtube.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [b, s] = await Promise.all([
      yt<{ items: LiveBroadcast[] }>(context.userId, `/liveBroadcasts?part=status&id=${bs.youtube_broadcast_id}`),
      bs.youtube_stream_id
        ? yt<{ items: LiveStream[] }>(context.userId, `/liveStreams?part=status&id=${bs.youtube_stream_id}`)
        : Promise.resolve({ items: [] as LiveStream[] }),
    ]);
    const status = b.items?.[0]?.status?.lifeCycleStatus ?? "unknown";
    const streamStatus = s.items?.[0]?.status?.streamStatus ?? null;
    const health = s.items?.[0]?.status?.healthStatus?.status ?? null;
    await supabaseAdmin
      .from("broadcast_sessions")
      .update({ status, stream_status: health ? `${streamStatus} (${health})` : streamStatus })
      .eq("id", bs.id);
    return { status, streamStatus, health };
  });

export const transitionBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ broadcastSessionId: uuid, to: z.enum(["live", "complete"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bs } = await context.supabase.from("broadcast_sessions").select("*").eq("id", data.broadcastSessionId).single();
    if (!bs?.youtube_broadcast_id) throw new Error("Broadcast not found");
    if (data.to === "live" && bs.privacy === "public" && !bs.approved_public) {
      throw new Error("This public broadcast hasn't been approved.");
    }
    const { yt } = await import("./youtube.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await yt(context.userId, `/liveBroadcasts/transition?broadcastStatus=${data.to}&id=${bs.youtube_broadcast_id}&part=status`, { method: "POST" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hint = data.to === "live" && /invalidTransition|stream/i.test(msg) ? " Make sure OBS is streaming and YouTube shows the stream as active, then try again." : "";
      await supabaseAdmin.from("broadcast_sessions").update({ error: msg.slice(0, 500) }).eq("id", bs.id);
      throw new Error(msg + hint);
    }
    await supabaseAdmin
      .from("broadcast_sessions")
      .update(
        data.to === "live"
          ? { status: "live", started_at: new Date().toISOString(), error: null }
          : { status: "complete", ended_at: new Date().toISOString(), error: null },
      )
      .eq("id", bs.id);
    return { ok: true };
  });
