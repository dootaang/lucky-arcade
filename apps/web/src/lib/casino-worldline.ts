import {
  TEMEROSA_HOUSE_ACCOUNT_ID,
  TEMEROSA_HOUSE_OPENING_CAPITAL,
  CASINO_SECONDS_PER_DAY,
  DEFAULT_HOUSE_OPERATING_COST_POLICY,
  casinoDayPlan,
  casinoDayPlanWithHouseOpening,
  casinoKstDayAtUtcSecond,
  casinoSecondOfKstDayAtUtcSecond,
  casinoUtcSecondAtKstDay,
  isHouseTable,
  createHouseOperatingExpensePlan,
  houseDailyActivityFromPlan,
  npcFlowEconomyDay,
  assertCasinoTransaction,
  successorNpcId,
  isFlowLedgerContractVersion,
  type CasinoDayPlan,
  type CasinoPresentationClock,
  type CasinoTransaction,
  type NpcActivity,
  type NpcBalanceEvent,
  type NpcGamblingProfile,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";
import { browserCasinoStorage, readLatestWorldlineCheckpoint, writeWorldlineCheckpoint, PERSONAL_CASINO_WORLDLINE_REVISION, type CasinoWorldlineCheckpointSnapshot, type StorageLike } from "./casino-ledger-cache.ts";

const DAY_SECONDS = CASINO_SECONDS_PER_DAY;
const OPERATIONS_SECOND = 23 * 3_600;
interface CompletedWorldlineMemory{dayIndex:number;journalKey:string;snapshot:CasinoWorldlineCheckpointSnapshot;recentActivities:readonly NpcActivity[]}
const COMPLETED_WORLDLINE_MEMORY=new WeakMap<NpcLedgerContract,Map<string,CompletedWorldlineMemory>>();

export interface PersonalCasinoWorldline {
  dayIndex: number;
  /** Derived-cache diagnostics used by cold-start regression tests and telemetry. */
  checkpointDayIndex:number;
  replayedDayCount:number;
  npcBalances: Readonly<Record<string, number>>;
  activities: readonly NpcActivity[];
  houseBalance: number;
  houseGamingProfit: number;
  houseOperatingExpenses: number;
  houseCurtailedOperatingExpenses: number;
  houseGamingProfitToday: number;
  houseOperatingExpensesToday: number;
  npcExternalReserves: Readonly<Record<string, number>>;
  npcGrossIncomeToday: Readonly<Record<string, number>>;
  npcCasinoTopUpsToday: Readonly<Record<string, number>>;
}

export function personalCasinoWorldlineAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoPresentationClock,
  contract: NpcLedgerContract,
  transactions: readonly CasinoTransaction[],
  storage:StorageLike|undefined=browserCasinoStorage(),
): PersonalCasinoWorldline {
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("casino_worldline_invalid_clock");
  const uniqueTransactions = normalizeTransactions(transactions);
  const absoluteDay = casinoKstDayAtUtcSecond(now);
  const finalDayIndex = absoluteDay - contract.epochKstDay;
  const canCheckpoint=isFlowLedgerContractVersion(contract.version)&&storage!==undefined&&finalDayIndex>=0;
  const completedDayIndex=finalDayIndex-1;
  const completedJournalKey=completedDayIndex>=0?journalKeyThroughDay(uniqueTransactions,contract,completedDayIndex):"";
  const checkpoint=canCheckpoint?readLatestWorldlineCheckpoint(storage!,completedDayIndex,contract,(dayIndex)=>journalKeyThroughDay(uniqueTransactions,contract,dayIndex)):undefined;
  const memory=checkpoint?.dayIndex===completedDayIndex?readCompletedWorldlineMemory(contract,completedDayIndex,completedJournalKey):undefined;
  const opening=checkpoint||memory?undefined:openingWorldlineState(profiles,contract,uniqueTransactions);
  if(finalDayIndex<0){const state=opening!;return freezeWorldline(0,state.npcBalances,[],state.houseBalance,0,0,0,0,0,state.npcExternalReserves,{},{});}
  const transactionDays=transactionsByDay(uniqueTransactions,contract,now);
  const initial=memory?mutableState(memory.snapshot):checkpoint?mutableState(checkpoint.historyAnchor):opening!;
  const startDayIndex=memory?memory.dayIndex+1:checkpoint?checkpoint.historyAnchor.dayIndex+1:0;
  const snapshots=new Map<number,CasinoWorldlineCheckpointSnapshot>([[initial.dayIndex,freezeSnapshot(initial)]]);
  const activities:NpcActivity[]=[...(memory?.recentActivities??[])];
  const activityStartDay=isFlowLedgerContractVersion(contract.version)?Math.max(0,finalDayIndex-6):0;
  let houseGamingProfitToday=0,houseOperatingExpensesToday=0;

  for(let dayIndex=startDayIndex;dayIndex<=finalDayIndex;dayIndex+=1){
    const dayStart=casinoUtcSecondAtKstDay(contract.epochKstDay+dayIndex);
    const cutoff=dayIndex===finalDayIndex?casinoSecondOfKstDayAtUtcSecond(now):DAY_SECONDS-1;
    const dayTransactions=transactionDays.get(dayIndex)??[];
    const balanceEvents=npcEvents(dayTransactions,dayStart,contract);
    const plan=isFlowLedgerContractVersion(contract.version)
      ?casinoDayPlanWithHouseOpening(profiles,dayIndex,initial.npcBalances,contract,initial.houseBalance,balanceEvents)
      :casinoDayPlan(profiles,dayIndex,initial.npcBalances,contract,balanceEvents);
    for(const profile of profiles)for(const session of plan.sessions[profile.id]??[]){
      if(session.secondOfDay>cutoff)continue;
      const utcSecond=dayStart+session.secondOfDay;
      initial.npcBalances[profile.id]!+=session.delta;
      if(dayIndex>=activityStartDay)activities.push(Object.freeze({npcId:profile.id,utcSecond,utcMinute:Math.floor(utcSecond/60),session}));
    }
    for(const event of balanceEvents)if(event.secondOfDay<=cutoff){
      if(initial.npcBalances[event.npcId]===undefined)throw new Error(`casino_worldline_unknown_npc:${event.npcId}`);
      initial.npcBalances[event.npcId]!+=event.delta;
    }
    if(isFlowLedgerContractVersion(contract.version))for(const incomeProfile of contract.externalIncomeProfiles??[]){
      const incomeDay=npcFlowEconomyDay(incomeProfile,contract.epochKstDay+dayIndex);
      if(incomeDay.settlementMinute*60>cutoff)continue;
      initial.npcExternalReserves[incomeProfile.npcId]=(initial.npcExternalReserves[incomeProfile.npcId]??0)+incomeDay.grossIncome-incomeDay.casinoTopUp;
      if(dayIndex===finalDayIndex){initial.npcGrossIncomeToday[incomeProfile.npcId]=incomeDay.grossIncome;initial.npcCasinoTopUpsToday[incomeProfile.npcId]=incomeDay.casinoTopUp;}
    }
    for(const [npcId,balance] of Object.entries(initial.npcBalances))if(!Number.isSafeInteger(balance)||balance<0)throw new Error(`casino_worldline_invalid_balance:${npcId}`);
    const house=applyHouseDay(initial.houseBalance,contract.epochKstDay+dayIndex,cutoff,plan,dayTransactions,dayStart,contract);
    initial.houseBalance=house.balance;initial.houseGamingProfit+=house.gamingProfit;initial.houseOperatingExpenses+=house.operatingExpenses;
    initial.houseCurtailedOperatingExpenses+=house.curtailedOperatingExpenses;initial.dayIndex=dayIndex;
    if(dayIndex===finalDayIndex){houseGamingProfitToday=house.gamingProfit;houseOperatingExpensesToday=house.operatingExpenses;}
    if(canCheckpoint&&cutoff===DAY_SECONDS-1){
      const snapshot=freezeSnapshot(initial);snapshots.set(dayIndex,snapshot);
      const anchor=snapshots.get(Math.max(-1,dayIndex-6));
      if(anchor&&dayIndex>=Math.max(0,completedDayIndex-8))writeWorldlineCheckpoint(storage!,{...snapshot,contract:contract.version,worldlineRevision:PERSONAL_CASINO_WORLDLINE_REVISION,journalKey:journalKeyThroughDay(uniqueTransactions,contract,dayIndex),historyAnchor:anchor},contract);
      for(const snapshotDay of snapshots.keys())if(snapshotDay<dayIndex-6)snapshots.delete(snapshotDay);
    }
  }
  if(canCheckpoint&&completedDayIndex>=0&&!memory){
    const completedSnapshot=snapshots.get(completedDayIndex);
    if(completedSnapshot){
      const recentActivities=Object.freeze(activities.filter((activity)=>casinoKstDayAtUtcSecond(activity.utcSecond)-contract.epochKstDay<=completedDayIndex));
      rememberCompletedWorldline(contract,{dayIndex:completedDayIndex,journalKey:completedJournalKey,snapshot:completedSnapshot,recentActivities});
    }
  }
  activities.sort((left,right)=>right.utcSecond-left.utcSecond||compareText(left.session.matchId,right.session.matchId)||compareText(left.npcId,right.npcId));
  return freezeWorldline(finalDayIndex,initial.npcBalances,activities,initial.houseBalance,initial.houseGamingProfit,initial.houseOperatingExpenses,initial.houseCurtailedOperatingExpenses,houseGamingProfitToday,houseOperatingExpensesToday,initial.npcExternalReserves,initial.npcGrossIncomeToday,initial.npcCasinoTopUpsToday,memory?.dayIndex??checkpoint?.dayIndex??-1,Math.max(0,finalDayIndex-startDayIndex+1));
}

