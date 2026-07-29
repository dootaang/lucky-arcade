/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIVE_CARD_DRAW_LINE_EVENTS, validateFiveCardDrawLines, type FiveCardDrawLine, type FiveCardDrawLineEvent } from "@lucky-arcade/five-card-draw";
import { describe, expect, it } from "vitest";
import { TEMEROSA_FIVE_CARD_DRAW_LINES } from "./temerosa-five-card-draw-lines.ts";
import { createTemerosaFiveCardDrawOpponents } from "./temerosa-five-card-draw-opponents.ts";
import manifest from "../../../public/content/temerosa-margin/0.8.0/manifest.json";

const SOURCE=resolve(dirname(fileURLToPath(import.meta.url)),"../../../../../docs/TEMEROSA-FIVE-CARD-DRAW-DIALOGUE.md");

describe("Temerosa five-card draw dialogue derivation",()=>{
  const canonical=parseDialogueBook();

  it("matches the Gemini-reviewed canonical dialogue book byte for byte",()=>{
    expect(TEMEROSA_FIVE_CARD_DRAW_LINES).toEqual(canonical);
  });

  it("contains one complete unique 30 by 12 matrix",()=>{
    expect(canonical).toHaveLength(360);
    expect(new Set(canonical.map((line)=>line.characterId)).size).toBe(30);
    expect(new Set(canonical.map((line)=>line.id)).size).toBe(360);
    expect(new Set(canonical.map((line)=>`${line.characterId}:${line.event}`)).size).toBe(360);
  });

  it("covers exactly the runtime opponent roster",()=>{
    const ids=createTemerosaFiveCardDrawOpponents(manifest.assets).map((opponent)=>opponent.id);
    expect(()=>validateFiveCardDrawLines(TEMEROSA_FIVE_CARD_DRAW_LINES,ids)).not.toThrow();
  });
});

function parseDialogueBook():FiveCardDrawLine[]{
  const output:FiveCardDrawLine[]=[];let characterId:string|null=null;
  for(const sourceLine of readFileSync(SOURCE,"utf8").split(/\r?\n/)){
    const heading=/^### .+? \(`([^`]+)`\)$/.exec(sourceLine);if(heading)characterId=heading[1]??null;
    const row=/^\| ([a-z-]+) \| (.+) \|$/.exec(sourceLine);
    if(!characterId||!row||!FIVE_CARD_DRAW_LINE_EVENTS.includes(row[1] as FiveCardDrawLineEvent))continue;
    output.push({id:`${characterId}-${row[1]}`,characterId,event:row[1] as FiveCardDrawLineEvent,text:row[2]!.split("<br>").map((beat)=>beat.trim())});
  }
  return output;
}
