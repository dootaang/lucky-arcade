import { PERSONA_PRESETS, XorShift32, expressSignal, weightedChoice, type Persona } from "@lucky-arcade/engine";
import { INDIAN_POKER_DECK, cardStrength } from "./deck.ts";
import { decisionRead, expressionRead, type IndianPokerDecisionRead } from "./read.ts";
import { INDIAN_POKER_VERSION, type IndianPokerAction, type IndianPokerCard, type IndianPokerCartridge, type IndianPokerChoice, type IndianPokerRoundResult, type IndianPokerSeatId, type IndianPokerState } from "./contracts.ts";

export const INDIAN_POKER_SEATS: readonly IndianPokerSeatId[] = ["player", "cpu-1", "cpu-2", "cpu-3"];

export function createIndianPokerState(cartridge: IndianPokerCartridge, seed: string, sessionId = "indian-poker:table-1"): IndianPokerState {
  if (cartridge.characters.length < 3) throw new Error("indian_poker_characters_too_few");
  return {
    contract: "indian-poker-state/0.1", version: INDIAN_POKER_VERSION, packVersion: cartridge.version, sessionId, seed, sequence: 0, round: 0, status: "ready",
    seats: { player: { characterId: null, score: 0 }, "cpu-1": { characterId: cartridge.characters[0]!.id, score: 0 }, "cpu-2": { characterId: cartridge.characters[1]!.id, score: 0 }, "cpu-3": { characterId: cartridge.characters[2]!.id, score: 0 } },
    hands: emptyHands(), choices: emptyChoices(), reactions: { player: "neutral", "cpu-1": "neutral", "cpu-2": "neutral", "cpu-3": "neutral" }, lastRound: null, history: [], stake: null, wagerId: null, creditAmount: 0,
  };
}

export function reduceIndianPoker(cartridge: IndianPokerCartridge, state: IndianPokerState, action: IndianPokerAction): IndianPokerState {
  if (action.type === "restart") return { ...createIndianPokerState(cartridge, action.seed, state.sessionId), sequence: state.sequence + 1 };
  if (action.type === "start") { assert(state.status === "ready" && action.seed.length > 0 && action.wagerId.length > 0, "indian_poker_start_invalid"); return dealRound(cartridge, { ...state, sequence: state.sequence + 1, seed: action.seed, stake: action.stake, wagerId: action.wagerId }, 1); }
  if (action.type === "next_round") {
    assert(state.status === "revealing", "indian_poker_next_round_invalid");
    if (state.round >= 5) { const playerRank = indianPokerRanking(state).find((standing) => standing.seatId === "player")?.rank ?? 4, multiplier = [0, 4, 2, 1, 0][playerRank] ?? 0; return { ...state, sequence: state.sequence + 1, status: "complete", hands: emptyHands(), choices: emptyChoices(), reactions: neutralReactions(), creditAmount: (state.stake ?? 0) * multiplier }; }
    return dealRound(cartridge, { ...state, sequence: state.sequence + 1 }, state.round + 1);
  }
  assert(action.type === "choose" && state.status === "choosing", "indian_poker_choice_invalid");
  const cards = new Map(INDIAN_POKER_DECK.map((card) => [card.id, card]));
  const choices = { ...state.choices, player: action.choice } as Record<IndianPokerSeatId, IndianPokerChoice>;
  for (const seatId of INDIAN_POKER_SEATS.slice(1) as IndianPokerSeatId[]) {
    const character = cartridge.characters.find((candidate) => candidate.id === state.seats[seatId].characterId);
    assert(character, `indian_poker_character_missing:${seatId}`);
    choices[seatId] = decideIndianPoker(PERSONA_PRESETS[character.tellStyle], decisionRead(state, seatId, cards), `${state.seed}:round:${state.round}:choice:${seatId}`);
  }
  const active = INDIAN_POKER_SEATS.filter((seatId) => choices[seatId] !== "fold");
  const winnerId = active.length ? [...active].sort((left, right) => cardStrength(requireCard(cards, state.hands[right])) - cardStrength(requireCard(cards, state.hands[left])))[0]! : null;
  const scoreDelta = Object.fromEntries(INDIAN_POKER_SEATS.map((seatId) => [seatId, choices[seatId] === "fold" ? 0 : seatId === winnerId ? choices[seatId] === "raise" ? 4 : 2 : choices[seatId] === "raise" ? -2 : -1])) as Record<IndianPokerSeatId, number>;
  const result: IndianPokerRoundResult = { round: state.round, choices, cards: requireHands(state.hands), winnerId, scoreDelta };
  return { ...state, sequence: state.sequence + 1, status: "revealing", choices, lastRound: result, history: [...state.history, result], seats: mapSeats(state, (seatId) => state.seats[seatId].score + scoreDelta[seatId]) };
}

