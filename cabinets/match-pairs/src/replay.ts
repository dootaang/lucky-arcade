import type { MatchPairsAction, MatchPairsDifficulty, MatchPairsFace, MatchPairsFocus, MatchPairsOpponent, MatchPairsState } from "./contracts.ts";
import { createMatchPairsState, matchPairsResultHash, reduceMatchPairs } from "./engine.ts";

export interface MatchPairsSpectatorReplayFrame {
  readonly action: MatchPairsAction;
  readonly state: MatchPairsState;
}

export interface MatchPairsSpectatorReplay {
  readonly seed: string;
  readonly participantIds: readonly [string, string];
  readonly frames: readonly MatchPairsSpectatorReplayFrame[];
  readonly finalState: MatchPairsState;
  readonly winningCharacterId: string | "draw";
  readonly resultHash: string;
}

/**
 * Builds the canonical NPC-v-NPC game used by spectator markets and replays.
 * The returned frames are presentation data; the final state and hash come
 * from the same reducer transitions that decide the wager result.
 */
export function createMatchPairsSpectatorReplay(input: {
  faces: readonly MatchPairsFace[];
  opponents: readonly MatchPairsOpponent[];
  packVersion: string;
  seed: string;
  sessionId: string;
  participantIds: readonly [string, string];
  difficulty?: MatchPairsDifficulty;
  focus?: MatchPairsFocus;
  captureFrames?: boolean;
}): MatchPairsSpectatorReplay {
  const difficulty = input.difficulty ?? "normal";
  const focus = input.focus ?? "standard";
  const [leftId, rightId] = input.participantIds;
  for (const id of input.participantIds) if (!input.opponents.some((opponent) => opponent.id === id)) throw new Error(`match_pairs_replay_participant_missing:${id}`);
  let state = createMatchPairsState(input.faces, input.opponents, input.packVersion, input.seed, difficulty, rightId, input.sessionId, "spectate", leftId, focus);
  const frames: MatchPairsSpectatorReplayFrame[] = [];
  const apply = (action: MatchPairsAction) => {
    state = reduceMatchPairs(input.faces, input.opponents, state, action);
    if (input.captureFrames !== false) frames.push(Object.freeze({ action, state }));
  };
  apply({ type: "start", seed: input.seed });
  for (let guard = 0; state.status !== "complete" && guard < 512; guard += 1) apply(state.status === "checking" ? { type: "resolve" } : { type: "npc-reveal" });
  if (state.status !== "complete" || !state.outcome) throw new Error("match_pairs_replay_did_not_complete");
  const winningCharacterId = state.outcome === "draw" ? "draw" : state.opponentIds[state.outcome];
  if (!winningCharacterId) throw new Error("match_pairs_replay_winner_missing");
  return Object.freeze({
    seed: input.seed,
    participantIds: Object.freeze([leftId, rightId]) as readonly [string, string],
    frames: Object.freeze(frames),
    finalState: state,
    winningCharacterId,
    resultHash: matchPairsResultHash(state),
  });
}
