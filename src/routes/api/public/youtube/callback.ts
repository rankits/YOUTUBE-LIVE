import { createFileRoute } from "@tanstack/react-router";

// Google redirects here after the user approves YouTube access.
// Caller is verified via the one-time `state` row created for the signed-in user.
export const Route = createFileRoute("/api/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (q: string) => Response.redirect(`${url.origin}/youtube?${q}`, 302);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        if (oauthError) return back(`yt_error=${encodeURIComponent(oauthError)}`);
        if (!code || !state) return back("yt_error=missing_code");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encrypt, oauthConfig } = await import("@/backend/youtube.server");

        const { data: st } = await supabaseAdmin.from("oauth_states").select("*").eq("state", state).maybeSingle();
        if (!st) return back("yt_error=invalid_state");
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);
        if (Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back("yt_error=expired_state");

        let cfg;
        try {
          cfg = oauthConfig(st.slot ?? 1);
        } catch {
          return back("yt_error=not_configured");
        }
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uri: st.redirect_uri,
            grant_type: "authorization_code",
          }),
        });
        const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
        if (!tokenRes.ok || !tokens.access_token) {
          console.error("YouTube token exchange failed", tokenRes.status, tokens.error);
          return back(`yt_error=${encodeURIComponent(tokens.error ?? "token_exchange_failed")}`);
        }
        if (!tokens.refresh_token) return back("yt_error=no_refresh_token");

        const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const ch = (await chRes.json()) as { items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }[] };
        const channel = ch.items?.[0];
        if (!channel) return back("yt_error=no_channel");

        const slot = st.slot ?? 1;
        if (slot !== 1) {
          // Extra Google projects only add upload quota for the channel already connected via project 1.
          const { data: conn } = await supabaseAdmin.from("youtube_connections").select("channel_id").eq("user_id", st.user_id).maybeSingle();
          if (!conn) return back("yt_error=connect_project_1_first");
          if (conn.channel_id !== channel.id) return back("yt_error=different_channel");
          await supabaseAdmin.from("youtube_slot_tokens").upsert({
            user_id: st.user_id,
            slot,
            encrypted_refresh_token: await encrypt(tokens.refresh_token),
            encrypted_access_token: await encrypt(tokens.access_token),
            access_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          });
          return back(`yt_slot_connected=${slot}`);
        }
        await supabaseAdmin.from("youtube_tokens").upsert({
          user_id: st.user_id,
          encrypted_refresh_token: await encrypt(tokens.refresh_token),
          encrypted_access_token: await encrypt(tokens.access_token),
          access_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        });
        await supabaseAdmin.from("youtube_connections").upsert(
          {
            user_id: st.user_id,
            channel_id: channel.id,
            channel_title: channel.snippet?.title ?? null,
            channel_thumbnail: channel.snippet?.thumbnails?.default?.url ?? null,
            status: "connected",
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        return back("yt_connected=1");
      },
    },
  },
});
