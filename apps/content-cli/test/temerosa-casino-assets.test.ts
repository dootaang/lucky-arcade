import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertCasinoPackBudget,
  assertCasinoReviewQueue,
  casinoGeometryQueue,
  countReviewUses,
  normalizeCasinoAssetName,
  type CasinoAssetCandidate,
  type CasinoInventoryReport,
  type CasinoPackManifest,
  type CasinoReviewQueue,
} from "../src/temerosa-casino-assets.ts";

const queuePath = fileURLToPath(new URL("../src/temerosa-casino-review-queue.json", import.meta.url));

describe("Temerosa casino A17 asset gates", () => {
  it("preserves original name evidence while applying explicit aliases", () => {
    expect(normalizeCasinoAssetName("Nieun_disapponted")).toEqual({
      value: "nieun-disappointed",
      evidence: [
        "source-string-preserved:originalName",
        "alias:disapponted->disappointed",
        "separator:dot-underscore-space->hyphen",
        "case-fold:en-US-lowercase",
      ],
    });
    expect(normalizeCasinoAssetName("nieun_pluto").value).toBe("nieun-pluto");
    expect(normalizeCasinoAssetName("nieun_pluto").evidence).not.toContain("appearance-merge");
  });

  it("uses geometry as a queue only, including a distinct card bucket", () => {
    expect(casinoGeometryQueue(1024, 1024)).toBe("square");
    expect(casinoGeometryQueue(1216, 832)).toBe("landscape");
    expect(casinoGeometryQueue(768, 1100)).toBe("card");
    expect(casinoGeometryQueue(800, 1200)).toBe("card");
    expect(casinoGeometryQueue(500, 1000)).toBe("portrait");
  });

  it("keeps the first deliverable at 1 hero, 16 symbols, and 4 backgrounds, all unreviewed", async () => {
    const queue = JSON.parse(await readFile(queuePath, "utf8")) as CasinoReviewQueue;
    const inventory = inventoryFor(queue);
    expect(() => assertCasinoReviewQueue(queue, inventory)).not.toThrow();
    expect(countReviewUses(queue)).toEqual({ "venue-hero": 1, "slot-symbol": 16, "table-art": 4 });
    expect(queue.releaseState).toBe("candidate-only");
    expect(queue.items.every((item) => item.semanticStatus === "unreviewed" && item.approvedUses.length === 0)).toBe(true);
  });

  it("rejects approval propagation and unreviewed public selection", async () => {
    const queue = JSON.parse(await readFile(queuePath, "utf8")) as CasinoReviewQueue;
    const inventory = inventoryFor(queue);
    const unsafe = structuredClone(queue);
    unsafe.items[0]!.approvedUses = ["venue-hero"];
    expect(() => assertCasinoReviewQueue(unsafe, inventory)).toThrow("casino_unapproved_item_has_approved_use");
    const incompleteApproval = structuredClone(queue);
    incompleteApproval.releaseState = "approved";
    expect(() => assertCasinoReviewQueue(incompleteApproval, inventory)).toThrow("casino_release_state_approved_with_unreviewed_items");
  });

  it("enforces first-release pack counts and byte budgets", () => {
    expect(() => assertCasinoPackBudget(pack("temerosa-casino-venue", 1, 200_000))).not.toThrow();
    expect(() => assertCasinoPackBudget(pack("temerosa-casino-venue", 1, 200_001))).toThrow("casino_venue_budget_or_count_failed");
    expect(() => assertCasinoPackBudget(pack("temerosa-casino-slots", 11, 1_000))).toThrow("casino_slots_budget_or_count_failed");
    expect(() => assertCasinoPackBudget(pack("temerosa-casino-floor", 6, 1_000))).toThrow("casino_floor_budget_or_count_failed");
  });
});

function inventoryFor(queue: CasinoReviewQueue): CasinoInventoryReport {
  const inventory: CasinoAssetCandidate[] = queue.items.map((item, index) => ({
    sourceCardId: item.sourceCardId,
    sourceCardName: item.sourceCardId,
    sourceEntryPath: item.sourceEntryPath,
    originalName: item.requestedDisplayName,
    byteHash: String(index).padStart(64, "0"),
    perceptualHash: String(index).padStart(16, "0"),
    detectedMime: "image/webp",
    sourcePathMimeMismatch: false,
    bytes: 1,
    width: 1024,
    height: 1024,
    normalizedName: { value: item.id, evidence: ["source-string-preserved:originalName"] },
    geometryQueue: item.intendedUse === "slot-symbol" ? "square" : "landscape",
    semanticTags: [],
    semanticStatus: "unreviewed",
    approvedUses: [],
  }));
  return {
    contract: "temerosa-casino-asset-inventory/1.0",
    generatedAt: "2026-07-26T00:00:00.000Z",
    sources: [{ sourceCardId: "synthetic", sourceCardName: "Synthetic", entries: inventory.length, bytes: inventory.length }],
    duplicatePolicy: { byteHash: "sha256", perceptualHash: "dhash-64", perceptualThreshold: 5, perceptualGroupsAreCandidatesOnly: true },
    totals: { entries: inventory.length, bytes: inventory.length, unreviewed: inventory.length, approved: 0, rejected: 0, byteDuplicateEntries: 0, byteDuplicateGroups: 0, perceptualCandidateEntries: 0, perceptualCandidateGroups: 0, sourcePathMimeMismatches: 0 },
    geometryQueues: { portrait: 0, card: 0, square: 16, landscape: 5, other: 0 },
    inventory,
  };
}

function pack(packId: CasinoPackManifest["packId"], count: number, totalBytes: number): CasinoPackManifest {
  return {
    contract: "temerosa-casino-asset-pack/1.0",
    packId,
    version: "0.1.0",
    provenance: "docs/THIRD_PARTY_PROVENANCE.md#내장-콘텐츠-허가-확인",
    assets: Array.from({ length: count }, (_, index) => ({ id: `asset-${index}`, use: packId === "temerosa-casino-venue" ? "venue-hero" as const : packId === "temerosa-casino-slots" ? "slot-symbol" as const : "table-art" as const, displayName: `Asset ${index}`, sourceCardId: "source", sourceEntryPath: `asset-${index}.png`, sourceByteHash: "0".repeat(64), reviewEvidence: "review", cropFocus: { x: 0.5, y: 0.5 }, variants: [] })),
    totalBytes,
  };
}
