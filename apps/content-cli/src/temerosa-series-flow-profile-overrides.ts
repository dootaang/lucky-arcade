import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const CASINO_TABLE_IDS = [
  "temerosa-old-maid",
  "temerosa-match-pairs",
  "temerosa-slot",
  "indian-poker",
  "temerosa-high-low",
  "temerosa-five-card-draw",
] as const;

export type CasinoTableId = (typeof CASINO_TABLE_IDS)[number];
export type ProfileStatus = "active" | "inactive" | "needs-confirmation";
export type ProfileRole = "gambler" | "house" | "dealer" | "host" | "non-gambler";
export type FieldBasis = "lore" | "derived" | "balance";
export type IntRange = Readonly<{ min: number; max: number }>;

export interface SeriesRosterRecord {
  readonly id: string;
  readonly series: "overture" | "root2" | "bestiaization" | "finale";
  readonly displayName: string;
  readonly qualifiedName: string;
  readonly role: "gambler" | "house";
  readonly status: "confirmed" | "needs-review";
  readonly loreEvidence: readonly Readonly<{
    entryIndex: number;
    comment: string;
    contentSha256: string;
  }>[];
}

export interface SeriesRoster {
  readonly contract: string;
  readonly generatedAt: string;
  readonly records: readonly SeriesRosterRecord[];
}

export interface EvidenceRef {
  readonly series: SeriesRosterRecord["series"];
  readonly loreItem: Readonly<{ entryIndex: number; label: string }>;
  readonly sha256: string;
}

export interface CasinoBehavior {
  readonly riskAppetite: number;
  readonly stakeAggression: number;
  readonly lossChasing: number;
  readonly stopLossDiscipline: number;
  readonly takeProfitDiscipline: number;
  readonly visitsPerDay: IntRange;
  readonly roundsPerVisit: IntRange;
  readonly preferredTables: readonly CasinoTableId[];
  readonly gameSkills: Readonly<Record<CasinoTableId, number>>;
}

export interface LegacySuccessorBehavior extends CasinoBehavior {
  readonly legacyNpcId: string;
}

export interface SeriesCasinoProfile {
  readonly npcId: string;
  readonly status: ProfileStatus;
  readonly role: ProfileRole;
  readonly sourceLabel: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly economy: Readonly<{
    dailyIncomeRange: IntRange;
    casinoBudgetRateBps: number;
    settlementWindow: Readonly<{ timezone: "Asia/Seoul"; startMinute: number; endMinute: number }>;
  }>;
  readonly behavior: CasinoBehavior;
  readonly fieldBasis: Readonly<Record<string, FieldBasis>>;
  readonly rationale: readonly string[];
}

export interface SeriesCasinoProfileDocument {
  readonly contract: "temerosa-series-casino-profiles/0.1";
  readonly generatedFrom: Readonly<{ rosterContract: string; rosterGeneratedAt: string }>;
  readonly identityRule: "series-and-source-persona";
  readonly profiles: readonly SeriesCasinoProfile[];
}

type Archetype = "cautious" | "disciplined" | "analytical" | "balanced" | "playful" | "aggressive" | "impulsive" | "competitive" | "guarded" | "low-engagement";

