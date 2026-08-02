import { standardRankValue } from "@lucky-arcade/card-table";
import { resultHash, WAGER_MULTIPLIERS, leveragedWagerCredit, wagerExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import { PlayingCardBack, StandardPlayingCard, type CourtAtlas, type StandardPlayingCardId } from "@lucky-arcade/ui/playing-card";
import { useSlideHighlight } from "@lucky-arcade/ui/slide-highlight";
import { IconArrowLeft, IconCopy, IconHelpCircle, IconRefresh } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createIndianPokerState, indianPokerAuditTrail, indianPokerRanking, publicIndianPokerCards, reduceIndianPoker } from "../engine.ts";
import { chooseIndianPokerSpectatorPlayerDecision } from "../replay.ts";
import { INDIAN_POKER_BET_SIZES, INDIAN_POKER_ROUND_COUNTS, INDIAN_POKER_STAKES, type IndianPokerAction, type IndianPokerCartridge, type IndianPokerCharacter, type IndianPokerRoundCount, type IndianPokerRoundMove, type IndianPokerStake, type IndianPokerState } from "../contracts.ts";
import "./indian-poker.css";

export interface IndianPokerScreenProps {
  cartridge: IndianPokerCartridge;
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  atlas: CourtAtlas;
  initialState: IndianPokerState | null;
  walletBalance?: number;
  busy?: boolean;
  error?: string;
  initialMultiplier?: WagerMultiplier;
  opponentAvailability?: Readonly<Record<string, { available: boolean; label: string; availableAtUtcSecond?: number }>>;
  opponentRecords?: Readonly<Record<string, { played: number; wins: number; losses: number; draws: number }>>;
  presentationOnly?: boolean;
  spectatorPlayer?: IndianPokerCharacter;
  onOpponentSelectionChange?(id: string): void;
  onStart(stake: IndianPokerStake, multiplier: WagerMultiplier, roundCount: IndianPokerRoundCount): Promise<IndianPokerState>;
  onPersist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void>;
  onExit(): void;
}

