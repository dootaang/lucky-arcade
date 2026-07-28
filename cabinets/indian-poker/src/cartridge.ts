import type { IndianPokerCartridge, IndianPokerCharacter } from "./contracts.ts";

export function createTemerosaIndianPokerCartridge(characters: readonly IndianPokerCharacter[]): IndianPokerCartridge {
  return { contract: "indian-poker-cartridge/0.3", version: "temerosa-indian-poker/0.4", title: "테메로세 인디언 포커", characters: [...characters] };
}

/** Small fixture cartridge; the web app replaces it with the audited 30-person roster. */
export const temerosaIndianPokerCartridge = createTemerosaIndianPokerCartridge([
  { id: "pale", name: "페일", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-pale-standing", pleased: "review-pale-smirk", tense: "pale-angry" }, despairPortrait: "pale-sad", persona: { aggression: .74, bluffFrequency: .14, slowPlay: .1, estimationNoise: .05, tellReliability: .9, tiltResponse: .3 } },
]);
