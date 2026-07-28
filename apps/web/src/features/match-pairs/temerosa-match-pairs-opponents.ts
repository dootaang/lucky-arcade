import type { MatchPairsOpponent } from "@lucky-arcade/match-pairs";
import { type OldMaidCharacter, type TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";
import { TEMEROSA_MATCH_PAIRS_PERSONAS } from "./temerosa-match-pairs-personas.ts";

/**
 * Joins audited presentation assets to the frozen match-pairs persona contract.
 */
export function createTemerosaMatchPairsOpponents(contentAssets: readonly TemerosaCasinoPortraitAsset[]): readonly MatchPairsOpponent[] {
  return createTemerosaCasinoRoster(contentAssets).map(toOpponent);
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
