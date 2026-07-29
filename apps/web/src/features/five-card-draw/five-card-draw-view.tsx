import {
  FIVE_CARD_DRAW_CONTRACT,
  FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS,
  FIVE_CARD_DRAW_TERMS_VERSION,
  continueFiveCardDrawSeries,
  createFiveCardDrawSeries,
  createFiveCardDrawState,
  endFiveCardDrawSeries,
  fiveCardDrawSeriesStats,
  fiveCardDrawSessionRead,
  isFiveCardDrawState,
  isFiveCardDrawSeriesState,
  recordFiveCardDrawSeriesHand,
  reduceFiveCardDraw,
  type FiveCardDrawAction,
  type FiveCardDrawOpponent,
  type FiveCardDrawStake,
  type FiveCardDrawState,
  type FiveCardDrawSeriesLength,
  type FiveCardDrawSeriesState,
} from "@lucky-arcade/five-card-draw";
import { FiveCardDrawScreen, type FiveCardDrawOpponentView } from "@lucky-arcade/five-card-draw/react";
import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import type { MatchRecord } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { appendMatchRecord, pruneMatchRecords } from "../../lib/database.ts";
import { createTemerosaFiveCardDrawOpponents } from "./temerosa-five-card-draw-opponents.ts";
import { TEMEROSA_FIVE_CARD_DRAW_LINES } from "./temerosa-five-card-draw-lines.ts";

const STORAGE_KEY = `${FIVE_CARD_DRAW_TERMS_VERSION}:envelope`;
const BEGINNER_KEY = `${FIVE_CARD_DRAW_TERMS_VERSION}:beginner`;
const INITIAL_BALANCE = 2_000;

interface PreviewEnvelope {
  contract: typeof FIVE_CARD_DRAW_TERMS_VERSION;
  balance: number;
  state: FiveCardDrawState;
  settledResultIds: readonly string[];
  series: FiveCardDrawSeriesState | null;
  recordedSeriesIds: readonly string[];
}

interface Ready {
  envelope: PreviewEnvelope;
  opponents: readonly FiveCardDrawOpponentView[];
  atlas: Awaited<ReturnType<typeof loadPlayingCardAtlas>>;
}

