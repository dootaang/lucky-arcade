import { applyTokenBudget, estimateTokens } from "./tokens.ts";

export interface LoreEntry { id: string; name: string; content: string; keys: string[]; secondaryKeys: string[]; constant: boolean; selective: boolean; enabled: boolean; order: number; position: "before" | "after" | "depth"; depth: number; probability: number; caseSensitive: boolean; useRegex: boolean; recursive: boolean; scanDepth: number; tokenBudget: number; sourceScope: string; sourceNamespace: string; sourceRank: number; identity: string; isFolder: boolean; }
export interface LoreActivation { entries: LoreEntry[]; matched: Array<{ id: string; keys: string[]; activationPass: number }>; dropped: string[]; }
export interface LoreActivationOptions { scanDepth?: number; tokenBudget?: number; seed?: number; turn?: number; recursive?: boolean; maxPasses?: number; }

const terms = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const percent = (value: unknown, fallback = 100) => Math.max(0, Math.min(100, number(value, fallback)));
const scopeRank: Record<string, number> = { global: 0, preset: 1, character: 2, chat: 3, module: 4, persona: 5 };
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function decorators(content: string) { let depth = 0; for (const line of content.split(/\r?\n/)) { const match = /^@@depth\s+(\d+)/i.exec(line.trim()); if (match) depth = Math.max(0, Number(match[1])); else if (line.trim() && !line.trim().startsWith("@@")) break; } return { depth }; }
function bool(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }

export function normalizeLoreEntries(input: unknown[]): LoreEntry[] {
  const merged = new Map<string, LoreEntry>();
  for (const [ordinal, raw] of input.entries()) {
    const value = object(raw), extensions = object(value.extensions ?? value.extentions), content = String(value.content ?? ""), explicitSource = value._luckySourceNamespace != null || value._luckySourceScope != null, sourceScope = String(value._luckySourceScope ?? "character"), sourceNamespace = String(value._luckySourceNamespace ?? sourceScope), identity = String(value.id ?? value.uid ?? `${value.name ?? value.comment ?? ""}|${terms(value.keys ?? value.key).join(",")}|${ordinal}`), book = object(value._luckyBook);
    const entry: LoreEntry = { id: explicitSource ? `${sourceNamespace}:${identity}` : identity, name: String(value.name ?? value.comment ?? ""), content, keys: terms(value.keys ?? value.key), secondaryKeys: terms(value.secondaryKeys ?? value.secondary_keys ?? value.secondkey), constant: bool(value.constant ?? value.alwaysActive), selective: bool(value.selective), enabled: value.enabled !== false, order: number(value.order ?? value.insertion_order ?? value.insertorder, ordinal), position: (["before", "after", "depth"].includes(String(value.position)) ? String(value.position) : "before") as LoreEntry["position"], depth: Math.max(0, Math.trunc(number(value.depth, decorators(content).depth))), probability: percent(value.probability ?? extensions.probability ?? value.activationPercent), caseSensitive: bool(value.case_sensitive ?? extensions.case_sensitive ?? extensions.risu_case_sensitive), useRegex: bool(value.useRegex ?? value.use_regex ?? extensions.useRegex ?? extensions.risu_useRegex), recursive: bool(value.recursive ?? book.recursive_scanning), scanDepth: Math.max(0, Math.trunc(number(value.scanDepth ?? book.scan_depth, 0))), tokenBudget: Math.max(0, Math.trunc(number(value.tokenBudget ?? book.token_budget, 0))), sourceScope, sourceNamespace, sourceRank: number(value._luckySourceRank, scopeRank[sourceScope] ?? 0), identity, isFolder: value.mode === "folder" };
    merged.set(`${sourceNamespace}:${identity}`, entry);
  }
  return [...merged.values()].sort((a, b) => a.sourceRank - b.sourceRank || a.order - b.order || a.id.localeCompare(b.id));
}

