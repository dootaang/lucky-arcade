import { CASINO_CARD_PACK_VERSION, CASINO_CARDS_VERSION, CASINO_GAME_INFO, casinoCardCredit, casinoCardResultHash, createCasinoCardState, isCasinoCardState, reduceCasinoCard, type CasinoCardAction, type CasinoCardGameId, type CasinoCardStake, type CasinoCardState } from "@lucky-arcade/casino-cards";
import { CasinoCardScreen } from "@lucky-arcade/casino-cards/react";
import { ENGINE_VERSION, leveragedWagerCredit, makeReceipt, resultHash, wagerExposure, wagerMultiplierFromExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt } from "@lucky-arcade/persistence";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useRef, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { readWallet } from "../../lib/wallet.ts";

export default function CasinoCardView({ gameId, onExit }: { gameId: CasinoCardGameId; onExit(): void }) {
  const info = CASINO_GAME_INFO[gameId], cabinetId = `temerosa-${gameId}`, sessionId = `${cabinetId}:table-1`, termsVersion = `${cabinetId}-paytable/0.2`;
  const [ready, setReady] = useState<{ state: CasinoCardState; atlas: CourtAtlas; multiplier: WagerMultiplier } | null>(null), [balance, setBalance] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stateRef = useRef<CasinoCardState | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadPlayingCardAtlas(), readWallet(), recoverSession<CasinoCardState, CasinoCardAction>({ sessionId, fresh: createCasinoCardState(gameId, sessionId), cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, isState: (value): value is CasinoCardState => isCasinoCardState(value) && value.gameId === gameId, reduce: reduceCasinoCard })]).then(async ([atlas, wallet, recovered]) => {
      let state = recovered.state, nextBalance = wallet.balance;
      const receipts = await listWagers(sessionId);
      const reserved = receipts.filter((receipt) => receipt.status === "reserved");
      const pending = reserved.find((receipt) => receipt.termsVersion === termsVersion && validReceipt(receipt, info.maxExposure));
      for (const receipt of reserved) if (receipt !== pending) {
        const transaction = await invalidateWager({ wagerId: receipt.wagerId, reason: receipt.termsVersion === termsVersion ? "corrupt-state" : "version-mismatch" });
        nextBalance = transaction.wallet.balance;
      }
      if (pending && state.wagerId !== pending.wagerId) {
        const seed = seedFromReceipt(pending);
        if (seed && isStake(pending.stake)) {
          const action: CasinoCardAction = { type: "start", seed, stake: pending.stake, reservedAmount: pending.stake * info.maxExposure, wagerId: pending.wagerId };
          const next = reduceCasinoCard(state, action); await persist(sessionId, cabinetId, info.title, state, next, action); state = next;
        }
      }
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") { const transaction = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: leveragedCredit(state, pending, info.maxExposure) }); nextBalance = transaction.wallet.balance; }
      const activeReceipt = pending ?? (state.wagerId ? receipts.find((receipt) => receipt.wagerId === state.wagerId) : undefined);
      if (!alive) return; stateRef.current = state; setBalance(nextBalance); setReady({ state, atlas, multiplier: activeReceipt && validReceipt(activeReceipt, info.maxExposure) ? wagerMultiplierFromExposure(activeReceipt.stake, activeReceipt.reservedAmount, info.maxExposure) : 2 });
    }).catch(() => { if (alive) setError(`${info.title}을 준비하지 못했습니다.`); });
    return () => { alive = false; };
  }, [cabinetId, gameId, info.title, sessionId]);

  async function apply(action: CasinoCardAction): Promise<CasinoCardState> {
    const previous = stateRef.current; if (!previous) throw new Error("casino_card_not_ready");
    const next = reduceCasinoCard(previous, action); stateRef.current = next; setReady((current) => current ? { ...current, state: next } : current);
    await persist(sessionId, cabinetId, info.title, previous, next, action); return next;
  }
  async function start(stake: CasinoCardStake, multiplier: WagerMultiplier): Promise<void> {
    if (busy || !ready) return; const baseReserved = stake * info.maxExposure, reservedAmount = wagerExposure(stake, multiplier, info.maxExposure); setBusy(true); setError("");
    try { const seed = crypto.randomUUID(), transaction = await reserveWager({ outcomeKey: `${termsVersion}:${seed}`, cabinetId, sessionId, termsVersion, choiceKey: `deal:${seed}`, stake, reservedAmount }); setBalance(transaction.wallet.balance); setReady((current) => current ? { ...current, multiplier } : current); const next = await apply({ type: "start", seed, stake, reservedAmount: baseReserved, wagerId: transaction.wager.wagerId }); if (next.status === "complete") await settle(next); else setBusy(false); }
    catch (cause) { setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다."); setBusy(false); }
  }
  async function act(action: CasinoCardAction): Promise<void> {
    if (busy) return; setBusy(true); setError("");
    try { const next = await apply(action); if (next.status === "complete" && action.type !== "restart") await settle(next); else setBusy(false); }
    catch { setError("행동을 처리하지 못했습니다. 저장된 상태에서 다시 시도하세요."); setBusy(false); }
  }
  async function settle(state: CasinoCardState): Promise<void> {
    if (!state.wagerId) { setBusy(false); return; }
    try { const receipt = (await listWagers(sessionId)).find((candidate) => candidate.wagerId === state.wagerId); if (!receipt) throw new Error("casino_card_wager_receipt_missing"); const transaction = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: leveragedCredit(state, receipt, info.maxExposure) }); setBalance(transaction.wallet.balance); setBusy(false); }
    catch { setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 영수증으로 처리합니다."); }
  }
  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || `${info.title} 테이블을 준비하고 있습니다…`}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <CasinoCardScreen state={ready.state} atlas={ready.atlas} balance={balance} busy={busy} error={error} initialMultiplier={ready.multiplier} onStart={start} onAction={act} onExit={onExit} />;
}

async function persist(sessionId: string, cabinetId: string, title: string, previous: CasinoCardState, next: CasinoCardState, action: CasinoCardAction): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.cursor, resultHash(previous), next); await appendAction(sessionId, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId, sessionId, title, progressLabel: next.status === "complete" ? `${next.outcome === "win" ? "승리" : next.outcome === "push" ? "무승부" : "패배"} · ${next.creditAmount} P 반환` : next.status === "ready" ? "새 대국 준비" : next.message, updatedAt: new Date().toISOString() });
}
function seedFromReceipt(receipt: GameWagerReceipt): string | null { return receipt.choiceKey?.startsWith("deal:") ? receipt.choiceKey.slice(5) || null : null; }
function isStake(value: number): value is CasinoCardStake { return value === 10 || value === 50 || value === 200; }
function validReceipt(receipt: GameWagerReceipt, baseExposure: number): boolean { try { wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount, baseExposure); return isStake(receipt.stake); } catch { return false; } }
function leveragedCredit(state: CasinoCardState, receipt: GameWagerReceipt, baseExposure: number): number { return leveragedWagerCredit(state.reservedAmount, casinoCardCredit(state), wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount, baseExposure)); }