/** Every roster ID is assigned by editorial review. There is deliberately no fallback. */
export const PROFILE_GROUPS: Readonly<Record<Archetype, readonly string[]>> = Object.freeze({
  cautious: [
    "temerosa:overture:mascot",
    "temerosa:bestiaization:deokbae", "temerosa:bestiaization:esther", "temerosa:bestiaization:lyla", "temerosa:bestiaization:nemo-slaughter-orbit",
    "temerosa:finale:aberrant-mia", "temerosa:finale:alger", "temerosa:finale:apollyon", "temerosa:finale:echo",
    "temerosa:finale:jia", "temerosa:finale:lilim", "temerosa:finale:limet", "temerosa:finale:nantucket",
    "temerosa:finale:renoa", "temerosa:finale:shino",
  ],
  disciplined: [
    "temerosa:root2:dismas", "temerosa:root2:hab", "temerosa:root2:lyla", "temerosa:root2:wares",
    "temerosa:finale:a", "temerosa:finale:bacikal", "temerosa:finale:nayuta", "temerosa:finale:wares",
  ],
  analytical: [
    "temerosa:overture:elton-carrasco", "temerosa:overture:lyla", "temerosa:root2:nieun",
    "temerosa:bestiaization:a", "temerosa:bestiaization:adesha", "temerosa:bestiaization:alger",
    "temerosa:bestiaization:boris-leblanc", "temerosa:bestiaization:cicero", "temerosa:bestiaization:francis",
    "temerosa:bestiaization:iweleth", "temerosa:bestiaization:katrinka", "temerosa:bestiaization:kreva",
    "temerosa:bestiaization:kudryavka", "temerosa:bestiaization:machina", "temerosa:bestiaization:maryhub",
    "temerosa:bestiaization:nieun", "temerosa:bestiaization:phaeo", "temerosa:bestiaization:raven",
    "temerosa:bestiaization:snow-rim", "temerosa:bestiaization:spiril", "temerosa:bestiaization:strelka",
    "temerosa:bestiaization:temute", "temerosa:bestiaization:traver",
  ],
  balanced: [
    "temerosa:bestiaization:anna", "temerosa:bestiaization:bamcapis", "temerosa:bestiaization:cab",
    "temerosa:bestiaization:cradle", "temerosa:bestiaization:dorsinea", "temerosa:bestiaization:gestas",
    "temerosa:bestiaization:hiro", "temerosa:bestiaization:limet", "temerosa:bestiaization:nayuta",
    "temerosa:bestiaization:renoa", "temerosa:bestiaization:sakabus", "temerosa:bestiaization:female",
    "temerosa:bestiaization:male", "temerosa:bestiaization:nieun-pluto", "temerosa:bestiaization:riel",
    "temerosa:finale:mascot", "temerosa:finale:nieun",
  ],
  playful: [
    "temerosa:overture:ishmael", "temerosa:overture:mortem",
    "temerosa:root2:ishmael", "temerosa:root2:mortem", "temerosa:root2:nevy",
  ],
  aggressive: [
    "temerosa:overture:hab", "temerosa:overture:tashtego", "temerosa:root2:tashtego",
    "temerosa:bestiaization:bacikal", "temerosa:bestiaization:camille", "temerosa:bestiaization:flask",
    "temerosa:bestiaization:habwen", "temerosa:bestiaization:leviathan", "temerosa:bestiaization:levillotte",
    "temerosa:bestiaization:nostalgia", "temerosa:bestiaization:sherirus", "temerosa:bestiaization:tumit-tu",
    "temerosa:finale:flask", "temerosa:finale:kano", "temerosa:finale:nostalgia", "temerosa:finale:tashtego",
  ],
  impulsive: [
    "temerosa:overture:kano", "temerosa:overture:merry-pip", "temerosa:overture:pale",
    "temerosa:root2:ayase", "temerosa:root2:kano", "temerosa:root2:merry-pip", "temerosa:root2:pale", "temerosa:root2:revi",
    "temerosa:bestiaization:bche", "temerosa:bestiaization:diamo", "temerosa:bestiaization:ttaengchil", "temerosa:bestiaization:yul",
    "temerosa:finale:pale", "temerosa:finale:ttaengchil",
  ],
  competitive: [
    "temerosa:overture:septendecilliono", "temerosa:root2:nostalgia", "temerosa:root2:presser",
    "temerosa:root2:reila", "temerosa:root2:septendecilliono", "temerosa:finale:bamcapis", "temerosa:finale:beta",
  ],
  guarded: [
    "temerosa:finale:al2zus", "temerosa:finale:car5p3", "temerosa:finale:flask-impostor",
    "temerosa:finale:mia", "temerosa:finale:silentium",
  ],
  "low-engagement": [
    "temerosa:overture:licanica", "temerosa:bestiaization:apollyon", "temerosa:bestiaization:echo",
    "temerosa:bestiaization:jia", "temerosa:bestiaization:lilim", "temerosa:bestiaization:morsisa",
  ],
});

const NEEDS_CONFIRMATION = new Set([
  "temerosa:bestiaization:esther", "temerosa:bestiaization:female", "temerosa:bestiaization:leviathan",
  "temerosa:bestiaization:male", "temerosa:bestiaization:nemo-slaughter-orbit", "temerosa:bestiaization:nieun-pluto",
  "temerosa:bestiaization:riel", "temerosa:bestiaization:sherirus", "temerosa:finale:al2zus",
  "temerosa:finale:car5p3", "temerosa:finale:flask-impostor", "temerosa:finale:mia", "temerosa:finale:silentium",
]);

