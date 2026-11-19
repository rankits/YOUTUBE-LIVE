import { describe, expect, it } from "vitest";
import { buildShortImagePrompt, hasDevanagari, matchTopicVisual, sceneImageQuery, stripNonAsciiWords } from "./short-image-prompt";

describe("matchTopicVisual", () => {
  it("maps police / दरोगा to khaki officers", () => {
    expect(matchTopicVisual("MP Police Exam")).toMatch(/police officers in khaki/i);
    expect(matchTopicVisual("दरोगा भर्ती 2026")).toMatch(/police officers in khaki/i);
  });
  it("maps railway / ट्रेन", () => {
    expect(matchTopicVisual("RRB NTPC")).toMatch(/Indian Railways/i);
    expect(matchTopicVisual("ट्रेन दुर्घटना")).toMatch(/Indian Railways/i);
  });
  it("maps SSC / परीक्षा / भर्ती to exam hall", () => {
    expect(matchTopicVisual("SSC CGL")).toMatch(/examination hall/i);
    expect(matchTopicVisual("यूपीएससी परीक्षा")).toMatch(/examination hall/i);
  });
  it("maps space topics", () => {
    expect(matchTopicVisual("सौरमंडल के ग्रह")).toMatch(/Planet in deep dark space/i);
    expect(matchTopicVisual("ISRO Mars mission")).toMatch(/Planet in deep dark space/i);
  });
  it("returns null for unmatched latin gibberish", () => {
    expect(matchTopicVisual("zzzz unrelated xyz")).toBeNull();
  });
});

describe("buildShortImagePrompt", () => {
  it("asks for realistic photos, not sketch style", () => {
    const p = buildShortImagePrompt("MP Police Exam");
    expect(p).toMatch(/^Indian police officers in khaki/i);
    expect(p).toMatch(/realistic documentary photograph/i);
    expect(p).toMatch(/vertical 9:16/i);
    expect(p).not.toMatch(/detailed graphite pencil sketch drawing|hand-drawn shading/i);
  });
  it("blocks random woman portrait priors", () => {
    expect(buildShortImagePrompt("भर्ती")).toMatch(/not a portrait of a random woman/i);
  });
  it("strips Devanagari when no dictionary hit", () => {
    const p = buildShortImagePrompt("अज्ञातविषयक प्रश्न");
    expect(hasDevanagari(p)).toBe(false);
    expect(p).toMatch(/realistic documentary photograph/i);
  });
  it("rotates visual variation by seed", () => {
    const a = buildShortImagePrompt("MP Police Exam", 0);
    const b = buildShortImagePrompt("MP Police Exam", 1);
    expect(a).not.toBe(b);
  });
});

describe("sceneImageQuery", () => {
  it("keeps news topic but changes angle per scene index", () => {
    const a = sceneImageQuery("MP Police Bharti 2026", 0, "khaki uniform");
    const b = sceneImageQuery("MP Police Bharti 2026", 1, "exam hall");
    expect(a).toMatch(/police|khaki/i);
    expect(b).toMatch(/police|khaki|exam/i);
    expect(a).not.toBe(b);
  });
});

describe("stripNonAsciiWords / hasDevanagari", () => {
  it("detects and strips Devanagari", () => {
    expect(hasDevanagari("पुलिस exam")).toBe(true);
    expect(stripNonAsciiWords("पुलिस MP Police")).toBe("MP Police");
  });
});
