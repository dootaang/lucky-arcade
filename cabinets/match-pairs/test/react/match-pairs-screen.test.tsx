import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createMatchPairsState, reduceMatchPairs, type MatchPairsFace, type MatchPairsOpponent, type MatchPairsState } from "../../src/index.ts";
import {
  MATCH_PAIRS_MISMATCH_HOLD_MS,
  MatchPairsScreen,
  createPausableDelay,
  matchPairsCoordinate,
  preloadMatchPairsImages,
} from "../../src/react/match-pairs-screen.tsx";

const faces: MatchPairsFace[] = Array.from({ length: 10 }, (_, index) => ({
  id: `face-${index}`,
  assetId: `asset-${index}`,
  characterId: `화면에 나오면 안 되는 인물 ${index}`,
  confusionGroup: `group-${index}`,
}));
const assets = Object.fromEntries(faces.map((face, index) => [face.assetId, `/images/neutral-${index}.webp`]));
const opponent: MatchPairsOpponent = {
  id: "npc", name: "NPC", portraits: { neutral: "npc-neutral", pleased: "npc-pleased", tense: "npc-tense" },
  despairPortrait: "npc-despair", memoryCapacity: 6, observationRate: 0.76, recallAccuracy: 0.8, memoryRetention: 0.91,
  consistency: 0.72, searchStyle: "mixed", streakComposure: 0.84, difficultyTier: 2, winCreditMultiplier: 2,
};
const opponents = [opponent, { ...opponent, id: "npc-2", name: "NPC 2", portraits: { neutral: "npc-neutral", pleased: "npc-pleased", tense: "npc-tense" } }];
const allAssets = { ...assets, "npc-neutral": "/images/npc-neutral.webp", "npc-pleased": "/images/npc-pleased.webp", "npc-tense": "/images/npc-tense.webp", "npc-despair": "/images/npc-despair.webp" };

describe("match pairs screen markup", () => {
  it.each([
    ["easy", 12, "C4"],
    ["normal", 16, "D4"],
  ] as const)("mounts every %s card front with coordinate-only accessible labels", (difficulty, cardCount, lastCoordinate) => {
    const markup = renderToStaticMarkup(<MatchPairsScreen
      faces={faces}
      opponents={opponents}
      assets={allAssets}
      packVersion="pack"
      seed={`markup-${difficulty}`}
      sessionId="session"
      initialDifficulty={difficulty}
    />);
    expect(markup.match(/class="match-pairs-card"/g) ?? []).toHaveLength(cardCount);
    expect(markup.match(/<img/g)).toHaveLength(cardCount + 3);
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-label="A1 카드 뒤집기"');
    expect(markup).toContain(`aria-label="${lastCoordinate} 카드 뒤집기"`);
    expect(markup).toContain("연습 시작");
    expect(markup).toContain("포인트 증감 없이 자유롭게 플레이");
    expect(markup).not.toContain("화면에 나오면 안 되는 인물");
    expect(markup).not.toContain("title=");
  });

  it("renders versus completion copy without exposing card-face names", () => {
    const complete = autoplay("complete");
    const markup = renderToStaticMarkup(<MatchPairsScreen
      faces={faces}
      opponents={opponents}
      assets={allAssets}
      packVersion="pack"
      seed="ignored-by-restoration"
      sessionId="session"
      initialState={complete}
    />);
    expect(markup).toContain("나의 승리");
    expect(markup).toContain(`나 ${complete.claims.player.length}짝`);
    expect(markup).not.toContain("화면에 나오면 안 되는 인물");
    expect(markup).not.toContain("표정");
  });

  it("shows the frozen spread target and symmetric maximum loss and gain", () => {
    const ready = reduceMatchPairs(faces, opponents, createMatchPairsState(faces, opponents, "pack", "spread", "easy", opponent.id, "session"), { type: "set-entry", entryKind: "spread-wager" });
    const markup = renderToStaticMarkup(<MatchPairsScreen
      faces={faces}
      opponents={opponents}
      assets={allAssets}
      packVersion="pack"
      seed="spread"
      sessionId="session"
      initialState={ready}
      walletBalance={100}
      wageringEnabled
      spreadQuotes={[{
        contract: "match-pairs-spread/0.1",
        quoteId: `${opponent.id}:easy:relaxed`,
        pricingVersion: "temerosa-match-pairs-spread/0.1",
        opponentId: opponent.id,
        difficulty: "easy",
        focus: "relaxed",
        targetScore: 12,
        estimatedCoverRateBps: 4_500,
        sampleSize: 600,
        available: true,
      }]}
    />);
    expect(markup).toContain("하우스 기준 12점 초과");
    expect(markup).toContain("최대 손익 −20 P / +20 P");
    expect(markup).toContain("10 P · 2배로 시작");
  });

  it("uses stable row and column coordinates for both difficulties", () => {
    expect(matchPairsCoordinate(0, "easy")).toBe("A1");
    expect(matchPairsCoordinate(5, "easy")).toBe("C2");
    expect(matchPairsCoordinate(15, "normal")).toBe("D4");
  });
});

