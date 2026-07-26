import { CASINO_CARD_PACK_VERSION, CASINO_CARDS_VERSION, CASINO_GAME_INFO, casinoCardCredit, casinoCardResultHash, createCasinoCardState, isCasinoCardState, reduceCasinoCard, type CasinoCardAction, type CasinoCardGameId, type CasinoCardStake, type CasinoCardState } from "@lucky-arcade/casino-cards";
import { CasinoCardScreen } from "@lucky-arcade/casino-cards/react";
import type { SpriteAtlasManifest } from "@lucky-arcade/contracts";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import type { GameWagerReceipt } from "@lucky-arcade/persistence";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useRef, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { readWallet } from "../../lib/wallet.ts";

export default function CasinoCardView({ gameId, onExit }: { gameId: CasinoCardGameId; onExit(): void }) {
  const info = CASINO_GAME_INFO[gameId], cabinetId = `temerosa-${gameId}`, sessionId = `${cabinetId}:table-1`, termsVersion = `${cabinetId}-paytable/0.1`;
  const [ready, setReady] = useState<{ state: CasinoCardState; atlas: CourtAtlas } | null>(null), [balance, setBalance] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stateRef = useRef<CasinoCardState | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadAtlas(), readWallet(), recoverSession<CasinoCardState, CasinoCardAction>({ sessionId, fresh: createCasinoCardState(gameId, sessionId), cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, isState: (value): value is CasinoCardState => isCasinoCardState(value) && value.gameId === gameId, reduce: reduceCasinoCard })]).then(async ([atlas, wallet, recovered]) => {
      let state = recovered.state, nextBalance = wallet.balance;
      const pending = (await listWagers(sessionId)).find((receipt) => receipt.status === "reserved");
      if (pending && state.wagerId !== pending.wagerId) {
        const seed = seedFromReceipt(pending);
        if (seed && isStake(pending.stake)) {
          const action: CasinoCardAction = { type: "start", seed, stake: pending.stake, reservedAmount: pending.reservedAmount, wagerId: pending.wagerId };
          const next = reduceCasinoCard(state, action); await persist(sessionId, cabinetId, info.title, state, next, action); state = next;
        }
      }
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") { const transaction = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: casinoCardCredit(state) }); nextBalance = transaction.wallet.balance; }
      if (!alive) return; stateRef.current = state; setBalance(nextBalance); setReady({ state, atlas });
    }).catch(() => { if (alive) setError(`${info.title}을 준비하지 못했습니다.`); });
    return () => { alive = false; };
  }, [cabinetId, gameId, info.title, sessionId]);

  async function apply(action: CasinoCardAction): Promise<CasinoCardState> {
    const previous = stateRef.current; if (!previous) throw new Error("casino_card_not_ready");
    const next = reduceCasinoCard(previous, action); stateRef.current = next; setReady((current) => current ? { ...current, state: next } : current);
    await persist(sessionId, cabinetId, info.title, previous, next, action); return next;
  }
  async function start(stake: CasinoCardStake): Promise<void> {
    if (busy || !ready) return; const reservedAmount = stake * info.maxExposure; setBusy(true); setError("");
    try { const seed = crypto.randomUUID(), transaction = await reserveWager({ outcomeKey: `${termsVersion}:${seed}`, cabinetId, sessionId, termsVersion, choiceKey: `deal:${seed}`, stake, reservedAmount }); setBalance(transaction.wallet.balance); const next = await apply({ type: "start", seed, stake, reservedAmount, wagerId: transaction.wager.wagerId }); if (next.status === "complete") await settle(next); else setBusy(false); }
    catch (cause) { setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다."); setBusy(false); }
  }
  async function act(action: CasinoCardAction): Promise<void> {
    if (busy) return; setBusy(true); setError("");
    try { const next = await apply(action); if (next.status === "complete" && action.type !== "restart") await settle(next); else setBusy(false); }
    catch { setError("행동을 처리하지 못했습니다. 저장된 상태에서 다시 시도하세요."); setBusy(false); }
  }
  async function settle(state: CasinoCardState): Promise<void> {
    if (!state.wagerId) { setBusy(false); return; }
    try { const transaction = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: casinoCardCredit(state) }); setBalance(transaction.wallet.balance); setBusy(false); }
    catch { setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 영수증으로 처리합니다."); }
  }
  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || `${info.title} 테이블을 준비하고 있습니다…`}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <CasinoCardScreen state={ready.state} atlas={ready.atlas} balance={balance} busy={busy} error={error} onStart={start} onAction={act} onExit={onExit} />;
}

async function persist(sessionId: string, cabinetId: string, title: string, previous: CasinoCardState, next: CasinoCardState, action: CasinoCardAction): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.cursor, resultHash(previous), next); await appendAction(sessionId, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId, sessionId, title, progressLabel: next.status === "complete" ? `${next.outcome === "win" ? "승리" : next.outcome === "push" ? "무승부" : "패배"} · ${next.creditAmount} P 반환` : next.status === "ready" ? "새 대국 준비" : next.message, updatedAt: new Date().toISOString() });
}
async function loadAtlas(): Promise<CourtAtlas> { const response = await fetch("/content/playing-cards/1.0.0/manifest.json"); if (!response.ok) throw new Error("playing_card_manifest_failed"); const manifest = await response.json() as SpriteAtlasManifest, sheet = manifest.sheets.find((candidate) => candidate.size === "sm"); if (!sheet) throw new Error("playing_card_sheet_missing"); return { url: `/content/playing-cards/1.0.0/${sheet.path}`, cols: manifest.cols, cell: sheet.cell, gutter: sheet.gutter, sheet: { width: sheet.width, height: sheet.height }, frames: Object.fromEntries(manifest.frames.map((frame) => [frame.id, { col: frame.col, row: frame.row }])) }; }
function seedFromReceipt(receipt: GameWagerReceipt): string | null { return receipt.choiceKey?.startsWith("deal:") ? receipt.choiceKey.slice(5) || null : null; }
function isStake(value: number): value is CasinoCardStake { return value === 10 || value === 50 || value === 200; }
