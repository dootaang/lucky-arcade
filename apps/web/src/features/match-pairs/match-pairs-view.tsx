import {
  MATCH_PAIRS_CHALLENGE_REWARD_VERSION,
  MATCH_PAIRS_SPREAD_TERMS_VERSION,
  MATCH_PAIRS_VERSION,
  createMatchPairsState,
  isMatchPairsState,
  matchPairsChallengeReward,
  matchPairsPerformance,
  matchPairsResultHash,
  matchPairsSpreadChoiceKey,
  matchPairsSpreadCovered,
  parseMatchPairsSpreadChoice,
  reduceMatchPairs,
  type MatchPairsAction,
  type MatchPairsEntryKind,
  type MatchPairsMode,
  type MatchPairsOpponent,
  type MatchPairsSpreadChoice,
  type MatchPairsSpreadQuote,
  type MatchPairsStake,
  type MatchPairsState,
} from "@lucky-arcade/match-pairs";
import { MatchPairsScreen } from "@lucky-arcade/match-pairs/react";
import { ENGINE_VERSION, XorShift32, makeReceipt, resultHash, wagerExposure, wagerMultiplierFromExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import { TEMEROSA_HOUSE_ACCOUNT_ID, legacyCabinetNpcId } from "@lucky-arcade/casino-ledger";
import type { GameWagerReceipt, MatchRecord, PredictionMultiplier, PredictionStake } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { casinoCounterpartyContext, casinoCurrentSecond } from "../../lib/casino-economy.ts";
import { appendAction, appendMatchRecord, grantCompletionPoints, listMatchRecordsForSession, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { loadTemerosaSeriesGameRoster, seriesGameAssetMap } from "../../lib/temerosa-series-game-roster.ts";
import { readWallet } from "../../lib/wallet.ts";
import { summarizeOpponentRecords, type OpponentRecordSummary } from "../../lib/opponent-records.ts";
import { useCasinoOpponentAvailability } from "../casino-ledger/use-casino-opponent-availability.ts";
import { TEMEROSA_MATCH_PAIRS_LINES } from "./temerosa-match-pairs-lines.ts";
import { createTemerosaSeriesMatchPairsOpponents } from "./temerosa-match-pairs-opponents.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "./temerosa-match-pairs-selection.ts";
import { TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES } from "./temerosa-match-pairs-spreads.generated.ts";

const CABINET_ID = "temerosa-match-pairs";
const SESSION = "temerosa-match-pairs:versus-3";
const LEGACY_SESSION = "temerosa-match-pairs:versus-2";
const MATCH_PAIRS_CHALLENGE_ENABLED = true;
const MATCH_PAIRS_SPREAD_WAGERING_ENABLED = true;

interface ReadyMatchPairs {
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  opponents: readonly MatchPairsOpponent[];
  state: MatchPairsState;
  multiplier: WagerMultiplier;
}

export default function MatchPairsView({ onExit }: { onExit(): void }) {
  const availability = useCasinoOpponentAvailability(SESSION);
  const [ready, setReady] = useState<ReadyMatchPairs | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completionAward, setCompletionAward] = useState<number | null>(null);
  const [opponentRecords, setOpponentRecords] = useState<Readonly<Record<string, OpponentRecordSummary>>>({});
  const stateRef = useRef<MatchPairsState | null>(null);
  const opponentsRef = useRef<readonly MatchPairsOpponent[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), readWallet()]).then(async ([bundle, wallet]) => {
      for (const face of TEMEROSA_MATCH_PAIRS_FACES) if (!bundle.assets[face.assetId]) throw new Error(`match_pairs_asset_missing:${face.assetId}`);
      const fallback=Object.values(bundle.assets)[0];if(!fallback)throw new Error("match_pairs_fallback_missing");
      const seriesRoster=await loadTemerosaSeriesGameRoster(fallback),seriesAssets=seriesGameAssetMap(seriesRoster);
      const opponents = createTemerosaSeriesMatchPairsOpponents(seriesRoster);
      if (opponents.length < 100) throw new Error(`match_pairs_opponent_count:${opponents.length}`);
      const first = opponents[0];
      if (!first) throw new Error("match_pairs_opponent_missing");
      const recovered = await recoverSession<MatchPairsState, MatchPairsAction>({
        sessionId: SESSION,
        fresh: createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, dailySeed(), "easy", first.id, SESSION),
        cabinetVersion: MATCH_PAIRS_VERSION,
        packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        isState: (value): value is MatchPairsState => isMatchPairsState(value) && value.packVersion === TEMEROSA_MATCH_PAIRS_PACK_VERSION
          && selectedIds(value).every((id) => opponents.some((opponent) => opponent.id === id)),
        reduce: (state, action) => reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, state, action),
      });
      let state = recovered.state;
      let nextBalance = wallet.balance;
      const allWagers = await listWagers();
      for (const receipt of allWagers.filter((candidate) => candidate.cabinetId === CABINET_ID && candidate.sessionId === LEGACY_SESSION && candidate.status === "reserved")) {
        nextBalance = (await invalidateWager({ wagerId: receipt.wagerId, reason: "version-mismatch" })).wallet.balance;
      }
      const wagers = allWagers.filter((receipt) => receipt.sessionId === SESSION);
      const reserved = wagers.filter((receipt) => receipt.status === "reserved");
      const pending = reserved.find((receipt) => validSpreadReceipt(receipt, opponents));
      for (const receipt of reserved) if (receipt !== pending) {
        nextBalance = (await invalidateWager({ wagerId: receipt.wagerId, reason: receipt.termsVersion === MATCH_PAIRS_SPREAD_TERMS_VERSION ? "corrupt-state" : "version-mismatch" })).wallet.balance;
      }
      const choice = pending ? parseMatchPairsSpreadChoice(pending.choiceKey) : null;
      if (pending && choice && !stateMatchesChoice(state, choice, pending.wagerId)) {
        const fresh = createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, choice.seed, choice.difficulty, choice.opponentId, SESSION, "play", undefined, choice.focus, "spread-wager");
        const action: MatchPairsAction = { type: "start", seed: choice.seed, stake: pending.stake as MatchPairsStake, wagerId: pending.wagerId };
        state = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, fresh, action);
        await persistState(fresh, state, action, opponents);
      }
      if (pending && state.status === "complete") nextBalance = (await settleSpread(state, pending)).wallet.balance;
      if (state.status === "complete" && state.entryKind === "house-challenge") {
        const expected = matchPairsChallengeReward(state);
        nextBalance = (await grantChallenge(state, expected)).wallet.balance;
        setCompletionAward(expected);
      }
      const restoredReceipt = state.wagerId ? wagers.find((receipt) => receipt.wagerId === state.wagerId) : undefined;
      if (state.status === "complete") await recordMatch(state, opponents, restoredReceipt ?? pending ?? null, completionFor(state));
      if (!alive) return;
      stateRef.current = state;
      opponentsRef.current = opponents;
      setBalance(nextBalance);
      setOpponentRecords(summarizeOpponentRecords(await listMatchRecordsForSession(SESSION, 200)));
      setReady({ assets: Object.freeze({...bundle.assets,...seriesAssets}), thumbAssets: Object.freeze({...bundle.thumbAssets,...seriesAssets}), opponents, state, multiplier: pending ? wagerMultiplierFromExposure(pending.stake, pending.reservedAmount) : 2 });
      availability.holdOpponents(selectedIds(state));
    }).catch(() => { if (alive) setError("짝맞추기 테이블을 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  async function start(input: { mode: MatchPairsMode; entryKind: MatchPairsEntryKind; stake: MatchPairsStake; multiplier: WagerMultiplier }): Promise<MatchPairsState> {
    const current = stateRef.current;
    const opponents = opponentsRef.current;
    if (!current || busy || current.status !== "ready" || current.mode !== input.mode || current.entryKind !== input.entryKind) throw new Error("match_pairs_not_ready");
    setBusy(true);
    setError("");
    setCompletionAward(null);
    try {
      const seed = `${dailySeed()}:deal:${crypto.randomUUID()}`;
      let prepared = current;
      if (current.mode === "play" && current.entryKind === "house-challenge") {
        const available = opponents.filter((candidate) => availability.opponents[candidate.id]?.available !== false).sort((a, b) => a.id.localeCompare(b.id));
        if (available.length === 0) throw new Error("casino_opponent_busy");
        const selected = available[new XorShift32(`${seed}:house-challenge`).nextUint32() % available.length]!;
        if (selected.id !== prepared.opponentIds.npc) {
          const selectAction: MatchPairsAction = { type: "select-opponent", opponentId: selected.id, actor: "npc" };
          const selectedState = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, prepared, selectAction);
          await persistState(prepared, selectedState, selectAction, opponents);
          prepared = selectedState;
        }
      } else if (selectedIds(current).some((id) => availability.opponents[id]?.available === false)) throw new Error("casino_opponent_busy");

      let action: MatchPairsAction;
      if (prepared.mode === "play" && prepared.entryKind === "spread-wager") {
        const quote = quoteFor(prepared);
        if (!quote?.available) throw new Error("match_pairs_spread_unavailable");
        const reservedAmount = wagerExposure(input.stake, input.multiplier);
        const choice: MatchPairsSpreadChoice = { seed, quoteId: quote.quoteId, pricingVersion: quote.pricingVersion, opponentId: quote.opponentId, difficulty: quote.difficulty, focus: quote.focus, targetScore: quote.targetScore };
        const counterparty = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID);
        const transaction = await reserveWager({
          outcomeKey: `${MATCH_PAIRS_SPREAD_TERMS_VERSION}:${seed}`,
          cabinetId: CABINET_ID,
          sessionId: SESSION,
          termsVersion: MATCH_PAIRS_SPREAD_TERMS_VERSION,
          choiceKey: matchPairsSpreadChoiceKey(choice),
          stake: input.stake,
          reservedAmount,
          ...counterparty,
          counterpartyReservedAmount: reservedAmount,
        });
        setBalance(transaction.wallet.balance);
        action = { type: "start", seed, stake: input.stake, wagerId: transaction.wager.wagerId };
      } else action = { type: "start", seed };
      const next = reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, prepared, action);
      await persistState(prepared, next, action, opponents);
      stateRef.current = next;
      availability.holdOpponents(selectedIds(next));
      setReady((value) => value ? { ...value, state: next, multiplier: input.multiplier } : value);
      setBusy(false);
      return next;
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다."
        : cause instanceof Error && cause.message === "casino_counterparty_insufficient_points" ? "하우스가 최대 지급액을 준비하지 못했습니다."
          : "대국을 시작하지 못했습니다. 예약이 남았다면 다시 입장할 때 복구됩니다.");
      throw cause;
    }
  }

  async function persist(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction): Promise<void> {
    const opponents = opponentsRef.current;
    await persistState(previous, next, action, opponents);
    stateRef.current = next;
    if (next.status === "ready") setCompletionAward(null);
    if (previous.status === "complete" || next.status !== "complete") return;
    try {
      let receipt: GameWagerReceipt | null = null;
      let award: number | null = null;
      if (next.entryKind === "spread-wager") {
        receipt = (await listWagers(SESSION)).find((candidate) => candidate.wagerId === next.wagerId) ?? null;
        if (!receipt) throw new Error("match_pairs_wager_receipt_missing");
        setBalance((await settleSpread(next, receipt)).wallet.balance);
      } else if (next.entryKind === "house-challenge") {
        award = matchPairsChallengeReward(next);
        const granted = await grantChallenge(next, award);
        setBalance(granted.wallet.balance);
        setCompletionAward(award);
      }
      await recordMatch(next, opponents, receipt, award);
      setOpponentRecords(summarizeOpponentRecords(await listMatchRecordsForSession(SESSION, 200)));
    } catch {
      setError("결과는 보존됐지만 정산이 남았습니다. 다시 들어오면 같은 기록으로 처리합니다.");
      throw new Error("match_pairs_settlement_pending");
    }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || "짝맞추기 테이블을 준비하고 있어요…"}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  const seriesLines=ready.opponents.flatMap((opponent)=>{const legacyId=legacyCabinetNpcId(opponent.id);return legacyId?TEMEROSA_MATCH_PAIRS_LINES.filter((line)=>line.characterId===legacyId).map((line)=>({...line,id:`${opponent.id}:${line.event}`,characterId:opponent.id})):[];});
  return <MatchPairsScreen
    faces={TEMEROSA_MATCH_PAIRS_FACES}
    opponents={ready.opponents}
    assets={ready.assets}
    thumbAssets={ready.thumbAssets}
    lines={seriesLines}
    packVersion={TEMEROSA_MATCH_PAIRS_PACK_VERSION}
    seed={ready.state.seed}
    sessionId={SESSION}
    initialState={ready.state}
    initialMultiplier={ready.multiplier}
    walletBalance={balance}
    wageringEnabled={MATCH_PAIRS_SPREAD_WAGERING_ENABLED}
    challengeEnabled={MATCH_PAIRS_CHALLENGE_ENABLED}
    spreadQuotes={TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES}
    completionAward={completionAward}
    busy={busy}
    wagerError={error}
    opponentAvailability={availability.opponents}
    opponentRecords={opponentRecords}
    onOpponentSelectionChange={(ids) => availability.holdOpponents(ids)}
    onStart={start}
    onTransition={persist}
    onExit={onExit}
  />;
}

