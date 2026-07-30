import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url), assets = new URL("assets/", dist);
const manifest = JSON.parse(await readFile(new URL(".vite/manifest.json", dist), "utf8"));
const entry = Object.values(manifest).find((item) => item.isEntry);
if (!entry) throw new Error("vite_entry_manifest_missing");
const initialFiles = new Set();
function collect(item) { if (initialFiles.has(item.file)) return; initialFiles.add(item.file); for (const key of item.imports ?? []) { const imported = manifest[key]; if (imported) collect(imported); } }
collect(entry);
let initial = 0;
const initialBreakdown = [];
for (const file of initialFiles) {
  const bytes = gzipSync(await readFile(new URL(file, dist))).length;
  initial += bytes;
  initialBreakdown.push({ file, bytes });
}
const allFiles = await readdir(assets).catch(() => []);
let total = 0;
for (const file of allFiles.filter((name) => name.endsWith(".js"))) total += gzipSync(await readFile(new URL(file, assets))).length;
const target = 150 * 1024, warning = 170 * 1024, freeze = 185 * 1024, limit = 200 * 1024;
const status = initial <= target ? "target" : initial <= warning ? "watch" : initial <= freeze ? "warning" : initial <= limit ? "freeze" : "over-budget";
console.log(`initial JavaScript gzip: ${(initial / 1024).toFixed(1)} KiB / ${(limit / 1024).toFixed(0)} KiB (${status})`);
console.log("initial JavaScript chunks:");
for (const { file, bytes } of initialBreakdown.toSorted((left, right) => right.bytes - left.bytes)) console.log(`  ${(bytes / 1024).toFixed(1).padStart(6)} KiB  ${file}`);
console.log(`all lazy cabinets and workers gzip: ${(total / 1024).toFixed(1)} KiB`);
if (initial > warning) console.warn(`initial JavaScript exceeded the 170 KiB warning line by ${((initial - warning) / 1024).toFixed(1)} KiB`);
if (initial > freeze) console.warn("initial JavaScript exceeded the 185 KiB freeze line; report and remove new eager imports before adding more");
if (initial > limit) process.exitCode = 1;
