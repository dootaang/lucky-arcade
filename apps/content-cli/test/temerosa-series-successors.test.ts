import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TemerosaSeriesNpcInventory } from "../src/temerosa-series-npcs.ts";

const rosterPath = fileURLToPath(new URL("../src/temerosa-series-npc-roster.generated.json", import.meta.url));
const migrationPath = fileURLToPath(new URL("../../../cabinets/casino-ledger/src/temerosa-series-migration.ts", import.meta.url));

describe("read-only legacy successor audit", () => {
  it("preserves all legacy ids and permits only the authored Bacikal-to-Nemo fold", async () => {
    const source = await readFile(migrationPath, "utf8");
    const entries = [...source.matchAll(/^\s*(?:"([a-z0-9-]+)"|([a-z0-9-]+)):\s*"(temerosa:[a-z0-9-]+:[a-z0-9-]+)",$/gmu)]
      .map((match) => ({ legacyId: match[1] ?? match[2] ?? "", successorId: match[3] ?? "" }));
    expect(entries).toHaveLength(34);
    expect(new Set(entries.map((entry) => entry.legacyId)).size).toBe(34);
    expect(new Set(entries.map((entry) => entry.successorId)).size).toBe(33);
    const grouped = Map.groupBy(entries, (entry) => entry.successorId);
    expect([...grouped.entries()].filter(([, predecessors]) => predecessors.length > 1)).toEqual([
      ["temerosa:guest:nemo", [
        { legacyId: "bacikal", successorId: "temerosa:guest:nemo" },
        { legacyId: "nemo", successorId: "temerosa:guest:nemo" },
      ]],
    ]);

    const inventory = JSON.parse(await readFile(rosterPath, "utf8")) as TemerosaSeriesNpcInventory;
    const rosterIds = new Set(inventory.records.map((record) => record.id));
    for (const entry of entries) {
      expect(entry.successorId === "temerosa:guest:nemo" || rosterIds.has(entry.successorId), `${entry.legacyId} -> ${entry.successorId}`).toBe(true);
    }
    expect(entries.find((entry) => entry.legacyId === "nemo")?.successorId).toBe("temerosa:guest:nemo");
    expect(entries.find((entry) => entry.legacyId === "bacikal")?.successorId).toBe("temerosa:guest:nemo");
  });
});
