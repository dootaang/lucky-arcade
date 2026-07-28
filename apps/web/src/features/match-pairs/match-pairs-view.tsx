import {
  MATCH_PAIRS_TERMS_VERSION, MATCH_PAIRS_VERSION, createMatchPairsState, isMatchPairsState, matchPairsResultHash, reduceMatchPairs, validateMatchPairsLines,
  type MatchPairsAction, type MatchPairsDifficulty, type MatchPairsFocus, type MatchPairsLine, type MatchPairsMode, type MatchPairsOpponent,
  type MatchPairsOpponentSelection, type MatchPairsStake, type MatchPairsState,
} from "@lucky-arcade/match-pairs";
import { MatchPairsScreen } from "@lucky-arcade/match-pairs/react";
import { ENGINE_VERSION, leveragedWagerCredit, makeReceipt, resultHash, wagerExposure, wagerMultiplierFromExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt, MatchRecord, PredictionMultiplier, PredictionStake, SpectatorPrediction } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { appendAction, appendMatchRecord, listMatchRecordsForSession, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { invalidatePrediction, listPredictions, reservePrediction, settlePrediction } from "../../lib/wager.ts";
import { readWallet } from "../../lib/wallet.ts";
import { summarizeOpponentRecords, type OpponentRecordSummary } from "../../lib/opponent-records.ts";
import { useCasinoOpponentAvailability } from "../casino-ledger/use-casino-opponent-availability.ts";
import { TEMEROSA_MATCH_PAIRS_LINES } from "./temerosa-match-pairs-lines.ts";
import { createTemerosaMatchPairsOpponents } from "./temerosa-match-pairs-opponents.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "./temerosa-match-pairs-selection.ts";

const CABINET_ID = "temerosa-match-pairs";
const SESSION = "temerosa-match-pairs:versus-2";

interface ReadyMatchPairs {
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  opponents: readonly MatchPairsOpponent[];
  lines: readonly MatchPairsLine[];
  state: MatchPairsState;
  multiplier: WagerMultiplier;
}

interface WagerIdentity { seed: string; difficulty: MatchPairsDifficulty; focus: MatchPairsFocus; opponentIds: MatchPairsOpponentSelection; }

export default function MatchPairsView({ onExit }: { onExit(): void }) {
  const availability = useCasinoOpponentAvailability(SESSION);
  const [ready, setReady] = useState<ReadyMatchPairs | null>(null);
  const [balance, setBalance] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [activePrediction, setActivePrediction] = useState<SpectatorPrediction | null>(null);
  const [opponentRecords, setOpponentRecords] = useState<Readonly<Record<string, OpponentRecordSummary>>>({});
  const stateRef = useRef<MatchPairsState | null>(null), opponentsRef = useRef<readonly MatchPairsOpponent[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), readWallet(), listPredictions()]).then(async ([bundle, wallet, predictions]) => {
      for (const face of TEMEROSA_MATCH_PAIRS_FACES) if (!bundle.assets[face.assetId]) throw new Error(`match_pairs_asset_missing:${face.assetId}`);
      const opponents = createTemerosaMatchPairsOpponents(bundle.contentAssets);
      if (opponents.length !== 30) throw new Error(`match_pairs_opponent_count:${opponents.length}`);
      if (TEMEROSA_MATCH_PAIRS_LINES.length > 0) validateMatchPairsLines(TEMEROSA_MATCH_PAIRS_LINES, opponents.map((opponent) => opponent.id));
      for (const opponent of opponents) for (const assetId of [...Object.values(opponent.portraits), opponent.despairPortrait]) if (!bundle.assets[assetId]) throw new Error(`match_pairs_opponent_asset_missing:${assetId}`);
      const first = opponents[0]; if (!first) throw new Error("match_pairs_opponent_missing");
      const recovered = await recoverSession<MatchPairsState, MatchPairsAction>({
        sessionId: SESSION,
        fresh: createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, dailySeed(), "easy", first.id, SESSION),
        cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        isState: (value): value is MatchPairsState => isMatchPairsState(value) && value.packVersion === TEMEROSA_MATCH_PAIRS_PACK_VERSION
          && selectedIds(value).every((id) => opponents.some((opponent) => opponent.id === id)),
        reduce: (state, action) => reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, state, action),
      });
      let state = recovered.state, nextBalance = wallet.balance;
      const wagers = await listWagers(SESSION), reserved = wagers.filter((receipt) => receipt.status === "reserved");
      const pending = reserved.find((receipt) => receipt.termsVersion === MATCH_PAIRS_TERMS_VERSION && validIdentity(receipt, opponents));
      for (const receipt of reserved) if (receipt !== pending) nextBalance = (await invalidateWager({ wagerId: receipt.wagerId, reason: receipt.termsVersion === MATCH_PAIRS_TERMS_VERSION ? "corrupt-state" : "version-mismatch" })).wallet.balance;
      const pendingIdentity = pending ? identityFromReceipt(pending) : null;
      if (pending && pendingIdentity && (state.mode !== "play" || state.wagerId !== pending.wagerId || !stateMatchesIdentity(state, pendingIdentity))) {
        const identity = pendingIdentity;
        const fresh = createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, identity.seed, identity.difficulty, identity.opponentIds.npc, SESSION, "play", undefined, identity.focus);
        const action: MatchPairsAction = { type: "start", seed: identity.seed, stake: pending.stake as MatchPairsStake, wagerId: pending.wagerId };
        state = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, fresh, action); await persistState(fresh, state, action, opponents);
      }
      if (pending && state.mode === "play" && state.wagerId === pending.wagerId && state.status === "complete") {
        nextBalance = (await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: matchPairsResultHash(state), creditAmount: leveragedCredit(state, pending) })).wallet.balance;
        await recordMatch(state, opponents, null);
      }
      let prediction = predictions.find((item) => item.outcomeKey === predictionOutcomeKey(state)) ?? null;
      for (const item of predictions) if (item.status === "reserved" && item.outcomeKey.startsWith(`${CABINET_ID}|`) && item.outcomeKey !== predictionOutcomeKey(state)) {
        nextBalance = (await invalidatePrediction({ predictionId: item.predictionId, reason: "outcome-unavailable" })).wallet.balance;
      }
      if (prediction?.status === "reserved" && state.mode === "spectate" && state.status === "complete") {
        prediction = await settleSpectatorMatch(state, prediction); nextBalance = (await readWallet()).balance;
      }
      const restoredReceipt = state.wagerId ? wagers.find((receipt) => receipt.wagerId === state.wagerId) : undefined;
      if (!pending && state.mode === "play" && state.status === "complete" && restoredReceipt?.status === "settled") await recordMatch(state, opponents, null);
      if (state.mode === "spectate" && state.status === "complete" && prediction && prediction.status !== "reserved") await recordMatch(state, opponents, prediction);
      if (!alive) return;
      stateRef.current = state; opponentsRef.current = opponents; setBalance(nextBalance); setActivePrediction(prediction);
      setOpponentRecords(summarizeOpponentRecords(await listMatchRecordsForSession(SESSION, 200)));
      const activeReceipt = pending ?? restoredReceipt;
      setReady({ assets: bundle.assets, thumbAssets: bundle.thumbAssets, opponents, lines: TEMEROSA_MATCH_PAIRS_LINES, state,
        multiplier: activeReceipt && validIdentity(activeReceipt, opponents) ? wagerMultiplierFromExposure(activeReceipt.stake, activeReceipt.reservedAmount) : prediction?.multiplier ?? 2 });
      availability.holdOpponents(selectedIds(state));
    }).catch(() => { if (alive) setError("짝맞추기 이미지를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  async function start(input: { mode: MatchPairsMode; stake: MatchPairsStake; multiplier: WagerMultiplier; predictedCharacterId?: string }): Promise<MatchPairsState> {
    const current = stateRef.current, opponents = opponentsRef.current;
    if (!current || busy || current.status !== "ready" || current.mode !== input.mode) throw new Error("match_pairs_not_ready");
    if (selectedIds(current).some((id) => availability.opponents[id]?.available === false)) throw new Error("casino_opponent_busy");
    setBusy(true); setError("");
    try {
      const seed = `${dailySeed()}:deal:${crypto.randomUUID()}`;
      let action: MatchPairsAction;
      if (current.mode === "play") {
        const identity: WagerIdentity = { seed, difficulty: current.difficulty, focus: current.focus, opponentIds: current.opponentIds };
        const transaction = await reserveWager({ outcomeKey: `${MATCH_PAIRS_TERMS_VERSION}:${seed}`, cabinetId: CABINET_ID, sessionId: SESSION, termsVersion: MATCH_PAIRS_TERMS_VERSION, choiceKey: choiceKey(identity), stake: input.stake, reservedAmount: wagerExposure(input.stake, input.multiplier) });
        setBalance(transaction.wallet.balance); action = { type: "start", seed, stake: input.stake, wagerId: transaction.wager.wagerId };
      } else {
        if (!input.predictedCharacterId || !selectedIds(current).includes(input.predictedCharacterId)) throw new Error("match_pairs_prediction_target_invalid");
        const outcomeKey = predictionOutcomeKey({ ...current, seed });
        const transaction = await reservePrediction({ outcomeKey, market: "first-place", predictedCharacterId: input.predictedCharacterId, stake: input.stake as PredictionStake, multiplier: input.multiplier as PredictionMultiplier });
        setBalance(transaction.wallet.balance); setActivePrediction(transaction.prediction); action = { type: "start", seed };
      }
      const next = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, current, action);
      stateRef.current = next; setReady((value) => value ? { ...value, state: next, multiplier: input.multiplier } : value);
      await persistState(current, next, action, opponents); setBusy(false); return next;
    } catch (cause) {
      setBusy(false); setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "대국을 시작하지 못했습니다. 예약이 남았다면 다시 입장할 때 복구됩니다."); throw cause;
    }
  }

  async function persist(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction): Promise<void> {
    const opponents = opponentsRef.current; await persistState(previous, next, action, opponents); stateRef.current = next;
    if (previous.status === "complete" || next.status !== "complete") return;
    try {
      if (next.mode === "play") {
        if (!next.wagerId) throw new Error("match_pairs_wager_missing");
        const receipt = (await listWagers(SESSION)).find((candidate) => candidate.wagerId === next.wagerId); if (!receipt) throw new Error("match_pairs_wager_receipt_missing");
        setBalance((await settleWager({
          wagerId: next.wagerId,
          settlementSequence: next.sequence,
          resultKey: matchPairsResultHash(next),
          creditAmount: leveragedCredit(next, receipt),
        })).wallet.balance);
        await recordMatch(next, opponents, null);
      } else {
        const prediction = (await listPredictions()).find((candidate) => candidate.outcomeKey === predictionOutcomeKey(next) && candidate.status === "reserved");
        if (!prediction) throw new Error("match_pairs_prediction_missing");
        const settled = await settleSpectatorMatch(next, prediction); setActivePrediction(settled); setBalance((await readWallet()).balance); await recordMatch(next, opponents, settled);
      }
      setOpponentRecords(summarizeOpponentRecords(await listMatchRecordsForSession(SESSION, 200)));
    } catch { setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 영수증으로 처리합니다."); throw new Error("match_pairs_settlement_pending"); }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || "짝맞추기 테이블을 준비하고 있어요…"}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <MatchPairsScreen faces={TEMEROSA_MATCH_PAIRS_FACES} opponents={ready.opponents} assets={ready.assets} thumbAssets={ready.thumbAssets}
    lines={ready.lines} packVersion={TEMEROSA_MATCH_PAIRS_PACK_VERSION} seed={ready.state.seed} sessionId={SESSION} initialState={ready.state}
    initialMultiplier={ready.multiplier} walletBalance={balance} busy={busy} wagerError={error} activePrediction={activePrediction}
    opponentAvailability={availability.opponents} opponentRecords={opponentRecords}
    onOpponentSelectionChange={(ids) => availability.holdOpponents(ids)} onStart={start} onTransition={persist} onExit={onExit} />;
}

async function persistState(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction, opponents: readonly MatchPairsOpponent[]): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.attempts, resultHash(previous), next); await appendAction(SESSION, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION },
    { contract: "recent-play/0.1", cabinetId: CABINET_ID, sessionId: SESSION, title: "짝맞추기", progressLabel: progressLabel(next, opponents), updatedAt: new Date().toISOString() });
}

