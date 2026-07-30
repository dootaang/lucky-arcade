import {
  VIDEO_POKER_STAKES,
  VIDEO_POKER_WAGER_MULTIPLIERS,
  createVideoPokerState,
  reduceVideoPoker,
  videoPokerCredit,
  videoPokerExposure,
  type VideoPokerAction,
  type VideoPokerStake,
  type VideoPokerState,
  type VideoPokerWagerMultiplier,
} from "@lucky-arcade/video-poker";
import { VideoPokerScreen } from "@lucky-arcade/video-poker/react";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";

const PREVIEW_BALANCE = 2_000;

export default function VideoPokerView({ onExit }: { onExit(): void }) {
  const [atlas, setAtlas] = useState<CourtAtlas | null>(null);
  const [state, setState] = useState(() => createVideoPokerState());
  const [balance, setBalance] = useState(PREVIEW_BALANCE);
  const [stake, setStake] = useState<VideoPokerStake>(10);
  const [multiplier, setMultiplier] = useState<VideoPokerWagerMultiplier>(2);
  const [dealSeed, setDealSeed] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const stateRef = useRef<VideoPokerState>(state);

  useEffect(() => {
    let alive = true;
    void loadPlayingCardAtlas().then((value) => { if (alive) setAtlas(value); }).catch(() => { if (alive) setError("비디오 포커 카드 세트를 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  const wager = useMemo(() => ({ stake, multiplier, wagerId: `preview:${dealSeed}` }), [dealSeed, multiplier, stake]);
  const exposure = videoPokerExposure(wager);

  function apply(action: VideoPokerAction): void {
    const current = stateRef.current;
    setError("");
    try {
      if (action.type === "deal" && balance < videoPokerExposure(action.wager)) { setError("시험 포인트가 부족합니다."); return; }
      const next = reduceVideoPoker(current, action);
      if (action.type === "deal") setBalance((value) => value - videoPokerExposure(action.wager));
      if (current.status !== "complete" && next.status === "complete") setBalance((value) => value + videoPokerCredit(next));
      if (action.type === "restart") setDealSeed(crypto.randomUUID());
      stateRef.current = next;
      setState(next);
    } catch { setError("그 행동은 지금 선택할 수 없습니다."); }
  }

  if (!atlas) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || "비디오 포커 시험판을 준비하고 있습니다…"}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <VideoPokerScreen
    state={state}
    atlas={atlas}
    {...(balance >= exposure ? { nextDeal: { seed: dealSeed, wager } } : {})}
    dealerSlot={<div className="video-poker-preview-controls"><strong>{balance.toLocaleString("ko-KR")} 시험 P</strong><div>{VIDEO_POKER_STAKES.map((value) => <button key={value} aria-pressed={stake === value} disabled={state.status !== "ready"} onClick={() => setStake(value)}>{value} P</button>)}</div><div>{VIDEO_POKER_WAGER_MULTIPLIERS.map((value) => <button key={value} aria-pressed={multiplier === value} disabled={state.status !== "ready"} onClick={() => setMultiplier(value)}>{value}배</button>)}</div></div>}
    dialogueSlot={<span>{error || (state.status === "holding" ? "남길 카드를 고른 뒤 한 번 교환하세요." : state.outcome?.hand.label ?? `최대 손실 ${exposure.toLocaleString("ko-KR")} P`)}</span>}
    onAction={apply}
    onExit={onExit}
  />;
}
