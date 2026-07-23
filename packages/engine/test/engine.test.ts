import { describe, expect, it } from "vitest";
import { canonicalJson, resultHash, XorShift32 } from "../src/index.ts";

describe("deterministic engine seed", () => {
  it("keeps a golden random vector", () => {
    const rng = new XorShift32("lucky-arcade");
    expect(Array.from({ length: 5 }, () => rng.nextUint32())).toEqual([1004586977, 1082276751, 4186494646, 2291303481, 3668758099]);
  });

  it("hashes objects independent of key insertion order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(resultHash({ b: 2, a: 1 })).toBe(resultHash({ a: 1, b: 2 }));
  });
});
