import type { CardOldMaidCartridge } from "@lucky-arcade/contracts";
import { XorShift32 } from "@lucky-arcade/engine";
import { validateCartridge, type OldMaidCartridge, type OldMaidTellStyle } from "@lucky-arcade/old-maid";

export const CARD_OLD_MAID_PACK_VERSION = "card-old-maid/0.2" as const;

export function cardOldMaidCartridge(source: CardOldMaidCartridge): OldMaidCartridge | null {
  if (source.seats.length < 4 || source.faces.length < 12) return null;
  const faces = source.faces.map((face) => ({ id: face.faceId, name: face.name, assetId: face.assetId }));
  const cartridge: OldMaidCartridge = {
    contract: "old-maid-cartridge/0.6",
    version: CARD_OLD_MAID_PACK_VERSION,
    title: `${source.cardName} 도둑잡기`,
    oddFaceId: "joker",
    faces: [...faces, { id: "joker", name: "조커 · 짝 없는 카드", assetId: null }],
    cards: [
      ...faces.flatMap((face) => [
        { id: `${face.id}-a`, faceId: face.id, pairId: face.id },
        { id: `${face.id}-b`, faceId: face.id, pairId: face.id },
      ]),
      { id: "joker", faceId: "joker", pairId: null },
    ],
    characters: source.seats.map((seat) => ({
      id: seat.npcId,
      name: seat.displayName,
      appearanceSet: "card",
      tellStyle: tellStyle(source.cardFingerprint, seat.npcId),
      portraits: seat.portraits,
      despairPortrait: seat.despairAssetId,
    })),
  };
  validateCartridge(cartridge);
  return cartridge;
}

export function tellStyle(cardFingerprint: string, npcId: string): OldMaidTellStyle {
  return (["open", "guarded", "bluffer"] as const)[new XorShift32(`${cardFingerprint}:tell:${npcId}`).nextUint32() % 3] as OldMaidTellStyle;
}
