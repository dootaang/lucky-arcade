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

export const npcGroupSchema = z.object({
  id: z.string(),
  spriteCount: z.number().int().positive(),
  emotions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});
export type NpcGroup = z.infer<typeof npcGroupSchema>;

export const cabinetAssessmentSchema = z.object({
  cabinetId: z.string(),
  available: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});
export type CabinetAssessment = z.infer<typeof cabinetAssessmentSchema>;

export const suitabilityReportSchema = z.object({
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
    groups: z.array(npcGroupSchema),
  }),
  economy: sourcedSchema(z.boolean()),
  cabinets: z.array(cabinetAssessmentSchema),
  warnings: z.array(z.string()),
});
export type SuitabilityReport = z.infer<typeof suitabilityReportSchema>;
