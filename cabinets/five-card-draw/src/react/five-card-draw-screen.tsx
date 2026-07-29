import { IconArrowLeft, IconCards, IconRefresh } from "@tabler/icons-react";
import type { StandardCardId } from "@lucky-arcade/card-table";
import { StandardPlayingCard, PlayingCardBack, type CourtAtlas } from "@lucky-arcade/ui/playing-card";
import {
  ActionHalo, CardFan, CardFanItem, CardFlightLayer, DeckShoe, HandReveal, MuckPile, PotStack, StageFlourish,
  stageAnchor, useReducedMotion, usePresentationQueue, type StageFlight,
} from "@lucky-arcade/ui/card-stage";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import {
  FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS, FIVE_CARD_DRAW_STAKES, analyzeFiveCardDrawGuide, betActionGuide, exchangeCountGuide,
  fiveCardDrawNpcTells, legalPlayerBetActions, selectFiveCardDrawSpeeches, type FiveCardDrawAction, type FiveCardDrawBetAction, type FiveCardDrawLine, type FiveCardDrawOpponent,
  type FiveCardDrawTell,
  type FiveCardDrawNpcSeatId, type FiveCardDrawSeatId, type FiveCardDrawStake, type FiveCardDrawState,
  type FiveCardDrawSeriesLength,type FiveCardDrawSeriesState,type FiveCardDrawSeriesStats,
} from "../index.ts";
import { handHighlight, handTier, planFiveCardDrawStage, type DrawStageEvent } from "./presentation.ts";
import "@lucky-arcade/ui/card-stage.css";
import "./five-card-draw.css";

/** NPC 좌석이 앉는 자리. 인원에 따라 좌·상·우로 배분한다. */
const SEAT_SLOTS: Readonly<Record<number, readonly string[]>> = { 1: ["top"], 2: ["left", "right"], 3: ["left", "top", "right"] };
const DRAW_FLIGHT_MS = 300;
const DRAW_STAGGER_MS = 70;

export interface FiveCardDrawOpponentView extends FiveCardDrawOpponent {
  portrait?: string;
  portraits?: Readonly<Record<FiveCardDrawTell, string>>;
  detailPortraits?: Readonly<Record<FiveCardDrawTell, string>>;
}
export interface FiveCardDrawScreenProps {
  state:FiveCardDrawState;opponents:readonly FiveCardDrawOpponentView[];atlas:CourtAtlas;balance:number;busy:boolean;error:string;
  lines?:readonly FiveCardDrawLine[];
  series:FiveCardDrawSeriesState|null;seriesStats:FiveCardDrawSeriesStats|null;autoContinue:boolean;
  beginner:boolean;onBeginner(value:boolean):void;onStart(opponents:readonly FiveCardDrawOpponentView[],stake:FiveCardDrawStake,targetHands:FiveCardDrawSeriesLength):void;
  onAction(action:FiveCardDrawAction):void;onReset():void;onResetWallet():void;onNextHand():void;onEndSeries():void;onReplaySeries():void;onAutoContinue(value:boolean):void;
  onInteractionPause?(paused:boolean):void;onExit():void;
}

