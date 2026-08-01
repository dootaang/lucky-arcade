import { describe, expect, it } from "vitest";
import { casinoKstDayAtUtcSecond, casinoUtcSecondAtKstDay, TEMEROSA_FLOW_EPOCH_KST_DAY } from "@lucky-arcade/casino-ledger";
import { casinoClockFromSample, casinoClockSampleFromResponse, rememberCasinoClockSecond, stabilizeCasinoClockSample } from "./casino-clock.ts";

describe("casino clock", () => {
  it("uses Date without requiring Age and aligns different device clocks", () => {
    const response = new Response("{}", { headers: { Date: "Mon, 27 Jul 2026 12:34:00 GMT" } });
    const first = casinoClockSampleFromResponse(response, 100, 300, 1);
    const second = casinoClockSampleFromResponse(response, 1_000, 1_200, 9_999_999_999_999);
    expect(first.source).toBe("http-date");
    expect(casinoClockFromSample(first, () => 300).utcMinute()).toBe(casinoClockFromSample(second, () => 1_200).utcMinute());
  });

  it("adds a valid Age and falls back safely without Date", () => {
    const aged = casinoClockSampleFromResponse(new Response("{}", { headers: { Date: "Mon, 27 Jul 2026 12:34:00 GMT", Age: "30" } }), 0, 200, 1);
    expect(aged.serverEpochMs).toBe(Date.parse("Mon, 27 Jul 2026 12:34:00 GMT") + 30_100);
    const fallback = casinoClockSampleFromResponse(new Response("{}"), 0, 20, 123_456);
    expect(fallback).toMatchObject({ source: "device", serverEpochMs: 123_456 });
  });

  it("never rewinds across a reload when a browser cache replays an old Date", () => {
    const storage = memoryStorage();
    rememberCasinoClockSecond(1_000, storage);
    const stale = Object.freeze({ serverEpochMs: 900_000, sampledAtPerformanceMs: 20, uncertaintyMs: 1_000, source: "http-date" as const });
    const stabilized = stabilizeCasinoClockSample(stale, storage, 40);
    expect(casinoClockFromSample(stabilized, () => 40).utcSecond()).toBe(1_000);
    rememberCasinoClockSecond(999, storage);
    expect(stabilizeCasinoClockSample(stale, storage, 40).serverEpochMs).toBe(1_000_000);
  });

  it("keeps a fresh HTTP sample when it is ahead of the saved floor", () => {
    const storage = memoryStorage();
    rememberCasinoClockSecond(1_000, storage);
    const fresh = Object.freeze({ serverEpochMs: 1_100_000, sampledAtPerformanceMs: 20, uncertaintyMs: 1_000, source: "http-date" as const });
    expect(stabilizeCasinoClockSample(fresh, storage, 40)).toBe(fresh);
  });

  it("keeps the 1.1 to 1.2 candidate boundary on exact KST midnight seconds",()=>{
    const boundary=casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY);
    const before=Object.freeze({serverEpochMs:(boundary-1)*1_000,sampledAtPerformanceMs:10,uncertaintyMs:1_000,source:"http-date" as const});
    const after=Object.freeze({serverEpochMs:boundary*1_000,sampledAtPerformanceMs:10,uncertaintyMs:1_000,source:"http-date" as const});
    const beforeSecond=casinoClockFromSample(before,()=>10).utcSecond();
    const afterSecond=casinoClockFromSample(after,()=>10).utcSecond();
    expect(casinoKstDayAtUtcSecond(beforeSecond)).toBe(TEMEROSA_FLOW_EPOCH_KST_DAY-1);
    expect(casinoKstDayAtUtcSecond(afterSecond)).toBe(TEMEROSA_FLOW_EPOCH_KST_DAY);
    expect(afterSecond-beforeSecond).toBe(1);
  });
});

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
