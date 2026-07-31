import { STANDARD_CARD_DECK, shuffledStandardDeck, type StandardCardId } from "@lucky-arcade/card-table";
import { resultHash } from "@lucky-arcade/engine";
import {
  FIVE_CARD_DRAW_CONTRACT, FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS, FIVE_CARD_DRAW_RULES_VERSION, FIVE_CARD_DRAW_STAKES,
  FIVE_CARD_DRAW_STREET_CAP_UNITS,
  type FiveCardDrawAction, type FiveCardDrawBetAction, type FiveCardDrawBetRecord, type FiveCardDrawContext, type FiveCardDrawNpcSeatId,
  type FiveCardDrawOutcome, type FiveCardDrawPublicView, type FiveCardDrawResult, type FiveCardDrawSeatId, type FiveCardDrawStake, type FiveCardDrawState,
} from "./contracts.ts";
import { comparePokerHands, evaluatePokerHand } from "./hand.ts";
import { chooseNpcBetAction, decideNpcDraw, selectPokerTell } from "./npc.ts";

const ALL_SEATS: readonly FiveCardDrawSeatId[] = ["player","npc-1","npc-2","npc-3"];

export function createFiveCardDrawState(context: FiveCardDrawContext, dealerIndex=0): FiveCardDrawState {
  validateContext(context);
  const seatOrder = ["player", ...context.opponents.map((_,index)=>`npc-${index+1}` as FiveCardDrawNpcSeatId)] as FiveCardDrawSeatId[];
  return {
    contract:FIVE_CARD_DRAW_CONTRACT,rulesVersion:FIVE_CARD_DRAW_RULES_VERSION,
    context:{sessionId:context.sessionId,opponents:context.opponents.map((opponent)=>({...opponent,persona:{...opponent.persona}})),
      ...(context.sessionRead?{sessionRead:{...context.sessionRead}}:{})},
    phase:"ready",sequence:0,seed:null,baseStake:null,deck:[],deckCursor:0,seatOrder,dealerIndex:dealerIndex%seatOrder.length,
    currentActorId:null,pendingSeatIds:[],activeSeatIds:[],foldedSeatIds:[],hands:emptyCards(),discarded:emptyCards(),exchangeCounts:{},
    contributionsUnits:emptyNumbers(),streetContributionsUnits:emptyNumbers(),currentBetUnits:0,betHistory:[],lastAction:null,result:null,
  };
}

export function isFiveCardDrawState(value:unknown):value is FiveCardDrawState {
  if(!value||typeof value!=="object")return false;
  const state=value as Partial<FiveCardDrawState>;
  if(!(state.contract===FIVE_CARD_DRAW_CONTRACT&&state.rulesVersion===FIVE_CARD_DRAW_RULES_VERSION
    &&typeof state.context?.sessionId==="string"&&Array.isArray(state.context.opponents)&&Array.isArray(state.seatOrder)
    &&Number.isSafeInteger(state.sequence)&&state.sequence!>=0&&Boolean(state.hands)&&Boolean(state.contributionsUnits)&&Array.isArray(state.betHistory)))return false;
  if(!state.phase||!["ready","opening-bet","drawing","closing-bet","complete"].includes(state.phase))return false;
  const seats=state.seatOrder as FiveCardDrawSeatId[];
  if(seats[0]!=="player"||seats.length!==state.context!.opponents.length+1||new Set(seats).size!==seats.length)return false;
  const deckIds=new Set(STANDARD_CARD_DECK.map((card)=>card.id));
  if(!Array.isArray(state.deck)||state.deck.some((card)=>!deckIds.has(card))||state.deck.length>0&&(state.deck.length!==52||new Set(state.deck).size!==52))return false;
  if(!Number.isSafeInteger(state.deckCursor)||state.deckCursor!<0||state.deckCursor!>state.deck.length)return false;
  const visibleCards=seats.flatMap((seat)=>[...(state.hands?.[seat]??[]),...(state.discarded?.[seat]??[])]);
  if(visibleCards.some((card)=>!deckIds.has(card))||new Set(visibleCards).size!==visibleCards.length)return false;
  if(state.phase!=="ready"&&seats.some((seat)=>state.hands?.[seat]?.length!==5))return false;
  if(state.result&&!validStoredResult(state as FiveCardDrawState))return false;
  return state.phase==="complete"?Boolean(state.result):state.result===null;
}

