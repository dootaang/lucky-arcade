import { inspectBuiltInContentPack, supportsBuiltInCabinet } from "@lucky-arcade/cabinet-sdk";
import { builtInContentPackSchema } from "@lucky-arcade/contracts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = process.argv.slice(2).find((argument) => argument !== "--");
if (!input) throw new Error("usage: pnpm content:validate -- <built-in-pack.json>");
const path = resolve(process.env.INIT_CWD ?? process.cwd(), input);
const pack = builtInContentPackSchema.parse(JSON.parse(await readFile(path, "utf8")));
const capabilities = inspectBuiltInContentPack(pack);
const result = {
  contract: "built-in-pack-validation/0.1",
  packId: pack.packId,
  version: pack.version,
  capabilities,
  cabinets: {
    favoriteCup: supportsBuiltInCabinet(pack, "favorite-cup"),
    spriteMemory: supportsBuiltInCabinet(pack, "sprite-memory"),
  },
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
