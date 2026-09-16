import { describe, expect, it } from "vitest";
import {
  TEMEROSA_NPC_GAMBLING_PROFILES, TEMEROSA_NPC_LEDGER_CONTRACT,
  casinoUtcSecondAtKstDay, createVipMembershipPurchaseTransaction,
  reserveCasinoEscrow, settleCasinoEscrow,
} from "@lucky-arcade/casino-ledger";
import { casinoJournalSettlements } from "./casino-journal.ts";
import { isVipHouseGame, personalCasinoWorldlineAt } from "./casino-worldline.ts";
import { VIP_TERMS, VIP_COMP_THRESHOLDS, canAffordVipStake, vipCompTier } from "./vip.ts";

describe("VIP accounting and policy", () => {
  it.each(Object.keys(VIP_TERMS))("keeps %s postings but hides its rounds from the public journal", (tableId) => {
    const second = casinoUtcSecondAtKstDay(TEMEROSA_NPC_LEDGER_CONTRACT.epochKstDay) + 100;
    const reservation = reserveCasinoEscrow({ wagerId: tableId, idempotencyKey: `${tableId}:reserve`, occurredAtCasinoSecond: second,
      tableId, reservations: { "player:local": 200, "house:temerosa": 300 } });
    const settlement = settleCasinoEscrow({ reservation, idempotencyKey: `${tableId}:settle`, occurredAtCasinoSecond: second + 1,
      credits: { "house:temerosa": 500 }, resultKey: "house-win" });
    const purchase = createVipMembershipPurchaseTransaction({ transactionId: "vip:membership", occurredAtCasinoSecond: second, amount: 1_000 });
    const transactions = [purchase, reservation.transaction, settlement];
    expect(casinoJournalSettlements(transactions)).toEqual([]);
    expect(isVipHouseGame(tableId)).toBe(true);
    const clock = { utcMinute: () => Math.floor((second + 1) / 60), utcSecond: () => second + 1 };
    const baseline = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, [], undefined);
    const replay = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, transactions, undefined);
    expect(replay.houseBalance - baseline.houseBalance).toBe(1_200);
    expect(replay.houseGamingProfit - baseline.houseGamingProfit).toBe(200);
    expect(replay.npcBalances).toEqual(baseline.npcBalances);
    expect(replay.activities).toEqual(baseline.activities);
  });

  it("preserves public house accounting classification and rejects unknown VIP names", () => {
    expect(VIP_TERMS).toEqual({ "temerosa-vip-blackjack": "temerosa-vip-blackjack/0.1" });
    expect(isVipHouseGame("temerosa-vip-unknown")).toBe(false);
    expect(isVipHouseGame("temerosa-slot")).toBe(false);
    expect(isVipHouseGame("temerosa-five-card-draw")).toBe(false);
    expect(isVipHouseGame("indian-poker")).toBe(false);
  });
  it("uses provisional thresholds and exact floor boundaries", () => {
    expect(VIP_COMP_THRESHOLDS).toEqual([2_000, 6_000, 15_000, 30_000]);
    expect([0, 1_999, 2_000, 6_000, 15_000, 30_000].map(vipCompTier)).toEqual([0, 0, 1, 2, 3, 4]);
    expect(canAffordVipStake(999, 200)).toBe(false);
    expect(canAffordVipStake(1_000, 200)).toBe(true);
    expect(canAffordVipStake(2_500, 500)).toBe(true);
    expect(canAffordVipStake(5_000, 1_000)).toBe(true);
    expect(canAffordVipStake(5_000, 201)).toBe(false);
  });
});