export function FiveCardDrawScreen(props:FiveCardDrawScreenProps):ReactElement {
  const [playerCount,setPlayerCount]=useState<2|3|4>(()=>(props.state.context.opponents.length+1) as 2|3|4);
  const [selectedIds,setSelectedIds]=useState<string[]>(()=>props.state.context.opponents.map((opponent)=>opponent.id));
  const [stake,setStake]=useState<FiveCardDrawStake>(10);
  const [seriesLength,setSeriesLength]=useState<FiveCardDrawSeriesLength>(3);
  const [selectedCards,setSelectedCards]=useState<Set<string>>(()=>new Set());
  const [shownBalance,setShownBalance]=useState(props.balance);
  const [inspectedSeat,setInspectedSeat]=useState<FiveCardDrawSeatId|null>(null);
  const [inspectedPortrait,setInspectedPortrait]=useState<FiveCardDrawNpcSeatId|null>(null);
  const [speeches,setSpeeches]=useState<Partial<Record<FiveCardDrawNpcSeatId,FiveCardDrawLine>>>({});
  const previousSpeechState=useRef(props.state);
  const recentLineIds=useRef<string[]>([]);
  const speechShowTimers=useRef<Partial<Record<FiveCardDrawNpcSeatId,number>>>({});
  const speechHideTimers=useRef<Partial<Record<FiveCardDrawNpcSeatId,number>>>({});
  const speechEndsAt=useRef<Partial<Record<FiveCardDrawNpcSeatId,number>>>({});
  const reducedMotion=useReducedMotion();
  const queue=usePresentationQueue(props.state,planFiveCardDrawStage,reducedMotion?0:1);
  const state=queue.display,event=queue.event;
  const settled=!queue.busy&&Object.is(state,props.state);
  const guide=useMemo(()=>state.hands.player.length===5?analyzeFiveCardDrawGuide(state.hands.player):null,[state.hands.player]);
  const playerActions=settled?legalPlayerBetActions(props.state):[];
  const setupOpponents=Array.from({length:playerCount-1},(_,index)=>props.opponents.find((opponent)=>opponent.id===selectedIds[index])??props.opponents[index]!);
  const flights=useMemo(()=>buildFlights(event,props.atlas),[event,props.atlas]);
  const revealed=revealedSeats(event,state);
  const arrivals=useMemo(()=>arrivalDelays(event),[event]);
  const playerHighlight=state.phase==="complete"&&revealed.has("player")?handHighlight(state.hands.player,state.result?.values.player):null;
  const potUnits=Object.values(state.contributionsUnits).reduce((sum,value)=>sum+value,0);
  const pot=state.result?.pot??(state.baseStake??0)*potUnits;
  const potSettled=state.phase==="complete"&&(event?.kind==="award"||settled);
  const muckCount=Object.values(state.discarded).reduce((sum,cards)=>sum+cards.length,0)+state.foldedSeatIds.length*5;
  const verdictVisible=state.phase==="complete"&&(event===null||event.kind==="verdict"||event.kind==="award");
  const npcTells=fiveCardDrawNpcTells(state);

  useEffect(()=>{setSelectedCards(new Set());},[state.phase,state.currentActorId]);
  useEffect(()=>{if(settled)setShownBalance(props.balance);},[props.balance,settled]);
  useEffect(()=>{
    props.onInteractionPause?.(queue.busy||inspectedSeat!==null||inspectedPortrait!==null);
    return ()=>props.onInteractionPause?.(false);
  },[queue.busy,inspectedSeat,inspectedPortrait,props.onInteractionPause]);
  useEffect(()=>{
    const previous=previousSpeechState.current;
    previousSpeechState.current=props.state;
    if(previous===props.state)return;
    const selected=selectFiveCardDrawSpeeches(previous,props.state,props.lines??[],recentLineIds.current);
    const baseDelay=speechStartDelay(previous,props.state,selected);
    for(const [index,speech] of selected.entries()){
      const previousShow=speechShowTimers.current[speech.seatId];
      if(previousShow!==undefined)window.clearTimeout(previousShow);
      const requestedDelay=baseDelay+index*650;
      const afterCurrent=Math.max(0,(speechEndsAt.current[speech.seatId]??0)-Date.now()+180);
      const show=window.setTimeout(()=>{
        delete speechShowTimers.current[speech.seatId];
        const previousHide=speechHideTimers.current[speech.seatId];
        if(previousHide!==undefined)window.clearTimeout(previousHide);
        setSpeeches((current)=>({...current,[speech.seatId]:speech.line}));
        recentLineIds.current=[...recentLineIds.current.slice(-11),speech.line.id];
        const duration=speechDuration(speech.line);
        speechEndsAt.current[speech.seatId]=Date.now()+duration;
        const hide=window.setTimeout(()=>setSpeeches((current)=>{
          delete speechHideTimers.current[speech.seatId];
          delete speechEndsAt.current[speech.seatId];
          if(current[speech.seatId]?.id!==speech.line.id)return current;
          const next={...current};delete next[speech.seatId];return next;
        }),duration);
        speechHideTimers.current[speech.seatId]=hide;
      },Math.max(requestedDelay,afterCurrent));
      speechShowTimers.current[speech.seatId]=show;
    }
  },[props.state,props.lines]);
  useEffect(()=>()=>{
    for(const timer of Object.values(speechShowTimers.current))if(timer!==undefined)window.clearTimeout(timer);
    for(const timer of Object.values(speechHideTimers.current))if(timer!==undefined)window.clearTimeout(timer);
  },[]);
  useEffect(()=>{
    if(inspectedSeat===null&&inspectedPortrait===null)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){setInspectedSeat(null);setInspectedPortrait(null);}};
    window.addEventListener("keydown",onKey);
    return ()=>{window.removeEventListener("keydown",onKey);document.body.style.overflow=previous;};
  },[inspectedSeat,inspectedPortrait]);

  function changeCount(value:2|3|4):void {setPlayerCount(value);setSelectedIds((current)=>fillUnique(current,value-1,props.opponents));}
  function selectAt(index:number,id:string):void {setSelectedIds((current)=>{const next=[...current];next[index]=id;return fillUnique(next,playerCount-1,props.opponents);});}
  function randomize():void {const random=new Uint32Array(1);crypto.getRandomValues(random);const start=random[0]!%props.opponents.length;setSelectedIds(Array.from({length:playerCount-1},(_,index)=>props.opponents[(start+index*7)%props.opponents.length]!.id));}
  function toggle(card:string):void {if(!canSelectCards())return;setSelectedCards((current)=>{const next=new Set(current);if(next.has(card))next.delete(card);else if(next.size<3)next.add(card);return next;});}
  function exchange():void {props.onAction({type:"exchange",cardIds:[...selectedCards] as StandardCardId[]});setSelectedCards(new Set());setInspectedSeat(null);}
  function canSelectCards():boolean {return settled&&props.state.phase==="drawing"&&props.state.currentActorId==="player";}

  if(props.state.phase==="ready")return <main className="draw-poker-shell draw-poker-lobby">
    <header><button className="draw-icon-button" onClick={props.onExit} aria-label="카지노로 돌아가기"><IconArrowLeft/></button><div><span className="draw-eyebrow">ADMIN PREVIEW · TEMEROSA CASINO</span><h1>파이브 카드 드로 포커</h1></div><strong>{props.balance.toLocaleString("ko-KR")} 시험 P</strong></header>
    <section className="draw-setup">
      <div className="draw-rules"><IconCards/><div><h2>카드 5장, 두 번의 베팅</h2><p>카드를 0~3장 교환하고 상대의 행동을 읽어 가장 높은 포커 족보를 만드세요.</p></div></div>
      <fieldset><legend>테이블 인원</legend><div className="draw-segmented">{([2,3,4] as const).map((count)=><button key={count} aria-pressed={playerCount===count} onClick={()=>changeCount(count)}>{count}인</button>)}</div></fieldset>
      <fieldset><legend>함께할 상대</legend><div className="draw-opponent-selects">{setupOpponents.map((chosen,index)=><label key={index}>좌석 {index+1}<select value={chosen.id} onChange={(input)=>selectAt(index,input.target.value)}>{props.opponents.filter((candidate)=>candidate.id===chosen.id||!setupOpponents.some((selected)=>selected.id===candidate.id)).map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>)}</div><button className="draw-secondary" onClick={randomize}><IconRefresh size={16}/>무작위로 채우기</button></fieldset>
      <fieldset><legend>기본 판돈</legend><div className="draw-segmented">{FIVE_CARD_DRAW_STAKES.map((value)=><button key={value} aria-pressed={stake===value} onClick={()=>setStake(value)} disabled={props.balance<value*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS}>{value} P</button>)}</div><small>최대 노출 {stake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS} 시험 P · 사용하지 않은 예약액은 반환됩니다.</small></fieldset>
      <fieldset><legend>연속 대국</legend><div className="draw-segmented">{([1,3,5] as const).map((value)=><button key={value} aria-pressed={seriesLength===value} onClick={()=>setSeriesLength(value)}>{value===1?"단판":`${value}판${value===3?" · 기본":""}`}</button>)}</div><small>판마다 정산하고 딜러가 한 자리씩 이동합니다. 최종 순위는 누적 손익으로 정합니다.</small></fieldset>
      <label className="draw-guide-toggle"><input type="checkbox" checked={props.beginner} onChange={(input)=>props.onBeginner(input.target.checked)}/><span><strong>초보자 안내</strong><small>현재 족보, 교환 후보와 베팅 용어를 설명합니다.</small></span></label>
      {props.error&&<p className="draw-error" role="alert">{props.error}</p>}
      <div className="draw-start-actions"><button className="draw-primary" disabled={props.busy||setupOpponents.length!==playerCount-1||new Set(setupOpponents.map((opponent)=>opponent.id)).size!==setupOpponents.length||props.balance<stake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS} onClick={()=>props.onStart(setupOpponents,stake,seriesLength)}>시험 대국 시작</button><button className="draw-secondary" onClick={props.onResetWallet}>시험칩 초기화</button></div>
    </section>
  </main>;

  const slots=SEAT_SLOTS[state.context.opponents.length]??["top"];
  return <main className="draw-poker-shell">
    <header><button className="draw-icon-button" onClick={props.onExit} aria-label="카지노로 돌아가기"><IconArrowLeft/></button><div><span className="draw-eyebrow">ADMIN PREVIEW</span><h1>파이브 카드 드로 포커</h1></div><strong>{shownBalance.toLocaleString("ko-KR")} 시험 P</strong></header>
    <section className={`draw-table count-${state.context.opponents.length}`} data-stage-root data-phase={state.phase} data-busy={queue.busy||undefined}>
      {props.series&&<SeriesProgress series={props.series} stats={props.seriesStats} dealerSeatId={state.seatOrder[state.dealerIndex]??"player"}/>}
      <div className="draw-opponents">{state.context.opponents.map((opponent,index)=>{
        const seatId=`npc-${index+1}` as FiveCardDrawNpcSeatId,view=props.opponents.find((item)=>item.id===opponent.id);
        const folded=state.foldedSeatIds.includes(seatId),open=revealed.has(seatId);
        const tell=seriesTell(seatId,props.series,npcTells[seatId]??"neutral");
        const portrait=view?.portraits?.[tell]??view?.portrait;
        const detailPortrait=view?.detailPortraits?.[tell]??portrait;
        const value=open?state.result?.values[seatId]:undefined;
        const highlight=open?handHighlight(state.hands[seatId],value):null;
        return <article className={`draw-seat draw-seat-${slots[index]??"top"}${state.currentActorId===seatId?" is-active":""}${folded?" is-folded":""}${verdictVisible&&state.result?.winnerSeatIds.includes(seatId)?" is-winner":""}${event?.kind==="check"&&event.seatId===seatId?" is-checking":""}`} key={seatId} data-tell={tell} {...stageAnchor(`seat:${seatId}`)}>
          <ActionHalo active={state.currentActorId===seatId&&!folded}/>
          <div className="draw-seat-title"><button className="draw-portrait-button" type="button" onClick={()=>{setInspectedSeat(null);setInspectedPortrait(seatId);}} aria-label={`${opponent.name} 감정 초상 크게 보기`}>{portrait?<img key={portrait} className="draw-portrait-image" src={portrait} alt=""/>:<span>{opponent.name.slice(0,1)}</span>}<i className={`draw-tell draw-tell-${tell}`}>{tellLabel(tell)}</i></button><div><strong>{opponent.name}{state.seatOrder[state.dealerIndex]===seatId&&<span className="draw-dealer-marker" title="이번 판 딜러">D</span>}</strong><small>{seatStatus(state,seatId,event,verdictVisible,revealed.has(seatId))}{seriesStreakLabel(seatId,props.series)}</small></div></div>
          {speeches[seatId]&&<SpeechBubble line={speeches[seatId]!}/>}
          <button className="draw-hand-inspect" type="button" disabled={folded||!settled} onClick={()=>setInspectedSeat(seatId)} aria-label={`${opponent.name}의 패 크게 보기`}>
          <CardFan className={`draw-cards compact${event?.kind==="fold"&&event.seatId===seatId?" is-mucking":""}${event?.kind==="stand-pat"&&event.seatId===seatId?" is-standing-pat":""}`} count={5} anchor={`hand:${seatId}`}>
            {/* 폴드한 패는 muck으로 던져진 뒤 좌석에서 사라진다. 끝까지 공개하지 않는다. */}
            {folded?null:state.hands[seatId].map((card,cardIndex)=><CardFanItem key={`${seatId}-${cardIndex}`} index={cardIndex} count={5} anchor={handSlotAnchor(seatId,cardIndex)} className={cardClassName(card,open,highlight,arrivals,event)} {...arrivalStyle(card,arrivals)}>
              {open?<StandardPlayingCard id={card} atlas={props.atlas}/>:<PlayingCardBack/>}
            </CardFanItem>)}
          </CardFan>
          </button>
          {open&&value&&<HandReveal tier={handTier(value)} label={value.label}/>}
          {props.beginner&&!folded&&state.phase!=="complete"&&state.exchangeCounts[seatId]!==undefined&&<p className="draw-opponent-hint">{exchangeCountGuide(state.exchangeCounts[seatId]!)}</p>}
        </article>;
      })}</div>

      <div className="draw-center">
        <DeckShoe label="덱" remaining={Math.max(0,state.deck.length-state.deckCursor)}/>
        <PotStack units={potSettled?0:potUnits} {...(event?.kind==="chips"&&(event.action==="raise"||event.action==="bet")?{pulse:"raise"}:{})}>
          <span>팟</span><strong>{potSettled?"정산 완료":`${pot.toLocaleString("ko-KR")} P`}</strong><small>{phaseLabel(state)}</small>
        </PotStack>
        <MuckPile count={muckCount} label="버린 패"/>
      </div>

      <article className={`draw-seat draw-player${state.currentActorId==="player"?" is-active":""}${state.foldedSeatIds.includes("player")?" is-folded":""}${verdictVisible&&state.result?.winnerSeatIds.includes("player")?" is-winner":""}${event?.kind==="check"&&event.seatId==="player"?" is-checking":""}`} {...stageAnchor("seat:player")}>
        <ActionHalo active={state.currentActorId==="player"&&!state.foldedSeatIds.includes("player")}/>
        <div className="draw-seat-title"><span>나</span><div><strong>플레이어{state.seatOrder[state.dealerIndex]==="player"&&<span className="draw-dealer-marker" title="이번 판 딜러">D</span>}</strong><small>{seatStatus(state,"player",event,verdictVisible,revealed.has("player"))}{seriesStreakLabel("player",props.series)}</small></div></div>
        <CardFan className={`draw-cards${event?.kind==="fold"&&event.seatId==="player"?" is-mucking":""}${event?.kind==="stand-pat"&&event.seatId==="player"?" is-standing-pat":""}`} count={5} anchor="hand:player">
          {(state.foldedSeatIds.includes("player")?[]:state.hands.player).map((card,cardIndex)=>{
            return <CardFanItem key={card} index={cardIndex} count={5} anchor={handSlotAnchor("player",cardIndex)} className={cardClassName(card,false,playerHighlight,arrivals,event)} {...arrivalStyle(card,arrivals)}>
              <button aria-disabled={!settled} aria-pressed={selectedCards.has(card)} aria-label={`${standardCardLabel(card)}, ${cardIndex+1}번째 카드${selectedCards.has(card)?", 교환 선택됨":""}`} className={`draw-hand-card${canSelectCards()?" is-selectable":""}${props.beginner&&canSelectCards()&&guide?.discardCardIds.includes(card)?" is-recommended":""}`} onClick={()=>canSelectCards()?toggle(card):settled&&setInspectedSeat("player")}>
                <StandardPlayingCard id={card} atlas={props.atlas} decorative/>
                {selectedCards.has(card)&&<span>교환</span>}
              </button>
            </CardFanItem>;
          })}
        </CardFan>
        {!state.foldedSeatIds.includes("player")&&settled&&<button className="draw-inspect-button" type="button" onClick={()=>setInspectedSeat("player")}>패 크게 보기</button>}
        {state.phase==="complete"&&revealed.has("player")&&state.result?.values.player&&<HandReveal tier={handTier(state.result.values.player)} label={state.result.values.player.label}/>}
      </article>

      {props.beginner&&guide&&state.phase!=="complete"&&<aside className="draw-coach"><span className="draw-eyebrow">초보자 안내</span><h2>현재 패 · {guide.handLabel}</h2><p>{guide.summary}</p><strong>{guide.recommendation}</strong>{canSelectCards()&&<button onClick={()=>setSelectedCards(new Set(guide.discardCardIds))}>추천 카드 표시</button>}</aside>}

      <div className="draw-actions">
        {queue.busy&&<button className="draw-secondary draw-skip" onClick={queue.skip}>연출 건너뛰기</button>}
        {settled&&state.phase==="drawing"&&state.currentActorId==="player"&&<button className="draw-primary" onClick={exchange}>{selectedCards.size===0?"그대로 승부":`${selectedCards.size}장 교환`}</button>}
        {playerActions.map((action)=><button key={action} className={action==="fold"?"draw-danger":"draw-primary"} onClick={()=>props.onAction({type:"bet",action})}>{actionLabel(action,props.state)}</button>)}
        {props.beginner&&playerActions.length>0&&<p className="draw-action-guide">{playerActions.map((action)=>betActionGuide(action,actionCost(action,props.state),action==="raise"&&props.state.currentBetUnits===2)).join(" · ")}</p>}
        {settled&&state.phase==="complete"&&<SeriesResult
          state={state} series={props.series} stats={props.seriesStats} autoContinue={props.autoContinue}
          onAutoContinue={props.onAutoContinue} onNext={props.onNextHand} onEnd={props.onEndSeries}
          onReplay={props.onReplaySeries} onReset={props.onReset}/>}
        {props.error&&<p className="draw-error" role="alert">{props.error}</p>}
      </div>

      {event?.kind==="verdict"&&<StageFlourish tier={event.tier}/>}
      <CardFlightLayer flights={flights}/>
    </section>
    {inspectedSeat&&<HandInspector seatId={inspectedSeat} state={state} opponents={props.opponents} atlas={props.atlas} revealed={revealed.has(inspectedSeat)} selectedCards={selectedCards} canSelect={inspectedSeat==="player"&&canSelectCards()} onToggle={toggle} onExchange={exchange} onClose={()=>setInspectedSeat(null)}/>}
    {inspectedPortrait&&<PortraitInspector seatId={inspectedPortrait} state={state} opponents={props.opponents} tell={npcTells[inspectedPortrait]??"neutral"} onClose={()=>setInspectedPortrait(null)}/>}
  </main>;
}

