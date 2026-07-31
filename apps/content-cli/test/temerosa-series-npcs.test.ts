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
    expect(inventory.contract).toBe("temerosa-series-npc-inventory/0.2");
    expect(inventory.identityRule).toBe("series-and-source-persona");
    expect(inventory.totals).toMatchObject({ records: 116, loreBacked: 112, imageOnly: 4, houseRoles: 2 });
    expect(Object.fromEntries(inventory.sources.map((source) => [source.series, source.npcRecords]))).toEqual({ overture: 12, root2: 18, bestiaization: 57, finale: 29 });
    expect(inventory.totals.roles).toEqual({ gambler: 114, dealer: 0, host: 0, house: 2 });
    expect(inventory.totals.statuses).toEqual({ confirmed: 112, "needs-confirmation": 4 });
    expect(inventory.totals.portraits).toEqual({ complete: 95, partial: 13, missing: 8 });
    expect(inventory.totals.releaseEligibility).toEqual({
      "casino-ready": 87,
      "ledger-only": 21,
      "house-only": 2,
      blocked: 4,
      excluded: 2,
    });
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

  it("keeps identity, role, evidence and release gates explicit on every record", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    expect(new Set(inventory.records.map((record) => record.id)).size).toBe(116);
    expect(inventory.records.every((record) => record.canonicalPersonKey.length > 0)).toBe(true);
    expect(inventory.records.filter((record) => record.status === "confirmed").every((record) => record.loreEvidence.length > 0)).toBe(true);
    expect(inventory.records.filter((record) => record.releaseEligibility === "blocked").every((record) => Boolean(record.pendingReason))).toBe(true);
    expect(inventory.records.filter((record) => record.releaseEligibility === "excluded").every((record) => Boolean(record.exclusionReason))).toBe(true);
    expect(inventory.records.every((record) => Boolean(record.exclusionReason) !== Boolean(record.pendingReason))).toBe(true);

    const imageOnly = inventory.records.filter((record) => record.loreEvidence.length === 0);
    expect(imageOnly.map((record) => record.id).sort()).toEqual([
      "temerosa:bestiaization:female",
      "temerosa:bestiaization:male",
      "temerosa:bestiaization:nieun-pluto",
      "temerosa:bestiaization:riel",
    ]);
    expect(imageOnly.every((record) => record.status === "needs-confirmation" && record.releaseEligibility === "blocked")).toBe(true);
  });

  it("keeps every Wares incarnation out of personal gambling wallets", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    const wares = inventory.records.filter((record) => record.sourcePersonaKey === "wares");
    expect(wares.map((record) => record.id)).toEqual(["temerosa:root2:wares", "temerosa:finale:wares"]);
    expect(wares.every((record) => record.role === "house" && record.releaseEligibility === "house-only")).toBe(true);
    expect(wares.every((record) => record.exclusionReason === "house-role-no-personal-wallet")).toBe(true);
  });

  it("retains Bacikal identities while excluding them from the standard selectable pool", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    const bacikal = inventory.records.filter((record) => record.sourcePersonaKey === "bacikal");
    expect(bacikal.map((record) => record.id)).toEqual(["temerosa:bestiaization:bacikal", "temerosa:finale:bacikal"]);
    expect(bacikal.every((record) => record.releaseEligibility === "excluded" && record.exclusionReason === "standard-casino-roster-excluded")).toBe(true);
  });

  it("never promotes a forbidden source image into an NPC candidate", async () => {
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as TemerosaSeriesNpcInventory;
    for (const record of inventory.records) for (const asset of record.assetCandidates) {
      expect(TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.name), `${record.id}:${asset.name}`).toBe(false);
      expect(TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.path ?? ""), `${record.id}:${asset.path}`).toBe(false);
    }
  });
});
