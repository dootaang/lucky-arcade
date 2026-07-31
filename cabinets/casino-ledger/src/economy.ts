import { casinoUtcSecondAtKstDay } from "./casino-time.ts";

export const CASINO_ECONOMY_CONTRACT = "casino-economy/1.0" as const;
export const CASINO_TRANSACTION_CONTRACT = "casino-transaction/1.0" as const;
export const TEMEROSA_HOUSE_ACCOUNT_ID = "house:temerosa" as const;
export const LOCAL_PLAYER_ACCOUNT_ID = "player:local" as const;
export const TEMEROSA_HOUSE_OPENING_CAPITAL = 150_000;

export function isWaresHouseIdentity(npcId:string):boolean{return npcId==="wares"||/^temerosa:[^:]+:wares$/.test(npcId);}

export type CasinoInternalAccountId =
  | typeof LOCAL_PLAYER_ACCOUNT_ID
  | typeof TEMEROSA_HOUSE_ACCOUNT_ID
  | `npc:${string}`
  | `escrow:${string}`;
export type NpcExternalReserveAccountId = `external:npc:${string}`;
export type CasinoExternalAccountId =
  | "external:employment"
  | "external:livelihood"
  | "external:free-play"
  | "external:operations"
  | "external:capital"
  | NpcExternalReserveAccountId
  | "legacy:clearing";
export type CasinoAccountId = CasinoInternalAccountId | CasinoExternalAccountId;

export type CasinoTransactionKind =
  | "wager-reservation"
  | "wager-settlement"
  | "system-refund"
  | "forfeit"
  | "npc-income"
  | "npc-external-income"
  | "npc-casino-top-up"
  | "free-play-reward"
  | "house-operating-expense"
  | "collection-purchase"
  | "capital-injection"
  | "legacy-migration";

export interface CasinoPosting {
  accountId: CasinoAccountId;
  delta: number;
}

export interface CasinoTransaction {
  contract: typeof CASINO_TRANSACTION_CONTRACT;
  transactionId: string;
  idempotencyKey: string;
  occurredAtCasinoSecond: number;
  kind: CasinoTransactionKind;
  matchId?: string;
  tableId?: string;
  termsVersion?: string;
  stake?: number;
  resultKey?: string;
  postings: readonly CasinoPosting[];
}

export interface CasinoEscrowReservation {
  escrowId: `escrow:${string}`;
  transaction: CasinoTransaction;
  reservedByAccount: Readonly<Record<string, number>>;
  total: number;
}

export type NpcIncomeBand = "low" | "middle" | "high" | "premium";
export interface NpcIncomeProfile {
  npcId: string;
  incomeBand: NpcIncomeBand;
  payCycleDays: 7 | 14;
  paydayOffset: number;
}

export const NPC_INCOME_AMOUNTS: Readonly<Record<NpcIncomeBand, number>> = Object.freeze({
  low: 80,
  middle: 150,
  high: 300,
  premium: 500,
});

export function npcAccountId(npcId: string): `npc:${string}` {
  if (!npcId || isWaresHouseIdentity(npcId)) throw new Error("casino_economy_invalid_npc_account");
  return `npc:${npcId}`;
}

export function npcExternalReserveAccountId(npcId: string): NpcExternalReserveAccountId {
  if (!npcId || isWaresHouseIdentity(npcId)) throw new Error("casino_economy_invalid_npc_account");
  return `external:npc:${npcId}`;
}

export function createCasinoTransaction(input: Omit<CasinoTransaction, "contract">): CasinoTransaction {
  const transaction: CasinoTransaction = Object.freeze({
    ...input,
    contract: CASINO_TRANSACTION_CONTRACT,
    postings: Object.freeze(input.postings.map((posting) => Object.freeze({ ...posting }))),
  });
  assertCasinoTransaction(transaction);
  return transaction;
}

