import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Agent = Database["public"]["Tables"]["ai_agents"]["Row"];
export type Interview = Database["public"]["Tables"]["interviews"]["Row"];
export type Message = Database["public"]["Tables"]["interview_messages"]["Row"];
export type Broadcast = Database["public"]["Tables"]["broadcast_sessions"]["Row"];
export type Scheduled = Database["public"]["Tables"]["scheduled_interviews"]["Row"];
export type Recording = Database["public"]["Tables"]["recordings"]["Row"];
export type Usage = Database["public"]["Tables"]["usage_analytics"]["Row"];

function isMissingRelation(message: string) {
  return /schema cache|does not exist|Could not find the table/i.test(message);
}

function must<T>(res: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data == null) throw new Error("Not found");
  return res.data as NonNullable<T>;
}

/** List queries: empty array if the table isn't created yet (fresh Supabase project). */
function mustList<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) {
    if (isMissingRelation(res.error.message)) return [];
    throw new Error(res.error.message);
  }
  return res.data ?? [];
}

async function withAvatarUrls(agents: Agent[]) {
  const paths = agents.map((a) => a.avatar_path).filter(Boolean) as string[];
  const map = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("agent-avatars").createSignedUrls(paths, 3600);
    data?.forEach((d) => d.path && d.signedUrl && map.set(d.path, d.signedUrl));
  }
  return agents.map((a) => ({ ...a, avatarUrl: a.avatar_path ? (map.get(a.avatar_path) ?? null) : null }));
}
export type AgentWithAvatar = Agent & { avatarUrl: string | null };

export const agentsQuery = () =>
  queryOptions({
    queryKey: ["agents"],
    queryFn: async () => withAvatarUrls(mustList(await supabase.from("ai_agents").select("*").order("created_at"))),
  });

export const interviewsQuery = () =>
  queryOptions({
    queryKey: ["interviews"],
    queryFn: async () => mustList(await supabase.from("interviews").select("*").order("created_at", { ascending: false }).limit(500)),
  });

export const interviewQuery = (id: string) =>
  queryOptions({
    queryKey: ["interview", id],
    queryFn: async (): Promise<Interview> => {
      const { data, error } = await supabase.from("interviews").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const messagesQuery = (interviewId: string) =>
  queryOptions({
    queryKey: ["messages", interviewId],
    queryFn: async () => mustList(await supabase.from("interview_messages").select("*").eq("interview_id", interviewId).order("turn_index")),
  });

export const broadcastsQuery = () =>
  queryOptions({
    queryKey: ["broadcasts"],
    queryFn: async () => mustList(await supabase.from("broadcast_sessions").select("*").order("created_at", { ascending: false }).limit(200)),
  });

export const youtubeConnectionQuery = () =>
  queryOptions({
    queryKey: ["youtube-connection"],
    queryFn: async () => {
      const { data, error } = await supabase.from("youtube_connections").select("*").maybeSingle();
      if (error && isMissingRelation(error.message)) return null;
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const scheduledQuery = () =>
  queryOptions({
    queryKey: ["scheduled"],
    queryFn: async () => mustList(await supabase.from("scheduled_interviews").select("*").order("scheduled_at")),
  });

export const recordingsQuery = () =>
  queryOptions({
    queryKey: ["recordings"],
    queryFn: async () => mustList(await supabase.from("recordings").select("*").order("created_at", { ascending: false })),
  });

export const usageQuery = () =>
  queryOptions({
    queryKey: ["usage"],
    queryFn: async () => mustList(await supabase.from("usage_analytics").select("*").order("created_at", { ascending: false }).limit(1000)),
  });

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["settings"],
    queryFn: async () => {
      const [{ data: profile }, { data: voice }, { data: integ }] = await Promise.all([
        supabase.from("profiles").select("*").maybeSingle(),
        supabase.from("voice_settings").select("*").maybeSingle(),
        supabase.from("integration_settings").select("*").maybeSingle(),
      ]);
      return { profile, voice, integ };
    },
  });

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function interviewDurationMs(iv: Interview) {
  if (!iv.started_at) return 0;
  const end = iv.ended_at ? new Date(iv.ended_at) : iv.status === "running" ? new Date() : null;
  return end ? end.getTime() - new Date(iv.started_at).getTime() : 0;
}
