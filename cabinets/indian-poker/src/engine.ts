import { STANDARD_CARD_DECK, shuffledStandardDeck, standardRankValue, type StandardCardId } from "@lucky-arcade/card-table";
import { XorShift32, expressSignal } from "@lucky-arcade/engine";
import { expressionRead, npcRead, type IndianPokerNpcRead } from "./read.ts";
import {
  INDIAN_POKER_BET_SIZES,
  INDIAN_POKER_DEFAULT_ROUND_COUNT,
  INDIAN_POKER_ROUND_COUNTS,
  INDIAN_POKER_STARTING_CHIPS,
  INDIAN_POKER_STATE_CONTRACT,
  INDIAN_POKER_STAKES,
  INDIAN_POKER_VERSION,
  type IndianPokerAction,
  type IndianPokerBetSize,
  type IndianPokerCartridge,
  type IndianPokerCharacter,
  type IndianPokerOutcome,
  type IndianPokerPersona,
  type IndianPokerPlayerDecision,
  type IndianPokerRoundCount,
  type IndianPokerRoundMove,
  type IndianPokerRoundResult,
  type IndianPokerSeatId,
  type IndianPokerState,
} from "./contracts.ts";

export interface IndianPokerAuditTrail {
  contract: "indian-poker-audit/0.1";
  version: typeof INDIAN_POKER_VERSION;
  seed: string;
  opponentId: string;
  roundCount: IndianPokerRoundCount;
  firstOpener: IndianPokerSeatId;
  rounds: readonly IndianPokerRoundResult[];
  finalChips: Readonly<{ player: number; npc: number }>;
  outcome: Exclude<IndianPokerOutcome, null>;
}

export function createIndianPokerState(cartridge: IndianPokerCartridge, seed: string, opponentId = cartridge.characters[0]?.id ?? "", sessionId = "indian-poker:heads-up-2", roundCount: IndianPokerRoundCount = INDIAN_POKER_DEFAULT_ROUND_COUNT): IndianPokerState {
  validateCartridge(cartridge); findCharacter(cartridge, opponentId); assert(seed.length > 0, "indian_poker_seed_invalid"); assertRoundCount(roundCount);
  return {
    contract: INDIAN_POKER_STATE_CONTRACT, version: INDIAN_POKER_VERSION, packVersion: cartridge.version, sessionId, seed, sequence: 0,
    status: "ready", opponentId, round: 0, roundCount, firstOpener: "npc", roundOpener: null, deck: [], cursor: 0,
    playerCardId: null, npcCardId: null, roundMoves: [], currentBet: 0, npcReaction: "neutral",
    playerChips: INDIAN_POKER_STARTING_CHIPS, npcChips: INDIAN_POKER_STARTING_CHIPS,
    roundStartPlayerChips: INDIAN_POKER_STARTING_CHIPS, roundStartNpcChips: INDIAN_POKER_STARTING_CHIPS,
    pot: 0, history: [], stake: null, wagerId: null, creditAmount: 0, outcome: null,
  };
}

export function reduceIndianPoker(cartridge: IndianPokerCartridge, state: IndianPokerState, action: IndianPokerAction): IndianPokerState {
  validateCartridge(cartridge); const opponent = findCharacter(cartridge, state.opponentId);
  if (action.type === "select-opponent") { assert(state.status === "ready", "indian_poker_opponent_selection_invalid"); findCharacter(cartridge, action.opponentId); return { ...state, sequence: state.sequence + 1, opponentId: action.opponentId }; }
  if (action.type === "select-round-count") { assert(state.status === "ready", "indian_poker_round_count_selection_invalid"); assertRoundCount(action.roundCount); return { ...state, sequence: state.sequence + 1, roundCount: action.roundCount }; }
  if (action.type === "random-opponent") {
    assert(state.status === "ready", "indian_poker_opponent_selection_invalid");
    const candidates = cartridge.characters.filter((character) => cartridge.characters.length === 1 || character.id !== state.opponentId).sort((left, right) => left.id.localeCompare(right.id));
    const selected = candidates[new XorShift32(`${state.seed}:opponent:${state.sequence}`).nextUint32() % candidates.length]; assert(selected, "indian_poker_character_missing");
    return { ...state, sequence: state.sequence + 1, opponentId: selected.id };
  }
  if (action.type === "restart") return { ...createIndianPokerState(cartridge, action.seed, state.opponentId, state.sessionId, state.roundCount), sequence: state.sequence + 1 };
  if (action.type === "start") {
    assert(state.status === "ready" && action.seed.length > 0 && action.wagerId.length > 0 && INDIAN_POKER_STAKES.includes(action.stake), "indian_poker_start_invalid"); assertRoundCount(action.roundCount);
    const firstOpener: IndianPokerSeatId = new XorShift32(`${action.seed}:button`).next() < .5 ? "player" : "npc";
    const started: IndianPokerState = { ...state, sequence: state.sequence + 1, seed: action.seed, deck: shuffledStandardDeck(`${action.seed}:deck`), cursor: 0, round: 0, roundCount: action.roundCount, firstOpener, roundOpener: null, roundMoves: [], currentBet: 0, history: [], playerChips: INDIAN_POKER_STARTING_CHIPS, npcChips: INDIAN_POKER_STARTING_CHIPS, stake: action.stake, wagerId: action.wagerId, outcome: null, creditAmount: 0 };
    return dealRound(started, opponent, 1);
  }
  if (action.type === "player-act") return playerAct(state, opponent, action.decision);
  if (action.type === "npc-act") return npcAct(state, opponent);
  if (action.type === "next-round") { assert(state.status === "showdown", "indian_poker_next_round_invalid"); const sequenced = { ...state, sequence: state.sequence + 1 }; return shouldComplete(sequenced) ? completeMatch(sequenced) : dealRound(sequenced, opponent, state.round + 1); }
  throw new Error("indian_poker_action_invalid");
}

