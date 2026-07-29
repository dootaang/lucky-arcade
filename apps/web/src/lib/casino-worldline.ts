import {
  TEMEROSA_HOUSE_ACCOUNT_ID,
  TEMEROSA_HOUSE_OPENING_CAPITAL,
  casinoDaySessions,
  isHouseTable,
  type CasinoPresentationClock,
  type CasinoTransaction,
  type NpcActivity,
  type NpcBalanceEvent,
  type NpcGamblingProfile,
  type NpcLedgerContract,
  type NpcSession,
} from "@lucky-arcade/casino-ledger";

const DAY_SECONDS = 86_400;
const OPERATIONS_SECOND = 23 * 3_600;

export interface PersonalCasinoWorldline {
  dayIndex: number;
  npcBalances: Readonly<Record<string, number>>;
  activities: readonly NpcActivity[];
  houseBalance: number;
  houseGamingProfit: number;
  houseOperatingExpenses: number;
}

export function personalCasinoWorldlineAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoPresentationClock,
  contract: NpcLedgerContract,
  transactions: readonly CasinoTransaction[],
): PersonalCasinoWorldline {
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("casino_worldline_invalid_clock");
  const absoluteDay = Math.floor(now / DAY_SECONDS);
  const finalDayIndex = absoluteDay - contract.epochUtcDay;
  const balances: Record<string, number> = Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance]));
  if (finalDayIndex < 0) return freezeWorldline(0, balances, [], TEMEROSA_HOUSE_OPENING_CAPITAL, 0, 0);
  const transactionDays = transactionsByDay(transactions, contract, now);
  const activities: NpcActivity[] = [];
  let houseBalance = TEMEROSA_HOUSE_OPENING_CAPITAL;
  let houseGamingProfit = 0;
  let houseOperatingExpenses = 0;

  for (let dayIndex = 0; dayIndex <= finalDayIndex; dayIndex += 1) {
    const dayStart = (contract.epochUtcDay + dayIndex) * DAY_SECONDS;
    const cutoff = dayIndex === finalDayIndex ? now - dayStart : DAY_SECONDS - 1;
    const dayTransactions = transactionDays.get(dayIndex) ?? [];
    const balanceEvents = npcEvents(dayTransactions, dayStart);
    const sessions = casinoDaySessions(profiles, dayIndex, balances, contract, balanceEvents);
    for (const profile of profiles) {
      for (const session of sessions[profile.id] ?? []) {
        if (session.secondOfDay > cutoff) continue;
        const utcSecond = dayStart + session.secondOfDay;
        balances[profile.id]! += session.delta;
        activities.push(Object.freeze({ npcId: profile.id, utcSecond, utcMinute: Math.floor(utcSecond / 60), session }));
      }
    }
    for (const event of balanceEvents) if (event.secondOfDay <= cutoff) balances[event.npcId]! += event.delta;
    for (const [npcId, balance] of Object.entries(balances)) if (!Number.isSafeInteger(balance) || balance < 0) throw new Error(`casino_worldline_invalid_balance:${npcId}`);

    const house = applyHouseDay(houseBalance, contract.epochUtcDay + dayIndex, cutoff, sessions, dayTransactions, dayStart);
    houseBalance = house.balance;
    houseGamingProfit += house.gamingProfit;
    houseOperatingExpenses += house.operatingExpenses;
  }
  activities.sort((left,right)=>right.utcSecond-left.utcSecond||compareText(left.session.matchId,right.session.matchId)||compareText(left.npcId,right.npcId));
  return freezeWorldline(finalDayIndex, balances, activities, houseBalance, houseGamingProfit, houseOperatingExpenses);
}

function transactionsByDay(transactions:readonly CasinoTransaction[],contract:NpcLedgerContract,now:number):Map<number,CasinoTransaction[]>{
  const output=new Map<number,CasinoTransaction[]>();
  for(const transaction of transactions){
    if(transaction.occurredAtCasinoSecond>now)continue;
    const dayIndex=Math.floor(transaction.occurredAtCasinoSecond/DAY_SECONDS)-contract.epochUtcDay;
    if(dayIndex<0)continue;
    output.set(dayIndex,[...(output.get(dayIndex)??[]),transaction]);
  }
  for(const values of output.values())values.sort((left,right)=>left.occurredAtCasinoSecond-right.occurredAtCasinoSecond||compareText(left.transactionId,right.transactionId));
  return output;
}
function npcEvents(transactions:readonly CasinoTransaction[],dayStart:number):readonly NpcBalanceEvent[]{
  return Object.freeze(transactions.flatMap((transaction)=>transaction.postings.flatMap((posting,index)=>posting.accountId.startsWith("npc:")&&posting.delta!==0?[Object.freeze({eventId:`${transaction.transactionId}:${index}`,npcId:posting.accountId.slice(4),secondOfDay:transaction.occurredAtCasinoSecond-dayStart,delta:posting.delta})]:[])));
}
function applyHouseDay(opening:number,absoluteDay:number,cutoff:number,sessions:Readonly<Record<string,readonly NpcSession[]>>,transactions:readonly CasinoTransaction[],dayStart:number):{balance:number;gamingProfit:number;operatingExpenses:number}{
  const movements=[
    ...Object.values(sessions).flat().filter((session)=>isHouseTable(session.tableId)).map((session)=>({second:session.secondOfDay,delta:-session.delta,kind:"gaming" as const,id:session.matchId})),
    ...transactions.flatMap((transaction)=>transaction.postings.flatMap((posting,index)=>posting.accountId===TEMEROSA_HOUSE_ACCOUNT_ID?[{second:transaction.occurredAtCasinoSecond-dayStart,delta:posting.delta,kind:"local" as const,id:`${transaction.transactionId}:${index}`}]:[])),
  ].filter((movement)=>movement.second<=cutoff).sort((left,right)=>left.second-right.second||compareText(left.id,right.id));
  let balance=opening,gamingProfit=0,operatingExpenses=0,cursor=0;
  while(cursor<movements.length&&movements[cursor]!.second<OPERATIONS_SECOND){const movement=movements[cursor++]!;balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
  if(absoluteDay%7===0&&cutoff>=OPERATIONS_SECOND&&balance>TEMEROSA_HOUSE_OPENING_CAPITAL){const amount=Math.floor((balance-TEMEROSA_HOUSE_OPENING_CAPITAL)*.25);balance-=amount;operatingExpenses+=amount;}
  while(cursor<movements.length){const movement=movements[cursor++]!;balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
  if(!Number.isSafeInteger(balance)||balance<0)throw new Error("casino_worldline_house_insolvent");
  return {balance,gamingProfit,operatingExpenses};
}
function freezeWorldline(dayIndex:number,npcBalances:Record<string,number>,activities:NpcActivity[],houseBalance:number,houseGamingProfit:number,houseOperatingExpenses:number):PersonalCasinoWorldline{return Object.freeze({dayIndex,npcBalances:Object.freeze({...npcBalances}),activities:Object.freeze(activities),houseBalance,houseGamingProfit,houseOperatingExpenses});}
function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}
