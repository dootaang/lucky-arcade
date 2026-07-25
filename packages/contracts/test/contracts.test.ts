import { describe, expect, it } from "vitest";
import { medalAward, sourcedSchema, suitabilityReportSchema, temerosaContentManifestSchema } from "../src/index.ts";

describe("runtime contracts", () => {
  it("rejects confidence outside the declared range", () => {
    expect(() => sourcedSchema(suitabilityReportSchema).parse({ value: {}, source: "derived", confidence: 2, evidence: [] })).toThrow();
  });

  it("rejects a Temerosa pack that reports forbidden assets", () => {
    const manifest = {
      contract: "temerosa-content-manifest/0.1",
      packId: "temerosa-margin",
      version: "0.1.0",
      assets: [{ id: "nieun-standing", role: "portrait", chunk: "bootstrap", characterId: "nieun", expression: "standing", variants: [{ size: "sm", path: "nieun.webp", mime: "image/webp", width: 192, height: 192, bytes: 1 }] }],
      totalBytes: 1,
      safety: { policy: "explicit-sfw-allowlist/0.1", selectedAssetCount: 1, forbiddenAssetCount: 1 },
    };
    expect(() => temerosaContentManifestSchema.parse(manifest)).toThrow();
  });

  it("applies placement, recovery and floor medal rules", () => {
    const input = { sessionId: "s", sequence: 1, cabinetId: "c", rank: 1, seatCount: 4, spectated: false };
    expect(medalAward(100, input)).toBe(12);
    expect(medalAward(19, { ...input, rank: 4 })).toBe(0);
    expect(medalAward(20, { ...input, rank: 4 })).toBe(-4);
    expect(medalAward(3, { ...input, rank: 4 })).toBe(0);
    expect(medalAward(100, { ...input, spectated: true })).toBe(0);
  });
});
