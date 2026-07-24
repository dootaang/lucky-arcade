import { z } from "zod";

export const CONTRACT_VERSION = "arcade-contracts/0.1" as const;

export const sourceKindSchema = z.enum(["recovered", "derived", "heuristic"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const sourcedSchema = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    source: sourceKindSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()),
    derived: z.string().optional(),
  });
export type Sourced<T> = {
  value: T;
  source: SourceKind;
  confidence: number;
  evidence: string[];
  derived?: string;
};

export const cardFormatSchema = z.enum(["json", "png", "charx", "risum", "jpeg"]);
export type CardFormat = z.infer<typeof cardFormatSchema>;

export const assetReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  extension: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  container: z.enum(["inline", "png-chunk", "zip-entry", "risum-entry", "card-image"]),
});
export type AssetReference = z.infer<typeof assetReferenceSchema>;

export const parsedCardSchema = z.object({
  contract: z.literal("parsed-card/0.1"),
  format: cardFormatSchema,
  sourceName: z.string(),
  sourceSize: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string(),
  spec: z.string(),
  specVersion: z.string(),
  card: z.record(z.string(), z.unknown()),
  assets: z.array(assetReferenceSchema),
  moduleLorebooks: z.array(z.array(z.unknown())),
  warnings: z.array(z.string()),
});
export type ParsedCard = z.infer<typeof parsedCardSchema>;

export const graphMetricsSchema = z.object({
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  sccCount: z.number().int().nonnegative(),
  dagDepth: z.number().int().nonnegative(),
  shortestPathDiameter: z.number().int().nonnegative(),
  reachableRatio: z.number().min(0).max(1),
  isolatedRatio: z.number().min(0).max(1),
  cyclicRatio: z.number().min(0).max(1),
});
export type GraphMetrics = z.infer<typeof graphMetricsSchema>;

export const puzzleCandidateSchema = z.object({
  startKeyword: z.string(),
  targetLoreId: z.string(),
  activationHops: z.number().int().min(2).max(4),
  verified: z.boolean(),
});
export type PuzzleCandidate = z.infer<typeof puzzleCandidateSchema>;

