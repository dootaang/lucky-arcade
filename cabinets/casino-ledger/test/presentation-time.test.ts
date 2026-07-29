import { describe, expect, it } from "vitest";
import { CASINO_DISPLAY_TIME_ZONE, formatCasinoKstTimestamp } from "../src/presentation-time.ts";

describe("casino presentation time", () => {
  it("renders UTC instants in Korean Standard Time without changing the instant", () => {
    const utcSecond = Date.parse("2026-07-29T15:00:00Z") / 1_000;

    expect(CASINO_DISPLAY_TIME_ZONE).toBe("Asia/Seoul");
    expect(formatCasinoKstTimestamp(utcSecond)).toBe("2026. 7. 30. 00:00 KST");
  });

  it("rejects ambiguous sub-second inputs", () => {
    expect(() => formatCasinoKstTimestamp(1.5)).toThrow("npc_ledger_invalid_display_time");
  });
});
