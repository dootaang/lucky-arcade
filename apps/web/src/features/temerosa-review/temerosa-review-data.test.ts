import { describe, expect, it } from "vitest";
import { initialReviewChoices, reviewBeats, reviewExport, sanitizeReviewChoices } from "./temerosa-review-data.ts";

describe("Temerosa owner review state", () => {
  it("keeps every beat on an allowed candidate", () => {
    const state = initialReviewChoices();
    expect(Object.keys(state)).toHaveLength(reviewBeats.length);
    for (const beat of reviewBeats) expect(beat.candidates.some((candidate) => candidate.assetId === state[beat.id]?.selectedAssetId)).toBe(true);
  });

  it("rejects stale or injected local choices", () => {
    const state = sanitizeReviewChoices({ "pale-familiar": { selectedAssetId: "not-an-asset", status: "approved" } });
    expect(state["pale-familiar"]?.status).toBe("unreviewed");
  });

  it("exports a versioned compact review result", () => {
    expect(JSON.parse(reviewExport(initialReviewChoices())).contract).toBe("temerosa-expression-review/0.1");
  });
});
