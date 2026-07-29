import type { FiveCardDrawOpponent } from "@lucky-arcade/five-card-draw";
import { TEMEROSA_CASINO_BEHAVIOR_PROFILES, TEMEROSA_CASINO_TELL_STYLES, type OldMaidBehaviorProfile, type OldMaidCharacter } from "@lucky-arcade/old-maid";
import type { TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";

export interface TemerosaFiveCardDrawOpponent extends FiveCardDrawOpponent {
  portraitAssetId: string;
}

/**
 * Adapts the frozen casino persona vocabulary to poker concepts. The mapping is
 * intentionally discrete: it keeps characters distinct without inventing
 * unsupported per-character probabilities.
 */
export function createTemerosaFiveCardDrawOpponents(contentAssets: readonly TemerosaCasinoPortraitAsset[]): readonly TemerosaFiveCardDrawOpponent[] {
  return createTemerosaCasinoRoster(contentAssets).map(toOpponent);
}

function toOpponent(character: OldMaidCharacter): TemerosaFiveCardDrawOpponent {
  const source = TEMEROSA_CASINO_BEHAVIOR_PROFILES[character.id];
  if (!source) throw new Error(`five_card_draw_persona_missing:${character.id}`);
  const tellStyle = TEMEROSA_CASINO_TELL_STYLES[character.id] ?? "standard";
  return {
    id: character.id,
    name: character.name,
    portraitAssetId: character.portraits.neutral,
    persona: {
      drawSkill: level(source.reorderActivity, 0.48, 0.68, 0.86),
      handReading: level(source.signalAttention, 0.34, 0.58, 0.82),
      aggression: clamp(level(source.decoyBias, 0.32, 0.56, 0.78) + (tellStyle === "bluffer" ? 0.08 : 0)),
      bluffFrequency: clamp(level(invertHonesty(source), 0.2, 0.48, 0.76) + (tellStyle === "bluffer" ? 0.1 : 0)),
      discipline: consistency(source.consistency, 0.82, 0.65, 0.38),
      counterRead: source.counterRead === "suspicious" ? 0.78 : source.counterRead === "mixed" ? 0.55 : 0.3,
      tiltResistance: consistency(source.consistency, 0.86, 0.64, 0.36),
    },
  };
}

function invertHonesty(profile: OldMaidBehaviorProfile): "low" | "medium" | "high" {
  return profile.jokerHonesty === "high" ? "low" : profile.jokerHonesty === "low" ? "high" : "medium";
}

function level(value: "low" | "medium" | "high", low: number, medium: number, high: number): number {
  return value === "low" ? low : value === "medium" ? medium : high;
}

function consistency(value: OldMaidBehaviorProfile["consistency"], steady: number, adaptive: number, erratic: number): number {
  return value === "steady" ? steady : value === "adaptive" ? adaptive : erratic;
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