describe("match pairs image preparation", () => {
  it.each([6, 8])("waits for all %i unique Image.decode calls", async (count) => {
    const decoded: string[] = [];
    const created: Array<{ src: string; decoding: "async" | "auto" | "sync"; decode(): Promise<void> }> = [];
    await preloadMatchPairsImages(Array.from({ length: count }, (_, index) => `/asset-${index}.webp`), () => {
      const image = {
        src: "",
        decoding: "auto" as const,
        async decode() { await Promise.resolve(); decoded.push(this.src); },
      };
      created.push(image);
      return image;
    });
    expect(created).toHaveLength(count);
    expect(decoded).toHaveLength(count);
    expect(created.every((image) => image.decoding === "async")).toBe(true);
  });

  it("deduplicates URLs and surfaces decode failures", async () => {
    let created = 0;
    await expect(preloadMatchPairsImages(["/same.webp", "/same.webp"], () => ({
      src: "",
      decoding: "auto",
      async decode() { created += 1; throw new Error("decode failed"); },
    }))).rejects.toThrow("decode failed");
    expect(created).toBe(1);
  });
});

describe("match pairs checking timer", () => {
  it("preserves the remaining 800ms across pause and resolves once", () => {
    let now = 0;
    let nextHandle = 0;
    let completions = 0;
    const scheduled = new Map<number, { callback(): void; due: number }>();
    const scheduler = {
      now: () => now,
      set(callback: () => void, delayMs: number) {
        const handle = ++nextHandle;
        scheduled.set(handle, { callback, due: now + delayMs });
        return handle;
      },
      clear(handle: unknown) { scheduled.delete(handle as number); },
    };
    const advance = (durationMs: number) => {
      now += durationMs;
      for (const [handle, task] of [...scheduled]) {
        if (task.due <= now) { scheduled.delete(handle); task.callback(); }
      }
    };
    const delay = createPausableDelay(MATCH_PAIRS_MISMATCH_HOLD_MS, () => { completions += 1; }, scheduler);
    delay.resume();
    advance(275);
    delay.pause();
    expect(delay.remainingMs).toBe(525);
    advance(2_000);
    expect(completions).toBe(0);
    delay.resume();
    advance(524);
    expect(completions).toBe(0);
    advance(1);
    delay.resume();
    expect(completions).toBe(1);
    expect(delay.settled).toBe(true);
  });
});

function autoplay(seed: string): MatchPairsState {
  let state = reduceMatchPairs(faces, opponents, createMatchPairsState(faces, opponents, "pack", seed, "easy", opponent.id, "session"), { type: "start", seed: `${seed}:deal` });
  for (const pairId of new Set(state.cards.map((card) => card.pairId))) {
    const indexes = state.cards.flatMap((card, index) => card.pairId === pairId ? [index] : []);
    state = reduceMatchPairs(faces, opponents, state, { type: "player-reveal", index: indexes[0]! });
    state = reduceMatchPairs(faces, opponents, state, { type: "player-reveal", index: indexes[1]! });
    state = reduceMatchPairs(faces, opponents, state, { type: "resolve" });
  }
  return state;
}
