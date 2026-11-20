import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Livestream monitor (permitted path only):
 * - Detect live via videos.list liveStreamingDetails
 * - Analyze public live chat via liveChatMessages.list (OAuth of signed-in user)
 * - Never downloads or redistributes AV of third-party streams
 */

export const resolveLiveStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().min(3).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { parseYoutubeVideoId } = await import("@/lib/live-monitor-rules");
    const videoId = parseYoutubeVideoId(data.url);
    if (!videoId) throw new Error("Paste a valid YouTube watch or live URL.");

    const { yt, getAccessToken } = await import("./youtube.server");
    // Ensure the user has a connected YouTube account (API quota + chat access).
    await getAccessToken(context.userId);

    const res = await yt<{
      items?: {
        id: string;
        snippet?: {
          title?: string;
          channelId?: string;
          channelTitle?: string;
          liveBroadcastContent?: string;
          description?: string;
        };
        liveStreamingDetails?: {
          actualStartTime?: string;
          actualEndTime?: string;
          scheduledStartTime?: string;
          concurrentViewers?: string;
          activeLiveChatId?: string;
        };
        status?: { privacyStatus?: string; embeddable?: boolean };
      }[];
    }>(context.userId, `/videos?part=snippet,liveStreamingDetails,status&id=${encodeURIComponent(videoId)}`);

    const item = res.items?.[0];
    if (!item) throw new Error("Video not found (private, deleted, or bad id).");

    const liveDetails = item.liveStreamingDetails;
    const broadcast = item.snippet?.liveBroadcastContent ?? "none";
    const isLive = broadcast === "live" || (!!liveDetails?.actualStartTime && !liveDetails?.actualEndTime);
    const isUpcoming = broadcast === "upcoming" || (!!liveDetails?.scheduledStartTime && !liveDetails?.actualStartTime);

    // Own-channel check (clip drafts only when authorized).
    let ownChannel = false;
    try {
      const mine = await yt<{ items?: { id?: string }[] }>(context.userId, "/channels?part=id&mine=true");
      const myId = mine.items?.[0]?.id;
      ownChannel = !!myId && myId === item.snippet?.channelId;
    } catch {
      ownChannel = false;
    }

    return {
      videoId,
      title: item.snippet?.title ?? "Untitled",
      channelId: item.snippet?.channelId ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      isLive,
      isUpcoming,
      ended: !!liveDetails?.actualEndTime,
      actualStartTime: liveDetails?.actualStartTime ?? null,
      concurrentViewers: liveDetails?.concurrentViewers ? Number(liveDetails.concurrentViewers) : null,
      activeLiveChatId: liveDetails?.activeLiveChatId ?? null,
      privacyStatus: item.status?.privacyStatus ?? "unknown",
      ownChannel,
      canAnalyzeChat: !!liveDetails?.activeLiveChatId,
      canDraftClip: ownChannel,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      note: ownChannel
        ? "This is your channel — highlight timestamps can later map to your VOD for Short drafts."
        : "Third-party stream: chat/metadata highlights + YouTube preview links only. No AV download or re-upload.",
    };
  });

export const pollLiveHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().min(6).max(20),
        liveChatId: z.string().min(6).max(200),
        actualStartTime: z.string().nullable().optional(),
        pageToken: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { yt } = await import("./youtube.server");
    const {
      detectChatSpike,
      mergeHighlights,
      offsetFromStart,
      scoreHighlightText,
      youtubeWatchUrl,
    } = await import("@/lib/live-monitor-rules");

    type ChatItem = {
      id?: string;
      snippet?: {
        type?: string;
        publishedAt?: string;
        displayMessage?: string;
        textMessageDetails?: { messageText?: string };
      };
    };

    const chat = await yt<{
      items?: ChatItem[];
      nextPageToken?: string;
      pollingIntervalMillis?: number;
      offlineAt?: string;
    }>(
      context.userId,
      `/liveChat/messages?part=snippet,authorDetails&liveChatId=${encodeURIComponent(data.liveChatId)}&maxResults=200${
        data.pageToken ? `&pageToken=${encodeURIComponent(data.pageToken)}` : ""
      }`,
    );

    const messages = (chat.items ?? [])
      .map((it) => {
        const at = it.snippet?.publishedAt ?? "";
        const text = it.snippet?.displayMessage || it.snippet?.textMessageDetails?.messageText || "";
        return { at, text };
      })
      .filter((m) => m.at && m.text);

    const start = data.actualStartTime ?? null;
    const highlights = messages
      .map((m) => scoreHighlightText(m.text, m.at, offsetFromStart(m.at, start), "chat"))
      .filter((h): h is NonNullable<typeof h> => !!h);

    const spike = detectChatSpike(messages, start);
    if (spike) highlights.push(spike);

    const merged = mergeHighlights(highlights, 30).map((h) => ({
      ...h,
      previewUrl: youtubeWatchUrl(data.videoId, h.offsetSec),
    }));

    return {
      highlights: merged,
      messageCount: messages.length,
      nextPageToken: chat.nextPageToken ?? null,
      pollingIntervalMs: chat.pollingIntervalMillis ?? 5000,
      offlineAt: chat.offlineAt ?? null,
      analyzedAt: new Date().toISOString(),
    };
  });

/** Analyze pasted captions / transcript lines (creator-provided, fully permitted). */
export const analyzeCaptionText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().min(6).max(20).optional(),
        text: z.string().min(20).max(100_000),
        actualStartTime: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { mergeHighlights, scoreHighlightText, youtubeWatchUrl } = await import("@/lib/live-monitor-rules");
    const lines = data.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const base = Date.now();
    const highlights = lines
      .map((line, i) => {
        // Optional "mm:ss text" or "hh:mm:ss text"
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+)$/.exec(line);
        let offsetSec: number | null = null;
        let body = line;
        if (m) {
          const a = Number(m[1]);
          const b = Number(m[2]);
          const c = m[3] != null ? Number(m[3]) : null;
          offsetSec = c == null ? a * 60 + b : a * 3600 + b * 60 + c;
          body = m[4]!;
        } else {
          offsetSec = i * 5;
        }
        const at = new Date(base + (offsetSec ?? i) * 1000).toISOString();
        return scoreHighlightText(body, at, offsetSec, "caption");
      })
      .filter((h): h is NonNullable<typeof h> => !!h);

    const merged = mergeHighlights(highlights, 40).map((h) => ({
      ...h,
      previewUrl: data.videoId ? youtubeWatchUrl(data.videoId, h.offsetSec) : null,
    }));

    return { highlights: merged, lineCount: lines.length };
  });