async function settleSpectatorMatch(state: MatchPairsState, prediction: SpectatorPrediction): Promise<SpectatorPrediction> {
  if (state.outcome === "draw") return (await invalidatePrediction({ predictionId: prediction.predictionId, reason: "outcome-unavailable" })).prediction;
  const winningCharacterId = state.outcome ? state.opponentIds[state.outcome] : null;
  if (!winningCharacterId) throw new Error("match_pairs_winner_missing");
  return (await settlePrediction({ predictionId: prediction.predictionId, winningCharacterId })).prediction;
}

async function recordMatch(state: MatchPairsState, opponents: readonly MatchPairsOpponent[], prediction: SpectatorPrediction | null): Promise<void> {
  const name = (id: string | null) => opponents.find((candidate) => candidate.id === id)?.name ?? id ?? "플레이어";
  const playerWon = state.outcome === "player", npcWon = state.outcome === "npc";
  const standings = state.mode === "play" ? [
    { seatId: "player", participantId: "player", displayName: "플레이어", rank: playerWon ? 1 : npcWon ? 2 : 1, isPlayer: true },
    { seatId: "npc", participantId: state.opponentIds.npc, displayName: name(state.opponentIds.npc), rank: npcWon ? 1 : playerWon ? 2 : 1, isPlayer: false },
  ] : (["player", "npc"] as const).map((actor) => ({ seatId: actor, participantId: state.opponentIds[actor]!, displayName: name(state.opponentIds[actor]), rank: state.outcome === "draw" || state.outcome === actor ? 1 : 2, isPlayer: false }));
  const record: MatchRecord = { contract: "match-record/0.1", recordId: `${SESSION}#${MATCH_PAIRS_VERSION}#${state.seed}#${state.sequence}`, cabinetId: CABINET_ID, cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION, sessionId: SESSION, sequence: state.sequence, seed: state.seed, completedAt: new Date().toISOString(), turns: state.turnNumber, standings,
    outcome: state.mode === "spectate" ? "spectated" : playerWon ? "win" : npcWon ? "loss" : "draw", resultHash: matchPairsResultHash(state),
    ...(prediction && prediction.status !== "refunded" ? { wager: { market: prediction.market, predictedCharacterId: prediction.predictedCharacterId, stake: prediction.stake, multiplier: prediction.multiplier, reservedAmount: prediction.reservedAmount, won: prediction.status === "won" } } : {}) };
  await appendMatchRecord(record); await pruneMatchRecords(200);
}

