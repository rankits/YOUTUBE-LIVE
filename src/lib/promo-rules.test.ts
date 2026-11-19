import { describe, expect, it } from "vitest";
import { buildDescription, cleanHashtags, cleanTags, cleanTitle } from "./promo-rules";

describe("promo rules", () => {
  it("caps titles at 100 characters", () => {
    expect(cleanTitle("a".repeat(150))).toHaveLength(100);
  });
  it("keeps tags within 500 characters total and dedupes", () => {
    const tags = cleanTags(Array.from({ length: 80 }, (_, i) => `tag${i % 40}word`));
    expect(tags.join(",").length).toBeLessThanOrEqual(500);
    expect(new Set(tags).size).toBe(tags.length);
  });
  it("allows at most 15 hashtags, each starting with # and no spaces", () => {
    const h = cleanHashtags(Array.from({ length: 30 }, (_, i) => `ai topic ${i}`));
    expect(h).toHaveLength(15);
    expect(h[0]).toBe("#aitopic0");
  });
  it("appends hashtags to the description", () => {
    expect(buildDescription("Hello", ["#AI", "#React"])).toBe("Hello\n\n#AI #React");
  });
});
