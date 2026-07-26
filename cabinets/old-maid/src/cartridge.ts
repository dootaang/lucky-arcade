import { TEMEROSA_OLD_MAID_PACK_VERSION, type OldMaidCard, type OldMaidCartridge, type OldMaidCharacter, type OldMaidFace } from "./contracts.ts";
import { temerosaGalleryFaces } from "./temerosa-gallery.ts";
import { temerosaCasinoOldMaidLines } from "./temerosa-casino-lines.ts";
import { TEMEROSA_CASINO_BEHAVIOR_PROFILES, TEMEROSA_CASINO_TELL_STYLES } from "./temerosa-casino-personas.ts";
import { temerosaOldMaidLines } from "./temerosa-lines.ts";
import { temerosaOutcomeOldMaidLines } from "./temerosa-outcome-lines.ts";

const faces: OldMaidFace[] = [
  ...temerosaGalleryFaces,
  { id: "nemo-standing", name: "네모 · 마법소녀 기본", assetId: "nemo-magical-neutral" },
  { id: "nemo-smile", name: "네모 · 마법소녀 미소", assetId: "nemo-magical-smile" },
  { id: "nemo-tense", name: "네모 · 마법소녀 긴장", assetId: "nemo-magical-tense" },
  { id: "joker", name: "조커 · 짝 없는 카드", assetId: null },
];

const cards: OldMaidCard[] = faces.flatMap<OldMaidCard>((face) => face.id === "joker"
  ? [{ id: "joker-odd", faceId: face.id, pairId: null }]
  : [
      { id: `${face.id}-a`, faceId: face.id, pairId: face.id },
      { id: `${face.id}-b`, faceId: face.id, pairId: face.id },
    ]);

