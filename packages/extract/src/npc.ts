import { isImageAsset } from "@lucky-arcade/card-io";
import type { AssetReference, NpcGroup } from "@lucky-arcade/contracts";

interface ParsedSprite { owner: string; emotion: string; }
interface GroupedSprite extends ParsedSprite { asset: AssetReference; }

const NON_CHARACTER = /^(?:bg|background|back|scene|scenery|icon|logo|ui|button|frame|effect|fx|item|weapon|skill|map)(?:[_\s-]|$)/i;
const DEFAULT_EMOTION = /^(?:default|normal|neutral|natural|idle|base)$/i;
const TECHNICAL_NAME = /^(?:npc|char(?:acter)?|sprite|asset|person)[_\s-]*\d+$/i;

export function extractNpcGroups(assets: AssetReference[]): { groups: NpcGroup[]; ungroupedImageCount: number } {
  const images = assets.filter(isImageAsset);
  const stems = [...new Set(images.map(stem))].sort();
  const defaultOwners = stems.flatMap((value) => value.match(/^(.+?)[_\s]default(?:_\d+)?$/i)?.[1] ?? []);
  const owners = [...new Set([...defaultOwners, ...stems.filter((value) => stems.some((other) => other !== value && (other.startsWith(`${value}_`) || other.startsWith(`${value} `))))])].sort((a, b) => b.length - a.length);
  const grouped = new Map<string, GroupedSprite[]>();
  let ungroupedImageCount = 0;
  for (const asset of images) {
    const parsed = parseSprite(stem(asset), owners);
    if (!parsed) { ungroupedImageCount += 1; continue; }
    const rows = grouped.get(parsed.owner) ?? [];
    rows.push({ ...parsed, asset }); grouped.set(parsed.owner, rows);
  }
  const groups = [...grouped].map(([id, sprites]) => {
    const emotions = [...new Set(sprites.map((sprite) => sprite.emotion))].sort();
    const repeatedOwner = sprites.length >= 2 ? 0.35 : 0;
    const emotionVariety = Math.min(0.35, Math.max(0, emotions.length - 1) * 0.12);
    const defaultEvidence = emotions.some((value) => /^(?:default|normal|neutral|natural)$/i.test(value)) ? 0.2 : 0;
    const confidence = Math.round(Math.min(1, 0.1 + repeatedOwner + emotionVariety + defaultEvidence) * 100) / 100;
    const ordered = [...sprites].sort((left, right) => Number(!DEFAULT_EMOTION.test(left.emotion)) - Number(!DEFAULT_EMOTION.test(right.emotion)) || left.asset.id.localeCompare(right.asset.id));
    const representative = ordered[0]?.asset;
    if (!representative) throw new Error("npc_representative_missing");
    const displayNameSource = TECHNICAL_NAME.test(id) ? "technical-id" as const : "asset-filename" as const;
    return {
      id,
      displayName: humanize(id),
      displayNameSource,
      spriteCount: sprites.length,
      emotions,
      representativeAssetId: representative.id,
      variantAssetIds: ordered.map((sprite) => sprite.asset.id),
      confidence,
      evidence: [`filename-prefix:${id}`, `sprites:${sprites.length}`, `emotions:${emotions.length}`, `representative:${representative.id}`],
    };
  }).filter((group) => group.spriteCount >= 2).sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  ungroupedImageCount += [...grouped.values()].filter((sprites) => sprites.length < 2).reduce((sum, sprites) => sum + sprites.length, 0);
  return { groups, ungroupedImageCount };
}

function parseSprite(value: string, owners: string[]): ParsedSprite | null {
  if (NON_CHARACTER.test(value)) return null;
  const owner = owners.find((candidate) => value === candidate || value.startsWith(`${candidate}_`) || value.startsWith(`${candidate} `));
  if (owner) return { owner, emotion: value.slice(owner.length).replace(/^[_\s]+/, "").replace(/_\d+$/, "") || "default" };
  const parts = value.split("_").filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts.shift();
  if (!first) return null;
  return { owner: first, emotion: parts.join("_").replace(/_\d+$/, "") || "default" };
}
function stem(asset: AssetReference): string { const value = (asset.name || asset.path || "").normalize("NFKC").trim(); return asset.extension && value.toLowerCase().endsWith(`.${asset.extension.toLowerCase()}`) ? value.slice(0, -asset.extension.length - 1) : value; }
function humanize(value: string): string { return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(); }
