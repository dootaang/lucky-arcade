import {
  MATCH_PAIRS_TERMS_VERSION,
  MATCH_PAIRS_VERSION,
  createMatchPairsState,
  isMatchPairsState,
  matchPairsResultHash,
  reduceMatchPairs,
  type MatchPairsAction,
  type MatchPairsDifficulty,
  type MatchPairsOpponent,
  type MatchPairsStake,
  type MatchPairsState,
} from "@lucky-arcade/match-pairs";
import { MatchPairsScreen } from "@lucky-arcade/match-pairs/react";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import type { GameWagerReceipt, MatchRecord } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { appendAction, appendMatchRecord, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { readWallet } from "../../lib/wallet.ts";
import { createTemerosaMatchPairsOpponents } from "./temerosa-match-pairs-opponents.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "./temerosa-match-pairs-selection.ts";

const CABINET_ID = "temerosa-match-pairs";
const SESSION = "temerosa-match-pairs:versus-1";

interface ReadyMatchPairs {
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  opponents: readonly MatchPairsOpponent[];
  state: MatchPairsState;
}

interface WagerIdentity {
  seed: string;
  difficulty: MatchPairsDifficulty;
  opponentId: string;
}

export default function MatchPairsView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<ReadyMatchPairs | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stateRef = useRef<MatchPairsState | null>(null);
  const opponentsRef = useRef<readonly MatchPairsOpponent[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), readWallet()]).then(async ([bundle, wallet]) => {
      for (const face of TEMEROSA_MATCH_PAIRS_FACES) if (!bundle.assets[face.assetId]) throw new Error(`match_pairs_asset_missing:${face.assetId}`);
      const opponents = createTemerosaMatchPairsOpponents(bundle.contentAssets);
      if (opponents.length !== 30) throw new Error(`match_pairs_opponent_count:${opponents.length}`);
      for (const opponent of opponents) for (const assetId of [...Object.values(opponent.portraits), opponent.despairPortrait]) {
        if (!bundle.assets[assetId]) throw new Error(`match_pairs_opponent_asset_missing:${assetId}`);
      }
      const firstOpponent = opponents[0];
      if (!firstOpponent) throw new Error("match_pairs_opponent_missing");
      const recovered = await recoverSession<MatchPairsState, MatchPairsAction>({
        sessionId: SESSION,
        fresh: createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, dailySeed(), "easy", firstOpponent.id, SESSION),
        cabinetVersion: MATCH_PAIRS_VERSION,
        packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        isState: (value): value is MatchPairsState => isMatchPairsState(value) && value.packVersion === TEMEROSA_MATCH_PAIRS_PACK_VERSION && opponents.some((opponent) => opponent.id === value.opponentId),
        reduce: (state, action) => reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, state, action),
      });
      let state = recovered.state;
      let nextBalance = wallet.balance;
      const wagers = await listWagers(SESSION);
      const reserved = wagers.filter((receipt) => receipt.status === "reserved");
      const pending = reserved.find((receipt) => receipt.termsVersion === MATCH_PAIRS_TERMS_VERSION && validIdentity(receipt, opponents));
      for (const receipt of reserved) {
        if (receipt === pending) continue;
        const transaction = await invalidateWager({ wagerId: receipt.wagerId, reason: receipt.termsVersion === MATCH_PAIRS_TERMS_VERSION ? "corrupt-state" : "version-mismatch" });
        nextBalance = transaction.wallet.balance;
      }
      if (pending && state.wagerId !== pending.wagerId) {
        const identity = identityFromReceipt(pending)!;
        const fresh = createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, identity.seed, identity.difficulty, identity.opponentId, SESSION);
        const action: MatchPairsAction = { type: "start", seed: identity.seed, stake: pending.stake as MatchPairsStake, wagerId: pending.wagerId };
        const next = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, fresh, action);
        await persistState(fresh, next, action, opponents);
        state = next;
      }
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") {
        const transaction = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: matchPairsResultHash(state), creditAmount: state.creditAmount });
        nextBalance = transaction.wallet.balance;
        await recordMatch(state, opponents);
      }
      const restoredReceipt = state.wagerId ? wagers.find((receipt) => receipt.wagerId === state.wagerId) : undefined;
      if (!pending && state.status === "complete" && restoredReceipt?.status === "settled") await recordMatch(state, opponents);
      if (!alive) return;
      stateRef.current = state;
      opponentsRef.current = opponents;
      setBalance(nextBalance);
      setReady({ assets: bundle.assets, thumbAssets: bundle.thumbAssets, opponents, state });
    }).catch(() => { if (alive) setError("짝맞추기 이미지를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  async function start(stake: MatchPairsStake): Promise<MatchPairsState> {
    const current = stateRef.current;
    const opponents = opponentsRef.current;
    if (!current || busy || current.status !== "ready") throw new Error("match_pairs_not_ready");
    setBusy(true);
    setError("");
    try {
      const identity: WagerIdentity = { seed: `${dailySeed()}:deal:${crypto.randomUUID()}`, difficulty: current.difficulty, opponentId: current.opponentId };
      const transaction = await reserveWager({
        outcomeKey: `${MATCH_PAIRS_TERMS_VERSION}:${identity.seed}`,
        cabinetId: CABINET_ID,
        sessionId: SESSION,
        termsVersion: MATCH_PAIRS_TERMS_VERSION,
        choiceKey: choiceKey(identity),
        stake,
        reservedAmount: stake,
      });
      setBalance(transaction.wallet.balance);
      const action: MatchPairsAction = { type: "start", seed: identity.seed, stake, wagerId: transaction.wager.wagerId };
      const next = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, current, action);
      stateRef.current = next;
      setReady((value) => value ? { ...value, state: next } : value);
      await persistState(current, next, action, opponents);
      setBusy(false);
      return next;
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다. 예약이 남았다면 다시 입장할 때 복구됩니다.");
      throw cause;
    }
  }

  async function persist(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction): Promise<void> {
    const opponents = opponentsRef.current;
    await persistState(previous, next, action, opponents);
    stateRef.current = next;
    if (previous.status !== "complete" && next.status === "complete") {
      if (!next.wagerId) throw new Error("match_pairs_wager_missing");
      try {
        const transaction = await settleWager({ wagerId: next.wagerId, settlementSequence: next.sequence, resultKey: matchPairsResultHash(next), creditAmount: next.creditAmount });
        setBalance(transaction.wallet.balance);
        await recordMatch(next, opponents);
      } catch {
        setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 영수증으로 처리합니다.");
        throw new Error("match_pairs_settlement_pending");
      }
    }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || "짝맞추기 테이블을 준비하고 있어요…"}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <MatchPairsScreen
    faces={TEMEROSA_MATCH_PAIRS_FACES}
    opponents={ready.opponents}
    assets={ready.assets}
    thumbAssets={ready.thumbAssets}
    packVersion={TEMEROSA_MATCH_PAIRS_PACK_VERSION}
    seed={ready.state.seed}
    sessionId={SESSION}
    initialState={ready.state}
    walletBalance={balance}
    busy={busy}
    wagerError={error}
    onStart={start}
    onTransition={persist}
    onExit={onExit}
  />;
}