function validStoredResult(state:FiveCardDrawState):boolean{
  const result=state.result;if(!result||!state.baseStake||!state.seed)return false;
  const {resultId,...base}=result;
  if(resultId!==resultHash(base)||result.contract!==FIVE_CARD_DRAW_CONTRACT||result.rulesVersion!==FIVE_CARD_DRAW_RULES_VERSION
    ||result.sessionId!==state.context.sessionId||result.seed!==state.seed)return false;
  const contributionTotal=Object.values(result.contributions).reduce((sum,value)=>sum+value,0);
  const payoutTotal=Object.values(result.payouts).reduce((sum,value)=>sum+value,0);
  return Object.values(result.contributions).every((value)=>Number.isSafeInteger(value)&&value>=0)
    &&Object.values(result.payouts).every((value)=>Number.isSafeInteger(value)&&value>=0)
    &&result.pot===contributionTotal&&payoutTotal===result.pot
    &&result.playerCredit===FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS*state.baseStake-result.contributions.player+result.payouts.player;
}

export function reduceFiveCardDraw(state:FiveCardDrawState,action:FiveCardDrawAction):FiveCardDrawState {
  if(action.type==="reset"){
    if(state.phase!=="complete")throw new Error("five_card_draw_reset_not_allowed");
    return {...createFiveCardDrawState(state.context,state.dealerIndex+1),sequence:state.sequence+1};
  }
  if(action.type==="start")return startMatch(state,action.seed,action.stake);
  if(action.type==="advance")return advanceNpc(state);
  if(action.type==="exchange")return exchangePlayer(state,action.cardIds);
  return betPlayer(state,action.action);
}

export function fiveCardDrawPublicView(state:FiveCardDrawState):FiveCardDrawPublicView {
  const npcHands=Object.fromEntries((["npc-1","npc-2","npc-3"] as FiveCardDrawNpcSeatId[]).map((seatId)=>[
    seatId,state.result?.hands[seatId]??null,
  ])) as Record<FiveCardDrawNpcSeatId,readonly StandardCardId[]|null>;
  return {contract:FIVE_CARD_DRAW_CONTRACT,phase:state.phase,sequence:state.sequence,sessionId:state.context.sessionId,
    seatOrder:state.seatOrder,currentActorId:state.currentActorId,activeSeatIds:state.activeSeatIds,foldedSeatIds:state.foldedSeatIds,
    playerHand:state.hands.player,npcHands,exchangeCounts:state.exchangeCounts,npcTells:fiveCardDrawNpcTells(state),betHistory:state.betHistory,pot:potAmount(state),result:state.result};
}

export function fiveCardDrawNpcTells(state:FiveCardDrawState):FiveCardDrawPublicView["npcTells"] {
  if(!state.seed||state.phase==="ready")return {};
  const phase=state.phase==="closing-bet"||state.phase==="complete"?"closing-bet":"opening-bet";
  return Object.fromEntries(state.context.opponents.map((opponent,index)=>{
    const seatId=`npc-${index+1}` as FiveCardDrawNpcSeatId;
    if(state.phase==="complete"&&state.result)return [seatId,state.result.winnerSeatIds.includes(seatId)?"confident":"uneasy"];
    if(!state.activeSeatIds.includes(seatId))return [seatId,"uneasy"];
    return [seatId,selectPokerTell(state.hands[seatId],phase,opponent.persona,`${state.seed}:tell:${phase}:${state.currentBetUnits}:${seatId}`)];
  }));
}

