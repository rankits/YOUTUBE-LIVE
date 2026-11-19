import { supabase } from "@/integrations/supabase/client";

/** Sign-in token for upload/image calls, refreshed when it expires within 2 minutes (tokens last ~1 hour). */
export async function freshToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session || (session.expires_at ?? 0) * 1000 - Date.now() < 120_000) {
    const r = await supabase.auth.refreshSession();
    session = r.data.session ?? session;
  }
  return session?.access_token ?? "";
}
