import { XorShift32 } from "@lucky-arcade/engine";
import type { OldMaidCartridge, OldMaidCpuSeatId, OldMaidHistoryEntry, OldMaidLine, OldMaidLineEvent, OldMaidSeatId, OldMaidState, OldMaidStatus } from "./contracts.ts";

export interface OldMaidSpeechEvent { seatId: OldMaidCpuSeatId; event: OldMaidLineEvent; }
export interface OldMaidSpeech { seatId: OldMaidCpuSeatId; line: OldMaidLine; }
export interface OldMaidSpeechSnapshot {
  seed: string;
  sequence: number;
  turn: number;
  status: OldMaidStatus;
  handCounts: Record<OldMaidSeatId, number>;
  characters: Record<OldMaidCpuSeatId, string>;
  history: readonly OldMaidHistoryEntry[];
}

const CPU_SEATS: readonly OldMaidCpuSeatId[] = ["cpu-1", "cpu-2", "cpu-3"];
const THRESHOLDS: Readonly<Record<OldMaidLineEvent, number>> = {
  watching: 45,
  "idle-draw": 45,
  "pair-discard": 45,
  "taken-from": 45,
  "pair-made": 30,
  "joker-drawn": 15,
  "joker-left": 15,
  emptied: 15,
};

export function oldMaidSpeechSnapshot(state: OldMaidState): OldMaidSpeechSnapshot {
  return {
    seed: state.seed,
    sequence: state.sequence,
    turn: state.turn,
    status: state.status,
    handCounts: {
      player: state.hands.player.length,
      "cpu-1": state.hands["cpu-1"].length,
      "cpu-2": state.hands["cpu-2"].length,
      "cpu-3": state.hands["cpu-3"].length,
    },
    characters: state.characters,
    history: state.history,
  };
}

export function oldMaidSpeechEvents(cartridge: OldMaidCartridge, previous: OldMaidSpeechSnapshot, next: OldMaidSpeechSnapshot): readonly OldMaidSpeechEvent[] {
  if (isOldMaidSpeechSilent(next)) return [];
  const output: OldMaidSpeechEvent[] = [];
  const newEntries = next.history.slice(previous.history.length);
  for (const entry of newEntries) {
    if (entry.type === "discard") {
      if (entry.ownerId !== "player") output.push({ seatId: entry.ownerId, event: "pair-discard" });
      continue;
    }
    if (entry.actorId !== "player") output.push({
      seatId: entry.actorId,
      event: entry.madePair ? "pair-made" : entry.faceId === cartridge.oddFaceId ? "joker-drawn" : "idle-draw",
    });
    if (entry.targetId !== "player") output.push({
      seatId: entry.targetId,
      event: entry.faceId === cartridge.oddFaceId ? "joker-left" : "taken-from",
    });
  }
  for (const seatId of CPU_SEATS) {
    if (previous.handCounts[seatId] > 0 && next.handCounts[seatId] === 0) output.push({ seatId, event: "emptied" });
  }
  if (next.turn > previous.turn) {
    const draw = [...newEntries].reverse().find((entry) => entry.type === "draw");
    if (draw?.type === "draw") for (const seatId of CPU_SEATS) {
      if (seatId !== draw.actorId && seatId !== draw.targetId) output.push({ seatId, event: "watching" });
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
  const candidates = oldMaidSpeechEvents(cartridge, previous, next);
  if (candidates.length === 0) return null;
  const rng = new XorShift32(`${next.seed}:speech:${next.sequence}`);
  const chosen = candidates[rng.nextUint32() % candidates.length] as OldMaidSpeechEvent;
  if (rng.nextUint32() % 100 >= THRESHOLDS[chosen.event]) return null;
  const characterId = next.characters[chosen.seatId];
  const matching = (cartridge.lines ?? []).filter((line) => line.characterId === characterId && line.event === chosen.event);
  if (matching.length === 0) return null;
  const unused = matching.filter((line) => !recentLineIds.includes(line.id));
  const pool = unused.length > 0 ? unused : matching;
  return { seatId: chosen.seatId, line: pool[rng.nextUint32() % pool.length] as OldMaidLine };
}

export function isOldMaidSpeechSilent(state: OldMaidSpeechSnapshot): boolean {
  return state.status === "ready" || state.status === "dealing" || state.status === "complete"
    || Object.values(state.handCounts).filter((count) => count > 0).length <= 2;
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
