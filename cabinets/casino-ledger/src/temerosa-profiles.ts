import type {
  NpcActiveWindow,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcSessionRange,
  NpcTableWeight,
} from "./contracts.ts";

export const TEMEROSA_LEDGER_EPOCH_UTC_DAY = 20_661;

const SHIFTS: readonly (readonly NpcActiveWindow[])[] = [
  Object.freeze([{ startMinute: 0, endMinute: 480, weight: 1 }]),
  Object.freeze([{ startMinute: 480, endMinute: 960, weight: 1 }]),
  Object.freeze([{ startMinute: 960, endMinute: 1_440, weight: 1 }]),
];

const TABLE_SETS: readonly (readonly NpcTableWeight[])[] = [
  Object.freeze([
    { tableId: "temerosa-old-maid", weight: 3 },
    { tableId: "temerosa-match-pairs", weight: 2 },
    { tableId: "indian-poker", weight: 2 },
    { tableId: "temerosa-slot", weight: 1 },
  ]),
  Object.freeze([
    { tableId: "temerosa-slot", weight: 4 },
    { tableId: "temerosa-old-maid", weight: 2 },
    { tableId: "temerosa-match-pairs", weight: 1 },
    { tableId: "indian-poker", weight: 1 },
  ]),
  Object.freeze([
    { tableId: "indian-poker", weight: 4 },
    { tableId: "temerosa-old-maid", weight: 2 },
    { tableId: "temerosa-match-pairs", weight: 2 },
    { tableId: "temerosa-slot", weight: 1 },
  ]),
];

const LOW: NpcSessionRange = Object.freeze({ min: 3, max: 6 });
const MEDIUM: NpcSessionRange = Object.freeze({ min: 5, max: 9 });
const HIGH: NpcSessionRange = Object.freeze({ min: 8, max: 14 });

/**
 * Frozen npc-ledger/0.1 data. Values were transcribed from the approved
 * interpretation; this module intentionally does not import another cabinet.
 */
export const TEMEROSA_NPC_GAMBLING_PROFILES: readonly NpcGamblingProfile[] = Object.freeze([
  profile("katrinka", "카트린카", 4_000, 0.16, 0.16, MEDIUM, 0),
  profile("raven", "레이븐", 3_800, 0.16, 0.16, MEDIUM, 1),
  profile("lyla", "라일라", 3_600, 0.16, 0.16, MEDIUM, 2),
  profile("alger", "알제", 3_450, 0.08, 0.16, LOW, 0),
  profile("kreva", "크레바", 3_300, 0.08, 0.16, LOW, 1),
  profile("phaeo", "폐어", 3_150, 0.08, 0.16, LOW, 2),
  profile("machina", "마키나", 3_000, 0.16, 0.16, MEDIUM, 0),
  profile("kano", "카노", 2_900, 0.08, 0.16, LOW, 1),
  profile("cicero", "키케로", 2_800, 0.16, 0.16, MEDIUM, 2),
  profile("esther", "에스더", 2_700, 0.16, 0.16, MEDIUM, 0),
  profile("wares", "워어즈", 2_600, 0.16, 0.16, MEDIUM, 1),
  profile("nostalgia", "노스탤지아", 2_500, 0.16, 0.10, MEDIUM, 2),
  profile("pale", "페일", 2_400, 0.27, 0.10, HIGH, 0),
  profile("apollyon", "아폴리온 아이테", 2_300, 0.08, 0.16, LOW, 1),
  profile("hiro", "히로 카네다", 2_250, 0.08, 0.10, LOW, 2),
  profile("cradle", "크레이들", 2_200, 0.27, 0.10, HIGH, 0),
  profile("nieun", "박니은", 2_150, 0.08, 0.16, LOW, 1),
  profile("temute", "테뮤테", 2_100, 0.16, 0.16, MEDIUM, 2),
  profile("deokbae", "김덕배", 2_050, 0.08, 0.16, LOW, 0),
  profile("levillotte", "레빌로트", 2_000, 0.27, 0.05, HIGH, 1),
  profile("riel", "리엘", 1_900, 0.27, 0.10, HIGH, 2),
  profile("traver", "트레버", 1_800, 0.08, 0.10, LOW, 0),
  profile("adesha", "아데샤", 1_700, 0.08, 0.16, LOW, 1),
  profile("bacikal", "바치칼", 1_650, 0.27, 0.10, HIGH, 2),
  profile("camille", "카미유", 1_600, 0.27, 0.05, HIGH, 0),
  profile("anna", "안나 나자레아", 1_500, 0.27, 0.05, HIGH, 1),
  profile("echo", "에코", 1_400, 0.27, 0.16, HIGH, 2),
  profile("diamo", "디아모", 1_300, 0.16, 0.05, MEDIUM, 0),
  profile("yul", "율", 1_200, 0.27, 0.05, HIGH, 1),
  profile("ttaengchil", "땡칠이", 1_000, 0.27, 0.05, HIGH, 2),
  profile("nemo", "네모", 800, 0.27, 0.05, HIGH, 0),
  profile("lilim", "릴림", 650, 0.16, 0.16, MEDIUM, 1),
  profile("tumit-tu", "튜밋튜", 450, 0.27, 0.05, HIGH, 2),
  profile("morsisa", "모르시사", 300, 0.08, 0.05, LOW, 0),
  profile("bche", "브체", 200, 0.16, 0.05, MEDIUM, 1),
]);

export const TEMEROSA_NPC_LEDGER_CONTRACT: NpcLedgerContract = Object.freeze({
  version: "npc-ledger/0.1",
  epochUtcDay: TEMEROSA_LEDGER_EPOCH_UTC_DAY,
  profiles: TEMEROSA_NPC_GAMBLING_PROFILES,
});

function profile(
  id: string,
  name: string,
  target: number,
  volatility: number,
  reversion: number,
  sessionsPerDay: NpcSessionRange,
  operation: 0 | 1 | 2,
): NpcGamblingProfile {
  return Object.freeze({
    id,
    name,
    target,
    volatility,
    reversion,
    sessionsPerDay,
    tables: TABLE_SETS[operation]!,
    activeHours: SHIFTS[operation]!,
  });
}