export function decideNpcBet(persona: IndianPokerPersona, read: IndianPokerNpcRead, seed: string, availableChips: number): 0 | IndianPokerBetSize {
  if (availableChips <= 0) return 0;
  const chance = estimatedNpcChance(persona, read, seed), rng = new XorShift32(`${seed}:bet`);
  const behind = read.npcChips < read.playerChips ? 1 : 0, tilt = behind * persona.tiltResponse * .06;
  const threshold = .53 + (.5 - persona.aggression) * .2 - tilt;
  const edge = chance - threshold;
  const bluff = rng.next() < persona.bluffFrequency * Math.max(.08, .55 - chance) * .42;
  const slowPlay = edge > .08 && rng.next() < persona.slowPlay * .5;
  if ((!bluff && edge < -.015) || slowPlay) return 0;
  const desired: IndianPokerBetSize = edge + persona.aggression * .12 + (bluff ? .06 : 0) > .13 ? 2 : 1;
  return availableChips >= desired ? desired : 1;
}

export function decideNpcResponse(persona: IndianPokerPersona, read: IndianPokerNpcRead, seed: string, betAmount: IndianPokerBetSize): "call" | "fold" {
  if (read.npcChips < betAmount) return "fold";
  const chance = estimatedNpcChance(persona, read, seed), potOdds = betAmount / Math.max(1, read.pot + betAmount);
  const pressure = Math.min(.07, read.playerBets * .012) - Math.min(.06, read.playerFolds * .018);
  const tolerance = (persona.aggression - .5) * .08 + (read.npcChips < read.playerChips ? persona.tiltResponse * .04 : 0);
  return chance + tolerance - pressure >= potOdds ? "call" : "fold";
}

export function indianPokerOutcome(state: IndianPokerState): Exclude<IndianPokerOutcome, null> { return state.playerChips > state.npcChips ? "player" : state.npcChips > state.playerChips ? "npc" : "draw"; }
export function indianPokerRanking(state: IndianPokerState): Array<{ seatId: IndianPokerSeatId; rank: number; chips: number }> { if (state.playerChips === state.npcChips) return [{ seatId: "player", rank: 1, chips: state.playerChips }, { seatId: "npc", rank: 1, chips: state.npcChips }]; return state.playerChips > state.npcChips ? [{ seatId: "player", rank: 1, chips: state.playerChips }, { seatId: "npc", rank: 2, chips: state.npcChips }] : [{ seatId: "npc", rank: 1, chips: state.npcChips }, { seatId: "player", rank: 2, chips: state.playerChips }]; }

export function indianPokerAuditTrail(state: IndianPokerState): IndianPokerAuditTrail {
  assert(state.status === "complete" && state.outcome, "indian_poker_audit_incomplete"); assertUniqueDeal(state.history);
  return Object.freeze({ contract: "indian-poker-audit/0.1", version: state.version, seed: state.seed, opponentId: state.opponentId, roundCount: state.roundCount, firstOpener: state.firstOpener, rounds: state.history, finalChips: Object.freeze({player:state.playerChips,npc:state.npcChips}), outcome:state.outcome });
}

export function publicIndianPokerCards(state: IndianPokerState): readonly StandardCardId[] {
  return state.history.flatMap((round) => round.playerCardRevealed ? [round.npcCardId, round.playerCardId] : [round.npcCardId]);
}

