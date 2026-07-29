import { IconArrowLeft, IconCards, IconRefresh } from "@tabler/icons-react";
import type { StandardCardId } from "@lucky-arcade/card-table";
import { StandardPlayingCard, PlayingCardBack, type CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useMemo, useState, type ReactElement } from "react";
import {
  FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS, FIVE_CARD_DRAW_STAKES, analyzeFiveCardDrawGuide, betActionGuide, exchangeCountGuide,
  legalPlayerBetActions, type FiveCardDrawAction, type FiveCardDrawBetAction, type FiveCardDrawOpponent,
  type FiveCardDrawSeatId, type FiveCardDrawStake, type FiveCardDrawState,
} from "../index.ts";
import "./five-card-draw.css";

export interface FiveCardDrawOpponentView extends FiveCardDrawOpponent { portrait?: string }
export interface FiveCardDrawScreenProps {
  state:FiveCardDrawState;opponents:readonly FiveCardDrawOpponentView[];atlas:CourtAtlas;balance:number;busy:boolean;error:string;
  beginner:boolean;onBeginner(value:boolean):void;onStart(opponents:readonly FiveCardDrawOpponentView[],stake:FiveCardDrawStake):void;
  onAction(action:FiveCardDrawAction):void;onReset():void;onResetWallet():void;onExit():void;
}

