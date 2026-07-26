import { INDIAN_POKER_TERMS_VERSION, INDIAN_POKER_VERSION, TEMEROSA_INDIAN_POKER_PACK_VERSION, createIndianPokerState, indianPokerRanking, reduceIndianPoker, temerosaIndianPokerCartridge, type IndianPokerAction, type IndianPokerStake, type IndianPokerState } from "@lucky-arcade/indian-poker";
import { IndianPokerScreen } from "@lucky-arcade/indian-poker/react";
import type { SpriteAtlasManifest } from "@lucky-arcade/contracts";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import type { GameWagerReceipt, MatchRecord } from "@lucky-arcade/persistence";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useRef, useState } from "react";
import { appendAction, appendMatchRecord, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaPilotAssets } from "../../lib/temerosa-content.ts";
import { readWallet } from "../../lib/wallet.ts";

const CABINET_ID = "indian-poker", SESSION = "indian-poker:table-1";
interface Ready { state: IndianPokerState; assets: Readonly<Record<string, string>>; atlas: CourtAtlas; }

export default function IndianPokerView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<Ready | null>(null), [balance, setBalance] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const stateRef = useRef<IndianPokerState | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaPilotAssets(), loadAtlas(), readWallet(), recoverSession<IndianPokerState, IndianPokerAction>({ sessionId: SESSION, fresh: createIndianPokerState(temerosaIndianPokerCartridge, new Date().toISOString().slice(0, 10), SESSION), cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION, isState: (value): value is IndianPokerState => Boolean(value && typeof value === "object" && (value as Partial<IndianPokerState>).version === INDIAN_POKER_VERSION && (value as Partial<IndianPokerState>).packVersion === TEMEROSA_INDIAN_POKER_PACK_VERSION), reduce: (state, action) => reduceIndianPoker(temerosaIndianPokerCartridge, state, action) })]).then(async ([assets, atlas, wallet, recovered]) => {
      let state = recovered.state, nextBalance = wallet.balance; const pending = (await listWagers(SESSION)).find((receipt) => receipt.status === "reserved");
      if (pending && state.wagerId !== pending.wagerId) { const seed = seedFromReceipt(pending); if (seed && isStake(pending.stake)) { const fresh = createIndianPokerState(temerosaIndianPokerCartridge, seed, SESSION), action: IndianPokerAction = { type: "start", seed, stake: pending.stake, wagerId: pending.wagerId }, next = reduceIndianPoker(temerosaIndianPokerCartridge, fresh, action); await persist(fresh, next, action); state = next; } }
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") { const transaction = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: resultHash(state), creditAmount: state.creditAmount }); nextBalance = transaction.wallet.balance; }
      if (!alive) return; stateRef.current = state; setReady({ assets, atlas, state }); setBalance(nextBalance);
    }).catch(() => { if (alive) setError("인디언 포커를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  async function start(stake: IndianPokerStake): Promise<IndianPokerState> {
    const current = stateRef.current; if (!current || busy) throw new Error("indian_poker_not_ready"); setBusy(true); setError("");
    try { const seed = `${current.seed}:deal:${crypto.randomUUID()}`, transaction = await reserveWager({ outcomeKey: `${INDIAN_POKER_TERMS_VERSION}:${seed}`, cabinetId: CABINET_ID, sessionId: SESSION, termsVersion: INDIAN_POKER_TERMS_VERSION, choiceKey: `deal:${seed}`, stake, reservedAmount: stake }); setBalance(transaction.wallet.balance); const fresh = current.status === "ready" ? current : createIndianPokerState(temerosaIndianPokerCartridge, seed, SESSION), action: IndianPokerAction = { type: "start", seed, stake, wagerId: transaction.wager.wagerId }, next = reduceIndianPoker(temerosaIndianPokerCartridge, fresh, action); stateRef.current = next; setReady((value) => value ? { ...value, state: next } : value); await persist(fresh, next, action); setBusy(false); return next; }
    catch (cause) { setBusy(false); setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다."); throw cause; }
  }
  async function persist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void> {
    const receipt = makeReceipt(next.sequence, action, next.round, resultHash(previous), next); await appendAction(SESSION, receipt); await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId: CABINET_ID, sessionId: SESSION, title: "테메로세 인디언 포커", progressLabel: next.status === "complete" ? `대국 완료 · ${next.creditAmount} P 반환` : `${next.round}/5 라운드`, updatedAt: new Date().toISOString() });
    stateRef.current = next; setReady((value) => value ? { ...value, state: next } : value);
    if (previous.status !== "complete" && next.status === "complete") await finish(next);
  }
  async function finish(state: IndianPokerState): Promise<void> {
    if (!state.wagerId) return; setBusy(true);
    try { const transaction = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: resultHash(state), creditAmount: state.creditAmount }); setBalance(transaction.wallet.balance); setBusy(false); try { await record(state); } catch { setError("포인트는 정산됐지만 전적 기록을 남기지 못했습니다."); } }
    catch { setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 영수증으로 처리합니다."); throw new Error("indian_poker_settlement_pending"); }
  }
  async function record(state: IndianPokerState): Promise<void> { const ranking = indianPokerRanking(state), names = new Map(temerosaIndianPokerCartridge.characters.map((character) => [character.id, character.name])); const record: MatchRecord = { contract: "match-record/0.1", recordId: `${SESSION}#${state.sequence}`, cabinetId: CABINET_ID, cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION, sessionId: SESSION, sequence: state.sequence, seed: state.seed, completedAt: new Date().toISOString(), turns: state.round, standings: ranking.map((standing) => ({ seatId: standing.seatId, ...(state.seats[standing.seatId].characterId ? { participantId: state.seats[standing.seatId].characterId! } : {}), displayName: standing.seatId === "player" ? "플레이어" : names.get(state.seats[standing.seatId].characterId ?? "") ?? "상대", rank: standing.rank, isPlayer: standing.seatId === "player" })), outcome: ranking.find((standing) => standing.seatId === "player")?.rank === 1 ? "win" : "loss", resultHash: resultHash(state) }; await appendMatchRecord(record); await pruneMatchRecords(200); }
  if (!ready) return <main className="game-shell"><div className="game-loading">{error || "카드 덱과 표정을 준비하고 있습니다…"}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <IndianPokerScreen cartridge={temerosaIndianPokerCartridge} assets={ready.assets} atlas={ready.atlas} initialState={ready.state} walletBalance={balance} busy={busy} error={error} onStart={start} onPersist={persist} onExit={onExit} />;
}
async function loadAtlas(): Promise<CourtAtlas> { const response = await fetch("/content/playing-cards/1.0.0/manifest.json"); if (!response.ok) throw new Error("playing_card_manifest_failed"); const manifest = await response.json() as SpriteAtlasManifest, sheet = manifest.sheets.find((candidate) => candidate.size === "sm"); if (!sheet) throw new Error("playing_card_sheet_missing"); return { url: `/content/playing-cards/1.0.0/${sheet.path}`, cols: manifest.cols, cell: sheet.cell, gutter: sheet.gutter, sheet: { width: sheet.width, height: sheet.height }, frames: Object.fromEntries(manifest.frames.map((frame) => [frame.id, { col: frame.col, row: frame.row }])) }; }
function seedFromReceipt(receipt: GameWagerReceipt): string | null { return receipt.choiceKey?.startsWith("deal:") ? receipt.choiceKey.slice(5) || null : null; }
function isStake(value: number): value is IndianPokerStake { return value === 10 || value === 50 || value === 200; }