export function decideIndianPoker(persona: Persona, read: IndianPokerDecisionRead, seed: string): IndianPokerChoice {
  const visible = new Set(read.visibleStrengths);
  const unseen = Array.from({ length: 52 }, (_, strength) => strength).filter((strength) => !visible.has(strength));
  const strongestVisible = Math.max(-1, ...read.visibleStrengths);
  const winningChance = unseen.filter((strength) => strength > strongestVisible).length / Math.max(1, unseen.length);
  const threshold = 1 / 3 + (0.5 - persona.riskAppetite) * 0.24;
  const noise = ((new XorShift32(`${seed}:read`).nextUint32() % 2_001) / 1_000 - 1) * (1 - persona.readAccuracy) * 0.18;
  const edge = winningChance + noise - threshold;
  const confidence = 0.55 + persona.consistency * 0.35;
  const participates = weightedChoice(edge >= 0 ? [confidence, 1 - confidence] : [1 - confidence, confidence], `${seed}:choice`) === 0;
  if (!participates) return "fold";
  return edge > 0.18 && persona.riskAppetite > 0.45 ? "raise" : "call";
}

export function indianPokerRanking(state: IndianPokerState): Array<{ seatId: IndianPokerSeatId; rank: number; score: number }> {
  const lastWin = new Map<IndianPokerSeatId, number>();
  for (const round of state.history) if (round.winnerId) lastWin.set(round.winnerId, round.round);
  const ordered = [...INDIAN_POKER_SEATS].sort((left, right) => state.seats[right].score - state.seats[left].score || (lastWin.get(right) ?? -1) - (lastWin.get(left) ?? -1) || INDIAN_POKER_SEATS.indexOf(left) - INDIAN_POKER_SEATS.indexOf(right));
  return ordered.map((seatId, index) => ({ seatId, rank: index + 1, score: state.seats[seatId].score }));
}

function dealRound(cartridge: IndianPokerCartridge, state: IndianPokerState, round: number): IndianPokerState {
  const shuffled = shuffle(INDIAN_POKER_DECK, new XorShift32(`${state.seed}:round:${round}`));
  const hands = Object.fromEntries(INDIAN_POKER_SEATS.map((seatId, index) => [seatId, shuffled[index]!.id])) as Record<IndianPokerSeatId, string>;
  const next = { ...state, round, status: "choosing" as const, hands, choices: emptyChoices(), lastRound: null };
  const cards = new Map(INDIAN_POKER_DECK.map((card) => [card.id, card]));
  const read = expressionRead(next, cards);
  const reactions = neutralReactions();
  for (const seatId of INDIAN_POKER_SEATS.slice(1) as IndianPokerSeatId[]) {
    const character = cartridge.characters.find((candidate) => candidate.id === next.seats[seatId].characterId)!;
    const persona = PERSONA_PRESETS[character.tellStyle];
    const truth = read.playerCardStrength >= 26 ? "tense" : "pleased", deceptive = truth === "tense" ? "pleased" : "tense";
    const deceptiveWeight = persona.deceptionBias * 55, truthWeight = (1 - persona.deceptionBias) * 75, neutralWeight = Math.max(0, 100 - deceptiveWeight - truthWeight);
    reactions[seatId] = expressSignal(truth, "neutral", deceptive, { truth: truthWeight, neutral: neutralWeight, deceptive: deceptiveWeight }, `${state.seed}:round:${round}:expression:${seatId}`);
  }
  return { ...next, reactions };
}

function requireCard(cards: ReadonlyMap<string, IndianPokerCard>, id: string | null): IndianPokerCard { const card = id ? cards.get(id) : undefined; if (!card) throw new Error(`indian_poker_card_missing:${id ?? "null"}`); return card; }
function emptyHands(): Record<IndianPokerSeatId, null> { return { player: null, "cpu-1": null, "cpu-2": null, "cpu-3": null }; }
function emptyChoices(): Record<IndianPokerSeatId, null> { return { player: null, "cpu-1": null, "cpu-2": null, "cpu-3": null }; }
function neutralReactions(): IndianPokerState["reactions"] { return { player: "neutral", "cpu-1": "neutral", "cpu-2": "neutral", "cpu-3": "neutral" }; }
function requireHands(hands: IndianPokerState["hands"]): Record<IndianPokerSeatId, string> { return Object.fromEntries(INDIAN_POKER_SEATS.map((seatId) => { const id = hands[seatId]; if (!id) throw new Error(`indian_poker_hand_missing:${seatId}`); return [seatId, id]; })) as Record<IndianPokerSeatId, string>; }
function mapSeats(state: IndianPokerState, score: (seatId: IndianPokerSeatId) => number): IndianPokerState["seats"] { return Object.fromEntries(INDIAN_POKER_SEATS.map((seatId) => [seatId, { ...state.seats[seatId], score: score(seatId) }])) as IndianPokerState["seats"]; }
function shuffle<T>(input: readonly T[], rng: XorShift32): T[] { const output = [...input]; for (let index = output.length - 1; index > 0; index -= 1) { const target = rng.nextUint32() % (index + 1); [output[index], output[target]] = [output[target] as T, output[index] as T]; } return output; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }

export { cardStrength } from "./deck.ts";
