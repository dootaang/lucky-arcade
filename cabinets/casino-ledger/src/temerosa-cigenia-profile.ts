import type { CasinoNpcBehavior, NpcExternalIncomeProfile, NpcGamblingProfile } from "./contracts.ts";

export const TEMEROSA_CIGENIA_NPC_ID = "temerosa:finale:cigenia" as const;
export const TEMEROSA_CIGENIA_SOURCE_SHA256 = "DD9B96DA9CC26DA2AEDFA2038CECEDBE30111EE71D0E1BB0756750A2C2D98ED9" as const;

/**
 * Cigenia.charx authored profile. High calculation skill and capture income
 * are explicit lore; weak people-reading keeps poker reads below her logic
 * games. These are casino spin-off balance values, not new canon facts.
 */
export const TEMEROSA_CIGENIA_GAMBLING_PROFILE: Readonly<NpcGamblingProfile> = Object.freeze({
  id:TEMEROSA_CIGENIA_NPC_ID,name:"키게니아 · Finale",openingBalance:500,target:0,
  riskAppetite:.58,discipline:.82,lossChasing:.18,winPressing:.44,
  stopLossRatio:.22,takeProfitRatio:.38,maxExposureRatio:.24,incomeBand:"high",payCycleDays:7,paydayOffset:4,
  skills:Object.freeze({oldMaid:.58,matchPairsMemory:.88,pokerRead:.34,pokerBluff:.42,highLowJudgment:.86}),
  sessionsPerDay:Object.freeze({min:10,max:13}),
  tables:Object.freeze([
    Object.freeze({tableId:"temerosa-high-low",weight:6}),
    Object.freeze({tableId:"temerosa-match-pairs",weight:5}),
    Object.freeze({tableId:"temerosa-five-card-draw",weight:3}),
    Object.freeze({tableId:"temerosa-slot",weight:2}),
    Object.freeze({tableId:"temerosa-old-maid",weight:2}),
    Object.freeze({tableId:"indian-poker",weight:1}),
  ]),
  activeHours:Object.freeze([{startMinute:0,endMinute:1_440,weight:1}]),
});

export const TEMEROSA_CIGENIA_INCOME_PROFILE: Readonly<NpcExternalIncomeProfile> = Object.freeze({
  npcId:TEMEROSA_CIGENIA_NPC_ID,
  sourceLabel:"고위 베스티아 포획 정산",
  evidenceRefs:Object.freeze([`finale:Cigenia:excellent-income:${TEMEROSA_CIGENIA_SOURCE_SHA256}`]),
  dailyIncomeRange:Object.freeze([6_500,9_500] as const),
  casinoBudgetRateBps:Object.freeze([1_500,2_600] as const),
  openingExternalReserve:0,
  settlementWindow:Object.freeze([7*60,23*60+30] as const),
});

export const TEMEROSA_CIGENIA_BEHAVIOR: Readonly<CasinoNpcBehavior> = Object.freeze({
  npcId:TEMEROSA_CIGENIA_NPC_ID,riskAppetite:.58,stakeAggression:.44,lossChasing:.18,
  stopLossDiscipline:.82,takeProfitDiscipline:.76,
  visitsPerDay:Object.freeze({min:10,max:13}),roundsPerVisit:Object.freeze({min:20,max:28}),
  skills:Object.freeze({"temerosa-high-low":.86,"temerosa-match-pairs":.88,"temerosa-five-card-draw":.64,"temerosa-slot":.52,"temerosa-old-maid":.58,"indian-poker":.38}),
  preferredTables:TEMEROSA_CIGENIA_GAMBLING_PROFILE.tables,
});