export function legalPlayerBetActions(state:FiveCardDrawState):readonly FiveCardDrawBetAction[] {
  if((state.phase!=="opening-bet"&&state.phase!=="closing-bet")||state.currentActorId!=="player")return [];
  const own=state.streetContributionsUnits.player,toCall=state.currentBetUnits-own;
  if(toCall>0)return state.currentBetUnits<FIVE_CARD_DRAW_STREET_CAP_UNITS?["fold","call","raise"]:["fold","call"];
  if(state.currentBetUnits===0)return ["check","bet"];
  return state.currentBetUnits<FIVE_CARD_DRAW_STREET_CAP_UNITS?["check","raise"]:["check"];
}

export function fiveCardDrawSettlementCredit(state:FiveCardDrawState):number {
  if(state.phase!=="complete"||!state.result||!state.baseStake)throw new Error("five_card_draw_settlement_unavailable");
  return state.result.playerCredit;
}

function startMatch(state:FiveCardDrawState,seed:string,stake:FiveCardDrawStake):FiveCardDrawState {
  if(state.phase!=="ready")throw new Error("five_card_draw_already_started");
  if(!seed)throw new Error("five_card_draw_seed_required");
  if(!FIVE_CARD_DRAW_STAKES.includes(stake))throw new Error("five_card_draw_stake_invalid");
  const deck=shuffledStandardDeck(`${FIVE_CARD_DRAW_RULES_VERSION}:${seed}`),hands=emptyCards(),dealOrder=orderedAfterDealer(state.seatOrder,state.dealerIndex);
  let cursor=0;
  for(let round=0;round<5;round+=1)for(const seatId of dealOrder)hands[seatId]=[...hands[seatId],deck[cursor++]!];
  const active=[...state.seatOrder],contributions=emptyNumbers();for(const seatId of active)contributions[seatId]=1;
  const pending=orderedAfterDealer(state.seatOrder,state.dealerIndex);
  return {...state,phase:"opening-bet",sequence:state.sequence+1,seed,baseStake:stake,deck,deckCursor:cursor,hands,
    activeSeatIds:active,pendingSeatIds:pending,currentActorId:pending[0]??null,contributionsUnits:contributions,
    streetContributionsUnits:emptyNumbers(),currentBetUnits:0,betHistory:[],foldedSeatIds:[],discarded:emptyCards(),exchangeCounts:{},lastAction:null,result:null};
}

function betPlayer(state:FiveCardDrawState,action:FiveCardDrawBetAction):FiveCardDrawState {
  if(state.currentActorId!=="player")throw new Error("five_card_draw_not_player_turn");
  if(!legalPlayerBetActions(state).includes(action))throw new Error("five_card_draw_bet_action_invalid");
  return applyBet(state,"player",action);
}

function advanceNpc(state:FiveCardDrawState):FiveCardDrawState {
  const seatId=state.currentActorId;if(!seatId||seatId==="player")throw new Error("five_card_draw_advance_invalid");
  const opponent=opponentForSeat(state,seatId);
  if(state.phase==="drawing"){
    const decision=decideNpcDraw({hand:state.hands[seatId],visibleExchangeCounts:state.exchangeCounts,activeSeatCount:state.activeSeatIds.length,
      persona:opponent.persona,seed:`${state.seed}:${state.sequence}:${seatId}:draw`});
    return exchangeSeat(state,seatId,decision.discardCardIds);
  }
  if(state.phase!=="opening-bet"&&state.phase!=="closing-bet")throw new Error("five_card_draw_advance_phase_invalid");
  const action=chooseNpcBetAction({seatId,hand:state.hands[seatId],phase:state.phase,activeSeatCount:state.activeSeatIds.length,
    ownContributionUnits:state.streetContributionsUnits[seatId],currentBetUnits:state.currentBetUnits,
    potUnits:potUnits(state),visibleExchangeCounts:state.exchangeCounts,visibleTells:fiveCardDrawNpcTells(state),betHistory:state.betHistory,
    ...(state.context.sessionRead?{sessionRead:state.context.sessionRead}:{}),persona:opponent.persona,planSeed:`${state.seed}:${seatId}:plan`,seed:`${state.seed}:${state.sequence}:${seatId}:bet`});
  return applyBet(state,seatId,legalNpcAction(state,seatId,action));
}

