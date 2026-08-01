import type { NpcGamblingProfile,NpcLedgerContract } from "./contracts.ts";
import { casinoDayPlan,completedDayBalances } from "./engine.ts";
import { casinoKstDayAtUtcSecond,casinoUtcSecondAtKstDay } from "./casino-time.ts";
import { houseBalanceAt } from "./house.ts";
import { DEFAULT_HOUSE_OPERATING_COST_POLICY } from "./house-operations.ts";
import { buildTemerosaFlowProfileSet } from "./temerosa-flow-profiles.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT } from "./temerosa-profiles.ts";
import { TEMEROSA_LEGACY_NPC_SUCCESSORS } from "./temerosa-series-migration.ts";
import { TEMEROSA_CIGENIA_BEHAVIOR,TEMEROSA_CIGENIA_GAMBLING_PROFILE,TEMEROSA_CIGENIA_INCOME_PROFILE } from "./temerosa-cigenia-profile.ts";
import {
  TEMEROSA_SERIES_AUTHORED_PROFILES,
  TEMEROSA_SERIES_CASINO_SEAT_IDS,
  TEMEROSA_SERIES_RUNTIME_ROSTER,
  TEMEROSA_SERIES_RUNTIME_SOURCE,
} from "./temerosa-series-runtime.generated.ts";

/** Live epoch: 2026-08-01 00:00 KST. Historical results are frozen from this boundary. */
export const TEMEROSA_FLOW_EPOCH_KST_DAY=20_666;
/** 2026-08-02 00:00 KST. Keeps 1.2's first day frozen. */
export const TEMEROSA_FLOW_13_EPOCH_KST_DAY=20_667;

export interface TemerosaCasinoReleaseFlags{flowEconomy:boolean}
export const TEMEROSA_CASINO_RELEASE_FLAGS_DISABLED:Readonly<TemerosaCasinoReleaseFlags>=Object.freeze({flowEconomy:false});
export const TEMEROSA_CASINO_RELEASE_FLAGS_ACTIVE:Readonly<TemerosaCasinoReleaseFlags>=Object.freeze({flowEconomy:true});
export const TEMEROSA_FLOW_RELEASE_AUDIT=Object.freeze({
  status:"active-with-warnings" as const,
  blockers:Object.freeze([] as const),
  warnings:Object.freeze(["seven-day-supply-drift","one-year-supply-drift","ten-year-audit-pending"] as const),
  sevenDays:Object.freeze({npcCount:102,supplyChangeBps:-2_781,averageSettlementGapSeconds:22.26,minimumHouseBalance:90_887,houseCurtailedOperatingExpenses:0}),
  oneYear:Object.freeze({supplyChangeBps:-920,averageSettlementGapSeconds:24.66,minimumHouseBalance:50_003,houseCurtailedOperatingExpenses:0}),
  tenYears:Object.freeze({status:"pending" as const}),
});
export const TEMEROSA_FLOW_RELEASE_READY:boolean=Array.from(TEMEROSA_FLOW_RELEASE_AUDIT.blockers).length===0;
export const TEMEROSA_FLOW_13_RELEASE_AUDIT=Object.freeze({
  status:"active-with-warnings" as const,
  blockers:Object.freeze([] as const),
  warnings:Object.freeze(["one-year-audit-pending","ten-year-audit-pending"] as const),
  sevenDays:Object.freeze({npcCount:103,supplyChangeBps:422,averageSettlementGapSeconds:22.8,minimumHouseBalance:50_000,houseCurtailedOperatingExpenses:2_960}),
  floor:Object.freeze({sampleMinutes:5,minimumPresent:19,averagePresent:39.63,maximumPresent:77}),
});
export const TEMEROSA_FLOW_13_RELEASE_READY:boolean=Array.from(TEMEROSA_FLOW_13_RELEASE_AUDIT.blockers).length===0;