interface MutableWorldlineState{
  dayIndex:number;npcBalances:Record<string,number>;houseBalance:number;houseGamingProfit:number;houseOperatingExpenses:number;houseCurtailedOperatingExpenses:number;
  npcExternalReserves:Record<string,number>;npcGrossIncomeToday:Record<string,number>;npcCasinoTopUpsToday:Record<string,number>;
}

function openingWorldlineState(profiles:readonly NpcGamblingProfile[],contract:NpcLedgerContract,uniqueTransactions:readonly CasinoTransaction[]):MutableWorldlineState{
  const balances:Record<string,number>=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
  let houseOpeningBalance=contract.houseOpeningBalance??TEMEROSA_HOUSE_OPENING_CAPITAL;
  if(contract.predecessor){
    const epochSecond=casinoUtcSecondAtKstDay(contract.epochKstDay);
    const predecessorTransactions=uniqueTransactions.filter((transaction)=>transaction.occurredAtCasinoSecond<epochSecond);
    const predecessorClock={utcMinute:()=>Math.floor((epochSecond-1)/60),utcSecond:()=>epochSecond-1};
    const predecessorBase=personalCasinoWorldlineAt(contract.predecessor.profiles,predecessorClock,contract.predecessor.contract,[],undefined);
    const predecessor=personalCasinoWorldlineAt(contract.predecessor.profiles,predecessorClock,contract.predecessor.contract,predecessorTransactions,undefined);
    for(const legacyProfile of contract.predecessor.profiles){
      const successorId=successorNpcId(legacyProfile.id)??legacyProfile.id;
      if(balances[successorId]===undefined)continue;
      balances[successorId]! += (predecessor.npcBalances[legacyProfile.id]??0)-(predecessorBase.npcBalances[legacyProfile.id]??0);
    }
    houseOpeningBalance+=predecessor.houseBalance-predecessorBase.houseBalance;
  }
  return {dayIndex:-1,npcBalances:balances,houseBalance:houseOpeningBalance,houseGamingProfit:0,houseOperatingExpenses:0,houseCurtailedOperatingExpenses:0,
    npcExternalReserves:Object.fromEntries((contract.externalIncomeProfiles??[]).map((profile)=>[profile.npcId,profile.openingExternalReserve])),npcGrossIncomeToday:{},npcCasinoTopUpsToday:{}};
}

