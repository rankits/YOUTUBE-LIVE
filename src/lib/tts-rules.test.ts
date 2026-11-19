import { describe, expect, it } from "vitest";
import { DEEPGRAM_MAX_CHARS, edgeMp3DurationMs, edgeRate, escapeSsml, splitForTts } from "./tts-rules";

describe("splitForTts", () => {
  it("keeps short text as one piece", () => {
    expect(splitForTts("Hello there. How are you?")).toEqual(["Hello there. How are you?"]);
  });

  it("never sends Deepgram more than 2,000 characters per piece", () => {
    const text = Array.from({ length: 120 }, (_, i) => `This is sentence number ${i} about React hooks.`).join(" ");
    const parts = splitForTts(text);
    expect(DEEPGRAM_MAX_CHARS).toBe(2000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(2000);
    expect(parts.join(" ")).toBe(text);
  });

  it("splits one huge sentence on words", () => {
    const text = Array.from({ length: 800 }, () => "word").join(" ");
    const parts = splitForTts(text, 100);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(100);
    expect(parts.join(" ")).toBe(text);
  });

  it("returns nothing for empty text", () => {
    expect(splitForTts("   ")).toEqual([]);
  });
});


describe("Microsoft Edge voice helpers", () => {
  it("maps speaking speed to a prosody rate", () => {
    expect(edgeRate(1)).toBe("+0%");
    expect(edgeRate(1.25)).toBe("+25%");
    expect(edgeRate(0.8)).toBe("-20%");
    expect(edgeRate(5)).toBe("+100%");
  });
  it("escapes characters that would break the SSML", () => {
    expect(escapeSsml(`a & b <c> "d" 'e'`)).toBe("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
    expect(escapeSsml("x\u000by")).toBe("x y");
  });
  it("48 kbps MP3 duration is bytes / 6 ms", () => {
    expect(edgeMp3DurationMs(52416)).toBe(8736);
  });
});
