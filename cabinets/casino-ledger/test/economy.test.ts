import { describe, expect, it } from "vitest";
import {
  LOCAL_PLAYER_ACCOUNT_ID,
  TEMEROSA_HOUSE_ACCOUNT_ID,
  applyCasinoTransactions,
  createFreePlayRewardTransaction,
  createHouseCapitalTransaction,
  createHouseOperatingExpenseTransaction,
  createNpcIncomeTransaction,
  internalMoneySupply,
  npcAccountId,
  reserveCasinoEscrow,
  settleCasinoEscrow,
} from "../src/index.ts";

describe("casino economy 1.0", () => {
  it("settles a player and NPC wager without creating money", () => {
    const npc = npcAccountId("pale");
    const opening = { [LOCAL_PLAYER_ACCOUNT_ID]: 500, [npc]: 500 };
    const reservation = reserveCasinoEscrow({
      wagerId: "pairs-1", idempotencyKey: "pairs-1:reserve", occurredAtCasinoSecond: 100,
      reservations: { [LOCAL_PLAYER_ACCOUNT_ID]: 100, [npc]: 100 }, tableId: "temerosa-match-pairs",
    });
    const settlement = settleCasinoEscrow({
      reservation, idempotencyKey: "pairs-1:settle", occurredAtCasinoSecond: 200,
      credits: { [LOCAL_PLAYER_ACCOUNT_ID]: 200 }, resultKey: "player-win",
    });
    const balances = applyCasinoTransactions(opening, [reservation.transaction, settlement]);
    expect(balances).toMatchObject({ [LOCAL_PLAYER_ACCOUNT_ID]: 600, [npc]: 400, [reservation.escrowId]: 0 });
    expect(internalMoneySupply(balances)).toBe(1_000);
  });

  it("reserves the house maximum liability before accepting a wager", () => {
    const reservation = reserveCasinoEscrow({
      wagerId: "high-low-1", idempotencyKey: "high-low-1:reserve", occurredAtCasinoSecond: 100,
      reservations: { [LOCAL_PLAYER_ACCOUNT_ID]: 1_000, [TEMEROSA_HOUSE_ACCOUNT_ID]: 4_500 },
    });
    const settlement = settleCasinoEscrow({
      reservation, idempotencyKey: "high-low-1:settle", occurredAtCasinoSecond: 200,
      credits: { [LOCAL_PLAYER_ACCOUNT_ID]: 4_500, [TEMEROSA_HOUSE_ACCOUNT_ID]: 1_000 }, resultKey: "cashout-5",
    });
    const balances = applyCasinoTransactions({ [LOCAL_PLAYER_ACCOUNT_ID]: 1_000, [TEMEROSA_HOUSE_ACCOUNT_ID]: 150_000 }, [reservation.transaction, settlement]);
    expect(balances[LOCAL_PLAYER_ACCOUNT_ID]).toBe(4_500);
    expect(balances[TEMEROSA_HOUSE_ACCOUNT_ID]).toBe(146_500);
    expect(internalMoneySupply(balances)).toBe(151_000);
  });

  it("keeps explicit faucets and sinks balanced through external accounts", () => {
    const capital = createHouseCapitalTransaction(0);
    const salary = createNpcIncomeTransaction({ npcId: "pale", incomeBand: "middle", payCycleDays: 7, paydayOffset: 0 }, 7)!;
    const reward = createFreePlayRewardTransaction({ transactionId: "free-1", occurredAtCasinoSecond: 10, amount: 60, matchId: "old-maid-1" });
    const beforeSweep = applyCasinoTransactions({}, [capital, salary, reward]);
    expect(internalMoneySupply(beforeSweep)).toBe(150_210);
    const sweep = createHouseOperatingExpenseTransaction({ absoluteKstDay: 7, houseBalance: 160_000, reserveTarget: 150_000 })!;
    const afterSweep = applyCasinoTransactions(beforeSweep, [sweep]);
    expect(afterSweep[TEMEROSA_HOUSE_ACCOUNT_ID]).toBe(147_500);
    expect(internalMoneySupply(afterSweep)).toBe(147_710);
  });

  it("rejects Wares as an NPC account and duplicate idempotency is harmless", () => {
    expect(() => npcAccountId("wares")).toThrow("casino_economy_invalid_npc_account");
    expect(() => npcAccountId("temerosa:finale:wares")).toThrow("casino_economy_invalid_npc_account");
    const reward = createFreePlayRewardTransaction({ transactionId: "free-1", occurredAtCasinoSecond: 10, amount: 60, matchId: "old-maid-1" });
    expect(applyCasinoTransactions({}, [reward, reward])[LOCAL_PLAYER_ACCOUNT_ID]).toBe(60);
  });
});