const LEGACY_FINAL_DAY_INDEX=TEMEROSA_FLOW_EPOCH_KST_DAY-TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay-1;
const LEGACY_CLOSE=completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES,LEGACY_FINAL_DAY_INDEX,TEMEROSA_NPC_LEDGER_CONTRACT);
const LEGACY_HOUSE_CLOSE=houseBalanceAt(
  TEMEROSA_NPC_GAMBLING_PROFILES,
  exactClock(casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY)-1),
  TEMEROSA_NPC_LEDGER_CONTRACT,
).balance;

const LEGACY_FLOW_OPENINGS:readonly NpcGamblingProfile[]=Object.freeze(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>Object.freeze({
  ...profile,openingBalance:LEGACY_CLOSE[profile.id]!,target:profile.target,
  sessionsPerDay:Object.freeze({min:3,max:7}),
})));

const SERIES_PROFILE_SET=buildTemerosaFlowProfileSet({
  records:TEMEROSA_SERIES_RUNTIME_ROSTER,
  identityPolicy:"series-persona",
  legacyProfiles:LEGACY_FLOW_OPENINGS,
  legacySuccessors:TEMEROSA_LEGACY_NPC_SUCCESSORS,
  profileOverrides:TEMEROSA_SERIES_AUTHORED_PROFILES,
});

const NEW_ACCOUNT_OPENING_GRANT=500;
const DAILY_INCOME_SCALE=25;
const NEW_ACCOUNT_COUNT=SERIES_PROFILE_SET.profiles.filter((profile)=>profile.openingBalance===0).length;
const NEW_ACCOUNT_CAPITAL=NEW_ACCOUNT_COUNT*NEW_ACCOUNT_OPENING_GRANT;

export const TEMEROSA_FLOW_NPC_GAMBLING_PROFILES=Object.freeze(SERIES_PROFILE_SET.profiles.map((profile)=>Object.freeze({
  ...profile,
  openingBalance:profile.openingBalance===0?NEW_ACCOUNT_OPENING_GRANT:profile.openingBalance,
})));
export const TEMEROSA_FLOW_EXTERNAL_INCOME_PROFILES=Object.freeze(SERIES_PROFILE_SET.externalIncomeProfiles.map((profile)=>Object.freeze({
  ...profile,
  dailyIncomeRange:Object.freeze([profile.dailyIncomeRange[0]*DAILY_INCOME_SCALE,profile.dailyIncomeRange[1]*DAILY_INCOME_SCALE] as const),
})));
export const TEMEROSA_FLOW_NPC_BEHAVIORS=Object.freeze(SERIES_PROFILE_SET.behaviors.map((behavior)=>Object.freeze({
  ...behavior,
  visitsPerDay:Object.freeze({min:10,max:Math.max(10,Math.min(14,behavior.visitsPerDay.max+8))}),
  roundsPerVisit:Object.freeze({min:20,max:Math.max(20,Math.min(30,behavior.roundsPerVisit.max+18))}),
})));
export const TEMEROSA_FLOW_PROFILE_EXCLUSIONS=SERIES_PROFILE_SET.exclusions;
export { TEMEROSA_SERIES_CASINO_SEAT_IDS,TEMEROSA_SERIES_RUNTIME_SOURCE };

export const TEMEROSA_FLOW_NPC_LEDGER_CONTRACT:NpcLedgerContract=Object.freeze({
  version:"npc-ledger/1.2",seedVersion:"casino-flow/1.1",epochKstDay:TEMEROSA_FLOW_EPOCH_KST_DAY,
  profiles:TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,externalIncomeProfiles:TEMEROSA_FLOW_EXTERNAL_INCOME_PROFILES,
  behaviors:TEMEROSA_FLOW_NPC_BEHAVIORS,houseOpeningBalance:LEGACY_HOUSE_CLOSE-NEW_ACCOUNT_CAPITAL,
  // 16.40 P per settled round: a decimal service-unit rate, billed in 100-round batches.
  houseOperatingPolicy:Object.freeze({...DEFAULT_HOUSE_OPERATING_COST_POLICY,perHundredRoundsCost:1_640,positiveGamingRevenueRateBps:1_856,settlementSecondOfDay:86_399}),
  predecessor:Object.freeze({profiles:TEMEROSA_NPC_GAMBLING_PROFILES,contract:TEMEROSA_NPC_LEDGER_CONTRACT}),
  profitHistory:legacyProfitHistory(),
});

