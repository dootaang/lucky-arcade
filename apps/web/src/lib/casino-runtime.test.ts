import { describe, expect, it } from "vitest";
import { casinoPresenceAt, casinoSpectatorMarketPresencesAt, casinoSpectatorMarketsAt, temerosaCasinoLedgerAtUtcSecond } from "@lucky-arcade/casino-ledger";
import { createCasinoRuntime } from "./casino-runtime.ts";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";
import type { StorageLike } from "./casino-ledger-cache.ts";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}
describe("casino background runtime", () => {
  it("preserves personal balances and plain-data floor results across cached and reversed time", () => {
    const runtime = createCasinoRuntime(memoryStorage());
    const baseline = memoryStorage();
    const start = Math.floor(Date.parse("2026-08-03T12:00:00+09:00") / 1_000);
    for (const second of [start, start + 60, start]) {
      const clock = { utcSecond: () => second, utcMinute: () => Math.floor(second / 60) };
      const { profiles, contract } = temerosaCasinoLedgerAtUtcSecond(second);
      const expected = personalCasinoWorldlineAt(profiles, clock, contract, [], baseline);
      expect(runtime.balances({ second, journal: [] })).toEqual({ npcBalances: expected.npcBalances, houseBalance: expected.houseBalance });
      const floor = runtime.floor({ second, journal: [] });
      expect(structuredClone(floor)).toEqual(floor);
      expect(floor.npcBalances).toEqual(expected.npcBalances);
      expect(floor.houseBalance).toBe(expected.houseBalance);
      expect(floor).not.toHaveProperty("activities"); // Do not clone a week of history every second.
      const base = casinoPresenceAt(profiles, clock, contract);
      const markets = casinoSpectatorMarketPresencesAt(casinoSpectatorMarketsAt(profiles, clock, contract, 4), second);
      const ids = new Set(markets.map((entry) => entry.npcId));
      expect(runtime.presence(second)).toEqual([...base.filter((entry) => !ids.has(entry.npcId)), ...markets]);
      const npcId = profiles[0]!.id;
      expect(runtime.history({ second, journal: [], npcId, days: 1 }).every((entry) => entry.npcId === npcId && entry.utcSecond <= second)).toBe(true);
    }
  }, 20_000);
});
