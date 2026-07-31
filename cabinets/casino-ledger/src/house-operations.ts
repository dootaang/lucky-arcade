import { casinoUtcSecondAtKstDay } from "./casino-time.ts";
import {
  TEMEROSA_HOUSE_ACCOUNT_ID,
  createCasinoTransaction,
  type CasinoTransaction,
} from "./economy.ts";

export const HOUSE_OPERATIONS_CONTRACT = "house-operations/2.0" as const;

export interface HouseOperatingCostPolicy {
  baseFacilityCost: number;
  activeTableHourCost: number;
  perHundredRoundsCost: number;
  positiveGamingRevenueRateBps: number;
  protectedReserve: number;
  settlementSecondOfDay: number;
}

export const DEFAULT_HOUSE_OPERATING_COST_POLICY: Readonly<HouseOperatingCostPolicy> = Object.freeze({
  baseFacilityCost: 60,
  activeTableHourCost: 8,
  perHundredRoundsCost: 20,
  positiveGamingRevenueRateBps: 2_000,
  protectedReserve: 50_000,
  settlementSecondOfDay: 23 * 3_600 + 50 * 60,
});

export interface HouseDailyActivity {
  absoluteKstDay: number;
  houseBalance: number;
  reservedLiability: number;
  activeTableSeconds: number;
  settledRoundCount: number;
  grossGamingRevenue: number;
}

export interface HouseOperatingExpensePlan {
  contract: typeof HOUSE_OPERATIONS_CONTRACT;
  absoluteKstDay: number;
  fixedCost: number;
  activeTableCost: number;
  roundCost: number;
  revenueCost: number;
  assessedAmount: number;
  paidAmount: number;
  curtailedAmount: number;
  transaction?: CasinoTransaction;
}

/** Activity-linked daily expense. Insolvency reduces service instead of altering game outcomes. */
export function createHouseOperatingExpensePlan(
  activity: HouseDailyActivity,
  policy: Readonly<HouseOperatingCostPolicy> = DEFAULT_HOUSE_OPERATING_COST_POLICY,
): HouseOperatingExpensePlan {
  assertActivity(activity);
  assertPolicy(policy);
  const fixedCost = policy.baseFacilityCost;
  const activeTableCost = Math.ceil(activity.activeTableSeconds * policy.activeTableHourCost / 3_600);
  const roundCost = Math.ceil(activity.settledRoundCount * policy.perHundredRoundsCost / 100);
  const revenueCost = Math.floor(Math.max(0, activity.grossGamingRevenue) * policy.positiveGamingRevenueRateBps / 10_000);
  const assessedAmount = fixedCost + activeTableCost + roundCost + revenueCost;
  const payableCapacity = Math.max(0, activity.houseBalance - activity.reservedLiability - policy.protectedReserve);
  const paidAmount = Math.min(assessedAmount, payableCapacity);
  const curtailedAmount = assessedAmount - paidAmount;
  const identity = `${HOUSE_OPERATIONS_CONTRACT}:${activity.absoluteKstDay}`;
  const transaction = paidAmount === 0 ? undefined : createCasinoTransaction({
    transactionId: identity,
    idempotencyKey: identity,
    occurredAtCasinoSecond: casinoUtcSecondAtKstDay(activity.absoluteKstDay, policy.settlementSecondOfDay),
    kind: "house-operating-expense",
    termsVersion: HOUSE_OPERATIONS_CONTRACT,
    postings: [
      { accountId: TEMEROSA_HOUSE_ACCOUNT_ID, delta: -paidAmount },
      { accountId: "external:operations", delta: paidAmount },
    ],
  });
  return Object.freeze({
    contract: HOUSE_OPERATIONS_CONTRACT,
    absoluteKstDay: activity.absoluteKstDay,
    fixedCost,
    activeTableCost,
    roundCost,
    revenueCost,
    assessedAmount,
    paidAmount,
    curtailedAmount,
    ...(transaction ? { transaction } : {}),
  });
}

export function houseMaximumExposure(input: {
  houseBalance: number;
  reservedLiability: number;
  protectedReserve?: number;
}): number {
  const protectedReserve = input.protectedReserve ?? DEFAULT_HOUSE_OPERATING_COST_POLICY.protectedReserve;
  for (const value of [input.houseBalance, input.reservedLiability, protectedReserve]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("house_exposure_invalid");
  }
  return Math.max(0, input.houseBalance - input.reservedLiability - protectedReserve);
}

function assertActivity(activity: HouseDailyActivity): void {
  for (const value of [activity.absoluteKstDay, activity.houseBalance, activity.reservedLiability, activity.activeTableSeconds, activity.settledRoundCount, activity.grossGamingRevenue]) {
    if (!Number.isSafeInteger(value)) throw new Error("house_activity_invalid");
  }
  if (activity.absoluteKstDay < 0 || activity.houseBalance < 0 || activity.reservedLiability < 0 || activity.activeTableSeconds < 0 || activity.settledRoundCount < 0) throw new Error("house_activity_invalid");
}

function assertPolicy(policy: Readonly<HouseOperatingCostPolicy>): void {
  for (const value of [policy.baseFacilityCost, policy.activeTableHourCost, policy.perHundredRoundsCost, policy.positiveGamingRevenueRateBps, policy.protectedReserve, policy.settlementSecondOfDay]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("house_operating_policy_invalid");
  }
  if (policy.positiveGamingRevenueRateBps > 10_000 || policy.settlementSecondOfDay >= 86_400) throw new Error("house_operating_policy_invalid");
}
