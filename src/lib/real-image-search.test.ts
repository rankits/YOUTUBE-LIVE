import { describe, expect, it } from "vitest";
import { realPhotoQuery } from "./real-image-search";

describe("realPhotoQuery", () => {
  it("maps job topics to short English search phrases", () => {
    expect(realPhotoQuery("UP Police Constable Bharti 2026", 0)).toMatch(/police/i);
    expect(realPhotoQuery("RRB NTPC railway recruitment", 1)).toMatch(/rail/i);
    expect(realPhotoQuery("SSC CGL Admit Card out", 0)).toMatch(/exam|admit|result/i);
  });

  it("rotates phrase by seed within the same topic", () => {
    const a = realPhotoQuery("Indian Army soldier recruitment", 0);
    const b = realPhotoQuery("Indian Army soldier recruitment", 1);
    expect(a).not.toBe(b);
  });
});
