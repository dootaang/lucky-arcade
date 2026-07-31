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
  type FiveCardDrawNpcSeatId,
  type FiveCardDrawStake,
  type FiveCardDrawState,
  type FiveCardDrawSeriesLength,
  type FiveCardDrawSeriesState,
} from "@lucky-arcade/five-card-draw";
import { FiveCardDrawScreen, type FiveCardDrawOpponentView } from "@lucky-arcade/five-card-draw/react";
import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import { npcAccountId, type CasinoInternalAccountId } from "@lucky-arcade/casino-ledger";
import type { GameWagerReceipt, MatchRecord } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { appendMatchRecord, pruneMatchRecords } from "../../lib/database.ts";
import { readWallet } from "../../lib/wallet.ts";
import { casinoCounterpartyContexts } from "../../lib/casino-economy.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { useCasinoOpponentAvailability } from "../casino-ledger/use-casino-opponent-availability.ts";
import { createTemerosaFiveCardDrawOpponents } from "./temerosa-five-card-draw-opponents.ts";
import { TEMEROSA_FIVE_CARD_DRAW_LINES } from "./temerosa-five-card-draw-lines.ts";

const STORAGE_KEY = `${FIVE_CARD_DRAW_TERMS_VERSION}:envelope`;
const BEGINNER_KEY = `${FIVE_CARD_DRAW_TERMS_VERSION}:beginner`;
const SESSION = "five-card-draw:public-1";

interface FiveCardDrawEnvelope {
  contract: typeof FIVE_CARD_DRAW_TERMS_VERSION;
  state: FiveCardDrawState;
  settledResultIds: readonly string[];
  series: FiveCardDrawSeriesState | null;
  recordedSeriesIds: readonly string[];
}

interface Ready {
  envelope: FiveCardDrawEnvelope;
  opponents: readonly FiveCardDrawOpponentView[];
  atlas: Awaited<ReturnType<typeof loadPlayingCardAtlas>>;
}

