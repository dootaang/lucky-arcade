import { analyzedCardSchema, loreCircuitCartridgeSchema, type AnalyzedCard, type LoreCircuitCartridge, type ParsedCard } from "@lucky-arcade/contracts";
import { buildLoreGraph, verifyPuzzles, type LoreGraph } from "./graph.ts";
import { loreInputsFromCard, normalizeLoreEntries, type LoreEntry } from "./lore.ts";
import { createSuitabilityReport } from "./report.ts";

export function createAnalyzedCard(card: ParsedCard, now = new Date()): AnalyzedCard {
  const report = createSuitabilityReport(card, now);
  return analyzedCardSchema.parse({ contract: "analyzed-card/0.1", report, loreCircuit: createLoreCircuitCartridge(card) });
}

export function createLoreCircuitCartridge(card: ParsedCard): LoreCircuitCartridge {
  const entries = normalizeLoreEntries(loreInputsFromCard(card.card, card.moduleLorebooks));
  const graph = buildLoreGraph(entries);
  const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));
  const puzzles = verifyPuzzles(graph, entries).details.flatMap(({ puzzle: candidate, startLoreId }, ordinal) => {
    const target = byId.get(candidate.targetLoreId);
    if (!target || !byId.has(startLoreId)) return [];
    return [{
      id: `${card.fingerprint.slice(0, 12)}-${ordinal}`,
      startKeyword: candidate.startKeyword,
      startLoreId,
      targetLoreId: target.id,
      targetName: target.name.trim() || `기록 ${ordinal + 1}`,
      optimalHops: candidate.activationHops,
    }];
  });
  const nodes = graph.nodes.map((entry) => ({
    id: entry.id,
    name: entry.name.trim() || "이름 없는 기록",
    content: entry.content,
    clues: cluesFor(entry, graph, byId),
  }));
  return loreCircuitCartridgeSchema.parse({ contract: "lore-circuit-cartridge/0.1", cardFingerprint: card.fingerprint, cardName: card.name, nodes, puzzles });
}

function cluesFor(source: LoreEntry, graph: LoreGraph, byId: Map<string, LoreEntry>) {
  const grouped = new Map<string, string[]>();
  for (const targetId of graph.edges.get(source.id) ?? []) {
    const target = byId.get(targetId);
    if (!target) continue;
    const keyword = target.keys.find((key) => includes(source.content, key, target.caseSensitive));
    if (!keyword) continue;
    grouped.set(keyword, [...(grouped.get(keyword) ?? []), targetId]);
  }
  return [...grouped].map(([keyword, targetLoreIds]) => ({ keyword, targetLoreIds }));
}

function includes(text: string, key: string, caseSensitive: boolean): boolean {
  return caseSensitive ? text.includes(key) : text.toLocaleLowerCase().includes(key.toLocaleLowerCase());
}
