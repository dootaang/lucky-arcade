import { memo, useId, type CSSProperties, type ReactElement } from "react";
import {
  CORNER_INDEX,
  PLAYING_CARD_HEIGHT,
  PLAYING_CARD_WIDTH,
  isRedSuit,
  pipPlacements,
  playingCardLabel,
  rankLabel,
  type PlayingCardPipRank,
  type PlayingCardSuit,
} from "./playing-card-layout.ts";

export * from "./playing-card-layout.ts";

/**
 * 표준 트럼프 핍 카드(A~10)를 벡터로 그린다. 이미지 요청이 없고 크기 제한이 없다.
 *
 * 색은 CSS 변수로 덮을 수 있다. 기본값은 함께 쓰는 그림 카드 원본에서 뽑은 값이다.
 *   --playing-card-red · --playing-card-ink · --playing-card-paper
 *
 * 그림 카드(J·Q·K·조커)는 실제 일러스트라 벡터로 만들 수 없다. 별도 아틀라스가 담당한다.
 */

const RED = "var(--playing-card-red, #C60202)";
const INK = "var(--playing-card-ink, #000000)";
const PAPER = "var(--playing-card-paper, #F8F8F8)";

/** 100×100 좌표계의 무늬 도형. 카드마다 복제되지 않고 이 한 곳에만 존재한다. */
const SUIT_SHAPE: Readonly<Record<PlayingCardSuit, ReactElement>> = {
  hearts: <path d="M50 90 C22 68 8 52 8 34 C8 19 19 8 32 8 C40 8 46 12 50 19 C54 12 60 8 68 8 C81 8 92 19 92 34 C92 52 78 68 50 90 Z" />,
  diamonds: <path d="M50 5 L90 50 L50 95 L10 50 Z" />,
  spades: (
    <>
      <path d="M50 8 C50 8 90 38 90 58 C90 71 81 79 70 79 C62 79 55 75 50 69 C45 75 38 79 30 79 C19 79 10 71 10 58 C10 38 50 8 50 8 Z" />
      <path d="M44 64 L56 64 C56 79 60 89 66 95 L34 95 C40 89 44 79 44 64 Z" />
    </>
  ),
  clubs: (
    <>
      <circle cx="50" cy="28" r="19" />
      <circle cx="28" cy="62" r="19" />
      <circle cx="72" cy="62" r="19" />
      <path d="M44 58 L56 58 C56 78 60 89 66 95 L34 95 C40 89 44 78 44 58 Z" />
    </>
  ),
};

function Pip({ suit, x, y, scale, rotated }: { suit: PlayingCardSuit; x: number; y: number; scale: number; rotated: boolean }) {
  const spin = rotated ? " rotate(180)" : "";
  return <g transform={`translate(${round(x)} ${round(y)})${spin} scale(${round(scale, 4)}) translate(-50 -50)`}>{SUIT_SHAPE[suit]}</g>;
}

function CornerIndex({ suit, rank, flipped }: { suit: PlayingCardSuit; rank: PlayingCardPipRank; flipped: boolean }) {
  const label = rankLabel(rank);
  const wide = label.length > 1;
  return (
    <g transform={flipped ? `rotate(180 ${PLAYING_CARD_WIDTH / 2} ${PLAYING_CARD_HEIGHT / 2})` : undefined}>
      <text
        x={CORNER_INDEX.x}
        y={CORNER_INDEX.rankBaseline}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={CORNER_INDEX.rankFontSize}
        fontWeight={700}
        textAnchor="middle"
        {...(wide ? { textLength: 34, lengthAdjust: "spacingAndGlyphs" as const } : {})}
      >
        {label}
      </text>
      <Pip suit={suit} x={CORNER_INDEX.x} y={CORNER_INDEX.suitY} scale={CORNER_INDEX.suitSize / 100} rotated={false} />
    </g>
  );
}

export interface PlayingCardProps {
  suit: PlayingCardSuit;
  rank: PlayingCardPipRank;
  className?: string;
  style?: CSSProperties;
  /** 접근성 이름을 직접 지정한다. 생략하면 `하트 7` 형태로 만든다. */
  label?: string;
  /** 이름이 옆의 글자로 이미 전달되는 경우 접근성 트리에서 감춘다. */
  decorative?: boolean;
}

export const PlayingCard = /*#__PURE__*/ memo(function PlayingCard({ suit, rank, className, style, label, decorative = false }: PlayingCardProps) {
  const color = isRedSuit(suit) ? RED : INK;
  return (
    <svg
      viewBox={`0 0 ${PLAYING_CARD_WIDTH} ${PLAYING_CARD_HEIGHT}`}
      className={className}
      style={{ display: "block", width: "100%", aspectRatio: `${PLAYING_CARD_WIDTH} / ${PLAYING_CARD_HEIGHT}`, ...style }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ?? playingCardLabel(suit, rank) })}
    >
      <rect x={1.5} y={1.5} width={PLAYING_CARD_WIDTH - 3} height={PLAYING_CARD_HEIGHT - 3} rx={18} fill={PAPER} stroke={INK} strokeWidth={3} />
      <g fill={color}>
        {pipPlacements(rank).map((pip, index) => (
          <Pip key={index} suit={suit} x={pip.x} y={pip.y} scale={pip.scale} rotated={pip.rotated} />
        ))}
        <CornerIndex suit={suit} rank={rank} flipped={false} />
        <CornerIndex suit={suit} rank={rank} flipped />
      </g>
    </svg>
  );
});

export interface PlayingCardBackProps {
  className?: string;
  style?: CSSProperties;
  label?: string;
  decorative?: boolean;
}

export const PlayingCardBack = /*#__PURE__*/ memo(function PlayingCardBack({ className, style, label, decorative = true }: PlayingCardBackProps) {
  const patternId = `playing-card-weave-${useId().replaceAll(":", "")}`;
  return (
    <svg
      viewBox={`0 0 ${PLAYING_CARD_WIDTH} ${PLAYING_CARD_HEIGHT}`}
      className={className}
      style={{ display: "block", width: "100%", aspectRatio: `${PLAYING_CARD_WIDTH} / ${PLAYING_CARD_HEIGHT}`, ...style }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ?? "카드 뒷면" })}
    >
      <defs>
        <pattern id={patternId} width={24} height={24} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={24} height={24} fill={RED} />
          <path d="M0 12 H24 M12 0 V24" stroke={PAPER} strokeWidth={3} strokeOpacity={0.45} />
        </pattern>
      </defs>
      <rect x={1.5} y={1.5} width={PLAYING_CARD_WIDTH - 3} height={PLAYING_CARD_HEIGHT - 3} rx={18} fill={PAPER} stroke={INK} strokeWidth={3} />
      <rect x={16} y={16} width={PLAYING_CARD_WIDTH - 32} height={PLAYING_CARD_HEIGHT - 32} rx={10} fill={`url(#${patternId})`} />
      <rect x={16} y={16} width={PLAYING_CARD_WIDTH - 32} height={PLAYING_CARD_HEIGHT - 32} rx={10} fill="none" stroke={PAPER} strokeWidth={6} />
    </svg>
  );
});

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}
