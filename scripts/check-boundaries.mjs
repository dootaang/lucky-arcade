import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../", import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const rules = new Map([
  ["packages/contracts", []],
  ["packages/card-io", ["@lucky-arcade/contracts"]],
  ["packages/extract", ["@lucky-arcade/contracts", "@lucky-arcade/card-io", "@lucky-arcade/engine"]],
  ["packages/engine", ["@lucky-arcade/contracts"]],
  ["packages/persistence", ["@lucky-arcade/contracts"]],
  ["packages/cabinet-sdk", ["@lucky-arcade/contracts", "@lucky-arcade/engine"]],
]);
const domAllowed = ["/packages/ui/", "/apps/web/"];
const failures = [];

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) output.push(path);
  }
  return output;
}

const allSourceFiles = (await Promise.all(["packages", "cabinets", "apps"].map((folder) => files(join(rootPath, folder))))).flat();
for (const file of allSourceFiles) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/["'](@lucky-arcade\/[^"']+)["']/g)) {
    if (match[1].includes("/src/")) failures.push(`${relative(rootPath, file)}: package deep import is forbidden (${match[1]})`);
  }
}

for (const file of await files(join(rootPath, "cabinets/gfl-ember/src"))) {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.includes("/react/")) continue;
  const source = await readFile(file, "utf8");
  if (/littlejsengine|["']react["']/.test(source)) failures.push(`${relative(rootPath, file)}: GFL core cannot import presentation engines`);
}

for (const [folder, allowed] of rules) {
  for (const file of await files(join(rootPath, folder))) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](@lucky-arcade\/[^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier.includes("/src/") || !allowed.includes(specifier)) {
        failures.push(`${relative(rootPath, file)}: forbidden workspace import ${specifier}`);
      }
    }
  }
}

for (const file of allSourceFiles) {
    const normalized = file.replaceAll("\\", "/");
    if (domAllowed.some((part) => normalized.includes(part)) || normalized.includes("/react/")) continue;
    const source = await readFile(file, "utf8");
    if (/\b(?:window|document|HTMLElement|HTMLCanvasElement)\b|["']react(?:\/[^"']*)?["']|["']react-dom(?:\/[^"']*)?["']/.test(source)) {
      failures.push(`${relative(rootPath, file)}: DOM/React is forbidden in core code`);
    }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("boundary check passed");
}
