import type { IndianPokerPersona } from "@lucky-arcade/indian-poker";

/**
 * Frozen Indian-poker-specific table behaviour. These values are copied data,
 * not a runtime projection of another cabinet's persona contract.
 */
export const TEMEROSA_INDIAN_POKER_PERSONAS: Readonly<Record<string, IndianPokerPersona>> = {
  adesha: persona(.3,.16,.12,.04,.88,.12), alger: persona(.3,.4,.28,.04,.62,.12),
  anna: persona(.78,.16,.12,.11,.88,.68), apollyon: persona(.3,.4,.28,.04,.62,.12),
  bche: persona(.55,.4,.28,.11,.62,.68), camille: persona(.78,.68,.46,.04,.34,.68),
  cicero: persona(.55,.68,.46,.04,.34,.12), cradle: persona(.78,.16,.12,.11,.88,.35),
  deokbae: persona(.3,.16,.12,.04,.88,.12), diamo: persona(.55,.4,.28,.2,.62,.68),
  echo: persona(.78,.16,.12,.04,.88,.12), esther: persona(.55,.68,.46,.04,.34,.12),
  hiro: persona(.3,.68,.46,.04,.34,.35), katrinka: persona(.55,.68,.46,.04,.34,.12),
  kreva: persona(.3,.16,.12,.04,.88,.12), levillotte: persona(.78,.68,.46,.11,.34,.68),
  lilim: persona(.55,.16,.12,.2,.88,.12), lyla: persona(.55,.68,.46,.04,.34,.12),
  machina: persona(.55,.16,.12,.04,.88,.12), morsisa: persona(.3,.16,.12,.2,.88,.68),
  nemo: persona(.78,.68,.46,.11,.34,.68), nieun: persona(.3,.68,.46,.04,.34,.12),
  nostalgia: persona(.55,.68,.46,.04,.34,.35), phaeo: persona(.3,.68,.46,.04,.34,.12),
  raven: persona(.55,.68,.46,.04,.34,.12), temute: persona(.55,.16,.12,.04,.88,.12),
  traver: persona(.3,.68,.46,.04,.34,.35), ttaengchil: persona(.78,.16,.12,.2,.88,.68),
  "tumit-tu": persona(.78,.4,.28,.11,.62,.68), yul: persona(.78,.4,.28,.2,.62,.68),
};

function persona(aggression:number,bluffFrequency:number,slowPlay:number,estimationNoise:number,tellReliability:number,tiltResponse:number):IndianPokerPersona{return Object.freeze({aggression,bluffFrequency,slowPlay,estimationNoise,tellReliability,tiltResponse});}
