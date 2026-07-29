import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const SOURCE=resolve(ROOT,"docs/TEMEROSA-FIVE-CARD-DRAW-DIALOGUE.md");
const TARGET=resolve(ROOT,"apps/web/src/features/five-card-draw/temerosa-five-card-draw-lines.ts");
const EVENTS=["table-open","check","bet","call","raise","counter-raise","fold","stand-pat","draw-one","draw-many","showdown-win","showdown-loss"];
const lines=[],ids=new Set();let characterId=null;
for(const sourceLine of readFileSync(SOURCE,"utf8").split(/\r?\n/)){
  const heading=/^### .+? \(`([^`]+)`\)$/.exec(sourceLine);if(heading)characterId=heading[1];
  const row=/^\| ([a-z-]+) \| (.+) \|$/.exec(sourceLine);if(!characterId||!row||!EVENTS.includes(row[1]))continue;
  if(row[2]==="TODO_GEMINI")throw new Error(`five_card_draw_dialogue_unreviewed:${characterId}:${row[1]}`);
  const id=`${characterId}-${row[1]}`;if(ids.has(id))throw new Error(`five_card_draw_dialogue_duplicate:${id}`);
  ids.add(id);lines.push({id,characterId,event:row[1],text:row[2].split("<br>").map((beat)=>beat.trim())});
}
if(lines.length!==360)throw new Error(`five_card_draw_dialogue_count:${lines.length}:360`);
if(new Set(lines.map((line)=>line.characterId)).size!==30)throw new Error("five_card_draw_dialogue_characters");
const rows=lines.map((line)=>`  ${JSON.stringify(line)},`).join("\n");
writeFileSync(TARGET,`import type { FiveCardDrawLine } from "@lucky-arcade/five-card-draw";\n\n/** Generated verbatim from docs/TEMEROSA-FIVE-CARD-DRAW-DIALOGUE.md. */\nexport const TEMEROSA_FIVE_CARD_DRAW_LINES = [\n${rows}\n] as const satisfies readonly FiveCardDrawLine[];\n`,"utf8");
process.stdout.write(`Generated ${lines.length} five-card draw dialogue records.\n`);