export default function FiveCardDrawView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [beginner, setBeginner] = useState(() => readBeginner());
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const readyRef = useRef<Ready | null>(null);
  const advancingRef = useRef(false);
  const recordingRef = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), loadPlayingCardAtlas()]).then(([bundle, atlas]) => {
      const opponents = createTemerosaFiveCardDrawOpponents(bundle.contentAssets).map((opponent): FiveCardDrawOpponentView => {
        const portraits = Object.fromEntries(Object.entries(opponent.portraitAssetIds).map(([tell, assetId]) => {
          const portrait = bundle.assets[assetId];
          if (!portrait) throw new Error(`five_card_draw_portrait_missing:${assetId}`);
          return [tell, portrait];
        })) as NonNullable<FiveCardDrawOpponentView["portraits"]>;
        const detailPortraits = Object.fromEntries(Object.entries(opponent.portraitAssetIds).map(([tell, assetId]) => [
          tell, bundle.detailAssets[assetId] ?? bundle.assets[assetId],
        ])) as NonNullable<FiveCardDrawOpponentView["detailPortraits"]>;
        return { id: opponent.id, name: opponent.name, persona: opponent.persona, portraits, detailPortraits };
      });
      if (opponents.length !== 30) throw new Error(`five_card_draw_opponent_count:${opponents.length}`);
      const restored = readEnvelope(opponents) ?? freshEnvelope(opponents);
      const value = { envelope: restored, opponents, atlas };
      if (!alive) return;
      readyRef.current = value;
      setReady(value);
    }).catch(() => { if (alive) setError("파이브 카드 드로 포커를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const current = ready?.envelope.state;
    if (!current || interactionPaused || document.hidden || current.phase === "ready" || current.phase === "complete" || current.currentActorId === "player" || advancingRef.current) return;
    const timer = window.setTimeout(() => {
      const latest = readyRef.current;
      if (!latest || latest.envelope.state.currentActorId === "player" || latest.envelope.state.phase === "complete") return;
      advancingRef.current = true;
      try { applyAction({ type: "advance" }); }
      finally { advancingRef.current = false; }
    }, npcDecisionDelay(current));
    return () => window.clearTimeout(timer);
  }, [ready?.envelope.state, interactionPaused]);

  useEffect(() => {
    const envelope=ready?.envelope,series=envelope?.series;
    if(!envelope||!series||series.status!=="intermission"||!autoContinue||interactionPaused||document.hidden)return;
    const timer=window.setTimeout(()=>continueSeries(),2_000);
    return ()=>window.clearTimeout(timer);
  },[ready?.envelope.series,autoContinue,interactionPaused]);

  useEffect(()=>{
    const envelope=ready?.envelope,series=envelope?.series;
    if(!envelope||!series||series.status!=="complete"||envelope.recordedSeriesIds.includes(series.sessionId)||recordingRef.current.has(series.sessionId))return;
    recordingRef.current.add(series.sessionId);
    void persistSeriesRecord(envelope).then(()=>{
      const latest=readyRef.current;
      if(!latest||latest.envelope.series?.sessionId!==series.sessionId)return;
      update({...latest.envelope,recordedSeriesIds:[...latest.envelope.recordedSeriesIds.slice(-49),series.sessionId]});
    }).catch(()=>setError("연속 대국 전적을 저장하지 못했습니다.")).finally(()=>recordingRef.current.delete(series.sessionId));
  },[ready?.envelope.series?.status,ready?.envelope.series?.sessionId]);

  function update(nextEnvelope: PreviewEnvelope): void {
    writeEnvelope(nextEnvelope);
    setReady((current) => {
      if (!current) return current;
      const next = { ...current, envelope: nextEnvelope };
      readyRef.current = next;
      return next;
    });
  }

  function applyAction(action: FiveCardDrawAction): void {
    const current = readyRef.current;
    if (!current) return;
    setError("");
    try {
      const state = reduceFiveCardDraw(current.envelope.state, action);
      update(settleIfComplete({ ...current.envelope, state }));
    } catch {
      setError("그 행동은 지금 선택할 수 없습니다.");
    }
  }

  function start(selected: readonly FiveCardDrawOpponentView[], stake: FiveCardDrawStake, targetHands:FiveCardDrawSeriesLength): void {
    const current = readyRef.current;
    if (!current || busy) return;
    const reservation = stake * FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS;
    if (current.envelope.balance < reservation) { setError("시험 포인트가 부족합니다. 시험 지갑을 초기화해 주세요."); return; }
    setBusy(true);
    setError("");
    try {
      const context = {
        sessionId: `five-card-draw:preview:${crypto.randomUUID()}`,
        opponents: selected.map(stripPresentation),
      };
      const dealerIndex=current.envelope.state.dealerIndex+(current.envelope.state.phase==="complete"?1:0);
      const fresh = createFiveCardDrawState(context, dealerIndex);
      const state = reduceFiveCardDraw(fresh, { type: "start", seed: crypto.randomUUID(), stake });
      const series=createFiveCardDrawSeries(context,targetHands,stake);
      setAutoContinue(targetHands>1);
      update({ ...current.envelope, balance: current.envelope.balance - reservation, state,series });
    } catch { setError("대국을 시작하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function continueSeries():void {
    const current=readyRef.current;if(!current)return;
    const {series,state,balance}=current.envelope;
    if(!series||series.status!=="intermission"||state.phase!=="complete")return;
    const reservation=series.stake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS;
    if(balance<reservation){update({...current.envelope,series:endFiveCardDrawSeries(series)});setAutoContinue(false);setError("다음 판의 최대 노출액이 부족해 여기서 연속 대국을 마칩니다.");return;}
    try{
      const context={sessionId:series.sessionId,opponents:state.context.opponents,sessionRead:fiveCardDrawSessionRead(series.memory)};
      const fresh=createFiveCardDrawState(context,state.dealerIndex+1);
      const next=reduceFiveCardDraw(fresh,{type:"start",seed:crypto.randomUUID(),stake:series.stake});
      update({...current.envelope,balance:balance-reservation,state:next,series:continueFiveCardDrawSeries(series)});
    }catch{setError("다음 판을 시작하지 못했습니다.");setAutoContinue(false);}
  }

  function endSeries():void {
    const current=readyRef.current,series=current?.envelope.series;
    if(!current||!series||series.status!=="intermission")return;
    setAutoContinue(false);update({...current.envelope,series:endFiveCardDrawSeries(series)});
  }

  function replaySeries():void{
    const current=readyRef.current,series=current?.envelope.series;
    if(!current||!series||series.status!=="complete")return;
    const selected=series.opponentIds.map((id)=>current.opponents.find((opponent)=>opponent.id===id)).filter((opponent):opponent is FiveCardDrawOpponentView=>Boolean(opponent));
    if(selected.length!==series.opponentIds.length){setError("같은 상대를 다시 불러오지 못했습니다.");return;}
    start(selected,series.stake,series.targetHands);
  }

  function reset(): void {
    const current = readyRef.current;
    if (!current || current.envelope.state.phase !== "complete") return;
    setAutoContinue(false);
    update({ ...current.envelope, state: reduceFiveCardDraw(current.envelope.state, { type: "reset" }),series:null });
  }

  function resetWallet(): void {
    const current = readyRef.current;
    if (!current || current.envelope.state.phase !== "ready") return;
    update({ ...current.envelope, balance: INITIAL_BALANCE });
    setError("");
  }

  function changeBeginner(value: boolean): void {
    setBeginner(value);
    try { localStorage.setItem(BEGINNER_KEY, value ? "1" : "0"); } catch { /* optional preference */ }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading">포커 테이블을 준비하고 있습니다…</div>{error && <p role="alert">{error}</p>}</main>;
  return <FiveCardDrawScreen
    state={ready.envelope.state}
    opponents={ready.opponents}
    atlas={ready.atlas}
    balance={ready.envelope.balance}
    busy={busy}
    error={error}
    lines={TEMEROSA_FIVE_CARD_DRAW_LINES}
    beginner={beginner}
    onBeginner={changeBeginner}
    onStart={start}
    onAction={applyAction}
    onReset={reset}
    series={ready.envelope.series}
    seriesStats={ready.envelope.series?fiveCardDrawSeriesStats(ready.envelope.series,ready.envelope.state.context):null}
    autoContinue={autoContinue}
    onAutoContinue={setAutoContinue}
    onNextHand={continueSeries}
    onEndSeries={endSeries}
    onReplaySeries={replaySeries}
    onResetWallet={resetWallet}
    onInteractionPause={setInteractionPaused}
    onExit={onExit}
  />;
}

function settleIfComplete(envelope: PreviewEnvelope): PreviewEnvelope {
  const result = envelope.state.result;
  if (envelope.state.phase !== "complete" || !result || envelope.settledResultIds.includes(result.resultId)) return envelope;
  const series=envelope.series?.status==="playing"?recordFiveCardDrawSeriesHand(envelope.series,envelope.state):envelope.series;
  return { ...envelope, balance: envelope.balance + result.playerCredit, settledResultIds: [...envelope.settledResultIds.slice(-99), result.resultId],series };
}

function freshEnvelope(opponents: readonly FiveCardDrawOpponentView[]): PreviewEnvelope {
  const first = opponents[0];
  if (!first) throw new Error("five_card_draw_opponent_missing");
  return {
    contract: FIVE_CARD_DRAW_TERMS_VERSION,
    balance: INITIAL_BALANCE,
    state: createFiveCardDrawState({ sessionId: "five-card-draw:preview:ready", opponents: [stripPresentation(first)] }),
    settledResultIds: [],
    series:null,
    recordedSeriesIds:[],
  };
}

function readEnvelope(opponents: readonly FiveCardDrawOpponentView[]): PreviewEnvelope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PreviewEnvelope>;
    const ids = new Set(opponents.map((opponent) => opponent.id));
    if (value.contract !== FIVE_CARD_DRAW_TERMS_VERSION || !Number.isInteger(value.balance) || value.balance! < 0 || !isFiveCardDrawState(value.state)
      || value.state.contract !== FIVE_CARD_DRAW_CONTRACT || value.state.context.opponents.some((opponent) => !ids.has(opponent.id)) || !Array.isArray(value.settledResultIds)) return null;
    const candidate=value.series===undefined||value.series===null?null:isFiveCardDrawSeriesState(value.series)?value.series:null;
    const series=candidate&&candidate.sessionId===value.state.context.sessionId
      &&candidate.opponentIds.every((id,index)=>id===value.state!.context.opponents[index]?.id)?candidate:null;
    return {...value,series,recordedSeriesIds:Array.isArray(value.recordedSeriesIds)?value.recordedSeriesIds:[]} as PreviewEnvelope;
  } catch { return null; }
}

function writeEnvelope(envelope: PreviewEnvelope): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope)); } catch { /* preview can continue in memory */ }
}

