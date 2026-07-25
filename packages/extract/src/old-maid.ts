import { cardOldMaidCartridgeSchema, type CardOldMaidCartridge, type CardOldMaidSeat, type NpcGroup } from "@lucky-arcade/contracts";

export const CARD_OLD_MAID_MIN_SEATS = 4;
export const CARD_OLD_MAID_MIN_FACES = 12;
type PortraitKind = "neutral" | "pleased" | "tense" | "despair";

const EMOTIONS: Readonly<Record<PortraitKind, ReadonlySet<string>>> = {
  neutral: new Set(["default", "normal", "neutral", "natural", "idle", "base", "standing", "plain", "기본", "평상", "보통", "무표정"]),
  pleased: new Set(["smile", "smiling", "happy", "joy", "joyful", "grin", "laugh", "glad", "excited", "pleased", "미소", "웃음", "기쁨", "행복", "즐거움"]),
  tense: new Set(["angry", "mad", "rage", "furious", "upset", "annoyed", "surprise", "surprised", "shock", "startled", "worry", "worried", "nervous", "tense", "화남", "분노", "놀람", "당황", "긴장", "불안"]),
  despair: new Set(["sad", "sorrow", "cry", "crying", "tear", "despair", "defeat", "depressed", "gloomy", "disappointed", "낙담", "슬픔", "눈물", "절망", "우울", "실망"]),
};

export interface CardOldMaidEligibility { available: boolean; seatCount: number; faceCount: number; confidence: number; reasons: string[]; }

export function oldMaidEmotionKind(value: string): PortraitKind | null {
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/^[\s_.-]+|[\s_.-]+$/g, "").replace(/[\s_.-]*\d+$/, "");
  for (const kind of ["neutral", "pleased", "tense", "despair"] as const) if (EMOTIONS[kind].has(normalized)) return kind;
  return null;
}

export function createCardOldMaidCartridge(cardFingerprint: string, cardName: string, groups: readonly NpcGroup[]): CardOldMaidCartridge {
  const reliable = groups.filter((group) => group.confidence >= 0.65 && group.displayNameSource !== "technical-id");
  const faces = reliable.flatMap((group) => {
    const occurrences = new Map<string, number>();
    return group.variants.map((variant) => {
      const count = (occurrences.get(variant.emotion) ?? 0) + 1;
      occurrences.set(variant.emotion, count);
      return { faceId: `card-face:${group.id}:${variant.assetId}`, name: `${group.displayName} · ${variant.emotion}${count > 1 ? ` ${count}` : ""}`, assetId: variant.assetId, npcId: group.id, emotion: variant.emotion };
    });
  });
  const seats = reliable.flatMap((group): CardOldMaidSeat[] => {
    const mapped = new Map<PortraitKind, string>();
    for (const variant of group.variants) { const kind = oldMaidEmotionKind(variant.emotion); if (kind && !mapped.has(kind)) mapped.set(kind, variant.assetId); }
    const neutral = mapped.get("neutral"), pleased = mapped.get("pleased"), tense = mapped.get("tense");
    if (!neutral || !pleased || !tense) return [];
    return [{ npcId: group.id, displayName: group.displayName, portraits: { neutral, pleased, tense }, despairAssetId: mapped.get("despair") ?? tense, confidence: group.confidence, evidence: [...group.evidence, `old-maid-emotions:${neutral},${pleased},${tense}`] }];
  });
  return cardOldMaidCartridgeSchema.parse({ contract: "card-old-maid-cartridge/0.1", cardFingerprint, cardName, faces, seats });
}

export function cardOldMaidEligibility(cartridge: CardOldMaidCartridge): CardOldMaidEligibility {
  const seatCount = cartridge.seats.length, faceCount = cartridge.faces.length;
  return {
    available: seatCount >= CARD_OLD_MAID_MIN_SEATS && faceCount >= CARD_OLD_MAID_MIN_FACES,
    seatCount, faceCount,
    confidence: seatCount ? Math.min(...cartridge.seats.map((seat) => seat.confidence)) : 0,
    reasons: [
      seatCount >= CARD_OLD_MAID_MIN_SEATS ? `표정 의미를 판별한 인물 ${seatCount}명` : `표정 의미를 판별한 인물이 ${seatCount}명이라 최소 ${CARD_OLD_MAID_MIN_SEATS}명에 못 미칩니다.`,
      faceCount >= CARD_OLD_MAID_MIN_FACES ? `구분 가능한 카드 얼굴 ${faceCount}종` : `구분 가능한 카드 얼굴이 ${faceCount}종이라 최소 ${CARD_OLD_MAID_MIN_FACES}종에 못 미칩니다.`,
    ],
  };
}
