import { describe, expect, it } from "vitest";
import {
  CASINO_TIME_ZONE,
  casinoKstDayAtUtcSecond,
  casinoSecondOfKstDayAtUtcSecond,
  casinoUtcSecondAtKstDay,
} from "../src/index.ts";

describe("casino KST calendar", () => {
  it("opens the 2026-07-30 casino day at KST midnight", () => {
    const before = Date.parse("2026-07-29T14:59:59Z") / 1_000;
    const midnight = Date.parse("2026-07-29T15:00:00Z") / 1_000;
    expect(CASINO_TIME_ZONE).toBe("Asia/Seoul");
    expect(casinoKstDayAtUtcSecond(before)).toBe(20_663);
    expect(casinoKstDayAtUtcSecond(midnight)).toBe(20_664);
    expect(casinoSecondOfKstDayAtUtcSecond(midnight)).toBe(0);
    expect(casinoUtcSecondAtKstDay(20_664)).toBe(midnight);
  });

  it("keeps noon and the final second inside the same KST day", () => {
    const noon = casinoUtcSecondAtKstDay(20_664, 12 * 3_600);
    const final = casinoUtcSecondAtKstDay(20_664, 86_399);
    expect(casinoSecondOfKstDayAtUtcSecond(noon)).toBe(43_200);
    expect(casinoKstDayAtUtcSecond(final)).toBe(20_664);
  });
});
