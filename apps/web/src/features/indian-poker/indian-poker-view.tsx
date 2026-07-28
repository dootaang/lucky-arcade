import {
  INDIAN_POKER_DEFAULT_ROUND_COUNT,
  INDIAN_POKER_ROUND_COUNTS,
  INDIAN_POKER_TERMS_VERSION,
  INDIAN_POKER_VERSION,
  TEMEROSA_INDIAN_POKER_PACK_VERSION,
  createIndianPokerState,
  indianPokerRanking,
  isIndianPokerState,
  reduceIndianPoker,
  type IndianPokerAction,
  type IndianPokerCartridge,
  type IndianPokerRoundCount,
  type IndianPokerStake,
  type IndianPokerState,
} from "@lucky-arcade/indian-poker";
import { IndianPokerScreen } from "@lucky-arcade/indian-poker/react";
import { ENGINE_VERSION, leveragedWagerCredit, makeReceipt, resultHash, wagerExposure, wagerMultiplierFromExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, MatchRecord } from "@lucky-arcade/persistence";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useRef, useState } from "react";
import { appendAction, appendMatchRecord, listMatchRecordsForSession, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { readWallet } from "../../lib/wallet.ts";
import { summarizeOpponentRecords, type OpponentRecordSummary } from "../../lib/opponent-records.ts";
import { useCasinoOpponentAvailability } from "../casino-ledger/use-casino-opponent-availability.ts";
import { buildTemerosaIndianPokerCartridge } from "./temerosa-indian-poker-cartridge.ts";

const CABINET_ID = "indian-poker";
const SESSION = "indian-poker:heads-up-2";
const LEGACY_SESSION = "indian-poker:heads-up-1";

interface Ready {
  state: IndianPokerState;
  cartridge: IndianPokerCartridge;
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  atlas: CourtAtlas;
  multiplier: WagerMultiplier;
}

export default function IndianPokerView({ onExit }: { onExit(): void }) {
  const availability = useCasinoOpponentAvailability(SESSION);
  const [ready, setReady] = useState<Ready | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opponentRecords, setOpponentRecords] = useState<Readonly<Record<string, OpponentRecordSummary>>>({});
  const stateRef = useRef<IndianPokerState | null>(null);
  const cartridgeRef = useRef<IndianPokerCartridge | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), loadPlayingCardAtlas(), readWallet()]).then(async ([bundle, atlas, wallet]) => {
      const cartridge = buildTemerosaIndianPokerCartridge(bundle.contentAssets);
      if (cartridge.characters.length !== 30) throw new Error(`indian_poker_opponent_count:${cartridge.characters.length}`);
      for (const character of cartridge.characters) {
        for (const assetId of Object.values(character.portraits)) {
          if (!bundle.assets[assetId]) throw new Error(`indian_poker_portrait_missing:${assetId}`);
        }
      }
      const first = cartridge.characters[0];
      if (!first) throw new Error("indian_poker_character_missing");

      let nextBalance = wallet.balance;
      const legacyWagers = await listWagers(LEGACY_SESSION);
      for (const receipt of legacyWagers.filter((candidate) => candidate.status === "reserved")) {
        const transaction = await invalidateWager({ wagerId: receipt.wagerId, reason: "version-mismatch" });
        nextBalance = transaction.wallet.balance;
      }

      const recovered = await recoverSession<IndianPokerState, IndianPokerAction>({
        sessionId: SESSION,
        fresh: createIndianPokerState(cartridge, dailySeed(), first.id, SESSION, INDIAN_POKER_DEFAULT_ROUND_COUNT),
        cabinetVersion: INDIAN_POKER_VERSION,
        packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION,
        isState: (value): value is IndianPokerState => isIndianPokerState(value)
          && value.packVersion === TEMEROSA_INDIAN_POKER_PACK_VERSION
          && cartridge.characters.some((character) => character.id === value.opponentId),
        reduce: (state, action) => reduceIndianPoker(cartridge, state, action),
      });
      let state = recovered.state;
      const wagers = await listWagers(SESSION);
      const reserved = wagers.filter((receipt) => receipt.status === "reserved");
      const pending = reserved.find((receipt) => receipt.termsVersion === INDIAN_POKER_TERMS_VERSION && validReceipt(receipt) && identityFromReceipt(receipt));
      for (const receipt of reserved) {
        if (receipt === pending) continue;
        const transaction = await invalidateWager({ wagerId: receipt.wagerId, reason: receipt.termsVersion === INDIAN_POKER_TERMS_VERSION ? "corrupt-state" : "version-mismatch" });
        nextBalance = transaction.wallet.balance;
      }

      if (pending && state.wagerId !== pending.wagerId) {
        const identity = identityFromReceipt(pending);
        if (identity && isStake(pending.stake) && cartridge.characters.some((character) => character.id === identity.opponentId)) {
          const fresh = createIndianPokerState(cartridge, identity.seed, identity.opponentId, SESSION, identity.roundCount);
          const action: IndianPokerAction = { type: "start", seed: identity.seed, stake: pending.stake, wagerId: pending.wagerId, roundCount: identity.roundCount };
          const next = reduceIndianPoker(cartridge, fresh, action);
          await persistState(fresh, next, action);
          state = next;
        }
      }
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") {
        const transaction = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: resultHash(state), creditAmount: leveragedCredit(state, pending) });
        nextBalance = transaction.wallet.balance;
        await recordIndianPokerMatch(state, cartridge);
      }
      const restoredReceipt = state.wagerId ? wagers.find((receipt) => receipt.wagerId === state.wagerId) : undefined;
      if (!pending && state.status === "complete" && restoredReceipt?.status === "settled") await recordIndianPokerMatch(state, cartridge);

      const records = summarizeOpponentRecords(await loadAllMatchRecords());
      if (!alive) return;
      stateRef.current = state;
      cartridgeRef.current = cartridge;
      const activeReceipt = pending ?? restoredReceipt;
      setReady({
        state,
        cartridge,
        assets: bundle.assets,
        thumbAssets: bundle.thumbAssets,
        atlas,
        multiplier: activeReceipt && validReceipt(activeReceipt) ? wagerMultiplierFromExposure(activeReceipt.stake, activeReceipt.reservedAmount) : 2,
      });
      setBalance(nextBalance);
      setOpponentRecords(records);
    }).catch(() => {
      if (alive) setError("인디언 포커를 준비하지 못했습니다.");
    });
    return () => { alive = false; };
  }, []);

  async function start(stake: IndianPokerStake, multiplier: WagerMultiplier, roundCount: IndianPokerRoundCount): Promise<IndianPokerState> {
    const current = stateRef.current;
    const cartridge = cartridgeRef.current;
    if (!current || !cartridge || busy || current.status !== "ready") throw new Error("indian_poker_not_ready");
    if (availability.opponents[current.opponentId]?.available === false) throw new Error("casino_opponent_busy");
    setBusy(true);
    setError("");
    try {
      const seed = `${current.seed}:deal:${crypto.randomUUID()}`;
      const transaction = await reserveWager({
        outcomeKey: `${INDIAN_POKER_TERMS_VERSION}:${current.opponentId}:${roundCount}:${seed}`,
        cabinetId: CABINET_ID,
        sessionId: SESSION,
        termsVersion: INDIAN_POKER_TERMS_VERSION,
        choiceKey: `deal:${current.opponentId}|${roundCount}|${seed}`,
        stake,
        reservedAmount: wagerExposure(stake, multiplier),
      });
      setBalance(transaction.wallet.balance);
      const action: IndianPokerAction = { type: "start", seed, stake, wagerId: transaction.wager.wagerId, roundCount };
      const next = reduceIndianPoker(cartridge, current, action);
      stateRef.current = next;
      setReady((value) => value ? { ...value, state: next, multiplier } : value);
      await persistState(current, next, action);
      setBusy(false);
      return next;
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다.");
      throw cause;
    }
  }

  async function persist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void> {
    await persistState(previous, next, action);
    stateRef.current = next;
    setReady((value) => value ? { ...value, state: next } : value);
    if (previous.status !== "complete" && next.status === "complete") await finish(next);
  }

  async function finish(state: IndianPokerState): Promise<void> {
    if (!state.wagerId) return;
    setBusy(true);
    try {
      const receipt = (await listWagers(SESSION)).find((candidate) => candidate.wagerId === state.wagerId);
      if (!receipt) throw new Error("indian_poker_wager_receipt_missing");
      const transaction = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: resultHash(state), creditAmount: leveragedCredit(state, receipt) });
      setBalance(transaction.wallet.balance);
      setBusy(false);
      try {
        await recordIndianPokerMatch(state, cartridgeRef.current!);
        setOpponentRecords(summarizeOpponentRecords(await loadAllMatchRecords()));
      } catch {
        setError("포인트는 정산했지만 전적 기록을 남기지 못했습니다.");
      }
    } catch {
      setBusy(false);
      setError("결과는 보존했지만 정산에 실패했습니다. 다시 열면 같은 영수증으로 처리합니다.");
      throw new Error("indian_poker_settlement_pending");
    }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading">{error || "카드 덱과 상대를 준비하고 있습니다."}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <IndianPokerScreen cartridge={ready.cartridge} assets={ready.assets} thumbAssets={ready.thumbAssets} atlas={ready.atlas} initialState={ready.state} initialMultiplier={ready.multiplier} walletBalance={balance} busy={busy} error={error} opponentAvailability={availability.opponents} opponentRecords={opponentRecords} onOpponentSelectionChange={(id) => availability.holdOpponents([id])} onStart={start} onPersist={persist} onExit={onExit} />;
}

