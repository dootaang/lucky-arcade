import { describe, expect, it } from "vitest";
import {
  FIVE_CARD_DRAW_LINE_EVENTS, createFiveCardDrawState, reduceFiveCardDraw, selectFiveCardDrawSpeeches,
  validateFiveCardDrawLines, type FiveCardDrawLine, type FiveCardDrawPersona,
} from "../src/index.ts";

const PERSONA:FiveCardDrawPersona={drawActivity:.6,riskAppetite:.5,signalAttention:.5,signalTrust:0,deceptionBias:.4,consistency:.7,tellStyle:"standard"};

describe("five-card draw dialogue",()=>{
  const lines:FiveCardDrawLine[]=FIVE_CARD_DRAW_LINE_EVENTS.map((event)=>({id:`character-1-${event}`,characterId:"character-1",event,text:[event]}));

  it("validates a complete character by event matrix",()=>{
    expect(()=>validateFiveCardDrawLines(lines,["character-1"])).not.toThrow();
    expect(()=>validateFiveCardDrawLines(lines.slice(1),["character-1"])).toThrow(/missing/);
  });

  it("speaks only for an NPC action and never for a player action",()=>{
    const ready=createFiveCardDrawState({sessionId:"dialogue",opponents:[{id:"character-1",name:"상대",persona:PERSONA}]});
    const started=reduceFiveCardDraw(ready,{type:"start",seed:"speech",stake:10});
    expect(selectFiveCardDrawSpeeches(ready,started,lines)).toHaveLength(1);
    const playerAction={...started,sequence:started.sequence+1,lastAction:{seatId:"player" as const,action:"check" as const,amountUnits:0}};
    expect(selectFiveCardDrawSpeeches(started,playerAction,lines)).toEqual([]);
    const npcAction={...playerAction,sequence:playerAction.sequence+1,lastAction:{seatId:"npc-1" as const,action:"raise" as const,amountUnits:1}};
    expect(selectFiveCardDrawSpeeches(playerAction,npcAction,lines)[0]?.line.event).toBe("raise");
  });
});
