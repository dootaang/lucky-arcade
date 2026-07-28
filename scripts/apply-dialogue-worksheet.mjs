/**
 * 집필 반환본을 워크시트의 자리표시자에 채워 넣는다.
 *
 *   node scripts/apply-dialogue-worksheet.mjs <worksheet.md> <returned.md> [--placeholder TODO_GEMINI]
 *
 * 워크시트의 구조·해설·인물 순서는 건드리지 않고 자리표시자 칸만 교체한다.
 * 반환본에 없는 인물이나 사건이 있으면 채우지 않고 남긴 채 보고한다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [worksheetArg, returnedArg, ...rest] = process.argv.slice(2);
const placeholderIndex = rest.indexOf("--placeholder");
const PLACEHOLDER = placeholderIndex === -1 ? "TODO_GEMINI" : rest[placeholderIndex + 1];

if (!worksheetArg || !returnedArg) {
  process.stderr.write("usage: node scripts/apply-dialogue-worksheet.mjs <worksheet.md> <returned.md>\n");
  process.exit(2);
}

/** `### 이름 (`id`)` 아래 `| event | 문안 |` 행을 id/event 키로 모은다. */
function collect(path) {
  const map = new Map();
  let characterId = null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const heading = /^###\s+(.+?)\s+\(`([^`]+)`\)\s*$/.exec(line);
    if (heading) {
      characterId = heading[2];
      continue;
    }
    const row = /^\|\s*([a-z][a-z-]*)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!characterId || !row || row[1] === "event" || /^-+$/.test(row[2])) continue;
    map.set(`${characterId}/${row[1]}`, row[2].trim());
  }
  return map;
}

const returned = collect(resolve(ROOT, returnedArg));
const worksheetPath = resolve(ROOT, worksheetArg);
const lines = readFileSync(worksheetPath, "utf8").split(/\r?\n/);

let characterId = null;
let filled = 0;
const missing = [];

const out = lines.map((line) => {
  const heading = /^###\s+(.+?)\s+\(`([^`]+)`\)\s*$/.exec(line);
  if (heading) {
    characterId = heading[2];
    return line;
  }
  const row = /^\|\s*([a-z][a-z-]*)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
  if (!characterId || !row || row[2].trim() !== PLACEHOLDER) return line;

  const key = `${characterId}/${row[1]}`;
  const text = returned.get(key);
  if (!text) {
    missing.push(key);
    return line;
  }
  filled += 1;
  return `| ${row[1]} | ${text} |`;
});

writeFileSync(worksheetPath, out.join("\n"), "utf8");
process.stdout.write(`${worksheetArg}: ${filled}칸 채움 · 미교체 ${missing.length}칸\n`);
for (const key of missing) process.stdout.write(`  미교체 ${key}\n`);
process.exit(missing.length > 0 ? 1 : 0);
