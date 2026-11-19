import { describe, expect, it } from "vitest";
import { pickShuffleTheme, shuffleVoice } from "./shuffle-rules";

describe("pickShuffleTheme", () => {
  const ids = ["viral", "whiteboard", "studio"] as const;
  it("rotates so two Shorts in a row never share a theme", () => {
    expect([0, 1, 2, 3].map((n) => pickShuffleTheme(ids, n))).toEqual(["viral", "whiteboard", "studio", "viral"]);
  });
});

describe("shuffleVoice", () => {
  it("cycles show voice → female → male", () => {
    expect(shuffleVoice("hindi", 0)).toBeNull();
    expect(shuffleVoice("hindi", 1)).toEqual({ voice_provider: "edge", voice_id: "hi-IN-SwaraNeural" });
    expect(shuffleVoice("hindi", 2)).toEqual({ voice_provider: "edge", voice_id: "hi-IN-MadhurNeural" });
    expect(shuffleVoice("english", 4)).toEqual({ voice_provider: "edge", voice_id: "en-IN-NeerjaNeural" });
  });
});
