import type {
  FiveCardDrawContext, FiveCardDrawNpcSeatId, FiveCardDrawSeatId, FiveCardDrawSessionRead,
  FiveCardDrawStake, FiveCardDrawState,
} from "./contracts.ts";

export const FIVE_CARD_DRAW_SERIES_CONTRACT = "five-card-draw-series/0.1" as const;
export const FIVE_CARD_DRAW_SERIES_LENGTHS = [1, 3, 5] as const;
export type FiveCardDrawSeriesLength = (typeof FIVE_CARD_DRAW_SERIES_LENGTHS)[number];

export interface FiveCardDrawSeriesMemory {
  handsPlayed: number;
  playerBetActions: number;
  playerAggressiveActions: number;
  playerFolds: number;
  playerShowdowns: number;
  playerRevealedStrengthTotal: number;
  playerWeakAggressiveShowdowns: number;
  playerExchangedCards: number;
}

export interface FiveCardDrawHandSummary {
  handNumber: number;
  resultId: string;
  seed: string;
  winnerSeatIds: readonly FiveCardDrawSeatId[];
  seatNets: Readonly<Record<FiveCardDrawSeatId, number>>;
  playerNet: number;
  playerFolded: boolean;
  showdown: boolean;
  playerHandLabel: string | null;
  playerHandRank: number;
  pot: number;
  turns: number;
}

export interface FiveCardDrawSeriesState {
  contract: typeof FIVE_CARD_DRAW_SERIES_CONTRACT;
  sessionId: string;
  targetHands: FiveCardDrawSeriesLength;
  stake: FiveCardDrawStake;
  seatIds: readonly FiveCardDrawSeatId[];
  opponentIds: readonly string[];
  status: "playing" | "intermission" | "complete";
  endedEarly: boolean;
  summaries: readonly FiveCardDrawHandSummary[];
  memory: FiveCardDrawSeriesMemory;
}

export interface FiveCardDrawSeriesStanding {
  seatId: FiveCardDrawSeatId;
  participantId: string;
  displayName: string;
  net: number;
  wins: number;
  rank: number;
  isPlayer: boolean;
}

export interface FiveCardDrawSeriesStats {
  handsPlayed: number;
  handsWon: number;
  showdownWins: number;
  folds: number;
  totalNet: number;
  largestPot: number;
  bestHandLabel: string | null;
  standings: readonly FiveCardDrawSeriesStanding[];
}

export function createFiveCardDrawSeries(context: FiveCardDrawContext, targetHands: FiveCardDrawSeriesLength, stake: FiveCardDrawStake): FiveCardDrawSeriesState {
  if (!FIVE_CARD_DRAW_SERIES_LENGTHS.includes(targetHands)) throw new Error("five_card_draw_series_length_invalid");
  return {
    contract: FIVE_CARD_DRAW_SERIES_CONTRACT,
    sessionId: context.sessionId,
    targetHands,
    stake,
    seatIds: ["player", ...context.opponents.map((_, index) => `npc-${index + 1}` as FiveCardDrawNpcSeatId)],
    opponentIds: context.opponents.map((opponent) => opponent.id),
    status: "playing",
    endedEarly: false,
    summaries: [],
    memory: emptyMemory(),
  };
}

