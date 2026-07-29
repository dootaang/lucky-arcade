import {
  LOCAL_PLAYER_ACCOUNT_ID,
  TEMEROSA_HOUSE_ACCOUNT_ID,
  type CasinoLedgerSourceId,
  type CasinoTransaction,
  type NpcRoundSettlement,
} from "@lucky-arcade/casino-ledger";

const SOURCES = new Set<CasinoLedgerSourceId>([
  "temerosa-old-maid", "temerosa-match-pairs", "temerosa-slot", "indian-poker", "temerosa-high-low",
  "temerosa-blackjack", "temerosa-doubt", "temerosa-one-card", "temerosa-texas-holdem",
]);

export function casinoJournalSettlements(transactions: readonly CasinoTransaction[]): readonly NpcRoundSettlement[] {
  const reservations = new Map<string, CasinoTransaction>();
  for (const transaction of transactions) {
    if (transaction.kind !== "wager-reservation") continue;
    const escrow = transaction.postings.find((posting) => posting.accountId.startsWith("escrow:") && posting.delta > 0)?.accountId;
    if (escrow) reservations.set(escrow, transaction);
  }
  const output: NpcRoundSettlement[] = [];
  for (const transaction of transactions) {
    if (transaction.kind === "free-play-reward") {
      const credit = transaction.postings.find((posting) => posting.accountId === LOCAL_PLAYER_ACCOUNT_ID)?.delta ?? 0;
      if (credit > 0) output.push(Object.freeze({
        roundId: `journal:${transaction.transactionId}:${LOCAL_PLAYER_ACCOUNT_ID}`,
        matchId: transaction.matchId ?? transaction.transactionId,
        visitId: `personal-worldline:${transaction.matchId ?? transaction.transactionId}`,
        participantIds: Object.freeze([LOCAL_PLAYER_ACCOUNT_ID]),
        npcId: LOCAL_PLAYER_ACCOUNT_ID,
        tableId: "temerosa-old-maid",
        utcSecond: transaction.occurredAtCasinoSecond,
        stake: 0,
        reservedAmount: 0,
        creditAmount: credit,
        delta: credit,
        resultKind: "free-play-reward",
        termsVersion: "player-free-old-maid/1.0",
      }));
      continue;
    }
    if (transaction.kind !== "wager-settlement" && transaction.kind !== "forfeit" && transaction.kind !== "system-refund") continue;
    const escrowPosting = transaction.postings.find((posting) => posting.accountId.startsWith("escrow:") && posting.delta < 0);
    if (!escrowPosting) continue;
    const reservation = reservations.get(escrowPosting.accountId);
    const tableId = sourceId(transaction.tableId ?? reservation?.tableId);
    if (!reservation || !tableId) continue;
    const funding = reservation.postings.filter((posting) => posting.delta < 0 && isCirculating(posting.accountId));
    const participantIds = Object.freeze(funding.map((posting) => displayAccountId(posting.accountId)));
    const stake = reservation.stake === 10 || reservation.stake === 50 || reservation.stake === 200 ? reservation.stake : 0;
    for (const posting of funding) {
      const accountId = posting.accountId;
      const reservedAmount = -posting.delta;
      const creditAmount = transaction.postings.find((candidate) => candidate.accountId === accountId)?.delta ?? 0;
      output.push(Object.freeze({
        roundId: `journal:${transaction.transactionId}:${accountId}`,
        matchId: transaction.matchId ?? reservation.matchId ?? reservation.transactionId,
        visitId: `personal-worldline:${reservation.matchId ?? reservation.transactionId}`,
        participantIds,
        npcId: displayAccountId(accountId),
        tableId,
        utcSecond: transaction.occurredAtCasinoSecond,
        stake,
        reservedAmount,
        creditAmount,
        delta: creditAmount - reservedAmount,
        resultKind: transaction.kind === "system-refund" ? "refund" : transaction.resultKey ?? transaction.kind,
        termsVersion: transaction.termsVersion ?? reservation.termsVersion ?? "casino-economy/1.0",
      }));
    }
  }
  return Object.freeze(output.toSorted((left, right) => right.utcSecond - left.utcSecond || compareText(left.roundId, right.roundId)));
}

function sourceId(value: string | undefined): CasinoLedgerSourceId | undefined {
  return value && SOURCES.has(value as CasinoLedgerSourceId) ? value as CasinoLedgerSourceId : undefined;
}
function isCirculating(accountId: string): boolean {
  return accountId === LOCAL_PLAYER_ACCOUNT_ID || accountId === TEMEROSA_HOUSE_ACCOUNT_ID || accountId.startsWith("npc:");
}
function displayAccountId(accountId: string): string { return accountId.startsWith("npc:") ? accountId.slice(4) : accountId; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