function legalNpcAction(state:FiveCardDrawState,seatId:FiveCardDrawSeatId,preferred:FiveCardDrawBetAction):FiveCardDrawBetAction {
  const own=state.streetContributionsUnits[seatId],toCall=state.currentBetUnits-own;
  const legal:FiveCardDrawBetAction[]=toCall>0?(state.currentBetUnits<FIVE_CARD_DRAW_STREET_CAP_UNITS?["fold","call","raise"]:["fold","call"])
    :state.currentBetUnits===0?["check","bet"]:state.currentBetUnits<FIVE_CARD_DRAW_STREET_CAP_UNITS?["check","raise"]:["check"];
  return legal.includes(preferred)?preferred:(toCall>0?"call":"check");
}

function applyBet(state:FiveCardDrawState,seatId:FiveCardDrawSeatId,action:FiveCardDrawBetAction):FiveCardDrawState {
  if(state.currentActorId!==seatId||(state.phase!=="opening-bet"&&state.phase!=="closing-bet"))throw new Error("five_card_draw_bet_turn_invalid");
  let active=[...state.activeSeatIds],folded=[...state.foldedSeatIds],pending=state.pendingSeatIds.slice(1),currentBet=state.currentBetUnits;
  const street={...state.streetContributionsUnits},total={...state.contributionsUnits};let amount=0,aggressive=false;
  if(action==="fold"){
    active=active.filter((id)=>id!==seatId);folded.push(seatId);pending=pending.filter((id)=>id!==seatId);
  }else{
    const target=action==="bet"?1:action==="raise"?currentBet+1:action==="call"?currentBet:street[seatId];
    if((action==="check"&&street[seatId]!==currentBet)||(action==="bet"&&currentBet!==0)
      ||(action==="raise"&&(currentBet<1||currentBet>=FIVE_CARD_DRAW_STREET_CAP_UNITS))
      ||(action==="call"&&street[seatId]>=currentBet))throw new Error("five_card_draw_bet_action_invalid");
    amount=Math.max(0,target-street[seatId]);street[seatId]+=amount;total[seatId]+=amount;
    if(total[seatId]>FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS)throw new Error("five_card_draw_exposure_exceeded");
    if(action==="bet"||action==="raise"){
      aggressive=true;currentBet=target;pending=orderAfterSeat(state.seatOrder,seatId).filter((id)=>active.includes(id)&&id!==seatId);
    }
  }
  const betRecord:FiveCardDrawBetRecord={seatId,phase:state.phase,action,amountUnits:amount};
  let next:{[K in keyof FiveCardDrawState]?:FiveCardDrawState[K]}={sequence:state.sequence+1,activeSeatIds:active,foldedSeatIds:folded,pendingSeatIds:pending,
    currentActorId:pending[0]??null,contributionsUnits:total,streetContributionsUnits:street,currentBetUnits:currentBet,betHistory:[...state.betHistory,betRecord],lastAction:{seatId,action,amountUnits:amount}};
  let output={...state,...next} as FiveCardDrawState;
  if(active.length===1)return completeMatch(output);
  if(pending.length===0)output=finishBettingStreet(output);
  void aggressive;
  return output;
}