export function IndianPokerScreen({ cartridge, assets, thumbAssets, atlas, initialState, walletBalance, busy = false, error, initialMultiplier = 2, opponentAvailability = {}, opponentRecords = {}, presentationOnly=false, spectatorPlayer, onOpponentSelectionChange, onStart, onPersist, onExit }: IndianPokerScreenProps) {
  const [state, setState] = useState(() => initialState ?? createIndianPokerState(cartridge, new Date().toISOString().slice(0, 10)));
  const [stake, setStake] = useState<IndianPokerStake>(INDIAN_POKER_STAKES[0]), [multiplier, setMultiplier] = useState<WagerMultiplier>(initialMultiplier);
  const [starting, setStarting] = useState(false), [manualPaused, setManualPaused] = useState(false), [copied, setCopied] = useState<"idle"|"done"|"failed">("idle");
  const opponentPickerRef = useSlideHighlight<HTMLDivElement>();
  const [hiddenPaused, setHiddenPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const stateRef = useRef(state), queueRef = useRef(Promise.resolve()), responseDelayRef = useRef<PausableDelay | null>(null), randomSelectionRef = useRef(0);
  const paused = manualPaused || hiddenPaused;
  const characters = useMemo(() => new Map(cartridge.characters.map((character) => [character.id, character])), [cartridge]);
  const opponent = characters.get(state.opponentId) ?? cartridge.characters[0]; if (!opponent) throw new Error("indian_poker_character_missing");
  const portraitId = opponent.portraits[state.npcReaction], interactionBusy = busy || starting;
  const selectedOpponentUnavailable = opponentAvailability[state.opponentId]?.available === false;
  const availableCharacters = cartridge.characters.filter((character) => opponentAvailability[character.id]?.available !== false);

  const dispatch = (action: IndianPokerAction) => {
    if (interactionBusy) return;
    const previous = stateRef.current, next = reduceIndianPoker(cartridge, previous, action);
    stateRef.current = next; setState(next); queueRef.current = queueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action));
  };

  useEffect(() => {
    if (state.status !== "ready" || !selectedOpponentUnavailable) return;
    const candidate = availableCharacters[0]; if (!candidate || candidate.id === state.opponentId) return;
    dispatch({ type: "select-opponent", opponentId: candidate.id }); onOpponentSelectionChange?.(candidate.id);
  }, [availableCharacters, onOpponentSelectionChange, selectedOpponentUnavailable, state.opponentId, state.status]);

  const startMatch = () => {
    if (interactionBusy || selectedOpponentUnavailable || (walletBalance ?? 0) < wagerExposure(stake, multiplier)) return;
    setStarting(true); queueRef.current = queueRef.current.catch(() => undefined).then(async () => { const next = await onStart(stake, multiplier, stateRef.current.roundCount); stateRef.current = next; setState(next); }).catch(() => undefined).finally(() => setStarting(false));
  };

  useEffect(() => { if (typeof document === "undefined") return; const update=()=>setHiddenPaused(document.hidden);update();document.addEventListener("visibilitychange",update);return()=>document.removeEventListener("visibilitychange",update); }, []);
  useEffect(() => {
    responseDelayRef.current?.cancel(); responseDelayRef.current=null;
    if(state.status!=="npc-action"||busy)return;const expected=state.sequence;const delay=createPausableDelay(650,()=>{if(stateRef.current.status==="npc-action"&&stateRef.current.sequence===expected)dispatch({type:"npc-act"});});responseDelayRef.current=delay;if(!paused)delay.resume();return()=>{delay.cancel();if(responseDelayRef.current===delay)responseDelayRef.current=null;};
  },[busy,state.sequence,state.status]);
  useEffect(()=>{const delay=responseDelayRef.current;if(!delay)return;if(paused)delay.pause();else delay.resume();},[paused,state.sequence,state.status]);
  useEffect(()=>{
    if(!presentationOnly||!spectatorPlayer||busy||paused||(state.status!=="player-action"&&state.status!=="showdown"))return;
    const expected=state.sequence;
    const handle=window.setTimeout(()=>{
      if(stateRef.current.sequence!==expected)return;
      if(stateRef.current.status==="player-action")dispatch({type:"player-act",decision:chooseIndianPokerSpectatorPlayerDecision(stateRef.current,spectatorPlayer)});
      else if(stateRef.current.status==="showdown")dispatch({type:"next-round"});
    },state.status==="showdown"?900:700);
    return()=>window.clearTimeout(handle);
  },[busy,paused,presentationOnly,spectatorPlayer,state.sequence,state.status]);
  useEffect(()=>{if(typeof Image==="undefined")return;for(const id of [...Object.values(opponent.portraits),opponent.despairPortrait]){const url=assets[id];if(url){const image=new Image();image.decoding="async";image.src=url;}}},[assets,opponent]);

  const lastRound=state.history.at(-1),showPlayerCard=presentationOnly||state.status==="showdown"&&lastRound?.playerCardRevealed===true;
  const canPause=state.status==="player-action"||state.status==="npc-action",result=state.outcome==="player"?"승리":state.outcome==="npc"?`${opponent.name}의 승리`:"무승부";
  const exposure=wagerExposure(state.status==="ready"?stake:state.stake??stake,multiplier),returned=leveragedWagerCredit(state.stake??stake,state.creditAmount,multiplier);
  const lastMove=state.roundMoves.at(-1),facingNpcBet=state.status==="player-action"&&lastMove?.seatId==="npc"&&lastMove.kind==="bet";

  async function copyAudit():Promise<void>{if(state.status!=="complete")return;try{const text=JSON.stringify({...indianPokerAuditTrail(state),resultHash:resultHash(state)},null,2);if(!navigator.clipboard)throw new Error("clipboard_unavailable");await navigator.clipboard.writeText(text);setCopied("done");}catch{setCopied("failed");}}

  return <main className="indian-poker-shell">
    <header><button onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button><div><span>THE MARGIN · HEADS-UP TABLE</span><h1>인디언 포커</h1></div><div className="indian-poker-meter">{walletBalance!==undefined&&<b>{walletBalance.toLocaleString("ko-KR")} P</b>}<strong>{state.round}/{state.roundCount} 라운드</strong></div><button className="indian-poker-pause" disabled={!canPause} onClick={()=>setManualPaused((value)=>!value)}>{paused?"계속":"일시정지"}</button></header>
    <section className="indian-poker-table">
      <article className={`indian-poker-npc reaction-${state.npcReaction}`}><img src={assets[portraitId]} alt={`${opponent.name}의 ${reactionLabel(state.npcReaction)} 표정`} /><div><strong>{opponent.name}</strong><span>{state.npcChips}칩 · {reactionLabel(state.npcReaction)}</span></div><div className="indian-poker-forehead">{state.npcCardId?<ForeheadCard key={state.npcCardId} id={state.npcCardId} atlas={atlas} revealed/>:<EmptyCard/>}</div></article>
      <div className="indian-poker-center">
        {state.status==="ready"&&<section className="indian-poker-ready"><h2>상대를 고르세요</h2><p>상대 카드는 보이지만 내 카드는 보이지 않습니다. 표정과 베팅을 함께 읽으세요.</p>
          <details className="indian-poker-help" open><summary><IconHelpCircle/>세 가지만 기억하세요</summary><p>상대는 당신의 카드를 보고 있습니다. 긴장은 강한 카드의 신호일 수 있지만 어떤 인물은 거짓 표정을 짓습니다. 불리하면 포기해 앤티만 잃을 수 있습니다.</p></details>
          <div className="indian-poker-opponent-picker ca-slide" role="list" aria-label="상대 선택" ref={opponentPickerRef}>{cartridge.characters.map((character)=>{const selected=character.id===state.opponentId,availability=opponentAvailability[character.id],record=opponentRecords[character.id],unavailable=!selected&&availability?.available===false;return <button type="button" role="listitem" className={unavailable?"is-unavailable":undefined} key={character.id} aria-pressed={selected} aria-disabled={unavailable||undefined} disabled={unavailable} onClick={()=>{dispatch({type:"select-opponent",opponentId:character.id});onOpponentSelectionChange?.(character.id);}}><img src={thumbAssets[character.portraits.neutral]} alt="" loading="lazy"/><span>{character.name}<small>{selected&&!selectedOpponentUnavailable?"초대 수락":availability?.label}</small><em>{record?recordLabel(record):"첫 대국"}</em></span></button>;})}</div>
          <button className="indian-poker-random" disabled={availableCharacters.length===0} onClick={()=>{randomSelectionRef.current+=1;const candidate=availableCharacters[(state.sequence+randomSelectionRef.current)%availableCharacters.length];if(candidate){dispatch({type:"select-opponent",opponentId:candidate.id});onOpponentSelectionChange?.(candidate.id);}}}>무작위 상대</button>
          <div className="indian-poker-formats" aria-label="라운드 수 선택">{INDIAN_POKER_ROUND_COUNTS.map((value)=><button key={value} aria-pressed={state.roundCount===value} onClick={()=>dispatch({type:"select-round-count",roundCount:value})}>{value}라운드{value===7&&<small> 기본</small>}</button>)}</div>
          <div className="indian-poker-stakes">{INDIAN_POKER_STAKES.map((value)=><button key={value} aria-pressed={stake===value} disabled={interactionBusy||(walletBalance??0)<wagerExposure(value,multiplier)} onClick={()=>setStake(value)}>{value} P</button>)}</div>
          <div className="indian-poker-multipliers" aria-label="배율 선택">{WAGER_MULTIPLIERS.map((value)=><button key={value} aria-pressed={multiplier===value} disabled={interactionBusy||(walletBalance??0)<wagerExposure(stake,value)} onClick={()=>setMultiplier(value)}>{value}배</button>)}</div><small>{exposure} P를 최대 손실액으로 예약합니다. 종료 시 남은 칩의 순손익도 {multiplier}배입니다.</small>{selectedOpponentUnavailable&&<p className="indian-poker-availability">선택한 NPC가 다른 테이블에서 게임 중입니다.</p>}<button className="primary" disabled={interactionBusy||selectedOpponentUnavailable||(walletBalance??0)<exposure} onClick={startMatch}>시작</button>
        </section>}
        {state.status==="player-action"&&(presentationOnly?<section className="indian-poker-decision"><span className="indian-poker-pot">팟 {state.pot}칩</span><h2>{spectatorPlayer?.name}가 판을 읽는 중…</h2><p>두 NPC의 표정과 베팅 흐름을 그대로 관전합니다.</p></section>:<section className="indian-poker-decision"><span className="indian-poker-pot">팟 {state.pot}칩</span><h2>{facingNpcBet?`${opponent.name}가 ${state.currentBet}칩 걸었습니다`:state.roundOpener==="player"&&state.roundMoves.length===0?"당신이 먼저 행동합니다":`${opponent.name}가 체크했습니다`}</h2><p>상대 카드와 당신을 바라보는 표정을 함께 읽으세요.</p><div className="indian-poker-actions">{facingNpcBet?<><button onClick={()=>dispatch({type:"player-act",decision:{kind:"fold"}})}>폴드 · 앤티만 손실</button><button className="primary" disabled={state.playerChips<state.currentBet} onClick={()=>dispatch({type:"player-act",decision:{kind:"call"}})}>콜 · {state.currentBet}칩</button></>:<><button onClick={()=>dispatch({type:"player-act",decision:{kind:"fold"}})}>포기</button><button onClick={()=>dispatch({type:"player-act",decision:{kind:"check"}})}>체크</button>{INDIAN_POKER_BET_SIZES.map((amount)=><button key={amount} className="primary" disabled={state.playerChips<amount} onClick={()=>dispatch({type:"player-act",decision:{kind:"bet",amount}})}>{amount}칩 베팅</button>)}</>}</div></section>)}
        {state.status==="npc-action"&&<section><span className="indian-poker-pot">팟 {state.pot}칩</span><h2>{opponent.name}가 판을 읽는 중…</h2></section>}
        {state.status==="showdown"&&lastRound&&<section className="indian-poker-round-result"><span className="indian-poker-pot">{lastRound.pot}칩 승부</span><h2>{lastRound.winner==="player"?"라운드 승리":lastRound.winner==="npc"?`${opponent.name}의 라운드 승리`:"같은 숫자 · 무승부"}</h2><p>{actionSummary(lastRound.moves)} · 내 칩 {signed(lastRound.playerChipDelta)}</p>{!lastRound.playerCardRevealed&&<strong className="indian-poker-defense">카드를 숨기고 손실을 {Math.abs(lastRound.playerChipDelta)}칩으로 제한했습니다.</strong>}<button className="primary" onClick={()=>dispatch({type:"next-round"})}>{state.round>=state.roundCount||state.playerChips===0||state.npcChips===0?"최종 결과":"다음 라운드"}</button></section>}
        {state.status==="complete"&&<section className="indian-poker-result"><h2>{result}</h2><p>나 {state.playerChips}칩 · {opponent.name} {state.npcChips}칩</p><small className="indian-poker-record">상대 전적 · {recordLabel(opponentRecords[opponent.id])}</small><strong>{returned.toLocaleString("ko-KR")} P 반환 · {multiplier}배</strong><ol>{indianPokerRanking(state).map((standing)=><li key={standing.seatId}><b>{standing.rank}위</b><span>{standing.seatId==="player"?"플레이어":opponent.name}</span><em>{standing.chips}칩</em></li>)}</ol><div className="indian-poker-result-actions"><button onClick={()=>void copyAudit()}><IconCopy/>{copied==="done"?"복사 완료":copied==="failed"?"복사 실패":"대국 기록 복사"}</button><button className="primary" disabled={busy} onClick={()=>dispatch({type:"restart",seed:`${state.seed}:next:${state.sequence}`})}><IconRefresh/>다시하기</button></div></section>}
        {state.status!=="ready"&&<CardHistory state={state} atlas={atlas}/>} {error&&<p role="alert">{error}</p>}
      </div>
      <article className={`indian-poker-player${presentationOnly?" is-spectator-npc":""}`}><div>{presentationOnly&&spectatorPlayer&&<img className="indian-poker-player-portrait" src={assets[spectatorPlayer.portraits.neutral]} alt=""/>}<strong>{presentationOnly?spectatorPlayer?.name??"관전 NPC":"플레이어"}</strong><span>{state.playerChips}칩</span></div><div className="indian-poker-forehead">{state.playerCardId?<ForeheadCard key={state.playerCardId} id={state.playerCardId} atlas={atlas} revealed={showPlayerCard}/>:<EmptyCard/>}</div></article>{paused&&canPause&&<div className="indian-poker-pause-shield" role="status">일시정지됨</div>}
    </section>
  </main>;
}

