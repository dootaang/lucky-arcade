import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import { createMatchPairsState } from "@lucky-arcade/match-pairs";
import { MatchPairsScreen } from "@lucky-arcade/match-pairs/react";
import { createOldMaidState } from "@lucky-arcade/old-maid";
import { OldMaidScreen } from "@lucky-arcade/old-maid/react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { resolveCasinoSideMarketReplay, type CasinoSideMarketReplay, type MatchPairsSideMarketReplay, type OldMaidSideMarketReplay } from "../../lib/casino-side-market-replay.ts";
import { TEMEROSA_MATCH_PAIRS_LINES } from "../match-pairs/temerosa-match-pairs-lines.ts";

export default function CasinoSideMarketReplayView({ market, currentUtcSecond, onClose }: { market: CasinoSpectatorMarket; currentUtcSecond: number; onClose(): void }): React.ReactElement {
  const [replay, setReplay] = useState<CasinoSideMarketReplay>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [syncRevision, setSyncRevision] = useState(0);
  const live = currentUtcSecond < market.settlesAtUtcSecond;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void resolveCasinoSideMarketReplay(market)
      .then((value) => { if (alive) setReplay(value); })
      .catch(() => { if (alive) setError("대국 기록을 불러오지 못했습니다."); });
    return () => { alive = false; };
  }, [market.marketId]);

  useEffect(() => {
    if (!live || revision > 0) return;
    const synchronizeOnReturn = () => { if (document.visibilityState === "visible") setSyncRevision((value) => value + 1); };
    document.addEventListener("visibilitychange", synchronizeOnReturn);
    return () => document.removeEventListener("visibilitychange", synchronizeOnReturn);
  }, [live, revision]);

  const initialFrameIndex = useMemo(() => {
    if (!replay || revision > 0 || !live) return 0;
    const frames = replay.game.frames.length;
    if (frames < 2) return 0;
    const progress = Math.max(0, Math.min(1, (currentUtcSecond - market.startsAtUtcSecond) / Math.max(1, market.settlesAtUtcSecond - market.startsAtUtcSecond)));
    // The last frame is complete. A live entrant joins the most recent active
    // state, then the cabinet's own timers and presentation take over.
    return Math.min(frames - 2, Math.floor(progress * (frames - 1)));
  }, [currentUtcSecond, live, market.settlesAtUtcSecond, market.startsAtUtcSecond, replay, revision, syncRevision]);

  const restart = () => setRevision((value) => value + 1);
  const content = replay
    ? replay.kind === "match-pairs"
      ? <NativeMatchPairsExperience key={`${replay.marketId}:${revision}:${syncRevision}`} replay={replay} initialFrameIndex={initialFrameIndex} onClose={onClose} onReplay={restart} />
      : <NativeOldMaidExperience key={`${replay.marketId}:${revision}:${syncRevision}`} replay={replay} onClose={onClose} onReplay={restart} />
    : null;

  return createPortal(<div className="side-market-replay-backdrop is-native" role="dialog" aria-modal="true" aria-label={`${market.title} 관전`}>
    {content ? <div className="side-market-native-experience">
      <span className="side-market-native-status">{live && revision === 0 ? "LIVE · 원본 관전" : "REPLAY · 원본 관전"}</span>
      {content}
    </div> : <section className="side-market-replay-modal is-loading">
      <div className="side-market-replay-loading" role={error ? "alert" : "status"}>{error || "실제 대국 기록과 게임 화면을 준비하는 중…"}</div>
      <button type="button" className="ca-ghost-btn" onClick={onClose}>닫기</button>
    </section>}
  </div>, document.body);
}

function NativeMatchPairsExperience({ replay, initialFrameIndex, onClose, onReplay }: { replay: MatchPairsSideMarketReplay; initialFrameIndex: number; onClose(): void; onReplay(): void }): React.ReactElement {
  const replayState = replay.game.frames[initialFrameIndex]?.state ?? replay.game.frames[0]!.state;
  const [leftId, rightId] = replay.game.participantIds;
  const fromBeginning = initialFrameIndex === 0;
  const initialState = fromBeginning ? createMatchPairsState(
    replay.faces,
    replay.opponents,
    replayState.packVersion,
    replay.seed,
    replayState.difficulty,
    rightId,
    replayState.sessionId,
    "spectate",
    leftId,
    replayState.focus,
  ) : replayState;
  return <MatchPairsScreen
    faces={replay.faces}
    opponents={replay.opponents}
    assets={replay.assets}
    packVersion={initialState.packVersion}
    seed={replay.seed}
    sessionId={initialState.sessionId}
    initialState={initialState}
    {...(fromBeginning ? { autoStartSeed: replay.seed } : {})}
    lines={TEMEROSA_MATCH_PAIRS_LINES}
    wageringEnabled={false}
    presentationOnly
    onReplay={onReplay}
    onExit={onClose}
  />;
}

function NativeOldMaidExperience({ replay, onClose, onReplay }: { replay: OldMaidSideMarketReplay; onClose(): void; onReplay(): void }): React.ReactElement {
  // A captured frame is the state *after* its action. Injecting a live frame
  // skipped the action that owns dealing, draw and discard motion. Rebuild the
  // ready table and let the native cabinet execute the same deterministic game.
  const initialState = createOldMaidState(replay.cartridge, replay.seed, replay.game.finalState.sessionId);
  return <OldMaidScreen
    cartridge={replay.cartridge}
    assets={replay.assets}
    initialState={initialState}
    autoStart={{ mode: "spectate", characterIds: replay.game.participantIds }}
    presentationOnly
    onReplay={onReplay}
    onPersist={async () => undefined}
    onExit={onClose}
  />;
}
