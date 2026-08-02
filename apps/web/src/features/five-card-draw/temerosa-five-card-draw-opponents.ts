import type { FiveCardDrawOpponent } from "@lucky-arcade/five-card-draw";
import { TEMEROSA_CASINO_BEHAVIOR_PROFILES, TEMEROSA_CASINO_TELL_STYLES, type OldMaidBehaviorProfile, type OldMaidCharacter } from "@lucky-arcade/old-maid";
import type { TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";
import { type SeriesGameNpcPresentation, unit } from "../../lib/temerosa-series-game-roster.ts";

export interface TemerosaFiveCardDrawOpponent extends FiveCardDrawOpponent {
  portraitAssetIds: Readonly<Record<"confident" | "neutral" | "uneasy", string>>;
}

export function createTemerosaSeriesFiveCardDrawOpponents(roster:readonly SeriesGameNpcPresentation[]):readonly TemerosaFiveCardDrawOpponent[]{
  return Object.freeze(roster.map((item):TemerosaFiveCardDrawOpponent=>({
    id:item.id,name:item.name,portraitAssetIds:{confident:item.assetIds.pleased,neutral:item.assetIds.neutral,uneasy:item.assetIds.tense},
    persona:{drawActivity:unit(.25+item.profile.riskAppetite*.65),riskAppetite:unit(item.profile.riskAppetite),
      signalAttention:unit(item.profile.skills.pokerRead),signalTrust:unit(item.profile.skills.pokerRead)*1.4-.7,
      deceptionBias:unit(item.profile.skills.pokerBluff),consistency:unit(item.profile.discipline),
      tellStyle:item.profile.skills.pokerBluff>.68?"bluffer":item.profile.discipline>.72?"guarded":item.profile.riskAppetite>.7?"open":"standard"},
  })));
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
    portraitAssetIds: {
      confident: character.portraits.pleased,
      neutral: character.portraits.neutral,
      uneasy: character.portraits.tense,
    },
    persona: {
      drawActivity: level(source.reorderActivity, 0.34, 0.62, 0.86),
      riskAppetite: clamp(level(source.decoyBias, 0.3, 0.52, 0.72) + (tellStyle === "bluffer" ? 0.08 : 0)),
      signalAttention: level(source.signalAttention, 0.34, 0.58, 0.82),
      signalTrust: source.counterRead === "literal" ? 0.75 : source.counterRead === "suspicious" ? -0.65 : 0.05,
      deceptionBias: clamp(level(invertHonesty(source), 0.18, 0.46, 0.72) + level(source.decoyBias, 0, 0.06, 0.12) + (tellStyle === "bluffer" ? 0.08 : 0)),
      consistency: consistency(source.consistency, 0.86, 0.66, 0.4),
      tellStyle,
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