/* ── 표현 이벤트를 카드·칩 비행으로 옮긴다. 어떤 함수도 코어 상태를 만지지 않는다. ── */

function buildFlights(event:DrawStageEvent|null,atlas:CourtAtlas):readonly StageFlight[] {
  if(!event)return [];
  const back=<PlayingCardBack/>;
  const face=(id:StandardCardId):ReactNode=><StandardPlayingCard id={id} atlas={atlas} decorative/>;
  if(event.kind==="deal")return event.cards.map((card,index)=>({
    id:`${event.token}:deal:${card.cardId}`,from:"deck",to:handSlotAnchor(card.seatId,card.slot),front:face(card.cardId),back,
    faceUp:false,flip:card.seatId==="player",flipAt:0.55,duration:event.flightMs,delay:index*event.stagger,
    spin:(card.slot-2)*2.4,scaleFrom:0.86,fitToAnchor:true,handoff:true,
  }));
  if(event.kind==="draw")return event.cards.map((card,index)=>({
    id:`${event.token}:draw:${card}`,from:"deck",to:handSlotAnchor(event.seatId,event.slots[index]??2),front:face(card),back,
    faceUp:false,flip:event.faceUp,flipAt:0.55,duration:DRAW_FLIGHT_MS,delay:index*DRAW_STAGGER_MS,
    spin:((event.slots[index]??2)-2)*2.4,scaleFrom:0.88,fitToAnchor:true,handoff:true,
  }));
  // 버린 패와 폴드한 패는 끝까지 뒷면이다. 상대에게 공짜 정보를 주지 않는다.
  if(event.kind==="discard")return event.cards.map((card,index)=>({
    id:`${event.token}:muck:${card}`,from:handSlotAnchor(event.seatId,event.slots[index]??2),to:"muck",front:back,back,
    faceUp:false,duration:280,delay:index*60,spinFrom:((event.slots[index]??2)-2)*2.4,spin:-14+index*9,fitFromAnchor:true,scaleTo:0.9,fadeOut:true,
  }));
  if(event.kind==="fold")return event.cards.map((card,index)=>({
    id:`${event.token}:fold:${card}`,from:handSlotAnchor(event.seatId,index),to:"muck",front:back,back,
    faceUp:false,duration:360,delay:index*34,spinFrom:(index-2)*2.4,spin:-18+index*8,fitFromAnchor:true,scaleTo:0.88,fadeOut:true,
  }));
  if(event.kind==="chips")return Array.from({length:Math.min(4,Math.max(1,event.units))},(_,index)=>({
    id:`${event.token}:chip:${index}`,from:`seat:${event.seatId}`,to:"pot",front:<span className="draw-chip"/>,
    variant:"chip" as const,duration:340,delay:event.hesitation+index*60,scaleFrom:0.7,
    toOffset:{x:(index-1)*0.06,y:-0.05*index},
  }));
  if(event.kind==="award")return event.seatIds.flatMap((seatId)=>Array.from({length:3},(_,index)=>({
    id:`${event.token}:award:${seatId}:${index}`,from:"pot",to:`seat:${seatId}`,front:<span className="draw-chip"/>,
    variant:"chip" as const,duration:400,delay:index*70,scaleTo:0.8,
  })));
  return [];
}

