import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { casinoPresenceAt } from "../src/presence.ts";
import { recentNpcPlayEventsAt } from "../src/live-tape.ts";
import { casinoUtcSecondAtKstDay } from "../src/casino-time.ts";

// Opt-in: real 103-profile cold simulation is intentionally outside fast gates.
// CASINO_HISTORY_BENCHMARK=1 vitest run test/history-cache-benchmark.test.ts
// CASINO_HISTORY_BENCHMARK_DAYS=365 additionally exercises a full cold year.
it.skipIf(process.env.CASINO_HISTORY_BENCHMARK !== "1")("benchmarks real presence and tape cold/warm", async () => {
  const { temerosaCasinoLedgerAtUtcSecond } = await import("../src/temerosa-flow-contract.ts");
  const realSecond = Date.parse("2026-09-16T12:00:00+09:00") / 1_000;
  const source = temerosaCasinoLedgerAtUtcSecond(realSecond);
  expect(source.profiles).toHaveLength(103);
  const dayOverride = process.env.CASINO_HISTORY_BENCHMARK_DAYS;
  const now = dayOverride === undefined ? realSecond
    : casinoUtcSecondAtKstDay(source.contract.epochKstDay + Number(dayOverride), 43_200);
  const time = { utcSecond: () => now, utcMinute: () => Math.floor(now / 60) };
  const measure = <T,>(run: () => T) => {
    const started = performance.now(), value = run();
    return { value, ms: performance.now() - started };
  };
  for (const kind of ["presence", "live-tape"] as const) {
    // Separate contract identities ensure both consumers really start cold.
    const contract = { ...source.contract }, profiles = contract.profiles;
    const run = () => kind === "presence" ? casinoPresenceAt(profiles, time, contract)
      : recentNpcPlayEventsAt(profiles, time, contract, 100);
    const cold = measure(run), warm = measure(run);
    expect(warm.value).toEqual(cold.value);
    const shared = measure(() => kind === "presence" ? recentNpcPlayEventsAt(profiles, time, contract, 100)
      : casinoPresenceAt(profiles, time, contract));
    console.log(JSON.stringify({ kind, profiles: profiles.length, utc: new Date(now * 1_000).toISOString(),
      coldMs: cold.ms, warmMs: warm.ms, sharedConsumerMs: shared.ms,
      sha256: createHash("sha256").update(JSON.stringify(cold.value)).digest("hex") }));
  }
}, 300_000);
