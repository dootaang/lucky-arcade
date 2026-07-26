import { XorShift32 } from "@lucky-arcade/engine";
import { OLD_MAID_SEAT_ORDER, characterIdForSeat } from "./engine.ts";
import type { OldMaidCartridge, OldMaidHistoryEntry, OldMaidLine, OldMaidLineEvent, OldMaidMode, OldMaidSeatId, OldMaidState, OldMaidStatus } from "./contracts.ts";

export interface OldMaidSpeechEvent { seatId: OldMaidSeatId; event: OldMaidLineEvent; }
export interface OldMaidSpeech { seatId: OldMaidSeatId; line: OldMaidLine; }
export interface OldMaidSpeechSnapshot {
  seed: string;
  sequence: number;
  turn: number;
  status: OldMaidStatus;
  mode: OldMaidMode;
  handCounts: Record<OldMaidSeatId, number>;
  characters: Record<OldMaidSeatId, string | null>;
  safeOrder: readonly OldMaidSeatId[];
  loserId: OldMaidSeatId | null;
  history: readonly OldMaidHistoryEntry[];
}

const THRESHOLDS: Readonly<Record<OldMaidLineEvent, number>> = {
  watching: 45,
  "idle-draw": 45,
  "pair-discard": 45,
  "taken-from": 45,
  "pair-made": 30,
  "joker-drawn": 15,
  "joker-left": 15,
  emptied: 15,
  "table-open": 100,
  "finish-1st": 100,
  "finish-2nd": 100,
  "finish-3rd": 100,
  defeat: 100,
};
const FINISH_EVENTS = ["finish-1st", "finish-2nd", "finish-3rd"] as const;

export function oldMaidSpeechSnapshot(state: OldMaidState): OldMaidSpeechSnapshot {
  return {
    seed: state.seed,
    sequence: state.sequence,
    turn: state.turn,
    status: state.status,
    mode: state.mode,
    handCounts: {
      player: state.hands.player.length,
      "cpu-1": state.hands["cpu-1"].length,
      "cpu-2": state.hands["cpu-2"].length,
      "cpu-3": state.hands["cpu-3"].length,
    },
    characters: Object.fromEntries(OLD_MAID_SEAT_ORDER.map((seatId) => [seatId, characterIdForSeat(state, seatId)])) as Record<OldMaidSeatId, string | null>,
    safeOrder: state.safeOrder,
    loserId: state.loserId,
    history: state.history,
  };
}

export function oldMaidSpeechEvents(cartridge: OldMaidCartridge, previous: OldMaidSpeechSnapshot, next: OldMaidSpeechSnapshot): readonly OldMaidSpeechEvent[] {
  if (isOldMaidSpeechSilent(next)) return [];
  const output: OldMaidSpeechEvent[] = [];
  if (previous.status === "dealing" && next.status !== "dealing") {
    return OLD_MAID_SEAT_ORDER.filter((seatId) => !isHumanSeat(next, seatId) && next.characters[seatId]).map((seatId) => ({ seatId, event: "table-open" }));
  }
  if (previous.status !== "complete" && next.status === "complete") {
    for (const seatId of OLD_MAID_SEAT_ORDER) {
      if (isHumanSeat(next, seatId) || !next.characters[seatId]) continue;
      if (seatId === next.loserId) output.push({ seatId, event: "defeat" });
      else {
        const rank = next.safeOrder.indexOf(seatId) + 1;
        const event = FINISH_EVENTS[rank - 1];
        if (event) output.push({ seatId, event });
      }
    }
    return output;
  }
  const newEntries = next.history.slice(previous.history.length);
  for (const entry of newEntries) {
    if (entry.type === "discard") {
      if (!isHumanSeat(next, entry.ownerId)) output.push({ seatId: entry.ownerId, event: "pair-discard" });
      continue;
    }
    if (!isHumanSeat(next, entry.actorId)) output.push({
      seatId: entry.actorId,
      event: entry.madePair ? "pair-made" : entry.faceId === cartridge.oddFaceId ? "joker-drawn" : "idle-draw",
    });
    if (!isHumanSeat(next, entry.targetId)) output.push({
      seatId: entry.targetId,
      event: entry.faceId === cartridge.oddFaceId ? "joker-left" : "taken-from",
    });
  }
  for (const seatId of OLD_MAID_SEAT_ORDER) {
    if (isHumanSeat(next, seatId)) continue;
    if (previous.handCounts[seatId] > 0 && next.handCounts[seatId] === 0) output.push({ seatId, event: "emptied" });
  }
  if (next.turn > previous.turn) {
    const draw = [...newEntries].reverse().find((entry) => entry.type === "draw");
    if (draw?.type === "draw") for (const seatId of OLD_MAID_SEAT_ORDER) {
      if (!isHumanSeat(next, seatId) && seatId !== draw.actorId && seatId !== draw.targetId) output.push({ seatId, event: "watching" });
    }
  }
  return output;
}

