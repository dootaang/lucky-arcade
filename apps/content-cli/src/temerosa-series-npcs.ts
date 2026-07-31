import { createHash } from "node:crypto";
import type { ParsedCard } from "@lucky-arcade/contracts";
import { normalizeCasinoAssetName } from "./temerosa-casino-assets.ts";
import { TEMEROSA_FORBIDDEN_ASSET_NAME } from "./temerosa-policy.ts";

export const TEMEROSA_SERIES = ["overture", "root2", "bestiaization", "finale"] as const;
export type TemerosaSeriesKey = (typeof TEMEROSA_SERIES)[number];
export type TemerosaSeriesNpcRole = "gambler" | "dealer" | "host" | "house";
export type TemerosaSeriesNpcStatus = "confirmed" | "needs-confirmation";
export type TemerosaSeriesNpcPortraitStatus = "complete" | "partial" | "missing";
export type TemerosaSeriesNpcSeatRole = "neutral" | "pleased" | "tense" | "despair";
export type TemerosaSeriesNpcReleaseEligibility = "casino-ready" | "ledger-only" | "house-only" | "blocked" | "excluded";

export interface SeriesNpcLoreEvidence {
  entryIndex: number;
  comment: string;
  key: string;
  contentSha256: string;
}

export interface SeriesNpcAssetCandidate {
  assetId: string;
  name: string;
  path?: string;
  expression: string;
}

export interface TemerosaSeriesNpcRecord {
  id: string;
  series: TemerosaSeriesKey;
  sourcePersonaKey: string;
  /** Relationship/display grouping only. Never use as an account or game-state key. */
  canonicalPersonKey: string;
  displayName: string;
  qualifiedName: string;
  aliases: readonly string[];
  loreEvidence: readonly SeriesNpcLoreEvidence[];
  assetCandidates: readonly SeriesNpcAssetCandidate[];
  role: TemerosaSeriesNpcRole;
  status: TemerosaSeriesNpcStatus;
  portraitAvailability: {
    status: TemerosaSeriesNpcPortraitStatus;
    assetCandidateCount: number;
    seatRoles: readonly TemerosaSeriesNpcSeatRole[];
  };
  releaseEligibility: TemerosaSeriesNpcReleaseEligibility;
  exclusionReason?: string;
  pendingReason?: string;
}

export interface TemerosaSeriesNpcInventory {
  contract: "temerosa-series-npc-inventory/0.2";
  generatedAt: string;
  identityRule: "series-and-source-persona";
  sources: readonly {
    series: TemerosaSeriesKey;
    cardName: string;
    fingerprint: string;
    loreEntries: number;
    imageAssets: number;
    npcRecords: number;
  }[];
  totals: {
    records: number;
    loreBacked: number;
    imageOnly: number;
    houseRoles: number;
    assetCandidates: number;
    roles: Readonly<Record<TemerosaSeriesNpcRole, number>>;
    statuses: Readonly<Record<TemerosaSeriesNpcStatus, number>>;
    portraits: Readonly<Record<TemerosaSeriesNpcPortraitStatus, number>>;
    releaseEligibility: Readonly<Record<TemerosaSeriesNpcReleaseEligibility, number>>;
  };
  records: readonly TemerosaSeriesNpcRecord[];
}

type LoreEntry = Record<string, unknown>;
type Draft = {
  sourcePersonaKey: string;
  displayName: string;
  aliases: string[];
  loreEvidence: SeriesNpcLoreEvidence[];
};

const SERIES_LABELS: Readonly<Record<TemerosaSeriesKey, string>> = {
  overture: "서곡",
  root2: "√2",
  bestiaization: "베스티아화",
  finale: "피날레",
};

const EXPRESSION_SUFFIXES = [
  "combat-stance", "closed-eyes", "opened-eyes", "looking-book",
  "disappointed", "embarrassed", "surprised", "teardrop", "contempt",
  "natural", "neutral", "standing", "smile", "smirk", "angry", "sad",
  "blush", "upset", "fight", "combat", "cry",
] as const;

const SEAT_ROLE_EXPRESSIONS: Readonly<Record<TemerosaSeriesNpcSeatRole, readonly string[]>> = {
  neutral: ["natural", "neutral", "standing", "closed-eyes", "opened-eyes", "looking-book"],
  pleased: ["smile", "smirk", "blush"],
  tense: ["angry", "upset", "fight", "combat", "combat-stance", "surprised", "contempt"],
  despair: ["sad", "cry", "teardrop", "disappointed", "embarrassed"],
};

const STANDARD_ROSTER_EXCLUSIONS = new Set([
  "temerosa:bestiaization:bacikal",
  "temerosa:finale:bacikal",
]);

