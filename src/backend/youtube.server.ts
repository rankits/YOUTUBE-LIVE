// Server-only YouTube helpers: token encryption, refresh, API calls.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function key() {
  const secret = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Token encryption key is missing on the server.");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function b64(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function unb64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(token: string) {
  const [iv, ct] = token.split(".");
  if (!iv || !ct) throw new Error("Corrupt token");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return dec.decode(pt);
}

export const MAX_SLOTS = 7;

/** OAuth client for a Google Cloud project slot. Slot 1 = GOOGLE_OAUTH_CLIENT_ID, slot n = GOOGLE_OAUTH_CLIENT_ID_n. */
export function oauthConfig(slot = 1) {
  const sfx = slot === 1 ? "" : `_${slot}`;
  const clientId = process.env[`GOOGLE_OAUTH_CLIENT_ID${sfx}`];
  const clientSecret = process.env[`GOOGLE_OAUTH_CLIENT_SECRET${sfx}`];
  if (!clientId || !clientSecret) {
    throw new Error(slot === 1 ? "YouTube is not set up yet: add your Google OAuth Client ID and Secret on the YouTube Live page." : `Project ${slot} Client ID / Secret is not saved yet.`);
  }
  return { clientId, clientSecret };
}

export function configuredSlots(): number[] {
  const out: number[] = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    try { oauthConfig(i); out.push(i); } catch { /* not set */ }
  }
  return out;
}

export const YT_SCOPES = ["https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.readonly"];

async function refreshWith(slot: number, refreshToken: string) {
  const { clientId, clientSecret } = oauthConfig(slot);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  return { ok: res.ok, status: res.status, body: (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } };
}

export async function getAccessToken(userId: string, slot = 1): Promise<string> {
  if (slot !== 1) return getSlotAccessToken(userId, slot);
  const { data: row } = await supabaseAdmin.from("youtube_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!row) throw new Error("Connect your YouTube channel first.");
  if (row.encrypted_access_token && row.access_expires_at && new Date(row.access_expires_at).getTime() - Date.now() > 60_000) {
    return decrypt(row.encrypted_access_token);
  }
  const { ok, status, body } = await refreshWith(1, await decrypt(row.encrypted_refresh_token));
  if (!ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      await supabaseAdmin.from("youtube_connections").update({ status: "expired" }).eq("user_id", userId);
      throw new Error("YouTube access expired or was revoked. Reconnect your channel.");
    }
    throw new Error(`YouTube token refresh failed: ${body.error_description ?? body.error ?? status}`);
  }
  await supabaseAdmin
    .from("youtube_tokens")
    .update({
      encrypted_access_token: await encrypt(body.access_token),
      access_expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return body.access_token;
}

async function getSlotAccessToken(userId: string, slot: number): Promise<string> {
  const { data: row } = await supabaseAdmin.from("youtube_slot_tokens").select("*").eq("user_id", userId).eq("slot", slot).maybeSingle();
  if (!row) throw new Error(`No channel is connected for project ${slot}.`);
  if (row.encrypted_access_token && row.access_expires_at && new Date(row.access_expires_at).getTime() - Date.now() > 60_000) {
    return decrypt(row.encrypted_access_token);
  }
  const { ok, status, body } = await refreshWith(slot, await decrypt(row.encrypted_refresh_token));
  if (!ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      await supabaseAdmin.from("youtube_slot_tokens").delete().eq("user_id", userId).eq("slot", slot);
      throw new Error(`Project ${slot} login expired — please reconnect.`);
    }
    throw new Error(`Project ${slot} token refresh failed: ${body.error_description ?? body.error ?? status}`);
  }
  await supabaseAdmin
    .from("youtube_slot_tokens")
    .update({ encrypted_access_token: await encrypt(body.access_token), access_expires_at: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("slot", slot);
  return body.access_token;
}

/** Today's per-project upload usage for this user (quota day = Pacific date). */
export async function uploadPool(userId: string) {
  const { quotaDay } = await import("@/lib/shorts-rules");
  const day = quotaDay();
  const configured = configuredSlots();
  const [{ data: main }, { data: extra }, { data: usage }] = await Promise.all([
    supabaseAdmin.from("youtube_tokens").select("user_id").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("youtube_slot_tokens").select("slot").eq("user_id", userId),
    supabaseAdmin.from("youtube_upload_usage").select("slot, uploads, exhausted").eq("user_id", userId).eq("day", day),
  ]);
  const connected = new Set<number>([...(main ? [1] : []), ...(extra ?? []).map((r) => r.slot)]);
  const slots = new Set<number>([...configured, ...connected]);
  return [...slots].sort((a, b) => a - b).map((slot) => {
    const u = usage?.find((r) => r.slot === slot);
    return { slot, configured: configured.includes(slot), connected: connected.has(slot), uploads: u?.uploads ?? 0, exhausted: u?.exhausted ?? false };
  });
}

export async function recordSlotUse(userId: string, slot: number, change: { upload?: boolean; exhausted?: boolean }) {
  const { quotaDay } = await import("@/lib/shorts-rules");
  const day = quotaDay();
  const { data: cur } = await supabaseAdmin.from("youtube_upload_usage").select("uploads, exhausted").eq("user_id", userId).eq("slot", slot).eq("day", day).maybeSingle();
  await supabaseAdmin.from("youtube_upload_usage").upsert({
    user_id: userId,
    slot,
    day,
    uploads: (cur?.uploads ?? 0) + (change.upload ? 1 : 0),
    exhausted: (cur?.exhausted ?? false) || !!change.exhausted,
    updated_at: new Date().toISOString(),
  });
}

export async function yt<T = unknown>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(userId);
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 400);
    try {
      const j = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } };
      const reason = j.error?.errors?.[0]?.reason;
      msg = j.error?.message ?? msg;
      if (reason === "liveStreamingNotEnabled") {
        msg = "Live streaming is not enabled on this YouTube channel. Enable it in YouTube Studio (it can take up to 24 hours).";
      }
    } catch {
      /* keep raw */
    }
    throw new Error(`YouTube API error [${res.status}]: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Ends every YouTube broadcast linked to this interview that is currently live. Best effort; returns how many ended. */
export async function endLinkedBroadcasts(userId: string, interviewId: string): Promise<{ ended: number; error: string | null }> {
  const { canEndYoutubeBroadcast } = await import("@/lib/engine-rules");
  const { data: sessions } = await supabaseAdmin
    .from("broadcast_sessions")
    .select("id, youtube_broadcast_id, status")
    .eq("user_id", userId)
    .eq("interview_id", interviewId)
    .neq("status", "complete");
  let ended = 0;
  let error: string | null = null;
  for (const bs of sessions ?? []) {
    if (!bs.youtube_broadcast_id) continue;
    try {
      const b = await yt<{ items?: { status?: { lifeCycleStatus?: string } }[] }>(userId, `/liveBroadcasts?part=status&id=${bs.youtube_broadcast_id}`);
      const life = b.items?.[0]?.status?.lifeCycleStatus;
      if (!canEndYoutubeBroadcast(life)) continue;
      await yt(userId, `/liveBroadcasts/transition?broadcastStatus=complete&id=${bs.youtube_broadcast_id}&part=status`, { method: "POST" });
      await supabaseAdmin.from("broadcast_sessions").update({ status: "complete", ended_at: new Date().toISOString(), error: null }).eq("id", bs.id);
      ended++;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("broadcast_sessions").update({ error: error.slice(0, 500) }).eq("id", bs.id);
    }
  }
  return { ended, error };
}
