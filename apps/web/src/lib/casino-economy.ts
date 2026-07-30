import {
  TEMEROSA_HOUSE_ACCOUNT_ID,
  TEMEROSA_NPC_GAMBLING_PROFILES,
  TEMEROSA_NPC_LEDGER_CONTRACT,
  casinoJournalAccountDelta,
  type CasinoInternalAccountId,
} from "@lucky-arcade/casino-ledger";
import { casinoClockFromSample, deviceCasinoClockSample, rememberCasinoClockSecond, stabilizeCasinoClockSample } from "./casino-clock.ts";
import { listCasinoTransactions } from "./database.ts";
import { personalCasinoWorldlineAt } from "./casino-worldline.ts";
import { loadTemerosaCasinoManifest } from "./temerosa-content.ts";

export interface CasinoCounterpartyContext {
  counterpartyAccountId: CasinoInternalAccountId;
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
  const sample = await loadTemerosaCasinoManifest()
    .then(({ clockSample }) => stabilizeCasinoClockSample(clockSample))
    .catch(() => deviceCasinoClockSample());
  const clock = casinoClockFromSample(sample);
  const casinoOccurredAtSecond = clock.utcSecond();
  rememberCasinoClockSecond(casinoOccurredAtSecond);
  const journal = (await listCasinoTransactions()).filter((transaction) => transaction.occurredAtCasinoSecond <= casinoOccurredAtSecond);
  const worldline = personalCasinoWorldlineAt(TEMEROSA_NPC_GAMBLING_PROFILES, clock, TEMEROSA_NPC_LEDGER_CONTRACT, journal);
  const localDelta = casinoJournalAccountDelta(journal, accountId);

  if (accountId === TEMEROSA_HOUSE_ACCOUNT_ID) {
    return {
      counterpartyAccountId: accountId,
      counterpartyBaseBalance: worldline.houseBalance - localDelta,
      casinoOccurredAtSecond,
    };
  }
  if (accountId.startsWith("npc:")) {
    const npcId = accountId.slice(4);
    const balance = worldline.npcBalances[npcId];
    if (balance === undefined || !Number.isSafeInteger(balance) || balance < 0) throw new Error(`casino_counterparty_unknown:${accountId}`);
    return { counterpartyAccountId: accountId, counterpartyBaseBalance: balance - localDelta, casinoOccurredAtSecond };
  }
  throw new Error(`casino_counterparty_invalid:${accountId}`);
}
