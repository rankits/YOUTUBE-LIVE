import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, chatChain, edgeVoiceForShow, fallbackVoice, normalizePrefs, voiceChain } from "./provider-rules";

const all = new Set(["edge", "deepgram", "sarvam", "gemini", "google_cloud", "elevenlabs", "lovable"] as const);

describe("voiceChain", () => {
  it("English show uses the agent's Deepgram voice first, then Built-in, then Microsoft", () => {
    expect(voiceChain("english", "deepgram", DEFAULT_PREFS, all).slice(0, 3)).toEqual(["deepgram", "lovable", "gemini"]);
    expect(voiceChain("english", "deepgram", DEFAULT_PREFS, all)).toContain("edge");
  });
  it("ElevenLabs falls back to Built-in then Microsoft", () => {
    expect(voiceChain("english", "elevenlabs", DEFAULT_PREFS, all).slice(0, 3)).toEqual(["elevenlabs", "lovable", "gemini"]);
    expect(voiceChain("english", "elevenlabs", DEFAULT_PREFS, all)[3]).toBe("edge");
  });
  it("never uses Deepgram for Hindi or Hinglish", () => {
    expect(voiceChain("hinglish", "deepgram", DEFAULT_PREFS, all)).not.toContain("deepgram");
    expect(voiceChain("hindi", "deepgram", DEFAULT_PREFS, all)[0]).toBe("lovable");
  });
  it("respects the Settings choice for Indian shows", () => {
    expect(voiceChain("hinglish", "deepgram", { ...DEFAULT_PREFS, voiceIndian: "google_cloud" }, all)[0]).toBe("google_cloud");
  });
  it("only one engine when fallback is off", () => {
    expect(voiceChain("english", "deepgram", { ...DEFAULT_PREFS, fallback: false }, all)).toEqual(["deepgram"]);
  });
  it("skips engines without a key and still keeps Microsoft last-resort", () => {
    expect(voiceChain("hindi", "lovable", DEFAULT_PREFS, new Set(["google_cloud", "lovable", "edge"]))).toEqual([
      "lovable",
      "edge",
      "google_cloud",
    ]);
  });
  it("ElevenLabs → Microsoft when Built-in is unavailable", () => {
    expect(voiceChain("english", "elevenlabs", DEFAULT_PREFS, new Set(["elevenlabs", "edge"]))).toEqual(["elevenlabs", "edge"]);
  });
});

describe("chatChain", () => {
  it("auto = Groq, then Gemini, then built-in", () => {
    expect(chatChain(DEFAULT_PREFS, new Set(["groq", "gemini", "lovable"]))).toEqual(["groq", "gemini", "lovable"]);
  });
  it("chosen primary goes first", () => {
    expect(chatChain({ ...DEFAULT_PREFS, chatPrimary: "gemini" }, new Set(["groq", "gemini", "lovable"]))[0]).toBe("gemini");
  });
});

it("fallback voices keep gender and language", () => {
  expect(fallbackVoice("google_cloud", "M", "hindi")).toBe("hi-IN-Neural2-B");
  expect(fallbackVoice("sarvam", "F", "hinglish")).toBe("anushka");
});

it("bad saved prefs fall back to defaults", () => {
  expect(normalizePrefs({ chatPrimary: "x", fallback: "y" })).toEqual(DEFAULT_PREFS);
});

describe("Microsoft Edge voices", () => {
  it("an Edge agent speaks with Edge first, in every language", () => {
    expect(voiceChain("english", "edge", DEFAULT_PREFS, all)[0]).toBe("edge");
    expect(voiceChain("hinglish", "edge", DEFAULT_PREFS, all)[0]).toBe("edge");
  });
  it("Built-in then Edge are the first backups when another engine fails", () => {
    expect(voiceChain("hinglish", "sarvam", DEFAULT_PREFS, all).slice(0, 3)).toEqual(["sarvam", "lovable", "gemini"]);
    expect(voiceChain("hinglish", "sarvam", DEFAULT_PREFS, all)).toContain("edge");
  });
  it("Edge fallback voices keep gender: Hindi voices for Indian shows, Indian English otherwise", () => {
    expect(fallbackVoice("edge", "F", "hinglish")).toBe("hi-IN-SwaraNeural");
    expect(fallbackVoice("edge", "M", "english")).toBe("en-US-BrianMultilingualNeural");
  });
  it("pure Hindi shows swap an English voice for the same-gender Hindi voice", () => {
    expect(edgeVoiceForShow("en-IN-PrabhatNeural", "M", "hindi")).toBe("hi-IN-MadhurNeural");
    expect(edgeVoiceForShow("en-IN-NeerjaNeural", "F", "hinglish")).toBe("en-IN-NeerjaNeural");
    expect(edgeVoiceForShow("en-US-AndrewMultilingualNeural", "M", "hindi")).toBe("en-US-AndrewMultilingualNeural");
  });
});