function mutableState(snapshot:CasinoWorldlineCheckpointSnapshot):MutableWorldlineState{return{dayIndex:snapshot.dayIndex,npcBalances:{...snapshot.npcBalances},houseBalance:snapshot.houseBalance,
  houseGamingProfit:snapshot.houseGamingProfit,houseOperatingExpenses:snapshot.houseOperatingExpenses,houseCurtailedOperatingExpenses:snapshot.houseCurtailedOperatingExpenses,
  npcExternalReserves:{...snapshot.npcExternalReserves},npcGrossIncomeToday:{},npcCasinoTopUpsToday:{}};}
function freezeSnapshot(state:MutableWorldlineState):CasinoWorldlineCheckpointSnapshot{return Object.freeze({dayIndex:state.dayIndex,npcBalances:Object.freeze({...state.npcBalances}),houseBalance:state.houseBalance,
  houseGamingProfit:state.houseGamingProfit,houseOperatingExpenses:state.houseOperatingExpenses,houseCurtailedOperatingExpenses:state.houseCurtailedOperatingExpenses,npcExternalReserves:Object.freeze({...state.npcExternalReserves})});}
function journalKeyThroughDay(transactions:readonly CasinoTransaction[],contract:NpcLedgerContract,dayIndex:number):string{
  const through=casinoUtcSecondAtKstDay(contract.epochKstDay+dayIndex+1)-1;
  return transactions.filter((transaction)=>transaction.occurredAtCasinoSecond<=through).map(transactionFingerprint).toSorted(compareText).join("\n");
}
function readCompletedWorldlineMemory(contract:NpcLedgerContract,dayIndex:number,journalKey:string):CompletedWorldlineMemory|undefined{return COMPLETED_WORLDLINE_MEMORY.get(contract)?.get(`${dayIndex}:${journalKey}`);}
function rememberCompletedWorldline(contract:NpcLedgerContract,memory:CompletedWorldlineMemory):void{
  let entries=COMPLETED_WORLDLINE_MEMORY.get(contract);if(!entries){entries=new Map();COMPLETED_WORLDLINE_MEMORY.set(contract,entries);}
  entries.set(`${memory.dayIndex}:${memory.journalKey}`,memory);while(entries.size>4)entries.delete(entries.keys().next().value!);
}