function finishBettingStreet(state:FiveCardDrawState):FiveCardDrawState {
  if(state.phase==="opening-bet"){
    const pending=orderAfterSeat(state.seatOrder,state.seatOrder[state.dealerIndex]!).filter((seat)=>state.activeSeatIds.includes(seat));
    return {...state,phase:"drawing",pendingSeatIds:pending,currentActorId:pending[0]??null,currentBetUnits:0,streetContributionsUnits:emptyNumbers()};
  }
  return completeMatch(state);
}

function exchangePlayer(state:FiveCardDrawState,cards:readonly StandardCardId[]):FiveCardDrawState {
  if(state.phase!=="drawing"||state.currentActorId!=="player")throw new Error("five_card_draw_exchange_not_allowed");
  return exchangeSeat(state,"player",cards);
}

function exchangeSeat(state:FiveCardDrawState,seatId:FiveCardDrawSeatId,cards:readonly StandardCardId[]):FiveCardDrawState {
  if(cards.length>3||new Set(cards).size!==cards.length)throw new Error("five_card_draw_exchange_invalid");
  if(cards.some((card)=>!state.hands[seatId].includes(card)))throw new Error("five_card_draw_exchange_card_missing");
  const selected=new Set(cards),hand=[...state.hands[seatId]],deck=[...state.deck];let cursor=state.deckCursor;
  const replacement=hand.map((card)=>{if(!selected.has(card))return card;const next=deck[cursor++];if(!next)throw new Error("five_card_draw_deck_exhausted");return next;});
  const hands={...state.hands,[seatId]:replacement},discarded={...state.discarded,[seatId]:[...cards]},exchangeCounts={...state.exchangeCounts,[seatId]:cards.length};
  const pending=state.pendingSeatIds.slice(1);
  let output={...state,sequence:state.sequence+1,deckCursor:cursor,hands,discarded,exchangeCounts,pendingSeatIds:pending,currentActorId:pending[0]??null,
    lastAction:{seatId,action:"exchange" as const,amountUnits:cards.length}};
  if(pending.length===0){const betting=orderAfterSeat(state.seatOrder,state.seatOrder[state.dealerIndex]!).filter((seat)=>state.activeSeatIds.includes(seat));output={...output,phase:"closing-bet",pendingSeatIds:betting,currentActorId:betting[0]??null,currentBetUnits:0,streetContributionsUnits:emptyNumbers()};}
  return output;
}

function completeMatch(state:FiveCardDrawState):FiveCardDrawState {
  if(!state.seed||!state.baseStake)throw new Error("five_card_draw_result_invalid");
  const active=state.activeSeatIds,winners:FiveCardDrawSeatId[]=[];const values:Partial<Record<FiveCardDrawSeatId,ReturnType<typeof evaluatePokerHand>>>={};
  if(active.length===1)winners.push(active[0]!);
  else{
    for(const seat of active)values[seat]=evaluatePokerHand(state.hands[seat]);
    let best=values[active[0]!]!;winners.push(active[0]!);
    for(const seat of active.slice(1)){const comparison=comparePokerHands(values[seat]!,best);if(comparison>0){best=values[seat]!;winners.splice(0,winners.length,seat);}else if(comparison===0)winners.push(seat);}
  }
  const contributions=Object.fromEntries(ALL_SEATS.map((seat)=>[seat,state.contributionsUnits[seat]*state.baseStake!])) as Record<FiveCardDrawSeatId,number>;
  const pot=Object.values(contributions).reduce((sum,value)=>sum+value,0),payouts=emptyNumbers();
  const share=Math.floor(pot/winners.length),remainder=pot-share*winners.length,awardOrder=orderAfterSeat(state.seatOrder,state.seatOrder[state.dealerIndex]!).filter((seat)=>winners.includes(seat));
  for(const winner of winners)payouts[winner]=share;for(let index=0;index<remainder;index+=1)payouts[awardOrder[index%awardOrder.length]!] += 1;
  const showdown=active.length>1;
  const hands=showdown?Object.fromEntries(active.map((seat)=>[seat,state.hands[seat]])):{};
  const outcome:FiveCardDrawOutcome=winners.includes("player")?(winners.length===1?"player-win":"tie"):"npc-win";
  const resultBase={contract:FIVE_CARD_DRAW_CONTRACT,rulesVersion:FIVE_CARD_DRAW_RULES_VERSION,sessionId:state.context.sessionId,seed:state.seed,outcome,
    winnerSeatIds:winners,foldedSeatIds:state.foldedSeatIds,hands,values,contributions,payouts,pot,
    playerCredit:FIVE_CARD_DRAW_MAX_EXPOSURE_UNITS*state.baseStake-contributions.player+payouts.player};
  const result:FiveCardDrawResult={...resultBase,resultId:resultHash(resultBase)};
  return {...state,phase:"complete",sequence:state.sequence+1,currentActorId:null,pendingSeatIds:[],result};
}

