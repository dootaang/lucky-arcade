import type { CasinoPresentationClock } from "@lucky-arcade/casino-ledger";

const CLOCK_FLOOR_KEY = "npc-ledger/1.0:clock-floor-second";

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

/**
 * Browser HTTP caches can replay an old Date header without an Age header.
 * Keep the clock monotonic across a reload even when that happens. The floor is
 * presentation state only; the fresh HTTP sample remains the authoritative
 * source whenever it is ahead.
 */
export function stabilizeCasinoClockSample(
  sample: CasinoClockSample,
  storage: ClockFloorStorage | undefined = browserSessionStorage(),
  performanceNow = performance.now(),
): CasinoClockSample {
  const sampledEpochMs = sample.serverEpochMs + performanceNow - sample.sampledAtPerformanceMs;
  const floorSecond = readClockFloor(storage);
  if (floorSecond === undefined || sampledEpochMs >= floorSecond * 1_000) {
    return sample;
  }
  return Object.freeze({
    ...sample,
    serverEpochMs: floorSecond * 1_000,
    sampledAtPerformanceMs: performanceNow,
  });
}

export function rememberCasinoClockSecond(
  utcSecond: number,
  storage: ClockFloorStorage | undefined = browserSessionStorage(),
): void {
  if (!storage || !Number.isSafeInteger(utcSecond) || utcSecond < 0) return;
  const previous = readClockFloor(storage);
  if (previous !== undefined && previous >= utcSecond) return;
  try { storage.setItem(CLOCK_FLOOR_KEY, String(utcSecond)); } catch { /* optional monotonic guard */ }
}

interface ClockFloorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readClockFloor(storage: ClockFloorStorage | undefined): number | undefined {
  if (!storage) return undefined;
  try {
    const value = Number(storage.getItem(CLOCK_FLOOR_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  } catch { return undefined; }
}

function browserSessionStorage(): ClockFloorStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
}
