import { CASINO_CARD_PACK_VERSION, CASINO_CARDS_VERSION, CASINO_GAME_INFO, casinoCardCredit, casinoCardResultHash, createCasinoCardState, isCasinoCardState, reduceCasinoCard, type CasinoCardAction, type CasinoCardGameId, type CasinoCardStake, type CasinoCardState } from "@lucky-arcade/casino-cards";
import { CasinoCardScreen } from "@lucky-arcade/casino-cards/react";
import { ENGINE_VERSION, leveragedWagerCredit, makeReceipt, resultHash, wagerExposure, wagerMultiplierFromExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, MatchRecord } from "@lucky-arcade/persistence";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useRef, useState } from "react";
import { TEMEROSA_HOUSE_ACCOUNT_ID } from "@lucky-arcade/casino-ledger";
import { casinoCounterpartyContext } from "../../lib/casino-economy.ts";
import { appendAction, appendMatchRecord, listMatchRecordsForSession, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { readWallet } from "../../lib/wallet.ts";
import { summarizeOpponentRecords } from "../../lib/opponent-records.ts";

export { CasinoCardPreviewView } from "./casino-card-preview-view.tsx";

const HIGH_LOW_HOUSE_ID = "wares";

interface HouseDealer {
  id: string;
  name: string;
  portraits: { neutral: string; pleased: string; tense: string; despair: string };
  record: { wins: number; losses: number; draws: number };
}

export default function CasinoCardView({ gameId, onExit }: { gameId: CasinoCardGameId; onExit(): void }) {
  const info = CASINO_GAME_INFO[gameId], cabinetId = `temerosa-${gameId}`, sessionId = `${cabinetId}:table-1`, termsVersion = `${cabinetId}-paytable/0.4`;
  const [ready, setReady] = useState<{ state: CasinoCardState; atlas: CourtAtlas; multiplier: WagerMultiplier; dealer?: HouseDealer } | null>(null), [balance, setBalance] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stateRef = useRef<CasinoCardState | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadPlayingCardAtlas(), readWallet(), gameId === "high-low" ? loadTemerosaCasinoAssets() : Promise.resolve(null), recoverSession<CasinoCardState, CasinoCardAction>({ sessionId, fresh: createCasinoCardState(gameId, sessionId), cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, isState: (value): value is CasinoCardState => isCasinoCardState(value) && value.gameId === gameId, reduce: reduceCasinoCard })]).then(async ([atlas, wallet, assetBundle, recovered]) => {
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
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") { const transaction = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: leveragedCredit(state, pending, info.maxExposure) }); nextBalance = transaction.wallet.balance; if (gameId === "high-low") await recordHighLowMatch(state).catch(() => undefined); }
      const activeReceipt = pending ?? (state.wagerId ? receipts.find((receipt) => receipt.wagerId === state.wagerId) : undefined);
      if (!pending && gameId === "high-low" && state.status === "complete" && activeReceipt?.status === "settled") await recordHighLowMatch(state).catch(() => undefined);
      const dealer = assetBundle ? await buildHouseDealer(assetBundle, sessionId) : undefined;
      if (!alive) return; stateRef.current = state; setBalance(nextBalance); setReady({ state, atlas, multiplier: activeReceipt && validReceipt(activeReceipt, info.maxExposure) ? wagerMultiplierFromExposure(activeReceipt.stake, activeReceipt.reservedAmount, info.maxExposure) : 2, ...(dealer ? { dealer } : {}) });
    }).catch(() => { if (alive) setError(`${info.title} 테이블을 준비하지 못했습니다.`); });
    return () => { alive = false; };
  }, [cabinetId, gameId, info.title, sessionId]);

  async function apply(action: CasinoCardAction): Promise<CasinoCardState> {
    const previous = stateRef.current; if (!previous) throw new Error("casino_card_not_ready");
    const next = reduceCasinoCard(previous, action); stateRef.current = next; setReady((current) => current ? { ...current, state: next } : current);
    await persist(sessionId, cabinetId, info.title, previous, next, action); return next;
  }
  async function start(stake: CasinoCardStake, multiplier: WagerMultiplier): Promise<void> {
    if (busy || !ready) return; const baseReserved = stake * info.maxExposure, reservedAmount = wagerExposure(stake, multiplier, info.maxExposure); setBusy(true); setError("");
    try { const seed = crypto.randomUUID(), counterparty = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID), maximumCredit = leveragedWagerCredit(baseReserved, maximumCasinoCardCredit(gameId, stake), multiplier), transaction = await reserveWager({ outcomeKey: `${termsVersion}:${seed}`, cabinetId, sessionId, termsVersion, choiceKey: `deal:${seed}`, stake, reservedAmount, ...counterparty, counterpartyReservedAmount: maximumCredit - reservedAmount }); setBalance(transaction.wallet.balance); setReady((current) => current ? { ...current, multiplier } : current); const next = await apply({ type: "start", seed, stake, reservedAmount: baseReserved, wagerId: transaction.wager.wagerId }); if (next.status === "complete") await settle(next); else setBusy(false); }
    catch (cause) { setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다."); setBusy(false); }
  }
  async function act(action: CasinoCardAction): Promise<void> {
    if (busy) return; setBusy(true); setError("");
    try { const next = await apply(action); if (next.status === "complete" && action.type !== "restart") await settle(next); else setBusy(false); }
    catch { setError("행동을 처리하지 못했습니다. 저장된 상태에서 다시 시도하세요."); setBusy(false); }
  }
  async function settle(state: CasinoCardState): Promise<void> {
    if (!state.wagerId) { setBusy(false); return; }
    try { const receipt = (await listWagers(sessionId)).find((candidate) => candidate.wagerId === state.wagerId); if (!receipt) throw new Error("casino_card_wager_receipt_missing"); const transaction = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: leveragedCredit(state, receipt, info.maxExposure) }); setBalance(transaction.wallet.balance); if (gameId === "high-low") { try { await recordHighLowMatch(state); const records = summarizeOpponentRecords(await listMatchRecordsForSession(sessionId, 200)); setReady((current) => current?.dealer ? { ...current, dealer: { ...current.dealer, record: records[HIGH_LOW_HOUSE_ID] ?? emptyRecord() } } : current); } catch { setError("포인트는 정산됐지만 상대 전적을 남기지 못했습니다."); } } setBusy(false); }
    catch { setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 영수증으로 처리합니다."); }
  }
  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || `${info.title} 테이블을 준비하고 있습니다…`}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <CasinoCardScreen state={ready.state} atlas={ready.atlas} balance={balance} busy={busy} error={error} initialMultiplier={ready.multiplier} {...(ready.dealer ? { dealer: ready.dealer } : {})} onStart={start} onAction={act} onExit={onExit} />;
}

