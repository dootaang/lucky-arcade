import { resultHash } from "@lucky-arcade/engine";
import { describe, expect, it } from "vitest";
import { availablePairs, cpuDrawIndex, createOldMaidState, reduceOldMaid, temerosaOldMaidCartridge, validateCartridge, type OldMaidAction, type OldMaidState } from "../src/index.ts";

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

describe("old maid deterministic engine", () => {
  it("validates nine pairs, eight possible opponents, and exactly one joker", () => {
    expect(() => validateCartridge(temerosaOldMaidCartridge)).not.toThrow();
    expect(temerosaOldMaidCartridge.cards).toHaveLength(19);
    expect(temerosaOldMaidCartridge.cards.filter((card) => card.pairId === null)).toEqual([
      expect.objectContaining({ faceId: "joker" }),
    ]);
    expect(temerosaOldMaidCartridge.characters).toHaveLength(8);
    expect(temerosaOldMaidCartridge.characters.find((character) => character.id === "nemo")?.portraits.neutral).toBe("nemo-magical-neutral");
  });

  it("does not begin play until the visible deal has completed", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "deal-phase", "test-session");
    expect(state.dealOrder).toHaveLength(19);
    expect(new Set(Object.values(state.characters)).size).toBe(3);
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start" });
    expect(state.status).toBe("dealing");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
    expect(state.status).toBe("discarding");
  });

  it("keeps initial pairs until each visible discard action", () => {
    let state = createOldMaidState(temerosaOldMaidCartridge, "initial-pairs", "test-session");
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "start" });
    state = reduceOldMaid(temerosaOldMaidCartridge, state, { type: "finish_deal" });
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
      expect(Object.values(run.state.hands).filter((hand) => hand.length > 0), `seed ${seed}`).toHaveLength(1);
    }
  });
});
