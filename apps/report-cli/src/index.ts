import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import { parseCardSource } from "@lucky-arcade/card-io";
import { createSuitabilityReport } from "@lucky-arcade/extract";

const args = process.argv.slice(2).filter((value) => value !== "--");
const input = args[0];
if (!input) {
  console.error("사용법: pnpm report -- <카드파일경로>");
  process.exitCode = 2;
} else {
  try {
    const source = await NodeFileSource.open(resolve(input));
    const card = await parseCardSource(source);
    const report = createSuitabilityReport(card);
    const directory = fileURLToPath(new URL("../../../reports/", import.meta.url));
    const base = report.card.fingerprintShort;
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(resolve(directory, `${base}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
      writeFile(resolve(directory, `${base}.md`), markdown(report), "utf8"),
    ]);
    console.log(`카드: ${report.card.name}`);
    console.log(`보고서: reports/${base}.json · reports/${base}.md`);
    for (const cabinet of report.cabinets) console.log(`${cabinet.available ? "가능" : "불가"} ${cabinet.cabinetId}: ${cabinet.reasons.join(" · ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function markdown(report: ReturnType<typeof createSuitabilityReport>): string {
  const available = report.cabinets.filter((item) => item.available);
  return `# 럭키★오락실 카드 적합도 보고서\n\n` +
    `- 카드: ${safe(report.card.name)}\n- 지문: \`${report.card.fingerprintShort}\`\n- 형식: ${report.card.format}\n- 파일 크기: ${report.card.sourceSize.toLocaleString()} bytes\n` +
    `- 에셋: ${report.card.assetCount.toLocaleString()}개\n\n` +
    `## 로어 연결망\n\n노드 ${report.lore.metrics.nodes}개, 간선 ${report.lore.metrics.edges}개, DAG 깊이 ${report.lore.metrics.dagDepth}, ` +
    `최단거리 지름 ${report.lore.metrics.shortestPathDiameter}, 검증된 퍼즐 ${report.lore.verifiedPuzzleCount}개입니다.\n\n` +
    `## NPC·스프라이트\n\n후보 그룹 ${report.npcs.groupCount}개, 그룹화하지 못한 이미지 ${report.npcs.ungroupedImageCount}개입니다.\n\n` +
    `## 캐비닛 판정\n\n${report.cabinets.map((item) => `- ${item.available ? "✅" : "⛔"} **${item.cabinetId}** — ${item.reasons.map(safe).join(" · ")}`).join("\n")}\n\n` +
    `결론: ${available.length ? `${available.map((item) => item.cabinetId).join(", ")} 캐비닛 후보가 관문을 통과했습니다.` : "현재 자동 관문을 통과한 캐비닛이 없습니다."}\n`;
}
function safe(value: string): string { return value.replace(/[<>]/g, "").replace(/\r?\n/g, " "); }
