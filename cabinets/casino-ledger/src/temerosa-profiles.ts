import type {
  NpcActiveWindow,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcSessionRange,
  NpcTableWeight,
} from "./contracts.ts";

export const TEMEROSA_LEDGER_EPOCH_UTC_DAY = 20_662;

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

const LOW: NpcSessionRange = Object.freeze({ min: 6, max: 9 });
const MEDIUM: NpcSessionRange = Object.freeze({ min: 8, max: 12 });
const HIGH: NpcSessionRange = Object.freeze({ min: 10, max: 14 });

interface FrozenTraits { attention: number; bluff: number; oldMaid: number }

/** Transcribed gameplay traits. Kept local so another cabinet cannot rewrite history. */
const TRAITS: Readonly<Record<string, Readonly<FrozenTraits>>> = Object.freeze({
  pale: t(.82,.72,.76), kano: t(.84,.38,.78), nemo: t(.58,.42,.46), bacikal: t(.84,.76,.72),
  alger: t(.84,.55,.72), nieun: t(.84,.35,.74), lyla: t(.84,.68,.78), riel: t(.58,.75,.64), wares: t(.84,.38,.76),
  adesha: t(.84,.62,.70), anna: t(.58,.78,.48), apollyon: t(.84,.40,.72), bche: t(.58,.70,.48), camille: t(.84,.82,.68),
  cicero: t(.84,.60,.76), cradle: t(.58,.74,.60), deokbae: t(.84,.55,.72), diamo: t(.34,.58,.42), echo: t(.84,.72,.70),
  esther: t(.84,.72,.76), hiro: t(.84,.52,.72), katrinka: t(.84,.60,.80), kreva: t(.84,.50,.74), levillotte: t(.58,.84,.54),
  lilim: t(.34,.66,.40), machina: t(.84,.68,.72), morsisa: t(.34,.42,.34), nostalgia: t(.84,.56,.76), phaeo: t(.84,.52,.72),
  raven: t(.84,.76,.78), temute: t(.84,.64,.70), traver: t(.84,.40,.72), ttaengchil: t(.34,.72,.38), "tumit-tu": t(.58,.68,.48), yul: t(.34,.60,.40),
});

/**
 * Frozen npc-ledger/0.5 data. The former `target` values are retained only as
 * story-authored opening bankrolls. No outcome code may steer back to them.
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
  version: "npc-ledger/0.5",
  epochUtcDay: TEMEROSA_LEDGER_EPOCH_UTC_DAY,
  profiles: TEMEROSA_NPC_GAMBLING_PROFILES,
});

function profile(
  id: string,
  name: string,
  openingBalance: number,
  formerVolatility: number,
  formerReversion: number,
  sessionsPerDay: NpcSessionRange,
  operation: 0 | 1 | 2,
): NpcGamblingProfile {
  const riskAppetite = formerVolatility >= 0.27 ? 0.86 : formerVolatility >= 0.16 ? 0.56 : 0.28;
  const discipline = formerReversion >= 0.16 ? 0.86 : formerReversion >= 0.10 ? 0.62 : 0.34;
  const traits = TRAITS[id] ?? Object.freeze({ attention: 0.5, bluff: 0.5, oldMaid: 0.5 });
  return Object.freeze({
    id,
    name,
    openingBalance,
    target: openingBalance,
    riskAppetite,
    discipline,
    lossChasing: Number((1 - discipline * 0.78).toFixed(2)),
    winPressing: Number((0.18 + riskAppetite * 0.68).toFixed(2)),
    stopLossRatio: Number((0.22 + discipline * 0.28).toFixed(2)),
    takeProfitRatio: Number((0.28 + discipline * 0.42).toFixed(2)),
    maxExposureRatio: Number((0.12 + riskAppetite * 0.48).toFixed(2)),
    skills: Object.freeze({
      oldMaid: traits.oldMaid,
      matchPairsMemory: traits.attention,
      pokerRead: traits.attention,
      pokerBluff: traits.bluff,
    }),
    sessionsPerDay,
    tables: TABLE_SETS[operation]!,
    activeHours: SHIFTS[operation]!,
  });
}

function t(attention: number, bluff: number, oldMaid: number): Readonly<FrozenTraits> {
  return Object.freeze({ attention, bluff, oldMaid });
}
