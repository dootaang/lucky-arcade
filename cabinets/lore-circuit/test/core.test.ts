import { describe, expect, it } from "vitest";
import type { LoreCircuitCartridge } from "@lucky-arcade/contracts";
import { createLoreCircuitState, reduceLoreCircuit, scoreFor, selectLoreCircuit } from "../src/index.ts";

const cartridge: LoreCircuitCartridge = {
  contract: "lore-circuit-cartridge/0.1",
  cardFingerprint: "a".repeat(64), cardName: "시험 카드",
  nodes: [
    { id: "a", name: "입구", content: "은빛 열쇠", clues: [{ keyword: "은빛", targetLoreIds: ["b"] }] },
    { id: "b", name: "복도", content: "붉은 문", clues: [{ keyword: "붉은", targetLoreIds: ["c"] }] },
    { id: "c", name: "심장", content: "도착", clues: [] },
  ],
  puzzles: [{ id: "p", startKeyword: "입구", startLoreId: "a", targetLoreId: "c", targetName: "심장", optimalHops: 2 }],
};

describe("lore circuit core", () => {
  it("reveals one graph layer per move and wins deterministically", () => {
    let state = reduceLoreCircuit(createLoreCircuitState(cartridge, "daily"), { type: "start" }, cartridge);
    expect(selectLoreCircuit(state, cartridge).records.map((item) => item.id)).toEqual(["a"]);
    state = reduceLoreCircuit(state, { type: "dig", keyword: "은빛" }, cartridge);
    expect(selectLoreCircuit(state, cartridge).records.map((item) => item.id)).toEqual(["a", "b"]);
    state = reduceLoreCircuit(state, { type: "dig", keyword: "붉은" }, cartridge);
    expect(state.status).toBe("won");
    expect(state.score).toBe(1000);
  });
  it("ends after three invalid inputs", () => {
    let state = reduceLoreCircuit(createLoreCircuitState(cartridge, "x"), { type: "start" }, cartridge);
    for (let index = 0; index < 3; index += 1) state = reduceLoreCircuit(state, { type: "dig", keyword: "오답" }, cartridge);
    expect(state.status).toBe("lost");
    expect(state.mistakes).toBe(3);
  });
  it("uses a transparent bounded score formula", () => { expect(scoreFor(3, 1, 2)).toBe(730); expect(scoreFor(99, 9, 2)).toBe(100); });
  it("keeps ten thousand pure reducer transitions comfortably below a frame budget", () => {
    let state = createLoreCircuitState(cartridge, "perf");
    const started = performance.now();
    for (let index = 0; index < 10_000; index += 1) state = reduceLoreCircuit(state, { type: "start" }, cartridge);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
