import { XorShift32 } from "@lucky-arcade/engine";
import type { FiveCardDrawNpcSeatId, FiveCardDrawSeatId, FiveCardDrawState } from "./contracts.ts";

export const FIVE_CARD_DRAW_LINE_EVENTS = [
  "table-open", "check", "bet", "call", "raise", "counter-raise", "fold", "stand-pat",
  "draw-one", "draw-many", "showdown-win", "showdown-loss",
] as const;
export type FiveCardDrawLineEvent = (typeof FIVE_CARD_DRAW_LINE_EVENTS)[number];

export interface FiveCardDrawLine {
  id: string;
  characterId: string;
  event: FiveCardDrawLineEvent;
  text: readonly string[];
}

export interface FiveCardDrawSpeech { seatId: FiveCardDrawNpcSeatId; line: FiveCardDrawLine; }

/**
 * Selects flavour dialogue from already committed state transitions. It never
 * receives private opponent cards, and therefore cannot affect poker play.
 */
export function selectFiveCardDrawSpeeches(
  previous: FiveCardDrawState,
  next: FiveCardDrawState,
  lines: readonly FiveCardDrawLine[],
  recentLineIds: readonly string[] = [],
): readonly FiveCardDrawSpeech[] {
  if (lines.length === 0 || previous.sequence === next.sequence) return [];
  const events = speechEvents(previous, next);
  return events.flatMap(({ seatId, event }) => {
    const characterId = characterIdForSeat(next, seatId);
    if (!characterId) return [];
    const candidates = lines.filter((line) => line.characterId === characterId && line.event === event);
    if (candidates.length === 0) return [];
    const fresh = candidates.filter((line) => !recentLineIds.includes(line.id));
    const pool = fresh.length > 0 ? fresh : candidates;
    const rng = new XorShift32(`${next.seed ?? "ready"}:speech:${next.sequence}:${seatId}:${event}`);
    return [{ seatId, line: pool[rng.nextUint32() % pool.length]! }];
  });
}

export function validateFiveCardDrawLines(lines: readonly FiveCardDrawLine[], characterIds: readonly string[]): void {
  const expected = new Set(characterIds), ids = new Set<string>(), matrix = new Set<string>();
  for (const line of lines) {
    if (!line.id || ids.has(line.id) || !expected.has(line.characterId) || !FIVE_CARD_DRAW_LINE_EVENTS.includes(line.event)
      || line.text.length === 0 || line.text.some((beat) => !beat.trim())) throw new Error(`five_card_draw_line_invalid:${line.id}`);
    ids.add(line.id);
    matrix.add(`${line.characterId}:${line.event}`);
  }
  for (const characterId of expected) for (const event of FIVE_CARD_DRAW_LINE_EVENTS) {
    if (!matrix.has(`${characterId}:${event}`)) throw new Error(`five_card_draw_line_missing:${characterId}:${event}`);
  }
}

function speechEvents(previous: FiveCardDrawState, next: FiveCardDrawState): Array<{ seatId: FiveCardDrawNpcSeatId; event: FiveCardDrawLineEvent }> {
  if (previous.phase === "ready" && next.phase !== "ready") return npcSeats(next).map((seatId) => ({ seatId, event: "table-open" }));
  if (previous.phase !== "complete" && next.phase === "complete" && next.result) {
    return npcSeats(next).map((seatId) => ({
      seatId,
      event: next.result!.winnerSeatIds.includes(seatId) ? "showdown-win" : "showdown-loss",
    }));
  }
  const action = next.lastAction;
  if (!action || action === previous.lastAction || action.seatId === "player") return [];
  const seatId = action.seatId;
  if (action.action === "exchange") {
    return [{ seatId, event: action.amountUnits === 0 ? "stand-pat" : action.amountUnits === 1 ? "draw-one" : "draw-many" }];
  }
  const event: FiveCardDrawLineEvent = action.action === "raise" && previous.currentBetUnits === 2 ? "counter-raise" : action.action;
  return [{ seatId, event }];
}

function npcSeats(state: FiveCardDrawState): FiveCardDrawNpcSeatId[] {
  return state.seatOrder.filter((seatId): seatId is FiveCardDrawNpcSeatId => seatId !== "player");
}

function characterIdForSeat(state: FiveCardDrawState, seatId: FiveCardDrawSeatId): string | null {
  if (seatId === "player") return null;
  return state.context.opponents[Number(seatId.slice(-1)) - 1]?.id ?? null;
}