async function persist(sessionId: string, cabinetId: string, title: string, previous: CasinoCardState, next: CasinoCardState, action: CasinoCardAction): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.cursor, resultHash(previous), next); await appendAction(sessionId, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId, sessionId, title, progressLabel: next.status === "complete" ? `${next.outcome === "win" ? "승리" : next.outcome === "push" ? "무승부" : "패배"} · ${next.creditAmount} P 반환` : next.status === "ready" ? "새 대국 준비" : next.message, updatedAt: new Date().toISOString() });
}
function seedFromReceipt(receipt: GameWagerReceipt): string | null { return receipt.choiceKey?.startsWith("deal:") ? receipt.choiceKey.slice(5) || null : null; }
function isStake(value: number): value is CasinoCardStake { return value === 10 || value === 50 || value === 200; }
function validReceipt(receipt: GameWagerReceipt, baseExposure: number): boolean { try { wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount, baseExposure); return isStake(receipt.stake); } catch { return false; } }
function leveragedCredit(state: CasinoCardState, receipt: GameWagerReceipt, baseExposure: number): number { return leveragedWagerCredit(state.reservedAmount, casinoCardCredit(state), wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount, baseExposure)); }
function maximumCasinoCardCredit(gameId: CasinoCardGameId, stake: CasinoCardStake): number {
  if (gameId === "high-low") return Math.round(stake * 4.5);
  if (gameId === "blackjack") return Math.floor(stake * 2.5);
  if (gameId === "texas-holdem") return stake * 16;
  return stake * 2;
}

async function buildHouseDealer(bundle: Awaited<ReturnType<typeof loadTemerosaCasinoAssets>>, sessionId: string): Promise<HouseDealer> {
  const assetIdByMood = { neutral: "wares-standing", pleased: "wares-smile", tense: "wares-surprised", despair: "wares-sad" } as const;
  for (const assetId of Object.values(assetIdByMood)) if (!bundle.assets[assetId]) throw new Error(`high_low_house_portrait_missing:${assetId}`);
  const records = summarizeOpponentRecords(await listMatchRecordsForSession(sessionId, 200));
  return {
    id: HIGH_LOW_HOUSE_ID,
    name: "워어즈",
    portraits: {
      neutral: bundle.assets[assetIdByMood.neutral]!,
      pleased: bundle.assets[assetIdByMood.pleased]!,
      tense: bundle.assets[assetIdByMood.tense]!,
      despair: bundle.assets[assetIdByMood.despair]!,
    },
    record: records[HIGH_LOW_HOUSE_ID] ?? emptyRecord(),
  };
}

async function recordHighLowMatch(state: CasinoCardState): Promise<void> {
  if (state.gameId !== "high-low" || state.status !== "complete" || !state.outcome) return;
  const recordId = `${state.sessionId}#${state.wagerId ?? state.seed}`;
  if ((await listMatchRecordsForSession(state.sessionId, 200)).some((record) => record.recordId === recordId)) return;
  const draw = state.outcome === "push";
  const playerWon = state.outcome === "win";
  const record: MatchRecord = {
    contract: "match-record/0.1",
    recordId,
    cabinetId: "temerosa-high-low",
    cabinetVersion: CASINO_CARDS_VERSION,
    packVersion: CASINO_CARD_PACK_VERSION,
    sessionId: state.sessionId,
    sequence: state.sequence,
    seed: state.seed,
    completedAt: new Date().toISOString(),
    turns: Math.max(1, state.cursor - 1),
    standings: [
      { seatId: "player", participantId: "player", displayName: "플레이어", rank: draw ? 1 : playerWon ? 1 : 2, isPlayer: true },
      { seatId: "house", participantId: HIGH_LOW_HOUSE_ID, displayName: "워어즈", rank: draw ? 1 : playerWon ? 2 : 1, isPlayer: false },
    ],
    outcome: draw ? "draw" : playerWon ? "win" : "loss",
    resultHash: casinoCardResultHash(state),
  };
  await appendMatchRecord(record);
  await pruneMatchRecords(200);
}

function emptyRecord(): { wins: number; losses: number; draws: number } { return { wins: 0, losses: 0, draws: 0 }; }
