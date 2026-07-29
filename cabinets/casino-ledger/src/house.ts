import type { CasinoClock, CasinoLedgerSourceId, CasinoTableId, NpcGamblingProfile, NpcLedgerContract, NpcRoundSettlement, NpcSession } from "./contracts.ts";
import { casinoDaySessions } from "./engine.ts";
import { casinoKstDayAtUtcSecond, casinoSecondOfKstDayAtUtcSecond } from "./casino-time.ts";
import { TEMEROSA_HOUSE_ACCOUNT_ID, TEMEROSA_HOUSE_OPENING_CAPITAL } from "./economy.ts";

export interface HouseBalanceSnapshot {
  accountId: typeof TEMEROSA_HOUSE_ACCOUNT_ID;
  balance: number;
  gamingProfit: number;
  operatingExpenses: number;
  availableReserve: number;
  reservedLiability: number;
  dayIndex: number;
}

export function isHouseTable(tableId: CasinoLedgerSourceId): tableId is Extract<CasinoTableId,"temerosa-slot"|"temerosa-high-low"> {
  return tableId === "temerosa-slot" || tableId === "temerosa-high-low";
}

export function houseBalanceAt(profiles: readonly NpcGamblingProfile[], clock: CasinoClock, contract: NpcLedgerContract): HouseBalanceSnapshot {
  const nowSecond = normalizedUtcSecond(clock);
  const absoluteDay = casinoKstDayAtUtcSecond(nowSecond);
  const finalDayIndex = absoluteDay - contract.epochKstDay;
  if (finalDayIndex < 0) return snapshot(TEMEROSA_HOUSE_OPENING_CAPITAL,0,0,0);
  let npcBalances = Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
  let balance = TEMEROSA_HOUSE_OPENING_CAPITAL;
  let gamingProfit = 0;
  let operatingExpenses = 0;
  for (let dayIndex=0;dayIndex<=finalDayIndex;dayIndex+=1) {
    const sessions=casinoDaySessions(profiles,dayIndex,npcBalances,contract);
    const secondLimit=dayIndex===finalDayIndex?casinoSecondOfKstDayAtUtcSecond(nowSecond):86_399;
    let dayProfit=0;
    for(const profile of profiles)for(const session of sessions[profile.id]??[]){
      if(session.secondOfDay<=secondLimit&&isHouseTable(session.tableId))dayProfit-=session.delta;
    }
    balance+=dayProfit;gamingProfit+=dayProfit;
    const kstDay=contract.epochKstDay+dayIndex;
    if(kstDay%7===0&&secondLimit>=23*3_600&&balance>TEMEROSA_HOUSE_OPENING_CAPITAL){
      const expense=Math.floor((balance-TEMEROSA_HOUSE_OPENING_CAPITAL)*.25);
      balance-=expense;operatingExpenses+=expense;
    }
    npcBalances=closeNpcBalances(npcBalances,sessions,profiles,secondLimit);
  }
  if(!Number.isSafeInteger(balance)||balance<0)throw new Error("house_balance_invalid");
  return snapshot(balance,gamingProfit,operatingExpenses,finalDayIndex);
}

export function withHouseCounterparties(entries: readonly NpcRoundSettlement[]): readonly NpcRoundSettlement[] {
  const output: NpcRoundSettlement[]=[];
  for(const entry of entries){
    output.push(entry);
    if(!isHouseTable(entry.tableId))continue;
    const delta=-entry.delta;
    output.push(Object.freeze({
      ...entry,
      roundId:`house-counterparty/1.0:${entry.roundId}`,
      npcId:TEMEROSA_HOUSE_ACCOUNT_ID,
      participantIds:Object.freeze([entry.npcId,TEMEROSA_HOUSE_ACCOUNT_ID]),
      reservedAmount:delta<0?-delta:0,
      creditAmount:delta>0?delta:0,
      delta,
      resultKind:`house:${entry.resultKind}`,
    }));
  }
  return Object.freeze(output.toSorted((left,right)=>right.utcSecond-left.utcSecond||compareText(left.roundId,right.roundId)));
}

export function houseGamingDelta(sessions: Readonly<Record<string,readonly NpcSession[]>>): number {
  return -Object.values(sessions).flat().filter((session)=>isHouseTable(session.tableId)).reduce((sum,session)=>sum+session.delta,0);
}

function closeNpcBalances(opening:Readonly<Record<string,number>>,sessions:Readonly<Record<string,readonly NpcSession[]>>,profiles:readonly NpcGamblingProfile[],secondLimit:number):Record<string,number>{
  return Object.fromEntries(profiles.map((profile)=>[profile.id,opening[profile.id]!+(sessions[profile.id]??[]).filter((session)=>session.secondOfDay<=secondLimit).reduce((sum,session)=>sum+session.delta,0)]));
}
function snapshot(balance:number,gamingProfit:number,operatingExpenses:number,dayIndex:number):HouseBalanceSnapshot{return Object.freeze({accountId:TEMEROSA_HOUSE_ACCOUNT_ID,balance,gamingProfit,operatingExpenses,availableReserve:balance,reservedLiability:0,dayIndex});}
function normalizedUtcSecond(clock:CasinoClock):number{const exact=(clock as CasinoClock&{utcSecond?:()=>number}).utcSecond?.();const value=exact??clock.utcMinute()*60+59;if(!Number.isSafeInteger(value))throw new Error("house_clock_invalid");return value;}
function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}
