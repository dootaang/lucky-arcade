import type { OldMaidCard, OldMaidCartridge, OldMaidFace } from "./contracts.ts";

const faces: OldMaidFace[] = [
  { id: "nieun-warning", name: "박니은 · 경고", assetId: "review-nieun-current-angry" },
  { id: "alger-smirk", name: "알제 · 능청", assetId: "review-alger-smirk" },
  { id: "alger-tired", name: "알제 · 피로", assetId: "review-alger-disappointed" },
  { id: "pale-standing", name: "페일 · 경계", assetId: "review-pale-standing" },
  { id: "pale-smirk", name: "페일 · 장난", assetId: "review-pale-smirk" },
  { id: "kano-standing", name: "카노 · 감독", assetId: "review-kano-standing" },
  { id: "kano-upset", name: "카노 · 발끈", assetId: "review-kano-upset" },
  { id: "nemo-standing", name: "네모 · 경계", assetId: "review-bacikal-standing" },
  { id: "nemo-smile", name: "네모 · 미소", assetId: "review-bacikal-smile" },
  { id: "margin-record", name: "여백 기록", assetId: null },
];

const cards: OldMaidCard[] = faces.flatMap<OldMaidCard>((face) => face.id === "margin-record"
  ? [{ id: "margin-record-odd", faceId: face.id, pairId: null }]
  : [
      { id: `${face.id}-a`, faceId: face.id, pairId: face.id },
      { id: `${face.id}-b`, faceId: face.id, pairId: face.id },
    ]);

export const temerosaOldMaidCartridge: OldMaidCartridge = {
  contract: "old-maid-cartridge/0.1",
  version: "temerosa-old-maid/0.1",
  title: "테메로세: 여백의 도둑",
  oddFaceId: "margin-record",
  faces,
  cards,
  seats: [
    { id: "player", name: "항해사", portraitAssetId: null },
    { id: "pale", name: "페일", portraitAssetId: "review-pale-standing" },
    { id: "kano", name: "카노", portraitAssetId: "review-kano-standing" },
    { id: "nemo", name: "네모 / 바치칼", portraitAssetId: "review-bacikal-standing" },
  ],
};