function transactionsByDay(transactions:readonly CasinoTransaction[],contract:NpcLedgerContract,now:number):Map<number,CasinoTransaction[]>{
  const output=new Map<number,CasinoTransaction[]>();
  for(const transaction of transactions){
    if(transaction.occurredAtCasinoSecond>now)continue;
    const dayIndex=casinoKstDayAtUtcSecond(transaction.occurredAtCasinoSecond)-contract.epochKstDay;
    if(dayIndex<0)continue;
    output.set(dayIndex,[...(output.get(dayIndex)??[]),transaction]);
  }
  for(const values of output.values())values.sort((left,right)=>left.occurredAtCasinoSecond-right.occurredAtCasinoSecond||compareText(left.transactionId,right.transactionId));
  return output;
}
function npcEvents(transactions:readonly CasinoTransaction[],dayStart:number,contract:NpcLedgerContract):readonly NpcBalanceEvent[]{
  return Object.freeze(transactions.flatMap((transaction)=>transaction.postings.flatMap((posting,index)=>{
    if(!posting.accountId.startsWith("npc:")||posting.delta===0)return [];
    const storedNpcId=posting.accountId.slice(4);
    const npcId=isFlowLedgerContractVersion(contract.version)?successorNpcId(storedNpcId)??storedNpcId:storedNpcId;
    return [Object.freeze({eventId:`${transaction.transactionId}:${index}`,npcId,secondOfDay:transaction.occurredAtCasinoSecond-dayStart,delta:posting.delta})];
  })));
}
function applyHouseDay(opening:number,absoluteDay:number,cutoff:number,plan:CasinoDayPlan,transactions:readonly CasinoTransaction[],dayStart:number,contract:NpcLedgerContract):{balance:number;gamingProfit:number;operatingExpenses:number;curtailedOperatingExpenses:number}{
  const sessions=plan.sessions;
  const movements=[
    ...Object.values(sessions).flat().filter((session)=>isFlowLedgerContractVersion(contract.version)?session.tableId!=="npc-income":isHouseTable(session.tableId)).map((session)=>({second:session.secondOfDay,delta:-session.delta,kind:"gaming" as const,branch:"deterministic" as const,id:session.matchId})),
    ...transactions.flatMap((transaction)=>transaction.postings.flatMap((posting,index)=>posting.accountId===TEMEROSA_HOUSE_ACCOUNT_ID?[{second:transaction.occurredAtCasinoSecond-dayStart,delta:posting.delta,kind:isHouseGamingTransaction(transaction)?"gaming" as const:"local" as const,branch:"local" as const,id:`${transaction.transactionId}:${index}`}]:[])),
  ].filter((movement)=>movement.second<=cutoff).sort((left,right)=>left.second-right.second||compareText(left.id,right.id));
  const operatingPolicy=contract.houseOperatingPolicy??DEFAULT_HOUSE_OPERATING_COST_POLICY;
  const operationsSecond=isFlowLedgerContractVersion(contract.version)?operatingPolicy.settlementSecondOfDay:OPERATIONS_SECOND;
  let balance=opening,gamingProfit=0,operatingExpenses=0,curtailedOperatingExpenses=0,cursor=0;
  if(!isFlowLedgerContractVersion(contract.version)){
    for(const movement of movements)if(movement.branch==="deterministic"){balance+=movement.delta;gamingProfit+=movement.delta;}
    if(absoluteDay%7===0&&cutoff>=operationsSecond&&balance>TEMEROSA_HOUSE_OPENING_CAPITAL){const amount=Math.floor((balance-TEMEROSA_HOUSE_OPENING_CAPITAL)*.25);balance-=amount;operatingExpenses+=amount;}
    for(const movement of movements)if(movement.branch==="local"){balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
    if(!Number.isSafeInteger(balance)||balance<0)throw new Error("casino_worldline_house_insolvent");
    return {balance,gamingProfit,operatingExpenses,curtailedOperatingExpenses};
  }
  while(cursor<movements.length&&movements[cursor]!.second<=operationsSecond){const movement=movements[cursor++]!;balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
  if(cutoff>=operationsSecond){
    const baseActivity=houseDailyActivityFromPlan({absoluteKstDay:absoluteDay,houseBalance:balance,reservedLiability:0,plan,throughSecondOfDay:operationsSecond});
    const localSettlements=transactions.filter((transaction)=>transaction.occurredAtCasinoSecond-dayStart<=operationsSecond&&transaction.kind==="wager-settlement"&&isHouseGamingTransaction(transaction));
    const localGrossRevenue=localSettlements.reduce((sum,transaction)=>sum+transaction.postings.reduce((postingSum,posting)=>posting.accountId===TEMEROSA_HOUSE_ACCOUNT_ID?postingSum+Math.max(0,posting.delta):postingSum,0),0);
    const expense=createHouseOperatingExpensePlan({...baseActivity,settledRoundCount:baseActivity.settledRoundCount+localSettlements.length,grossGamingRevenue:baseActivity.grossGamingRevenue+localGrossRevenue},operatingPolicy);
    balance-=expense.paidAmount;operatingExpenses+=expense.paidAmount;curtailedOperatingExpenses+=expense.curtailedAmount;
  }
  while(cursor<movements.length){const movement=movements[cursor++]!;balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
  if(!Number.isSafeInteger(balance)||balance<0)throw new Error("casino_worldline_house_insolvent");
  return {balance,gamingProfit,operatingExpenses,curtailedOperatingExpenses};
}
function freezeWorldline(dayIndex:number,npcBalances:Record<string,number>,activities:NpcActivity[],houseBalance:number,houseGamingProfit:number,houseOperatingExpenses:number,houseCurtailedOperatingExpenses:number,houseGamingProfitToday:number,houseOperatingExpensesToday:number,npcExternalReserves:Record<string,number>,npcGrossIncomeToday:Record<string,number>,npcCasinoTopUpsToday:Record<string,number>,checkpointDayIndex=-1,replayedDayCount=0):PersonalCasinoWorldline{return Object.freeze({dayIndex,checkpointDayIndex,replayedDayCount,npcBalances:Object.freeze({...npcBalances}),activities:Object.freeze(activities),houseBalance,houseGamingProfit,houseOperatingExpenses,houseCurtailedOperatingExpenses,houseGamingProfitToday,houseOperatingExpensesToday,npcExternalReserves:Object.freeze({...npcExternalReserves}),npcGrossIncomeToday:Object.freeze({...npcGrossIncomeToday}),npcCasinoTopUpsToday:Object.freeze({...npcCasinoTopUpsToday})});}
function isHouseGamingTransaction(transaction:CasinoTransaction):boolean{return Boolean(transaction.tableId&&(transaction.tableId==="temerosa-slot"||transaction.tableId==="temerosa-high-low"||transaction.tableId==="temerosa-blackjack"));}
function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}

/** IndexedDB enforces these identities, but replay also defends imported or restored journals. */
function normalizeTransactions(transactions:readonly CasinoTransaction[]):readonly CasinoTransaction[]{
  const byIdempotencyKey=new Map<string,Readonly<{fingerprint:string;transaction:CasinoTransaction}>>();
  const byTransactionId=new Map<string,string>();
  for(const transaction of transactions){
    assertCasinoTransaction(transaction);
    const fingerprint=transactionFingerprint(transaction);
    const previousIdempotency=byIdempotencyKey.get(transaction.idempotencyKey);
    if(previousIdempotency){
      if(previousIdempotency.fingerprint!==fingerprint)throw new Error(`casino_worldline_transaction_conflict:${transaction.idempotencyKey}`);
      continue;
    }
    const previousTransaction=byTransactionId.get(transaction.transactionId);
    if(previousTransaction&&previousTransaction!==fingerprint)throw new Error(`casino_worldline_transaction_conflict:${transaction.transactionId}`);
    byIdempotencyKey.set(transaction.idempotencyKey,Object.freeze({fingerprint,transaction}));
    byTransactionId.set(transaction.transactionId,fingerprint);
  }
  return Object.freeze([...byIdempotencyKey.values()].map(({transaction})=>transaction));
}

function transactionFingerprint(transaction:CasinoTransaction):string{return JSON.stringify({
  contract:transaction.contract,transactionId:transaction.transactionId,idempotencyKey:transaction.idempotencyKey,
  occurredAtCasinoSecond:transaction.occurredAtCasinoSecond,kind:transaction.kind,matchId:transaction.matchId??null,
  tableId:transaction.tableId??null,termsVersion:transaction.termsVersion??null,stake:transaction.stake??null,
  resultKey:transaction.resultKey??null,postings:transaction.postings.map(({accountId,delta})=>[accountId,delta]),
});}