function readBeginner(): boolean {
  try { return localStorage.getItem(BEGINNER_KEY) !== "0"; } catch { return true; }
}

function stripPresentation(opponent: FiveCardDrawOpponentView): FiveCardDrawOpponent {
  return { id: opponent.id, name: opponent.name, persona: { ...opponent.persona } };
}

/** Presentation-only thinking time. It uses public pressure and persona, never private cards. */
function npcDecisionDelay(state: FiveCardDrawState): number {
  const seatId = state.currentActorId;
  if (!seatId || seatId === "player") return 0;
  const opponent = state.context.opponents[Number(seatId.slice(-1)) - 1];
  if (!opponent) return 1_100;
  const base = state.phase === "drawing" ? 900 + (1 - opponent.persona.drawActivity) * 520
    : state.currentBetUnits === 0 ? 900
    : state.currentBetUnits === 1 ? 1_250
    : state.currentBetUnits === 2 ? 1_700 : 2_050;
  const caution = (1 - opponent.persona.riskAppetite) * 420;
  const rng = new XorShift32(`${state.seed}:think:${state.sequence}:${seatId}`);
  const jitter = (rng.next() - 0.5) * (1 - opponent.persona.consistency) * 900;
  return Math.round(Math.max(800, Math.min(2_800, base + caution + jitter)));
}

