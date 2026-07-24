import type { BuiltInContentPack } from "@lucky-arcade/contracts";
import { describe, expect, it } from "vitest";
import { createSpriteMemoryState, reduceSpriteMemory, spriteMemoryResultHash } from "../src/index.ts";

const pack: BuiltInContentPack = {
  contract: "built-in-content-pack/0.1", packId: "fixture", version: "1", title: "시험 세계", loreEntryCount: 0,
  characters: Array.from({ length: 8 }, (_, index) => ({ id: `c${index}`, name: `인물 ${index}`, assets: { natural: `/c${index}.webp`, joy: `/c${index}-joy.webp` } })),
};

describe("sprite memory", () => {
  it("creates the same sequence for the same pack and seed", () => {
    expect(createSpriteMemoryState(pack, "daily")).toEqual(createSpriteMemoryState(pack, "daily"));
  });

  it("completes five deterministic rounds with correct input", () => {
    let state = reduceSpriteMemory(createSpriteMemoryState(pack, "win"), { type: "start" });
    while (state.status !== "won") {
      state = reduceSpriteMemory(state, { type: "preview_complete" });
      for (const id of state.sequence) state = reduceSpriteMemory(state, { type: "choose", characterId: id });
    }
    expect(state.round).toBe(5);
    expect(spriteMemoryResultHash(state)).toHaveLength(64);
  });

  it("fails immediately on a wrong character", () => {
    let state = reduceSpriteMemory(createSpriteMemoryState(pack, "lose"), { type: "start" });
    state = reduceSpriteMemory(state, { type: "preview_complete" });
    const wrong = state.roster.find((id) => id !== state.sequence[0]);
    state = reduceSpriteMemory(state, { type: "choose", characterId: wrong ?? "missing" });
    expect(state.status).toBe("lost");
  });
});
