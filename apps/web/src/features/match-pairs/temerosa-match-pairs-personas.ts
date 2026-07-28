import type { MatchPairsPersona } from "@lucky-arcade/match-pairs";

/**
 * Frozen casino-game interpretations for match-pairs/0.4.
 *
 * These values are deliberately not calculated from old-maid behavior at
 * runtime. Changing another game's psychology must never rewrite this game's
 * deterministic history. They describe play style, not canonical IQ.
 */
export const TEMEROSA_MATCH_PAIRS_PERSONAS = {
  adesha: persona(5, .76, .78, .90, .78, "recheck", .86, 2),
  alger: persona(7, .88, .87, .94, .90, "recheck", .90, 3),
  anna: persona(4, .63, .62, .80, .48, "explore", .74, 1),
  apollyon: persona(6, .78, .80, .91, .82, "recheck", .86, 2),
  bche: persona(3, .58, .57, .78, .46, "mixed", .72, 1),
  camille: persona(5, .76, .75, .84, .55, "mixed", .78, 2),
  cicero: persona(6, .80, .80, .91, .84, "recheck", .86, 2),
  cradle: persona(5, .72, .74, .88, .68, "explore", .83, 2),
  deokbae: persona(5, .73, .76, .91, .82, "recheck", .88, 2),
  diamo: persona(3, .55, .56, .79, .45, "mixed", .73, 1),
  echo: persona(7, .86, .86, .93, .88, "explore", .91, 3),
  esther: persona(6, .80, .79, .92, .86, "recheck", .87, 2),
  hiro: persona(6, .82, .82, .90, .74, "mixed", .84, 2),
  katrinka: persona(7, .87, .86, .94, .89, "mixed", .92, 3),
  kreva: persona(5, .75, .77, .92, .85, "recheck", .89, 2),
  levillotte: persona(5, .69, .72, .83, .50, "explore", .76, 2),
  lilim: persona(5, .68, .73, .92, .84, "recheck", .88, 2),
  lyla: persona(7, .87, .88, .94, .91, "mixed", .92, 3),
  machina: persona(6, .81, .82, .92, .87, "explore", .90, 2),
  morsisa: persona(3, .56, .55, .78, .44, "explore", .72, 1),
  nemo: persona(4, .62, .61, .80, .47, "recheck", .73, 1),
  nieun: persona(7, .88, .88, .94, .92, "recheck", .91, 3),
  nostalgia: persona(6, .81, .83, .90, .72, "recheck", .84, 2),
  phaeo: persona(6, .79, .80, .92, .86, "mixed", .89, 2),
  raven: persona(7, .86, .87, .93, .90, "recheck", .90, 3),
  temute: persona(6, .82, .81, .93, .88, "explore", .90, 2),
  traver: persona(5, .74, .78, .89, .76, "recheck", .87, 2),
  ttaengchil: persona(3, .57, .58, .79, .43, "explore", .72, 1),
  "tumit-tu": persona(4, .66, .65, .82, .52, "mixed", .76, 1),
  yul: persona(4, .60, .60, .81, .49, "explore", .75, 1),
} as const satisfies Readonly<Record<string, MatchPairsPersona>>;

function persona(
  memoryCapacity: number, observationRate: number, recallAccuracy: number, memoryRetention: number,
  consistency: number, searchStyle: MatchPairsPersona["searchStyle"], streakComposure: number,
  difficultyTier: MatchPairsPersona["difficultyTier"],
): MatchPairsPersona {
  return { memoryCapacity, observationRate, recallAccuracy, memoryRetention, consistency, searchStyle, streakComposure, difficultyTier };
}
