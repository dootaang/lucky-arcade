import { XorShift32 } from "@lucky-arcade/engine";
import type { SlotMachineOutcome, SlotMachineVisualVariant } from "./contracts.ts";

export const SLOT_MACHINE_REEL_FILLERS = [12, 15, 18] as const;
export const SLOT_MACHINE_REEL_DURATIONS_MS = [2_400, 3_150, 3_900] as const;
export const SLOT_MACHINE_REACH_DURATION_MS = 4_600;

export interface SlotMachinePresentation {
  variantsBySymbolId: Readonly<Record<string, SlotMachineVisualVariant>>;
  reels: readonly (readonly string[])[];
}

/**
 * A reach is visible after the first two reels stop: one of the five declared
 * paylines has the same symbol on those two reels. It changes timing only.
 */
export function hasSlotMachineReach(outcome: SlotMachineOutcome): boolean {
  const pairs: readonly (readonly [number, number])[] = [[0, 1], [3, 4], [6, 7], [0, 4], [6, 4]];
  return pairs.some(([left, middle]) => outcome.grid[left] === outcome.grid[middle]);
}

export function createSlotMachinePresentation(
  variants: readonly SlotMachineVisualVariant[],
  outcome: SlotMachineOutcome,
  spinSeed: string,
  leadingGrid?: readonly string[],
): SlotMachinePresentation {
  const symbols = [...new Set(outcome.activeSymbolIds)].sort();
  if (symbols.length === 0) throw new Error("slot_machine_presentation_symbols_missing");
  const reels = [0, 1, 2].map((reel) => {
    const rng = new XorShift32(`${spinSeed}:slot-reel:${reel}`);
    const leading = [0, 1, 2].map((row) => leadingGrid?.[row * 3 + reel] ?? symbols[(row + reel) % symbols.length] as string);
    let previous = leading[2];
    const filler = Array.from({ length: SLOT_MACHINE_REEL_FILLERS[reel] ?? SLOT_MACHINE_REEL_FILLERS[0] }, () => {
      let symbolId = symbols[rng.nextUint32() % symbols.length] as string;
      if (symbols.length > 1 && symbolId === previous) symbolId = symbols[(symbols.indexOf(symbolId) + 1) % symbols.length] as string;
      previous = symbolId;
      return symbolId;
    });
    const landing = [0, 1, 2].map((row) => outcome.grid[row * 3 + reel] as string);
    return Object.freeze([...leading, ...filler, ...landing]);
  });
  const presentedSymbols = [...new Set(reels.flat())].sort();
  const variantsBySymbolId = Object.fromEntries(presentedSymbols.map((symbolId) => [
    symbolId,
    selectSlotMachineVisualVariant(variants, symbolId, spinSeed),
  ]));
  return { variantsBySymbolId: Object.freeze(variantsBySymbolId), reels: Object.freeze(reels) };
}

export function selectSlotMachineVisualVariant(
  variants: readonly SlotMachineVisualVariant[],
  symbolId: string,
  spinSeed: string,
): SlotMachineVisualVariant {
  const matches = variants.filter((variant) => variant.symbolId === symbolId).sort((left, right) => left.id.localeCompare(right.id));
  if (matches.length === 0) throw new Error(`slot_machine_visual_missing:${symbolId}`);
  const series = [...new Set(matches.map((variant) => variant.series))].sort();
  const rng = new XorShift32(`${spinSeed}:slot-visual:${symbolId}`);
  const selectedSeries = series[rng.nextUint32() % series.length] as string;
  const seriesMatches = matches.filter((variant) => variant.series === selectedSeries);
  return seriesMatches[rng.nextUint32() % seriesMatches.length] as SlotMachineVisualVariant;
}