const npcGroupV1Schema = z.object({
  id: z.string(),
  spriteCount: z.number().int().positive(),
  emotions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export const npcGroupSchema = npcGroupV1Schema.extend({
  displayName: z.string().min(1),
  displayNameSource: z.enum(["card-explicit", "asset-filename", "technical-id"]),
  representativeAssetId: z.string().min(1),
  variantAssetIds: z.array(z.string().min(1)).min(1),
});
export type NpcGroup = z.infer<typeof npcGroupSchema>;

export const cabinetAssessmentSchema = z.object({
  cabinetId: z.string(),
  available: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type CabinetAssessment = z.infer<typeof cabinetAssessmentSchema>;

const suitabilityReportBaseSchema = z.object({
  contract: z.literal("suitability-report/0.1"),
  generatedAt: z.string(),
  card: z.object({
    fingerprint: z.string(),
    fingerprintShort: z.string(),
    format: cardFormatSchema,
    sourceSize: z.number().int().nonnegative(),
    name: z.string(),
    assetCount: z.number().int().nonnegative(),
  }),
  lore: z.object({
    entryCount: z.number().int().nonnegative(),
    regexEntryCount: z.number().int().nonnegative(),
    metrics: graphMetricsSchema,
    verifiedPuzzleCount: z.number().int().nonnegative(),
    puzzles: z.array(puzzleCandidateSchema),
  }),
  npcs: z.object({
    groupCount: z.number().int().nonnegative(),
    ungroupedImageCount: z.number().int().nonnegative(),
    groups: z.array(npcGroupV1Schema),
  }),
  economy: sourcedSchema(z.boolean()),
  cabinets: z.array(cabinetAssessmentSchema),
  warnings: z.array(z.string()),
});
export const suitabilityReportV1Schema = suitabilityReportBaseSchema;
export const suitabilityReportSchema = suitabilityReportBaseSchema.extend({
  contract: z.literal("suitability-report/0.2"),
  npcs: suitabilityReportBaseSchema.shape.npcs.extend({ groups: z.array(npcGroupSchema) }),
});
export type SuitabilityReport = z.infer<typeof suitabilityReportSchema>;
export type SuitabilityReportV1 = z.infer<typeof suitabilityReportV1Schema>;

export const favoriteCupCandidateSchema = z.object({
  npcId: z.string().min(1),
  displayName: z.string().min(1),
  displayNameSource: z.enum(["card-explicit", "asset-filename", "technical-id"]),
  representativeAssetId: z.string().min(1),
  variantAssetIds: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export type FavoriteCupCandidate = z.infer<typeof favoriteCupCandidateSchema>;

export const favoriteCupCartridgeSchema = z.object({
  contract: z.literal("favorite-cup-cartridge/0.1"),
  cardFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  cardName: z.string(),
  candidates: z.array(favoriteCupCandidateSchema),
});
export type FavoriteCupCartridge = z.infer<typeof favoriteCupCartridgeSchema>;

export const loreCircuitClueSchema = z.object({
  keyword: z.string().min(1),
  targetLoreIds: z.array(z.string()).min(1),
});
export type LoreCircuitClue = z.infer<typeof loreCircuitClueSchema>;

export const loreCircuitNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  content: z.string(),
  clues: z.array(loreCircuitClueSchema),
});
export type LoreCircuitNode = z.infer<typeof loreCircuitNodeSchema>;

export const loreCircuitPuzzleSchema = z.object({
  id: z.string(),
  startKeyword: z.string(),
  startLoreId: z.string(),
  targetLoreId: z.string(),
  targetName: z.string(),
  optimalHops: z.number().int().min(2).max(4),
});
export type LoreCircuitPuzzle = z.infer<typeof loreCircuitPuzzleSchema>;

export const loreCircuitCartridgeSchema = z.object({
  contract: z.literal("lore-circuit-cartridge/0.1"),
  cardFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  cardName: z.string(),
  nodes: z.array(loreCircuitNodeSchema),
  puzzles: z.array(loreCircuitPuzzleSchema),
});
export type LoreCircuitCartridge = z.infer<typeof loreCircuitCartridgeSchema>;

export const analyzedCardV1Schema = z.object({
  contract: z.literal("analyzed-card/0.1"),
  report: suitabilityReportV1Schema,
  loreCircuit: loreCircuitCartridgeSchema,
});
export type AnalyzedCardV1 = z.infer<typeof analyzedCardV1Schema>;

export const analyzedCardSchema = z.object({
  contract: z.literal("analyzed-card/0.2"),
  report: suitabilityReportSchema,
  loreCircuit: loreCircuitCartridgeSchema,
  favoriteCup: favoriteCupCartridgeSchema,
});
export type AnalyzedCard = z.infer<typeof analyzedCardSchema>;
export const anyAnalyzedCardSchema = z.union([analyzedCardSchema, analyzedCardV1Schema]);
export type AnyAnalyzedCard = z.infer<typeof anyAnalyzedCardSchema>;

export const builtInCharacterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  assets: z.record(z.string(), z.string().min(1)),
});
export type BuiltInCharacter = z.infer<typeof builtInCharacterSchema>;

export const builtInContentPackSchema = z.object({
  contract: z.literal("built-in-content-pack/0.1"),
  packId: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  characters: z.array(builtInCharacterSchema).min(1),
  loreEntryCount: z.number().int().nonnegative().default(0),
});
export type BuiltInContentPack = z.infer<typeof builtInContentPackSchema>;

export const temerosaContentChunkSchema = z.enum(["bootstrap", "pequod", "metro", "records", "trainhead", "margin"]);
export type TemerosaContentChunk = z.infer<typeof temerosaContentChunkSchema>;

export const temerosaAssetRoleSchema = z.enum(["portrait", "cutin", "enemy", "background", "effect"]);
export type TemerosaAssetRole = z.infer<typeof temerosaAssetRoleSchema>;

export const temerosaContentVariantSchema = z.object({
  size: z.enum(["sm", "md", "lg"]),
  path: z.string().min(1),
  mime: z.literal("image/webp"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
});
export type TemerosaContentVariant = z.infer<typeof temerosaContentVariantSchema>;

export const temerosaContentAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  role: temerosaAssetRoleSchema,
  chunk: temerosaContentChunkSchema,
  characterId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  expression: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  variants: z.array(temerosaContentVariantSchema).min(1),
});
export type TemerosaContentAsset = z.infer<typeof temerosaContentAssetSchema>;

export const temerosaContentManifestSchema = z.object({
  contract: z.literal("temerosa-content-manifest/0.1"),
  packId: z.literal("temerosa-margin"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  assets: z.array(temerosaContentAssetSchema).min(1),
  totalBytes: z.number().int().positive(),
  safety: z.object({
    policy: z.literal("explicit-sfw-allowlist/0.1"),
    selectedAssetCount: z.number().int().positive(),
    forbiddenAssetCount: z.literal(0),
  }),
});
export type TemerosaContentManifest = z.infer<typeof temerosaContentManifestSchema>;

export const temerosaContentSelectionSchema = z.object({
  contract: z.literal("temerosa-content-selection/0.1"),
  packId: z.literal("temerosa-margin"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  assets: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    source: z.enum(["finale", "bestiaization"]),
    sourcePath: z.string().min(1),
    role: temerosaAssetRoleSchema,
    chunk: temerosaContentChunkSchema,
    characterId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
    expression: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  })).min(1),
});
export type TemerosaContentSelection = z.infer<typeof temerosaContentSelectionSchema>;
