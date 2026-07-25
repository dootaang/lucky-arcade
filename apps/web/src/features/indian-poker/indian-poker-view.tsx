import { INDIAN_POKER_VERSION, TEMEROSA_INDIAN_POKER_PACK_VERSION, createIndianPokerState, indianPokerRanking, reduceIndianPoker, temerosaIndianPokerCartridge, type IndianPokerAction, type IndianPokerState } from "@lucky-arcade/indian-poker";
import { IndianPokerScreen } from "@lucky-arcade/indian-poker/react";
import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import type { SpriteAtlasManifest } from "@lucky-arcade/contracts";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import type { MatchRecord, WalletSnapshot } from "@lucky-arcade/persistence";
import { useEffect, useState } from "react";
import { appendAction, appendMatchRecord, grantMedals, pruneMatchRecords, readWallet, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaPilotAssets } from "../../lib/temerosa-content.ts";

const SESSION = "indian-poker:table-1";
interface Ready { state: IndianPokerState; assets: Readonly<Record<string, string>>; atlas: CourtAtlas; }

export default function IndianPokerView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<Ready | null>(null), [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [award, setAward] = useState<{ amount: number; rank: number } | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaPilotAssets(), loadAtlas(), readWallet(), recoverSession<IndianPokerState, IndianPokerAction>({
      sessionId: SESSION, fresh: createIndianPokerState(temerosaIndianPokerCartridge, new Date().toISOString().slice(0, 10), SESSION), cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION,
      isState: (value): value is IndianPokerState => Boolean(value && typeof value === "object" && (value as Partial<IndianPokerState>).version === INDIAN_POKER_VERSION && (value as Partial<IndianPokerState>).packVersion === TEMEROSA_INDIAN_POKER_PACK_VERSION),
      reduce: (state, action) => reduceIndianPoker(temerosaIndianPokerCartridge, state, action),
    })]).then(([assets, atlas, nextWallet, recovered]) => { if (alive) { setReady({ assets, atlas, state: recovered.state }); setWallet(nextWallet); } }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  async function persist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction) {
    const receipt = makeReceipt(next.sequence, action, next.round, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: "arcade-engine/0.1", cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId: "indian-poker", sessionId: SESSION, title: "테메로세 인디언 포커", progressLabel: next.status === "complete" ? "5라운드 · 대국 완료" : `${next.round}/5 라운드`, updatedAt: new Date().toISOString() });
    if (previous.status !== "complete" && next.status === "complete") void settle(next).catch(() => undefined);
  }

  async function settle(state: IndianPokerState) {
    const ranking = indianPokerRanking(state), names = new Map(temerosaIndianPokerCartridge.characters.map((character) => [character.id, character.name]));
    const record: MatchRecord = { contract: "match-record/0.1", recordId: `${SESSION}#${state.sequence}`, cabinetId: "indian-poker", cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION, sessionId: SESSION, sequence: state.sequence, seed: state.seed, completedAt: new Date().toISOString(), turns: state.round, standings: ranking.map((standing) => ({ seatId: standing.seatId, ...(state.seats[standing.seatId].characterId ? { participantId: state.seats[standing.seatId].characterId! } : {}), displayName: standing.seatId === "player" ? "플레이어" : names.get(state.seats[standing.seatId].characterId ?? "") ?? "상대", rank: standing.rank, isPlayer: standing.seatId === "player" })), outcome: ranking.find((standing) => standing.seatId === "player")?.rank === 1 ? "win" : "loss", resultHash: resultHash(state) };
    await appendMatchRecord(record); await pruneMatchRecords(200);
    const player = ranking.find((standing) => standing.seatId === "player")!;
    const result = await grantMedals({ sessionId: SESSION, sequence: state.sequence, cabinetId: "indian-poker", rank: player.rank, seatCount: 4, spectated: false });
    setWallet(result.wallet); setAward({ amount: result.amount, rank: player.rank });
  }

  if (error) return <main className="game-shell"><div className="game-loading">인디언 포커를 준비하지 못했습니다.<button onClick={onExit}>돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">카드 덱과 표정을 준비하고 있습니다…</div></main>;
  return <IndianPokerScreen cartridge={temerosaIndianPokerCartridge} assets={ready.assets} atlas={ready.atlas} initialState={ready.state} {...(wallet ? { walletBalance: wallet.balance } : {})} lastAward={award} onPersist={persist} onExit={onExit} />;
}

async function loadAtlas(): Promise<CourtAtlas> {
  const response = await fetch("/content/playing-cards/1.0.0/manifest.json");
  if (!response.ok) throw new Error("playing_card_manifest_failed");
  const manifest = await response.json() as SpriteAtlasManifest;
  const sheet = manifest.sheets.find((candidate) => candidate.size === "sm");
  if (!sheet) throw new Error("playing_card_sheet_missing");
  return { url: `/content/playing-cards/1.0.0/${sheet.path}`, cols: manifest.cols, cell: sheet.cell, gutter: sheet.gutter, sheet: { width: sheet.width, height: sheet.height }, frames: Object.fromEntries(manifest.frames.map((frame) => [frame.id, { col: frame.col, row: frame.row }])) };
}