const FLOW_12_FINAL_DAY_INDEX=TEMEROSA_FLOW_13_EPOCH_KST_DAY-TEMEROSA_FLOW_EPOCH_KST_DAY-1;
const FLOW_12_CLOSE=completedDayBalances(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,FLOW_12_FINAL_DAY_INDEX,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
const FLOW_12_HOUSE_CLOSE=houseBalanceAt(
  TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,
  exactClock(casinoUtcSecondAtKstDay(TEMEROSA_FLOW_13_EPOCH_KST_DAY)-1),
  TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,
).balance;

export const TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES:readonly NpcGamblingProfile[]=Object.freeze([
  ...TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile,index)=>Object.freeze({
    ...profile,
    openingBalance:FLOW_12_CLOSE[profile.id]!,
    activeHours:fullDayActivityHours(profile.activeHours,index),
  })),
  Object.freeze({...TEMEROSA_CIGENIA_GAMBLING_PROFILE,activeHours:fullDayActivityHours(TEMEROSA_CIGENIA_GAMBLING_PROFILE.activeHours,TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.length)}),
].toSorted((left,right)=>left.id<right.id?-1:left.id>right.id?1:0));

export const TEMEROSA_FLOW_13_EXTERNAL_INCOME_PROFILES=Object.freeze([
  ...TEMEROSA_FLOW_EXTERNAL_INCOME_PROFILES,
  TEMEROSA_CIGENIA_INCOME_PROFILE,
].toSorted((left,right)=>left.npcId<right.npcId?-1:left.npcId>right.npcId?1:0));

export const TEMEROSA_FLOW_13_NPC_BEHAVIORS=Object.freeze([
  ...TEMEROSA_FLOW_NPC_BEHAVIORS,
  TEMEROSA_CIGENIA_BEHAVIOR,
].toSorted((left,right)=>left.npcId<right.npcId?-1:left.npcId>right.npcId?1:0));

export const TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT:NpcLedgerContract=Object.freeze({
  version:"npc-ledger/1.3",seedVersion:"casino-flow/1.2",epochKstDay:TEMEROSA_FLOW_13_EPOCH_KST_DAY,
  profiles:TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES,
  externalIncomeProfiles:TEMEROSA_FLOW_13_EXTERNAL_INCOME_PROFILES,
  behaviors:TEMEROSA_FLOW_13_NPC_BEHAVIORS,
  houseOpeningBalance:FLOW_12_HOUSE_CLOSE-TEMEROSA_CIGENIA_GAMBLING_PROFILE.openingBalance,
  houseOperatingPolicy:Object.freeze({...TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.houseOperatingPolicy!,perHundredRoundsCost:1_400,protectedReserve:50_000}),
  predecessor:Object.freeze({profiles:TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,contract:TEMEROSA_FLOW_NPC_LEDGER_CONTRACT}),
  profitHistory:flow13ProfitHistory(),
});

export function temerosaCasinoLedgerAtUtcSecond(utcSecond:number,releaseFlags:Readonly<TemerosaCasinoReleaseFlags>=TEMEROSA_CASINO_RELEASE_FLAGS_ACTIVE):Readonly<{profiles:readonly NpcGamblingProfile[];contract:NpcLedgerContract}>{
  if(!Number.isSafeInteger(utcSecond))throw new Error("temerosa_ledger_invalid_clock");
  const kstDay=casinoKstDayAtUtcSecond(utcSecond);
  return releaseFlags.flowEconomy&&TEMEROSA_FLOW_RELEASE_READY&&TEMEROSA_FLOW_13_RELEASE_READY&&kstDay>=TEMEROSA_FLOW_13_EPOCH_KST_DAY
    ? Object.freeze({profiles:TEMEROSA_FLOW_13_NPC_GAMBLING_PROFILES,contract:TEMEROSA_FLOW_13_NPC_LEDGER_CONTRACT})
    : releaseFlags.flowEconomy&&TEMEROSA_FLOW_RELEASE_READY&&kstDay>=TEMEROSA_FLOW_EPOCH_KST_DAY
      ? Object.freeze({profiles:TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,contract:TEMEROSA_FLOW_NPC_LEDGER_CONTRACT})
    : Object.freeze({profiles:TEMEROSA_NPC_GAMBLING_PROFILES,contract:TEMEROSA_NPC_LEDGER_CONTRACT});
}