const IDENTITY_ALIASES: Readonly<Record<string, string>> = {
  "anna-nazareth": "anna",
  "apollyon-aite": "apollyon",
  "fake-flask": "flask-impostor",
  "hiro-kaneda": "hiro",
  ishmae: "ishmael",
  ismael: "ishmael",
  "kano-ameri": "kano",
  "kim-deokbae": "deokbae",
  kono: "kano",
  "limet-aite": "limet",
  "maryhub-closed-eyes": "maryhub",
  "maryhub-opened-eyes": "maryhub",
  "mortemson": "mortem",
  "nevy-krakentus": "nevy",
  niuen: "nieun",
  "nostalgia-delerpe": "nostalgia",
  "park-nieun": "nieun",
  "presser-esser": "presser",
  "real-flask": "flask",
  "reila-von-temerosa": "reila",
  "ttaengchil-i": "ttaengchil",
};

const CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  bacikal: "nemo",
  "nemo-slaughter-orbit": "nemo",
  beta: "nieun",
  a: "hab",
  nantucket: "ishmael",
  silentium: "sherirus",
  reila: "lyla",
  riel: "lyla",
  maryhub: "merry-pip",
};

export function buildTemerosaSeriesNpcInventory(cards: Readonly<Record<TemerosaSeriesKey, ParsedCard>>, generatedAt = new Date().toISOString()): TemerosaSeriesNpcInventory {
  const records = TEMEROSA_SERIES.flatMap((series) => extractSeriesRecords(series, cards[series]));
  assertSeriesNpcRecords(records);
  return {
    contract: "temerosa-series-npc-inventory/0.2",
    generatedAt,
    identityRule: "series-and-source-persona",
    sources: TEMEROSA_SERIES.map((series) => ({
      series,
      cardName: cards[series].name,
      fingerprint: cards[series].fingerprint,
      loreEntries: cards[series].moduleLorebooks.reduce((sum, book) => sum + book.length, 0),
      imageAssets: cards[series].assets.filter((asset) => asset.mime.startsWith("image/")).length,
      npcRecords: records.filter((record) => record.series === series).length,
    })),
    totals: {
      records: records.length,
      loreBacked: records.filter((record) => record.loreEvidence.length > 0).length,
      imageOnly: records.filter((record) => record.loreEvidence.length === 0).length,
      houseRoles: records.filter((record) => record.role === "house").length,
      assetCandidates: records.reduce((sum, record) => sum + record.assetCandidates.length, 0),
      roles: countBy(records, (record) => record.role, ["gambler", "dealer", "host", "house"]),
      statuses: countBy(records, (record) => record.status, ["confirmed", "needs-confirmation"]),
      portraits: countBy(records, (record) => record.portraitAvailability.status, ["complete", "partial", "missing"]),
      releaseEligibility: countBy(records, (record) => record.releaseEligibility, ["casino-ready", "ledger-only", "house-only", "blocked", "excluded"]),
    },
    records,
  };
}

