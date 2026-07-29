import { describe,expect,it } from "vitest";
import {
  continueFiveCardDrawSeries,createFiveCardDrawSeries,createFiveCardDrawState,endFiveCardDrawSeries,
  fiveCardDrawSeriesStats,fiveCardDrawSessionRead,legalPlayerBetActions,recordFiveCardDrawSeriesHand,reduceFiveCardDraw,
  type FiveCardDrawContext,type FiveCardDrawPersona,type FiveCardDrawSeriesState,type FiveCardDrawState,
} from "../src/index.ts";

const PERSONA:FiveCardDrawPersona={drawActivity:.65,riskAppetite:.55,signalAttention:.7,signalTrust:.4,deceptionBias:.35,consistency:.72,tellStyle:"standard"};
const CONTEXT:FiveCardDrawContext={sessionId:"series-test",opponents:[{id:"lyla",name:"라일라",persona:PERSONA},{id:"pale",name:"페일",persona:{...PERSONA,riskAppetite:.7}}]};

function autoplay(initial:FiveCardDrawState,aggressive=false):FiveCardDrawState{
  let state=initial;
  for(let guard=0;guard<120&&state.phase!=="complete";guard+=1){
    if(state.currentActorId!=="player")state=reduceFiveCardDraw(state,{type:"advance"});
    else if(state.phase==="drawing")state=reduceFiveCardDraw(state,{type:"exchange",cardIds:state.hands.player.slice(0,aggressive?3:0)});
    else{
      const legal=legalPlayerBetActions(state);
      const action=aggressive?(legal.includes("raise")?"raise":legal.includes("bet")?"bet":legal.includes("call")?"call":legal[0]):(legal.includes("check")?"check":legal.includes("call")?"call":legal[0]);
      if(!action)throw new Error("series_player_action_missing");
      state=reduceFiveCardDraw(state,{type:"bet",action});
    }
  }
  if(state.phase!=="complete")throw new Error("series_autoplay_guard");return state;
}

function playHand(series:FiveCardDrawSeriesState,index:number,aggressive=false):{series:FiveCardDrawSeriesState;state:FiveCardDrawState}{
  const context:FiveCardDrawContext={...CONTEXT,sessionId:series.sessionId,...(index>0?{sessionRead:fiveCardDrawSessionRead(series.memory)}:{})};
  const ready=createFiveCardDrawState(context,index);
  const state=autoplay(reduceFiveCardDraw(ready,{type:"start",seed:`series-seed-${index}`,stake:series.stake}),aggressive);
  return {state,series:recordFiveCardDrawSeriesHand(series,state)};
}

describe("five-card draw continuous series",()=>{
  it("settles exactly three hands, rotates the dealer, and conserves every hand",()=>{
    let series=createFiveCardDrawSeries(CONTEXT,3,10);
    for(let index=0;index<3;index+=1){
      const played=playHand(series,index,index===0);series=played.series;
      expect(played.state.dealerIndex).toBe(index%played.state.seatOrder.length);
      expect(Object.values(series.summaries.at(-1)!.seatNets).reduce((sum,value)=>sum+value,0)).toBe(0);
      if(index<2){expect(series.status).toBe("intermission");series=continueFiveCardDrawSeries(series);}
    }
    expect(series.status).toBe("complete");expect(series.summaries).toHaveLength(3);
    const stats=fiveCardDrawSeriesStats(series,CONTEXT);
    expect(stats.standings).toHaveLength(3);expect(stats.standings[0]!.rank).toBe(1);
    expect(stats.standings.reduce((sum,row)=>sum+row.net,0)).toBe(0);
  });

  it("remembers only public player behavior and produces a bounded public read",()=>{
    let series=createFiveCardDrawSeries(CONTEXT,3,10);
    series=playHand(series,0,true).series;
    const read=fiveCardDrawSessionRead(series.memory);
    expect(read.handsPlayed).toBe(1);expect(read.aggressionRate).toBeGreaterThan(0);
    expect(Object.keys(read).sort()).toEqual(["aggressionRate","averageExchangeCount","foldRate","handsPlayed","revealedStrength","weakAggressionRate"]);
    expect(JSON.stringify(read)).not.toMatch(/card|handId|seed/i);
  });

  it("is deterministic and may end during an intermission",()=>{
    const first=playHand(createFiveCardDrawSeries(CONTEXT,5,10),0,true).series;
    const second=playHand(createFiveCardDrawSeries(CONTEXT,5,10),0,true).series;
    expect(second).toEqual(first);
    const ended=endFiveCardDrawSeries(first);
    expect(ended.status).toBe("complete");expect(ended.endedEarly).toBe(true);expect(ended.summaries).toHaveLength(1);
  });

  it("rejects unsupported series lengths",()=>{
    expect(()=>createFiveCardDrawSeries(CONTEXT,2 as 1,10)).toThrow("five_card_draw_series_length_invalid");
  });
});
