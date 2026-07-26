import { memo, type CSSProperties } from "react";
import type { PlayingCardSuit } from "./playing-card-layout.ts";

export type PlayingCardCourtRank = "j" | "q" | "k";
export type CourtCardId = `${PlayingCardSuit}-${PlayingCardCourtRank}` | "joker";
export interface CourtAtlas {
  url: string;
  cols: number;
  cell: { w: number; h: number };
  gutter: number;
  sheet: { width: number; height: number };
  frames: Readonly<Record<string, { col: number; row: number }>>;
}
export interface CourtCardProps { atlas: CourtAtlas; id: CourtCardId; scale?: number; className?: string; label?: string; decorative?: boolean; }
export interface CourtCardImageProps { atlas: CourtAtlas; id: CourtCardId; className?: string; label?: string; decorative?: boolean; }

export function courtCardStyle(atlas: CourtAtlas, id: CourtCardId, scale = 1): CSSProperties {
  const frame = atlas.frames[id];
  if (!frame) throw new Error(`court_card_frame_missing:${id}`);
  return {
    display: "inline-block",
    width: atlas.cell.w * scale,
    height: atlas.cell.h * scale,
    backgroundImage: `url(${JSON.stringify(atlas.url)})`,
    backgroundSize: `${atlas.sheet.width * scale}px ${atlas.sheet.height * scale}px`,
    backgroundPosition: `${-frame.col * (atlas.cell.w + atlas.gutter) * scale}px ${-frame.row * (atlas.cell.h + atlas.gutter) * scale}px`,
    backgroundRepeat: "no-repeat",
  };
}

export const CourtCard = /*#__PURE__*/ memo(function CourtCard({ atlas, id, scale = 1, className, label, decorative = false }: CourtCardProps) {
  return <span className={className} style={courtCardStyle(atlas, id, scale)} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ?? courtCardLabel(id) })} />;
});

/** Responsive atlas crop. Unlike background-position, the SVG viewport scales with its container. */
export const CourtCardImage = /*#__PURE__*/ memo(function CourtCardImage({ atlas, id, className, label, decorative = false }: CourtCardImageProps) {
  const frame = atlas.frames[id];
  if (!frame) throw new Error(`court_card_frame_missing:${id}`);
  const x = -frame.col * (atlas.cell.w + atlas.gutter), y = -frame.row * (atlas.cell.h + atlas.gutter);
  return <svg viewBox={`0 0 ${atlas.cell.w} ${atlas.cell.h}`} className={className} style={{ display: "block", width: "100%", aspectRatio: `${atlas.cell.w} / ${atlas.cell.h}` }}
    {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ?? courtCardLabel(id) })}>
    <image href={atlas.url} x={x} y={y} width={atlas.sheet.width} height={atlas.sheet.height} />
  </svg>;
});

export function courtCardLabel(id: CourtCardId): string {
  if (id === "joker") return "조커";
  const [suit, rank] = id.split("-") as [PlayingCardSuit, PlayingCardCourtRank];
  const suitLabel = { spades: "스페이드", hearts: "하트", diamonds: "다이아몬드", clubs: "클럽" }[suit];
  return `${suitLabel} ${rank.toUpperCase()}`;
}
