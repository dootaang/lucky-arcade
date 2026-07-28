import { useMemo, useState, type ReactElement } from "react";
import { PlayingCardBack, StandardPlayingCard, type CourtAtlas } from "@lucky-arcade/ui/playing-card";
import type { StandardCardId } from "@lucky-arcade/card-table";
import {
  createFiveCardDrawState,
  reduceFiveCardDraw,
  type FiveCardDrawAction,
  type FiveCardDrawResult,
  type FiveCardDrawState,
} from "../index.ts";
import "./five-card-draw.css";

export interface FiveCardDrawScreenProps {
  sessionId: string;
  opponentId: string;
  opponentName: string;
  seed: string;
  atlas: CourtAtlas;
  onTransition?: (previous: FiveCardDrawState, next: FiveCardDrawState, action: FiveCardDrawAction) => void;
  onComplete?: (result: FiveCardDrawResult) => void;
}

export function FiveCardDrawScreen(props: FiveCardDrawScreenProps): ReactElement {
  const initial = useMemo(
    () => createFiveCardDrawState({ sessionId: props.sessionId, opponentId: props.opponentId }),
    [props.sessionId, props.opponentId],
  );
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  function send(action: FiveCardDrawAction): void {
    const next = reduceFiveCardDraw(state, action);
    setState(next);
    setSelected(new Set());
    props.onTransition?.(state, next, action);
    if (next.result) props.onComplete?.(next.result);
  }

  function toggle(cardId: string): void {
    if (state.phase !== "player-draw") return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else if (next.size < 5) next.add(cardId);
      return next;
    });
  }

  const status = state.phase === "ready"
    ? "새 판을 시작하세요."
    : state.phase === "player-draw"
      ? `교환할 카드를 고르세요 (${selected.size}/5).`
      : outcomeLabel(state.result?.outcome);

  return (
    <section className="five-card-draw" aria-label="파이브카드 드로우">
      <header>
        <p className="five-card-draw__eyebrow">TEMEROSA CASINO</p>
        <h2>Five-Card Draw</h2>
        <p aria-live="polite">{status}</p>
      </header>

      <Hand title={props.opponentName}>
        {state.npcHand.map((card, index) =>
          state.phase === "complete"
            ? <StandardPlayingCard key={card} id={card} atlas={props.atlas} />
            : <PlayingCardBack key={`${index}-${card}`} />,
        )}
      </Hand>

      {state.result ? (
        <div className="five-card-draw__showdown">
          <span>{props.opponentName}: {state.result.npcValue.label}</span>
          <span>나: {state.result.playerValue.label}</span>
        </div>
      ) : null}

      <Hand title="내 패">
        {state.playerHand.map((card) => (
          <button
            className="five-card-draw__card-button"
            data-selected={selected.has(card)}
            key={card}
            onClick={() => toggle(card)}
            type="button"
            aria-pressed={selected.has(card)}
            disabled={state.phase !== "player-draw"}
          >
            <StandardPlayingCard id={card} atlas={props.atlas} />
          </button>
        ))}
      </Hand>

      <div className="five-card-draw__actions">
        {state.phase === "ready" ? (
          <button type="button" onClick={() => send({ type: "start", seed: props.seed })}>카드 받기</button>
        ) : null}
        {state.phase === "player-draw" ? (
          <button type="button" onClick={() => send({ type: "exchange", cardIds: [...selected] as StandardCardId[] })}>
            {selected.size === 0 ? "그대로 승부" : `${selected.size}장 교환`}
          </button>
        ) : null}
        {state.phase === "complete" ? (
          <button type="button" onClick={() => send({ type: "reset" })}>새 판 준비</button>
        ) : null}
      </div>
    </section>
  );
}

function Hand({ title, children }: { title: string; children: ReactElement[] }): ReactElement {
  return (
    <section className="five-card-draw__hand">
      <h3>{title}</h3>
      <div className="five-card-draw__cards">{children}</div>
    </section>
  );
}

function outcomeLabel(outcome: FiveCardDrawResult["outcome"] | undefined): string {
  if (outcome === "player-win") return "승리했습니다.";
  if (outcome === "npc-win") return "상대가 승리했습니다.";
  return "무승부입니다.";
}