export default function FiveCardDrawView({ onExit }: { onExit(): void }) {
  const availability = useCasinoOpponentAvailability(SESSION);
  const [ready, setReady] = useState<Ready | null>(null);
  const [balance, setBalance] = useState(0);
  const [opponentBalances,setOpponentBalances]=useState<Readonly<Record<string,number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [beginner, setBeginner] = useState(() => readBeginner());
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const readyRef = useRef<Ready | null>(null);
  const advancingRef = useRef(false);
  const recordingRef = useRef(new Set<string>());
  const settlementAttemptRef = useRef<string|undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaCasinoAssets(), loadPlayingCardAtlas(), readWallet()]).then(async ([bundle, atlas, wallet]) => {
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
      const accountIds=opponents.map((opponent)=>npcAccountId(opponent.id)) as CasinoInternalAccountId[];
      const counterpartyContexts=await casinoCounterpartyContexts(accountIds);
      let restored = readEnvelope(opponents) ?? freshEnvelope(opponents);
      let nextBalance = wallet.balance;
      const wagers = await listWagers(SESSION);
      const reserved = wagers.filter((receipt) => receipt.status === "reserved");
      const pending = reserved.find((receipt) => receiptMatchesState(receipt, restored.state));
      for (const receipt of reserved) {
        if (receipt === pending) continue;
        nextBalance = receipt.termsVersion === FIVE_CARD_DRAW_TERMS_VERSION
          ? (await settleUnrecoverableHand(receipt)).wallet.balance
          : (await invalidateWager({ wagerId: receipt.wagerId, reason: "version-mismatch" })).wallet.balance;
      }
      if (restored.state.phase !== "ready" && restored.state.phase !== "complete" && !pending) restored = freshEnvelope(opponents);
      const restoredResult=restored.state.result;
      const completedReceipt=restoredResult?wagers.find((receipt)=>receipt.status==="settled"&&receiptMatchesState(receipt,restored.state)):undefined;
      if(restoredResult&&completedReceipt&&!restored.settledResultIds.includes(restoredResult.resultId)){
        const series=restored.series?.status==="playing"?recordFiveCardDrawSeriesHand(restored.series,restored.state):restored.series;
        restored={...restored,settledResultIds:[...restored.settledResultIds.slice(-99),restoredResult.resultId],series};
      }
      const value = { envelope: restored, opponents, atlas };
      if (!alive) return;
      readyRef.current = value;
      setReady(value);
      setBalance(nextBalance);
      setOpponentBalances(Object.freeze(Object.fromEntries(opponents.map((opponent)=>[opponent.id,counterpartyContexts[npcAccountId(opponent.id)]!.counterpartyBalance]))));
    }).catch(() => { if (alive) setError("파이브 카드 드로 포커를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const envelope = ready?.envelope;
    const result = envelope?.state.result;
    if (!envelope || envelope.state.phase !== "complete" || !result || envelope.settledResultIds.includes(result.resultId) || busy) return;
    void settleCompletedHand(envelope);
  }, [ready?.envelope.state.phase, ready?.envelope.state.result?.resultId, ready?.envelope.settledResultIds, busy]);

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

  function update(nextEnvelope: FiveCardDrawEnvelope): void {
    writeEnvelope(nextEnvelope);
    commitEnvelope(nextEnvelope);
  }

  function commitEnvelope(nextEnvelope: FiveCardDrawEnvelope): void {
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
      update({ ...current.envelope, state });
    } catch {
      setError("그 행동은 지금 선택할 수 없습니다.");
    }
  }

  async function start(selected: readonly FiveCardDrawOpponentView[], stake: FiveCardDrawStake, targetHands:FiveCardDrawSeriesLength): Promise<void> {
    const current = readyRef.current;
    if (!current || busy) return;
    const reservation = stake * FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS;
    if (balance < reservation) { setError("최대 손실을 예약할 포인트가 부족합니다."); return; }
    if (selected.some((opponent)=>availability.opponents[opponent.id]?.available===false)) { setError("선택한 상대가 다른 테이블에 있습니다."); return; }
    setBusy(true);
    setError("");
    try {
      const context = {
        sessionId: `five-card-draw:series:${crypto.randomUUID()}`,
        opponents: selected.map(stripPresentation),
      };
      const dealerIndex=current.envelope.state.dealerIndex+(current.envelope.state.phase==="complete"?1:0);
      const fresh = createFiveCardDrawState(context, dealerIndex);
      const state = reduceFiveCardDraw(fresh, { type: "start", seed: crypto.randomUUID(), stake });
      const series=createFiveCardDrawSeries(context,targetHands,stake);
      const nextEnvelope={...current.envelope,state,series};
      // Durable state is written before money moves. A blocked store cannot create a refundable live hand.
      writeEnvelope(nextEnvelope);
      try{await reserveHand(state);}catch(cause){writeEnvelope(current.envelope);throw cause;}
      setAutoContinue(targetHands>1);
      availability.holdOpponents(selected.map((opponent)=>opponent.id));
      commitEnvelope(nextEnvelope);
    } catch (cause) { setError(wagerError(cause,"대국을 시작하지 못했습니다.")); }
    finally { setBusy(false); }
  }

  async function continueSeries():Promise<void> {
    const current=readyRef.current;if(!current)return;
    const {series,state}=current.envelope;
    if(!series||series.status!=="intermission"||state.phase!=="complete")return;
    const reservation=series.stake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS;
    if(balance<reservation){update({...current.envelope,series:endFiveCardDrawSeries(series)});setAutoContinue(false);setError("다음 판의 최대 손실을 예약할 수 없어 연속 대국을 마칩니다.");return;}
    setBusy(true);
    try{
      const context={sessionId:series.sessionId,opponents:state.context.opponents,sessionRead:fiveCardDrawSessionRead(series.memory)};
      const fresh=createFiveCardDrawState(context,state.dealerIndex+1);
      const next=reduceFiveCardDraw(fresh,{type:"start",seed:crypto.randomUUID(),stake:series.stake});
      const nextEnvelope={...current.envelope,state:next,series:continueFiveCardDrawSeries(series)};
      writeEnvelope(nextEnvelope);
      try{await reserveHand(next);}catch(cause){writeEnvelope(current.envelope);throw cause;}
      commitEnvelope(nextEnvelope);
    }catch(cause){setError(wagerError(cause,"다음 판을 시작하지 못했습니다."));setAutoContinue(false);}
    finally{setBusy(false);}
  }

  async function reserveHand(state:FiveCardDrawState):Promise<void>{
    if(!state.seed||!state.baseStake)throw new Error("five_card_draw_reservation_state_invalid");
    const accountIds=state.context.opponents.map((opponent)=>npcAccountId(opponent.id)) as CasinoInternalAccountId[];
    const contexts=await casinoCounterpartyContexts(accountIds);
    const reservedAmount=state.baseStake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS;
    const counterpartyReservations=Object.fromEntries(accountIds.map((accountId)=>[accountId,reservedAmount]));
    const counterpartyBaseBalances=Object.fromEntries(accountIds.map((accountId)=>[accountId,contexts[accountId]!.counterpartyBaseBalance]));
    const casinoOccurredAtSecond=contexts[accountIds[0]!]!.casinoOccurredAtSecond;
    const transaction=await reserveWager({
      outcomeKey:`${FIVE_CARD_DRAW_TERMS_VERSION}:${state.seed}`,cabinetId:"temerosa-five-card-draw",sessionId:SESSION,
      termsVersion:FIVE_CARD_DRAW_TERMS_VERSION,choiceKey:`deal:${state.context.sessionId}|${state.seed}`,
      stake:state.baseStake,reservedAmount,counterpartyReservations,counterpartyBaseBalances,casinoOccurredAtSecond,
    });
    setBalance(transaction.wallet.balance);
  }

  async function settleCompletedHand(envelope:FiveCardDrawEnvelope):Promise<void>{
    const result=envelope.state.result;
    if(!result||settlementAttemptRef.current===result.resultId)return;
    settlementAttemptRef.current=result.resultId;setBusy(true);setError("");
    try{
      const receipt=(await listWagers(SESSION)).find((candidate)=>candidate.status==="reserved"&&receiptMatchesState(candidate,envelope.state));
      if(!receipt)throw new Error("five_card_draw_wager_receipt_missing");
      const counterpartyCredits=Object.fromEntries(envelope.state.context.opponents.map((opponent,index)=>{
        const seatId=`npc-${index+1}` as FiveCardDrawNpcSeatId;
        const maximum=FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS*(envelope.state.baseStake??receipt.stake);
        return [npcAccountId(opponent.id),maximum-result.contributions[seatId]+result.payouts[seatId]];
      }));
      const transaction=await settleWager({wagerId:receipt.wagerId,settlementSequence:envelope.state.sequence,resultKey:result.resultId,creditAmount:result.playerCredit,counterpartyCredits});
      const series=envelope.series?.status==="playing"?recordFiveCardDrawSeriesHand(envelope.series,envelope.state):envelope.series;
      setBalance(transaction.wallet.balance);
      update({...envelope,settledResultIds:[...envelope.settledResultIds.slice(-99),result.resultId],series});
      void refreshOpponentBalances(envelope.state.context.opponents.map((opponent)=>opponent.id)).catch(()=>undefined);
    }catch{setError("결과는 보존됐지만 정산에 실패했습니다. 다시 열면 같은 영수증으로 처리합니다.");}
    finally{setBusy(false);}
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

  function changeBeginner(value: boolean): void {
    setBeginner(value);
    try { localStorage.setItem(BEGINNER_KEY, value ? "1" : "0"); } catch { /* optional preference */ }
  }

  async function refreshOpponentBalances(ids:readonly string[]):Promise<void>{
    const accountIds=ids.map((id)=>npcAccountId(id)) as CasinoInternalAccountId[];
    const contexts=await casinoCounterpartyContexts(accountIds);
    setOpponentBalances((current)=>Object.freeze({...current,...Object.fromEntries(ids.map((id)=>[id,contexts[npcAccountId(id)]!.counterpartyBalance]))}));
  }

  if (!ready) return <main className="game-shell"><div className="game-loading">포커 테이블을 준비하고 있습니다…</div>{error && <p role="alert">{error}</p>}</main>;
  return <FiveCardDrawScreen
    state={ready.envelope.state}
    opponents={ready.opponents}
    atlas={ready.atlas}
    balance={balance}
    busy={busy}
    error={error}
    lines={TEMEROSA_FIVE_CARD_DRAW_LINES}
    beginner={beginner}
    onBeginner={changeBeginner}
    onStart={start}
    opponentAvailability={availability.opponents}
    opponentBalances={opponentBalances}
    onOpponentSelectionChange={availability.holdOpponents}
    onAction={applyAction}
    onReset={reset}
    series={ready.envelope.series}
    seriesStats={ready.envelope.series?fiveCardDrawSeriesStats(ready.envelope.series,ready.envelope.state.context):null}
    autoContinue={autoContinue}
    onAutoContinue={setAutoContinue}
    onNextHand={continueSeries}
    onEndSeries={endSeries}
    onReplaySeries={replaySeries}
    onInteractionPause={setInteractionPaused}
    onExit={onExit}
  />;
}

