import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "docs/TEMEROSA-MATCH-PAIRS-DIALOGUE.md");
const TARGET = resolve(ROOT, "apps/web/src/features/match-pairs/temerosa-match-pairs-lines.ts");
const EVENTS = ["table-open", "self-match", "self-miss", "opponent-match", "opponent-miss", "streak", "ahead", "behind", "last-pair", "victory", "defeat", "draw"];
const lines = [], ids = new Set();
let characterId = null;

for (const sourceLine of readFileSync(SOURCE, "utf8").split(/\r?\n/)) {
  const heading = /^### .+? \(`([^`]+)`\)$/.exec(sourceLine);
  if (heading) characterId = heading[1];
  const row = /^\| ([a-z-]+) \| (.+) \|$/.exec(sourceLine);
  if (!characterId || !row || !EVENTS.includes(row[1])) continue;
  if (row[2] === "TODO_GEMINI") throw new Error(`match_pairs_dialogue_unreviewed:${characterId}:${row[1]}`);
  const id = `${characterId}-${row[1]}`;
  if (ids.has(id)) throw new Error(`match_pairs_dialogue_duplicate:${id}`);
  ids.add(id); lines.push({ id, characterId, event: row[1], text: row[2].split("<br>").map((beat) => beat.trim()) });
}

if (lines.length !== 360) throw new Error(`match_pairs_dialogue_count:${lines.length}:360`);
const characterIds = [...new Set(lines.map((line) => line.characterId))];
if (characterIds.length !== 30) throw new Error(`match_pairs_dialogue_characters:${characterIds.length}:30`);
for (const id of characterIds) for (const event of EVENTS) if (!ids.has(`${id}-${event}`)) throw new Error(`match_pairs_dialogue_missing:${id}:${event}`);

const rows = lines.map((line) => `  ${JSON.stringify(line)},`).join("\n");
writeFileSync(TARGET, `import type { MatchPairsLine } from "@lucky-arcade/match-pairs";\n\n/** Generated verbatim from docs/TEMEROSA-MATCH-PAIRS-DIALOGUE.md. */\nexport const TEMEROSA_MATCH_PAIRS_LINES = [\n${rows}\n] as const satisfies readonly MatchPairsLine[];\n`, "utf8");
process.stdout.write(`Generated ${lines.length} match-pairs dialogue records.\n`);
