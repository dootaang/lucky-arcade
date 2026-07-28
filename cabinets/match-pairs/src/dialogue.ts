import { XorShift32 } from "@lucky-arcade/engine";
import { MATCH_PAIRS_ACTORS, type MatchPairsActor, type MatchPairsOpponent, type MatchPairsState } from "./contracts.ts";
import { characterIdForMatchPairsActor, isCpuActor } from "./engine.ts";

export const MATCH_PAIRS_LINE_EVENTS = [
  "table-open", "self-match", "self-miss", "opponent-match", "opponent-miss", "streak",
  "ahead", "behind", "last-pair", "victory", "defeat", "draw",
] as const;
export type MatchPairsLineEvent = (typeof MATCH_PAIRS_LINE_EVENTS)[number];

export interface MatchPairsLine {
  id: string;
  characterId: string;
  event: MatchPairsLineEvent;
  text: readonly string[];
}

export interface MatchPairsSpeech { actor: MatchPairsActor; line: MatchPairsLine; }

/**
 * Dialogue is presentation-only. Recovery replays the reducer without calling
 * this selector, so saved actions never emit old lines after a reload.
 */
export function selectMatchPairsSpeeches(
  previous: MatchPairsState, next: MatchPairsState, opponents: readonly MatchPairsOpponent[],
  lines: readonly MatchPairsLine[], recentLineIds: readonly string[] = [],
): readonly MatchPairsSpeech[] {
  if (lines.length === 0) return [];
  const events = speechEvents(previous, next);
  return events.flatMap(({ actor, event }) => {
    const characterId = characterIdForMatchPairsActor(next, actor);
    if (!characterId || !isCpuActor(next, actor)) return [];
    const candidates = lines.filter((line) => line.characterId === characterId && line.event === event);
    if (candidates.length === 0) return [];
    const fresh = candidates.filter((line) => !recentLineIds.includes(line.id));
    const pool = fresh.length > 0 ? fresh : candidates;
    const rng = new XorShift32(`${next.seed}:speech:${next.sequence}:${actor}:${event}`);
    return [{ actor, line: pool[rng.nextUint32() % pool.length]! }];
  });
}

export function validateMatchPairsLines(lines: readonly MatchPairsLine[], characterIds: readonly string[]): void {
  const expected = new Set(characterIds), ids = new Set<string>(), matrix = new Set<string>();
  for (const line of lines) {
    if (!line.id || ids.has(line.id) || !expected.has(line.characterId) || !MATCH_PAIRS_LINE_EVENTS.includes(line.event) || line.text.length === 0 || line.text.some((beat) => !beat.trim())) throw new Error(`match_pairs_line_invalid:${line.id}`);
    ids.add(line.id); matrix.add(`${line.characterId}:${line.event}`);
  }
  for (const characterId of expected) for (const event of MATCH_PAIRS_LINE_EVENTS) {
    if (!matrix.has(`${characterId}:${event}`)) throw new Error(`match_pairs_line_missing:${characterId}:${event}`);
  }
}

function speechEvents(previous: MatchPairsState, next: MatchPairsState): Array<{ actor: MatchPairsActor; event: MatchPairsLineEvent }> {
  if (previous.status === "ready" && next.status === "playing") return MATCH_PAIRS_ACTORS.filter((actor) => isCpuActor(next, actor)).map((actor) => ({ actor, event: "table-open" }));
  if (previous.status !== "checking" || next.lastResolution === null) return [];
  if (next.status === "complete") {
    if (next.outcome === "draw") return MATCH_PAIRS_ACTORS.filter((actor) => isCpuActor(next, actor)).map((actor) => ({ actor, event: "draw" }));
    return MATCH_PAIRS_ACTORS.filter((actor) => isCpuActor(next, actor)).map((actor) => ({ actor, event: actor === next.outcome ? "victory" : "defeat" }));
  }
  const remaining = new Set(next.cards.map((card) => card.pairId)).size - next.matchedPairIds.length;
  if (remaining === 1 && isCpuActor(next, next.currentTurn)) return [{ actor: next.currentTurn, event: "last-pair" }];
  const previousLeader = leadingActor(previous), nextLeader = leadingActor(next);
  if (nextLeader && nextLeader !== previousLeader) {
    const follower = nextLeader === "player" ? "npc" : "player";
    return [
      ...(isCpuActor(next, nextLeader) ? [{ actor: nextLeader, event: "ahead" as const }] : []),
      ...(isCpuActor(next, follower) ? [{ actor: follower, event: "behind" as const }] : []),
    ].slice(0, next.mode === "spectate" ? 2 : 1);
  }
  const actor = next.lastResolution.actor, observer = actor === "player" ? "npc" : "player";
  const output: Array<{ actor: MatchPairsActor; event: MatchPairsLineEvent }> = [];
  if (isCpuActor(next, actor)) output.push({ actor, event: next.lastResolution.matched ? next.matchStreaks[actor] >= 2 ? "streak" : "self-match" : "self-miss" });
  if (isCpuActor(next, observer)) output.push({ actor: observer, event: next.lastResolution.matched ? "opponent-match" : "opponent-miss" });
  return output.slice(0, next.mode === "spectate" ? 2 : 1);
}

function leadingActor(state: Pick<MatchPairsState, "claims">): MatchPairsActor | null {
  return state.claims.player.length === state.claims.npc.length ? null
    : state.claims.player.length > state.claims.npc.length ? "player" : "npc";
}