/** 비행 카드가 실제 부채꼴 카드 슬롯의 좌표와 크기를 직접 측정하도록 슬롯별 앵커를 만든다. */
function handSlotAnchor(seatId:FiveCardDrawSeatId,slot:number):string{return `hand:${seatId}:slot:${slot}`;}

/** 딜과 교환으로 도착하는 카드는 비행이 내려앉는 순간에 맞춰 자리에 나타난다. */
function arrivalDelays(event:DrawStageEvent|null):ReadonlyMap<string,number>|null {
  if(event?.kind==="deal")return new Map(event.cards.map((card,index)=>[card.cardId,index*event.stagger+event.flightMs]));
  if(event?.kind==="draw")return new Map(event.cards.map((card,index)=>[card,index*DRAW_STAGGER_MS+DRAW_FLIGHT_MS]));
  return null;
}

/** `reveal`은 뒷면에서 앞면으로 넘어가는 순간에만 참이다. 내 손패는 처음부터
 *  앞면이므로 뒤집기 연출을 다시 재생하지 않는다. */
function cardClassName(card:StandardCardId,reveal:boolean,highlight:ReadonlySet<StandardCardId>|null,arrivals:ReadonlyMap<string,number>|null,event:DrawStageEvent|null):string {
  const parts=["draw-card"];
  if(reveal)parts.push("is-open");
  if(highlight)parts.push(highlight.has(card)?"is-primary":"is-kicker");
  if(arrivals?.has(card))parts.push("is-arriving");
  if(event?.kind==="discard"&&event.leaving.includes(card))parts.push("is-leaving");
  return parts.join(" ");
}