export function selectOldMaidSpeech(
  cartridge: OldMaidCartridge,
  previous: OldMaidSpeechSnapshot,
  next: OldMaidSpeechSnapshot,
  recentLineIds: readonly string[],
): OldMaidSpeech | null {
  return selectOldMaidSpeeches(cartridge, previous, next, recentLineIds)[0] ?? null;
}

export function selectOldMaidSpeeches(
  cartridge: OldMaidCartridge,
  previous: OldMaidSpeechSnapshot,
  next: OldMaidSpeechSnapshot,
  recentLineIds: readonly string[],
): readonly OldMaidSpeech[] {
  const candidates = oldMaidSpeechEvents(cartridge, previous, next);
  if (candidates.length === 0) return [];
  const rng = new XorShift32(`${next.seed}:speech:${next.sequence}`);
  const remaining = [...candidates];
  const output: OldMaidSpeech[] = [];
  const terminal = candidates.some((candidate) => candidate.event === "table-open" || candidate.event.startsWith("finish-") || candidate.event === "defeat");
  const budget = terminal ? candidates.length : next.mode === "spectate" ? 2 : 1;
  const usedSeats = new Set<OldMaidSeatId>();
  while (remaining.length > 0 && output.length < budget) {
    const index = terminal ? 0 : rng.nextUint32() % remaining.length;
    const [chosen] = remaining.splice(index, 1) as [OldMaidSpeechEvent];
    if (usedSeats.has(chosen.seatId) || !terminal && rng.nextUint32() % 100 >= THRESHOLDS[chosen.event]) continue;
    const characterId = next.characters[chosen.seatId];
    if (!characterId) continue;
    let matching = (cartridge.lines ?? []).filter((line) => line.characterId === characterId && line.event === chosen.event);
    if (matching.length === 0 && chosen.event.startsWith("finish-")) matching = (cartridge.lines ?? []).filter((line) => line.characterId === characterId && line.event === "emptied");
    if (matching.length === 0) continue;
    const unused = matching.filter((line) => !recentLineIds.includes(line.id));
    const pool = unused.length > 0 ? unused : matching;
    output.push({ seatId: chosen.seatId, line: pool[rng.nextUint32() % pool.length] as OldMaidLine });
    usedSeats.add(chosen.seatId);
  }
  return output;
}

export function isOldMaidSpeechSilent(state: OldMaidSpeechSnapshot): boolean {
  return state.status === "ready" || state.status === "dealing"
    || state.status !== "complete" && Object.values(state.handCounts).filter((count) => count > 0).length <= 2;
}

export function validateOldMaidLines(cartridge: OldMaidCartridge): void {
  if (!cartridge.lines) return;
  const characterIds = new Set(cartridge.characters.map((character) => character.id));
  const lineIds = new Set<string>();
  for (const line of cartridge.lines) {
    assert(!lineIds.has(line.id), `old_maid_line_duplicate:${line.id}`);
    lineIds.add(line.id);
    assert(characterIds.has(line.characterId), `old_maid_line_character_missing:${line.characterId}`);
    assert(line.text.length > 0 && line.text.every((beat) => beat.length > 0), `old_maid_line_text_empty:${line.id}`);
  }
}

function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
function isHumanSeat(state: OldMaidSpeechSnapshot, seatId: OldMaidSeatId): boolean { return state.mode === "play" && seatId === "player"; }
