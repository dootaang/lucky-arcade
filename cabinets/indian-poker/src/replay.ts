import { standardRankValue } from "@lucky-arcade/card-table";
import { XorShift32, resultHash } from "@lucky-arcade/engine";
import { createIndianPokerState, reduceIndianPoker } from "./engine.ts";
import type {
  IndianPokerAction, IndianPokerCartridge, IndianPokerCharacter, IndianPokerPlayerDecision,
  IndianPokerRoundCount, IndianPokerState,
} from "./contracts.ts";

export const INDIAN_POKER_SPECTATOR_REPLAY_CONTRACT = "indian-poker-spectator-replay/0.1" as const;

export interface IndianPokerSpectatorFrame {
  readonly action: IndianPokerAction;
  readonly state: IndianPokerState;
}

export interface IndianPokerSpectatorReplay {
  readonly contract: typeof INDIAN_POKER_SPECTATOR_REPLAY_CONTRACT;
  readonly participantIds: readonly [string, string];
  readonly seed: string;
  readonly roundCount: IndianPokerRoundCount;
  readonly frames: readonly IndianPokerSpectatorFrame[];
  readonly finalState: IndianPokerState;
  readonly winningCharacterId: string | "draw";
  readonly resultHash: string;
}

/** Canonical NPC-v-NPC match. The stored player seat is controlled by the first NPC. */
export function createIndianPokerSpectatorReplay(input: {
  cartridge: IndianPokerCartridge;
  participantIds: readonly [string, string];
  seed: string;
  roundCount?: IndianPokerRoundCount;
  captureFrames?: boolean;
}): IndianPokerSpectatorReplay {
  const [leftId, rightId] = input.participantIds;
  if (leftId === rightId) throw new Error("indian_poker_replay_duplicate_participant");
  const left = character(input.cartridge, leftId), right = character(input.cartridge, rightId);
  const roundCount = input.roundCount ?? 7;
  let state = createIndianPokerState(input.cartridge, input.seed, right.id, `side-market:${input.seed}`, roundCount);
  const frames: IndianPokerSpectatorFrame[] = [];
  const apply = (action: IndianPokerAction) => {
    state = reduceIndianPoker(input.cartridge, state, action);
    if (input.captureFrames !== false) frames.push(Object.freeze({ action, state }));
  };
  apply({ type: "start", seed: input.seed, stake: 10, wagerId: `spectator:${input.seed}`, roundCount });
  let guard = 0;
  while (state.status !== "complete") {
    if (++guard > 256) throw new Error("indian_poker_replay_did_not_complete");
    if (state.status === "player-action") apply({ type: "player-act", decision: chooseLeftDecision(state, left) });
    else if (state.status === "npc-action") apply({ type: "npc-act" });
    else if (state.status === "showdown") apply({ type: "next-round" });
    else throw new Error(`indian_poker_replay_action_missing:${state.status}`);
  }
  const winningCharacterId = state.outcome === "player" ? left.id : state.outcome === "npc" ? right.id : "draw";
  const hash = resultHash({ contract: INDIAN_POKER_SPECTATOR_REPLAY_CONTRACT, participantIds: input.participantIds, seed: input.seed,
    roundCount, actions: frames.map((frame) => frame.action), finalStateHash: resultHash(state) });
  return Object.freeze({ contract: INDIAN_POKER_SPECTATOR_REPLAY_CONTRACT, participantIds: Object.freeze([left.id, right.id]) as readonly [string,string],
    seed: input.seed, roundCount, frames: Object.freeze(frames), finalState: state, winningCharacterId, resultHash: hash });
}

/** Legal decision for the NPC occupying the persisted player seat; it sees only the other forehead card. */
export function chooseIndianPokerSpectatorPlayerDecision(state: IndianPokerState, characterValue: IndianPokerCharacter): IndianPokerPlayerDecision {
  return chooseLeftDecision(state, characterValue);
}

function chooseLeftDecision(state: IndianPokerState, value: IndianPokerCharacter): IndianPokerPlayerDecision {
  if (state.status !== "player-action" || !state.npcCardId) throw new Error("indian_poker_replay_player_turn_invalid");
  const rng = new XorShift32(`${state.seed}:spectator-left:${value.id}:${state.sequence}`);
  const visibleRank = standardRankValue(state.npcCardId);
  const previouslySeen = new Set(state.history.flatMap((round) => [round.playerCardId, round.npcCardId]));
  const possibleRanks = Array.from({ length: 13 }, (_, index) => index + 2).flatMap((rank) => Array.from({ length: 4 }, () => rank));
  const seenCounts = new Map<number, number>();
  for (const card of previouslySeen) seenCounts.set(standardRankValue(card), (seenCounts.get(standardRankValue(card)) ?? 0) + 1);
  seenCounts.set(visibleRank, (seenCounts.get(visibleRank) ?? 0) + 1);
  const unknown = possibleRanks.filter((rank) => (seenCounts.get(rank) ?? 0) < 4);
  const chance = unknown.filter((rank) => rank > visibleRank).length / Math.max(1, unknown.length)
    + unknown.filter((rank) => rank === visibleRank).length / Math.max(1, unknown.length) * .5;
  const noisy = Math.max(0, Math.min(1, chance + (rng.next() * 2 - 1) * value.persona.estimationNoise));
  const facingBet = state.roundMoves.at(-1)?.seatId === "npc" && state.roundMoves.at(-1)?.kind === "bet";
  if (facingBet) {
    const callLine = .38 + state.currentBet * .08 - value.persona.aggression * .12 - value.persona.tiltResponse * (state.playerChips < state.npcChips ? .05 : 0);
    return noisy + rng.next() * .08 >= callLine && state.playerChips >= state.currentBet ? { kind: "call" } : { kind: "fold" };
  }
  const bluff = noisy < .38 && rng.next() < value.persona.bluffFrequency * .34;
  const valueBet = noisy > .57 - value.persona.aggression * .12 && rng.next() > value.persona.slowPlay * .35;
  if ((bluff || valueBet) && state.playerChips > 0) return { kind: "bet", amount: state.playerChips >= 2 && rng.next() < value.persona.aggression ? 2 : 1 };
  return { kind: "check" };
}

function character(cartridge: IndianPokerCartridge, id: string): IndianPokerCharacter {
  const found = cartridge.characters.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`indian_poker_replay_participant_missing:${id}`);
  return found;
}
