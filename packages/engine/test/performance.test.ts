import { describe, expect, it } from "vitest";
import { makeReceipt } from "../src/index.ts";

function measure(count: number): number {
  const samples: number[] = [];
  let previous = "0".repeat(64);
  for (let sequence = 0; sequence < count; sequence += 1) {
    const start = performance.now();
    const receipt = makeReceipt(sequence, { type: "tick", value: sequence }, sequence, previous, { score: sequence, flags: [true, false] });
    previous = receipt.resultHash;
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length * 0.95)] ?? 0;
}

describe("action cost does not grow with history", () => {
  it("keeps 1,000-action p95 bounded", () => {
    measure(100);
    const small = measure(50), large = measure(1_000);
    expect(large).toBeLessThan(10);
    expect(large).toBeLessThanOrEqual(small * 1.2 + 0.2);
  });
});
