import { XorShift32 } from "@lucky-arcade/engine";
import { casinoDayPlan, completedDayBalances } from "./engine.ts";
import { casinoKstDayAtUtcSecond, casinoUtcSecondAtKstDay } from "./casino-time.ts";
import type { CasinoPresentationClock, CasinoTableId, NpcGamblingProfile, NpcLedgerContract, NpcMatch, NpcPlayEvent, NpcPlayEventCode, NpcPredictionWager } from "./contracts.ts";

const TAPE_VERSION = "npc-live-tape/0.4";
const DEFAULT_LOOKBACK_SECONDS = 90;
const ACTIONS = Object.freeze({
  "temerosa-old-maid": ["old-maid-draw", "old-maid-discard", "old-maid-reorder", "old-maid-watch"] as const,
  "temerosa-match-pairs": ["pairs-open-first", "pairs-open-second", "pairs-match", "pairs-turn"] as const,
  "temerosa-slot": ["slot-spin", "slot-reel-stop", "slot-line-check", "slot-reach"] as const,
  "indian-poker": ["poker-check", "poker-call", "poker-raise", "poker-read"] as const,
  "temerosa-high-low": ["high-low-guess", "high-low-hit", "high-low-cashout"] as const,
  "temerosa-five-card-draw": ["poker-check", "poker-call", "poker-raise", "poker-read"] as const,
}) satisfies Readonly<Record<CasinoTableId, readonly NpcPlayEventCode[]>>;
const CADENCE = Object.freeze({
  "temerosa-slot": [5,9],
  "indian-poker": [14,24],
  "temerosa-match-pairs": [16,28],
  "temerosa-old-maid": [12,22],
  "temerosa-high-low": [7,13],
  "temerosa-five-card-draw": [12,22],
} as const);

/** Every tape item belongs to a real v0.8 match. There are no ambient pseudo-actions. */
export function recentNpcPlayEventsAt(
  profiles: readonly NpcGamblingProfile[],
  clock: CasinoPresentationClock,
  contract: NpcLedgerContract,
  limit: number,
  lookbackSeconds = DEFAULT_LOOKBACK_SECONDS,
): readonly NpcPlayEvent[] {
  if (!Number.isSafeInteger(limit)||limit<0) throw new Error("npc_live_tape_invalid_limit");
  if (!Number.isSafeInteger(lookbackSeconds)||lookbackSeconds<1||lookbackSeconds>600) throw new Error("npc_live_tape_invalid_window");
  if(limit===0)return Object.freeze([]);
  const now=clock.utcSecond();
  if(!Number.isSafeInteger(now))throw new Error("npc_live_tape_invalid_clock");
  const absoluteDay=casinoKstDayAtUtcSecond(now);
  const dayIndex=absoluteDay-contract.epochKstDay;
  if(dayIndex<0)return Object.freeze([]);
  const firstDay=Math.max(0,dayIndex-1);
  let openings=firstDay===0?Object.freeze(Object.fromEntries(profiles.map((profile)=>[profile.id,profile.openingBalance]))):completedDayBalances(profiles,firstDay-1,contract);
  const matches:Array<{match:NpcMatch;absoluteStart:number;absoluteSettle:number;firstInVisit:boolean}>=[];
  const predictions:Array<{prediction:NpcPredictionWager;absolutePlaced:number}>=[];
  for(let day=firstDay;day<=dayIndex;day+=1){
    const plan=casinoDayPlan(profiles,day,openings,contract);
    const firstByVisit=new Map<string,string>();
    for(const match of plan.matches)if(!firstByVisit.has(match.visitId))firstByVisit.set(match.visitId,match.matchId);
    const dayStart=casinoUtcSecondAtKstDay(contract.epochKstDay+day);
    for(const match of plan.matches)matches.push({match,absoluteStart:dayStart+match.startsAtSecondOfDay,absoluteSettle:dayStart+match.settlesAtSecondOfDay,firstInVisit:firstByVisit.get(match.visitId)===match.matchId});
    for(const prediction of plan.predictions)predictions.push({prediction,absolutePlaced:dayStart+prediction.placedAtSecondOfDay});
    openings=Object.freeze(Object.fromEntries(profiles.map((profile)=>[profile.id,openings[profile.id]!+(plan.sessions[profile.id]??[]).reduce((sum,session)=>sum+session.delta,0)])));
  }
  const lower=now-lookbackSeconds+1;
  const events:NpcPlayEvent[]=[];
  for(const item of matches){
    if(item.absoluteStart>now||item.absoluteSettle<lower)continue;
    for(const npcId of item.match.participantIds)events.push(...eventsForParticipant(item.match,npcId,item.absoluteStart,item.absoluteSettle,item.firstInVisit,lower,now));
  }
  for(const item of predictions)if(item.absolutePlaced>=lower&&item.absolutePlaced<=now)events.push(predictionEvent(item.prediction,item.absolutePlaced));
  events.sort((a,b)=>b.utcSecond-a.utcSecond||compareText(a.matchId,b.matchId)||compareText(a.npcId,b.npcId)||compareText(a.eventId,b.eventId));
  return Object.freeze(events.slice(0,limit));
}

function eventsForParticipant(match:NpcMatch,npcId:string,start:number,settle:number,firstInVisit:boolean,lower:number,now:number):NpcPlayEvent[]{
  const output:NpcPlayEvent[]=[];
  const prefix=`${TAPE_VERSION}:${match.matchId}:${npcId}`;
  if(firstInVisit&&start>=lower&&start<=now)output.push(event(prefix,0,match,npcId,start,"table-enter"));
  if(match.stake>0&&start+1>=lower&&start+1<=now)output.push(event(prefix,1,match,npcId,start+1,"wager-placed"));
  const [minimum,maximum]=CADENCE[match.tableId];
  const rng=new XorShift32(`${prefix}:cadence`);
  let second=start+randomInteger(3,Math.min(8,minimum),rng);
  let index=2;
  const codes=ACTIONS[match.tableId];
  while(second<settle&&second<=now){
    if(second>=lower){const code=codes[Math.floor(rng.next()*codes.length)]!;output.push(event(prefix,index,match,npcId,second,code));}
    second+=randomInteger(minimum,maximum,rng);index+=1;
  }
  return output;
}
function event(prefix:string,index:number,match:NpcMatch,npcId:string,utcSecond:number,code:NpcPlayEventCode):NpcPlayEvent{return Object.freeze({eventId:`${prefix}:${index}:${utcSecond}`,matchId:match.matchId,kind:"match-action",npcId,tableId:match.tableId,utcSecond,code,stake:match.stake,...(match.multiplier>1?{multiplier:match.multiplier as 2|3|4|5}:{})});}
function predictionEvent(prediction:NpcPredictionWager,utcSecond:number):NpcPlayEvent{return Object.freeze({
  eventId:`${TAPE_VERSION}:${prediction.predictionId}:placed:${utcSecond}`,
  matchId:prediction.matchId,kind:"match-action",npcId:prediction.bettorNpcId,tableId:"temerosa-old-maid",utcSecond,
  code:"prediction-wager-placed",stake:prediction.stake,multiplier:prediction.multiplier,
  predictionMarket:prediction.market,predictedNpcId:prediction.predictedNpcId,predictionRole:prediction.role,
});}
function randomInteger(min:number,max:number,rng:XorShift32):number{return min+Math.floor(rng.next()*(max-min+1));}
function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