const ARCHETYPES: Readonly<Record<Archetype, CasinoBehavior>> = Object.freeze({
  cautious: behavior(2_800, 3_000, 1_800, 8_200, 7_600, [1, 2], [2, 4], ["temerosa-old-maid", "temerosa-match-pairs", "temerosa-high-low"], [6_200, 6_800, 4_000, 5_300, 6_600, 5_300]),
  disciplined: behavior(3_600, 4_200, 1_500, 9_000, 8_500, [1, 2], [3, 5], ["temerosa-match-pairs", "indian-poker", "temerosa-five-card-draw"], [6_500, 7_800, 4_000, 7_100, 7_200, 7_100]),
  analytical: behavior(4_300, 4_800, 2_200, 8_200, 8_000, [1, 3], [3, 6], ["temerosa-match-pairs", "indian-poker", "temerosa-five-card-draw", "temerosa-high-low"], [6_400, 8_100, 4_200, 7_800, 7_700, 7_800]),
  balanced: behavior(5_000, 5_000, 3_500, 6_500, 6_500, [1, 3], [3, 6], ["temerosa-old-maid", "temerosa-match-pairs", "temerosa-high-low"], [6_000, 6_000, 5_000, 5_800, 6_000, 5_800]),
  playful: behavior(6_500, 6_200, 5_200, 4_800, 5_200, [2, 4], [4, 8], ["temerosa-slot", "temerosa-high-low", "temerosa-old-maid"], [6_200, 5_400, 5_000, 5_500, 5_700, 5_500]),
  aggressive: behavior(7_600, 8_200, 6_600, 4_200, 4_800, [2, 4], [5, 9], ["indian-poker", "temerosa-five-card-draw", "temerosa-high-low"], [5_700, 5_800, 4_800, 6_900, 6_400, 6_900]),
  impulsive: behavior(8_800, 8_500, 8_200, 2_200, 2_800, [2, 5], [6, 12], ["temerosa-slot", "temerosa-high-low", "temerosa-old-maid"], [5_000, 4_600, 5_000, 5_100, 5_200, 5_100]),
  competitive: behavior(7_800, 8_000, 7_900, 3_500, 4_500, [2, 5], [5, 10], ["indian-poker", "temerosa-five-card-draw", "temerosa-match-pairs"], [6_100, 6_800, 4_500, 7_000, 6_300, 7_000]),
  guarded: behavior(6_200, 6_700, 5_000, 6_000, 6_500, [1, 3], [3, 7], ["indian-poker", "temerosa-five-card-draw", "temerosa-old-maid"], [6_500, 6_200, 4_500, 7_300, 5_800, 7_300]),
  "low-engagement": behavior(1_800, 1_800, 1_000, 8_500, 7_800, [0, 1], [1, 3], ["temerosa-old-maid"], [5_200, 4_800, 4_000, 4_500, 5_000, 4_500]),
});

const ARCHETYPE_RATIONALE: Readonly<Record<Archetype, string>> = Object.freeze({
  cautious: "Source characterization supports a cautious, loss-limiting interpretation.",
  disciplined: "Source characterization supports planned play and firm stopping discipline.",
  analytical: "Source characterization supports observation-led, calculation-heavy play.",
  balanced: "Source characterization supports moderate play without a stronger extreme.",
  playful: "Source characterization supports social, novelty-seeking table choices.",
  aggressive: "Source characterization supports assertive stakes and pressure play.",
  impulsive: "Source characterization supports volatile stakes and weaker stop rules.",
  competitive: "Source characterization supports rank-seeking play and loss chasing.",
  guarded: "Identity or intent is guarded; values are provisional and activation is withheld.",
  "low-engagement": "Source characterization supports infrequent and low-intensity visits.",
});

