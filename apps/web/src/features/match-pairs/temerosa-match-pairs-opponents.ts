import type { MatchPairsOpponent } from "@lucky-arcade/match-pairs";
import { createTemerosaCasinoOldMaidCartridge, type OldMaidBehaviorProfile, type OldMaidCharacter, type TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";

/**
 * Converts the audited 30-person casino roster into game-specific memory styles.
 * The numbers are gameplay interpretations of the shared behavior vocabulary,
 * never claims about literal character facts.
 */
export function createTemerosaMatchPairsOpponents(contentAssets: readonly TemerosaCasinoPortraitAsset[]): readonly MatchPairsOpponent[] {
  const cartridge = createTemerosaCasinoOldMaidCartridge(contentAssets);
  const selectable = new Set(cartridge.selectableCharacterIds ?? cartridge.characters.map((character) => character.id));
  return cartridge.characters
    .filter((character) => selectable.has(character.id) && character.id !== "bacikal" && character.portraits.neutral.startsWith("npc-"))
    .map(toOpponent);
}

function toOpponent(character: OldMaidCharacter): MatchPairsOpponent {
  const profile = character.behavior ?? fallbackBehavior(character.tellStyle);
  const attention = level(profile.signalAttention, 5, 7, 9);
  const consistencyOffset = profile.consistency === "steady" ? 1 : profile.consistency === "erratic" ? -1 : 0;
  const accuracy = level(profile.signalAttention, 0.68, 0.8, 0.92)
    + (profile.consistency === "steady" ? 0.04 : profile.consistency === "erratic" ? -0.08 : 0);
  return {
    id: character.id,
    name: character.name,
    portraits: { ...character.portraits },
    despairPortrait: character.despairPortrait,
    memoryCapacity: clampInteger(attention + consistencyOffset, 4, 10),
    recallAccuracy: clamp(accuracy, 0.55, 0.97),
    explorationBias: level(profile.reorderActivity, 0.38, 0.55, 0.72),
    consistency: profile.consistency === "steady" ? 0.9 : profile.consistency === "adaptive" ? 0.72 : 0.55,
  };
}

function fallbackBehavior(tellStyle: OldMaidCharacter["tellStyle"]): OldMaidBehaviorProfile {
  if (tellStyle === "open") return profile("high", "medium", "low", "adaptive", "medium");
  if (tellStyle === "guarded") return profile("low", "low", "high", "steady", "high");
  if (tellStyle === "bluffer") return profile("high", "low", "high", "erratic", "medium");
  return profile("medium", "medium", "medium", "adaptive", "medium");
}

function profile(reorderActivity: OldMaidBehaviorProfile["reorderActivity"], jokerHonesty: OldMaidBehaviorProfile["jokerHonesty"], decoyBias: OldMaidBehaviorProfile["decoyBias"], consistency: OldMaidBehaviorProfile["consistency"], signalAttention: OldMaidBehaviorProfile["signalAttention"]): OldMaidBehaviorProfile {
  return { reorderActivity, jokerHonesty, decoyBias, consistency, signalAttention, positionHabit: "none", counterRead: "mixed" };
}
function level<T>(value: "low" | "medium" | "high", low: T, medium: T, high: T): T { return value === "low" ? low : value === "high" ? high : medium; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function clampInteger(value: number, min: number, max: number): number { return Math.round(clamp(value, min, max)); }
