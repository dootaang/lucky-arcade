import { describe, expect, it } from "vitest";
import { completedDayBalances, TEMEROSA_NPC_LEDGER_CONTRACT, type CasinoClock } from "@lucky-arcade/casino-ledger";
import { npcBalancesAtWithCheckpoint, readLatestCheckpoint, writeCheckpoint } from "./casino-ledger-cache.ts";

describe("casino ledger checkpoint adapter", () => {
  it("matches a full calculation after saving and reusing a checkpoint", () => {
    const storage = new MemoryStorage();
    const clock = fixedClock((TEMEROSA_NPC_LEDGER_CONTRACT.epochUtcDay + 8) * 1_440 + 700);
    const first = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT, storage);
    const second = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT, storage);
    const withoutCache = npcBalancesAtWithCheckpoint(clock, TEMEROSA_NPC_LEDGER_CONTRACT, new MemoryStorage());
    expect(second.balances).toEqual(first.balances);
    expect(second.balances).toEqual(withoutCache.balances);
  });

  it("rejects corrupt, future and foreign-contract checkpoints", () => {
    const storage = new MemoryStorage();
    storage.setItem("npc-ledger/0.1:checkpoint:99", JSON.stringify({ contract: "npc-ledger/0.1", dayIndex: 99, balances: {} }));
    storage.setItem("npc-ledger/0.1:checkpoint:2", JSON.stringify({ contract: "npc-ledger/9.9", dayIndex: 2, balances: {} }));
    expect(readLatestCheckpoint(storage, 5, TEMEROSA_NPC_LEDGER_CONTRACT)).toBeUndefined();
    expect(storage.length).toBe(0);
  });

  it("keeps only the latest two valid checkpoints", () => {
    const contract = TEMEROSA_NPC_LEDGER_CONTRACT;
    const storage = new MemoryStorage();
    for (const dayIndex of [1, 2, 3]) {
      writeCheckpoint(storage, { contract: contract.version, dayIndex, balances: completedDayBalances(contract.profiles, dayIndex, contract) }, contract);
    }
    expect(storage.keys().sort()).toEqual(["npc-ledger/0.1:checkpoint:2", "npc-ledger/0.1:checkpoint:3"]);
  });
});

function fixedClock(minute: number): CasinoClock { return { utcMinute: () => minute }; }

class MemoryStorage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.#values.set(key, value); }
  removeItem(key: string): void { this.#values.delete(key); }
  keys(): string[] { return [...this.#values.keys()]; }
}
