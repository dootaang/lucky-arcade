import type { CasinoNpcBehavior,NpcExternalIncomeProfile,NpcGamblingProfile,NpcLedgerContract } from "./contracts.ts";
import { casinoDayPlan,completedDayBalances } from "./engine.ts";
import { NPC_INCOME_AMOUNTS } from "./economy.ts";
import { casinoKstDayAtUtcSecond,casinoUtcSecondAtKstDay } from "./casino-time.ts";
import { houseBalanceAt } from "./house.ts";
import { DEFAULT_HOUSE_OPERATING_COST_POLICY } from "./house-operations.ts";
import { TEMEROSA_NPC_GAMBLING_PROFILES,TEMEROSA_NPC_LEDGER_CONTRACT } from "./temerosa-profiles.ts";

/** 2026-08-01 00:00 KST. Legacy observations remain frozen before this boundary. */
export const TEMEROSA_FLOW_EPOCH_KST_DAY=20_666;

const LEGACY_FINAL_DAY_INDEX=TEMEROSA_FLOW_EPOCH_KST_DAY-TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay-1;
const LEGACY_CLOSE=completedDayBalances(TEMEROSA_NPC_GAMBLING_PROFILES,LEGACY_FINAL_DAY_INDEX,TEMEROSA_NPC_LEDGER_CONTRACT);
const LEGACY_HOUSE_CLOSE=houseBalanceAt(
  TEMEROSA_NPC_GAMBLING_PROFILES,
  exactClock(casinoUtcSecondAtKstDay(TEMEROSA_FLOW_EPOCH_KST_DAY)-1),
  TEMEROSA_NPC_LEDGER_CONTRACT,
).balance;

export const TEMEROSA_FLOW_NPC_GAMBLING_PROFILES:readonly NpcGamblingProfile[]=Object.freeze(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>Object.freeze({
  ...profile,openingBalance:LEGACY_CLOSE[profile.id]!,target:profile.target,
  sessionsPerDay:Object.freeze({min:3,max:7}),
})));

export const TEMEROSA_FLOW_EXTERNAL_INCOME_PROFILES:readonly NpcExternalIncomeProfile[]=Object.freeze(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>{
  const legacy=TEMEROSA_NPC_GAMBLING_PROFILES.find((entry)=>entry.id===profile.id)!;
  const expected=Math.max(1,Math.round(NPC_INCOME_AMOUNTS[legacy.incomeBand]/legacy.payCycleDays));
  return Object.freeze({
    npcId:profile.id,sourceLabel:"개인 활동 정산",evidenceRefs:Object.freeze([]),
    dailyIncomeRange:Object.freeze([expected*4,expected*6] as const),casinoBudgetRateBps:Object.freeze([1_600,2_400] as const),
    openingExternalReserve:0,settlementWindow:Object.freeze([6*60,23*60+30] as const),
  });
}));

export const TEMEROSA_FLOW_NPC_BEHAVIORS:readonly CasinoNpcBehavior[]=Object.freeze(TEMEROSA_FLOW_NPC_GAMBLING_PROFILES.map((profile)=>Object.freeze({
  npcId:profile.id,riskAppetite:profile.riskAppetite,stakeAggression:profile.riskAppetite,lossChasing:profile.lossChasing,
  stopLossDiscipline:profile.discipline,takeProfitDiscipline:profile.discipline,
  visitsPerDay:Object.freeze({min:3,max:7}),roundsPerVisit:Object.freeze({min:4,max:12}),
  skills:Object.freeze({
    "temerosa-old-maid":profile.skills.oldMaid,"temerosa-match-pairs":profile.skills.matchPairsMemory,
    "indian-poker":(profile.skills.pokerRead+profile.skills.pokerBluff)/2,"temerosa-five-card-draw":(profile.skills.pokerRead+profile.skills.pokerBluff)/2,
    "temerosa-high-low":profile.skills.highLowJudgment,"temerosa-slot":profile.riskAppetite,
  }),preferredTables:profile.tables,
})));

export const TEMEROSA_FLOW_NPC_LEDGER_CONTRACT:NpcLedgerContract=Object.freeze({
  version:"npc-ledger/1.2",seedVersion:"casino-flow/1.0",epochKstDay:TEMEROSA_FLOW_EPOCH_KST_DAY,
  profiles:TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,externalIncomeProfiles:TEMEROSA_FLOW_EXTERNAL_INCOME_PROFILES,
  behaviors:TEMEROSA_FLOW_NPC_BEHAVIORS,houseOpeningBalance:LEGACY_HOUSE_CLOSE,
  houseOperatingPolicy:Object.freeze({...DEFAULT_HOUSE_OPERATING_COST_POLICY,perHundredRoundsCost:20,positiveGamingRevenueRateBps:3_000}),
  predecessor:Object.freeze({profiles:TEMEROSA_NPC_GAMBLING_PROFILES,contract:TEMEROSA_NPC_LEDGER_CONTRACT}),
  profitHistory:legacyProfitHistory(),
});

export function temerosaCasinoLedgerAtUtcSecond(utcSecond:number):Readonly<{profiles:readonly NpcGamblingProfile[];contract:NpcLedgerContract}>{
  if(!Number.isSafeInteger(utcSecond))throw new Error("temerosa_ledger_invalid_clock");
  return casinoKstDayAtUtcSecond(utcSecond)>=TEMEROSA_FLOW_EPOCH_KST_DAY
    ? Object.freeze({profiles:TEMEROSA_FLOW_NPC_GAMBLING_PROFILES,contract:TEMEROSA_FLOW_NPC_LEDGER_CONTRACT})
    : Object.freeze({profiles:TEMEROSA_NPC_GAMBLING_PROFILES,contract:TEMEROSA_NPC_LEDGER_CONTRACT});
}

function legacyProfitHistory():NpcLedgerContract["profitHistory"]{
  const history=[...TEMEROSA_NPC_LEDGER_CONTRACT.profitHistory];
  let balances=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,profile.openingBalance]));
  for(let dayIndex=0;dayIndex<=LEGACY_FINAL_DAY_INDEX;dayIndex+=1){
    const plan=casinoDayPlan(TEMEROSA_NPC_GAMBLING_PROFILES,dayIndex,balances,TEMEROSA_NPC_LEDGER_CONTRACT);
    const profits=Object.freeze(Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[
      profile.id,(plan.sessions[profile.id]??[]).filter((session)=>session.tableId!=="npc-income").reduce((sum,session)=>sum+session.delta,0),
    ])));
    history.push(Object.freeze({kstDay:TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay+dayIndex,profits}));
    balances=Object.fromEntries(TEMEROSA_NPC_GAMBLING_PROFILES.map((profile)=>[profile.id,balances[profile.id]!+(plan.sessions[profile.id]??[]).reduce((sum,session)=>sum+session.delta,0)]));
  }
  return Object.freeze(history);
}

function exactClock(second:number):{utcMinute():number;utcSecond():number}{return{utcMinute:()=>Math.floor(second/60),utcSecond:()=>second};}
