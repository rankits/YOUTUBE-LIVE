import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public: used by the OBS Browser Source, which has no login session.
// Access is granted only by the unguessable per-interview broadcast token.
export const getBroadcastState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().uuid(), afterTurn: z.number().int().min(-1).max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: iv } = await supabaseAdmin
      .from("interviews")
      .select("id, user_id, title, topic, custom_topic, format, status, turn_count, max_questions, duration_minutes, started_at, visuals, interviewer_agent_id, candidate_agent_id, key_points")
      .eq("broadcast_token", data.token)
      .maybeSingle();
    if (!iv) return { found: false as const };

    const [{ data: agents }, { data: msgs }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from("ai_agents")
        .select("id, name, personality, preset_avatar, avatar_path, role, accent_color")
        .in("id", [iv.interviewer_agent_id, iv.candidate_agent_id].filter(Boolean) as string[]),
      supabaseAdmin
        .from("interview_messages")
        .select("id, turn_index, speaker, content, key_point, visual, topic, audio_path, audio_duration_ms")
        .eq("interview_id", iv.id)
        .gt("turn_index", data.afterTurn)
        .order("turn_index")
        .limit(20),
      supabaseAdmin.from("integration_settings").select("branding_text, show_branding").eq("user_id", iv.user_id).maybeSingle(),
    ]);

    const withAvatars = await Promise.all(
      (agents ?? []).map(async (a) => {
        let avatarUrl: string | null = null;
        if (a.avatar_path) {
          const { data: s } = await supabaseAdmin.storage.from("agent-avatars").createSignedUrl(a.avatar_path, 3600);
          avatarUrl = s?.signedUrl ?? null;
        }
        return { ...a, avatar_path: undefined, avatarUrl };
      }),
    );
    const messages = await Promise.all(
      (msgs ?? []).map(async (m) => {
        let audioUrl: string | null = null;
        if (m.audio_path) {
          const { data: s } = await supabaseAdmin.storage.from("interview-audio").createSignedUrl(m.audio_path, 3600);
          audioUrl = s?.signedUrl ?? null;
        }
        return { ...m, audio_path: undefined, audioUrl };
      }),
    );
    const { user_id: _u, ...publicIv } = iv;
    return {
      found: true as const,
      interview: publicIv,
      agents: withAvatars,
      messages,
      branding: settings?.show_branding ? settings.branding_text : null,
    };
  });