function freshEnvelope(opponents: readonly FiveCardDrawOpponentView[]): FiveCardDrawEnvelope {
  const first = opponents[0];
  if (!first) throw new Error("five_card_draw_opponent_missing");
  return {
    contract: FIVE_CARD_DRAW_TERMS_VERSION,
    state: createFiveCardDrawState({ sessionId: "five-card-draw:public:ready", opponents: [stripPresentation(first)] }),
    settledResultIds: [],
    series:null,
    recordedSeriesIds:[],
  };
}

function readEnvelope(opponents: readonly FiveCardDrawOpponentView[]): FiveCardDrawEnvelope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FiveCardDrawEnvelope>;
    const ids = new Set(opponents.map((opponent) => opponent.id));
    if (value.contract !== FIVE_CARD_DRAW_TERMS_VERSION || !isFiveCardDrawState(value.state)
      || value.state.contract !== FIVE_CARD_DRAW_CONTRACT || value.state.context.opponents.some((opponent) => !ids.has(opponent.id)) || !Array.isArray(value.settledResultIds)) return null;
    const candidate=value.series===undefined||value.series===null?null:isFiveCardDrawSeriesState(value.series)?value.series:null;
    const series=candidate&&candidate.sessionId===value.state.context.sessionId
      &&candidate.opponentIds.every((id,index)=>id===value.state!.context.opponents[index]?.id)?candidate:null;
    return {...value,series,recordedSeriesIds:Array.isArray(value.recordedSeriesIds)?value.recordedSeriesIds:[]} as FiveCardDrawEnvelope;
  } catch { return null; }
}

