import { STANDARD_CARD_DECK, shuffledStandardDeck, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import { XorShift32, expressSignal, weightedChoice } from "@lucky-arcade/engine";
import { expressionRead, npcRead, type IndianPokerNpcRead } from "./read.ts";
import {
  INDIAN_POKER_ROUNDS,
  INDIAN_POKER_STARTING_CHIPS,
  INDIAN_POKER_STATE_CONTRACT,
  INDIAN_POKER_STAKES,
  INDIAN_POKER_VERSION,
  type IndianPokerAction,
  type IndianPokerCartridge,
  type IndianPokerCharacter,
  type IndianPokerOutcome,
  type IndianPokerPersona,
  type IndianPokerPlayerAction,
  type IndianPokerRoundResult,
  type IndianPokerState,
} from "./contracts.ts";

export function createIndianPokerState(cartridge: IndianPokerCartridge, seed: string, opponentId = cartridge.characters[0]?.id ?? "", sessionId = "indian-poker:heads-up-1"): IndianPokerState {
  validateCartridge(cartridge);
  findCharacter(cartridge, opponentId);
  assert(seed.length > 0, "indian_poker_seed_invalid");
  return {
    contract: INDIAN_POKER_STATE_CONTRACT, version: INDIAN_POKER_VERSION, packVersion: cartridge.version, sessionId, seed, sequence: 0,
    status: "ready", opponentId, round: 0, deck: [], cursor: 0, playerCardId: null, npcCardId: null, npcOpening: null,
    playerAction: null, npcResponse: null, npcReaction: "neutral", playerChips: INDIAN_POKER_STARTING_CHIPS,
    npcChips: INDIAN_POKER_STARTING_CHIPS, roundStartPlayerChips: INDIAN_POKER_STARTING_CHIPS,
    roundStartNpcChips: INDIAN_POKER_STARTING_CHIPS, pot: 0, history: [], stake: null, wagerId: null, creditAmount: 0, outcome: null,
  };
}

export function reduceIndianPoker(cartridge: IndianPokerCartridge, state: IndianPokerState, action: IndianPokerAction): IndianPokerState {
  validateCartridge(cartridge);
  const opponent = findCharacter(cartridge, state.opponentId);
  if (action.type === "select-opponent") {
    assert(state.status === "ready", "indian_poker_opponent_selection_invalid");
    findCharacter(cartridge, action.opponentId);
    return { ...state, sequence: state.sequence + 1, opponentId: action.opponentId };
  }
  if (action.type === "random-opponent") {
    assert(state.status === "ready", "indian_poker_opponent_selection_invalid");
    const candidates = cartridge.characters.filter((character) => cartridge.characters.length === 1 || character.id !== state.opponentId).sort((left, right) => left.id.localeCompare(right.id));
    const selected = candidates[new XorShift32(`${state.seed}:opponent:${state.sequence}`).nextUint32() % candidates.length];
    assert(selected, "indian_poker_character_missing");
    return { ...state, sequence: state.sequence + 1, opponentId: selected.id };
  }
  if (action.type === "restart") return { ...createIndianPokerState(cartridge, action.seed, state.opponentId, state.sessionId), sequence: state.sequence + 1 };
  if (action.type === "start") {
    assert(state.status === "ready" && action.seed.length > 0 && action.wagerId.length > 0 && INDIAN_POKER_STAKES.includes(action.stake), "indian_poker_start_invalid");
    const started = { ...state, sequence: state.sequence + 1, seed: action.seed, deck: shuffledStandardDeck(`${action.seed}:deck`), cursor: 0, round: 0, history: [], playerChips: INDIAN_POKER_STARTING_CHIPS, npcChips: INDIAN_POKER_STARTING_CHIPS, stake: action.stake, wagerId: action.wagerId, outcome: null, creditAmount: 0 };
    return dealRound(started, opponent, 1);
  }
  if (action.type === "player-act") return playerAct(state, opponent, action.action);
  if (action.type === "npc-respond") return npcRespond(state, opponent);
  if (action.type === "next-round") {
    assert(state.status === "showdown", "indian_poker_next_round_invalid");
    const sequenced = { ...state, sequence: state.sequence + 1 };
    return shouldComplete(sequenced) ? completeMatch(sequenced) : dealRound(sequenced, opponent, state.round + 1);
  }
  throw new Error("indian_poker_action_invalid");
}

export function decideNpcOpening(persona: IndianPokerPersona, read: IndianPokerNpcRead, seed: string): "check" | "raise" {
  const edge = estimatedNpcEdge(persona, read, seed);
  const confidence = 0.52 + persona.consistency * 0.4;
  return weightedChoice(edge > 0.08 ? [confidence, 1 - confidence] : [1 - confidence, confidence], `${seed}:opening`) === 0 ? "raise" : "check";
}

export function decideNpcResponse(persona: IndianPokerPersona, read: IndianPokerNpcRead, seed: string): "call" | "fold" {
  const bluffPressure = Math.min(0.12, read.playerRaises * 0.025) - Math.min(0.08, read.playerFolds * 0.02);
  const edge = estimatedNpcEdge(persona, read, seed) - bluffPressure;
  const confidence = 0.55 + persona.consistency * 0.35;
  return weightedChoice(edge >= -0.06 ? [confidence, 1 - confidence] : [1 - confidence, confidence], `${seed}:response`) === 0 ? "call" : "fold";
}

export function indianPokerOutcome(state: IndianPokerState): Exclude<IndianPokerOutcome, null> {
  return state.playerChips > state.npcChips ? "player" : state.npcChips > state.playerChips ? "npc" : "draw";
}

export function indianPokerRanking(state: IndianPokerState): Array<{ seatId: "player" | "npc"; rank: number; chips: number }> {
  if (state.playerChips === state.npcChips) return [{ seatId: "player", rank: 1, chips: state.playerChips }, { seatId: "npc", rank: 1, chips: state.npcChips }];
  return state.playerChips > state.npcChips
    ? [{ seatId: "player", rank: 1, chips: state.playerChips }, { seatId: "npc", rank: 2, chips: state.npcChips }]
    : [{ seatId: "npc", rank: 1, chips: state.npcChips }, { seatId: "player", rank: 2, chips: state.playerChips }];
}

function dealRound(state: IndianPokerState, opponent: IndianPokerCharacter, round: number): IndianPokerState {
  assert(state.playerChips > 0 && state.npcChips > 0 && state.cursor + 1 < state.deck.length, "indian_poker_deal_invalid");
  const playerCardId = state.deck[state.cursor], npcCardId = state.deck[state.cursor + 1];
  assert(playerCardId && npcCardId, "indian_poker_deal_invalid");
  const base: IndianPokerState = {
    ...state, round, status: "player-action", cursor: state.cursor + 2, playerCardId, npcCardId,
    playerChips: state.playerChips - 1, npcChips: state.npcChips - 1,
    roundStartPlayerChips: state.playerChips, roundStartNpcChips: state.npcChips, pot: 2,
    npcOpening: null, playerAction: null, npcResponse: null, npcReaction: "neutral",
  };
  const opening = opponent.persona && base.npcChips > 0 ? decideNpcOpening(opponent.persona, npcRead(base), `${state.seed}:round:${round}`) : "check";
  const afterOpening = opening === "raise" ? { ...base, npcChips: base.npcChips - 1, pot: base.pot + 1 } : base;
  return { ...afterOpening, npcOpening: opening, npcReaction: reactionForPlayerCard(afterOpening, opponent) };
}

function playerAct(state: IndianPokerState, opponent: IndianPokerCharacter, action: IndianPokerPlayerAction): IndianPokerState {
  assert(state.status === "player-action" && state.playerCardId && state.npcCardId && state.npcOpening, "indian_poker_player_action_invalid");
  if (state.npcOpening === "raise") {
    assert(action === "call" || action === "fold", "indian_poker_player_action_invalid");
    if (action === "fold") return awardPot({ ...state, sequence: state.sequence + 1, playerAction: action }, "npc");
    assert(state.playerChips > 0, "indian_poker_chips_insufficient");
    return showdown({ ...state, sequence: state.sequence + 1, playerAction: action, playerChips: state.playerChips - 1, pot: state.pot + 1 });
  }
  assert(action === "check" || action === "raise", "indian_poker_player_action_invalid");
  if (action === "check") return showdown({ ...state, sequence: state.sequence + 1, playerAction: action });
  assert(state.playerChips > 0, "indian_poker_chips_insufficient");
  return { ...state, sequence: state.sequence + 1, status: "npc-response", playerAction: action, playerChips: state.playerChips - 1, pot: state.pot + 1 };
}

function npcRespond(state: IndianPokerState, opponent: IndianPokerCharacter): IndianPokerState {
  assert(state.status === "npc-response" && state.playerAction === "raise", "indian_poker_npc_response_invalid");
  const response: "call" | "fold" = state.npcChips > 0 ? decideNpcResponse(opponent.persona, npcRead(state), `${state.seed}:round:${state.round}`) : "fold";
  if (response === "fold") return awardPot({ ...state, sequence: state.sequence + 1, npcResponse: "fold" }, "player");
  return showdown({ ...state, sequence: state.sequence + 1, npcResponse: "call", npcChips: state.npcChips - 1, pot: state.pot + 1 });
}

function showdown(state: IndianPokerState): IndianPokerState {
  assert(state.playerCardId && state.npcCardId, "indian_poker_showdown_invalid");
  const playerStrength = standardRankValue(state.playerCardId), npcStrength = standardRankValue(state.npcCardId);
  return awardPot(state, playerStrength > npcStrength ? "player" : npcStrength > playerStrength ? "npc" : "draw");
}

function awardPot(state: IndianPokerState, winner: "player" | "npc" | "draw"): IndianPokerState {
  assert(state.playerCardId && state.npcCardId && state.npcOpening && state.playerAction, "indian_poker_round_invalid");
  const playerShare = winner === "player" ? state.pot : winner === "draw" ? state.pot / 2 : 0;
  const npcShare = winner === "npc" ? state.pot : winner === "draw" ? state.pot / 2 : 0;
  assert(Number.isInteger(playerShare) && Number.isInteger(npcShare), "indian_poker_split_invalid");
  const playerChips = state.playerChips + playerShare, npcChips = state.npcChips + npcShare;
  const result: IndianPokerRoundResult = {
    round: state.round, playerCardId: state.playerCardId, npcCardId: state.npcCardId, npcOpening: state.npcOpening,
    playerAction: state.playerAction, npcResponse: state.npcResponse, pot: state.pot, winner,
    playerChipDelta: playerChips - state.roundStartPlayerChips, npcChipDelta: npcChips - state.roundStartNpcChips,
  };
  return { ...state, status: "showdown", playerChips, npcChips, pot: 0, history: [...state.history, result] };
}

function completeMatch(state: IndianPokerState): IndianPokerState {
  const outcome = indianPokerOutcome(state), stake = state.stake ?? 0;
  return { ...state, status: "complete", playerCardId: null, npcCardId: null, npcOpening: null, playerAction: null, npcResponse: null, npcReaction: "neutral", creditAmount: Math.floor(stake * state.playerChips / INDIAN_POKER_STARTING_CHIPS), outcome };
}

function shouldComplete(state: IndianPokerState): boolean { return state.round >= INDIAN_POKER_ROUNDS || state.playerChips <= 0 || state.npcChips <= 0; }

function estimatedNpcEdge(persona: IndianPokerPersona, read: IndianPokerNpcRead, seed: string): number {
  const removed = new Set([...read.previouslyRevealedCardIds, read.visiblePlayerCardId]);
  const unknown = STANDARD_CARD_DECK.filter((card) => !removed.has(card.id));
  const playerStrength = standardRankValue(read.visiblePlayerCardId);
  const wins = unknown.filter((card) => standardRankValue(card) > playerStrength).length;
  const ties = unknown.filter((card) => standardRankValue(card) === playerStrength).length;
  const chance = (wins + ties * 0.5) / Math.max(1, unknown.length);
  const noise = (new XorShift32(`${seed}:read`).next() * 2 - 1) * (1 - persona.readAccuracy) * 0.22;
  const threshold = 0.5 + (0.5 - persona.riskAppetite) * 0.22;
  return chance + noise - threshold;
}

function reactionForPlayerCard(state: IndianPokerState, opponent: IndianPokerCharacter): IndianPokerState["npcReaction"] {
  const read = expressionRead(state), strength = standardRankValue(read.playerCardId);
  const truth = strength >= 10 ? "tense" : strength <= 6 ? "pleased" : "neutral";
  if (truth === "neutral") return "neutral";
  const deceptive = truth === "tense" ? "pleased" : "tense";
  const deceptiveWeight = opponent.persona.deceptionBias * 65;
  const truthWeight = (1 - opponent.persona.deceptionBias) * 78;
  const neutralWeight = Math.max(0, 100 - deceptiveWeight - truthWeight);
  return expressSignal(truth, "neutral", deceptive, { truth: truthWeight, neutral: neutralWeight, deceptive: deceptiveWeight }, `${state.seed}:round:${state.round}:expression:${opponent.id}`);
}

function validateCartridge(cartridge: IndianPokerCartridge): void {
  assert(cartridge.contract === "indian-poker-cartridge/0.2" && cartridge.version.length > 0 && cartridge.characters.length > 0, "indian_poker_cartridge_invalid");
  const ids = new Set<string>();
  for (const character of cartridge.characters) {
    assert(character.id.length > 0 && character.name.length > 0 && !ids.has(character.id), "indian_poker_character_invalid"); ids.add(character.id);
    for (const value of Object.values(character.persona)) assert(Number.isFinite(value) && value >= 0 && value <= 1, "indian_poker_persona_invalid");
  }
}
function findCharacter(cartridge: IndianPokerCartridge, id: string): IndianPokerCharacter { const character = cartridge.characters.find((candidate) => candidate.id === id); assert(character, `indian_poker_character_missing:${id}`); return character; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