function behavior(
  riskAppetite: number, stakeAggression: number, lossChasing: number,
  stopLossDiscipline: number, takeProfitDiscipline: number,
  visits: readonly [number, number], rounds: readonly [number, number],
  preferredTables: readonly CasinoTableId[], skillValues: readonly [number, number, number, number, number, number],
): CasinoBehavior {
  return {
    riskAppetite, stakeAggression, lossChasing, stopLossDiscipline, takeProfitDiscipline,
    visitsPerDay: { min: visits[0], max: visits[1] }, roundsPerVisit: { min: rounds[0], max: rounds[1] },
    preferredTables,
    gameSkills: Object.fromEntries(CASINO_TABLE_IDS.map((id, index) => [id, skillValues[index]])) as unknown as Record<CasinoTableId, number>,
  };
}

function buildArchetypeIndex(): ReadonlyMap<string, Archetype> {
  const result = new Map<string, Archetype>();
  for (const [archetype, npcIds] of Object.entries(PROFILE_GROUPS) as [Archetype, readonly string[]][]) {
    for (const npcId of npcIds) {
      if (result.has(npcId)) throw new Error(`Duplicate editorial profile assignment: ${npcId}`);
      result.set(npcId, archetype);
    }
  }
  return result;
}

const ARCHETYPE_BY_NPC_ID = buildArchetypeIndex();

export function buildSeriesCasinoProfiles(
  roster: SeriesRoster,
  legacySuccessors: Readonly<Record<string, LegacySuccessorBehavior>> = {},
): SeriesCasinoProfileDocument {
  const profiles = roster.records.map((record): SeriesCasinoProfile => {
    const archetype = ARCHETYPE_BY_NPC_ID.get(record.id);
    if (!archetype) throw new Error(`Missing editorial profile assignment: ${record.id}`);
    const legacy = legacySuccessors[record.id];
    const isHouse = record.role === "house";
    const status: ProfileStatus = isHouse ? "inactive" : NEEDS_CONFIRMATION.has(record.id) || record.status !== "confirmed" ? "needs-confirmation" : "active";
    const role: ProfileRole = isHouse ? "house" : "gambler";
    const selectedBehavior: CasinoBehavior = legacy ? {
      riskAppetite: legacy.riskAppetite,
      stakeAggression: legacy.stakeAggression,
      lossChasing: legacy.lossChasing,
      stopLossDiscipline: legacy.stopLossDiscipline,
      takeProfitDiscipline: legacy.takeProfitDiscipline,
      visitsPerDay: legacy.visitsPerDay,
      roundsPerVisit: legacy.roundsPerVisit,
      preferredTables: legacy.preferredTables,
      gameSkills: legacy.gameSkills,
    } : ARCHETYPES[archetype];
    const finalBehavior = isHouse ? behavior(0, 0, 0, 10_000, 10_000, [0, 0], [0, 0], [], [0, 0, 0, 0, 0, 0]) : selectedBehavior;
    const evidenceRefs = record.loreEvidence.map((evidence) => ({
      series: record.series,
      loreItem: { entryIndex: evidence.entryIndex, label: evidence.comment || record.displayName },
      sha256: evidence.contentSha256,
    }));
    return {
      npcId: record.id,
      status,
      role,
      sourceLabel: record.qualifiedName,
      evidenceRefs,
      economy: {
        dailyIncomeRange: status === "active" ? { min: 120, max: 240 } : { min: 0, max: 0 },
        casinoBudgetRateBps: status === "active" ? budgetFor(archetype) : 0,
        settlementWindow: { timezone: "Asia/Seoul", startMinute: 1_080, endMinute: 1_440 },
      },
      behavior: finalBehavior,
      fieldBasis: {
        role: "lore", sourceLabel: "lore", evidenceRefs: "lore",
        "economy.dailyIncomeRange": "balance", "economy.casinoBudgetRateBps": "balance", "economy.settlementWindow": "balance",
        "behavior.riskAppetite": "derived", "behavior.stakeAggression": "derived", "behavior.lossChasing": "derived",
        "behavior.stopLossDiscipline": "derived", "behavior.takeProfitDiscipline": "derived",
        "behavior.visitsPerDay": legacy ? "derived" : "balance", "behavior.roundsPerVisit": "balance",
        "behavior.preferredTables": "derived", "behavior.gameSkills": legacy ? "derived" : "balance",
        "behavior.gameSkills.temerosa-slot": "balance",
      },
      rationale: [
        ARCHETYPE_RATIONALE[archetype],
        "All income, budget, cadence, and non-legacy skill numbers are balanceValue inputs, not lore facts.",
        ...(legacy ? [`Preserves the authored behavior and skills of legacy profile ${legacy.legacyNpcId}; no other series incarnation inherits them.`] : []),
        ...(status === "needs-confirmation" ? ["Automatic casino participation is withheld pending persona or suitability confirmation."] : []),
        ...(isHouse ? ["House personnel are excluded from ordinary gambler activation."] : []),
      ],
    };
  });
  if (ARCHETYPE_BY_NPC_ID.size !== roster.records.length) {
    throw new Error(`Editorial assignments (${ARCHETYPE_BY_NPC_ID.size}) do not match roster (${roster.records.length})`);
  }
  return {
    contract: "temerosa-series-casino-profiles/0.1",
    generatedFrom: { rosterContract: roster.contract, rosterGeneratedAt: roster.generatedAt },
    identityRule: "series-and-source-persona",
    profiles,
  };
}