function writeEnvelope(envelope: FiveCardDrawEnvelope): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

function readBeginner(): boolean {
  try { return localStorage.getItem(BEGINNER_KEY) !== "0"; } catch { return true; }
}

function stripPresentation(opponent: FiveCardDrawOpponentView): FiveCardDrawOpponent {
  return { id: opponent.id, name: opponent.name, persona: { ...opponent.persona } };
}

function receiptMatchesState(receipt:GameWagerReceipt,state:FiveCardDrawState):boolean{
  return receipt.cabinetId==="temerosa-five-card-draw"&&receipt.sessionId===SESSION&&receipt.termsVersion===FIVE_CARD_DRAW_TERMS_VERSION
    &&state.seed!==null&&receipt.outcomeKey===`${FIVE_CARD_DRAW_TERMS_VERSION}:${state.seed}`;
}

/**
 * Missing current-contract state is not refundable: otherwise deleting browser
 * storage after seeing a bad hand becomes a free option. Every counterparty gets
 * its reservation back and shares the player's exposed amount deterministically.
 */
async function settleUnrecoverableHand(receipt:GameWagerReceipt){
  const reservations=receipt.counterpartyReservations;
  if(!reservations||Object.keys(reservations).length===0)throw new Error("five_card_draw_counterparties_missing");
  const ids=Object.keys(reservations).sort(),share=Math.floor(receipt.reservedAmount/ids.length),remainder=receipt.reservedAmount-share*ids.length;
  const counterpartyCredits=Object.fromEntries(ids.map((id,index)=>[id,reservations[id]!+share+(index<remainder?1:0)]));
  return settleWager({wagerId:receipt.wagerId,settlementSequence:0,resultKey:"unrecoverable-state-forfeit",creditAmount:0,counterpartyCredits});
}

function wagerError(cause:unknown,fallback:string):string{
  if(!(cause instanceof Error))return fallback;
  if(cause.message==="insufficient_points")return "최대 손실을 예약할 포인트가 부족합니다.";
  if(cause.message==="casino_counterparty_insufficient_points")return "선택한 상대 중 이 판돈을 감당할 수 없는 인물이 있습니다.";
  if(cause.message==="casino_opponent_busy")return "선택한 상대가 다른 테이블에 있습니다.";
  return fallback;
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

async function persistSeriesRecord(envelope:FiveCardDrawEnvelope):Promise<void>{
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
