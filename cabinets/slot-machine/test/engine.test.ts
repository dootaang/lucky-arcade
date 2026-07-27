import { describe, expect, it } from "vitest";
import { SLOT_MACHINE_LINE_MULTIPLIER, SLOT_MACHINE_PAYLINES, SLOT_MACHINE_REACH_DURATION_MS, SLOT_MACHINE_REEL_DURATIONS_MS, createSlotMachineOutcome, createSlotMachinePresentation, createSlotMachineState, hasSlotMachineReach, reduceSlotMachine, selectSlotMachineVisualVariant, slotMachineCredit, type SlotMachineOutcome, type SlotMachineVisualVariant } from "../src/index.ts";

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

  it("accepts the expanded character roster without changing six-symbol payout odds", () => {
    const expanded = Array.from({ length: 38 }, (_, index) => ({ id: `character-${index}`, label: `Character ${index}`, weight: 1 as const }));
    for (let index = 0; index < 1_000; index += 1) {
      const outcome = createSlotMachineOutcome(expanded, "0.2.0", `expanded-${index}`);
      expect(new Set(outcome.activeSymbolIds).size).toBe(6);
      expect(outcome.grid.every((id) => outcome.activeSymbolIds.includes(id))).toBe(true);
    }
  });

  it("selects one deterministic series and expression per character and lands exact final columns", () => {
    const outcome = createSlotMachineOutcome(symbols, "0.2.0", "presentation-seed");
    const variants: SlotMachineVisualVariant[] = symbols.flatMap((symbol) => ["overture", "finale"].flatMap((series) => ["neutral", "pleased"].map((expression) => ({
      id: `${symbol.id}:${series}:${expression}`, symbolId: symbol.id, label: symbol.label, expression,
      appearanceSet: `${symbol.id}/${series}/current`, series: series as "overture" | "finale", src: `${symbol.id}.webp`, previewSrc: `${symbol.id}-sm.webp`,
    }))));
    const first = createSlotMachinePresentation(variants, outcome, "presentation-seed");
    const second = createSlotMachinePresentation(variants, outcome, "presentation-seed");
    expect(first).toEqual(second);
    expect(first.reels).toHaveLength(3);
    for (let reel = 0; reel < 3; reel += 1) {
      expect(first.reels[reel]?.slice(-3)).toEqual([outcome.grid[reel], outcome.grid[3 + reel], outcome.grid[6 + reel]]);
    }
    const chosen = selectSlotMachineVisualVariant(variants, symbols[0]!.id, "presentation-seed");
    expect(chosen.symbolId).toBe(symbols[0]!.id);
  });

  it("derives reach suspense only from the fixed grid without changing the outcome", () => {
    const base = { activeSymbolIds: symbols.slice(0, 6).map((symbol) => symbol.id), winningLineIndexes: [], payoutMultiplier: 0, rngPosition: 9 } as const;
    const reach = { ...base, grid: ["a", "a", "b", "c", "d", "e", "f", "g", "h"] } satisfies SlotMachineOutcome;
    const plain = { ...base, grid: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] } satisfies SlotMachineOutcome;
    expect(hasSlotMachineReach(reach)).toBe(true);
    expect(hasSlotMachineReach(plain)).toBe(false);
    expect(SLOT_MACHINE_REEL_DURATIONS_MS).toEqual([2_400, 3_150, 3_900]);
    expect(SLOT_MACHINE_REACH_DURATION_MS).toBe(4_600);
  });
});
