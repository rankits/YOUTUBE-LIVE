import { describe, expect, it } from "vitest";
import {
  detectChatSpike,
  mergeHighlights,
  parseYoutubeVideoId,
  scoreHighlightText,
  youtubeWatchUrl,
} from "./live-monitor-rules";

describe("parseYoutubeVideoId", () => {
  it("parses watch, live, and bare ids", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
});

describe("scoreHighlightText", () => {
  it("flags breaking and announcements", () => {
    const h = scoreHighlightText("BREAKING: new policy announced", "2026-01-01T00:00:10Z", 10, "chat");
    expect(h?.kind).toBe("breaking");
    expect(youtubeWatchUrl("dQw4w9WgXcQ", 10)).toContain("t=10s");
  });
  it("ignores short noise", () => {
    expect(scoreHighlightText("hi", "2026-01-01T00:00:10Z", 10, "chat")).toBeNull();
  });
});

describe("detectChatSpike", () => {
  it("detects a burst of messages", () => {
    const base = Date.parse("2026-01-01T00:00:00Z");
    const messages = Array.from({ length: 10 }, (_, i) => ({
      at: new Date(base + i * 1000).toISOString(),
      text: `msg ${i}`,
    }));
    const spike = detectChatSpike(messages, "2026-01-01T00:00:00Z", 20, 8);
    expect(spike?.kind).toBe("chat_spike");
    expect(spike?.offsetSec).toBeGreaterThanOrEqual(0);
  });
});

describe("mergeHighlights", () => {
  it("dedupes and sorts by score", () => {
    const a = scoreHighlightText("breaking news now", "2026-01-01T00:00:01Z", 1, "chat")!;
    const b = scoreHighlightText("wow goat play 🔥", "2026-01-01T00:00:02Z", 2, "chat")!;
    const m = mergeHighlights([a, a, b]);
    expect(m.length).toBe(2);
    expect(m[0]!.score).toBeGreaterThanOrEqual(m[1]!.score);
  });
});
