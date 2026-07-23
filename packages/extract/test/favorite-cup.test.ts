import { describe, expect, it } from "vitest";
import { favoriteCupEligibility } from "../src/index.ts";

const candidate = (name: string, confidence = 1) => ({ npcId: name, displayName: name, displayNameSource: "asset-filename" as const, representativeAssetId: `${name}:default`, variantAssetIds: [`${name}:default`], confidence, evidence: [] });
const cartridge = (names: string[]) => ({ contract: "favorite-cup-cartridge/0.1" as const, cardFingerprint: "a".repeat(64), cardName: "test", candidates: names.map((name) => candidate(name)) });

describe("favorite cup eligibility", () => {
  it("blocks seven distinct candidates", () => expect(favoriteCupEligibility(cartridge(["a","b","c","d","e","f","g"])).value).toHaveLength(7));
  it("merges case, punctuation, and swap aliases", () => {
    const result = favoriteCupEligibility(cartridge(["AR-57", "ar57", "Aegis", "Aegis_SWAP", "b", "c", "d", "e", "f", "g"]));
    expect(result.value.map((item) => item.displayName)).toEqual(["Aegis", "AR-57", "b", "c", "d", "e", "f", "g"]);
  });
});
