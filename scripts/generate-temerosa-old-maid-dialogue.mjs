import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LEGACY_CHARACTERS = [
  ["페일", "pale"], ["카노", "kano"], ["네모", "nemo"], ["바치칼", "bacikal"], ["알제", "alger"],
  ["박니은", "nieun"], ["라일라", "lyla"], ["리엘", "riel"], ["워어즈", "wares"],
];

const CASINO_CHARACTERS = [
  ["에코", "echo"], ["아데샤", "adesha"], ["땡칠이", "ttaengchil"], ["카미유", "camille"],
  ["레이븐", "raven"], ["김덕배", "deokbae"], ["모르시사", "morsisa"], ["율", "yul"],
  ["안나 나자레아", "anna"], ["아폴리온 아이테", "apollyon"], ["브체", "bche"], ["키케로", "cicero"],
  ["크레이들", "cradle"], ["디아모", "diamo"], ["에스더", "esther"], ["히로 카네다", "hiro"],
  ["카트린카", "katrinka"], ["크레바", "kreva"], ["레빌로트", "levillotte"], ["릴림", "lilim"],
  ["마키나", "machina"], ["노스탤지아", "nostalgia"], ["폐어", "phaeo"], ["테뮤테", "temute"],
  ["트레버", "traver"], ["튜밋튜", "tumit-tu"],
];

const OUTCOME_CHARACTERS = [
  ...LEGACY_CHARACTERS,
  ["아데샤", "adesha"], ["안나 나자레아", "anna"], ["아폴리온 아이테", "apollyon"], ["브체", "bche"],
  ["카미유", "camille"], ["키케로", "cicero"], ["크레이들", "cradle"], ["김덕배", "deokbae"],
  ["디아모", "diamo"], ["에코", "echo"], ["에스더", "esther"], ["히로 카네다", "hiro"],
  ["카트린카", "katrinka"], ["크레바", "kreva"], ["레빌로트", "levillotte"], ["릴림", "lilim"],
  ["마키나", "machina"], ["모르시사", "morsisa"], ["노스탤지아", "nostalgia"], ["폐어", "phaeo"],
  ["레이븐", "raven"], ["테뮤테", "temute"], ["트레버", "traver"], ["땡칠이", "ttaengchil"],
  ["튜밋튜", "tumit-tu"], ["율", "yul"],
];

const LEGACY_EVENTS = ["watching", "idle-draw", "pair-discard", "taken-from", "pair-made", "joker-drawn", "joker-left", "emptied"];
const OUTCOME_EVENTS = ["table-open", "finish-1st", "finish-2nd", "finish-3rd", "defeat"];
const CASINO_CORE_EVENTS = ["watching", "idle-draw", "taken-from", "pair-discard", "emptied"];
const CASINO_RARE_EVENTS = ["pair-made", "joker-drawn", "joker-left"];

