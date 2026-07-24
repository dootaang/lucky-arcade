import type { BuiltInContentPack, CabinetAssessment } from "@lucky-arcade/contracts";
import type { XorShift32 } from "@lucky-arcade/engine";

export interface CabinetManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  requiredCapabilities: string[];
  sessionKind: "instant" | "repeat" | "deep";
  launchKind: "built-in" | "card" | "both";
  resumeLabel: string;
  estimatedMinutes: { min: number; max: number };
}

export interface CabinetDefinition<Facts, State, Action, ViewModel> {
  manifest: CabinetManifest;
  assess(facts: Facts): CabinetAssessment;
  create(facts: Facts, rng: XorShift32): State;
  reduce(state: State, action: Action, rng: XorShift32): State;
  select(state: State): ViewModel;
  migrate(savedVersion: string, savedState: unknown): State;
}

export interface CabinetCatalogEntry<Facts> {
  manifest: CabinetManifest;
  assess(facts: Facts): CabinetAssessment;
}

export interface CabinetRegistry<Facts> {
  list(): readonly CabinetCatalogEntry<Facts>[];
  get(id: string): CabinetCatalogEntry<Facts> | undefined;
  firstAvailable(facts: Facts): CabinetCatalogEntry<Facts> | undefined;
}

export function createCabinetRegistry<Facts>(entries: readonly CabinetCatalogEntry<Facts>[]): CabinetRegistry<Facts> {
  const byId = new Map<string, CabinetCatalogEntry<Facts>>();
  for (const entry of entries) {
    if (byId.has(entry.manifest.id)) throw new Error(`cabinet_registry_duplicate:${entry.manifest.id}`);
    byId.set(entry.manifest.id, entry);
  }
  const frozen = Object.freeze([...entries]);
  return {
    list: () => frozen,
    get: (id) => byId.get(id),
    firstAvailable: (facts) => frozen.find((entry) => entry.assess(facts).available),
  };
}

export interface BuiltInPackCapabilities {
  characterCount: number;
  charactersWithPortrait: number;
  minimumExpressions: number;
  loreEntryCount: number;
}

export function inspectBuiltInContentPack(pack: BuiltInContentPack): BuiltInPackCapabilities {
  const expressionCounts = pack.characters.map((character) => Object.keys(character.assets).length);
  return {
    characterCount: pack.characters.length,
    charactersWithPortrait: expressionCounts.filter((count) => count > 0).length,
    minimumExpressions: expressionCounts.length ? Math.min(...expressionCounts) : 0,
    loreEntryCount: pack.loreEntryCount,
  };
}

export function supportsBuiltInCabinet(pack: BuiltInContentPack, cabinetId: "favorite-cup" | "sprite-memory"): boolean {
  const capabilities = inspectBuiltInContentPack(pack);
  if (cabinetId === "favorite-cup") return capabilities.charactersWithPortrait >= 8;
  return capabilities.charactersWithPortrait >= 6 && capabilities.minimumExpressions >= 2;
}
