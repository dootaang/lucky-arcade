import {describe,expect,it} from "vitest";
import {auditCasinoFlowEconomy,casinoDayPlan,TEMEROSA_FLOW_NPC_LEDGER_CONTRACT} from "../src/index.ts";

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

  it("isolates cached plans by every house operating policy value",()=>{
    const first=Object.freeze({...contract,houseOpeningBalance:100_000,houseOperatingPolicy:Object.freeze({...contract.houseOperatingPolicy!,protectedReserve:50_000})});
    const second=Object.freeze({...contract,houseOpeningBalance:100_000,houseOperatingPolicy:Object.freeze({...contract.houseOperatingPolicy!,protectedReserve:90_000})});
    const firstPlan=casinoDayPlan(profiles,0,openings,first);
    const secondPlan=casinoDayPlan(profiles,0,openings,second);
    expect(firstPlan.houseService!.protectedReserve).toBe(50_000);
    expect(secondPlan.houseService!.protectedReserve).toBe(90_000);
    expect(secondPlan.houseService!.acceptedHouseRiskRounds).toBeLessThan(firstPlan.houseService!.acceptedHouseRiskRounds);
  });

  it("keeps zero-liability peer tables open when house-risk tables are unavailable",()=>{
    const constrained=Object.freeze({...contract,houseOpeningBalance:reserve});
    const plan=casinoDayPlan(profiles,0,openings,constrained);
    expect(plan.matches.some((match)=>match.tableId==="indian-poker"||match.tableId==="temerosa-match-pairs"||match.tableId==="temerosa-five-card-draw")).toBe(true);
    expect(plan.matches.some((match)=>match.tableId==="temerosa-old-maid")).toBe(true);
    expect(plan.matches.some((match)=>match.tableId==="temerosa-slot"||match.tableId==="temerosa-high-low")).toBe(false);
  });

  it("does not use a result to decide a common round",()=>{
    const unconstrained=casinoDayPlan(profiles,0,openings,contract);
    const constrainedContract=Object.freeze({...contract,houseOpeningBalance:reserve});
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

  it("keeps every atomic house close above the reserve and exposes the one-year blocker",()=>{
    const report=auditCasinoFlowEconomy(contract,365);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(reserve);
    expect(report.houseCurtailedOperatingExpenses).toBeGreaterThan(0);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
  },90_000);

  const longAudit=process.env.CASINO_LEDGER_LONG_AUDIT==="1"?it:it.skip;
  longAudit("records the ten-year reserve-safe release blocker",()=>{
    const report=auditCasinoFlowEconomy(contract,3_650);
    expect(report.minimumHouseBalance).toBeGreaterThanOrEqual(reserve);
    expect(report.houseCurtailedOperatingExpenses).toBeGreaterThan(0);
    expect(report.duplicateRoundIdCount).toBe(0);
    expect(report.postingImbalance).toBe(0);
    expect(report.supplyChangeBps).toBeGreaterThan(1_000);
  },600_000);
});
