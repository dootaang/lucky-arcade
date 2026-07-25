import { describe, expect, it } from "vitest";
import { createOldMaidState, publicRead, temerosaOldMaidCartridge, type OldMaidState } from "../src/index.ts";

describe("old maid public read", () => {
  it("contains only counts and keeps a reorder visible until the player is drawn from", () => {
    const base = createOldMaidState(temerosaOldMaidCartridge, "read");
    const state = { ...base, turn: 4, lastReorder: { turn: 1, toIndex: 2, count: 1 }, history: [{ type: "draw", turn: 2, actorId: "cpu-1", targetId: "cpu-2", faceId: "secret", madePair: false }] } as OldMaidState;
    const read = publicRead(state, "player");
    expect(read).toMatchObject({ reorderedSinceTargetDraw: true, reorderIndex: 2, reorderCount: 1, reorderedImmediatelyAfterDraw: false });
    expect(JSON.stringify(read)).not.toContain("secret");
    const consumed = { ...state, history: [...state.history, { type: "draw" as const, turn: 3, actorId: "cpu-3" as const, targetId: "player" as const, faceId: "hidden", madePair: false }] };
    expect(publicRead(consumed, "player").reorderedSinceTargetDraw).toBe(false);
  });

  it("reads each seat's 0.7 reorder without exposing its hand", () => {
    const base = createOldMaidState(temerosaOldMaidCartridge, "cpu-read");
    const state = { ...base, turn: 3, lastReorders: { "cpu-2": { turn: 2, fromIndex: 0, toIndex: 3, count: 1 } }, history: [{ type: "draw" as const, turn: 2, actorId: "cpu-2" as const, targetId: "cpu-3" as const, faceId: "hidden", madePair: false }] };
    const read = publicRead(state, "cpu-2");
    expect(read).toMatchObject({ reorderedSinceTargetDraw: true, reorderIndex: 3, reorderCount: 1, reorderedImmediatelyAfterDraw: true });
    expect(JSON.stringify(read)).not.toContain(state.hands["cpu-2"][0]);
  });
});
