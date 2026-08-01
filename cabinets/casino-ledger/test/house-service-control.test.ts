import {describe,expect,it} from "vitest";
import {auditCasinoFlowEconomy,casinoDayPlan,casinoDayPlanWithHouseOpening,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT,withHouseCounterparties,type NpcRoundSettlement} from "../src/index.ts";

describe("deterministic house service control",()=>{
  const contract=TEMEROSA_FLOW_NPC_LEDGER_CONTRACT;
  const profiles=contract.profiles;
  const openings=Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]));
  const reserve=contract.houseOperatingPolicy!.protectedReserve;

  it("reproduces the same accepted and curtailed service envelope",()=>{
    const constrained=Object.freeze({...contract,houseOpeningBalance:reserve});
    const first=casinoDayPlan(profiles,0,openings,constrained);
    const second=casinoDayPlan(profiles,0,openings,constrained);
    expect(second).toEqual(first);
    expect(first.houseService).toMatchObject({openingBalance:reserve,protectedReserve:reserve,acceptedHouseRiskRounds:0});
    expect(first.houseService!.curtailedHouseRiskRounds).toBeGreaterThan(0);
  });

  it("accepts an explicit house opening without replaying prior days",()=>{
    const plan=casinoDayPlanWithHouseOpening(profiles,365,openings,contract,77_777);
    expect(plan.houseService?.openingBalance).toBe(77_777);
  });

  it("isolates cached plans by every house operating policy value",()=>{
    const first=Object.freeze({...contract,houseOpeningBalance:100_000,houseOperatingPolicy:Object.freeze({...contract.houseOperatingPolicy!,protectedReserve:50_000})});
    const second=Object.freeze({...contract,houseOpeningBalance:100_000,houseOperatingPolicy:Object.freeze({...contract.houseOperatingPolicy!,protectedReserve:90_000})});
    const firstPlan=casinoDayPlan(profiles,0,openings,first);
    const secondPlan=casinoDayPlan(profiles,0,openings,second);
    expect(firstPlan.houseService!.protectedReserve).toBe(50_000);
    expect(secondPlan.houseService!.protectedReserve).toBe(90_000);
    expect(secondPlan.houseService!.acceptedHouseRiskRounds).toBeLessThan(firstPlan.houseService!.acceptedHouseRiskRounds);
  });

  it("isolates cached plans by contract identity, epoch, behavior, and income inputs",()=>{
    const baseline=casinoDayPlan(profiles,0,openings,contract);
    const firstBehavior=contract.behaviors![0]!;
    const behaviorContract=Object.freeze({...contract,behaviors:Object.freeze([
      Object.freeze({...firstBehavior,visitsPerDay:Object.freeze({min:1,max:1}),roundsPerVisit:Object.freeze({min:1,max:1})}),
      ...contract.behaviors!.slice(1),
    ])});
    const epochContract=Object.freeze({...contract,epochKstDay:contract.epochKstDay+1});
    const firstIncome=contract.externalIncomeProfiles![0]!;
    const incomeContract=Object.freeze({...contract,externalIncomeProfiles:Object.freeze([
      Object.freeze({...firstIncome,dailyIncomeRange:Object.freeze([9_999,9_999] as const)}),
      ...contract.externalIncomeProfiles!.slice(1),
    ])});
    const behaviorPlan=casinoDayPlan(profiles,0,openings,behaviorContract);
    const epochPlan=casinoDayPlan(profiles,0,openings,epochContract);
    const incomePlan=casinoDayPlan(profiles,0,openings,incomeContract);
    expect(behaviorPlan).not.toBe(baseline);
    expect(behaviorPlan.matches.length).not.toBe(baseline.matches.length);
    expect(epochPlan).not.toBe(baseline);
    expect(epochPlan.sessions[firstIncome.npcId]?.find((session)=>session.tableId==="npc-income")?.matchId).not.toBe(baseline.sessions[firstIncome.npcId]?.find((session)=>session.tableId==="npc-income")?.matchId);
    expect(incomePlan).not.toBe(baseline);
    expect(incomePlan.sessions[firstIncome.npcId]?.find((session)=>session.tableId==="npc-income")?.delta).not.toBe(baseline.sessions[firstIncome.npcId]?.find((session)=>session.tableId==="npc-income")?.delta);
  });

  it("keeps only self-funding PVP open when reserve has no risk capacity",()=>{
    const constrained=Object.freeze({...contract,houseOpeningBalance:reserve});
    const plan=casinoDayPlan(profiles,0,openings,constrained);
    expect(plan.matches.some((match)=>match.tableId==="indian-poker"||match.tableId==="temerosa-match-pairs"||match.tableId==="temerosa-five-card-draw")).toBe(true);
    const first=plan.matches[0]!;
    expect(first.stake*first.multiplier).toBeGreaterThan(20);
    expect(plan.matches.some((match)=>match.tableId==="temerosa-slot"||match.tableId==="temerosa-high-low")).toBe(false);
    expect(plan.houseService).toMatchObject({acceptedHouseRiskRounds:0});
  });

  it("does not invent rake to keep paid old maid open",()=>{
    const oldMaidOnly=Object.freeze({...contract,houseOpeningBalance:reserve,behaviors:Object.freeze(contract.behaviors!.map((behavior)=>Object.freeze({...behavior,preferredTables:Object.freeze([{tableId:"temerosa-old-maid" as const,weight:1}])})))});
    const plan=casinoDayPlan(profiles,0,openings,oldMaidOnly);
    expect(plan.matches).toEqual([]);
  });

  it("does not use a result to decide a common round",()=>{
    const unconstrained=casinoDayPlan(profiles,0,openings,contract);
    const constrainedContract=Object.freeze({...contract,houseOpeningBalance:120_000});
    const constrained=casinoDayPlan(profiles,0,openings,constrainedContract);
    const constrainedMatches=new Map(constrained.matches.map((match)=>[match.matchId,match]));
    const common=unconstrained.matches.filter((match)=>{
      const other=constrainedMatches.get(match.matchId);
      return other!==undefined&&other.stake===match.stake&&other.multiplier===match.multiplier;
    });
    expect(common.length).toBeGreaterThan(0);
    const commonIds=new Set(common.map((match)=>match.matchId));
    const results=(plan:typeof unconstrained)=>Object.entries(plan.sessions).flatMap(([npcId,sessions])=>sessions.filter((session)=>commonIds.has(session.matchId)).map((session)=>({matchId:session.matchId,npcId,resultKind:session.resultKind,reservedAmount:session.reservedAmount,creditAmount:session.creditAmount}))).toSorted((left,right)=>left.matchId.localeCompare(right.matchId)||left.npcId.localeCompare(right.npcId));
    expect(results(constrained)).toEqual(results(unconstrained));
  });

  it("charges the published rake on a draw without changing the draw result",()=>{
    const plan=casinoDayPlanWithHouseOpening(profiles,0,openings,contract,contract.houseOpeningBalance!);
    const draw=Object.values(plan.sessions).flat().find((session)=>session.resultKind==="draw"&&session.termsVersion.startsWith("temerosa-pvp-rake/1.1:"));
    expect(draw).toBeDefined();
    const rows=Object.values(plan.sessions).flat().filter((session)=>session.matchId===draw!.matchId);
    const exposure=draw!.stake*plan.matches.find((match)=>match.matchId===draw!.matchId)!.multiplier;
    const rake=Math.max(1,Math.floor(exposure*2*.075));
    expect(rows).toHaveLength(2);
    expect(rows.every((session)=>session.resultKind==="draw"&&session.termsVersion.startsWith("temerosa-pvp-rake/1.1:"))).toBe(true);
    expect(rows.reduce((sum,session)=>sum+session.delta,0)).toBe(-rake);
    const receipts:NpcRoundSettlement[]=rows.map((session,index)=>({roundId:`${session.matchId}:${index}`,matchId:session.matchId,visitId:session.visitId,participantIds:session.participantIds,npcId:session.participantIds[index]!,tableId:session.tableId,utcSecond:session.secondOfDay,stake:session.stake,reservedAmount:session.reservedAmount,creditAmount:session.creditAmount,delta:session.delta,resultKind:session.resultKind,termsVersion:session.termsVersion}));
    const withHouse=withHouseCounterparties(receipts);
    expect(withHouse.reduce((sum,entry)=>sum+entry.delta,0)).toBe(0);
    expect(withHouse.find((entry)=>entry.npcId==="house:temerosa")?.delta).toBe(rake);
  });

  it("keeps every atomic house close above the reserve in the routine audit period",()=>{
    const report=auditCasinoFlowEconomy(contract,30);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(reserve);
    expect(report.houseCurtailedOperatingExpenses).toBe(0);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
  },30_000);

  const annualAudit=process.env.CASINO_LEDGER_ANNUAL_AUDIT==="1"?it:it.skip;
  annualAudit("keeps every atomic house close above the reserve for one year",()=>{
    const report=auditCasinoFlowEconomy(contract,365);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(reserve);
    expect(report.houseCurtailedOperatingExpenses).toBe(0);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
  },180_000);

  const longAudit=process.env.CASINO_LEDGER_LONG_AUDIT==="1"?it:it.skip;
  longAudit("records the ten-year reserve-safe release audit",()=>{
    const report=auditCasinoFlowEconomy(contract,3_650);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(reserve);
    expect(report.houseCurtailedOperatingExpenses).toBe(0);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
  },600_000);
});