function opponentForSeat(state:FiveCardDrawState,seatId:Exclude<FiveCardDrawSeatId,"player">){const index=Number(seatId.slice(-1))-1;const value=state.context.opponents[index];if(!value)throw new Error("five_card_draw_opponent_missing");return value;}
function orderedAfterDealer(seats:readonly FiveCardDrawSeatId[],dealerIndex:number):FiveCardDrawSeatId[]{const dealer=stateSeatAt(seats,dealerIndex);return orderAfterSeat(seats,dealer);}
function orderAfterSeat(seats:readonly FiveCardDrawSeatId[],seatId:FiveCardDrawSeatId):FiveCardDrawSeatId[]{const index=seats.indexOf(seatId);if(index<0)return [...seats];return [...seats.slice(index+1),...seats.slice(0,index+1)];}
function stateSeatAt(seats:readonly FiveCardDrawSeatId[],index:number):FiveCardDrawSeatId{return seats[((index%seats.length)+seats.length)%seats.length]!;}
function potAmount(state:FiveCardDrawState):number{return (state.baseStake??0)*Object.values(state.contributionsUnits).reduce((sum,value)=>sum+value,0);}
function potUnits(state:FiveCardDrawState):number{return Object.values(state.contributionsUnits).reduce((sum,value)=>sum+value,0);}
function emptyCards():Record<FiveCardDrawSeatId,StandardCardId[]>{return {player:[],"npc-1":[],"npc-2":[],"npc-3":[]};}
function emptyNumbers():Record<FiveCardDrawSeatId,number>{return {player:0,"npc-1":0,"npc-2":0,"npc-3":0};}
function validateContext(context:FiveCardDrawContext):void {
  if(!context.sessionId.trim())throw new Error("five_card_draw_context_invalid");
  if(context.opponents.length<1||context.opponents.length>3||new Set(context.opponents.map((opponent)=>opponent.id)).size!==context.opponents.length)throw new Error("five_card_draw_opponents_invalid");
  for(const opponent of context.opponents){
    const {signalTrust,tellStyle,...bounded}=opponent.persona;
    if(Object.values(bounded).some((value)=>!Number.isFinite(value)||value<0||value>1)
      ||!Number.isFinite(signalTrust)||signalTrust< -1||signalTrust>1
      ||!["open","guarded","bluffer","standard"].includes(tellStyle))throw new Error("five_card_draw_persona_invalid");
  }
  if(context.sessionRead){
    const read=context.sessionRead;
    if(!Number.isInteger(read.handsPlayed)||read.handsPlayed<0
      ||![read.aggressionRate,read.foldRate,read.weakAggressionRate].every((value)=>Number.isFinite(value)&&value>=0&&value<=1)
      ||!Number.isFinite(read.averageExchangeCount)||read.averageExchangeCount<0||read.averageExchangeCount>3
      ||(read.revealedStrength!==null&&(!Number.isFinite(read.revealedStrength)||read.revealedStrength<0||read.revealedStrength>1)))
      throw new Error("five_card_draw_session_read_invalid");
  }
}
