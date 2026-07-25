/**
 * 표준 트럼프 핍 카드의 기하. DOM·React 없이 좌표만 계산한다.
 *
 * 영문 패턴(English pattern)의 핍 배치는 규격이므로 이미지를 쓰지 않고 그린다.
 * 캔버스는 함께 쓰는 그림 카드(J·Q·K·조커) 원본과 같은 337×518이며,
 * 같은 배율로 렌더하면 두 종류가 픽셀 단위로 정렬된다.
 */

export type PlayingCardSuit = "spades" | "hearts" | "diamonds" | "clubs";

/** 벡터로 그리는 랭크. 그림 카드는 별도 아틀라스가 담당한다. */
export type PlayingCardPipRank = "a" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

export const PLAYING_CARD_WIDTH = 337;
export const PLAYING_CARD_HEIGHT = 518;

export const PLAYING_CARD_SUITS: readonly PlayingCardSuit[] = ["spades", "hearts", "diamonds", "clubs"];
export const PLAYING_CARD_PIP_RANKS: readonly PlayingCardPipRank[] = ["a", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** 핍이 놓이는 세 열과 위아래 한계. 원본 그림 카드의 여백 비율에서 뽑았다. */
const COLUMN_X = {
  left: Math.round(PLAYING_CARD_WIDTH * 0.3),
  center: PLAYING_CARD_WIDTH / 2,
  right: Math.round(PLAYING_CARD_WIDTH * 0.7),
} as const;
const FIELD_TOP = Math.round(PLAYING_CARD_HEIGHT * 0.19);
const FIELD_BOTTOM = Math.round(PLAYING_CARD_HEIGHT * 0.81);

const PIP_SIZE = 58;
const ACE_PIP_SIZE = 118;

/** 모서리 인덱스 기하 */
export const CORNER_INDEX = { x: 27, rankBaseline: 58, rankFontSize: 48, suitY: 84, suitSize: 30 } as const;

type Column = -1 | 0 | 1;
/** [열, 세로 위치 0(위)~1(아래)] */
type Slot = readonly [Column, number];

const TWO_COLUMNS_OF_THREE: readonly Slot[] = [
  [-1, 0], [1, 0],
  [-1, 0.5], [1, 0.5],
  [-1, 1], [1, 1],
];

const TWO_COLUMNS_OF_FOUR: readonly Slot[] = [
  [-1, 0], [1, 0],
  [-1, 1 / 3], [1, 1 / 3],
  [-1, 2 / 3], [1, 2 / 3],
  [-1, 1], [1, 1],
];

const SLOTS: Readonly<Record<PlayingCardPipRank, readonly Slot[]>> = {
  a: [[0, 0.5]],
  2: [[0, 0], [0, 1]],
  3: [[0, 0], [0, 0.5], [0, 1]],
  4: [[-1, 0], [1, 0], [-1, 1], [1, 1]],
  5: [[-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
  6: TWO_COLUMNS_OF_THREE,
  7: [...TWO_COLUMNS_OF_THREE, [0, 0.25]],
  8: [...TWO_COLUMNS_OF_THREE, [0, 0.25], [0, 0.75]],
  9: [...TWO_COLUMNS_OF_FOUR, [0, 0.5]],
  10: [...TWO_COLUMNS_OF_FOUR, [0, 1 / 6], [0, 5 / 6]],
};

export interface PipPlacement {
  /** 카드 좌표계 기준 중심 */
  x: number;
  y: number;
  /** 100×100 무늬 도형에 적용할 배율 */
  scale: number;
  /** 카드 절반 아래의 핍은 뒤집어 놓는다 */
  rotated: boolean;
}

export function pipPlacements(rank: PlayingCardPipRank): readonly PipPlacement[] {
  const size = rank === "a" ? ACE_PIP_SIZE : PIP_SIZE;
  return SLOTS[rank].map(([column, t]) => {
    const y = FIELD_TOP + t * (FIELD_BOTTOM - FIELD_TOP);
    return {
      x: column === -1 ? COLUMN_X.left : column === 1 ? COLUMN_X.right : COLUMN_X.center,
      y,
      scale: size / 100,
      rotated: y > PLAYING_CARD_HEIGHT / 2,
    };
  });
}

export function isRedSuit(suit: PlayingCardSuit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function rankLabel(rank: PlayingCardPipRank): string {
  return rank === "a" ? "A" : rank;
}

const SUIT_NAME: Readonly<Record<PlayingCardSuit, string>> = {
  spades: "스페이드",
  hearts: "하트",
  diamonds: "다이아몬드",
  clubs: "클로버",
};

export function playingCardLabel(suit: PlayingCardSuit, rank: PlayingCardPipRank): string {
  return `${SUIT_NAME[suit]} ${rankLabel(rank)}`;
}
