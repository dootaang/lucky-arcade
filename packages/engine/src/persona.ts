import { XorShift32 } from "./random.ts";

export interface Persona {
  riskAppetite: number;
  readAccuracy: number;
  deceptionBias: number;
  consistency: number;
}

export const PERSONA_PRESETS = {
  open: { riskAppetite: 0.5, readAccuracy: 0.5, deceptionBias: 0, consistency: 0.85 },
  guarded: { riskAppetite: 0.35, readAccuracy: 0.7, deceptionBias: 0.3, consistency: 0.7 },
  bluffer: { riskAppetite: 0.7, readAccuracy: 0.6, deceptionBias: 0.75, consistency: 0.45 },
} as const satisfies Readonly<Record<"open" | "guarded" | "bluffer", Persona>>;

export function weightedChoice(weights: readonly number[], seed: string): number {
  if (weights.length === 0) return 0;
  const roll = new XorShift32(seed).next();
  const safe = weights.map((weight) => Number.isFinite(weight) && weight > 0 ? weight : 0);
  const total = safe.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 0;
  let cursor = roll * total;
  for (let index = 0; index < safe.length; index += 1) {
    cursor -= safe[index] ?? 0;
    if (cursor < 0) return index;
  }
  return safe.length - 1;
}

export function expressSignal<T>(truth: T, neutral: T, deceptive: T, weights: { truth: number; neutral: number; deceptive: number }, seed: string): T {
  return [truth, neutral, deceptive][weightedChoice([weights.truth, weights.neutral, weights.deceptive], seed)] as T;
}
