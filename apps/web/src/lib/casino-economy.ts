import {
  TEMEROSA_HOUSE_ACCOUNT_ID,
  casinoJournalAccountDelta,
  temerosaCasinoLedgerAtUtcSecond,
  type CasinoInternalAccountId,
} from "@lucky-arcade/casino-ledger";
import { casinoClockFromSample, deviceCasinoClockSample, rememberCasinoClockSecond, stabilizeCasinoClockSample } from "./casino-clock.ts";
import { listCasinoTransactions } from "./database.ts";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";
import { loadTemerosaCasinoManifest } from "./temerosa-content.ts";

export interface CasinoCounterpartyContext {
  counterpartyAccountId: CasinoInternalAccountId;
  /** Canonical balance plus every journal posting visible at this clock sample. */
  counterpartyBalance: number;
  counterpartyBaseBalance: number;
  casinoOccurredAtSecond: number;
}

export async function casinoCurrentSecond(): Promise<number> {
  const sample = await loadTemerosaCasinoManifest()
    .then(({ clockSample }) => stabilizeCasinoClockSample(clockSample))
    .catch(() => deviceCasinoClockSample());
  const second = casinoClockFromSample(sample).utcSecond();
  rememberCasinoClockSecond(second);
  return second;
}

/**
 * Resolves the canonical world-line balance before IndexedDB journal overlays.
 * reserveGameWager adds the journal delta and verifies the combined balance in
 * the same transaction that debits the player's wallet.
 */
export async function casinoCounterpartyContext(
  accountId: CasinoInternalAccountId,
): Promise<CasinoCounterpartyContext> {
  const contexts = await casinoCounterpartyContexts([accountId]);
  const context = contexts[accountId];
  if (!context) throw new Error(`casino_counterparty_unknown:${accountId}`);
  return context;
}

/** Resolves a multiplayer table against one clock sample and one journal snapshot. */
export async function casinoCounterpartyContexts(
  accountIds: readonly CasinoInternalAccountId[],
): Promise<Readonly<Record<string, CasinoCounterpartyContext>>> {
  if (accountIds.length === 0 || new Set(accountIds).size !== accountIds.length) throw new Error("casino_counterparty_list_invalid");
  const sample = await loadTemerosaCasinoManifest()
    .then(({ clockSample }) => stabilizeCasinoClockSample(clockSample))
    .catch(() => deviceCasinoClockSample());
  const clock = casinoClockFromSample(sample);
  const casinoOccurredAtSecond = clock.utcSecond();
  rememberCasinoClockSecond(casinoOccurredAtSecond);
  const journal = (await listCasinoTransactions()).filter((transaction) => transaction.occurredAtCasinoSecond <= casinoOccurredAtSecond);
  const ledger=temerosaCasinoLedgerAtUtcSecond(casinoOccurredAtSecond);
  const worldline = personalCasinoWorldlineAt(ledger.profiles, clock, ledger.contract, journal);

  return Object.freeze(Object.fromEntries(accountIds.map((accountId) => {
    const localDelta = casinoJournalAccountDelta(journal, accountId);
    if (accountId === TEMEROSA_HOUSE_ACCOUNT_ID) return [accountId, {
      counterpartyAccountId: accountId,
      counterpartyBalance: worldline.houseBalance,
      counterpartyBaseBalance: worldline.houseBalance - localDelta,
      casinoOccurredAtSecond,
    }];
    if (!accountId.startsWith("npc:")) throw new Error(`casino_counterparty_invalid:${accountId}`);
    const balance = worldline.npcBalances[accountId.slice(4)];
    if (balance === undefined || !Number.isSafeInteger(balance) || balance < 0) throw new Error(`casino_counterparty_unknown:${accountId}`);
    return [accountId, { counterpartyAccountId: accountId, counterpartyBalance: balance, counterpartyBaseBalance: balance - localDelta, casinoOccurredAtSecond }];
  })));
}
