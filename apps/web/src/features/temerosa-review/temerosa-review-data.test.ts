import { describe, expect, it } from "vitest";
import { initialReviewChoices, reviewBeats, reviewExport, sanitizeReviewChoices, validateReviewManifest } from "./temerosa-review-data.ts";

describe("Temerosa owner review state", () => {
  it("keeps every beat on an allowed candidate", () => {
    const state = initialReviewChoices();
    expect(Object.keys(state)).toHaveLength(reviewBeats.length);
    for (const beat of reviewBeats) expect(beat.candidates.some((candidate) => candidate.assetId === state[beat.id]?.selectedAssetId)).toBe(true);
  });

  it("rejects stale or injected local choices", () => {
    const state = sanitizeReviewChoices({ "alger-arrival-smirk": { selectedAssetId: "not-an-asset", status: "approved" } });
    expect(state["alger-arrival-smirk"]).toEqual({ selectedAssetId: "review-alger-smirk", status: "unreviewed" });
  });

  it("starts the new twelve-expression gate unreviewed", () => {
    const state = initialReviewChoices();
    for (const id of reviewBeats.map((beat) => beat.id)) {
      expect(state[id]?.status).toBe("unreviewed");
    }
    expect(reviewBeats).toHaveLength(12);
    expect(state["alger-arrival-smirk"]?.selectedAssetId).toBe("review-alger-smirk");
  });

  it("exports a versioned compact review result", () => {
    expect(JSON.parse(reviewExport(initialReviewChoices())).contract).toBe("temerosa-expression-review/0.1");
  });

  it("rejects an expression candidate from another appearance set", () => {
    const assets = [...new Set(reviewBeats.flatMap((beat) => beat.candidates.map((candidate) => candidate.assetId)))].map((id) => ({
      id,
      appearanceSet: reviewBeats.find((beat) => beat.candidates.some((candidate) => candidate.assetId === id))!.appearanceSet,
      variants: [{ size: "md" as const, path: `${id}.webp`, width: 1, height: 1 }],
    }));
    const target = assets.find((asset) => asset.id === "review-alger-smirk")!;
    target.appearanceSet = "alger/bestiaization/executive";
    expect(() => validateReviewManifest({ version: "0.4.0", assets })).toThrow("temerosa_review_appearance_mismatch");
  });
});