function arrivalStyle(card:StandardCardId,arrivals:ReadonlyMap<string,number>|null):{style?:CSSProperties} {
  const delay=arrivals?.get(card);
  return delay===undefined?{}:{style:{"--draw-arrival-delay":`${delay}ms`} as CSSProperties};
}

function revealedSeats(event:DrawStageEvent|null,state:FiveCardDrawState):ReadonlySet<FiveCardDrawSeatId> {
  if(event?.kind==="reveal")return new Set(event.seatIds);
  if(state.phase==="complete"&&state.result)return new Set(Object.keys(state.result.hands) as FiveCardDrawSeatId[]);
  return new Set();
}

function seatStatus(state:FiveCardDrawState,seatId:FiveCardDrawSeatId,event:DrawStageEvent|null,verdictVisible:boolean,revealed:boolean):string {
  if(state.foldedSeatIds.includes(seatId))return "폴드";
  if(event&&"seatId" in event&&event.seatId===seatId){
    if(event.kind==="stand-pat")return "교환 없음";
    if(event.kind==="discard"||event.kind==="draw")return `${event.cards.length}장 교환`;
    if(event.kind==="check")return "체크";
    if(event.kind==="chips")return event.action==="call"?"콜":event.counterRaise?"맞레이즈":event.action==="raise"?"레이즈":"베팅";
  }
  if(state.phase==="complete"){
    if(!verdictVisible)return revealed?"패 공개":"공개 대기";
    return state.result?.winnerSeatIds.includes(seatId)?"승리":"패배";
  }
  if(state.exchangeCounts[seatId]!==undefined&&state.phase==="drawing")return `${state.exchangeCounts[seatId]}장 교환`;
  if(state.currentActorId===seatId)return seatId==="player"?"당신의 차례":"생각 중…";
  return "대기";
}

