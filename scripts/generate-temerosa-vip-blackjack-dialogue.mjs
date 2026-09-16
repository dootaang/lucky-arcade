import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const groups = { "뚱한 기본": "sulky", "당황·땀": "flustered", "지친·무심": "weary", "득의·미소": "smug", "뒷모습·측면": "back", "없음": null, "표정만": null };
export function parseVipDialogue(markdown) {
  const section = markdown.split(/^## 6\. /m)[1]?.split(/^## 6-B\./m)[0];
  if (!section) throw new Error("vip_dialogue_section_missing");
  const rows = []; let firstEntry = false;
  for (const line of section.split(/\r?\n/)) {
    if (line.startsWith("### ")) firstEntry = line.startsWith("### 6.2 ");
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const key = cells[0]?.replaceAll("`", "");
    const event = firstEntry && /^L[123]$/.test(key ?? "") ? `first-entry-${key}` : key;
    if (!event || !/^[a-z][a-z0-9-]*(?:L[123])?$/.test(event) || cells.length !== 3) continue;
    if (!(cells[2] in groups)) throw new Error(`vip_dialogue_group_unknown:${cells[2]}`);
    rows.push({ id: `${event}:${rows.filter((row) => row.event === event).length + 1}`, event, text: cells[1].replace(/<br\s*\/?\s*>/gi, "\n"), group: groups[cells[2]] });
  }
  // The prose says 42; section 6 contains 42 event lines PLUS the three first-entry beats.
  if (rows.length !== 45 || rows.some((row) => !row.text || /TODO/.test(row.text))) throw new Error(`vip_dialogue_count:${rows.length}`);
  return rows;
}

async function main() {
  const root = new URL("../", import.meta.url);
  const markdown = await readFile(new URL("docs/TEMEROSA-VIP-BLACKJACK-NIEUN-DIALOGUE.md", root), "utf8");
  const lines = parseVipDialogue(markdown);
  const hash = createHash("sha256").update(JSON.stringify(lines)).digest("hex");
  const header = "// generated from docs/TEMEROSA-VIP-BLACKJACK-NIEUN-DIALOGUE.md — do not edit\n";
  await writeFile(new URL("apps/web/src/features/vip-blackjack/nieun-vip-dialogue.generated.ts", root), `${header}export const VIP_DIALOGUE_HASH = ${JSON.stringify(hash)};\nexport const NIEUN_VIP_LINES = ${JSON.stringify(lines, null, 2)} as const;\n`);
  const door = lines.filter((row) => row.event.startsWith("door-"));
  await writeFile(new URL("apps/web/src/features/vip-blackjack/vip-door-lines.generated.ts", root), `${header}export const VIP_DOOR_LINES = ${JSON.stringify(door, null, 2)} as const;\n`);
  console.log(`Generated ${lines.length} VIP lines; SHA-256 ${hash}`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