function parseDialogueBook(relativePath, characters, events, headingPattern) {
  const characterIds = new Map(characters);
  const allowedEvents = new Set(events);
  const lines = new Map();
  let characterId = null;

  for (const sourceLine of readFileSync(resolve(ROOT, relativePath), "utf8").split(/\r?\n/)) {
    const heading = headingPattern.exec(sourceLine);
    if (heading) characterId = characterIds.get(heading[1]?.trim() ?? "") ?? null;

    const row = /^\| `([^`]+)` \| (.+) \|$/.exec(sourceLine);
    if (!characterId || !row || !allowedEvents.has(row[1])) continue;

    const id = `${characterId}-${row[1]}`;
    if (lines.has(id)) throw new Error(`duplicate_dialogue_line:${relativePath}:${id}`);
    lines.set(id, row[2].split("<br>").map((beat) => beat.trim()));
  }

  const expected = characters.length * events.length;
  if (lines.size !== expected) throw new Error(`dialogue_line_count:${relativePath}:${lines.size}:${expected}`);
  for (const [, characterIdValue] of characters) {
    for (const event of events) {
      const id = `${characterIdValue}-${event}`;
      if (!lines.has(id)) throw new Error(`dialogue_line_missing:${relativePath}:${id}`);
    }
  }
  return lines;
}

function quote(value) {
  return JSON.stringify(value);
}

function textArray(beats) {
  return `[${beats.map(quote).join(", ")}]`;
}

function writeLegacy(lines) {
  const body = LEGACY_CHARACTERS.map(([, characterId]) => {
    const events = LEGACY_EVENTS.map((event) => {
      const key = event.includes("-") ? quote(event) : event;
      return `    ${key}: ${textArray(lines.get(`${characterId}-${event}`))},`;
    }).join("\n");
    return `  ${characterId}: {\n${events}\n  },`;
  }).join("\n");

  writeFileSync(resolve(ROOT, "cabinets/old-maid/src/temerosa-lines.ts"), `import type { OldMaidLine, OldMaidLineEvent } from "./contracts.ts";\n\n` +
    `type LegacyLineEvent = Exclude<OldMaidLineEvent, "table-open" | "finish-1st" | "finish-2nd" | "finish-3rd" | "defeat">;\n` +
    `type LineText = Readonly<Record<LegacyLineEvent, readonly string[]>>;\n\n` +
    `const text = {\n${body}\n} as const satisfies Readonly<Record<string, LineText>>;\n\n` +
    `export const temerosaOldMaidLines: readonly OldMaidLine[] = Object.entries(text).flatMap(([characterId, events]) =>\n` +
    `  Object.entries(events).map(([event, beats]) => ({\n` +
    `    id: \`\${characterId}-\${event}\`,\n` +
    `    characterId,\n` +
    `    event: event as OldMaidLineEvent,\n` +
    `    text: beats,\n` +
    `  })),\n` +
    `);\n`, "utf8");
}

function writeFlat(relativePath, exportName, comment, layout, lines) {
  const rows = layout.flatMap(({ characters, events }) => characters.flatMap(([, characterId]) => events.map((event) => {
    const id = `${characterId}-${event}`;
    return `  { id: ${quote(id)}, characterId: ${quote(characterId)}, event: ${quote(event)}, text: ${textArray(lines.get(id))} },`;
  }))).join("\n");

  writeFileSync(resolve(ROOT, relativePath), `import type { OldMaidLine } from "./contracts.ts";\n\n` +
    `/** ${comment} */\n` +
    `export const ${exportName} = [\n${rows}\n] as const satisfies readonly OldMaidLine[];\n`, "utf8");
}

const legacyLines = parseDialogueBook(
  "docs/TEMEROSA-OLD-MAID-DIALOGUE.md", LEGACY_CHARACTERS, LEGACY_EVENTS, /^### ([^—]+) —/,
);
const casinoLines = parseDialogueBook(
  "docs/TEMEROSA-CASINO-NPC-DIALOGUE.md", CASINO_CHARACTERS, LEGACY_EVENTS, /^### ([^—]+?)(?: —.*)?$/,
);
const outcomeLines = parseDialogueBook(
  "docs/TEMEROSA-OLD-MAID-CEREMONY-DIALOGUE.md", OUTCOME_CHARACTERS, OUTCOME_EVENTS, /^## (.+?) —/,
);

writeLegacy(legacyLines);
writeFlat(
  "cabinets/old-maid/src/temerosa-casino-lines.ts",
  "temerosaCasinoOldMaidLines",
  "CHARX-reviewed dialogue for the 26 audited Bestiaization-era casino NPCs.",
  [
    { characters: CASINO_CHARACTERS.slice(0, 8), events: LEGACY_EVENTS },
    { characters: CASINO_CHARACTERS.slice(8), events: CASINO_CORE_EVENTS },
    { characters: CASINO_CHARACTERS.slice(8), events: CASINO_RARE_EVENTS },
  ],
  casinoLines,
);
writeFlat(
  "cabinets/old-maid/src/temerosa-outcome-lines.ts",
  "temerosaOutcomeOldMaidLines",
  "Generated verbatim from docs/TEMEROSA-OLD-MAID-CEREMONY-DIALOGUE.md.",
  [{ characters: OUTCOME_CHARACTERS, events: OUTCOME_EVENTS }],
  outcomeLines,
);

process.stdout.write(`Generated ${legacyLines.size + casinoLines.size + outcomeLines.size} dialogue records.\n`);
