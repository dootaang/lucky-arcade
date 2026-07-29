import { createTemerosaCasinoOldMaidCartridge, type OldMaidCharacter, type TemerosaCasinoPortraitAsset } from "@lucky-arcade/old-maid";

/**
 * Returns the complete audited 0.8 seat roster. The old-maid cartridge keeps
 * several legacy portraits for compatibility, so presentation consumers must
 * explicitly restore the compiled npc-* variants for those duplicate ids.
 */
export function createTemerosaCasinoRoster(contentAssets: readonly TemerosaCasinoPortraitAsset[]): readonly OldMaidCharacter[] {
  const source = createTemerosaCasinoOldMaidCartridge(contentAssets);
  const selectable = new Set(source.selectableCharacterIds ?? source.characters.map((character) => character.id));
  const sourceById = new Map(source.characters.map((character) => [character.id, character]));
  const grouped = new Map<string, Map<string, TemerosaCasinoPortraitAsset>>();
  for (const asset of contentAssets) {
    if (!asset.id.startsWith("npc-") || !asset.characterId || !asset.expression) continue;
    const expressions = grouped.get(asset.characterId) ?? new Map<string, TemerosaCasinoPortraitAsset>();
    expressions.set(asset.expression, asset); grouped.set(asset.characterId, expressions);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([characterId, expressions]) => {
    if (!selectable.has(characterId) || characterId === "bacikal" || characterId === "wares") return [];
    const character = sourceById.get(characterId), neutral = expressions.get("neutral"), pleased = expressions.get("pleased"), tense = expressions.get("tense"), despair = expressions.get("despair");
    if (!character || !neutral || !pleased || !tense || !despair) return [];
    return [{
      ...character,
      appearanceSet: neutral.appearanceSet ?? character.appearanceSet,
      portraits: { neutral: neutral.id, pleased: pleased.id, tense: tense.id },
      despairPortrait: despair.id,
    }];
  });
}