export function FiveCardDrawScreen(props:FiveCardDrawScreenProps):ReactElement {
  const [playerCount,setPlayerCount]=useState<2|3|4>(()=>(props.state.context.opponents.length+1) as 2|3|4);
  const [selectedIds,setSelectedIds]=useState<string[]>(()=>props.state.context.opponents.map((opponent)=>opponent.id));
  const [stake,setStake]=useState<FiveCardDrawStake>(10);
  const [selectedCards,setSelectedCards]=useState<Set<string>>(()=>new Set());
  const guide=useMemo(()=>props.state.hands.player.length===5?analyzeFiveCardDrawGuide(props.state.hands.player):null,[props.state.hands.player]);
  const playerActions=legalPlayerBetActions(props.state);
  const setupOpponents=Array.from({length:playerCount-1},(_,index)=>props.opponents.find((opponent)=>opponent.id===selectedIds[index])??props.opponents[index]!);

  function changeCount(value:2|3|4):void {setPlayerCount(value);setSelectedIds((current)=>fillUnique(current,value-1,props.opponents));}
  function selectAt(index:number,id:string):void {setSelectedIds((current)=>{const next=[...current];next[index]=id;return fillUnique(next,playerCount-1,props.opponents);});}
  function randomize():void {const random=new Uint32Array(1);crypto.getRandomValues(random);const start=random[0]!%props.opponents.length;setSelectedIds(Array.from({length:playerCount-1},(_,index)=>props.opponents[(start+index*7)%props.opponents.length]!.id));}
  function toggle(card:string):void {if(props.state.phase!=="drawing"||props.state.currentActorId!=="player")return;setSelectedCards((current)=>{const next=new Set(current);if(next.has(card))next.delete(card);else if(next.size<3)next.add(card);return next;});}
  function exchange():void {props.onAction({type:"exchange",cardIds:[...selectedCards] as StandardCardId[]});setSelectedCards(new Set());}

  if(props.state.phase==="ready")return <main className="draw-poker-shell draw-poker-lobby">
    <header><button className="draw-icon-button" onClick={props.onExit} aria-label="카지노로 돌아가기"><IconArrowLeft/></button><div><span className="draw-eyebrow">ADMIN PREVIEW · TEMEROSA CASINO</span><h1>파이브 카드 드로 포커</h1></div><strong>{props.balance.toLocaleString("ko-KR")} 시험 P</strong></header>
    <section className="draw-setup">
      <div className="draw-rules"><IconCards/><div><h2>카드 5장, 두 번의 베팅</h2><p>카드를 0~3장 교환하고 상대의 행동을 읽어 가장 높은 포커 족보를 만드세요.</p></div></div>
      <fieldset><legend>테이블 인원</legend><div className="draw-segmented">{([2,3,4] as const).map((count)=><button key={count} aria-pressed={playerCount===count} onClick={()=>changeCount(count)}>{count}인</button>)}</div></fieldset>
      <fieldset><legend>함께할 상대</legend><div className="draw-opponent-selects">{setupOpponents.map((chosen,index)=><label key={index}>좌석 {index+1}<select value={chosen.id} onChange={(event)=>selectAt(index,event.target.value)}>{props.opponents.filter((candidate)=>candidate.id===chosen.id||!setupOpponents.some((selected)=>selected.id===candidate.id)).map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>)}</div><button className="draw-secondary" onClick={randomize}><IconRefresh size={16}/>무작위로 채우기</button></fieldset>
      <fieldset><legend>기본 판돈</legend><div className="draw-segmented">{FIVE_CARD_DRAW_STAKES.map((value)=><button key={value} aria-pressed={stake===value} onClick={()=>setStake(value)} disabled={props.balance<value*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS}>{value} P</button>)}</div><small>최대 노출 {stake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS} 시험 P · 사용하지 않은 예약액은 반환됩니다.</small></fieldset>
      <label className="draw-guide-toggle"><input type="checkbox" checked={props.beginner} onChange={(event)=>props.onBeginner(event.target.checked)}/><span><strong>초보자 안내</strong><small>현재 족보, 교환 후보와 베팅 용어를 설명합니다.</small></span></label>
      {props.error&&<p className="draw-error" role="alert">{props.error}</p>}
      <div className="draw-start-actions"><button className="draw-primary" disabled={props.busy||setupOpponents.length!==playerCount-1||new Set(setupOpponents.map((opponent)=>opponent.id)).size!==setupOpponents.length||props.balance<stake*FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS} onClick={()=>props.onStart(setupOpponents,stake)}>시험 대국 시작</button><button className="draw-secondary" onClick={props.onResetWallet}>시험칩 초기화</button></div>
    </section>
  </main>;

  const pot=props.state.result?.pot??props.state.baseStake! * Object.values(props.state.contributionsUnits).reduce((sum,value)=>sum+value,0);
  return <main className="draw-poker-shell">
    <header><button className="draw-icon-button" onClick={props.onExit} aria-label="카지노로 돌아가기"><IconArrowLeft/></button><div><span className="draw-eyebrow">ADMIN PREVIEW</span><h1>파이브 카드 드로 포커</h1></div><strong>{props.balance.toLocaleString("ko-KR")} 시험 P</strong></header>
    <section className="draw-table">
      <div className="draw-pot"><span>팟</span><strong>{pot.toLocaleString("ko-KR")} P</strong><small>{phaseLabel(props.state)}</small></div>
      <div className={`draw-opponents count-${props.state.context.opponents.length}`}>{props.state.context.opponents.map((opponent,index)=>{
        const seatId=`npc-${index+1}` as FiveCardDrawSeatId,view=props.opponents.find((item)=>item.id===opponent.id),revealed=props.state.result?.hands[seatId];
        return <article className={`draw-seat${props.state.currentActorId===seatId?" is-active":""}${props.state.foldedSeatIds.includes(seatId)?" is-folded":""}`} key={seatId}>
          <div className="draw-seat-title">{view?.portrait?<img src={view.portrait} alt=""/>:<span>{opponent.name.slice(0,1)}</span>}<div><strong>{opponent.name}</strong><small>{props.state.foldedSeatIds.includes(seatId)?"폴드":props.state.exchangeCounts[seatId]!==undefined?`${props.state.exchangeCounts[seatId]}장 교환`:props.state.currentActorId===seatId?"생각 중…":"대기"}</small></div></div>
          <div className="draw-cards compact">{props.state.hands[seatId].map((card,cardIndex)=>revealed?<StandardPlayingCard key={card} id={card} atlas={props.atlas}/>:<PlayingCardBack key={`${seatId}-${cardIndex}`}/>)}</div>
          {props.beginner&&props.state.exchangeCounts[seatId]!==undefined&&<p className="draw-opponent-hint">{exchangeCountGuide(props.state.exchangeCounts[seatId]!)}</p>}
        </article>;
      })}</div>
      <article className={`draw-seat draw-player${props.state.currentActorId==="player"?" is-active":""}${props.state.foldedSeatIds.includes("player")?" is-folded":""}`}>
        <div className="draw-seat-title"><span>나</span><div><strong>플레이어</strong><small>{props.state.currentActorId==="player"?"당신의 차례":props.state.foldedSeatIds.includes("player")?"폴드":"대국 중"}</small></div></div>
        <div className="draw-cards">{props.state.hands.player.map((card)=><button key={card} disabled={props.state.phase!=="drawing"||props.state.currentActorId!=="player"} aria-pressed={selectedCards.has(card)} onClick={()=>toggle(card)}><StandardPlayingCard id={card} atlas={props.atlas}/><span>{selectedCards.has(card)?"교환":""}</span></button>)}</div>
      </article>
      {props.beginner&&guide&&<aside className="draw-coach"><span className="draw-eyebrow">초보자 안내</span><h2>현재 패 · {guide.handLabel}</h2><p>{guide.summary}</p><strong>{guide.recommendation}</strong>{props.state.phase==="drawing"&&props.state.currentActorId==="player"&&<button onClick={()=>setSelectedCards(new Set(guide.discardCardIds))}>추천 카드 표시</button>}</aside>}
      <div className="draw-actions">
        {props.state.phase==="drawing"&&props.state.currentActorId==="player"&&<button className="draw-primary" onClick={exchange}>{selectedCards.size===0?"그대로 승부":`${selectedCards.size}장 교환`}</button>}
        {playerActions.map((action)=><button key={action} className={action==="fold"?"draw-danger":"draw-primary"} onClick={()=>props.onAction({type:"bet",action})}>{actionLabel(action,props.state)}</button>)}
        {props.beginner&&playerActions.length>0&&<p className="draw-action-guide">{playerActions.map((action)=>betActionGuide(action,actionCost(action,props.state))).join(" · ")}</p>}
        {props.state.phase==="complete"&&<><section className="draw-result"><strong>{resultLabel(props.state)}</strong><span>{showdownLabel(props.state)}</span><small>내 정산 크레딧 {props.state.result?.playerCredit.toLocaleString("ko-KR")} P</small></section><button className="draw-primary" onClick={props.onReset}>다시하기</button></>}
        {props.error&&<p className="draw-error" role="alert">{props.error}</p>}
      </div>
    </section>
  </main>;
}

function fillUnique(current:readonly string[],count:number,opponents:readonly FiveCardDrawOpponentView[]):string[]{const output=[...new Set(current.filter((id)=>opponents.some((opponent)=>opponent.id===id)))].slice(0,count);for(const opponent of opponents){if(output.length>=count)break;if(!output.includes(opponent.id))output.push(opponent.id);}return output;}
function actionLabel(action:FiveCardDrawBetAction,state:FiveCardDrawState):string {const cost=actionCost(action,state);return action==="check"?"체크":action==="fold"?"폴드":`${action==="call"?"콜":action==="raise"?"레이즈":"베팅"} ${cost} P`;}
function actionCost(action:FiveCardDrawBetAction,state:FiveCardDrawState):number {if(!state.baseStake)return 0;const own=state.streetContributionsUnits.player;const target=action==="bet"?1:action==="raise"?2:action==="call"?state.currentBetUnits:own;return Math.max(0,target-own)*state.baseStake;}
function phaseLabel(state:FiveCardDrawState):string {return state.phase==="opening-bet"?"교환 전 베팅":state.phase==="drawing"?"카드 교환":state.phase==="closing-bet"?"교환 후 베팅":"쇼다운";}
function resultLabel(state:FiveCardDrawState):string {return state.result?.outcome==="player-win"?"승리":state.result?.outcome==="tie"?"팟 분배":"패배";}
function showdownLabel(state:FiveCardDrawState):string {const result=state.result;if(!result)return "";const player=result.values.player;const winners=result.winnerSeatIds.map((seat)=>seat==="player"?"플레이어":state.context.opponents[Number(seat.slice(-1))-1]?.name??seat);return `${player?`내 패 ${player.label} · `:""}${winners.join(", ")} 승리`;}
