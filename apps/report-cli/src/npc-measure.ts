import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { NodeFileSource } from "@lucky-arcade/card-io/node";
import { parseCardSource } from "@lucky-arcade/card-io";
import { createFavoriteCupCartridge, extractNpcGroups, favoriteCupEligibility } from "@lucky-arcade/extract";

const paths = process.argv.slice(2).filter((value) => value !== "--");
if (!paths.length) { console.error("사용법: pnpm measure:npc -- <카드 경로> [...]"); process.exitCode = 2; }
for (const path of paths) {
  const started = performance.now();
  const source = await NodeFileSource.open(resolve(path));
  const card = await parseCardSource(source);
  const npcs = extractNpcGroups(card.assets), eligible = favoriteCupEligibility(createFavoriteCupCartridge(card));
  console.log(JSON.stringify({ card: card.name, bytes: card.sourceSize, assets: card.assets.length, groups: npcs.groups.length, eligibleDistinct: eligible.value.length, defaultPortraitEvidence: npcs.groups.filter((group) => group.emotions.some((emotion) => /^(default|normal|neutral|natural)$/i.test(emotion))).length, elapsedMs: Math.round(performance.now() - started) }));
}
