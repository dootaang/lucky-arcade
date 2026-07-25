/**
 * `@lucky-arcade/ui`의 트럼프 카드가 실제로 SVG를 그리는지 확인한다.
 * 기하 계약은 `packages/ui/test/playing-card-layout.test.ts`가 담당하고,
 * 이 파일은 렌더 자체만 본다. `react-dom`을 가진 곳이 여기라서 여기에 둔다.
 */
import { PLAYING_CARD_PIP_RANKS, PLAYING_CARD_SUITS, PlayingCard, PlayingCardBack, playingCardLabel } from "@lucky-arcade/ui/playing-card";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("playing card rendering", () => {
  it("renders every pip card without an image request", () => {
    for (const suit of PLAYING_CARD_SUITS) {
      for (const rank of PLAYING_CARD_PIP_RANKS) {
        const markup = renderToStaticMarkup(<PlayingCard suit={suit} rank={rank} />);
        expect(markup, `${suit}-${rank}`).toContain("<svg");
        expect(markup, `${suit}-${rank}`).toContain(`aria-label="${playingCardLabel(suit, rank)}"`);
        expect(markup, `${suit}-${rank}`).not.toContain("<image");
        expect(markup, `${suit}-${rank}`).not.toContain("url(");
      }
    }
  });

  it("draws one suit shape per pip plus both corner indices", () => {
    const markup = renderToStaticMarkup(<PlayingCard suit="hearts" rank="7" />);
    // 핍 7개 + 모서리 인덱스 2개
    expect(markup.match(/<path d="M50 90/g)).toHaveLength(9);
    expect(markup.match(/>7</g)).toHaveLength(2);
  });

  it("hides the card from assistive technology when it is decorative", () => {
    const markup = renderToStaticMarkup(<PlayingCard suit="clubs" rank="a" decorative />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("aria-label");
  });

  it("gives each card back its own pattern id so two backs never collide", () => {
    const markup = renderToStaticMarkup(
      <>
        <PlayingCardBack />
        <PlayingCardBack />
      </>,
    );
    const ids = [...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
