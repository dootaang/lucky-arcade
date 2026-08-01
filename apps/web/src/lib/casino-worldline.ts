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
  successorNpcId,
  type CasinoDayPlan,
  type CasinoPresentationClock,
  type CasinoTransaction,
  type NpcActivity,
  type NpcBalanceEvent,
  type NpcGamblingProfile,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";

const DAY_SECONDS = CASINO_SECONDS_PER_DAY;
const OPERATIONS_SECOND = 23 * 3_600;

export interface PersonalCasinoWorldline {
  dayIndex: number;
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
): PersonalCasinoWorldline {
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("casino_worldline_invalid_clock");
  const absoluteDay = casinoKstDayAtUtcSecond(now);
  const finalDayIndex = absoluteDay - contract.epochKstDay;
  const balances: Record<string, number> = Object.fromEntries(profiles.map((profile) => [profile.id, profile.openingBalance]));
  let houseOpeningBalance=contract.houseOpeningBalance??TEMEROSA_HOUSE_OPENING_CAPITAL;
  if(contract.predecessor){
    const epochSecond=casinoUtcSecondAtKstDay(contract.epochKstDay);
    const predecessorTransactions=transactions.filter((transaction)=>transaction.occurredAtCasinoSecond<epochSecond);
    const predecessorClock={utcMinute:()=>Math.floor((epochSecond-1)/60),utcSecond:()=>epochSecond-1};
    const predecessorBase=personalCasinoWorldlineAt(contract.predecessor.profiles,predecessorClock,contract.predecessor.contract,[]);
    const predecessor=personalCasinoWorldlineAt(contract.predecessor.profiles,predecessorClock,contract.predecessor.contract,predecessorTransactions);
    for(const legacyProfile of contract.predecessor.profiles){
      const successorId=successorNpcId(legacyProfile.id)??legacyProfile.id;
      if(balances[successorId]===undefined)continue;
      balances[successorId]! += (predecessor.npcBalances[legacyProfile.id]??0)-(predecessorBase.npcBalances[legacyProfile.id]??0);
    }
    houseOpeningBalance+=predecessor.houseBalance-predecessorBase.houseBalance;
  }
  const externalReserves: Record<string,number> = Object.fromEntries((contract.externalIncomeProfiles??[]).map((profile)=>[profile.npcId,profile.openingExternalReserve]));
  const grossIncomeToday: Record<string,number> = {};
  const casinoTopUpsToday: Record<string,number> = {};
  if (finalDayIndex < 0) return freezeWorldline(0, balances, [], houseOpeningBalance, 0, 0, 0, 0, 0, externalReserves, grossIncomeToday, casinoTopUpsToday);
  const transactionDays = transactionsByDay(transactions, contract, now);
  const activities: NpcActivity[] = [];
  let houseBalance = houseOpeningBalance;
  let houseGamingProfit = 0;
  let houseOperatingExpenses = 0;
  let houseCurtailedOperatingExpenses = 0;
  let houseGamingProfitToday = 0;
  let houseOperatingExpensesToday = 0;

  for (let dayIndex = 0; dayIndex <= finalDayIndex; dayIndex += 1) {
    const dayStart = casinoUtcSecondAtKstDay(contract.epochKstDay + dayIndex);
    const cutoff = dayIndex === finalDayIndex ? casinoSecondOfKstDayAtUtcSecond(now) : DAY_SECONDS - 1;
    const dayTransactions = transactionDays.get(dayIndex) ?? [];
    const balanceEvents = npcEvents(dayTransactions, dayStart);
    const plan = contract.version==="npc-ledger/1.2"
      ? casinoDayPlanWithHouseOpening(profiles,dayIndex,balances,contract,houseBalance,balanceEvents)
      : casinoDayPlan(profiles,dayIndex,balances,contract,balanceEvents);
    const sessions = plan.sessions;
    for (const profile of profiles) {
      for (const session of sessions[profile.id] ?? []) {
        if (session.secondOfDay > cutoff) continue;
        const utcSecond = dayStart + session.secondOfDay;
        balances[profile.id]! += session.delta;
        activities.push(Object.freeze({ npcId: profile.id, utcSecond, utcMinute: Math.floor(utcSecond / 60), session }));
      }
    }
    for (const event of balanceEvents) if (event.secondOfDay <= cutoff) balances[event.npcId]! += event.delta;
    if(contract.version==="npc-ledger/1.2")for(const incomeProfile of contract.externalIncomeProfiles??[]){
      const incomeDay=npcFlowEconomyDay(incomeProfile,contract.epochKstDay+dayIndex);
      if(incomeDay.settlementMinute*60>cutoff)continue;
      externalReserves[incomeProfile.npcId]=(externalReserves[incomeProfile.npcId]??0)+incomeDay.grossIncome-incomeDay.casinoTopUp;
      if(dayIndex===finalDayIndex){grossIncomeToday[incomeProfile.npcId]=incomeDay.grossIncome;casinoTopUpsToday[incomeProfile.npcId]=incomeDay.casinoTopUp;}
    }
    for (const [npcId, balance] of Object.entries(balances)) if (!Number.isSafeInteger(balance) || balance < 0) throw new Error(`casino_worldline_invalid_balance:${npcId}`);

    const house = applyHouseDay(houseBalance, contract.epochKstDay + dayIndex, cutoff, plan, dayTransactions, dayStart, contract);
    houseBalance = house.balance;
    houseGamingProfit += house.gamingProfit;
    houseOperatingExpenses += house.operatingExpenses;
    houseCurtailedOperatingExpenses += house.curtailedOperatingExpenses;
    if(dayIndex===finalDayIndex){houseGamingProfitToday=house.gamingProfit;houseOperatingExpensesToday=house.operatingExpenses;}
  }
  activities.sort((left,right)=>right.utcSecond-left.utcSecond||compareText(left.session.matchId,right.session.matchId)||compareText(left.npcId,right.npcId));
  return freezeWorldline(finalDayIndex, balances, activities, houseBalance, houseGamingProfit, houseOperatingExpenses, houseCurtailedOperatingExpenses, houseGamingProfitToday, houseOperatingExpensesToday, externalReserves, grossIncomeToday, casinoTopUpsToday);
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
function npcEvents(transactions:readonly CasinoTransaction[],dayStart:number):readonly NpcBalanceEvent[]{
  return Object.freeze(transactions.flatMap((transaction)=>transaction.postings.flatMap((posting,index)=>posting.accountId.startsWith("npc:")&&posting.delta!==0?[Object.freeze({eventId:`${transaction.transactionId}:${index}`,npcId:posting.accountId.slice(4),secondOfDay:transaction.occurredAtCasinoSecond-dayStart,delta:posting.delta})]:[])));
}
function applyHouseDay(opening:number,absoluteDay:number,cutoff:number,plan:CasinoDayPlan,transactions:readonly CasinoTransaction[],dayStart:number,contract:NpcLedgerContract):{balance:number;gamingProfit:number;operatingExpenses:number;curtailedOperatingExpenses:number}{
  const sessions=plan.sessions;
  const movements=[
    ...Object.values(sessions).flat().filter((session)=>contract.version==="npc-ledger/1.2"?session.tableId!=="npc-income":isHouseTable(session.tableId)).map((session)=>({second:session.secondOfDay,delta:-session.delta,kind:"gaming" as const,id:session.matchId})),
    ...transactions.flatMap((transaction)=>transaction.postings.flatMap((posting,index)=>posting.accountId===TEMEROSA_HOUSE_ACCOUNT_ID?[{second:transaction.occurredAtCasinoSecond-dayStart,delta:posting.delta,kind:isHouseGamingTransaction(transaction)?"gaming" as const:"local" as const,id:`${transaction.transactionId}:${index}`}]:[])),
  ].filter((movement)=>movement.second<=cutoff).sort((left,right)=>left.second-right.second||compareText(left.id,right.id));
  const operatingPolicy=contract.houseOperatingPolicy??DEFAULT_HOUSE_OPERATING_COST_POLICY;
  const operationsSecond=contract.version==="npc-ledger/1.2"?operatingPolicy.settlementSecondOfDay:OPERATIONS_SECOND;
  let balance=opening,gamingProfit=0,operatingExpenses=0,curtailedOperatingExpenses=0,cursor=0;
  while(cursor<movements.length&&movements[cursor]!.second<=operationsSecond){const movement=movements[cursor++]!;balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
  if(contract.version==="npc-ledger/1.2"&&cutoff>=operationsSecond){
    const baseActivity=houseDailyActivityFromPlan({absoluteKstDay:absoluteDay,houseBalance:balance,reservedLiability:0,plan,throughSecondOfDay:operationsSecond});
    const localSettlements=transactions.filter((transaction)=>transaction.occurredAtCasinoSecond-dayStart<=operationsSecond&&transaction.kind==="wager-settlement"&&isHouseGamingTransaction(transaction));
    const localGrossRevenue=localSettlements.reduce((sum,transaction)=>sum+transaction.postings.reduce((postingSum,posting)=>posting.accountId===TEMEROSA_HOUSE_ACCOUNT_ID?postingSum+Math.max(0,posting.delta):postingSum,0),0);
    const expense=createHouseOperatingExpensePlan({...baseActivity,settledRoundCount:baseActivity.settledRoundCount+localSettlements.length,grossGamingRevenue:baseActivity.grossGamingRevenue+localGrossRevenue},operatingPolicy);
    balance-=expense.paidAmount;operatingExpenses+=expense.paidAmount;curtailedOperatingExpenses+=expense.curtailedAmount;
  }else if(contract.version!=="npc-ledger/1.2"&&absoluteDay%7===0&&cutoff>=operationsSecond&&balance>TEMEROSA_HOUSE_OPENING_CAPITAL){const amount=Math.floor((balance-TEMEROSA_HOUSE_OPENING_CAPITAL)*.25);balance-=amount;operatingExpenses+=amount;}
  while(cursor<movements.length){const movement=movements[cursor++]!;balance+=movement.delta;if(movement.kind==="gaming")gamingProfit+=movement.delta;}
  if(!Number.isSafeInteger(balance)||balance<0)throw new Error("casino_worldline_house_insolvent");
  return {balance,gamingProfit,operatingExpenses,curtailedOperatingExpenses};
}
function freezeWorldline(dayIndex:number,npcBalances:Record<string,number>,activities:NpcActivity[],houseBalance:number,houseGamingProfit:number,houseOperatingExpenses:number,houseCurtailedOperatingExpenses:number,houseGamingProfitToday:number,houseOperatingExpensesToday:number,npcExternalReserves:Record<string,number>,npcGrossIncomeToday:Record<string,number>,npcCasinoTopUpsToday:Record<string,number>):PersonalCasinoWorldline{return Object.freeze({dayIndex,npcBalances:Object.freeze({...npcBalances}),activities:Object.freeze(activities),houseBalance,houseGamingProfit,houseOperatingExpenses,houseCurtailedOperatingExpenses,houseGamingProfitToday,houseOperatingExpensesToday,npcExternalReserves:Object.freeze({...npcExternalReserves}),npcGrossIncomeToday:Object.freeze({...npcGrossIncomeToday}),npcCasinoTopUpsToday:Object.freeze({...npcCasinoTopUpsToday})});}
function isHouseGamingTransaction(transaction:CasinoTransaction):boolean{return Boolean(transaction.tableId&&(transaction.tableId==="temerosa-slot"||transaction.tableId==="temerosa-high-low"||transaction.tableId==="temerosa-blackjack"));}
function compareText(left:string,right:string):number{return left<right?-1:left>right?1:0;}
