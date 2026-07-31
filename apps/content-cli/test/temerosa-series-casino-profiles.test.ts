import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CASINO_TABLE_IDS,
  PROFILE_GROUPS,
  buildSeriesCasinoProfiles,
  loadLegacySuccessorBehaviors,
  type SeriesCasinoProfileDocument,
  type SeriesRoster,
} from "../src/temerosa-series-flow-profile-overrides.ts";

const rosterUrl = new URL("../src/temerosa-series-npc-roster.generated.json", import.meta.url);
const generatedUrl = new URL("../src/temerosa-series-casino-profiles.generated.json", import.meta.url);
const sourceUrl = new URL("../src/temerosa-series-flow-profile-overrides.ts", import.meta.url);

async function fixtures() {
  const roster = JSON.parse(await readFile(rosterUrl, "utf8")) as SeriesRoster & {
    records: readonly (SeriesRoster["records"][number] & { canonicalPersonKey?: string; sourcePersonaKey: string })[];
  };
  const generated = JSON.parse(await readFile(generatedUrl, "utf8")) as SeriesCasinoProfileDocument;
  return { roster, generated };
}

describe("Temerosa series-scoped casino profiles", () => {
  it("covers all 116 source personas exactly once without canonical merging", async () => {
    const { roster, generated } = await fixtures();
    const assignments = Object.values(PROFILE_GROUPS).flat();
    expect(assignments).toHaveLength(116);
    expect(new Set(assignments).size).toBe(116);
    expect(generated.profiles.map(({ npcId }) => npcId)).toEqual(roster.records.map(({ id }) => id));
    expect(generated.profiles).toHaveLength(116);
    expect(generated.identityRule).toBe("series-and-source-persona");

    const canonicalGroups = Map.groupBy(roster.records, (record) => record.canonicalPersonKey ?? record.sourcePersonaKey);
    const repeated = [...canonicalGroups.values()].filter((records) => new Set(records.map(({ series }) => series)).size > 1);
    expect(repeated.length).toBeGreaterThan(0);
    for (const records of repeated) {
      for (const record of records) expect(generated.profiles.some(({ npcId }) => npcId === record.id)).toBe(true);
    }
  });

  it("keeps evidence minimal and requires it for every active profile", async () => {
    const { roster, generated } = await fixtures();
    const rosterById = new Map(roster.records.map((record) => [record.id, record]));
    for (const profile of generated.profiles) {
      if (profile.status === "active") expect(profile.evidenceRefs.length, profile.npcId).toBeGreaterThan(0);
      for (const ref of profile.evidenceRefs) {
        expect(Object.keys(ref).sort()).toEqual(["loreItem", "series", "sha256"]);
        expect(Object.keys(ref.loreItem).sort()).toEqual(["entryIndex", "label"]);
        expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(rosterById.get(profile.npcId)?.loreEvidence.some((item) => item.entryIndex === ref.loreItem.entryIndex && item.contentSha256 === ref.sha256)).toBe(true);
      }
    }
    const serialized = JSON.stringify(generated);
    for (const forbidden of ["canonicalPersonKey", "sourcePersonaKey", "aliases", "assetCandidates", "contentSha256"]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });

  it("preserves the 33 four-series successors and does not copy them to sibling series", async () => {
    const { generated } = await fixtures();
    const legacy = await loadLegacySuccessorBehaviors();
    expect(Object.keys(legacy)).toHaveLength(33);
    expect(legacy["temerosa:guest:nemo"]).toBeUndefined();
    const profiles = new Map(generated.profiles.map((profile) => [profile.npcId, profile]));
    for (const [successorId, baseline] of Object.entries(legacy)) {
      const behavior = profiles.get(successorId)?.behavior;
      expect(behavior, successorId).toBeDefined();
      expect(behavior).toMatchObject({
        riskAppetite: baseline.riskAppetite,
        stakeAggression: baseline.stakeAggression,
        lossChasing: baseline.lossChasing,
        stopLossDiscipline: baseline.stopLossDiscipline,
        takeProfitDiscipline: baseline.takeProfitDiscipline,
        visitsPerDay: baseline.visitsPerDay,
        preferredTables: baseline.preferredTables,
        gameSkills: baseline.gameSkills,
      });
      const suffix = successorId.split(":").at(-1);
      const siblingMatches = generated.profiles.filter((profile) => profile.npcId !== successorId && profile.npcId.endsWith(`:${suffix}`));
      expect(siblingMatches.every((profile) => JSON.stringify(profile.behavior) !== JSON.stringify(behavior))).toBe(true);
    }
  });

  it("validates basis points, ranges, tables, and house activation gates", async () => {
    const { generated } = await fixtures();
    const validTables = new Set<string>(CASINO_TABLE_IDS);
    const bps = (value: number, label: string) => {
      expect(Number.isInteger(value), label).toBe(true);
      expect(value, label).toBeGreaterThanOrEqual(0);
      expect(value, label).toBeLessThanOrEqual(10_000);
    };
    for (const profile of generated.profiles) {
      bps(profile.economy.casinoBudgetRateBps, `${profile.npcId}:budget`);
      for (const field of ["riskAppetite", "stakeAggression", "lossChasing", "stopLossDiscipline", "takeProfitDiscipline"] as const) {
        bps(profile.behavior[field], `${profile.npcId}:${field}`);
      }
      for (const [tableId, skill] of Object.entries(profile.behavior.gameSkills)) {
        expect(validTables.has(tableId), `${profile.npcId}:${tableId}`).toBe(true);
        bps(skill, `${profile.npcId}:${tableId}`);
      }
      expect(profile.behavior.preferredTables.every((tableId) => validTables.has(tableId))).toBe(true);
      for (const range of [profile.economy.dailyIncomeRange, profile.behavior.visitsPerDay, profile.behavior.roundsPerVisit]) {
        expect(Number.isInteger(range.min) && Number.isInteger(range.max)).toBe(true);
        expect(range.min).toBeGreaterThanOrEqual(0);
        expect(range.max).toBeGreaterThanOrEqual(range.min);
      }
      expect(Object.values(profile.fieldBasis).every((basis) => ["lore", "derived", "balance"].includes(basis))).toBe(true);
      if (["house", "dealer", "host"].includes(profile.role)) {
        expect(profile.status).not.toBe("active");
        expect(profile.behavior.visitsPerDay.max).toBe(0);
        expect(profile.behavior.preferredTables).toEqual([]);
      }
    }
  });

  it("is deterministic and contains no random profile assignment", async () => {
    const { roster, generated } = await fixtures();
    const legacy = await loadLegacySuccessorBehaviors();
    const rebuilt = buildSeriesCasinoProfiles(roster, legacy);
    expect(rebuilt).toEqual(generated);
    expect(buildSeriesCasinoProfiles(roster, legacy)).toEqual(rebuilt);
    const source = await readFile(sourceUrl, "utf8");
    expect(source).not.toMatch(/Math\.random|crypto\.random|xorshift|seededRandom/iu);
  });
});
