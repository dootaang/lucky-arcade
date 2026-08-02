import { createTemerosaIndianPokerCartridge, type IndianPokerCharacter } from "@lucky-arcade/indian-poker";
import type { OldMaidCharacter, TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";
import { createTemerosaCasinoRoster } from "../../lib/temerosa-casino-roster.ts";
import { TEMEROSA_INDIAN_POKER_PERSONAS } from "./temerosa-indian-poker-personas.ts";
import { type SeriesGameNpcPresentation, unit } from "../../lib/temerosa-series-game-roster.ts";

export function buildTemerosaIndianPokerCartridge(contentAssets: readonly TemerosaCasinoPortraitAsset[]) {
  const characters = createTemerosaCasinoRoster(contentAssets).map(toIndianPokerCharacter);
  return createTemerosaIndianPokerCartridge(characters);
}

export function buildTemerosaSeriesIndianPokerCartridge(roster:readonly SeriesGameNpcPresentation[]){
  return createTemerosaIndianPokerCartridge(roster.map((item):IndianPokerCharacter=>({
    id:item.id,name:item.name,appearanceSet:item.id.split(":")[1]??"casino",
    tellStyle:item.profile.skills.pokerBluff>.65?"bluffer":item.profile.discipline>.72?"guarded":"standard",
    portraits:{neutral:item.assetIds.neutral,pleased:item.assetIds.pleased,tense:item.assetIds.tense},despairPortrait:item.assetIds.despair,
    persona:{aggression:unit((item.profile.riskAppetite+item.profile.winPressing)/2),bluffFrequency:unit(item.profile.skills.pokerBluff),
      slowPlay:unit(item.profile.discipline*.55),estimationNoise:unit((1-item.profile.skills.pokerRead)*.24),
      tellReliability:unit(.3+item.profile.discipline*.6),tiltResponse:unit((item.profile.lossChasing+item.profile.riskAppetite)/2)},
  })));
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
