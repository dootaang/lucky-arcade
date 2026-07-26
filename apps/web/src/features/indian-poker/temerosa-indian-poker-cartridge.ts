import { createTemerosaIndianPokerCartridge, type IndianPokerCharacter, type IndianPokerPersona } from "@lucky-arcade/indian-poker";
import { type OldMaidBehaviorProfile, type OldMaidCharacter, type TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";

export function buildTemerosaIndianPokerCartridge(contentAssets: readonly TemerosaCasinoPortraitAsset[]) {
  const characters = createTemerosaCasinoRoster(contentAssets).map(toIndianPokerCharacter);
  return createTemerosaIndianPokerCartridge(characters);
}

function toIndianPokerCharacter(character: OldMaidCharacter): IndianPokerCharacter {
  const behavior = character.behavior ?? fallbackBehavior(character);
  return {
    id: character.id, name: character.name, appearanceSet: character.appearanceSet, tellStyle: character.tellStyle === "standard" ? "guarded" : character.tellStyle,
    portraits: { ...character.portraits }, despairPortrait: character.despairPortrait,
    persona: {
      riskAppetite: level(behavior.reorderActivity, 0.32, 0.55, 0.78),
      readAccuracy: level(behavior.signalAttention, 0.62, 0.78, 0.92),
      deceptionBias: level(behavior.decoyBias, 0.25, 0.55, 0.8),
      consistency: behavior.consistency === "steady" ? 0.9 : behavior.consistency === "adaptive" ? 0.72 : 0.5,
    },
  };
}

function fallbackBehavior(character: OldMaidCharacter): OldMaidBehaviorProfile {
  const persona: Readonly<Record<OldMaidCharacter["tellStyle"], IndianPokerPersona>> = {
    open: { riskAppetite: 0.68, readAccuracy: 0.72, deceptionBias: 0.2, consistency: 0.7 },
    guarded: { riskAppetite: 0.38, readAccuracy: 0.88, deceptionBias: 0.45, consistency: 0.88 },
    bluffer: { riskAppetite: 0.72, readAccuracy: 0.66, deceptionBias: 0.82, consistency: 0.48 },
    standard: { riskAppetite: 0.5, readAccuracy: 0.75, deceptionBias: 0.5, consistency: 0.7 },
  };
  const selected = persona[character.tellStyle];
  return {
    reorderActivity: selected.riskAppetite > 0.62 ? "high" : selected.riskAppetite < 0.42 ? "low" : "medium",
    jokerHonesty: "medium",
    decoyBias: selected.deceptionBias > 0.65 ? "high" : selected.deceptionBias < 0.35 ? "low" : "medium",
    consistency: selected.consistency > 0.8 ? "steady" : selected.consistency < 0.58 ? "erratic" : "adaptive",
    positionHabit: "none",
    signalAttention: selected.readAccuracy > 0.84 ? "high" : selected.readAccuracy < 0.7 ? "low" : "medium",
    counterRead: "mixed",
  };
}
function level<T>(value: "low" | "medium" | "high", low: T, medium: T, high: T): T { return value === "low" ? low : value === "high" ? high : medium; }