async function persistState(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction, opponents: readonly MatchPairsOpponent[]): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.attempts, resultHash(previous), next);
  await appendAction(SESSION, receipt);
  const opponent = opponents.find((candidate) => candidate.id === next.opponentId);
  await saveSnapshot({
    contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next,
    stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: MATCH_PAIRS_VERSION,
    packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
  }, {
    contract: "recent-play/0.1", cabinetId: CABINET_ID, sessionId: SESSION,
    title: "짝맞추기", progressLabel: progressLabel(next, opponent?.name ?? "NPC"), updatedAt: new Date().toISOString(),
  });
}

async function recordMatch(state: MatchPairsState, opponents: readonly MatchPairsOpponent[]): Promise<void> {
  const opponent = opponents.find((candidate) => candidate.id === state.opponentId);
  const playerWon = state.outcome === "player";
  const npcWon = state.outcome === "npc";
  const record: MatchRecord = {
    contract: "match-record/0.1", recordId: `${SESSION}#${MATCH_PAIRS_VERSION}#${state.seed}#${state.sequence}`, cabinetId: CABINET_ID,
    cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION, sessionId: SESSION,
    sequence: state.sequence, seed: state.seed, completedAt: new Date().toISOString(), turns: state.turnNumber,
    standings: [
      { seatId: "player", participantId: "player", displayName: "플레이어", rank: playerWon ? 1 : npcWon ? 2 : 1, isPlayer: true },
      { seatId: "npc", participantId: state.opponentId, displayName: opponent?.name ?? state.opponentId, rank: npcWon ? 1 : playerWon ? 2 : 1, isPlayer: false },
    ],
    outcome: playerWon ? "win" : npcWon ? "loss" : "draw", resultHash: matchPairsResultHash(state),
  };
  await appendMatchRecord(record);
  await pruneMatchRecords(200);
}

function progressLabel(state: MatchPairsState, opponentName: string): string {
  if (state.status === "ready") return `${opponentName} · 게임 준비`;
  if (state.status === "complete") return `나 ${state.claims.player.length} : ${state.claims.npc.length} ${opponentName} · ${state.creditAmount} P 반환`;
  return `나 ${state.claims.player.length} : ${state.claims.npc.length} ${opponentName} · ${state.currentTurn === "player" ? "내 차례" : "상대 차례"}`;
}

function choiceKey(identity: WagerIdentity): string { return `deal:${JSON.stringify(identity)}`; }
function identityFromReceipt(receipt: GameWagerReceipt): WagerIdentity | null {
  if (!receipt.choiceKey?.startsWith("deal:")) return null;
  try {
    const value = JSON.parse(receipt.choiceKey.slice(5)) as Partial<WagerIdentity>;
    return typeof value.seed === "string" && (value.difficulty === "easy" || value.difficulty === "normal") && typeof value.opponentId === "string"
      ? { seed: value.seed, difficulty: value.difficulty, opponentId: value.opponentId } : null;
  } catch { return null; }
}
function validIdentity(receipt: GameWagerReceipt, opponents: readonly MatchPairsOpponent[]): boolean {
  const identity = identityFromReceipt(receipt);
  return Boolean(identity && receipt.cabinetId === CABINET_ID && receipt.reservedAmount === receipt.stake
    && (receipt.stake === 10 || receipt.stake === 50 || receipt.stake === 200)
    && opponents.some((opponent) => opponent.id === identity.opponentId));
}
function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
