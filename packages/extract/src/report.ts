import type { CabinetAssessment, ParsedCard, SuitabilityReport } from "@lucky-arcade/contracts";
import { suitabilityReportSchema } from "@lucky-arcade/contracts";
import { buildLoreGraph, graphMetrics, verifyPuzzles } from "./graph.ts";
import { loreInputsFromCard, normalizeLoreEntries } from "./lore.ts";
import { extractNpcGroups } from "./npc.ts";

export function createSuitabilityReport(card: ParsedCard, now = new Date()): SuitabilityReport {
  const entries = normalizeLoreEntries(loreInputsFromCard(card.card, card.moduleLorebooks));
  const graph = buildLoreGraph(entries);
  const metrics = graphMetrics(graph);
  const verification = verifyPuzzles(graph, entries), puzzles = verification.puzzles;
  const npcs = extractNpcGroups(card.assets);
  const economyEvidence = entries.filter((entry) => /(?:가격|비용|보상|골드|코인|credit|price|cost|reward|drop\s*rate)/i.test(entry.content) && /\d/.test(entry.content));
  const economy = { value: economyEvidence.length > 0, source: "heuristic" as const, confidence: Math.min(0.9, economyEvidence.length / 5), evidence: economyEvidence.slice(0, 5).map((entry) => `numeric-lore:${entry.id}`), derived: "숫자와 경제 키워드가 함께 있는 로어 수" };
  const highConfidenceNpcs = npcs.groups.filter((group) => group.confidence >= 0.65);
  const imageCount = card.assets.filter((asset) => asset.mime.startsWith("image/")).length;
  const cabinets: CabinetAssessment[] = [
    assessment("lore-circuit", puzzles.length >= 3, Math.min(1, puzzles.length / 10), puzzles.length >= 3 ? [`검증된 2~4단계 연쇄 ${puzzles.length}개`] : [verification.exhausted ? `후보 시작어 ${verification.candidateStarts}개 중 ${verification.runs}개 표본에서 검증된 연쇄가 ${puzzles.length}개` : `검증된 연쇄가 ${puzzles.length}개라 최소 3개에 못 미침`]),
    assessment("npc-checkpoint", highConfidenceNpcs.length >= 3, Math.min(1, highConfidenceNpcs.length / 8), highConfidenceNpcs.length >= 3 ? [`신뢰도 0.65 이상 NPC 그룹 ${highConfidenceNpcs.length}개`] : [`신뢰 가능한 NPC 그룹이 ${highConfidenceNpcs.length}개라 최소 3개에 못 미침`]),
    assessment("sprite-party", imageCount >= 8 && npcs.groups.length >= 2, Math.min(1, imageCount / 40), [`이미지 ${imageCount}개 · 후보 그룹 ${npcs.groups.length}개`]),
    assessment("market-puzzle", economy.value, economy.confidence, economy.value ? economy.evidence : ["검증 가능한 숫자 경제표를 찾지 못함"]),
    assessment("autobattler", false, 0, ["명시 능력치 스키마 검증은 후속 관문"]),
  ];
  return suitabilityReportSchema.parse({
    contract: "suitability-report/0.1",
    generatedAt: now.toISOString(),
    card: { fingerprint: card.fingerprint, fingerprintShort: card.fingerprint.slice(0, 12), format: card.format, sourceSize: card.sourceSize, name: card.name, assetCount: card.assets.length },
    lore: { entryCount: entries.length, regexEntryCount: graph.excludedRegex.length, metrics, verifiedPuzzleCount: puzzles.length, puzzles },
    npcs: { groupCount: npcs.groups.length, ungroupedImageCount: npcs.ungroupedImageCount, groups: npcs.groups },
    economy,
    cabinets,
    warnings: [...card.warnings, ...(verification.exhausted ? [`puzzle_validation_sampled:${verification.runs}/${verification.candidateStarts}`] : [])],
  });
}

function assessment(cabinetId: string, available: boolean, confidence: number, reasons: string[]): CabinetAssessment { return { cabinetId, available, confidence, reasons }; }