function CardHistory({state,atlas}:{state:IndianPokerState;atlas:CourtAtlas}){const cards=publicIndianPokerCards(state),high=[14,13,12,11].map((rank)=>({rank,seen:cards.filter((card)=>standardRankValue(card)===rank).length}));return <aside className="indian-poker-history" aria-label="공개 카드 기록"><div><strong>공개 카드</strong>{high.map(({rank,seen})=><span key={rank}>{rankLabel(rank)} {seen}/4</span>)}</div><ol>{state.history.map((round)=><li key={round.round}><small>{round.round}R</small><MiniCard id={round.npcCardId} atlas={atlas}/>{round.playerCardRevealed?<MiniCard id={round.playerCardId} atlas={atlas}/>:<PlayingCardBack label={`${round.round}라운드 비공개 카드`}/>}</li>)}</ol></aside>;}
function MiniCard({id,atlas}:{id:string;atlas:CourtAtlas}){return <StandardPlayingCard id={id as StandardPlayingCardId} atlas={atlas} decorative/>;}
function ForeheadCard({id,atlas,revealed}:{id:string;atlas:CourtAtlas;revealed:boolean}){return <div className="indian-poker-card-scene" data-face-up={revealed}><div className="indian-poker-card-inner"><div className="indian-poker-card-side indian-poker-card-back"><PlayingCardBack decorative={revealed} label="보이지 않는 내 카드"/></div><div className="indian-poker-card-side indian-poker-card-front"><StandardPlayingCard id={id as StandardPlayingCardId} atlas={atlas} decorative={!revealed}/></div></div></div>;}
function EmptyCard(){return <div className="indian-poker-card-empty" aria-hidden="true">카드 대기</div>;}
function recordLabel(record:{wins:number;losses:number;draws:number}|undefined):string{const wins=record?.wins??0,losses=record?.losses??0,draws=record?.draws??0;return `${wins}승 ${losses}패${draws>0?` ${draws}무`:""}`;}
function reactionLabel(reaction:string):string{return reaction==="pleased"?"여유":reaction==="tense"?"긴장":"무표정";}
function signed(value:number):string{return `${value>=0?"+":""}${value}`;}
function rankLabel(rank:number):string{return rank===14?"A":rank===13?"K":rank===12?"Q":"J";}
function actionSummary(moves:readonly IndianPokerRoundMove[]):string{return moves.map((move)=>`${move.seatId==="player"?"나":"상대"} ${move.kind==="check"?"체크":move.kind==="bet"?`${move.amount}칩 베팅`:move.kind==="call"?`${move.amount}칩 콜`:"폴드"}`).join(" · ");}

interface PausableDelay{pause():void;resume():void;cancel():void;}
function createPausableDelay(durationMs:number,complete:()=>void):PausableDelay{let remaining=durationMs,started=0,handle:ReturnType<typeof setTimeout>|null=null,cancelled=false;const finish=()=>{if(cancelled)return;handle=null;remaining=0;complete();};return{pause(){if(handle===null)return;clearTimeout(handle);handle=null;remaining=Math.max(0,remaining-(Date.now()-started));},resume(){if(cancelled||handle!==null)return;if(remaining<=0){finish();return;}started=Date.now();handle=setTimeout(finish,remaining);},cancel(){if(handle!==null)clearTimeout(handle);handle=null;cancelled=true;}};}
