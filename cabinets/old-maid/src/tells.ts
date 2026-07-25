import { expressSignal } from "@lucky-arcade/engine";
import type { OldMaidCartridge, OldMaidReaction, OldMaidSeatId, OldMaidState, OldMaidTellStyle } from "./contracts.ts";
import { characterIdForSeat, targetSeat } from "./engine.ts";

/**
 * Selects a deterministic display-only reaction from current public pressure
 * and the character's private knowledge. It never mutates OldMaidState, so
 * ambient tells do not alter receipts or saved result hashes.
 */
export function selectAmbientReaction(cartridge: OldMaidCartridge, state: OldMaidState, seatId: OldMaidSeatId): OldMaidReaction {
  if (state.status !== "playing") return "neutral";
  const characterId = characterIdForSeat(state, seatId);
  const character = cartridge.characters.find((candidate) => candidate.id === characterId);
  if (!character || state.hands[seatId].length === 0) return "neutral";
  const holdsJoker = state.hands[seatId].some((cardId) => cartridge.cards.find((card) => card.id === cardId)?.faceId === cartridge.oddFaceId);
  const nextTarget = targetSeat(state) === seatId;
  const activeSeatCount = Object.values(state.hands).filter((hand) => hand.length > 0).length;
  const fact = holdsJoker && nextTarget ? "joker-exposed"
    : holdsJoker ? "holds-joker"
      : state.hands[seatId].length <= 2 ? "near-empty"
        : activeSeatCount <= 2 ? "final-two"
          : "steady";
  const truth: OldMaidReaction = fact === "near-empty" ? "pleased" : fact === "steady" ? "neutral" : "tense";
  if (truth === "neutral") return truth;
  const deceptive: OldMaidReaction = truth === "tense" ? "pleased" : "tense";
  return expressSignal(truth, "neutral", deceptive, reactionWeights(character.tellStyle), `${state.seed}:ambient:${state.turn}:${seatId}:${fact}`);
}

export function reactionWeights(style: OldMaidTellStyle): { truth: number; neutral: number; deceptive: number } {
  if (style === "open") return { truth: 80, neutral: 20, deceptive: 0 };
  if (style === "guarded") return { truth: 45, neutral: 55, deceptive: 0 };
  if (style === "bluffer") return { truth: 30, neutral: 30, deceptive: 40 };
  return { truth: 45, neutral: 55, deceptive: 0 };
}
