import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildSeriesCasinoProfiles,
  loadLegacySuccessorBehaviors,
  type SeriesRoster,
} from "./temerosa-series-flow-profile-overrides.ts";

const rosterUrl = new URL("./temerosa-series-npc-roster.generated.json", import.meta.url);
const outputUrl = new URL("./temerosa-series-casino-profiles.generated.json", import.meta.url);
const roster = JSON.parse(await readFile(rosterUrl, "utf8")) as SeriesRoster;
const legacySuccessors = await loadLegacySuccessorBehaviors();
const document = buildSeriesCasinoProfiles(roster, legacySuccessors);

await writeFile(outputUrl, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote ${document.profiles.length} profiles to ${fileURLToPath(outputUrl)}`);