function dealRound(state: IndianPokerState, opponent: IndianPokerCharacter, round: number): IndianPokerState {
  assert(state.playerChips > 0 && state.npcChips > 0 && state.cursor + 1 < state.deck.length, "indian_poker_deal_invalid");
  const playerCardId = state.deck[state.cursor], npcCardId = state.deck[state.cursor + 1]; assert(playerCardId && npcCardId, "indian_poker_deal_invalid");
  const roundOpener = round % 2 === 1 ? state.firstOpener : otherSeat(state.firstOpener);
  const base: IndianPokerState = { ...state, round, roundOpener, status: roundOpener === "player" ? "player-action" : "npc-action", cursor: state.cursor + 2, playerCardId, npcCardId, playerChips:state.playerChips-1,npcChips:state.npcChips-1,roundStartPlayerChips:state.playerChips,roundStartNpcChips:state.npcChips,pot:2,roundMoves:[],currentBet:0,npcReaction:"neutral" };
  const reacted = { ...base, npcReaction: reactionForPlayerCard(base, opponent) };
  return roundOpener === "npc" ? npcAct(reacted, opponent) : reacted;
}

function playerAct(state: IndianPokerState, opponent: IndianPokerCharacter, decision: IndianPokerPlayerDecision): IndianPokerState {
  assert(state.status === "player-action" && state.playerCardId && state.npcCardId, "indian_poker_player_action_invalid");
  const facingBet = lastMove(state)?.seatId === "npc" && lastMove(state)?.kind === "bet";
  if (decision.kind === "fold") return awardPot(appendMove(state,{seatId:"player",kind:"fold",amount:0}),"npc",false);
  if (facingBet) {
    assert(decision.kind === "call" && state.currentBet > 0 && state.playerChips >= state.currentBet, "indian_poker_player_action_invalid");
    return showdown(appendMove({...state,playerChips:state.playerChips-state.currentBet,pot:state.pot+state.currentBet},{seatId:"player",kind:"call",amount:state.currentBet}));
  }
  if (decision.kind === "check") {
    const checked = appendMove(state,{seatId:"player",kind:"check",amount:0});
    return lastMove(state)?.kind === "check" ? showdown(checked) : {...checked,status:"npc-action"};
  }
  assert(decision.kind === "bet", "indian_poker_player_action_invalid");
  assert(INDIAN_POKER_BET_SIZES.includes(decision.amount) && state.playerChips >= decision.amount && state.currentBet === 0, "indian_poker_chips_insufficient");
  return appendMove({...state,status:"npc-action",playerChips:state.playerChips-decision.amount,pot:state.pot+decision.amount,currentBet:decision.amount},{seatId:"player",kind:"bet",amount:decision.amount});
}

function npcAct(state: IndianPokerState, opponent: IndianPokerCharacter): IndianPokerState {
  assert(state.status === "npc-action" && state.playerCardId && state.npcCardId, "indian_poker_npc_action_invalid");
  const previous = lastMove(state), read = npcRead(state), seed = `${state.seed}:round:${state.round}:npc:${state.roundMoves.length}`;
  if (previous?.seatId === "player" && previous.kind === "bet") {
    const response = decideNpcResponse(opponent.persona, read, seed, state.currentBet as IndianPokerBetSize);
    if (response === "fold") return awardPot(appendMove(state,{seatId:"npc",kind:"fold",amount:0}),"player",false);
    return showdown(appendMove({...state,npcChips:state.npcChips-state.currentBet,pot:state.pot+state.currentBet},{seatId:"npc",kind:"call",amount:state.currentBet}));
  }
  const amount = decideNpcBet(opponent.persona, read, seed, state.npcChips);
  if (amount === 0) {
    const checked = appendMove(state,{seatId:"npc",kind:"check",amount:0});
    return previous?.kind === "check" ? showdown(checked) : {...checked,status:"player-action"};
  }
  return appendMove({...state,status:"player-action",npcChips:state.npcChips-amount,pot:state.pot+amount,currentBet:amount},{seatId:"npc",kind:"bet",amount});
}

function showdown(state: IndianPokerState): IndianPokerState { assert(state.playerCardId && state.npcCardId,"indian_poker_showdown_invalid"); const player=standardRankValue(state.playerCardId),npc=standardRankValue(state.npcCardId); return awardPot(state,player>npc?"player":npc>player?"npc":"draw",true); }