export function assertCasinoTransaction(transaction: CasinoTransaction): void {
  if (transaction.contract !== CASINO_TRANSACTION_CONTRACT || !transaction.transactionId || !transaction.idempotencyKey) throw new Error("casino_transaction_invalid_identity");
  if (!Number.isSafeInteger(transaction.occurredAtCasinoSecond) || transaction.occurredAtCasinoSecond < 0) throw new Error("casino_transaction_invalid_time");
  if (transaction.stake !== undefined && (!Number.isSafeInteger(transaction.stake) || transaction.stake < 0)) throw new Error("casino_transaction_invalid_stake");
  if (transaction.postings.length < 2) throw new Error("casino_transaction_insufficient_postings");
  let total = 0;
  for (const posting of transaction.postings) {
    if (!posting.accountId || !Number.isSafeInteger(posting.delta) || posting.delta === 0) throw new Error("casino_transaction_invalid_posting");
    total += posting.delta;
    if (!Number.isSafeInteger(total)) throw new Error("casino_transaction_unsafe_total");
  }
  if (total !== 0) throw new Error("casino_transaction_unbalanced");
}

export function reserveCasinoEscrow(input: {
  wagerId: string;
  idempotencyKey: string;
  occurredAtCasinoSecond: number;
  reservations: Readonly<Record<string, number>>;
  matchId?: string;
  tableId?: string;
  termsVersion?: string;
  stake?: number;
}): CasinoEscrowReservation {
  if (!input.wagerId) throw new Error("casino_escrow_invalid_id");
  const escrowId = `escrow:${input.wagerId}` as const;
  const entries = Object.entries(input.reservations).sort(([left], [right]) => compareText(left, right));
  if (entries.length === 0) throw new Error("casino_escrow_empty");
  let total = 0;
  const reservedByAccount: Record<string, number> = {};
  const postings: CasinoPosting[] = [];
  for (const [rawAccountId, amount] of entries) {
    const accountId = rawAccountId as CasinoAccountId;
    if (!isFundingAccount(accountId) || !Number.isSafeInteger(amount) || amount <= 0) throw new Error("casino_escrow_invalid_reservation");
    reservedByAccount[accountId] = amount;
    total += amount;
    if (!Number.isSafeInteger(total)) throw new Error("casino_escrow_unsafe_total");
    postings.push({ accountId, delta: -amount });
  }
  postings.push({ accountId: escrowId, delta: total });
  const transaction = createCasinoTransaction({
    transactionId: `reserve:${input.wagerId}`,
    idempotencyKey: input.idempotencyKey,
    occurredAtCasinoSecond: input.occurredAtCasinoSecond,
    kind: "wager-reservation",
    ...(input.matchId ? { matchId: input.matchId } : {}),
    ...(input.tableId ? { tableId: input.tableId } : {}),
    ...(input.termsVersion ? { termsVersion: input.termsVersion } : {}),
    ...(input.stake === undefined ? {} : { stake: input.stake }),
    postings,
  });
  return Object.freeze({ escrowId, transaction, reservedByAccount: Object.freeze(reservedByAccount), total });
}

export function settleCasinoEscrow(input: {
  reservation: CasinoEscrowReservation;
  idempotencyKey: string;
  occurredAtCasinoSecond: number;
  credits: Readonly<Record<string, number>>;
  resultKey: string;
  kind?: "wager-settlement" | "system-refund" | "forfeit";
}): CasinoTransaction {
  const entries = Object.entries(input.credits).filter(([, amount]) => amount !== 0).sort(([left], [right]) => compareText(left, right));
  const creditTotal = entries.reduce((sum, [, amount]) => {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("casino_escrow_invalid_credit");
    return sum + amount;
  }, 0);
  if (creditTotal !== input.reservation.total) throw new Error("casino_escrow_credit_mismatch");
  return createCasinoTransaction({
    transactionId: `settle:${input.reservation.escrowId.slice(7)}:${input.resultKey}`,
    idempotencyKey: input.idempotencyKey,
    occurredAtCasinoSecond: input.occurredAtCasinoSecond,
    kind: input.kind ?? "wager-settlement",
    ...(input.reservation.transaction.matchId ? { matchId: input.reservation.transaction.matchId } : {}),
    ...(input.reservation.transaction.tableId ? { tableId: input.reservation.transaction.tableId } : {}),
    ...(input.reservation.transaction.termsVersion ? { termsVersion: input.reservation.transaction.termsVersion } : {}),
    ...(input.reservation.transaction.stake === undefined ? {} : { stake: input.reservation.transaction.stake }),
    resultKey: input.resultKey,
    postings: [
      { accountId: input.reservation.escrowId, delta: -input.reservation.total },
      ...entries.map(([accountId, delta]) => ({ accountId: accountId as CasinoAccountId, delta })),
    ],
  });
}

