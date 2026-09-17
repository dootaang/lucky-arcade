import { CASINO_CARD_PACK_VERSION, CASINO_CARDS_VERSION, casinoCardResultHash, createCasinoCardState, isCasinoCardState, reduceCasinoCard, type CasinoCardAction, type CasinoCardState } from "@lucky-arcade/casino-cards";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import { TEMEROSA_HOUSE_ACCOUNT_ID } from "@lucky-arcade/casino-ledger";
import { appendAction, appendMatchRecord, saveSnapshot } from "../../lib/database.ts";
import { casinoCounterpartyContext } from "../../lib/casino-economy.ts";
import { invalidateWager, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { readWallet } from "../../lib/wallet.ts";
import { readVipStatus, readVipRecoveryWagers, markVipFirstEntry, acknowledgeVipComp, isVipStake } from "../../lib/vip.ts";
import type { VipTableSession } from "./vip-table-session.ts";

const CABINET = "temerosa-vip-blackjack", SESSION = `${CABINET}:main`, TERMS = `${CABINET}/0.1`;

/** Only this adapter may touch the real wallet, matches, recovery log and house. */
export const liveVipSession: VipTableSession = {
  async load() {
    const vip = await readVipStatus();
    if (!vip.membership) throw new Error("vip_membership_required");
    const [wallet, recovered] = await Promise.all([
      readWallet(),
      recoverSession<CasinoCardState, CasinoCardAction>({ sessionId: SESSION, fresh: createCasinoCardState("blackjack", SESSION), cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, isState: (value): value is CasinoCardState => isCasinoCardState(value) && value.gameId === "blackjack" && value.sessionId === SESSION, reduce: reduceCasinoCard }),
    ]);
    let state = recovered.state, balance = wallet.balance;
    const wagers = await readVipRecoveryWagers(SESSION, state.wagerId);
    for (const receipt of wagers.filter((value) => value.status === "reserved")) {
      if (receipt.termsVersion !== TERMS) { balance = (await invalidateWager({ wagerId: receipt.wagerId, reason: "version-mismatch" })).wallet.balance; continue; }
      if (!isVipStake(receipt.stake) || receipt.reservedAmount !== receipt.stake || !receipt.choiceKey?.startsWith("deal:")) throw new Error("vip_receipt_corrupt");
      if (state.wagerId !== receipt.wagerId) {
        if (state.status === "playing") throw new Error("vip_recovery_conflict");
        const action: CasinoCardAction = { type: "start", seed: receipt.choiceKey.slice(5), stake: receipt.stake, reservedAmount: receipt.stake, wagerId: receipt.wagerId };
        const next = reduceCasinoCard(state, action);
        await persist(state, next, action); state = next;
      }
      if (state.stake !== receipt.stake || state.seed !== receipt.choiceKey.slice(5)) throw new Error("vip_recovery_conflict");
    }
    if (state.status === "complete" && state.wagerId) {
      const receipt = wagers.find((value) => value.wagerId === state.wagerId);
      if (receipt?.status === "reserved" || receipt?.status === "settled") balance = (await liveVipSession.settle(state)).balance;
    }
    return { state, balance, status: await readVipStatus() };
  },
  async markFirstEntry() { return (await markVipFirstEntry()).firstEntry; },
  async start(previous, stake, seed) {
    const counterparty = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID);
    const reservation = await reserveWager({ cabinetId: CABINET, sessionId: SESSION, termsVersion: TERMS, outcomeKey: `${TERMS}:${seed}`, choiceKey: `deal:${seed}`, stake, reservedAmount: stake, ...counterparty, counterpartyReservedAmount: Math.floor(stake * 2.5) - stake });
    const action: CasinoCardAction = { type: "start", seed, stake, reservedAmount: stake, wagerId: reservation.wager.wagerId };
    const state = reduceCasinoCard(previous, action);
    await persist(previous, state, action);
    return { state, balance: reservation.wallet.balance };
  },
  persist,
  async settle(state) {
    if (!state.wagerId) throw new Error("vip_wager_missing");
    const result = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: state.creditAmount });
    await recordMatch(state, result.wager.settledAt);
    return { balance: result.wallet.balance, status: await readVipStatus() };
  },
  async acknowledgeComp(tier) { await acknowledgeVipComp(tier); return readVipStatus(); },
};

async function persist(previous: CasinoCardState, next: CasinoCardState, action: CasinoCardAction) {
  const receipt = makeReceipt(next.sequence, action, next.cursor, resultHash(previous), next);
  await appendAction(SESSION, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION });
}
async function recordMatch(state: CasinoCardState, completedAt?: string) {
  if (!state.outcome || !state.wagerId) return;
  await appendMatchRecord({ contract: "match-record/0.1", recordId: `${SESSION}#${state.wagerId}`, cabinetId: CABINET, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, sessionId: SESSION, sequence: state.sequence, seed: state.seed, completedAt: completedAt ?? new Date().toISOString(), turns: Math.max(1, state.cursor - 3), standings: [
    { seatId: "player", participantId: "player", displayName: "플레이어", rank: state.outcome === "loss" ? 2 : 1, isPlayer: true },
    { seatId: "house", participantId: "nieun", displayName: "박니은", rank: state.outcome === "win" ? 2 : 1, isPlayer: false },
  ], outcome: state.outcome === "push" ? "draw" : state.outcome, resultHash: casinoCardResultHash(state) });
}
