import type { OldMaidBehaviorProfile, OldMaidTellStyle } from "./contracts.ts";

/** Owner-approved gameplay interpretations; these are not claims of literal CHARX fields. */
export const TEMEROSA_CASINO_TELL_STYLES: Readonly<Record<string, OldMaidTellStyle>> = {
  adesha: "guarded", anna: "open", apollyon: "guarded", bche: "open",
  camille: "bluffer", cicero: "guarded", cradle: "open", deokbae: "guarded",
  diamo: "standard", echo: "open", esther: "bluffer", hiro: "guarded",
  katrinka: "guarded", kreva: "guarded", levillotte: "bluffer", lilim: "open",
  machina: "open", morsisa: "open", nostalgia: "guarded", phaeo: "guarded",
  raven: "bluffer", temute: "open", traver: "guarded", ttaengchil: "open",
  "tumit-tu": "open", yul: "standard",
};

/**
 * Discrete, owner-approved gameplay interpretations derived from the four CHARX
 * character sheets. They describe table behaviour, not literal character facts.
 * The compact vocabulary prevents unsupported per-character probability tuning.
 */
export const TEMEROSA_CASINO_BEHAVIOR_PROFILES: Readonly<Record<string, OldMaidBehaviorProfile>> = {
  pale: profile("high", "high", "low", "adaptive", "center", "high", "literal"),
  kano: profile("low", "low", "high", "steady", "edge", "high", "suspicious"),
  nemo: profile("high", "low", "high", "erratic", "right", "medium", "suspicious"),
  bacikal: profile("high", "high", "low", "adaptive", "none", "high", "literal"),
  alger: profile("low", "medium", "medium", "steady", "edge", "high", "suspicious"),
  nieun: profile("low", "low", "high", "steady", "center", "high", "suspicious"),
  lyla: profile("medium", "low", "high", "steady", "center", "high", "suspicious"),
  riel: profile("high", "high", "low", "adaptive", "left", "medium", "literal"),
  wares: profile("medium", "low", "high", "steady", "edge", "high", "suspicious"),

  adesha: profile("low", "medium", "low", "steady", "right", "high", "literal"),
  anna: profile("high", "high", "low", "erratic", "none", "medium", "literal"),
  apollyon: profile("low", "low", "medium", "steady", "center", "high", "suspicious"),
  bche: profile("medium", "high", "medium", "erratic", "edge", "medium", "mixed"),
  camille: profile("high", "low", "high", "erratic", "edge", "high", "suspicious"),
  cicero: profile("medium", "medium", "high", "steady", "right", "high", "suspicious"),
  cradle: profile("high", "high", "low", "adaptive", "left", "medium", "literal"),
  deokbae: profile("low", "medium", "low", "steady", "none", "high", "suspicious"),
  diamo: profile("medium", "medium", "medium", "erratic", "center", "low", "mixed"),
  echo: profile("high", "high", "low", "steady", "left", "high", "literal"),
  esther: profile("medium", "low", "high", "steady", "center", "high", "suspicious"),
  hiro: profile("low", "medium", "high", "adaptive", "edge", "high", "suspicious"),
  katrinka: profile("medium", "medium", "high", "steady", "right", "high", "suspicious"),
  kreva: profile("low", "medium", "low", "steady", "center", "high", "literal"),
  levillotte: profile("high", "low", "high", "erratic", "left", "medium", "suspicious"),
  lilim: profile("medium", "high", "low", "steady", "center", "low", "literal"),
  machina: profile("medium", "high", "low", "steady", "right", "high", "literal"),
  morsisa: profile("low", "high", "low", "erratic", "none", "low", "literal"),
  nostalgia: profile("medium", "low", "high", "adaptive", "center", "high", "suspicious"),
  phaeo: profile("low", "medium", "high", "steady", "edge", "high", "suspicious"),
  raven: profile("medium", "low", "high", "steady", "right", "high", "suspicious"),
  temute: profile("medium", "high", "low", "steady", "left", "high", "literal"),
  traver: profile("low", "low", "high", "adaptive", "edge", "high", "suspicious"),
  ttaengchil: profile("high", "high", "low", "erratic", "none", "low", "literal"),
  "tumit-tu": profile("high", "high", "medium", "erratic", "center", "medium", "literal"),
  yul: profile("high", "medium", "medium", "erratic", "left", "low", "mixed"),
};

function profile(
  reorderActivity: OldMaidBehaviorProfile["reorderActivity"],
  jokerHonesty: OldMaidBehaviorProfile["jokerHonesty"],
  decoyBias: OldMaidBehaviorProfile["decoyBias"],
  consistency: OldMaidBehaviorProfile["consistency"],
  positionHabit: OldMaidBehaviorProfile["positionHabit"],
  signalAttention: OldMaidBehaviorProfile["signalAttention"],
  counterRead: OldMaidBehaviorProfile["counterRead"],
): OldMaidBehaviorProfile {
  return { reorderActivity, jokerHonesty, decoyBias, consistency, positionHabit, signalAttention, counterRead };
}
