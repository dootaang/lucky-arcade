import { describe, expect, it } from "vitest";
import { createOldMaidState, oldMaidOutcome, temerosaOldMaidCartridge, type OldMaidState } from "../src/index.ts";

describe("old maid outcome", () => {
  it("returns null until completion", () => { expect(oldMaidOutcome(createOldMaidState(temerosaOldMaidCartridge, "open"))).toBeNull(); });
  it("ranks every seat and puts the loser last", () => {
    const state = { ...createOldMaidState(temerosaOldMaidCartridge, "complete"), status: "complete", safeOrder: ["cpu-2", "player", "cpu-1"], loserId: "cpu-3" } as OldMaidState;
    expect(oldMaidOutcome(state)?.ranking.map(({ seatId, rank }) => [seatId, rank])).toEqual([["cpu-2", 1], ["player", 2], ["cpu-1", 3], ["cpu-3", 4]]);
    expect(oldMaidOutcome(state)).toMatchObject({ oddCardHolderId: "cpu-3", oddCardHolderCharacterId: state.characters["cpu-3"] });
  });
});
