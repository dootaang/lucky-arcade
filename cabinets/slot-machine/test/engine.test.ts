import { describe, expect, it } from "vitest";
import { SLOT_MACHINE_LINE_MULTIPLIER, SLOT_MACHINE_PAYLINES, createSlotMachineOutcome, createSlotMachineState, reduceSlotMachine, slotMachineCredit } from "../src/index.ts";

const symbols = Array.from({ length: 16 }, (_, index) => ({ id: `symbol-${index}`, label: `Symbol ${index}`, weight: 1 as const }));

describe("slot machine core", () => {
  it("produces the same grid for the same pack and seed", () => {
    expect(createSlotMachineOutcome(symbols, "0.1.0", "same-seed")).toEqual(createSlotMachineOutcome(symbols, "0.1.0", "same-seed"));
  });

  it("derives every payout from the five declared paylines", () => {
    for (let index = 0; index < 10_000; index += 1) {
      const outcome = createSlotMachineOutcome(symbols, "0.1.0", `seed-${index}`);
      const expected = SLOT_MACHINE_PAYLINES.flatMap((line, lineIndex) => line.every((cell) => outcome.grid[cell] === outcome.grid[line[0]]) ? [lineIndex] : []);
      expect(outcome.winningLineIndexes).toEqual(expected);
      expect(outcome.payoutMultiplier).toBe(expected.length * SLOT_MACHINE_LINE_MULTIPLIER);
    }
  });

  it("locks the outcome at spin time and preserves it through finish", () => {
    const ready = createSlotMachineState("0.1.0");
    const spinning = reduceSlotMachine(symbols, ready, { type: "spin", spinSeed: "spin-1", stake: 50, wagerId: "wager-1" });
    const complete = reduceSlotMachine(symbols, spinning, { type: "finish" });
    expect(spinning.outcome).toEqual(complete.outcome);
    expect(slotMachineCredit(complete)).toBe(50 * (complete.outcome?.payoutMultiplier ?? 0));
  });
});