async function loadAllMatchRecords(): Promise<MatchRecord[]> {
  const [current, legacy] = await Promise.all([listMatchRecordsForSession(SESSION, 200), listMatchRecordsForSession(LEGACY_SESSION, 200)]);
  return [...current, ...legacy].sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, 200);
}

async function recordIndianPokerMatch(state: IndianPokerState, cartridge: IndianPokerCartridge): Promise<void> {
  const opponent = cartridge.characters.find((character) => character.id === state.opponentId);
  const ranking = indianPokerRanking(state);
  const player = ranking.find((standing) => standing.seatId === "player");
  const tied = ranking[0]?.rank === ranking[1]?.rank;
  const record: MatchRecord = {
    contract: "match-record/0.1",
    recordId: `${SESSION}#${state.wagerId ?? state.seed}`,
    cabinetId: CABINET_ID,
    cabinetVersion: INDIAN_POKER_VERSION,
    packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION,
    sessionId: SESSION,
    sequence: state.sequence,
    seed: state.seed,
    completedAt: new Date().toISOString(),
    turns: state.round,
    standings: ranking.map((standing) => ({ seatId: standing.seatId, participantId: standing.seatId === "npc" ? state.opponentId : "player", displayName: standing.seatId === "player" ? "플레이어" : opponent?.name ?? state.opponentId, rank: standing.rank, isPlayer: standing.seatId === "player" })),
    outcome: tied ? "draw" : player?.rank === 1 ? "win" : "loss",
    resultHash: resultHash(state),
  };
  await appendMatchRecord(record);
  await pruneMatchRecords(200);
}