function quoteFor(state: Pick<MatchPairsState, "opponentIds" | "difficulty" | "focus">): MatchPairsSpreadQuote | null {
  return TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.find((quote) => quote.opponentId === state.opponentIds.npc && quote.difficulty === state.difficulty && quote.focus === state.focus) ?? null;
}

function validSpreadReceipt(receipt: GameWagerReceipt, opponents: readonly MatchPairsOpponent[]): boolean {
  if (receipt.termsVersion !== MATCH_PAIRS_SPREAD_TERMS_VERSION || receipt.cabinetId !== CABINET_ID || receipt.sessionId !== SESSION || ![10, 50, 200].includes(receipt.stake)) return false;
  const choice = parseMatchPairsSpreadChoice(receipt.choiceKey);
  if (!choice || !opponents.some((opponent) => opponent.id === choice.opponentId)) return false;
  const quote = TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.find((candidate) => candidate.quoteId === choice.quoteId);
  if (!quote?.available || quote.targetScore !== choice.targetScore || quote.pricingVersion !== choice.pricingVersion) return false;
  try { wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount); } catch { return false; }
  return true;
}

function stateMatchesChoice(state: MatchPairsState, choice: MatchPairsSpreadChoice, wagerId: string): boolean {
  return state.mode === "play" && state.entryKind === "spread-wager" && state.wagerId === wagerId && state.seed === choice.seed
    && state.opponentIds.npc === choice.opponentId && state.difficulty === choice.difficulty && state.focus === choice.focus;
}

