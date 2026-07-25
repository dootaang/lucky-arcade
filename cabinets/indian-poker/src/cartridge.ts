import type { IndianPokerCartridge } from "./contracts.ts";

export const temerosaIndianPokerCartridge: IndianPokerCartridge = {
  contract: "indian-poker-cartridge/0.1", version: "temerosa-indian-poker/0.1", title: "테메로세 인디언 포커",
  characters: [
    { id: "pale", name: "페일", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-pale-standing", pleased: "review-pale-smirk", tense: "pale-angry" }, despairPortrait: "pale-sad" },
    { id: "kano", name: "카노", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-kano-standing", pleased: "kano-smile", tense: "review-kano-upset" }, despairPortrait: "kano-sad" },
    { id: "nemo", name: "네모", appearanceSet: "nemo-magical-girl", tellStyle: "bluffer", portraits: { neutral: "nemo-magical-neutral", pleased: "nemo-magical-smile", tense: "nemo-magical-tense" }, despairPortrait: "nemo-magical-despair" },
  ],
};
