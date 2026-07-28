import { StandardPlayingCard, type CourtAtlas } from "@lucky-arcade/ui/playing-card";
import type { ReactNode } from "react";
import { JACKS_OR_BETTER_PAYTABLE, type VideoPokerAction, type VideoPokerState, type VideoPokerWagerInput } from "../index.ts";
import "./video-poker.css";

export interface VideoPokerDealRequest {
  seed: string;
  wager: VideoPokerWagerInput;
}

export interface VideoPokerScreenProps {
  state: VideoPokerState;
  atlas: CourtAtlas;
  nextDeal?: VideoPokerDealRequest;
  busy?: boolean;
  /** Reserved for a future Temerosa character portrait or dealer component. */
  dealerSlot?: ReactNode;
  /** Reserved for future character dialogue without coupling dialogue to the rules engine. */
  dialogueSlot?: ReactNode;
  onAction(action: VideoPokerAction): void | Promise<void>;
}

export function VideoPokerScreen({ state, atlas, nextDeal, busy = false, dealerSlot, dialogueSlot, onAction }: VideoPokerScreenProps) {
  const holding = state.status === "holding";
  return <main className="video-poker-shell">
    <header>
      <div><small>JACKS OR BETTER</small><h1>테메로세 비디오 포커</h1></div>
      {state.wager && <strong>{state.wager.stake} P × {state.wager.multiplier}</strong>}
    </header>
    <section className="video-poker-table">
      <aside className="video-poker-dealer-slot" aria-label="딜러 영역">
        {dealerSlot ?? <span>딜러 슬롯</span>}
      </aside>
      <div className="video-poker-dialogue-slot" aria-live="polite">
        {dialogueSlot ?? <span>{holding ? "보유할 카드를 고른 뒤 한 번 교환하세요." : state.outcome?.hand.label ?? "판돈과 배율을 정해 시작하세요."}</span>}
      </div>
      <div className="video-poker-hand" aria-label="플레이어 카드">
        {state.hand.map((cardId, index) => <button
          type="button"
          key={`${cardId}:${index}`}
          aria-label={`${index + 1}번 카드${state.heldCardIndexes.includes(index) ? ", 보유" : ""}`}
          aria-pressed={state.heldCardIndexes.includes(index)}
          disabled={!holding || busy}
          onClick={() => onAction({ type: "toggle-hold", cardIndex: index })}
        >
          <StandardPlayingCard id={cardId} atlas={atlas} />
          <span>{state.heldCardIndexes.includes(index) ? "HOLD" : ""}</span>
        </button>)}
      </div>
      {state.outcome && <section className="video-poker-result">
        <strong>{state.outcome.hand.label}</strong>
        <span>배당 {state.outcome.hand.payoutMultiplier}배 · 지급 {state.outcome.creditedPoints.toLocaleString("ko-KR")} P</span>
      </section>}
      <div className="video-poker-actions">
        {state.status === "ready" && <button className="primary" disabled={busy || !nextDeal} onClick={() => nextDeal && onAction({ type: "deal", ...nextDeal })}>5장 받기</button>}
        {holding && <button className="primary" disabled={busy} onClick={() => onAction({ type: "draw" })}>선택 외 카드 교환</button>}
        {state.status === "complete" && <button className="primary" disabled={busy} onClick={() => onAction({ type: "restart" })}>다음 게임</button>}
      </div>
    </section>
    <Paytable />
  </main>;
}

function Paytable() {
  return <aside className="video-poker-paytable" aria-label="Jacks or Better 배당표">
    {Object.entries(JACKS_OR_BETTER_PAYTABLE).map(([category, multiplier]) => <div key={category}><span>{category.replaceAll("-", " ")}</span><strong>{multiplier}×</strong></div>)}
  </aside>;
}
