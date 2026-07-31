import {
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  createCasinoTransaction,
  createCollectionPurchaseTransaction,
  casinoUtcSecondAtKstDay,
  type CasinoPresentationClock,
  type NpcExternalIncomeProfile,
  type NpcGamblingProfile,
  type NpcLedgerContract,
} from "@lucky-arcade/casino-ledger";
import { describe, expect, it } from "vitest";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";

describe("personal casino world line", () => {
  it("replays local NPC and house postings on top of the deterministic day", () => {
    const second = casinoUtcSecondAtKstDay(TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay + 1) - 1;
    const clock = fixedClock(second);
    const baseline = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, []);
    const npcTransfer = createCasinoTransaction({
      transactionId: "test:npc-transfer",
      idempotencyKey: "test:npc-transfer",
      occurredAtCasinoSecond: second,
      kind: "legacy-migration",
      postings: [{ accountId: "legacy:clearing", delta: -100 }, { accountId: "npc:lyla", delta: 100 }],
    });
    const collection = createCollectionPurchaseTransaction({ transactionId: "test:collection", occurredAtCasinoSecond: second, amount: 12, collectionId: "test" });
    const replayed = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, [npcTransfer, collection]);
    expect(replayed.npcBalances.lyla).toBe(baseline.npcBalances.lyla! + 100);
    expect(replayed.houseBalance).toBe(baseline.houseBalance + 12);
  });

  it("tracks off-casino reserves, daily top-ups, and activity-based operations", () => {
    const base = TEMEROSA_NPC_GAMBLING_PROFILES[0]!;
    const gambler: NpcGamblingProfile = Object.freeze({
      ...base,
      id: "flow-worldline",
      name: "Flow Worldline",
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
    const worldline = personalCasinoWorldlineAt([gambler], fixedClock(casinoUtcSecondAtKstDay(20_668) - 1), contract, []);
    expect(worldline.npcExternalReserves[gambler.id]).toBe(50);
    expect(worldline.npcGrossIncomeToday[gambler.id]).toBe(100);
    expect(worldline.npcCasinoTopUpsToday[gambler.id]).toBe(50);
    expect(worldline.activities.some((entry) => entry.session.resultKind === "casino-top-up")).toBe(true);
    expect(worldline.houseOperatingExpenses).toBeGreaterThan(0);
  });
});

function fixedClock(second:number):CasinoPresentationClock{return{utcSecond:()=>second,utcMinute:()=>Math.floor(second/60)};}
