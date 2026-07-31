import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertSeriesNpcRecords, type TemerosaSeriesNpcInventory } from "../src/temerosa-series-npcs.ts";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "../src/temerosa-policy.ts";

const inventoryPath = fileURLToPath(new URL("../src/temerosa-series-npc-roster.generated.json", import.meta.url));

describe("Temerosa four-series NPC census", () => {
  it("keeps every source-presented persona separate by series", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    assertSeriesNpcRecords(inventory.records);
    expect(inventory.contract).toBe("temerosa-series-npc-inventory/0.1");
    expect(inventory.identityRule).toBe("series-and-source-persona");
    expect(inventory.totals).toMatchObject({ records: 116, loreBacked: 112, imageOnly: 4, houseRoles: 2 });
    expect(Object.fromEntries(inventory.sources.map((source) => [source.series, source.npcRecords]))).toEqual({ overture: 12, root2: 18, bestiaization: 57, finale: 29 });
  });

  it("does not merge the same identity across source series", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    const pale = inventory.records.filter((record) => (record.canonicalPersonKey ?? record.sourcePersonaKey) === "pale");
    expect(pale.map((record) => record.id).sort()).toEqual([
      "temerosa:finale:pale",
      "temerosa:overture:pale",
      "temerosa:root2:pale",
    ]);
    expect(inventory.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "temerosa:bestiaization:riel", canonicalPersonKey: "lyla" }),
      expect.objectContaining({ id: "temerosa:bestiaization:nieun-pluto", status: "needs-confirmation" }),
      expect.objectContaining({ id: "temerosa:finale:flask-impostor" }),
    ]));
  });

  it("retains evidence without embedding CHARX lore bodies", async () => {
    const raw = await readFile(inventoryPath, "utf8");
    const inventory = JSON.parse(raw) as TemerosaSeriesNpcInventory;
    expect(inventory.records.every((record) => record.loreEvidence.every((evidence) => /^[a-f0-9]{64}$/u.test(evidence.contentSha256)))).toBe(true);
    expect(raw).not.toContain("#### Personality");
    expect(raw).not.toContain("#### Speaking style");
  });

  it("never promotes a forbidden source image into an NPC candidate", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    for (const record of inventory.records) for (const asset of record.assetCandidates) {
      expect(TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.name), `${record.id}:${asset.name}`).toBe(false);
      expect(TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.path ?? ""), `${record.id}:${asset.path}`).toBe(false);
    }
  });
});