function progressLabel(state: MatchPairsState, opponents: readonly MatchPairsOpponent[]): string {
  const label = (actor: "player" | "npc") => actor === "player" && state.mode === "play" ? "나" : opponents.find((item) => item.id === state.opponentIds[actor])?.name ?? "NPC";
  if (state.status === "ready") return state.mode === "spectate" ? `${label("player")} 대 ${label("npc")} · 관전 준비` : `${label("npc")} · 게임 준비`;
  if (state.status === "complete") return `${label("player")} ${state.claims.player.length} : ${state.claims.npc.length} ${label("npc")} · 대국 완료`;
  return `${label("player")} ${state.claims.player.length} : ${state.claims.npc.length} ${label("npc")} · ${label(state.currentTurn)} 차례`;
}

function selectedIds(state: Pick<MatchPairsState, "opponentIds">): string[] { return [state.opponentIds.player, state.opponentIds.npc].filter((id): id is string => Boolean(id)); }
function predictionOutcomeKey(state: Pick<MatchPairsState, "seed" | "mode" | "difficulty" | "focus" | "opponentIds">): string { return state.mode === "spectate" ? [CABINET_ID, TEMEROSA_MATCH_PAIRS_PACK_VERSION, state.seed, state.difficulty, state.focus, state.opponentIds.player, state.opponentIds.npc].join("|") : ""; }
function choiceKey(identity: WagerIdentity): string { return `deal:${JSON.stringify(identity)}`; }
function identityFromReceipt(receipt: GameWagerReceipt): WagerIdentity | null { if (!receipt.choiceKey?.startsWith("deal:")) return null; try { const value = JSON.parse(receipt.choiceKey.slice(5)) as Partial<WagerIdentity>; const ids = value.opponentIds as Partial<MatchPairsOpponentSelection> | undefined; return typeof value.seed === "string" && (value.difficulty === "easy" || value.difficulty === "normal") && (value.focus === "relaxed" || value.focus === "standard" || value.focus === "sharp") && ids?.player === null && typeof ids.npc === "string" ? { seed: value.seed, difficulty: value.difficulty, focus: value.focus, opponentIds: { player: null, npc: ids.npc } } : null; } catch { return null; } }
function validIdentity(receipt: GameWagerReceipt, opponents: readonly MatchPairsOpponent[]): boolean { const identity = identityFromReceipt(receipt); try { wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount); } catch { return false; } return Boolean(identity && receipt.cabinetId === CABINET_ID && (receipt.stake === 10 || receipt.stake === 50 || receipt.stake === 200) && opponents.some((opponent) => opponent.id === identity.opponentIds.npc)); }
function stateMatchesIdentity(state: MatchPairsState, identity: WagerIdentity): boolean { return state.seed === identity.seed && state.difficulty === identity.difficulty && state.focus === identity.focus && state.opponentIds.player === null && state.opponentIds.npc === identity.opponentIds.npc; }
function leveragedCredit(state: MatchPairsState, receipt: GameWagerReceipt): number { return leveragedWagerCredit(state.stake ?? receipt.stake, state.creditAmount, wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount)); }
function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
