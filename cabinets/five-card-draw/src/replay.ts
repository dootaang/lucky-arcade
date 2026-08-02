import { resultHash } from "@lucky-arcade/engine";
import type { StandardCardId } from "@lucky-arcade/card-table";
import {
  FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS,
  type FiveCardDrawAction, type FiveCardDrawBetAction, type FiveCardDrawContext, type FiveCardDrawOpponent,
  type FiveCardDrawSeatId, type FiveCardDrawState,
} from "./contracts.ts";
import { createFiveCardDrawState, fiveCardDrawNpcTells, reduceFiveCardDraw } from "./game.ts";
import { chooseNpcBetAction, decideNpcDraw } from "./npc.ts";
import {
  continueFiveCardDrawSeries, createFiveCardDrawSeries, fiveCardDrawSeriesStats, recordFiveCardDrawSeriesHand,
  type FiveCardDrawSeriesLength, type FiveCardDrawSeriesState,
} from "./series.ts";

export const FIVE_CARD_DRAW_SPECTATOR_REPLAY_CONTRACT = "five-card-draw-spectator-replay/0.1" as const;

export interface FiveCardDrawSpectatorFrame {
  readonly handNumber: number;
  readonly action: FiveCardDrawAction;
  readonly state: FiveCardDrawState;
  readonly series: FiveCardDrawSeriesState;
}

export interface FiveCardDrawSpectatorReplay {
  readonly contract: typeof FIVE_CARD_DRAW_SPECTATOR_REPLAY_CONTRACT;
  readonly participantIds: readonly string[];
  readonly seed: string;
  readonly frames: readonly FiveCardDrawSpectatorFrame[];
  readonly finalState: FiveCardDrawState;
  readonly series: FiveCardDrawSeriesState;
  readonly winningCharacterId: string | "draw";
  readonly resultHash: string;
}

/** Runs the native 2-4 seat reducer while an NPC controls the persisted player seat. */
export function createFiveCardDrawSpectatorReplay(input: {
  participants: readonly FiveCardDrawOpponent[];
  seed: string;
  targetHands?: FiveCardDrawSeriesLength;
  captureFrames?: boolean;
}): FiveCardDrawSpectatorReplay {
  if (input.participants.length < 2 || input.participants.length > 4 || new Set(input.participants.map((item) => item.id)).size !== input.participants.length) {
    throw new Error("five_card_draw_replay_participants_invalid");
  }
  const [bottom, ...opponents] = input.participants;
  const context: FiveCardDrawContext = { sessionId: `side-market:${input.seed}`, opponents };
  const targetHands = input.targetHands ?? 3;
  let state = createFiveCardDrawState(context), series = createFiveCardDrawSeries(context, targetHands, 10);
  const frames: FiveCardDrawSpectatorFrame[] = [], actions: Array<{ handNumber: number; action: FiveCardDrawAction }> = [];
  let handNumber = 1;
  const apply = (action: FiveCardDrawAction) => {
    state = reduceFiveCardDraw(state, action);
    actions.push({ handNumber, action });
    if (input.captureFrames !== false) frames.push(Object.freeze({ handNumber, action, state, series }));
  };
  apply({ type: "start", seed: `${input.seed}:hand:${handNumber}`, stake: 10 });
  let guard = 0;
  while (series.status !== "complete") {
    if (++guard > 1_024) throw new Error("five_card_draw_replay_did_not_complete");
    if (state.phase !== "complete") {
      const actor = state.currentActorId;
      if (!actor) throw new Error("five_card_draw_replay_actor_missing");
      if (actor !== "player") apply({ type: "advance" });
      else if (state.phase === "drawing") apply({ type: "exchange", cardIds: playerDraw(state, bottom!) });
      else apply({ type: "bet", action: playerBet(state, bottom!) });
      continue;
    }
    series = recordFiveCardDrawSeriesHand(series, state);
    if (series.status === "complete") break;
    series = continueFiveCardDrawSeries(series);
    handNumber += 1;
    apply({ type: "reset" });
    apply({ type: "start", seed: `${input.seed}:hand:${handNumber}`, stake: 10 });
  }
  const stats = fiveCardDrawSeriesStats(series, context);
  const leaders = stats.standings.filter((standing) => standing.rank === 1);
  const winningCharacterId = leaders.length === 1 ? participantIdForSeat(input.participants, leaders[0]!.seatId) : "draw";
  return Object.freeze({ contract: FIVE_CARD_DRAW_SPECTATOR_REPLAY_CONTRACT,
    participantIds: Object.freeze(input.participants.map((item) => item.id)), seed: input.seed, frames: Object.freeze(frames),
    finalState: state, series, winningCharacterId,
    resultHash: resultHash({ contract: FIVE_CARD_DRAW_SPECTATOR_REPLAY_CONTRACT, participantIds: input.participants.map((item) => item.id),
      seed: input.seed, actions, summaries: series.summaries }),
  });
}

function playerDraw(state: FiveCardDrawState, player: FiveCardDrawOpponent): readonly StandardCardId[] {
  return decideNpcDraw({ hand: state.hands.player, visibleExchangeCounts: state.exchangeCounts,
    activeSeatCount: state.activeSeatIds.length, persona: player.persona, seed: `${state.seed}:${state.sequence}:player:draw` }).discardCardIds;
}

function playerBet(state: FiveCardDrawState, player: FiveCardDrawOpponent): FiveCardDrawBetAction {
  if (state.phase !== "opening-bet" && state.phase !== "closing-bet") throw new Error("five_card_draw_replay_phase_invalid");
  const action = chooseNpcBetAction({ seatId: "player", hand: state.hands.player, phase: state.phase,
    activeSeatCount: state.activeSeatIds.length, ownContributionUnits: state.streetContributionsUnits.player,
    currentBetUnits: state.currentBetUnits, potUnits: Object.values(state.contributionsUnits).reduce((sum, value) => sum + value, 0),
    visibleExchangeCounts: state.exchangeCounts, visibleTells: fiveCardDrawNpcTells(state), betHistory: state.betHistory,
    persona: player.persona, planSeed: `${state.seed}:player:plan`, seed: `${state.seed}:${state.sequence}:player:bet` });
  const toCall = state.currentBetUnits - state.streetContributionsUnits.player;
  const legal: FiveCardDrawBetAction[] = toCall > 0
    ? state.currentBetUnits < 3 ? ["fold", "call", "raise"] : ["fold", "call"]
    : state.currentBetUnits === 0 ? ["check", "bet"] : state.currentBetUnits < 3 ? ["check", "raise"] : ["check"];
  if (legal.includes(action) && state.contributionsUnits.player < FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS) return action;
  return toCall > 0 ? "call" : "check";
}

function participantIdForSeat(participants: readonly FiveCardDrawOpponent[], seatId: FiveCardDrawSeatId): string {
  if (seatId === "player") return participants[0]!.id;
  return participants[Number(seatId.slice(-1))]?.id ?? "draw";
}
