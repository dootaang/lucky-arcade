import type { GraphMetrics, PuzzleCandidate } from "@lucky-arcade/contracts";
import { activateLore, type LoreEntry } from "./lore.ts";

export interface LoreGraph { nodes: LoreEntry[]; edges: Map<string, Set<string>>; excludedRegex: string[]; }
export interface PuzzleVerification { puzzles: PuzzleCandidate[]; runs: number; candidateStarts: number; exhausted: boolean; }

export function buildLoreGraph(entries: LoreEntry[]): LoreGraph {
  const nodes = entries.filter((entry) => entry.enabled && !entry.isFolder && entry.content.trim());
  const edges = new Map(nodes.map((entry) => [entry.id, new Set<string>()]));
  const excludedRegex = nodes.filter((entry) => entry.useRegex).map((entry) => entry.id);
  for (const source of nodes) {
    for (const target of nodes) {
      if (source.id === target.id || target.useRegex || target.constant || !target.keys.length) continue;
      const primary = target.keys.some((key) => includes(source.content, key, target.caseSensitive));
      const secondary = !target.selective || target.secondaryKeys.some((key) => includes(source.content, key, target.caseSensitive));
      if (primary && secondary) edges.get(source.id)?.add(target.id);
    }
  }
  return { nodes, edges, excludedRegex };
}

export function graphMetrics(graph: LoreGraph): GraphMetrics {
  const ids = graph.nodes.map((node) => node.id);
  if (!ids.length) return { nodes: 0, edges: 0, sccCount: 0, dagDepth: 0, shortestPathDiameter: 0, reachableRatio: 0, isolatedRatio: 0, cyclicRatio: 0 };
  const components = tarjan(ids, graph.edges);
  const componentOf = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentOf.set(id, index)));
  const dag = new Map(components.map((_, index) => [index, new Set<number>()]));
  for (const [from, targets] of graph.edges) for (const to of targets) {
    const left = componentOf.get(from), right = componentOf.get(to);
    if (left !== undefined && right !== undefined && left !== right) dag.get(left)?.add(right);
  }
  let reachablePairs = 0, diameter = 0;
  for (const start of ids) {
    const distances = bfs(start, graph.edges);
    reachablePairs += Math.max(0, distances.size - 1);
    for (const distance of distances.values()) diameter = Math.max(diameter, distance);
  }
  const isolated = ids.filter((id) => !(graph.edges.get(id)?.size) && !ids.some((other) => graph.edges.get(other)?.has(id))).length;
  const cyclic = components.filter((component) => component.length > 1 || graph.edges.get(component[0] ?? "")?.has(component[0] ?? "")).reduce((sum, component) => sum + component.length, 0);
  return {
    nodes: ids.length,
    edges: [...graph.edges.values()].reduce((sum, targets) => sum + targets.size, 0),
    sccCount: components.length,
    dagDepth: dagDepth(dag),
    shortestPathDiameter: diameter,
    reachableRatio: ids.length < 2 ? 0 : reachablePairs / (ids.length * (ids.length - 1)),
    isolatedRatio: isolated / ids.length,
    cyclicRatio: cyclic / ids.length,
  };
}

export function verifiedPuzzles(graph: LoreGraph, allEntries: LoreEntry[], limit = 200): PuzzleCandidate[] {
  return verifyPuzzles(graph, allEntries, { limit }).puzzles;
}

export function verifyPuzzles(graph: LoreGraph, allEntries: LoreEntry[], options: { limit?: number; maxRuns?: number } = {}): PuzzleVerification {
  const limit = options.limit ?? 200, maxRuns = options.maxRuns ?? 64;
  const output: PuzzleCandidate[] = [];
  const starts = graph.nodes.flatMap((start) => {
    if (start.useRegex || start.constant) return [];
    const keyword = start.keys.find((key) => key.length >= 2 && key.length <= 80);
    if (!keyword) return [];
    const distances = bfs(start.id, graph.edges);
    return [...distances.values()].some((distance) => distance >= 2 && distance <= 4) ? [{ start, keyword, distances }] : [];
  }).sort((left, right) => stableOrder(left.start.id) - stableOrder(right.start.id) || left.start.id.localeCompare(right.start.id));
  const selected = starts.slice(0, maxRuns);
  let runs = 0;
  for (const { start, keyword, distances } of selected) {
    runs += 1;
    const activation = activateLore(allEntries, [{ content: keyword }], { seed: 0, turn: 0, recursive: true, maxPasses: 4, tokenBudget: 0 });
    const activated = new Map(activation.matched.map((item) => [item.id, item.activationPass]));
    for (const [target, distance] of distances) {
      if (distance < 2 || distance > 4) continue;
      const activationPass = activated.get(target);
      if (activationPass !== undefined && activationPass >= 2 && activationPass <= 4) {
        output.push({ startKeyword: keyword, targetLoreId: target, activationHops: activationPass, verified: true });
        if (output.length >= limit) return { puzzles: output, runs, candidateStarts: starts.length, exhausted: starts.length > maxRuns };
      }
    }
  }
  return { puzzles: output, runs: selected.length, candidateStarts: starts.length, exhausted: starts.length > maxRuns };
}

function includes(text: string, key: string, caseSensitive: boolean): boolean { return caseSensitive ? text.includes(key) : text.toLocaleLowerCase().includes(key.toLocaleLowerCase()); }

function bfs(start: string, edges: Map<string, Set<string>>): Map<string, number> {
  const distances = new Map([[start, 0]]), queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === undefined) continue;
    const distance = distances.get(current) ?? 0;
    for (const next of edges.get(current) ?? []) if (!distances.has(next)) { distances.set(next, distance + 1); queue.push(next); }
  }
  return distances;
}

function tarjan(ids: string[], edges: Map<string, Set<string>>): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], stacked = new Set<string>(), components: string[][] = [];
  const visit = (id: string) => {
    indices.set(id, nextIndex); low.set(id, nextIndex); nextIndex += 1; stack.push(id); stacked.add(id);
    for (const target of edges.get(id) ?? []) {
      if (!indices.has(target)) { visit(target); low.set(id, Math.min(low.get(id) ?? 0, low.get(target) ?? 0)); }
      else if (stacked.has(target)) low.set(id, Math.min(low.get(id) ?? 0, indices.get(target) ?? 0));
    }
    if (low.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    while (stack.length) { const value = stack.pop(); if (value === undefined) break; stacked.delete(value); component.push(value); if (value === id) break; }
    components.push(component);
  };
  ids.forEach((id) => { if (!indices.has(id)) visit(id); });
  return components;
}

function dagDepth(dag: Map<number, Set<number>>): number {
  const memo = new Map<number, number>();
  const depth = (node: number): number => { const known = memo.get(node); if (known !== undefined) return known; const value = Math.max(0, ...[...(dag.get(node) ?? [])].map((next) => 1 + depth(next))); memo.set(node, value); return value; };
  return Math.max(0, ...[...dag.keys()].map(depth));
}
function stableOrder(value: string): number { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
