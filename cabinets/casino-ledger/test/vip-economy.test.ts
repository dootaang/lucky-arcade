import { describe, expect, it } from "vitest";
import { applyCasinoTransactions, createVipMembershipPurchaseTransaction, internalMoneySupply } from "../src/economy.ts";

describe("VIP membership purchase", () => {
  it("moves exactly the purchase amount to the house and replays idempotently", () => {
    const purchase = createVipMembershipPurchaseTransaction({ transactionId: "vip:membership", occurredAtCasinoSecond: 100, amount: 1_000 });
    expect(purchase.kind).toBe("vip-membership-purchase");
    const balances = applyCasinoTransactions({ "player:local": 2_000, "house:temerosa": 150_000 }, [purchase, purchase]);
    expect(balances).toEqual({ "player:local": 1_000, "house:temerosa": 151_000 });
    expect(internalMoneySupply(balances)).toBe(152_000);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid amount %s", (amount) => {
    expect(() => createVipMembershipPurchaseTransaction({ transactionId: "vip:membership", occurredAtCasinoSecond: 100, amount })).toThrow("vip_membership_purchase_invalid");
  });
});
