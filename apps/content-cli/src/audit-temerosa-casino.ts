import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { sniffDisplayImageMime } from "@lucky-arcade/card-io";
import { temerosaContentManifestSchema, temerosaContentSelectionSchema } from "@lucky-arcade/contracts";
import { NEMO_APPROVED_PATHS, SEAT_ROLES, TEMEROSA_CASINO_MIN_CARD_FACES, TEMEROSA_CASINO_NPCS } from "./temerosa-casino-plan.ts";

type AuditInventory = { sourceCard: string; sourceEntryPath: string; sha256: string; geometryQueue: string; reviewStatus: string; approvedUses: string[] };
type AuditReport = { contract: string; totals: { approvedVerticalCardFaces: number; npcCandidates: number }; inventory: AuditInventory[] };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const invocationRoot = process.env.INIT_CWD ?? process.cwd();
  const manifestPath = resolve(invocationRoot, args.manifest);
  const manifestRoot = dirname(manifestPath);
  const manifest = temerosaContentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const selection = temerosaContentSelectionSchema.parse(JSON.parse(await readFile(resolve(invocationRoot, args.selection), "utf8")));
  const report = JSON.parse(await readFile(resolve(invocationRoot, args.report), "utf8")) as AuditReport;
  if (report.contract !== "temerosa-casino-asset-audit/0.1") throw new Error("casino_audit_contract_invalid");
  if (report.totals.npcCandidates !== 30 || TEMEROSA_CASINO_NPCS.length !== 30) throw new Error("casino_npc_candidate_count_invalid");
  if (report.totals.approvedVerticalCardFaces < TEMEROSA_CASINO_MIN_CARD_FACES) throw new Error("casino_vertical_card_face_minimum_failed");
  if (selection.assets.length !== manifest.assets.length || manifest.safety.selectedAssetCount !== selection.assets.length) throw new Error("casino_manifest_selection_count_mismatch");

  const approved = new Map(report.inventory.filter((item) => item.reviewStatus === "approved").map((item) => [`${item.sourceCard}:${normalize(item.sourceEntryPath)}`, item]));
  const hashes = new Set<string>();
  const ids = new Set<string>();
  for (const asset of selection.assets) {
    if (ids.has(asset.id)) throw new Error(`casino_selection_id_duplicate:${asset.id}`); ids.add(asset.id);
    if (asset.characterId === "bacikal") throw new Error("casino_bacikal_selectable_forbidden");
    const audit = approved.get(`${asset.source}:${normalize(asset.sourcePath)}`);
    if (!audit) throw new Error(`casino_selection_not_approved:${asset.id}`);
    if (!audit.approvedUses.includes("card-face") && !audit.approvedUses.includes("seat-portrait")) throw new Error(`casino_selection_use_not_approved:${asset.id}`);
    if (hashes.has(audit.sha256)) throw new Error(`casino_selection_exact_duplicate:${asset.id}`); hashes.add(audit.sha256);
  }

  const nemo = selection.assets.filter((asset) => asset.characterId === "nemo");
  if (nemo.length !== 4 || nemo.some((asset) => asset.source !== "nemo" || asset.appearanceSet !== "nemo/magical-girl/current" || !NEMO_APPROVED_PATHS.has(asset.sourcePath))) throw new Error("casino_nemo_allowlist_invalid");
  for (const npc of TEMEROSA_CASINO_NPCS) for (const role of SEAT_ROLES) {
    if (!selection.assets.some((asset) => asset.characterId === npc.id && asset.expression === role)) throw new Error(`casino_seat_role_missing:${npc.id}:${role}`);
  }

  let totalBytes = 0, files = 0;
  for (const asset of manifest.assets) {
    const sizes = new Set(asset.variants.map((variant) => variant.size));
    if (sizes.size !== 2 || !sizes.has("sm") || !sizes.has("md")) throw new Error(`casino_variant_sizes_invalid:${asset.id}`);
    for (const variant of asset.variants) {
      if (variant.mime !== "image/webp" || !variant.path.endsWith(`/${variant.size}.webp`)) throw new Error(`casino_variant_contract_invalid:${variant.path}`);
      const path = resolve(manifestRoot, variant.path); if (!path.startsWith(`${manifestRoot}${sep}`)) throw new Error(`casino_path_escape:${variant.path}`);
      const info = await stat(path); const bytes = await readFile(path);
      if (info.size !== variant.bytes || sniffDisplayImageMime(bytes) !== "image/webp") throw new Error(`casino_variant_integrity_failed:${variant.path}`);
      totalBytes += info.size; files += 1;
    }
  }
  if (totalBytes !== manifest.totalBytes) throw new Error("casino_total_bytes_mismatch");
  process.stdout.write(`${JSON.stringify({ status: "pass", npcCandidates: 30, selected: selection.assets.length, approvedVerticalCardFaces: report.totals.approvedVerticalCardFaces, files, totalBytes }, null, 2)}\n`);
}

function parseArgs(values: string[]): { manifest: string; selection: string; report: string } {
  let manifest = "", selection = "", report = "";
  for (let index = 0; index < values.length; index += 1) { const key = values[index], value = values[index + 1]; if (!key || !value) continue;
    if (key === "--manifest") manifest = value; else if (key === "--selection") selection = value; else if (key === "--report") report = value; else continue; index += 1; }
  if (!manifest || !selection || !report) throw new Error("usage: --manifest <json> --selection <json> --report <json>");
  return { manifest, selection, report };
}
function normalize(value: string): string { return value.replace(/\\/g, "/").replace(/^\.\//, ""); }

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