function standardCardLabel(card:StandardCardId):string {
  const [suit,rank]=card.split("-") as ["clubs"|"diamonds"|"hearts"|"spades",string];
  const suitName={clubs:"클로버",diamonds:"다이아몬드",hearts:"하트",spades:"스페이드"}[suit];
  return `${suitName} ${rank.toUpperCase()}`;
}

function tellLabel(tell:FiveCardDrawTell):string{return tell==="confident"?"만족":tell==="uneasy"?"긴장":"여유로움";}

function SpeechBubble({line}:{line:FiveCardDrawLine}):ReactElement{return <div className="draw-speech" data-line-id={line.id} aria-hidden="true">{line.text.map((beat,index)=><span key={index}>{beat}</span>)}</div>;}

function SeriesProgress({series,stats,dealerSeatId}:{series:FiveCardDrawSeriesState;stats:FiveCardDrawSeriesStats|null;dealerSeatId:FiveCardDrawSeatId}):ReactElement{
  const hand=Math.min(series.targetHands,series.summaries.length+(series.status==="playing"?1:0));
  const player=stats?.standings.find((standing)=>standing.isPlayer);
  const leader=stats?.standings[0];
  return <aside className="draw-series-progress" aria-label="연속 대국 진행 상황">
    <div><strong>{hand}/{series.targetHands}판</strong><span>{Array.from({length:series.targetHands},(_,index)=><i key={index} className={index<series.summaries.length?"is-done":index===hand-1?"is-current":""}/>)}</span></div>
    <small>딜러 {dealerSeatId==="player"?"플레이어":`좌석 ${Number(dealerSeatId.slice(-1))}`}</small>
    <small>내 누적 <b className={(player?.net??0)>=0?"is-positive":"is-negative"}>{signedPoints(player?.net??0)}</b>{leader&&!leader.isPlayer&&<> · 선두 {leader.displayName}</>}</small>
  </aside>;
}