async function settleSpread(state: MatchPairsState, receipt: GameWagerReceipt) {
  const choice = parseMatchPairsSpreadChoice(receipt.choiceKey);
  const quote = choice && TEMEROSA_MATCH_PAIRS_SPREAD_QUOTES.find((candidate) => candidate.quoteId === choice.quoteId && candidate.targetScore === choice.targetScore);
  if (!quote) throw new Error("match_pairs_spread_quote_missing");
  const covered = matchPairsSpreadCovered(state, quote);
  return settleWager({ wagerId: receipt.wagerId, settlementSequence: state.sequence, resultKey: `${matchPairsResultHash(state)}:${covered ? "cover" : "miss"}`, creditAmount: covered ? receipt.reservedAmount * 2 : 0 });
}

function grantChallenge(state: MatchPairsState, amount: number) {
  return casinoCurrentSecond().then((casinoOccurredAtSecond) => grantCompletionPoints({ sessionId: `${state.sessionId}:${MATCH_PAIRS_CHALLENGE_REWARD_VERSION}`, sequence: state.sequence, cabinetId: CABINET_ID, spectated: false, amount, casinoOccurredAtSecond }));
}

function completionFor(state: MatchPairsState): number | null {
  return state.entryKind === "house-challenge" ? matchPairsChallengeReward(state) : null;
}

