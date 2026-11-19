// Server-only: per-user API keys (AES-GCM encrypted, service-role table) + routing prefs.
import { KEY_FIELDS, normalizePrefs, type KeyField, type ProviderPrefs } from "@/lib/provider-rules";

export type ResolvedKeys = {
  /** Keys the user saved themselves. */
  own: Partial<Record<KeyField, string>>;
  prefs: ProviderPrefs;
};

export async function loadUserKeys(userId: string): Promise<ResolvedKeys> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decrypt } = await import("./youtube.server");
  const { data } = await supabaseAdmin.from("user_api_keys").select("encrypted, prefs").eq("user_id", userId).maybeSingle();
  const own: Partial<Record<KeyField, string>> = {};
  const enc = (data?.encrypted ?? {}) as Record<string, unknown>;
  for (const f of KEY_FIELDS) {
    const v = enc[f];
    if (typeof v === "string" && v) {
      try {
        own[f] = await decrypt(v);
      } catch (e) {
        console.error(`could not decrypt ${f} key`, e);
      }
    }
  }
  return { own, prefs: normalizePrefs(data?.prefs) };
}
