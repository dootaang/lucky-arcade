import { XorShift32 } from "@lucky-arcade/engine";
import { casinoUtcSecondAtKstDay } from "./casino-time.ts";
import type { CasinoTransaction } from "./economy.ts";
import {
  createCasinoTransaction,
  npcAccountId,
  npcExternalReserveAccountId,
} from "./economy.ts";
import type { NpcExternalIncomeProfile } from "./contracts.ts";

export const NPC_FLOW_ECONOMY_CONTRACT = "npc-flow-economy/1.0" as const;

export interface NpcFlowEconomyDay {
  contract: typeof NPC_FLOW_ECONOMY_CONTRACT;
  npcId: string;
  absoluteKstDay: number;
  settlementMinute: number;
  grossIncome: number;
  casinoBudgetRateBps: number;
  casinoTopUp: number;
  incomeTransaction: CasinoTransaction;
  topUpTransaction?: CasinoTransaction;
}

/**
 * Produces the one canonical daily livelihood settlement for an NPC. Every
 * sampled value has its own seed domain so later additions cannot reroll it.
 */
export function npcFlowEconomyDay(
  profile: NpcExternalIncomeProfile,
  absoluteKstDay: number,
): NpcFlowEconomyDay {
  assertNpcExternalIncomeProfile(profile);
  if (!Number.isSafeInteger(absoluteKstDay) || absoluteKstDay < 0) throw new Error("npc_flow_invalid_day");

  const settlementMinute = sampleInteger(
    profile.settlementWindow,
    `${NPC_FLOW_ECONOMY_CONTRACT}:${profile.npcId}:${absoluteKstDay}:settlement-minute`,
  );
  const grossIncome = sampleInteger(
    profile.dailyIncomeRange,
    `${NPC_FLOW_ECONOMY_CONTRACT}:${profile.npcId}:${absoluteKstDay}:gross-income`,
  );
  const casinoBudgetRateBps = sampleInteger(
    profile.casinoBudgetRateBps,
    `${NPC_FLOW_ECONOMY_CONTRACT}:${profile.npcId}:${absoluteKstDay}:casino-budget-rate`,
  );
  const casinoTopUp = Math.floor(grossIncome * casinoBudgetRateBps / 10_000);
  if (!Number.isSafeInteger(casinoTopUp) || casinoTopUp < 0 || casinoTopUp > grossIncome) throw new Error("npc_flow_invalid_top_up");

  const occurredAtCasinoSecond = casinoUtcSecondAtKstDay(absoluteKstDay, settlementMinute * 60);
  const reserveAccountId = npcExternalReserveAccountId(profile.npcId);
  const identity = `${NPC_FLOW_ECONOMY_CONTRACT}:${absoluteKstDay}:${profile.npcId}`;
  const incomeTransaction = createCasinoTransaction({
    transactionId: `${identity}:income`,
    idempotencyKey: `${identity}:income`,
    occurredAtCasinoSecond,
    kind: "npc-external-income",
    termsVersion: NPC_FLOW_ECONOMY_CONTRACT,
    postings: [
      { accountId: "external:livelihood", delta: -grossIncome },
      { accountId: reserveAccountId, delta: grossIncome },
    ],
  });
  const topUpTransaction = casinoTopUp === 0 ? undefined : createCasinoTransaction({
    transactionId: `${identity}:casino-top-up`,
    idempotencyKey: `${identity}:casino-top-up`,
    occurredAtCasinoSecond,
    kind: "npc-casino-top-up",
    termsVersion: NPC_FLOW_ECONOMY_CONTRACT,
    postings: [
      { accountId: reserveAccountId, delta: -casinoTopUp },
      { accountId: npcAccountId(profile.npcId), delta: casinoTopUp },
    ],
  });

  return Object.freeze({
    contract: NPC_FLOW_ECONOMY_CONTRACT,
    npcId: profile.npcId,
    absoluteKstDay,
    settlementMinute,
    grossIncome,
    casinoBudgetRateBps,
    casinoTopUp,
    incomeTransaction,
    ...(topUpTransaction ? { topUpTransaction } : {}),
  });
}

export function npcFlowEconomyTransactions(
  profiles: readonly NpcExternalIncomeProfile[],
  absoluteKstDay: number,
): readonly CasinoTransaction[] {
  const seen = new Set<string>();
  const transactions: CasinoTransaction[] = [];
  for (const profile of profiles) {
    if (seen.has(profile.npcId)) throw new Error(`npc_flow_duplicate_profile:${profile.npcId}`);
    seen.add(profile.npcId);
    const day = npcFlowEconomyDay(profile, absoluteKstDay);
    transactions.push(day.incomeTransaction);
    if (day.topUpTransaction) transactions.push(day.topUpTransaction);
  }
  return Object.freeze(transactions.toSorted((left, right) =>
    left.occurredAtCasinoSecond - right.occurredAtCasinoSecond
      || transactionOrder(left.kind) - transactionOrder(right.kind)
      || compareText(left.transactionId, right.transactionId)));
}

export function assertNpcExternalIncomeProfile(profile: NpcExternalIncomeProfile): void {
  if (!profile.npcId || profile.npcId === "wares" || !profile.sourceLabel.trim()) throw new Error("npc_flow_invalid_identity");
  if (!Array.isArray(profile.evidenceRefs) || profile.evidenceRefs.some((entry) => !entry.trim())) throw new Error("npc_flow_invalid_evidence");
  assertRange(profile.dailyIncomeRange, 1, Number.MAX_SAFE_INTEGER, "npc_flow_invalid_income_range");
  assertRange(profile.casinoBudgetRateBps, 0, 10_000, "npc_flow_invalid_budget_range");
  assertRange(profile.settlementWindow, 0, 1_439, "npc_flow_invalid_settlement_window");
  if (!Number.isSafeInteger(profile.openingExternalReserve) || profile.openingExternalReserve < 0) throw new Error("npc_flow_invalid_opening_reserve");
}

function sampleInteger(range: readonly [number, number], seed: string): number {
  const rng = new XorShift32(seed);
  return range[0] + Math.floor(rng.next() * (range[1] - range[0] + 1));
}

function assertRange(range: readonly [number, number], lower: number, upper: number, code: string): void {
  if (range.length !== 2 || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1])
    || range[0] < lower || range[1] > upper || range[0] > range[1]) throw new Error(code);
}

function transactionOrder(kind: CasinoTransaction["kind"]): number {
  if (kind === "npc-external-income") return 0;
  if (kind === "npc-casino-top-up") return 1;
  return 2;
}

function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