async function persistState(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.round, resultHash(previous), next);
  await appendAction(SESSION, receipt);
  await saveSnapshot(
    { contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: INDIAN_POKER_VERSION, packVersion: TEMEROSA_INDIAN_POKER_PACK_VERSION },
    { contract: "recent-play/0.1", cabinetId: CABINET_ID, sessionId: SESSION, title: "인디언 포커", progressLabel: next.status === "ready" ? "상대 선택" : next.status === "complete" ? `대국 완료 · ${next.creditAmount} P 반환` : `${next.round}/${next.roundCount} · 나 ${next.playerChips}칩 : ${next.npcChips}칩 상대`, updatedAt: new Date().toISOString() },
  );
}

function identityFromReceipt(receipt: GameWagerReceipt): { opponentId: string; roundCount: IndianPokerRoundCount; seed: string } | null {
  if (!receipt.choiceKey?.startsWith("deal:")) return null;
  const [opponentId, rawRoundCount, ...seedParts] = receipt.choiceKey.slice(5).split("|");
  const roundCount = Number(rawRoundCount);
  const seed = seedParts.join("|");
  return opponentId && seed && INDIAN_POKER_ROUND_COUNTS.includes(roundCount as IndianPokerRoundCount)
    ? { opponentId, roundCount: roundCount as IndianPokerRoundCount, seed }
    : null;
}

function isStake(value: number): value is IndianPokerStake { return value === 10 || value === 50 || value === 200; }
function validReceipt(receipt: GameWagerReceipt): boolean { try { wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount); return isStake(receipt.stake); } catch { return false; } }
function leveragedCredit(state: IndianPokerState, receipt: GameWagerReceipt): number { return leveragedWagerCredit(state.stake ?? receipt.stake, state.creditAmount, wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount)); }
function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
