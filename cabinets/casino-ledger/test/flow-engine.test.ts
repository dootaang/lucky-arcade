import { describe, expect, it } from "vitest";
import {
  casinoDayPlan,
  casinoUtcSecondAtKstDay,
  npcBalanceAt,
  npcFlowEconomyDay,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  type CasinoPresentationClock,
  type NpcExternalIncomeProfile,
  type NpcGamblingProfile,
  type NpcLedgerContract,
} from "../src/index.ts";

const gambler: NpcGamblingProfile = Object.freeze({
  ...TEMEROSA_NPC_GAMBLING_PROFILES[0]!,
  id: "flow-test",
  name: "Flow Test",
  openingBalance: 0,
  target: 0,
  sessionsPerDay: Object.freeze({ min: 1, max: 1 }),
  tables: Object.freeze([{ tableId: "temerosa-slot" as const, weight: 1 }]),
});
const income: NpcExternalIncomeProfile = Object.freeze({
  npcId: gambler.id,
  sourceLabel: "개인 활동 정산",
  evidenceRefs: Object.freeze([]),
  dailyIncomeRange: Object.freeze([100, 100] as const),
  casinoBudgetRateBps: Object.freeze([5_000, 5_000] as const),
  openingExternalReserve: 0,
  settlementWindow: Object.freeze([600, 600] as const),
});
const contract: NpcLedgerContract = Object.freeze({
  version: "npc-ledger/1.2",
  seedVersion: "casino-flow/1.0",
  epochKstDay: 20_667,
  profiles: Object.freeze([gambler]),
  externalIncomeProfiles: Object.freeze([income]),
  profitHistory: Object.freeze([]),
});

describe("flow economy engine integration", () => {
  it("credits exactly the planned daily casino budget", () => {
    const plan = casinoDayPlan([gambler], 0, { [gambler.id]: 0 }, contract);
    const settlement = plan.sessions[gambler.id]!.find((session) => session.resultKind === "casino-top-up")!;
    expect(settlement.delta).toBe(npcFlowEconomyDay(income, contract.epochKstDay).casinoTopUp);
    expect(settlement.minuteOfDay).toBe(600);
  });

  it("does not expose the top-up in the balance before its personal settlement", () => {
    const before = fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay, 599 * 60 + 59));
    const after = fixedClock(casinoUtcSecondAtKstDay(contract.epochKstDay, 600 * 60));
    expect(npcBalanceAt(gambler, before, contract).balance).toBe(0);
    expect(npcBalanceAt(gambler, after, contract).balance).toBe(50);
  });

  it("rejects a 1.2 contract without one income profile per gambler", () => {
    const invalid = { ...contract, externalIncomeProfiles: Object.freeze([]) } satisfies NpcLedgerContract;
    expect(() => casinoDayPlan([gambler], 0, { [gambler.id]: 0 }, invalid)).toThrow("npc_ledger_missing_flow_income_profile:flow-test");
  });
});

function fixedClock(second: number): CasinoPresentationClock {
  return { utcMinute: () => Math.floor(second / 60), utcSecond: () => second };
}
