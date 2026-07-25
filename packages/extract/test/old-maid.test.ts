import type { NpcGroup } from "@lucky-arcade/contracts";
import { describe, expect, it } from "vitest";
import { cardOldMaidEligibility, createCardOldMaidCartridge, extractNpcGroups, oldMaidEmotionKind } from "../src/index.ts";

describe("personal-card old maid extraction", () => {
  it("preserves the parsed asset-to-emotion pairing in deterministic order", () => {
    const base = { extension: "png", mime: "image/png", size: 1, container: "zip-entry" as const };
    const result = extractNpcGroups([
      { ...base, id: "smile", name: "Alice_smile", path: "Alice_smile.png" },
      { ...base, id: "default", name: "Alice_default", path: "Alice_default.png" },
      { ...base, id: "angry", name: "Alice_angry", path: "Alice_angry.png" },
    ]);
    expect(result.groups[0]?.variants).toEqual([
      { assetId: "default", emotion: "default" },
      { assetId: "angry", emotion: "angry" },
      { assetId: "smile", emotion: "smile" },
    ]);
  });

  it("maps English and Korean tags without accepting ambiguous words", () => {
    expect(["default", "happy", "worried"].map(oldMaidEmotionKind)).toEqual(["neutral", "pleased", "tense"]);
    expect(["기본", "미소", "긴장"].map(oldMaidEmotionKind)).toEqual(["neutral", "pleased", "tense"]);
    expect(["serious", "smirk"].map(oldMaidEmotionKind)).toEqual([null, null]);
  });

  it("does not substitute a missing pleased portrait but keeps its faces", () => {
    const groups = [group("complete", ["default", "happy", "angry"]), group("quiet", ["default", "serious", "angry"])];
    const cartridge = createCardOldMaidCartridge("a".repeat(64), "카드", groups);
    expect(cartridge.seats.map((seat) => seat.npcId)).toEqual(["complete"]);
    expect(cartridge.faces.some((face) => face.npcId === "quiet" && face.emotion === "serious")).toBe(true);
  });

  it("uses despair when present and only tense as the documented absence fallback", () => {
    const cartridge = createCardOldMaidCartridge("b".repeat(64), "카드", [group("with", ["default", "happy", "angry", "sad"]), group("without", ["default", "happy", "angry"])]);
    expect(cartridge.seats.find((seat) => seat.npcId === "with")?.despairAssetId).toBe("with-sad");
    expect(cartridge.seats.find((seat) => seat.npcId === "without")?.despairAssetId).toBe("without-angry");
  });

  it("closes cleanly below either eligibility boundary and records both reasons", () => {
    const threeSeats = createCardOldMaidCartridge("c".repeat(64), "카드", Array.from({ length: 3 }, (_, index) => group(`npc-${index}`, ["default", "happy", "angry", "sad"])));
    expect(cardOldMaidEligibility(threeSeats)).toMatchObject({ available: false, seatCount: 3, faceCount: 12 });
    expect(cardOldMaidEligibility(threeSeats).reasons[0]).toContain("최소 4명");
    const complete = createCardOldMaidCartridge("d".repeat(64), "카드", Array.from({ length: 4 }, (_, index) => group(`full-${index}`, ["default", "happy", "angry"])));
    const elevenFaces = { ...complete, faces: complete.faces.slice(0, 11) };
    expect(cardOldMaidEligibility(elevenFaces)).toMatchObject({ available: false, seatCount: 4, faceCount: 11 });
    expect(cardOldMaidEligibility(elevenFaces).reasons[1]).toContain("최소 12종");
  });
});

function group(id: string, emotions: string[]): NpcGroup {
  const variants = emotions.map((emotion) => ({ assetId: `${id}-${emotion}`, emotion }));
  return { id, displayName: id, displayNameSource: "asset-filename", spriteCount: variants.length, emotions, representativeAssetId: variants[0]?.assetId ?? id, variantAssetIds: variants.map((variant) => variant.assetId), variants, confidence: 0.9, evidence: [] };
}
