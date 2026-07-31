import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseCardSource } from "@lucky-arcade/card-io";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import type { ParsedCard } from "@lucky-arcade/contracts";
import { buildTemerosaSeriesNpcInventory, TEMEROSA_SERIES, type TemerosaSeriesKey } from "./temerosa-series-npcs.ts";

type Arguments = { sources: Record<TemerosaSeriesKey, string>; out: string; markdown?: string };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.env.INIT_CWD ?? process.cwd();
  const cards = {} as Record<TemerosaSeriesKey, ParsedCard>;
  for (const series of TEMEROSA_SERIES) cards[series] = await parseCardSource(await NodeFileSource.open(resolve(root, args.sources[series])));
  const inventory = buildTemerosaSeriesNpcInventory(cards);
  const output = resolve(root, args.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  if (args.markdown) {
    const markdown = resolve(root, args.markdown);
    await mkdir(dirname(markdown), { recursive: true });
    await writeFile(markdown, renderMarkdown(inventory), "utf8");
  }
  process.stdout.write(`${JSON.stringify({ output, ...(args.markdown ? { markdown: resolve(root, args.markdown) } : {}), ...inventory.totals, sources: inventory.sources.map(({ series, npcRecords }) => ({ series, npcRecords })) }, null, 2)}\n`);
}

function parseArgs(values: string[]): Arguments {
  const sources = {} as Record<TemerosaSeriesKey, string>;
  let out = "", markdown: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index], value = values[index + 1];
    if (!key || !value) continue;
    if (key === "--out") out = value;
    else if (key === "--markdown") markdown = value;
    else if (key.startsWith("--") && TEMEROSA_SERIES.includes(key.slice(2) as TemerosaSeriesKey)) sources[key.slice(2) as TemerosaSeriesKey] = value;
    else continue;
    index += 1;
  }
  const missing = TEMEROSA_SERIES.filter((series) => !sources[series]);
  if (!out || missing.length > 0) throw new Error(`usage: four source arguments --out <inventory.json> [--markdown <roster.md>]; missing:${missing.join(",")}`);
  return { sources, out, ...(markdown ? { markdown } : {}) };
}

function renderMarkdown(inventory: ReturnType<typeof buildTemerosaSeriesNpcInventory>): string {
  const lines = [
    "# 테메로세 4시리즈 전수 NPC 명부",
    "",
    "> 자동 생성 파일. 신원 단위는 `(시리즈, 작품 안에서 별도로 제시된 인격)`이다. 같은 인물도 시리즈가 다르면 별도 NPC다.",
    "> CHARX 원문은 포함하지 않고 로어 항목의 키·SHA-256과 자산 경로만 증거로 남긴다.",
    "",
    `총 ${inventory.totals.records}명 · 로어 근거 ${inventory.totals.loreBacked}명 · 이미지 전용 후보 ${inventory.totals.imageOnly}명 · 하우스 역할 ${inventory.totals.houseRoles}명`,
    "",
  ];
  for (const source of inventory.sources) {
    lines.push(`## ${source.series} — ${source.npcRecords}명`, "", "| ID | 표시명 | 근거 | 안전 이미지 후보 | 상태 |", "|---|---|---:|---:|---|");
    for (const record of inventory.records.filter((candidate) => candidate.series === source.series)) {
      lines.push(`| \`${record.id}\` | ${escapeCell(record.qualifiedName)} | ${record.loreEvidence.length} | ${record.assetCandidates.length} | ${record.status} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value: string): string { return value.replace(/\|/gu, "\\|"); }

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
