import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { availablePairs, cpuDrawIndex, createOldMaidState, inspectCardReaction, reduceOldMaid, temerosaOldMaidCartridge, validateCartridge, type OldMaidAction, type OldMaidState } from "../src/index.ts";

function autoplay(seed: string): { state: OldMaidState; actions: OldMaidAction[] } {
  let state = createOldMaidState(temerosaOldMaidCartridge, seed, "test-session");
  const actions: OldMaidAction[] = [{ type: "start" }];
  state = reduceOldMaid(temerosaOldMaidCartridge, state, actions[0] as OldMaidAction);
  actions.push({ type: "finish_deal" });
  state = reduceOldMaid(temerosaOldMaidCartridge, state, actions[1] as OldMaidAction);
  while (state.status !== "complete" && actions.length < 2_000) {
    const action: OldMaidAction = state.status === "revealing" ? { type: "collect_draw" }
      : state.status === "discarding" ? { type: "discard_pair", cardIds: availablePairs(temerosaOldMaidCartridge, state)[0] as [string, string] }
      : state.currentPlayerId === "player" ? { type: "draw", index: 0 } : { type: "cpu_draw" };
    actions.push(action);
    state = reduceOldMaid(temerosaOldMaidCartridge, state, action);
  }
  return { state, actions };
}

function autoplaySpectator(seed: string): OldMaidState {
  let state = createOldMaidState(temerosaOldMaidCartridge, seed, "spectator-session");
  state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start", mode: "spectate", characterIds: ["nemo", "pale", "kano", "alger"] });
  state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
  for (let step = 0; state.status !== "complete" && step < 2_000; step += 1) {
    const action: OldMaidAction = state.status === "revealing" ? { type: "collect_draw" }
      : state.status === "discarding" ? { type: "discard_pair", cardIds: availablePairs(temerosaOldMaidCartridge, state)[0] as [string, string] }
      : { type: "cpu_draw" };
    state = reduceOldMaid(temerosaOldMaidCartridge, state, action);
  }
  return state;
}

describe("old maid deterministic engine", () => {
  it("validates the expanded face pool, nine possible opponents, and exactly one joker", () => {
    expect(() => validateCartridge(temerosaOldMaidCartridge)).not.toThrow();
    expect(temerosaOldMaidCartridge.cards.length).toBeGreaterThan(60);
    expect(temerosaOldMaidCartridge.cards.filter((card) => card.pairId === null)).toEqual([
      expect.objectContaining({ faceId: "joker" }),
    ]);
    expect(temerosaOldMaidCartridge.characters).toHaveLength(9);
    expect(temerosaOldMaidCartridge.characters.find((character) => character.id === "nemo")?.portraits.neutral).toBe("nemo-magical-neutral");
    expect(temerosaOldMaidCartridge.characters.every((character) => Boolean(character.despairPortrait))).toBe(true);
  });

  it("does not begin play until the visible deal has completed", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "deal-phase", "test-session");
    expect(state.dealOrder).toHaveLength(25);
    expect(new Set(Object.values(state.characters)).size).toBe(3);
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start" });
    expect(state.status).toBe("dealing");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
    expect(state.status).toBe("discarding");
  });

  it("uses an explicitly selected set of three opponents", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "chosen-opponents", "test-session");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start", characterIds: ["nemo", "pale", "bacikal"] });
    expect(Object.values(state.characters)).toEqual(["nemo", "pale", "bacikal"]);
  });

  it("runs a four-NPC spectator table with no human turn", () => {
    const state = autoplaySpectator("spectator");
    expect(state.mode).toBe("spectate");
    expect(state.spectatorCharacterId).toBe("alger");
    expect(state.status).toBe("complete");
    expect(state.loserId).not.toBeNull();
  });

  it("keeps initial pairs until each visible discard action", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "initial-pairs-0", "test-session");
    for (let seed = 0; seed < 100; seed += 1) {
      state = createOldMaidState(temerosaOldMaidCartridge, `initial-pairs-${seed}`, "test-session");
      state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start" });
      state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
      if (state.status === "discarding") break;
    }
    expect(state.status).toBe("discarding");
    expect(availablePairs(temerosaOldMaidCartridge, state).length).toBeGreaterThan(0);
    while (state.status === "discarding") state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "discard_pair", cardIds: availablePairs(temerosaOldMaidCartridge, state)[0] as [string, string] });
    for (const hand of Object.values(state.hands)) {
      const pairIds = hand.map((cardId) => temerosaOldMaidCartridge.cards.find((card) => card.id === cardId)?.pairId).filter(Boolean);
      expect(new Set(pairIds).size).toBe(pairIds.length);
    }
  });

  it("uses only public turn metadata and target size for CPU draw selection", () => {
    expect(cpuDrawIndex("seed", 4, "cpu-1", "cpu-2", 5)).toBe(cpuDrawIndex("seed", 4, "cpu-1", "cpu-2", 5));
    expect(cpuDrawIndex("seed", 4, "cpu-1", "cpu-2", 5)).toBeLessThan(5);
  });

  it("lets an open opponent visibly react to the hovered joker", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "inspect-joker", "test-session");
    const jokerOwner = (Object.keys(state.hands) as (keyof typeof state.hands)[]).find((seatId) => state.hands[seatId].includes("joker-odd"));
    if (jokerOwner === "player" || !jokerOwner) {
      const cpuCard = state.hands["cpu-1"][0] as string;
      state = { ...state, hands: { ...state.hands, player: state.hands.player.filter((id) => id !== "joker-odd").concat(cpuCard), "cpu-1": state.hands["cpu-1"].filter((id) => id !== cpuCard).concat("joker-odd") } };
    } else if (jokerOwner !== "cpu-1") {
      const cpuCard = state.hands["cpu-1"][0] as string;
      state = { ...state, hands: { ...state.hands, [jokerOwner]: state.hands[jokerOwner].filter((id) => id !== "joker-odd").concat(cpuCard), "cpu-1": state.hands["cpu-1"].filter((id) => id !== cpuCard).concat("joker-odd") } };
    }
    state = { ...state, characters: { ...state.characters, "cpu-1": "pale" } };
    expect(inspectCardReaction(temerosaOldMaidCartridge, state, "cpu-1", "joker-odd")).toBe("pleased");
  });

  it("replays identical inputs to an identical final result", () => {
    const run = autoplay("replay");
    let replay = createOldMaidState(temerosaOldMaidCartridge, "replay", "test-session");
    for (const action of run.actions) replay = reduceOldMaid(temerosaOldMaidCartridge, replay, action);
    expect(run.state.status).toBe("complete");
    expect(resultHash(replay)).toBe(resultHash(run.state));
  });

  it("finishes 10,000 seeded games without a loop or a missing loser", () => {
    for (let seed = 0; seed < 10_000; seed += 1) {
      const run = autoplay(`stress-${seed}`);
      expect(run.state.status, `seed ${seed}`).toBe("complete");
    expect(run.state.loserId, `seed ${seed}`).not.toBeNull();
      expect(run.state.history.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(Object.values(run.state.hands).filter((hand) => hand.length > 0), `seed ${seed}`).toHaveLength(1);
    }
  });
});