function SeriesResult({state,series,stats,autoContinue,onAutoContinue,onNext,onEnd,onReplay,onReset}:{state:FiveCardDrawState;series:FiveCardDrawSeriesState|null;stats:FiveCardDrawSeriesStats|null;autoContinue:boolean;onAutoContinue(value:boolean):void;onNext():void;onEnd():void;onReplay():void;onReset():void}):ReactElement{
  const intermission=series?.status==="intermission";
  if(series?.status==="complete"&&stats)return <section className="draw-series-final">
    <div className="draw-result"><strong>{stats.standings.find((standing)=>standing.isPlayer)?.rank??"-"}위 · {signedPoints(stats.totalNet)}</strong><span>{stats.handsPlayed}판 {stats.handsWon}승 · 폴드 {stats.folds}회</span><small>최대 팟 {stats.largestPot.toLocaleString("ko-KR")} P{stats.bestHandLabel?` · 최고 패 ${stats.bestHandLabel}`:""}</small>{series.endedEarly&&<em>연속 대국을 일찍 마쳤습니다.</em>}</div>
    <ol className="draw-series-standings">{stats.standings.map((standing)=><li key={standing.seatId}><b>{standing.rank}위</b><span>{standing.displayName}</span><strong>{signedPoints(standing.net)}</strong></li>)}</ol>
    <button className="draw-primary" onClick={onReplay}>같은 상대와 다시</button><button className="draw-secondary" onClick={onReset}>상대 다시 고르기</button>
  </section>;
  return <><section className="draw-result"><strong>{resultLabel(state)}</strong><span>{showdownLabel(state)}</span><small>이번 판 손익 {signedPoints(series?.summaries.at(-1)?.playerNet??0)}</small>{state.foldedSeatIds.length>0&&<em>폴드한 패는 공개되지 않습니다.</em>}</section>{intermission&&<div className="draw-series-actions"><button className="draw-primary" onClick={onNext}>다음 판</button><button className="draw-secondary" aria-pressed={autoContinue} onClick={()=>onAutoContinue(!autoContinue)}>{autoContinue?"자동 진행 멈춤":"자동 진행 계속"}</button><button className="draw-secondary" onClick={onEnd}>여기서 끝내기</button></div>}{!series&&<button className="draw-primary" onClick={onReset}>다시하기</button>}</>;
}

function signedPoints(value:number):string{return `${value>0?"+":""}${value.toLocaleString("ko-KR")} P`;}

function seriesTell(seatId:FiveCardDrawNpcSeatId,series:FiveCardDrawSeriesState|null,fallback:FiveCardDrawTell):FiveCardDrawTell{
  const streak=seriesStreak(seatId,series);return streak>=2?"confident":streak<=-2?"uneasy":fallback;
}
function seriesStreakLabel(seatId:FiveCardDrawSeatId,series:FiveCardDrawSeriesState|null):string{
  const streak=seriesStreak(seatId,series);return Math.abs(streak)>=2?` · ${Math.abs(streak)}연${streak>0?"승":"패"}`:"";
}
function seriesStreak(seatId:FiveCardDrawSeatId,series:FiveCardDrawSeriesState|null):number{
  if(!series)return 0;let value=0;
  for(const summary of [...series.summaries].reverse()){
    const won=summary.winnerSeatIds.includes(seatId);
    if(value===0)value=won?1:-1;else if((value>0)===won)value+=won?1:-1;else break;
  }
  return value;
}

function speechStartDelay(previous:FiveCardDrawState,next:FiveCardDrawState,selected:readonly {line:FiveCardDrawLine}[]):number {
  if(selected.length===0)return 0;
  const steps=planFiveCardDrawStage(previous,next);
  if(previous.phase==="ready"){
    const deal=steps.find((step)=>step.event.kind==="deal")?.event;
    return deal?.kind==="deal"?(deal.cards.length-1)*deal.stagger+deal.flightMs+140:0;
  }
  if(selected.some(({line})=>line.event.startsWith("showdown-"))){
    const verdictIndex=steps.findIndex((step)=>step.event.kind==="verdict");
    return verdictIndex<0?0:steps.slice(0,verdictIndex).reduce((total,step)=>total+step.duration,0);
  }
  return 0;
}

function speechDuration(line:FiveCardDrawLine):number {
  const characters=line.text.join("").replace(/\s/g,"").length;
  const minimum=line.event.startsWith("showdown-")?6_000:line.text.length>1?5_500:4_200;
  return Math.min(7_000,Math.max(minimum,1_200+characters*85+(line.text.length-1)*700));
}

