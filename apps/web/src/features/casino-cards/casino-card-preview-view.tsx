import {
  CASINO_GAME_INFO,
  casinoCardCredit,
  createCasinoCardState,
  reduceCasinoCard,
  type CasinoCardAction,
  type CasinoCardGameId,
  type CasinoCardStake,
  type CasinoCardState,
} from "@lucky-arcade/casino-cards";
import { CasinoCardScreen } from "@lucky-arcade/casino-cards/react";
import { leveragedWagerCredit, wagerExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";
import { useEffect, useRef, useState } from "react";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";

const PREVIEW_BALANCE = 2_000;

interface PreviewReady {
  state: CasinoCardState;
  atlas: CourtAtlas;
  balance: number;
  multiplier: WagerMultiplier;
}

export function CasinoCardPreviewView({ gameId, onExit }: { gameId: CasinoCardGameId; onExit(): void }) {
  const info = CASINO_GAME_INFO[gameId];
  const [ready, setReady] = useState<PreviewReady | null>(null);
  const [error, setError] = useState("");
  const stateRef = useRef<CasinoCardState | null>(null);
  const balanceRef = useRef(PREVIEW_BALANCE);
  const multiplierRef = useRef<WagerMultiplier>(2);

  useEffect(() => {
    let alive = true;
    void loadPlayingCardAtlas().then((atlas) => {
      if (!alive) return;
      const state = createCasinoCardState(gameId, `preview:${gameId}`);
      stateRef.current = state;
      setReady({ state, atlas, balance: PREVIEW_BALANCE, multiplier: 2 });
    }).catch(() => { if (alive) setError(`${info.title} 시험판을 준비하지 못했습니다.`); });
    return () => { alive = false; };
  }, [gameId, info.title]);

  function publish(state: CasinoCardState): void {
    setReady((current) => current ? { ...current, state, balance: balanceRef.current, multiplier: multiplierRef.current } : current);
  }

  function start(stake: CasinoCardStake, multiplier: WagerMultiplier): void {
    const current = stateRef.current;
    if (!current || current.status !== "ready") return;
    const exposure = wagerExposure(stake, multiplier, info.maxExposure);
    if (balanceRef.current < exposure) { setError("시험 포인트가 부족합니다. 나갔다 다시 들어오면 2,000 P로 초기화됩니다."); return; }
    setError("");
    multiplierRef.current = multiplier;
    balanceRef.current -= exposure;
    const state = reduceCasinoCard(current, {
      type: "start",
      seed: crypto.randomUUID(),
      stake,
      reservedAmount: stake * info.maxExposure,
      wagerId: `preview:${crypto.randomUUID()}`,
    });
    stateRef.current = state;
    settleIfComplete(state);
    publish(state);
  }

  function act(action: CasinoCardAction): void {
    const current = stateRef.current;
    if (!current) return;
    setError("");
    try {
      const state = reduceCasinoCard(current, action);
      stateRef.current = state;
      if (current.status !== "complete") settleIfComplete(state);
      publish(state);
    } catch { setError("그 행동은 지금 선택할 수 없습니다."); }
  }

  function settleIfComplete(state: CasinoCardState): void {
    if (state.status !== "complete" || !state.stake) return;
    const baseExposure = state.stake * info.maxExposure;
    balanceRef.current += leveragedWagerCredit(baseExposure, casinoCardCredit(state), multiplierRef.current);
  }

  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || `${info.title} 시험판을 준비하고 있습니다…`}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <CasinoCardScreen state={ready.state} atlas={ready.atlas} balance={ready.balance} busy={false} error={error} initialMultiplier={ready.multiplier} onStart={start} onAction={act} onExit={onExit} />;
}