function awardPot(state: IndianPokerState, winner: "player"|"npc"|"draw", playerCardRevealed: boolean): IndianPokerState {
  assert(state.playerCardId&&state.npcCardId&&state.roundOpener&&state.roundMoves.length>0,"indian_poker_round_invalid");
  const playerShare=winner==="player"?state.pot:winner==="draw"?state.pot/2:0,npcShare=winner==="npc"?state.pot:winner==="draw"?state.pot/2:0; assert(Number.isInteger(playerShare)&&Number.isInteger(npcShare),"indian_poker_split_invalid");
  const playerChips=state.playerChips+playerShare,npcChips=state.npcChips+npcShare;
  const result:IndianPokerRoundResult={round:state.round,opener:state.roundOpener,playerCardId:state.playerCardId,npcCardId:state.npcCardId,moves:Object.freeze([...state.roundMoves]),pot:state.pot,winner,playerCardRevealed,playerChipDelta:playerChips-state.roundStartPlayerChips,npcChipDelta:npcChips-state.roundStartNpcChips};
  const history=[...state.history,result]; assertUniqueDeal(history);
  return {...state,status:"showdown",playerChips,npcChips,pot:0,currentBet:0,history};
}

function completeMatch(state:IndianPokerState):IndianPokerState{const outcome=indianPokerOutcome(state),stake=state.stake??0;return{...state,status:"complete",playerCardId:null,npcCardId:null,roundOpener:null,roundMoves:[],currentBet:0,npcReaction:"neutral",creditAmount:Math.floor(stake*state.playerChips/INDIAN_POKER_STARTING_CHIPS),outcome};}
function shouldComplete(state:IndianPokerState):boolean{return state.round>=state.roundCount||state.playerChips<=0||state.npcChips<=0;}

function estimatedNpcChance(persona:IndianPokerPersona,read:IndianPokerNpcRead,seed:string):number{const removed=new Set([...read.previouslyRevealedCardIds,read.visiblePlayerCardId]);const unknown=STANDARD_CARD_DECK.filter((card)=>!removed.has(card.id));const player=standardRankValue(read.visiblePlayerCardId);const wins=unknown.filter((card)=>standardRankValue(card)>player).length,ties=unknown.filter((card)=>standardRankValue(card)===player).length;const raw=(wins+ties*.5)/Math.max(1,unknown.length);const noise=(new XorShift32(`${seed}:estimate`).next()*2-1)*persona.estimationNoise;return Math.max(0,Math.min(1,raw+noise));}

function reactionForPlayerCard(state:IndianPokerState,opponent:IndianPokerCharacter):IndianPokerState["npcReaction"]{const strength=standardRankValue(expressionRead(state).playerCardId),truth=strength>=10?"tense":strength<=6?"pleased":"neutral";if(truth==="neutral")return"neutral";const deceptive=truth==="tense"?"pleased":"tense",truthWeight=opponent.persona.tellReliability*88,deceptiveWeight=(1-opponent.persona.tellReliability)*72,neutralWeight=Math.max(0,100-truthWeight-deceptiveWeight);return expressSignal(truth,"neutral",deceptive,{truth:truthWeight,neutral:neutralWeight,deceptive:deceptiveWeight},`${state.seed}:round:${state.round}:expression:${opponent.id}`);}

function appendMove(state:IndianPokerState,move:IndianPokerRoundMove):IndianPokerState{return{...state,sequence:state.sequence+1,roundMoves:[...state.roundMoves,Object.freeze(move)]};}
function lastMove(state:IndianPokerState):IndianPokerRoundMove|undefined{return state.roundMoves.at(-1);}
function otherSeat(seat:IndianPokerSeatId):IndianPokerSeatId{return seat==="player"?"npc":"player";}
function assertRoundCount(value:number):asserts value is IndianPokerRoundCount{assert(INDIAN_POKER_ROUND_COUNTS.includes(value as IndianPokerRoundCount),"indian_poker_round_count_invalid");}
function assertUniqueDeal(history:readonly IndianPokerRoundResult[]):void{const cards=history.flatMap((round)=>[round.playerCardId,round.npcCardId]);assert(new Set(cards).size===cards.length,"indian_poker_duplicate_card");}
function validateCartridge(cartridge:IndianPokerCartridge):void{assert(cartridge.contract==="indian-poker-cartridge/0.3"&&cartridge.version.length>0&&cartridge.characters.length>0,"indian_poker_cartridge_invalid");const ids=new Set<string>();for(const character of cartridge.characters){assert(character.id.length>0&&character.name.length>0&&!ids.has(character.id),"indian_poker_character_invalid");ids.add(character.id);for(const value of Object.values(character.persona))assert(Number.isFinite(value)&&value>=0&&value<=1,"indian_poker_persona_invalid");}}
function findCharacter(cartridge:IndianPokerCartridge,id:string):IndianPokerCharacter{const character=cartridge.characters.find((candidate)=>candidate.id===id);assert(character,`indian_poker_character_missing:${id}`);return character;}
function assert(condition:unknown,code:string):asserts condition{if(!condition)throw new Error(code);}