async function persistState(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction, opponents: readonly MatchPairsOpponent[]): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.attempts, resultHash(previous), next);
  await appendAction(SESSION, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION },
    { contract: "recent-play/0.1", cabinetId: CABINET_ID, sessionId: SESSION, title: "짝맞추기", progressLabel: progressLabel(next, opponents), updatedAt: new Date().toISOString() });
}

async function recordMatch(state: MatchPairsState, opponents: readonly MatchPairsOpponent[], receipt: GameWagerReceipt | null, challengeAward: number | null): Promise<void> {
  const name = (id: string | null) => opponents.find((candidate) => candidate.id === id)?.name ?? id ?? "플레이어";
  const playerWon = state.outcome === "player";
  const npcWon = state.outcome === "npc";
  const standings = state.mode === "play" ? [
    { seatId: "player", participantId: "player", displayName: "플레이어", rank: playerWon ? 1 : npcWon ? 2 : 1, isPlayer: true },
    { seatId: "npc", participantId: state.opponentIds.npc, displayName: name(state.opponentIds.npc), rank: npcWon ? 1 : playerWon ? 2 : 1, isPlayer: false },
  ] : (["player", "npc"] as const).map((actor) => ({ seatId: actor, participantId: state.opponentIds[actor]!, displayName: name(state.opponentIds[actor]), rank: state.outcome === "draw" || state.outcome === actor ? 1 : 2, isPlayer: false }));
  const quote = receipt ? quoteFor(state) : null;
  const multiplier = receipt ? wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount) : null;
  const covered = quote ? matchPairsSpreadCovered(state, quote) : false;
  const performance = matchPairsPerformance(state);
  const record: MatchRecord = {
    contract: "match-record/0.1",
    recordId: `${SESSION}#${MATCH_PAIRS_VERSION}#${state.seed}#${state.sequence}`,
    cabinetId: CABINET_ID,
    cabinetVersion: MATCH_PAIRS_VERSION,
    packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
    sessionId: SESSION,
    sequence: state.sequence,
    seed: state.seed,
    completedAt: new Date().toISOString(),
    turns: state.turnNumber,
    standings,
    outcome: state.mode === "spectate" ? "spectated" : playerWon ? "win" : npcWon ? "loss" : "draw",
    resultHash: matchPairsResultHash(state),
    matchPairs: { entryKind: state.entryKind, performanceScore: performance.performanceScore, attempts: performance.attempts, challengeAward: challengeAward ?? 0, ...(quote ? { targetScore: quote.targetScore } : {}) },
    ...(receipt && multiplier ? { wager: { predictedCharacterId: "player", stake: receipt.stake as PredictionStake, multiplier: multiplier as PredictionMultiplier, reservedAmount: receipt.reservedAmount, won: covered, termsVersion: receipt.termsVersion, ...(quote ? { targetScore: quote.targetScore } : {}), actualScore: performance.performanceScore } } : {}),
  };
  await appendMatchRecord(record);
  await pruneMatchRecords(200);
}

function progressLabel(state: MatchPairsState, opponents: readonly MatchPairsOpponent[]): string {
  const label = (actor: "player" | "npc") => actor === "player" && state.mode === "play" ? "나" : opponents.find((item) => item.id === state.opponentIds[actor])?.name ?? "NPC";
  if (state.status === "ready") return state.mode === "spectate" ? `${label("player")} 대 ${label("npc")} · 관전 준비` : `${label("npc")} · 게임 준비`;
  if (state.status === "complete") return `${label("player")} ${state.claims.player.length} : ${state.claims.npc.length} ${label("npc")} · 대국 완료`;
  return `${label("player")} ${state.claims.player.length} : ${state.claims.npc.length} ${label("npc")} · ${label(state.currentTurn)} 차례`;
}

function selectedIds(state: Pick<MatchPairsState, "opponentIds">): string[] { return [state.opponentIds.player, state.opponentIds.npc].filter((id): id is string => Boolean(id)); }
function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
