import type { CardOldMaidCartridge } from "@lucky-arcade/contracts";
import { validateCartridge } from "@lucky-arcade/old-maid";
import { describe, expect, it } from "vitest";
import { cardOldMaidCartridge, tellStyle } from "./card-old-maid.ts";

describe("personal-card old maid adapter", () => {
  it("builds and validates two cards per face plus one generated joker", () => {
    const adapted = cardOldMaidCartridge(source());
    expect(adapted).not.toBeNull();
    validateCartridge(adapted!);
    expect(adapted?.cards).toHaveLength(25);
    expect(adapted?.cards.filter((card) => card.pairId === null)).toEqual([{ id: "joker", faceId: "joker", pairId: null }]);
    expect(adapted?.faces.find((face) => face.id === "joker")?.assetId).toBeNull();
  });

  it("keeps tell styles stable and reaches every style across fingerprints", () => {
    expect(tellStyle("a".repeat(64), "npc-1")).toBe(tellStyle("a".repeat(64), "npc-1"));
    expect(new Set(Array.from({ length: 200 }, (_, index) => tellStyle(index.toString(16).padStart(64, "0"), "npc-1")))).toEqual(new Set(["open", "guarded", "bluffer"]));
  });

  it("rejects incomplete seat and face material", () => {
    expect(cardOldMaidCartridge({ ...source(), seats: source().seats.slice(0, 3) })).toBeNull();
    expect(cardOldMaidCartridge({ ...source(), faces: source().faces.slice(0, 11) })).toBeNull();
  });
});

function source(): CardOldMaidCartridge {
  return {
    contract: "card-old-maid-cartridge/0.1", cardFingerprint: "a".repeat(64), cardName: "테스트 카드",
    faces: Array.from({ length: 12 }, (_, index) => ({ faceId: `face-${index}`, name: `얼굴 ${index}`, assetId: `asset-${index}`, npcId: `npc-${index % 4}`, emotion: "default" })),
    seats: Array.from({ length: 4 }, (_, index) => ({ npcId: `npc-${index}`, displayName: `인물 ${index}`, portraits: { neutral: `n-${index}`, pleased: `p-${index}`, tense: `t-${index}` }, despairAssetId: `t-${index}`, confidence: 0.9, evidence: [] })),
  };
}