function HandInspector(props:{seatId:FiveCardDrawSeatId;state:FiveCardDrawState;opponents:readonly FiveCardDrawOpponentView[];atlas:CourtAtlas;revealed:boolean;selectedCards:Set<string>;canSelect:boolean;onToggle(card:string):void;onExchange():void;onClose():void;}):ReactElement {
  const folded=props.state.foldedSeatIds.includes(props.seatId);
  const name=props.seatId==="player"?"내 패":`${props.opponents.find((opponent)=>opponent.id===props.state.context.opponents[Number(props.seatId.slice(-1))-1]?.id)?.name??"상대"}의 패`;
  const showFaces=props.seatId==="player"||props.revealed;
  return <div className="draw-hand-modal" role="dialog" aria-modal="true" aria-label={`${name} 크게 보기`} onPointerDown={(event)=>{if(event.target===event.currentTarget)props.onClose();}}>
    <section><header><div><span className="draw-eyebrow">HAND VIEW</span><h2>{name}</h2></div><button className="draw-icon-button" type="button" onClick={props.onClose} aria-label="닫기">×</button></header>
      {folded?<p className="draw-hidden-hand">폴드한 패는 공개되지 않습니다.</p>:<div className="draw-modal-cards">{props.state.hands[props.seatId].map((card,index)=>props.canSelect?<button key={card} className="draw-modal-card" aria-pressed={props.selectedCards.has(card)} onClick={()=>props.onToggle(card)} aria-label={`${standardCardLabel(card)}, ${index+1}번째 카드`}><StandardPlayingCard id={card} atlas={props.atlas} decorative/><span>{props.selectedCards.has(card)?"교환":"유지"}</span></button>:<div key={`${props.seatId}-${index}`} className="draw-modal-card">{showFaces?<StandardPlayingCard id={card} atlas={props.atlas}/>:<PlayingCardBack/>}</div>)}</div>}
      {!showFaces&&<p className="draw-hidden-hand">쇼다운 전에는 상대의 카드 뒷면만 볼 수 있습니다.</p>}
      {props.canSelect&&<div className="draw-modal-actions"><small>최대 3장까지 고르세요.</small><button className="draw-primary" onClick={props.onExchange}>{props.selectedCards.size===0?"그대로 승부":`${props.selectedCards.size}장 교환`}</button></div>}
    </section>
  </div>;
}

function PortraitInspector(props:{seatId:FiveCardDrawNpcSeatId;state:FiveCardDrawState;opponents:readonly FiveCardDrawOpponentView[];tell:FiveCardDrawTell;onClose():void;}):ReactElement {
  const opponent=props.state.context.opponents[Number(props.seatId.slice(-1))-1];
  const view=props.opponents.find((candidate)=>candidate.id===opponent?.id);
  const portrait=view?.detailPortraits?.[props.tell]??view?.portraits?.[props.tell]??view?.portrait;
  return <div className="draw-portrait-modal" role="dialog" aria-modal="true" aria-label={`${opponent?.name??"NPC"} 감정 초상`} onPointerDown={(event)=>{if(event.target===event.currentTarget)props.onClose();}}>
    <section><button className="draw-icon-button" type="button" onClick={props.onClose} aria-label="닫기">×</button>{portrait?<img src={portrait} alt={`${opponent?.name??"NPC"} · ${tellLabel(props.tell)}`}/>:<div className="draw-portrait-fallback">{opponent?.name.slice(0,1)}</div>}<div><span className="draw-eyebrow">EMOTION PORTRAIT</span><h2>{opponent?.name}</h2><strong className={`draw-tell draw-tell-${props.tell}`}>{tellLabel(props.tell)}</strong></div></section>
  </div>;
}
function fillUnique(current:readonly string[],count:number,opponents:readonly FiveCardDrawOpponentView[]):string[]{const output=[...new Set(current.filter((id)=>opponents.some((opponent)=>opponent.id===id)))].slice(0,count);for(const opponent of opponents){if(output.length>=count)break;if(!output.includes(opponent.id))output.push(opponent.id);}return output;}
function actionLabel(action:FiveCardDrawBetAction,state:FiveCardDrawState):string {const cost=actionCost(action,state);return action==="check"?"체크":action==="fold"?"폴드":`${action==="call"?"콜":action==="raise"&&state.currentBetUnits===2?"맞레이즈":action==="raise"?"레이즈":"베팅"} ${cost} P`;}
function actionCost(action:FiveCardDrawBetAction,state:FiveCardDrawState):number {if(!state.baseStake)return 0;const own=state.streetContributionsUnits.player;const target=action==="bet"?1:action==="raise"?state.currentBetUnits+1:action==="call"?state.currentBetUnits:own;return Math.max(0,target-own)*state.baseStake;}
function phaseLabel(state:FiveCardDrawState):string {return state.phase==="opening-bet"?"교환 전 베팅":state.phase==="drawing"?"카드 교환":state.phase==="closing-bet"?"교환 후 베팅":"쇼다운";}
function resultLabel(state:FiveCardDrawState):string {return state.result?.outcome==="player-win"?"승리":state.result?.outcome==="tie"?"팟 분배":"패배";}
function showdownLabel(state:FiveCardDrawState):string {const result=state.result;if(!result)return "";const player=result.values.player;const winners=result.winnerSeatIds.map((seat)=>seat==="player"?"플레이어":state.context.opponents[Number(seat.slice(-1))-1]?.name??seat);return `${player?`내 패 ${player.label} · `:""}${winners.join(", ")} 승리`;}

export default FiveCardDrawScreen;