function probability(entry: LoreEntry, seed: number, turn: number) { if (entry.probability >= 100) return true; if (entry.probability <= 0) return false; const text = `${seed}:${turn}:${entry.id}`; let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return ((hash >>> 0) % 10000) < Math.round(entry.probability * 100); }
function literal(haystack: string, key: string, caseSensitive: boolean) { return caseSensitive ? haystack.includes(key) : haystack.toLocaleLowerCase().includes(key.toLocaleLowerCase()); }
function regex(haystack: string, key: string, caseSensitive: boolean) { if (key.length > 500 || /(\([^)]*[+*][^)]*\))[+*]/.test(key)) return false; try { return new RegExp(key, caseSensitive ? "u" : "iu").test(haystack); } catch { return false; } }
function matches(entry: LoreEntry, haystack: string, key: string) { return entry.useRegex ? regex(haystack, key, entry.caseSensitive) : literal(haystack, key, entry.caseSensitive); }
function check(entry: LoreEntry, haystack: string, seed: number, turn: number) { if (entry.isFolder || !entry.enabled || !entry.content.trim() || !probability(entry, seed, turn)) return null; if (entry.constant) return { keys: [] as string[] }; const primary = entry.keys.filter((key) => matches(entry, haystack, key)); if (!primary.length) return null; if (entry.selective && (!entry.secondaryKeys.length || !entry.secondaryKeys.some((key) => matches(entry, haystack, key)))) return null; return { keys: primary }; }

export function activateLore(entries: LoreEntry[], messages: Array<{ content: string }>, optionsOrDepth: LoreActivationOptions | number = 20, legacyBudget = 0): LoreActivation {
  const options = typeof optionsOrDepth === "number" ? { scanDepth: optionsOrDepth, tokenBudget: legacyBudget } : optionsOrDepth, scanDepth = options.scanDepth ?? Math.max(20, ...entries.map((entry) => entry.scanDepth)), tokenBudget = options.tokenBudget ?? [...entries].reverse().find((entry) => entry.tokenBudget > 0)?.tokenBudget ?? 0, base = messages.slice(-Math.max(1, scanDepth)).map((message) => message.content).join("\n"), recursive = options.recursive ?? entries.some((entry) => entry.recursive), active = new Map<string, { entry: LoreEntry; keys: string[]; activationPass: number }>();
  let search = base;
  for (let pass = 0; pass <= (recursive ? Math.max(1, options.maxPasses ?? 4) : 0); pass += 1) {
    let changed = false;
    for (const entry of entries) {
      if (active.has(entry.id)) continue;
      const found = check(entry, search, options.seed ?? 0, options.turn ?? 0);
      if (found) { active.set(entry.id, { entry, keys: found.keys, activationPass: pass }); changed = true; }
    }
    if (!recursive || !changed) break;
    search = `${base}\n${[...active.values()].map((value) => value.entry.content).join("\n")}`;
  }
  const ordered = [...active.values()].sort((a, b) => a.entry.order - b.entry.order || a.entry.sourceRank - b.entry.sourceRank || a.entry.id.localeCompare(b.entry.id));
  const budgeted = applyTokenBudget(ordered.map((value) => ({ entry: value, order: value.entry.order, tokens: estimateTokens(value.entry.content) })), tokenBudget);
  return { entries: budgeted.kept.map((item) => item.entry.entry), matched: ordered.map((value) => ({ id: value.entry.id, keys: value.keys, activationPass: value.activationPass })), dropped: budgeted.dropped.map((item) => item.entry.entry.id) };
}

export function loreInputsFromCard(card: Record<string, unknown>, moduleLorebooks: unknown[][]): unknown[] {
  const data = object(card.data ?? card);
  const books = [object(data.character_book), object(data.characterBook), object(card.character_book)];
  const main = books.flatMap((book) => Array.isArray(book.entries) ? book.entries : []);
  const unique = new Map<string, unknown>();
  for (const raw of [...main, ...moduleLorebooks.flat()]) {
    const entry = object(raw);
    const signature = JSON.stringify([
      entry.content ?? "",
      terms(entry.keys ?? entry.key).map((value) => value.normalize("NFKC").toLocaleLowerCase()).sort(),
      terms(entry.secondaryKeys ?? entry.secondary_keys ?? entry.secondkey).map((value) => value.normalize("NFKC").toLocaleLowerCase()).sort(),
      entry.constant ?? entry.alwaysActive ?? false,
    ]);
    if (!unique.has(signature)) unique.set(signature, raw);
  }
  return [...unique.values()];
}