async function persistSeriesRecord(envelope:PreviewEnvelope):Promise<void>{
  const series=envelope.series;if(!series||series.status!=="complete")return;
  const stats=fiveCardDrawSeriesStats(series,envelope.state.context);
  const player=stats.standings.find((standing)=>standing.isPlayer);
  if(!player)return;
  const leaders=stats.standings.filter((standing)=>standing.rank===1);
  const outcome:MatchRecord["outcome"]=player.rank!==1?"loss":leaders.length===1?"win":"draw";
  const record:MatchRecord={
    contract:"match-record/0.1",recordId:`${series.sessionId}:${series.contract}`,cabinetId:"temerosa-five-card-draw",
    cabinetVersion:FIVE_CARD_DRAW_TERMS_VERSION,sessionId:series.sessionId,sequence:series.summaries.length,
    seed:series.summaries.map((summary)=>summary.seed).join("|"),completedAt:new Date().toISOString(),turns:series.summaries.reduce((sum,summary)=>sum+summary.turns,0),
    standings:stats.standings.map((standing)=>({seatId:standing.seatId,participantId:standing.participantId,displayName:standing.displayName,rank:standing.rank,isPlayer:standing.isPlayer})),
    outcome,resultHash:resultHash({contract:series.contract,sessionId:series.sessionId,summaries:series.summaries}),
  };
  await appendMatchRecord(record);await pruneMatchRecords(500);
}
