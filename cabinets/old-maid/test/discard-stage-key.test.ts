import { describe, expect, it } from "vitest";
import { discardStageKey } from "../src/react/discard-stage-key.ts";

describe("old maid discard stage identity", () => {
  it("changes after either one of two available pairs is discarded", () => {
    const both = discardStageKey("initial", "player", [["a-1", "a-2"], ["b-1", "b-2"]]);
    const afterFirst = discardStageKey("initial", "player", [["b-1", "b-2"]]);
    const afterSecond = discardStageKey("initial", "player", [["a-1", "a-2"]]);
    expect(afterFirst).not.toBe(both);
    expect(afterSecond).not.toBe(both);
  });

  it("is stable when pair and card ordering alone changes", () => {
    expect(discardStageKey("initial", "player", [["b-2", "b-1"], ["a-2", "a-1"]])).toBe(
      discardStageKey("initial", "player", [["a-1", "a-2"], ["b-1", "b-2"]]),
    );
  });
});
