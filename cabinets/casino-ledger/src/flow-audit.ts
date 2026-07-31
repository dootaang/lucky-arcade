import { casinoDayPlan } from "./engine.ts";
import { TEMEROSA_HOUSE_OPENING_CAPITAL } from "./economy.ts";
import type { NpcLedgerContract } from "./contracts.ts";
import { npcFlowEconomyTransactions } from "./flow-economy.ts";
import { DEFAULT_HOUSE_OPERATING_COST_POLICY,createHouseOperatingExpensePlan,houseDailyActivityFromPlan,type HouseOperatingCostPolicy } from "./house-operations.ts";

export interface CasinoFlowAuditReport {
  days: number;
  npcCount: number;
  initialInternalSupply: number;
  finalInternalSupply: number;
  supplyChangeBps: number;
  totalNpcCasinoTopUps: number;
  totalRounds: number;
  totalSettlementRows: number;
  totalRoundSettlementRows: number;
  duplicateRoundIdCount: number;
  unbalancedRoundCount: number;
  postingImbalance: number;
  averageSettlementGapSeconds: number;
  finalNpcSupply: number;
  finalNpcMedianBalance: number;
  paidEligibleNpcCount: number;
  maximumNpcShareBps: number;
  topFiveChangedSeats: number;
  houseBalance: number;
  houseGamingProfit: number;
  houseOperatingExpenses: number;
  houseCurtailedOperatingExpenses: number;
}

export function auditCasinoFlowEconomy(contract:NpcLedgerContract,days:number,operatingPolicy:Readonly<HouseOperatingCostPolicy>=contract.houseOperatingPolicy??DEFAULT_HOUSE_OPERATING_COST_POLICY):CasinoFlowAuditReport {
  if(contract.version!=="npc-ledger/1.2"||!Number.isSafeInteger(days)||days<1)throw new Error("casino_flow_audit_invalid_input");
  const profiles=contract.profiles;
  let balances:Record<string,number>=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
  const initialNpcSupply=sum(Object.values(balances));
  const initialTopFive=topIds(balances,5);
  let totalNpcCasinoTopUps=0,totalRounds=0,totalSettlementRows=0,totalRoundSettlementRows=0,duplicateRoundIdCount=0,unbalancedRoundCount=0,postingImbalance=0;
  const roundIds=new Set<string>();
  const houseOpeningBalance=contract.houseOpeningBalance??TEMEROSA_HOUSE_OPENING_CAPITAL;
  let houseBalance=houseOpeningBalance,houseGamingProfit=0,houseOperatingExpenses=0,houseCurtailedOperatingExpenses=0;
  for(let dayIndex=0;dayIndex<days;dayIndex+=1){
    const plan=casinoDayPlan(profiles,dayIndex,balances,contract);
    totalRounds+=plan.matches.length;
    for(const transaction of npcFlowEconomyTransactions(contract.externalIncomeProfiles??[],contract.epochKstDay+dayIndex))postingImbalance+=transaction.postings.reduce((sum,posting)=>sum+posting.delta,0);
    const sessions=Object.values(plan.sessions).flat();
    for(const match of plan.matches){
      if(roundIds.has(match.matchId))duplicateRoundIdCount+=1;
      roundIds.add(match.matchId);
      totalRoundSettlementRows+=1;
      const npcDelta=sessions.filter((session)=>session.matchId===match.matchId).reduce((sum,session)=>sum+session.delta,0);
      const houseDelta=-npcDelta;
      const roundImbalance=npcDelta+houseDelta;
      postingImbalance+=roundImbalance;
      if(roundImbalance!==0)unbalancedRoundCount+=1;
    }
    for(const sessions of Object.values(plan.sessions))for(const session of sessions){
      if(session.tableId==="npc-income")totalNpcCasinoTopUps+=session.delta;
      else totalSettlementRows+=1;
    }
    balances=Object.fromEntries(profiles.map((profile)=>{
      const closing=balances[profile.id]!+(plan.sessions[profile.id]??[]).reduce((total,session)=>total+session.delta,0);
      if(!Number.isSafeInteger(closing)||closing<0)throw new Error(`casino_flow_audit_invalid_balance:${profile.id}`);
      return [profile.id,closing];
    }));
    const operationsSecond=operatingPolicy.settlementSecondOfDay;
    const houseBefore=flowHouseDelta(plan.sessions,-1,operationsSecond);
    houseBalance+=houseBefore;houseGamingProfit+=houseBefore;
    const activity=houseDailyActivityFromPlan({absoluteKstDay:contract.epochKstDay+dayIndex,houseBalance,reservedLiability:0,plan,throughSecondOfDay:operationsSecond});
    const expense=createHouseOperatingExpensePlan(activity,operatingPolicy);
    if(expense.transaction)postingImbalance+=expense.transaction.postings.reduce((sum,posting)=>sum+posting.delta,0);
    houseBalance-=expense.paidAmount;houseOperatingExpenses+=expense.paidAmount;houseCurtailedOperatingExpenses+=expense.curtailedAmount;
    const houseAfter=flowHouseDelta(plan.sessions,operationsSecond,86_399);
    houseBalance+=houseAfter;houseGamingProfit+=houseAfter;
  }
  const finalNpcBalances=Object.values(balances).toSorted((left,right)=>left-right);
  const finalNpcSupply=sum(finalNpcBalances);
  const initialInternalSupply=initialNpcSupply+houseOpeningBalance;
  const finalInternalSupply=finalNpcSupply+houseBalance;
  const finalTopFive=topIds(balances,5);
  return Object.freeze({
    days,npcCount:profiles.length,initialInternalSupply,finalInternalSupply,
    supplyChangeBps:Math.round((finalInternalSupply-initialInternalSupply)*10_000/initialInternalSupply),
    totalNpcCasinoTopUps,totalRounds,totalSettlementRows,totalRoundSettlementRows,duplicateRoundIdCount,unbalancedRoundCount,postingImbalance,
    averageSettlementGapSeconds:Number((days*86_400/Math.max(1,totalSettlementRows)).toFixed(2)),
    finalNpcSupply,finalNpcMedianBalance:finalNpcBalances[Math.floor(finalNpcBalances.length/2)]??0,
    paidEligibleNpcCount:finalNpcBalances.filter((balance)=>balance>=20).length,
    maximumNpcShareBps:finalNpcSupply===0?0:Math.round((finalNpcBalances.at(-1)??0)*10_000/finalNpcSupply),
    topFiveChangedSeats:finalTopFive.filter((id)=>!initialTopFive.includes(id)).length,
    houseBalance,houseGamingProfit,houseOperatingExpenses,houseCurtailedOperatingExpenses,
  });
}

function topIds(balances:Readonly<Record<string,number>>,limit:number):string[]{return Object.entries(balances).toSorted((left,right)=>right[1]-left[1]||compareText(left[0],right[0])).slice(0,limit).map(([id])=>id);}
function flowHouseDelta(sessions:Readonly<Record<string,readonly {tableId:string;secondOfDay:number;delta:number}[]>>,after:number,through:number):number{return -Object.values(sessions).flat().filter((session)=>session.tableId!=="npc-income"&&session.secondOfDay>after&&session.secondOfDay<=through).reduce((total,session)=>total+session.delta,0);}
function sum(values:readonly number[]):number{return values.reduce((total,value)=>total+value,0);}
function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}