function fullDayActivityHours(previous:readonly {startMinute:number;endMinute:number;weight:number}[],index:number):readonly {startMinute:number;endMinute:number;weight:number}[]{
  const midpoint=previous[0]?Math.floor((previous[0].startMinute+previous[0].endMinute-1)/2):index*240;
  const peak=Math.floor(midpoint/240)%6;
  return Object.freeze(Array.from({length:6},(_,slot)=>{
    const distance=Math.min((slot-peak+6)%6,(peak-slot+6)%6);
    // Peaks remain visible without recreating a closed shift. A 3:1 ceiling
    // keeps the off-hours busy when all 103 guests draw the same KST day.
    const weight=distance===0?3:distance===1?2:1;
    return Object.freeze({startMinute:slot*240,endMinute:(slot+1)*240,weight});
  }));
}

function flow13ProfitHistory():NpcLedgerContract["profitHistory"]{
  const plan=casinoDayPlan(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,FLOW_12_FINAL_DAY_INDEX,Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance])),TEMEROSA_FLOW_NPC_LEDGER_CONTRACT);
  const profits=Object.freeze(Object.fromEntries(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>[
    profile.id,(plan.sessions[profile.id]??[]).filter((session)=>session.tableId!=="npc-income").reduce((sum,session)=>sum+session.delta,0),
  ])));
  return Object.freeze([...TEMEROSA_FLOW_NPC_LEDGER_CONTRACT.profitHistory,Object.freeze({kstDay:TEMEROSA_FLOW_EPOCH_KST_DAY,profits})]);
}

function legacyProfitHistory():NpcLedgerContract["profitHistory"]{
  const history=TEMEROSA_NPC_LEDGER_CONTRACT.profitHistory.map((entry)=>Object.freeze({kstDay:entry.kstDay,profits:remapLegacyProfits(entry.profits)}));
  let balances=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
  for(let dayIndex=0;dayIndex<=LEGACY_FINAL_DAY_INDEX;dayIndex+=1){
    const plan=casinoDayPlan(TEMEROSA_NPC_GAMBLING_PROFILES,dayIndex,balances,TEMEROSA_NPC_LEDGER_CONTRACT);
    const profits=Object.freeze(Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[
      profile.id,(plan.sessions[profile.id]??[]).filter((session)=>session.tableId!=="npc-income").reduce((sum,session)=>sum+session.delta,0),
    ])));
    history.push(Object.freeze({kstDay:TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay+dayIndex,profits:remapLegacyProfits(profits)}));
    balances=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,balances[profile.id]!+(plan.sessions[profile.id]??[]).reduce((sum,session)=>sum+session.delta,0)]));
  }
  return Object.freeze(history);
}

function remapLegacyProfits(profits:Readonly<Record<string,number>>):Readonly<Record<string,number>>{
  const remapped:Record<string,number>={};
  for(const [legacyId,profit] of Object.entries(profits)){
    const successor=TEMEROSA_LEGACY_NPC_SUCCESSORS[legacyId];
    if(!successor)continue;
    remapped[successor]=(remapped[successor]??0)+profit;
  }
  return Object.freeze(Object.fromEntries(Object.entries(remapped).toSorted(([left],[right])=>left<right?-1:left>right?1:0)));
}

function exactClock(second:number):{utcMinute():number;utcSecond():number}{return{utcMinute:()=>Math.floor(second/60),utcSecond:()=>second};}