export function recordFiveCardDrawSeriesHand(series: FiveCardDrawSeriesState, state: FiveCardDrawState): FiveCardDrawSeriesState {
  const result = state.result;
  if (state.phase !== "complete" || !result || !state.baseStake || result.sessionId !== series.sessionId || series.status !== "playing") {
    throw new Error("five_card_draw_series_record_invalid");
  }
  if (series.summaries.some((summary) => summary.resultId === result.resultId)) return series;
  const seatNets = Object.fromEntries((["player", "npc-1", "npc-2", "npc-3"] as FiveCardDrawSeatId[]).map((seatId) => [
    seatId, result.payouts[seatId] - result.contributions[seatId],
  ])) as Record<FiveCardDrawSeatId, number>;
  const playerValue = result.values.player;
  const summary: FiveCardDrawHandSummary = {
    handNumber: series.summaries.length + 1,
    resultId: result.resultId,
    seed: result.seed,
    winnerSeatIds: [...result.winnerSeatIds],
    seatNets,
    playerNet: seatNets.player,
    playerFolded: result.foldedSeatIds.includes("player"),
    showdown: Object.keys(result.hands).length > 0,
    playerHandLabel: playerValue?.label ?? null,
    playerHandRank: playerValue?.categoryRank ?? -1,
    pot: result.pot,
    turns: state.sequence,
  };
  const summaries = [...series.summaries, summary];
  return {
    ...series,
    summaries,
    memory: accumulateMemory(series.memory, state),
    status: summaries.length >= series.targetHands ? "complete" : "intermission",
  };
}

export function continueFiveCardDrawSeries(series: FiveCardDrawSeriesState): FiveCardDrawSeriesState {
  if (series.status !== "intermission") throw new Error("five_card_draw_series_continue_invalid");
  return { ...series, status: "playing" };
}

export function endFiveCardDrawSeries(series: FiveCardDrawSeriesState): FiveCardDrawSeriesState {
  if (series.status === "complete") return series;
  if (series.summaries.length === 0) throw new Error("five_card_draw_series_end_invalid");
  return { ...series, status: "complete", endedEarly: series.summaries.length < series.targetHands };
}

export function fiveCardDrawSessionRead(memory: FiveCardDrawSeriesMemory): FiveCardDrawSessionRead {
  const hands = Math.max(1, memory.handsPlayed);
  const betActions = Math.max(1, memory.playerBetActions);
  const showdowns = Math.max(1, memory.playerShowdowns);
  return {
    handsPlayed: memory.handsPlayed,
    aggressionRate: memory.playerAggressiveActions / betActions,
    foldRate: memory.playerFolds / hands,
    averageExchangeCount: memory.playerExchangedCards / hands,
    revealedStrength: memory.playerShowdowns > 0 ? memory.playerRevealedStrengthTotal / showdowns : null,
    weakAggressionRate: memory.playerShowdowns > 0 ? memory.playerWeakAggressiveShowdowns / showdowns : 0,
  };
}

export function fiveCardDrawSeriesStats(series: FiveCardDrawSeriesState, context: FiveCardDrawContext): FiveCardDrawSeriesStats {
  const totals = Object.fromEntries(series.seatIds.map((seatId) => [seatId, 0])) as Partial<Record<FiveCardDrawSeatId, number>>;
  const wins = Object.fromEntries(series.seatIds.map((seatId) => [seatId, 0])) as Partial<Record<FiveCardDrawSeatId, number>>;
  for (const summary of series.summaries) {
    for (const seatId of series.seatIds) totals[seatId] = (totals[seatId] ?? 0) + summary.seatNets[seatId];
    for (const seatId of summary.winnerSeatIds) if (series.seatIds.includes(seatId)) wins[seatId] = (wins[seatId] ?? 0) + 1;
  }
  const rows = series.seatIds.map((seatId): Omit<FiveCardDrawSeriesStanding, "rank"> => {
    const opponent = seatId === "player" ? null : context.opponents[Number(seatId.slice(-1)) - 1];
    return {
      seatId,
      participantId: opponent?.id ?? "player",
      displayName: opponent?.name ?? "플레이어",
      net: totals[seatId] ?? 0,
      wins: wins[seatId] ?? 0,
      isPlayer: seatId === "player",
    };
  }).toSorted((a, b) => b.net - a.net || b.wins - a.wins || a.seatId.localeCompare(b.seatId));
  let previousNet: number | null = null, previousRank = 0;
  const standings = rows.map((row, index): FiveCardDrawSeriesStanding => {
    const rank = previousNet === row.net ? previousRank : index + 1;
    previousNet = row.net; previousRank = rank;
    return { ...row, rank };
  });
  const best = series.summaries.filter((summary) => summary.playerHandLabel).toSorted((a, b) => b.playerHandRank - a.playerHandRank)[0];
  return {
    handsPlayed: series.summaries.length,
    handsWon: series.summaries.filter((summary) => summary.winnerSeatIds.includes("player")).length,
    showdownWins: series.summaries.filter((summary) => summary.showdown && summary.winnerSeatIds.includes("player")).length,
    folds: series.summaries.filter((summary) => summary.playerFolded).length,
    totalNet: totals.player ?? 0,
    largestPot: Math.max(0, ...series.summaries.map((summary) => summary.pot)),
    bestHandLabel: best?.playerHandLabel ?? null,
    standings,
  };
}

