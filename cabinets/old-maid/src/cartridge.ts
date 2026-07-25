import type { OldMaidCard, OldMaidCartridge, OldMaidFace } from "./contracts.ts";
import { temerosaGalleryFaces } from "./temerosa-gallery.ts";

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

export const temerosaOldMaidCartridge: OldMaidCartridge = {
  contract: "old-maid-cartridge/0.5",
  version: "temerosa-old-maid/0.5",
  title: "테메로세 도둑잡기",
  oddFaceId: "joker",
  faces,
  cards,
  characters: [
    { id: "pale", name: "페일", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-pale-standing", pleased: "review-pale-smirk", tense: "pale-angry" }, despairPortrait: "pale-sad" },
    { id: "kano", name: "카노", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-kano-standing", pleased: "kano-smile", tense: "review-kano-upset" }, despairPortrait: "kano-sad" },
    { id: "nemo", name: "네모", appearanceSet: "nemo-magical-girl", tellStyle: "bluffer", portraits: { neutral: "nemo-magical-neutral", pleased: "nemo-magical-smile", tense: "nemo-magical-tense" }, despairPortrait: "nemo-magical-despair" },
    { id: "bacikal", name: "바치칼", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-bacikal-standing", pleased: "review-bacikal-smile", tense: "review-bacikal-disappointed" }, despairPortrait: "bacikal-sad" },
    { id: "alger", name: "알제", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-alger-standing", pleased: "review-alger-smile", tense: "review-alger-disappointed" }, despairPortrait: "alger-sad" },
    { id: "nieun", name: "박니은", appearanceSet: "finale-current", tellStyle: "guarded", portraits: { neutral: "nieun-standing", pleased: "nieun-smile", tense: "review-nieun-current-angry" }, despairPortrait: "review-nieun-sad" },
    { id: "lyla", name: "라일라", appearanceSet: "bestiaization", tellStyle: "bluffer", portraits: { neutral: "lyla-natural", pleased: "lyla-smile", tense: "lyla-angry" }, despairPortrait: "lyla-angry" },
    { id: "riel", name: "리엘", appearanceSet: "bestiaization", tellStyle: "open", portraits: { neutral: "riel-natural", pleased: "riel-smile", tense: "riel-sad" }, despairPortrait: "riel-sad" },
    { id: "wares", name: "워어즈", appearanceSet: "finale", tellStyle: "bluffer", portraits: { neutral: "wares-standing", pleased: "wares-smile", tense: "wares-surprised" }, despairPortrait: "wares-sad" },
  ],
};