const baseCharacterDefinitions = [
  { id: "pale", name: "페일", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-pale-standing", pleased: "review-pale-smirk", tense: "pale-angry" }, despairPortrait: "pale-sad" },
  { id: "kano", name: "카노", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-kano-standing", pleased: "kano-smile", tense: "review-kano-upset" }, despairPortrait: "kano-sad" },
  { id: "nemo", name: "네모", appearanceSet: "nemo-magical-girl", tellStyle: "bluffer", portraits: { neutral: "nemo-magical-neutral", pleased: "nemo-magical-smile", tense: "nemo-magical-tense" }, despairPortrait: "nemo-magical-despair" },
  { id: "bacikal", name: "바치칼", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-bacikal-standing", pleased: "review-bacikal-smile", tense: "review-bacikal-disappointed" }, despairPortrait: "bacikal-sad" },
  { id: "alger", name: "알제", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-alger-standing", pleased: "review-alger-smile", tense: "review-alger-disappointed" }, despairPortrait: "alger-sad" },
  { id: "nieun", name: "박니은", appearanceSet: "finale-current", tellStyle: "guarded", portraits: { neutral: "nieun-standing", pleased: "nieun-smile", tense: "review-nieun-current-angry" }, despairPortrait: "review-nieun-sad" },
  { id: "lyla", name: "라일라", appearanceSet: "bestiaization", tellStyle: "bluffer", portraits: { neutral: "lyla-natural", pleased: "lyla-smile", tense: "lyla-angry" }, despairPortrait: "lyla-angry" },
  { id: "riel", name: "리엘", appearanceSet: "bestiaization", tellStyle: "open", portraits: { neutral: "riel-natural", pleased: "riel-smile", tense: "riel-sad" }, despairPortrait: "riel-sad" },
  { id: "wares", name: "워어즈", appearanceSet: "finale", tellStyle: "bluffer", portraits: { neutral: "wares-standing", pleased: "wares-smile", tense: "wares-surprised" }, despairPortrait: "wares-sad" },
] satisfies OldMaidCharacter[];

const baseCharacters: OldMaidCharacter[] = baseCharacterDefinitions.map((character) => ({
  ...character,
  behavior: TEMEROSA_CASINO_BEHAVIOR_PROFILES[character.id] as NonNullable<OldMaidCharacter["behavior"]>,
}));

export interface TemerosaCasinoPortraitAsset {
  id: string;
  characterId?: string;
  expression?: string;
  appearanceSet?: string;
}

export const temerosaOldMaidCartridge: OldMaidCartridge = {
  contract: "old-maid-cartridge/0.6",
  version: TEMEROSA_OLD_MAID_PACK_VERSION,
  title: "도둑잡기",
  oddFaceId: "joker",
  faces,
  cards,
  lines: temerosaOldMaidLines,
  characters: baseCharacters,
  selectableCharacterIds: baseCharacters.filter((character) => character.id !== "bacikal").map((character) => character.id),
};

/** Builds the curated casino cartridge from the audited 0.8 content manifest. */
export function createTemerosaCasinoOldMaidCartridge(contentAssets: readonly TemerosaCasinoPortraitAsset[]): OldMaidCartridge {
  const contentFaces: OldMaidFace[] = contentAssets
    .filter((asset) => asset.characterId && asset.expression)
    .map((asset) => ({
      id: `casino-${asset.id}`,
      name: `${characterName(asset.characterId as string)} · ${expressionName(asset.expression as string)}`,
      assetId: asset.id,
    }));
  const allFaces = uniqueById([...faces, ...contentFaces]);
  const contentCharacters = buildContentCharacters(contentAssets);
  const characters = uniqueCharacters([...contentCharacters, ...baseCharacters]);
  const characterIds = new Set(characters.map((character) => character.id));
  const selectableCharacterIds = characters.filter((character) => character.id !== "bacikal").map((character) => character.id);
  const lines = [...temerosaOldMaidLines, ...temerosaCasinoOldMaidLines, ...temerosaOutcomeOldMaidLines]
    .filter((line) => characterIds.has(line.characterId));
  const expandedCards = allFaces.flatMap<OldMaidCard>((face) => face.id === "joker"
    ? [{ id: "joker-odd", faceId: face.id, pairId: null }]
    : [{ id: `${face.id}-a`, faceId: face.id, pairId: face.id }, { id: `${face.id}-b`, faceId: face.id, pairId: face.id }]);
  return {
    ...temerosaOldMaidCartridge,
    faces: allFaces,
    cards: expandedCards,
    characters,
    selectableCharacterIds,
    lines,
    dealPairCount: 18,
  };
}

function buildContentCharacters(contentAssets: readonly TemerosaCasinoPortraitAsset[]): OldMaidCharacter[] {
  const grouped = new Map<string, Map<string, TemerosaCasinoPortraitAsset>>();
  for (const asset of contentAssets) {
    if (!asset.id.startsWith("npc-") || !asset.characterId || !asset.expression) continue;
    const expressions = grouped.get(asset.characterId) ?? new Map<string, TemerosaCasinoPortraitAsset>();
    expressions.set(asset.expression, asset);
    grouped.set(asset.characterId, expressions);
  }
  const output: OldMaidCharacter[] = [];
  for (const [characterId, expressions] of grouped) {
    const neutral = expressions.get("neutral"), pleased = expressions.get("pleased"), tense = expressions.get("tense"), despair = expressions.get("despair");
    if (!neutral || !pleased || !tense || !despair) continue;
    const behavior = TEMEROSA_CASINO_BEHAVIOR_PROFILES[characterId];
    output.push({
      id: characterId,
      name: characterName(characterId),
      appearanceSet: neutral.appearanceSet ?? "temerosa-casino",
      tellStyle: TEMEROSA_CASINO_TELL_STYLES[characterId] ?? "standard",
      ...(behavior ? { behavior } : {}),
      portraits: { neutral: neutral.id, pleased: pleased.id, tense: tense.id },
      despairPortrait: despair.id,
    });
  }
  return output;
}

function uniqueById(items: readonly OldMaidFace[]): OldMaidFace[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
function uniqueCharacters(items: readonly OldMaidCharacter[]): OldMaidCharacter[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
function expressionName(expression: string): string {
  const names: Readonly<Record<string, string>> = { neutral: "기본", pleased: "미소", tense: "긴장", despair: "절망", blush: "홍조", surprised: "놀람" };
  return names[expression] ?? expression;
}
function characterName(characterId: string): string {
  const names: Readonly<Record<string, string>> = {
    alger: "알제", lyla: "라일라", nieun: "박니은", yul: "율", cicero: "키케로", phaeo: "폐어", traver: "트레버", kreva: "크레바",
    camille: "카미유", bche: "브체", deokbae: "김덕배", machina: "마키나", katrinka: "카트린카", ttaengchil: "땡칠이", "tumit-tu": "튜밋튜",
    temute: "테뮤테", hiro: "히로", levillotte: "레빌로트", adesha: "아데샤", diamo: "디아모", morsisa: "모르시사", echo: "에코",
    nostalgia: "노스탤지아", apollyon: "아폴리온", esther: "에스더", anna: "안나 나자레아", cradle: "크레이들", lilim: "릴림", raven: "레이븐",
    nemo: "네모", flask: "플라스크", "snow-rim": "스노우 림", sakabus: "사카부스", strelka: "스트렐카", spiril: "스피릴",
  };
  return names[characterId] ?? characterId;
}
