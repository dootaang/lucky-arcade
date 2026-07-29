import type {
  NpcActiveWindow,
  NpcGamblingProfile,
  NpcLedgerContract,
  NpcSessionRange,
  NpcTableWeight,
} from "./contracts.ts";

export const TEMEROSA_LEDGER_EPOCH_UTC_DAY = 20_663;

const SHIFTS: readonly (readonly NpcActiveWindow[])[] = [
  Object.freeze([{ startMinute: 0, endMinute: 480, weight: 1 }]),
  Object.freeze([{ startMinute: 480, endMinute: 960, weight: 1 }]),
  Object.freeze([{ startMinute: 960, endMinute: 1_440, weight: 1 }]),
];

const TABLE_SETS: readonly (readonly NpcTableWeight[])[] = [
  Object.freeze([
    { tableId: "temerosa-old-maid", weight: 5 },
    { tableId: "temerosa-match-pairs", weight: 2 },
    { tableId: "indian-poker", weight: 2 },
    { tableId: "temerosa-high-low", weight: 1 },
    { tableId: "temerosa-slot", weight: 1 },
  ]),
  Object.freeze([
    { tableId: "temerosa-slot", weight: 3 },
    { tableId: "temerosa-old-maid", weight: 5 },
    { tableId: "temerosa-match-pairs", weight: 1 },
    { tableId: "indian-poker", weight: 1 },
    { tableId: "temerosa-high-low", weight: 2 },
  ]),
  Object.freeze([
    { tableId: "indian-poker", weight: 4 },
    { tableId: "temerosa-old-maid", weight: 5 },
    { tableId: "temerosa-match-pairs", weight: 2 },
    { tableId: "temerosa-slot", weight: 1 },
    { tableId: "temerosa-high-low", weight: 2 },
  ]),
];

const LOW: NpcSessionRange = Object.freeze({ min: 6, max: 9 });
const MEDIUM: NpcSessionRange = Object.freeze({ min: 8, max: 12 });
const HIGH: NpcSessionRange = Object.freeze({ min: 10, max: 14 });

interface FrozenTraits { attention: number; bluff: number; oldMaid: number }

/** npc-ledger/0.7 closing balances at 2026-07-29 00:00 UTC. */
const V08_OPENING_BALANCES: Readonly<Record<string, number>> = Object.freeze({
  katrinka:35,raven:1510,lyla:3900,alger:3450,kreva:70,phaeo:140,machina:9235,kano:305,cicero:40,
  esther:7945,wares:375,nostalgia:1075,pale:17600,apollyon:70,hiro:2170,cradle:500,nieun:60,temute:2610,
  deokbae:2825,levillotte:30,riel:30,traver:280,adesha:1680,bacikal:240,camille:3960,anna:25,echo:30,
  diamo:40,yul:40,ttaengchil:30,nemo:290,lilim:50,"tumit-tu":30,morsisa:75,bche:45,
});

/**
 * The final, completed npc-ledger/0.7 day. v0.8 rebased balances at the next
 * UTC midnight, so this frozen delta is the exact analytics bridge across the
 * contract boundary. Earlier contracts did not preserve a continuous close.
 */
const V07_FINAL_DAY_PROFITS: Readonly<Record<string, number>> = Object.freeze({
  katrinka:-3965,raven:-2290,lyla:300,alger:0,kreva:-3230,phaeo:-3010,machina:6235,kano:-2595,
  cicero:-2760,esther:5245,wares:-2225,nostalgia:-1425,pale:15200,apollyon:-2230,hiro:-80,cradle:-1700,
  nieun:-2090,temute:510,deokbae:775,levillotte:-1970,riel:-1870,traver:-1520,adesha:-20,bacikal:-1410,
  camille:2360,anna:-1475,echo:-1370,diamo:-1260,yul:-1160,ttaengchil:-970,nemo:-510,lilim:-600,
  "tumit-tu":-420,morsisa:-225,bche:-155,
});

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
 * Frozen npc-ledger/0.8 data. The former `target` values are retained only as
 * compatibility aliases. No outcome code may steer back to them.
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
  version: "npc-ledger/0.8",
  epochUtcDay: TEMEROSA_LEDGER_EPOCH_UTC_DAY,
  profiles: TEMEROSA_NPC_GAMBLING_PROFILES,
  profitHistory: Object.freeze([
    Object.freeze({ utcDay: TEMEROSA_LEDGER_EPOCH_UTC_DAY - 1, profits: V07_FINAL_DAY_PROFITS }),
  ]),
});

function profile(
  id: string,
  name: string,
  _openingBalance: number,
  formerVolatility: number,
  formerReversion: number,
  sessionsPerDay: NpcSessionRange,
  operation: 0 | 1 | 2,
): NpcGamblingProfile {
  const riskAppetite = formerVolatility >= 0.27 ? 0.86 : formerVolatility >= 0.16 ? 0.56 : 0.28;
  const discipline = formerReversion >= 0.16 ? 0.86 : formerReversion >= 0.10 ? 0.62 : 0.34;
  const traits = TRAITS[id] ?? Object.freeze({ attention: 0.5, bluff: 0.5, oldMaid: 0.5 });
  const rebasedOpening = V08_OPENING_BALANCES[id];
  if (!Number.isSafeInteger(rebasedOpening) || rebasedOpening! <= 0) throw new Error(`npc_ledger_opening_missing:${id}`);
  return Object.freeze({
    id,
    name,
    openingBalance: rebasedOpening!,
    target: _openingBalance,
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
      highLowJudgment: traits.attention,
    }),
    sessionsPerDay,
    tables: TABLE_SETS[operation]!,
    activeHours: SHIFTS[operation]!,
  });
}

function t(attention: number, bluff: number, oldMaid: number): Readonly<FrozenTraits> {
  return Object.freeze({ attention, bluff, oldMaid });
}
