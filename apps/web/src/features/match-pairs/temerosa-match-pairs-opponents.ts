import type { MatchPairsOpponent } from "@lucky-arcade/match-pairs";
import { type OldMaidCharacter, type TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";
import { TEMEROSA_MATCH_PAIRS_PERSONAS } from "./temerosa-match-pairs-personas.ts";
import { type SeriesGameNpcPresentation, unit } from "../../lib/temerosa-series-game-roster.ts";

/**
 * Joins audited presentation assets to the frozen match-pairs persona contract.
 */
export function createTemerosaMatchPairsOpponents(contentAssets: readonly TemerosaCasinoPortraitAsset[]): readonly MatchPairsOpponent[] {
  return createTemerosaCasinoRoster(contentAssets).map(toOpponent);
}

export function createTemerosaSeriesMatchPairsOpponents(roster:readonly SeriesGameNpcPresentation[]):readonly MatchPairsOpponent[]{
  return Object.freeze(roster.map((item):MatchPairsOpponent=>{
    const memory=unit(item.profile.skills.matchPairsMemory),discipline=unit(item.profile.discipline);
    const tier:1|2|3=memory>.76?3:memory>.52?2:1;
    return {id:item.id,name:item.name,portraits:{neutral:item.assetIds.neutral,pleased:item.assetIds.pleased,tense:item.assetIds.tense},despairPortrait:item.assetIds.despair,
      memoryCapacity:tier===3?7:tier===2?5:3,observationRate:unit(.42+memory*.55),recallAccuracy:unit(.38+memory*.58),
      memoryRetention:unit(.64+discipline*.32),consistency:unit(.38+discipline*.58),searchStyle:discipline>.7?"recheck":item.profile.riskAppetite>.68?"explore":"mixed",
      streakComposure:unit(.55+discipline*.4),difficultyTier:tier,winCreditMultiplier:tier===3?2.5:tier===2?2:1.5};
  }));
}

function toOpponent(character: OldMaidCharacter): MatchPairsOpponent {
  const profile = TEMEROSA_MATCH_PAIRS_PERSONAS[character.id as keyof typeof TEMEROSA_MATCH_PAIRS_PERSONAS];
  if (!profile) throw new Error(`match_pairs_persona_missing:${character.id}`);
  return {
    id: character.id,
    name: character.name,
    portraits: { ...character.portraits },
    despairPortrait: character.despairPortrait,
    ...profile,
    winCreditMultiplier: profile.difficultyTier === 3 ? 2.5 : profile.difficultyTier === 2 ? 2 : 1.5,
  };
}
