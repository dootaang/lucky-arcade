import type { OldMaidAction, OldMaidCartridge, OldMaidState } from "./contracts.ts";
import { availablePairs, createOldMaidState, reduceOldMaid } from "./engine.ts";
import { oldMaidOutcome } from "./outcome.ts";
import { resultHash } from "@lucky-arcade/engine";

export interface OldMaidSpectatorReplayFrame {
  readonly action: OldMaidAction;
  readonly state: OldMaidState;
}

export interface OldMaidSpectatorReplay {
  readonly seed: string;
  readonly participantIds: readonly [string, string, string, string];
  readonly frames: readonly OldMaidSpectatorReplayFrame[];
  readonly finalState: OldMaidState;
  readonly oddCardHolderCharacterId: string;
  readonly resultHash: string;
}

/** Canonical four-NPC autoplay. Hidden card identities never leave the state. */
export function createOldMaidSpectatorReplay(input: {
  cartridge: OldMaidCartridge;
  seed: string;
  sessionId: string;
  participantIds: readonly [string, string, string, string];
  captureFrames?: boolean;
}): OldMaidSpectatorReplay {
  const selectable = new Set(input.cartridge.selectableCharacterIds ?? input.cartridge.characters.map((character) => character.id));
  for (const id of input.participantIds) if (!selectable.has(id)) throw new Error(`old_maid_replay_participant_missing:${id}`);
  let state = createOldMaidState(input.cartridge, input.seed, input.sessionId);
  const frames: OldMaidSpectatorReplayFrame[] = [];
  const apply = (action: OldMaidAction) => {
    state = reduceOldMaid(input.cartridge, state, action);
    if (input.captureFrames !== false) frames.push(Object.freeze({ action, state }));
  };
  apply({ type: "start", mode: "spectate", characterIds: [...input.participantIds] });
  apply({ type: "finish_deal" });
  for (let guard = 0; state.status !== "complete" && guard < 2_048; guard += 1) apply(nextOldMaidSpectatorAction(input.cartridge, state));
  const outcome = oldMaidOutcome(state);
  if (!outcome?.oddCardHolderCharacterId) throw new Error("old_maid_replay_did_not_complete");
  return Object.freeze({
    seed: input.seed,
    participantIds: Object.freeze([...input.participantIds]) as unknown as readonly [string, string, string, string],
    frames: Object.freeze(frames),
    finalState: state,
    oddCardHolderCharacterId: outcome.oddCardHolderCharacterId,
    resultHash: resultHash(state),
  });
}

export function nextOldMaidSpectatorAction(cartridge: OldMaidCartridge, state: OldMaidState): OldMaidAction {
  if (state.status === "revealing") return { type: "collect_draw" };
  if (state.status === "discarding") {
    const pair = availablePairs(cartridge, state)[0];
    if (!pair) throw new Error("old_maid_replay_pair_missing");
    return { type: "discard_pair", cardIds: pair };
  }
  if (state.status === "offering") return state.offer?.phase === "arranging" ? { type: "prepare_cpu_offer" } : { type: "finish_offer" };
  if (state.status === "playing") return { type: "cpu_draw" };
  throw new Error(`old_maid_replay_action_missing:${state.status}`);
}
