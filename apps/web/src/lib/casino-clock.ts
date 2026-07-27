import type { CasinoPresentationClock } from "@lucky-arcade/casino-ledger";

export interface CasinoClockSample {
  serverEpochMs: number;
  sampledAtPerformanceMs: number;
  uncertaintyMs: number;
  source: "http-date" | "device";
}

export function casinoClockSampleFromResponse(
  response: Response,
  requestStartedPerformanceMs: number,
  responseReceivedPerformanceMs: number,
  deviceEpochMs = Date.now(),
): CasinoClockSample {
  const dateValue = response.headers.get("Date");
  const parsedDate = dateValue ? Date.parse(dateValue) : Number.NaN;
  const roundTripMs = Math.max(0, responseReceivedPerformanceMs - requestStartedPerformanceMs);
  if (Number.isFinite(parsedDate)) {
    const ageValue = response.headers.get("Age");
    const parsedAge = ageValue === null ? 0 : Number(ageValue);
    const ageMs = Number.isFinite(parsedAge) && parsedAge >= 0 ? parsedAge * 1_000 : 0;
    return Object.freeze({
      serverEpochMs: parsedDate + ageMs + roundTripMs / 2,
      sampledAtPerformanceMs: responseReceivedPerformanceMs,
      uncertaintyMs: Math.max(1_000, roundTripMs / 2 + 500),
      source: "http-date",
    });
  }
  return deviceCasinoClockSample(deviceEpochMs, responseReceivedPerformanceMs);
}

export function deviceCasinoClockSample(
  deviceEpochMs = Date.now(),
  sampledAtPerformanceMs = performance.now(),
): CasinoClockSample {
  return Object.freeze({
    serverEpochMs: deviceEpochMs,
    sampledAtPerformanceMs,
    uncertaintyMs: 60_000,
    source: "device",
  });
}

export function casinoClockFromSample(
  sample: CasinoClockSample,
  performanceNow: () => number = () => performance.now(),
): CasinoPresentationClock {
  const epochMs = () => sample.serverEpochMs + performanceNow() - sample.sampledAtPerformanceMs;
  return Object.freeze({
    utcMinute: () => Math.floor(epochMs() / 60_000),
    utcSecond: () => Math.floor(epochMs() / 1_000),
  });
}
