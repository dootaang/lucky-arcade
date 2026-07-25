import { XorShift32 } from "@lucky-arcade/engine";

export interface PileOffset { x: number; y: number; rotation: number; }

export function pileOffset(seed: string, index: number, cardId: string): PileOffset {
  const rng = new XorShift32(`${seed}:pile:${index}:${cardId}`);
  return {
    x: (rng.nextUint32() % 57) - 28,
    y: (rng.nextUint32() % 57) - 28,
    rotation: (rng.nextUint32() % 21) - 10,
  };
}
