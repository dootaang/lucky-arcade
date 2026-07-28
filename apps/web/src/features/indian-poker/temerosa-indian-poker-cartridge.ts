import { createTemerosaIndianPokerCartridge, type IndianPokerCharacter } from "@lucky-arcade/indian-poker";
import type { OldMaidCharacter, TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";
import { TEMEROSA_INDIAN_POKER_PERSONAS } from "./temerosa-indian-poker-personas.ts";

export function buildTemerosaIndianPokerCartridge(contentAssets: readonly TemerosaCasinoPortraitAsset[]) {
  const characters = createTemerosaCasinoRoster(contentAssets).map(toIndianPokerCharacter);
  return createTemerosaIndianPokerCartridge(characters);
}

function toIndianPokerCharacter(character: OldMaidCharacter): IndianPokerCharacter {
  const persona = TEMEROSA_INDIAN_POKER_PERSONAS[character.id];
  if (!persona) throw new Error(`indian_poker_persona_missing:${character.id}`);
  return {
    id: character.id, name: character.name, appearanceSet: character.appearanceSet,
    tellStyle: character.tellStyle === "standard" ? "guarded" : character.tellStyle,
    portraits: { ...character.portraits }, despairPortrait: character.despairPortrait, persona,
  };
}
