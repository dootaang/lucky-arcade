import { describe, expect, it } from "vitest";
import { casinoClockFromSample, casinoClockSampleFromResponse } from "./casino-clock.ts";

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
});
