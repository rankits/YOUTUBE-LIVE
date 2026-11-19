import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KEY_FIELDS, normalizePrefs } from "@/lib/provider-rules";

function appDefaults() {
  return {
    groq: Boolean(process.env["GROQ_API_KEY"]),
    gemini: Boolean(process.env["GEMINI_API_KEY"]),
    deepgram: Boolean(process.env["UDC_DEEPGRAM_API_KEY"] && process.env["LOVABLE_API_KEY"]),
    sarvam: Boolean(process.env["SARVAM_API_KEY"]),
    googleCloud: Boolean(process.env["GOOGLE_CLOUD_TTS_KEY"]),
    elevenlabs: Boolean(process.env["ELEVENLABS_API_KEY"]),
  };
}

/** Which keys are saved (never the values) + routing prefs. */
export const getApiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("user_api_keys").select("encrypted, prefs").eq("user_id", context.userId).maybeSingle();
    const enc = (data?.encrypted ?? {}) as Record<string, unknown>;
    const saved = Object.fromEntries(KEY_FIELDS.map((f) => [f, typeof enc[f] === "string" && Boolean(enc[f])])) as Record<(typeof KEY_FIELDS)[number], boolean>;
    return { saved, appDefaults: appDefaults(), prefs: normalizePrefs(data?.prefs) };
  });

const keyValue = z.string().trim().max(400).nullable().optional();

export const saveApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        keys: z.object(Object.fromEntries(KEY_FIELDS.map((f) => [f, keyValue])) as Record<(typeof KEY_FIELDS)[number], typeof keyValue>),
        prefs: z.object({
          chatPrimary: z.enum(["auto", "groq", "gemini", "lovable"]),
          voiceEnglish: z.enum(["agent", "edge", "deepgram", "sarvam", "gemini", "google_cloud", "elevenlabs", "lovable"]),
          voiceIndian: z.enum(["agent", "edge", "deepgram", "sarvam", "gemini", "google_cloud", "elevenlabs", "lovable"]),
          fallback: z.boolean(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encrypt } = await import("./youtube.server");
    const { data: row } = await supabaseAdmin.from("user_api_keys").select("encrypted").eq("user_id", context.userId).maybeSingle();
    const enc = { ...((row?.encrypted ?? {}) as Record<string, string>) };
    for (const f of KEY_FIELDS) {
      const v = data.keys[f];
      if (v === null) delete enc[f]; // remove
      else if (v) enc[f] = await encrypt(v); // empty/undefined = keep
    }
    const { error } = await supabaseAdmin
      .from("user_api_keys")
      .upsert({ user_id: context.userId, encrypted: enc, prefs: data.prefs, updated_at: new Date().toISOString() });
    if (error) throw new Error("Could not save your keys.");
    return { ok: true };
  });
