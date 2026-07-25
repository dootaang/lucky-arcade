import type { OldMaidCard, OldMaidCartridge, OldMaidFace } from "./contracts.ts";

const faces: OldMaidFace[] = [
  { id: "nieun-warning", name: "박니은 · 경고", assetId: "review-nieun-current-angry" },
  { id: "alger-smirk", name: "알제 · 능청", assetId: "review-alger-smirk" },
  { id: "alger-tired", name: "알제 · 피로", assetId: "review-alger-disappointed" },
  { id: "pale-standing", name: "페일 · 경계", assetId: "review-pale-standing" },
  { id: "pale-smirk", name: "페일 · 장난", assetId: "review-pale-smirk" },
  { id: "kano-standing", name: "카노 · 감독", assetId: "review-kano-standing" },
  { id: "kano-upset", name: "카노 · 발끈", assetId: "review-kano-upset" },
  { id: "nemo-standing", name: "네모 · 경계", assetId: "nemo-natural" },
  { id: "nemo-smile", name: "네모 · 미소", assetId: "nemo-smile" },
  { id: "joker", name: "조커 · 짝 없는 카드", assetId: null },
];

const cards: OldMaidCard[] = faces.flatMap<OldMaidCard>((face) => face.id === "joker"
  ? [{ id: "joker-odd", faceId: face.id, pairId: null }]
  : [
      { id: `${face.id}-a`, faceId: face.id, pairId: face.id },
      { id: `${face.id}-b`, faceId: face.id, pairId: face.id },
    ]);

export const temerosaOldMaidCartridge: OldMaidCartridge = {
  contract: "old-maid-cartridge/0.3",
  version: "temerosa-old-maid/0.3",
  title: "테메로세 도둑잡기",
  oddFaceId: "joker",
  faces,
  cards,
  characters: [
    { id: "pale", name: "페일", appearanceSet: "finale", tellStyle: "open", portraits: { neutral: "review-pale-standing", pleased: "review-pale-smirk", tense: "pale-angry" } },
    { id: "kano", name: "카노", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-kano-standing", pleased: "kano-smile", tense: "review-kano-upset" } },
    { id: "nemo", name: "네모", appearanceSet: "bestiaization", tellStyle: "bluffer", portraits: { neutral: "nemo-natural", pleased: "nemo-smile", tense: "nemo-angry" } },
    { id: "alger", name: "알제", appearanceSet: "finale", tellStyle: "guarded", portraits: { neutral: "review-alger-standing", pleased: "review-alger-smile", tense: "review-alger-disappointed" } },
    { id: "nieun", name: "박니은", appearanceSet: "finale-current", tellStyle: "guarded", portraits: { neutral: "nieun-standing", pleased: "nieun-smile", tense: "review-nieun-current-angry" } },
    { id: "lyla", name: "라일라", appearanceSet: "bestiaization", tellStyle: "bluffer", portraits: { neutral: "lyla-natural", pleased: "lyla-smile", tense: "lyla-angry" } },
    { id: "riel", name: "리엘", appearanceSet: "bestiaization", tellStyle: "open", portraits: { neutral: "riel-natural", pleased: "riel-smile", tense: "riel-sad" } },
    { id: "wares", name: "워어즈", appearanceSet: "finale", tellStyle: "bluffer", portraits: { neutral: "wares-standing", pleased: "wares-smile", tense: "wares-surprised" } },
  ],
};