export function createNpcIncomeTransaction(profile: NpcIncomeProfile, absoluteKstDay: number): CasinoTransaction | undefined {
  if (!Number.isSafeInteger(absoluteKstDay) || absoluteKstDay < 0 || !Number.isSafeInteger(profile.paydayOffset) || profile.paydayOffset < 0 || profile.paydayOffset >= profile.payCycleDays) throw new Error("npc_income_invalid_schedule");
  if (absoluteKstDay % profile.payCycleDays !== profile.paydayOffset) return undefined;
  const amount = NPC_INCOME_AMOUNTS[profile.incomeBand];
  return createCasinoTransaction({
    transactionId: `npc-income/1.0:${absoluteKstDay}:${profile.npcId}`,
    idempotencyKey: `npc-income/1.0:${absoluteKstDay}:${profile.npcId}`,
    occurredAtCasinoSecond: casinoUtcSecondAtKstDay(absoluteKstDay, 6 * 3_600),
    kind: "npc-income",
    postings: [
      { accountId: "external:employment", delta: -amount },
      { accountId: npcAccountId(profile.npcId), delta: amount },
    ],
  });
}

export function createFreePlayRewardTransaction(input: { transactionId: string; occurredAtCasinoSecond: number; amount: number; matchId: string }): CasinoTransaction {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("free_play_reward_invalid");
  return createCasinoTransaction({
    transactionId: input.transactionId,
    idempotencyKey: input.transactionId,
    occurredAtCasinoSecond: input.occurredAtCasinoSecond,
    kind: "free-play-reward",
    matchId: input.matchId,
    postings: [
      { accountId: "external:free-play", delta: -input.amount },
      { accountId: LOCAL_PLAYER_ACCOUNT_ID, delta: input.amount },
    ],
  });
}

export function createHouseCapitalTransaction(occurredAtCasinoSecond: number, amount = TEMEROSA_HOUSE_OPENING_CAPITAL): CasinoTransaction {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("house_capital_invalid");
  return createCasinoTransaction({
    transactionId: `${CASINO_ECONOMY_CONTRACT}:house-opening`,
    idempotencyKey: `${CASINO_ECONOMY_CONTRACT}:house-opening`,
    occurredAtCasinoSecond,
    kind: "capital-injection",
    postings: [
      { accountId: "external:capital", delta: -amount },
      { accountId: TEMEROSA_HOUSE_ACCOUNT_ID, delta: amount },
    ],
  });
}

export function createHouseOperatingExpenseTransaction(input: { absoluteKstDay: number; houseBalance: number; reserveTarget?: number; sweepRate?: number }): CasinoTransaction | undefined {
  const reserveTarget = input.reserveTarget ?? TEMEROSA_HOUSE_OPENING_CAPITAL;
  const sweepRate = input.sweepRate ?? .25;
  if (!Number.isSafeInteger(input.absoluteKstDay) || input.absoluteKstDay < 0 || !Number.isSafeInteger(input.houseBalance) || input.houseBalance < 0 || !Number.isSafeInteger(reserveTarget) || reserveTarget < 0 || !(sweepRate >= 0 && sweepRate <= 1)) throw new Error("house_operating_expense_invalid");
  if (input.absoluteKstDay % 7 !== 0 || input.houseBalance <= reserveTarget) return undefined;
  const amount = Math.floor((input.houseBalance - reserveTarget) * sweepRate);
  if (amount <= 0) return undefined;
  return createCasinoTransaction({
    transactionId: `house-operations/1.0:${input.absoluteKstDay}`,
    idempotencyKey: `house-operations/1.0:${input.absoluteKstDay}`,
    occurredAtCasinoSecond: casinoUtcSecondAtKstDay(input.absoluteKstDay, 23 * 3_600),
    kind: "house-operating-expense",
    postings: [
      { accountId: TEMEROSA_HOUSE_ACCOUNT_ID, delta: -amount },
      { accountId: "external:operations", delta: amount },
    ],
  });
}

