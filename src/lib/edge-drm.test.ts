import { describe, expect, it } from "vitest";
import { secMsGec } from "./edge-drm";

// Expected values produced by the reference Python edge-tts 7.3 generate_sec_ms_gec_v2().
describe("secMsGec", () => {
  it("matches the reference token for fixed timestamps", () => {
    expect(secMsGec(1700000000)).toBe("2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2");
    expect(secMsGec(1794338000.5)).toBe("954460E12BC1D5DB-D4E1261A9FD983AAABD1507EAEA8D49D7CAD485F58FE4663903B2B5D7A026FC4");
    expect(secMsGec(1800000123)).toBe("99E54519B490BE5C-E162DB0977FBDCB9B86DD8148BF1BCDC3C0303176CE39852A42B415935C20654");
  });
  it("stays the same inside one 5-minute window", () => {
    expect(secMsGec(1699999800)).toBe(secMsGec(1699999800 + 299));
    expect(secMsGec(1699999800)).not.toBe(secMsGec(1699999800 + 300));
  });
});
