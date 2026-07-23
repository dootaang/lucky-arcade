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
for (const file of initialFiles) initial += gzipSync(await readFile(new URL(file, dist))).length;
const allFiles = await readdir(assets).catch(() => []);
let total = 0;
for (const file of allFiles.filter((name) => name.endsWith(".js"))) total += gzipSync(await readFile(new URL(file, assets))).length;
const limit = 200 * 1024;
console.log(`initial JavaScript gzip: ${(initial / 1024).toFixed(1)} KiB / ${(limit / 1024).toFixed(0)} KiB`);
console.log(`all lazy cabinets and workers gzip: ${(total / 1024).toFixed(1)} KiB`);
if (initial > limit) process.exitCode = 1;