export function isFiveCardDrawSeriesState(value: unknown): value is FiveCardDrawSeriesState {
  if (!value || typeof value !== "object") return false;
  const series = value as Partial<FiveCardDrawSeriesState>;
  return series.contract === FIVE_CARD_DRAW_SERIES_CONTRACT
    && typeof series.sessionId === "string"
    && FIVE_CARD_DRAW_SERIES_LENGTHS.includes(series.targetHands as FiveCardDrawSeriesLength)
    && ([10,50,200] as number[]).includes(series.stake as number)
    && Array.isArray(series.seatIds) && series.seatIds[0] === "player"
    && Array.isArray(series.opponentIds) && series.opponentIds.length === series.seatIds.length - 1
    && Array.isArray(series.summaries) && series.summaries.length <= (series.targetHands ?? 0)
    && validMemory(series.memory) && ["playing", "intermission", "complete"].includes(series.status ?? "");
}

function validMemory(value:unknown):value is FiveCardDrawSeriesMemory{
  if(!value||typeof value!=="object")return false;
  const memory=value as Partial<FiveCardDrawSeriesMemory>;
  return [memory.handsPlayed,memory.playerBetActions,memory.playerAggressiveActions,memory.playerFolds,memory.playerShowdowns,
    memory.playerRevealedStrengthTotal,memory.playerWeakAggressiveShowdowns,memory.playerExchangedCards]
    .every((entry)=>Number.isFinite(entry)&&entry!>=0);
}

function accumulateMemory(memory: FiveCardDrawSeriesMemory, state: FiveCardDrawState): FiveCardDrawSeriesMemory {
  const playerBets = state.betHistory.filter((entry) => entry.seatId === "player");
  const aggressive = playerBets.filter((entry) => entry.action === "bet" || entry.action === "raise").length;
  const showdown = Boolean(state.result?.hands.player && state.result.values.player);
  const revealedStrength = showdown ? (state.result?.values.player?.categoryRank ?? 0) / 8 : 0;
  return {
    handsPlayed: memory.handsPlayed + 1,
    playerBetActions: memory.playerBetActions + playerBets.length,
    playerAggressiveActions: memory.playerAggressiveActions + aggressive,
    playerFolds: memory.playerFolds + Number(state.foldedSeatIds.includes("player")),
    playerShowdowns: memory.playerShowdowns + Number(showdown),
    playerRevealedStrengthTotal: memory.playerRevealedStrengthTotal + revealedStrength,
    playerWeakAggressiveShowdowns: memory.playerWeakAggressiveShowdowns + Number(showdown && aggressive > 0 && revealedStrength <= .125),
    playerExchangedCards: memory.playerExchangedCards + (state.exchangeCounts.player ?? 0),
  };
}

function emptyMemory(): FiveCardDrawSeriesMemory {
  return { handsPlayed: 0, playerBetActions: 0, playerAggressiveActions: 0, playerFolds: 0, playerShowdowns: 0,
    playerRevealedStrengthTotal: 0, playerWeakAggressiveShowdowns: 0, playerExchangedCards: 0 };
}