export function createCollectionPurchaseTransaction(input: { transactionId: string; occurredAtCasinoSecond: number; amount: number; collectionId: string }): CasinoTransaction {
  if (!input.collectionId || !Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("collection_purchase_invalid");
  return createCasinoTransaction({
    transactionId: input.transactionId,
    idempotencyKey: input.transactionId,
    occurredAtCasinoSecond: input.occurredAtCasinoSecond,
    kind: "collection-purchase",
    matchId: input.collectionId,
    postings: [
      { accountId: LOCAL_PLAYER_ACCOUNT_ID, delta: -input.amount },
      { accountId: TEMEROSA_HOUSE_ACCOUNT_ID, delta: input.amount },
    ],
  });
}

export function applyCasinoTransactions(opening: Readonly<Record<string, number>>, transactions: readonly CasinoTransaction[]): Readonly<Record<string, number>> {
  const balances: Record<string, number> = { ...opening };
  const applied = new Set<string>();
  for (const transaction of [...transactions].sort(compareTransactions)) {
    assertCasinoTransaction(transaction);
    if (applied.has(transaction.idempotencyKey)) continue;
    for (const posting of transaction.postings) {
      balances[posting.accountId] = (balances[posting.accountId] ?? 0) + posting.delta;
      if (!Number.isSafeInteger(balances[posting.accountId])) throw new Error("casino_account_unsafe_balance");
      if (isFundingAccount(posting.accountId) && balances[posting.accountId]! < 0) throw new Error(`casino_account_insufficient:${posting.accountId}`);
    }
    applied.add(transaction.idempotencyKey);
  }
  return Object.freeze(balances);
}

export function internalMoneySupply(balances: Readonly<Record<string, number>>): number {
  return Object.entries(balances).reduce((sum, [accountId, balance]) => isCirculatingAccount(accountId) ? sum + balance : sum, 0);
}

export function casinoJournalAccountDelta(transactions: readonly CasinoTransaction[], accountId: string): number {
  return transactions.reduce((sum, transaction) => sum + transaction.postings.reduce((postingSum, posting) => posting.accountId === accountId ? postingSum + posting.delta : postingSum, 0), 0);
}

function compareTransactions(left: CasinoTransaction, right: CasinoTransaction): number {
  return left.occurredAtCasinoSecond - right.occurredAtCasinoSecond || transactionPriority(left.kind) - transactionPriority(right.kind) || compareText(left.transactionId, right.transactionId);
}
function transactionPriority(kind: CasinoTransactionKind): number {
  if (kind === "wager-reservation") return 0;
  if (kind === "npc-external-income") return 1;
  if (kind === "npc-income" || kind === "npc-casino-top-up" || kind === "house-operating-expense" || kind === "capital-injection" || kind === "legacy-migration") return 2;
  return 3;
}
function isFundingAccount(accountId: string): accountId is CasinoInternalAccountId {
  return accountId === LOCAL_PLAYER_ACCOUNT_ID || accountId === TEMEROSA_HOUSE_ACCOUNT_ID || accountId.startsWith("npc:") || accountId.startsWith("external:npc:");
}
function isCirculatingAccount(accountId: string): boolean {
  return accountId === LOCAL_PLAYER_ACCOUNT_ID || accountId === TEMEROSA_HOUSE_ACCOUNT_ID || accountId.startsWith("npc:");
}
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