function budgetFor(archetype: Archetype): number {
  const budgets: Readonly<Record<Archetype, number>> = {
    cautious: 600, disciplined: 750, analytical: 900, balanced: 1_000, playful: 1_400,
    aggressive: 1_800, impulsive: 2_400, competitive: 2_000, guarded: 800, "low-engagement": 400,
  };
  return budgets[archetype];
}

interface LegacyProfileShape {
  readonly id: string;
  readonly riskAppetite: number;
  readonly winPressing: number;
  readonly lossChasing: number;
  readonly discipline: number;
  readonly sessionsPerDay: IntRange;
  readonly tables: readonly Readonly<{ tableId: CasinoTableId }>[];
  readonly skills: Readonly<{ oldMaid: number; matchPairsMemory: number; pokerRead: number; pokerBluff: number; highLowJudgment: number }>;
}

/** Loads read-only legacy contracts only while authoring/auditing the generated artifact. */
export async function loadLegacySuccessorBehaviors(): Promise<Readonly<Record<string, LegacySuccessorBehavior>>> {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
  const profilesUrl = pathToFileURL(resolve(repositoryRoot, "cabinets/casino-ledger/src/temerosa-profiles.ts")).href;
  const migrationUrl = pathToFileURL(resolve(repositoryRoot, "cabinets/casino-ledger/src/temerosa-series-migration.ts")).href;
  const profileModule = await import(profilesUrl) as { TEMEROSA_NPC_GAMBLING_PROFILES: readonly LegacyProfileShape[] };
  const migrationModule = await import(migrationUrl) as { TEMEROSA_LEGACY_NPC_SUCCESSORS: Readonly<Record<string, string>> };
  const result: Record<string, LegacySuccessorBehavior> = {};
  for (const profile of profileModule.TEMEROSA_NPC_GAMBLING_PROFILES) {
    const successor = migrationModule.TEMEROSA_LEGACY_NPC_SUCCESSORS[profile.id];
    if (!successor || successor === "temerosa:guest:nemo") continue;
    const pokerSkill = Math.round((profile.skills.pokerRead * 0.58 + profile.skills.pokerBluff * 0.42) * 10_000);
    result[successor] = {
      legacyNpcId: profile.id,
      riskAppetite: Math.round(profile.riskAppetite * 10_000),
      stakeAggression: Math.round(profile.winPressing * 10_000),
      lossChasing: Math.round(profile.lossChasing * 10_000),
      stopLossDiscipline: Math.round(profile.discipline * 10_000),
      takeProfitDiscipline: Math.round(profile.discipline * 10_000),
      visitsPerDay: profile.sessionsPerDay,
      roundsPerVisit: { min: 3, max: 8 },
      preferredTables: profile.tables.map(({ tableId }) => tableId),
      gameSkills: {
        "temerosa-old-maid": Math.round(profile.skills.oldMaid * 10_000),
        "temerosa-match-pairs": Math.round(profile.skills.matchPairsMemory * 10_000),
        "temerosa-slot": 5_000,
        "indian-poker": pokerSkill,
        "temerosa-high-low": Math.round(profile.skills.highLowJudgment * 10_000),
        "temerosa-five-card-draw": pokerSkill,
      },
    };
  }
  return result;
}
