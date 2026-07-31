import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMEROSA_LEGACY_NPC_SUCCESSORS } from "../src/temerosa-series-migration.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES } from "../src/temerosa-profiles.ts";

type Inventory = { records: readonly { id: string }[] };
const rosterPath = fileURLToPath(new URL("../../../apps/content-cli/src/temerosa-series-npc-roster.generated.json", import.meta.url));

describe("Temerosa legacy account successors", () => {
  it("maps every existing gambler once without cloning a target", () => {
    const legacyIds = TEMEROSA_NPC_GAMBLING_PROFILES.map((profile) => profile.id).sort();
    expect(Object.keys(TEMEROSA_LEGACY_NPC_SUCCESSORS).sort()).toEqual(legacyIds);
    expect(new Set(Object.values(TEMEROSA_LEGACY_NPC_SUCCESSORS)).size).toBe(legacyIds.length);
  });

  it("points every four-series successor at the frozen census", async () => {
    const inventory = JSON.parse(await readFile(rosterPath, "utf8")) as Inventory;
    const ids = new Set(inventory.records.map((record) => record.id));
    for (const [legacyId, successor] of Object.entries(TEMEROSA_LEGACY_NPC_SUCCESSORS)) {
      if (successor === "temerosa:guest:nemo") continue;
      expect(ids.has(successor), `${legacyId} -> ${successor}`).toBe(true);
    }
  });
});