export function extractSeriesRecords(series: TemerosaSeriesKey, card: ParsedCard): TemerosaSeriesNpcRecord[] {
  const entries = card.moduleLorebooks.flatMap((book) => book).filter(isObject);
  const loreDrafts = extractLoreDrafts(series, entries);
  const imageGroups = normalizeImageGroups(series, groupExpressionAssets(card));
  const records = new Map<string, TemerosaSeriesNpcRecord>();

  for (const draft of loreDrafts) {
    const key = normalizeSeriesIdentity(series, draft.sourcePersonaKey);
    const aliases = unique([key, ...draft.aliases.map((alias) => normalizeSeriesIdentity(series, alias))].filter(Boolean));
    const matching = unique(aliases.flatMap((alias) => imageGroups.get(alias) ?? []), (asset) => asset.assetId);
    records.set(key, makeRecord(series, key, draft.displayName, aliases, draft.loreEvidence, matching));
  }

  for (const [rawKey, assets] of imageGroups) {
    const key = normalizeSeriesIdentity(series, rawKey);
    if (records.has(key)) continue;
    records.set(key, makeRecord(series, key, sourceLabelFromKey(key), [key], [], assets));
  }

  return [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeImageGroups(series: TemerosaSeriesKey, groups: ReadonlyMap<string, SeriesNpcAssetCandidate[]>): Map<string, SeriesNpcAssetCandidate[]> {
  const output = new Map<string, SeriesNpcAssetCandidate[]>();
  for (const [rawKey, assets] of groups) {
    const key = normalizeSeriesIdentity(series, rawKey);
    output.set(key, unique([...(output.get(key) ?? []), ...assets], (asset) => asset.assetId));
  }
  return output;
}

export function assertSeriesNpcRecords(records: readonly TemerosaSeriesNpcRecord[]): void {
  const ids = new Set<string>();
  for (const record of records) {
    if (!/^temerosa:(?:overture|root2|bestiaization|finale):[a-z0-9][a-z0-9-]*$/u.test(record.id)) throw new Error(`series_npc_id_invalid:${record.id}`);
    if (ids.has(record.id)) throw new Error(`series_npc_id_duplicate:${record.id}`);
    ids.add(record.id);
    if (!record.displayName.trim() || !record.qualifiedName.trim()) throw new Error(`series_npc_name_missing:${record.id}`);
    if (!record.canonicalPersonKey.trim()) throw new Error(`series_npc_canonical_key_missing:${record.id}`);
    if (record.loreEvidence.length === 0 && record.assetCandidates.length < 2) throw new Error(`series_npc_image_only_evidence_insufficient:${record.id}`);
    if (record.status === "confirmed" && record.loreEvidence.length === 0) throw new Error(`series_npc_confirmed_evidence_missing:${record.id}`);
    if (record.role === "house" && record.sourcePersonaKey !== "wares") throw new Error(`series_npc_house_role_invalid:${record.id}`);
    if (record.sourcePersonaKey === "wares" && record.role !== "house") throw new Error(`series_npc_wares_role_invalid:${record.id}`);
    if (record.portraitAvailability.assetCandidateCount !== record.assetCandidates.length) throw new Error(`series_npc_portrait_count_invalid:${record.id}`);
    if (record.portraitAvailability.status === "complete" && record.portraitAvailability.seatRoles.length !== 4) throw new Error(`series_npc_portrait_complete_invalid:${record.id}`);
    if (record.releaseEligibility === "casino-ready" && (record.status !== "confirmed" || record.portraitAvailability.status !== "complete" || record.role === "house")) throw new Error(`series_npc_release_invalid:${record.id}`);
    if (record.releaseEligibility === "house-only" && (record.role !== "house" || record.exclusionReason !== "house-role-no-personal-wallet")) throw new Error(`series_npc_house_release_invalid:${record.id}`);
    if (record.releaseEligibility === "blocked" && (record.status !== "needs-confirmation" || !record.pendingReason)) throw new Error(`series_npc_block_reason_missing:${record.id}`);
    if (record.releaseEligibility === "ledger-only" && !record.pendingReason) throw new Error(`series_npc_pending_reason_missing:${record.id}`);
    if (record.releaseEligibility === "excluded" && !record.exclusionReason) throw new Error(`series_npc_exclusion_reason_missing:${record.id}`);
    if (Boolean(record.exclusionReason) === Boolean(record.pendingReason)) throw new Error(`series_npc_reason_invalid:${record.id}`);
  }
  for (const series of TEMEROSA_SERIES) if (!records.some((record) => record.series === series)) throw new Error(`series_npc_source_empty:${series}`);
}

function extractLoreDrafts(series: TemerosaSeriesKey, entries: readonly LoreEntry[]): Draft[] {
  const selected = entries.map((entry, entryIndex) => ({ entry, entryIndex })).filter(({ entry, entryIndex }) => isCharacterEntry(series, entries, entry, entryIndex));
  return selected.flatMap(({ entry, entryIndex }) => {
    const content = string(entry.content), comment = string(entry.comment), key = string(entry.key);
    const evidence = [{ entryIndex, comment, key, contentSha256: createHash("sha256").update(content).digest("hex") }];
    const heading = firstHeading(content) || comment;
    if (series === "finale" && heading.includes("CAR5P3") && heading.includes("Al2zus")) {
      return [
        draft("car5p3", "CAR5P3", ["CAR5P3", "카오피사"], evidence),
        draft("al2zus", "Al2zus", ["Al2zus", "아뤼제우스"], evidence),
      ];
    }
    const explicit = explicitIdentityOverride(series, heading, comment);
    const primary = explicit ?? identityFromEntry(heading, content, key, comment);
    return [draft(primary, displayNameFromHeading(heading), aliasesFromEntry(primary, heading, content, key, comment), evidence)];
  });
}

function isCharacterEntry(series: TemerosaSeriesKey, entries: readonly LoreEntry[], entry: LoreEntry, index: number): boolean {
  const comment = string(entry.comment).trim();
  const start = entries.findIndex((candidate) => startMarker(series, string(candidate.comment).trim()));
  if (start < 0 || index <= start) return false;
  if (series === "bestiaization") {
    const end = entries.findIndex((candidate, candidateIndex) => candidateIndex > start && string(candidate.comment).trim() === "마무리");
    if (end >= 0 && index >= end) return false;
  }
  if (!string(entry.content).trim()) return false;
  if (/^(?:-|###)/u.test(comment) || /^<.+>$/u.test(comment)) return false;
  if (/^(?:NPC List|npc list|사망자 명단)/iu.test(comment)) return false;
  return true;
}

function startMarker(series: TemerosaSeriesKey, comment: string): boolean {
  if (series === "overture") return comment === "- npc -";
  if (series === "root2") return comment.startsWith("Npc 목록");
  if (series === "bestiaization") return comment === "###등장인물npc###";
  return comment.startsWith("등장인물 | NPC");
}

function groupExpressionAssets(card: ParsedCard): Map<string, SeriesNpcAssetCandidate[]> {
  const groups = new Map<string, { assets: SeriesNpcAssetCandidate[]; expressions: Set<string> }>();
  for (const asset of card.assets) {
    if (!asset.mime.startsWith("image/") || TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.name) || TEMEROSA_FORBIDDEN_ASSET_NAME.test(asset.path ?? "")) continue;
    const normalized = normalizeCasinoAssetName(asset.name.replace(/\.(?:png|jpe?g|webp|gif|avif)$/iu, "")).value;
    const expression = EXPRESSION_SUFFIXES.find((suffix) => normalized.endsWith(`-${suffix}`));
    if (!expression) continue;
    let rawIdentity = normalized.slice(0, -(expression.length + 1));
    rawIdentity = rawIdentity.replace(/-(?:closed|opened)-eyes$/u, "");
    const identity = normalizeIdentityKey(rawIdentity);
    if (!identity) continue;
    const group = groups.get(identity) ?? { assets: [], expressions: new Set<string>() };
    group.expressions.add(expression);
    group.assets.push({ assetId: asset.id, name: asset.name, ...(asset.path ? { path: asset.path } : {}), expression });
    groups.set(identity, group);
  }
  const output = new Map<string, SeriesNpcAssetCandidate[]>();
  for (const [identity, group] of groups) {
    if (group.expressions.size < 2) continue;
    output.set(identity, group.assets);
  }
  return output;
}

function makeRecord(series: TemerosaSeriesKey, sourcePersonaKey: string, displayName: string, aliases: string[], loreEvidence: SeriesNpcLoreEvidence[], assetCandidates: SeriesNpcAssetCandidate[]): TemerosaSeriesNpcRecord {
  const canonicalPersonKey = CANONICAL_ALIASES[sourcePersonaKey] ?? sourcePersonaKey.replace(/-(?:pluto|current|finale|overture|root2)$/u, "");
  const role: TemerosaSeriesNpcRole = canonicalPersonKey === "wares" ? "house" : "gambler";
  const status: TemerosaSeriesNpcStatus = loreEvidence.length > 0 ? "confirmed" : "needs-confirmation";
  const portraitAvailability = classifyPortraitAvailability(assetCandidates);
  const id = `temerosa:${series}:${sourcePersonaKey}`;
  const release = classifyRelease(id, role, status, portraitAvailability.status);
  return {
    id,
    series,
    sourcePersonaKey,
    canonicalPersonKey,
    displayName,
    qualifiedName: `${displayName} · ${SERIES_LABELS[series]}`,
    aliases: unique(aliases),
    loreEvidence,
    assetCandidates,
    role,
    status,
    portraitAvailability,
    ...release,
  };
}

function classifyPortraitAvailability(assetCandidates: readonly SeriesNpcAssetCandidate[]): TemerosaSeriesNpcRecord["portraitAvailability"] {
  const expressions = new Set(assetCandidates.map((asset) => asset.expression));
  const seatRoles = (Object.keys(SEAT_ROLE_EXPRESSIONS) as TemerosaSeriesNpcSeatRole[])
    .filter((role) => SEAT_ROLE_EXPRESSIONS[role].some((expression) => expressions.has(expression)));
  return {
    status: seatRoles.length === 4 ? "complete" : seatRoles.length === 0 ? "missing" : "partial",
    assetCandidateCount: assetCandidates.length,
    seatRoles,
  };
}

function classifyRelease(
  id: string,
  role: TemerosaSeriesNpcRole,
  status: TemerosaSeriesNpcStatus,
  portraitStatus: TemerosaSeriesNpcPortraitStatus,
): Pick<TemerosaSeriesNpcRecord, "releaseEligibility" | "exclusionReason" | "pendingReason"> {
  if (role === "house") return { releaseEligibility: "house-only", exclusionReason: "house-role-no-personal-wallet" };
  if (STANDARD_ROSTER_EXCLUSIONS.has(id)) return { releaseEligibility: "excluded", exclusionReason: "standard-casino-roster-excluded" };
  if (status === "needs-confirmation") return { releaseEligibility: "blocked", pendingReason: "source-persona-lore-confirmation-required" };
  if (portraitStatus === "missing") return { releaseEligibility: "ledger-only", pendingReason: "seat-portrait-assets-missing" };
  if (portraitStatus === "partial") return { releaseEligibility: "ledger-only", pendingReason: "seat-portrait-role-coverage-incomplete" };
  return { releaseEligibility: "casino-ready", pendingReason: "runtime-integration-not-wired" };
}

function explicitIdentityOverride(series: TemerosaSeriesKey, heading: string, comment: string): string | undefined {
  if (series === "finale" && /^"?Flask"? \(/u.test(heading) && comment.includes("?")) return "flask-impostor";
  if (series === "bestiaization" && comment.includes("학살궤도")) return "nemo-slaughter-orbit";
  return undefined;
}

function identityFromEntry(heading: string, content: string, key: string, comment: string): string {
  const nameLine = /^(?:Name|Names):\s*([^\n/]+)/imu.exec(content)?.[1]?.trim();
  const cleanHeading = heading.replace(/^<Character Info\s*-\s*(.+)>$/iu, "$1").trim();
  const leadingLatin = /^"?([A-Za-z0-9][A-Za-z0-9 '"._-]*)/u.exec(cleanHeading)?.[1]?.trim();
  const parentheticalLatin = /\(([A-Za-z0-9][A-Za-z0-9 '"._-]*)\)/u.exec(cleanHeading)?.[1]?.trim();
  const headingLatin = /[A-Za-z0-9][A-Za-z0-9 '"._-]*/u.exec(cleanHeading)?.[0]?.trim();
  const keyLatin = key.split(",").map((value) => value.trim()).find((value) => /[A-Za-z]/u.test(value));
  const commentLatin = /[A-Za-z0-9][A-Za-z0-9 '"._-]*/u.exec(comment)?.[0]?.trim();
  const candidate = leadingLatin ?? parentheticalLatin ?? headingLatin ?? (nameLine && /[A-Za-z0-9]/u.test(nameLine) ? nameLine : undefined) ?? keyLatin ?? commentLatin;
  if (!candidate) throw new Error(`series_npc_identity_missing:${comment}`);
  return candidate;
}

function displayNameFromHeading(heading: string): string {
  return heading
    .replace(/^#+\s*/u, "")
    .replace(/^<Character Info\s*-\s*(.+)>$/iu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function aliasesFromEntry(primary: string, heading: string, content: string, key: string, comment: string): string[] {
  const nameLine = /^(?:Name|Names):\s*([^\n]+)/imu.exec(content)?.[1] ?? "";
  return unique([primary, heading, comment, nameLine, ...key.split(",")].map((value) => value.trim()).filter((value) => /[A-Za-z0-9가-힣]/u.test(value)));
}

function draft(sourcePersonaKey: string, displayName: string, aliases: string[], loreEvidence: SeriesNpcLoreEvidence[]): Draft {
  return { sourcePersonaKey: normalizeIdentityKey(sourcePersonaKey), displayName, aliases, loreEvidence };
}

function normalizeSeriesIdentity(series: TemerosaSeriesKey, value: string): string {
  const normalized = normalizeIdentityKey(value);
  if (series === "bestiaization" && normalized === "maryhub-starfall") return "maryhub";
  if (series === "bestiaization" && normalized === "nemo") return "nemo-slaughter-orbit";
  return normalized;
}

function normalizeIdentityKey(value: string): string {
  const normalized = normalizeCasinoAssetName(value).value
    .replace(/[\[\]"']/gu, "")
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return IDENTITY_ALIASES[normalized] ?? normalized;
}

function sourceLabelFromKey(value: string): string {
  return value.split("-").map((part) => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part).join(" ");
}

function firstHeading(content: string): string {
  return /^#{2,4}\s+(.+)$/mu.exec(content)?.[1]?.trim() ?? "";
}

function isObject(value: unknown): value is LoreEntry { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }
function unique<T>(values: readonly T[], key: (value: T) => string = (value) => String(value)): T[] { return [...new Map(values.map((value) => [key(value), value])).values()]; }
function countBy<T, K extends string>(values: readonly T[], key: (value: T) => K, keys: readonly K[]): Record<K, number> {
  const output = Object.fromEntries(keys.map((value) => [value, 0])) as Record<K, number>;
  for (const value of values) output[key(value)] += 1;
  return output;
}
