import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const directory = new URL("../dist/assets/", import.meta.url);
const files = await readdir(directory).catch(() => []);
let total = 0;
for (const file of files.filter((name) => name.endsWith(".js"))) total += gzipSync(await readFile(new URL(file, directory))).length;
const limit = 200 * 1024;
console.log(`initial JavaScript gzip: ${(total / 1024).toFixed(1)} KiB / ${(limit / 1024).toFixed(0)} KiB`);
if (total > limit) process.exitCode = 1;
