import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { CourtCard, PlayingCard, PlayingCardBack, type CourtAtlas, type CourtCardId, type PlayingCardPipRank } from "@lucky-arcade/ui/playing-card";
import { useRef, useState } from "react";
import { INDIAN_POKER_DECK } from "../deck.ts";
import { createIndianPokerState, indianPokerRanking, reduceIndianPoker } from "../engine.ts";
import type { IndianPokerAction, IndianPokerCard, IndianPokerCartridge, IndianPokerSeatId, IndianPokerState } from "../contracts.ts";
import "./indian-poker.css";

export interface IndianPokerScreenProps {
  cartridge: IndianPokerCartridge;
  assets: Readonly<Record<string, string>>;
  atlas: CourtAtlas;
  initialState: IndianPokerState | null;
  walletBalance?: number;
  lastAward?: { amount: number; rank: number } | null;
  onPersist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void>;
  onExit(): void;
}

export function IndianPokerScreen({ cartridge, assets, atlas, initialState, walletBalance, lastAward, onPersist, onExit }: IndianPokerScreenProps) {
  const [state, setState] = useState(() => initialState ?? createIndianPokerState(cartridge, new Date().toISOString().slice(0, 10)));
  const stateRef = useRef(state), queueRef = useRef(Promise.resolve());
  const cards = new Map(INDIAN_POKER_DECK.map((card) => [card.id, card]));
  const characters = new Map(cartridge.characters.map((character) => [character.id, character]));
  const dispatch = (action: IndianPokerAction) => {
    const previous = stateRef.current, next = reduceIndianPoker(cartridge, previous, action);
    stateRef.current = next; setState(next);
    queueRef.current = queueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action));
  };
  const nameOf = (seatId: IndianPokerSeatId) => seatId === "player" ? "플레이어" : characters.get(state.seats[seatId].characterId ?? "")?.name ?? "상대";
  return <main className="indian-poker-shell">
    <header><button onClick={onExit} aria-label="오락실로 돌아가기"><IconArrowLeft /></button><div><span>TABLE GAME · FIVE ROUNDS</span><h1>{cartridge.title}</h1></div><div className="indian-poker-meter">{walletBalance !== undefined && <b>★{walletBalance.toLocaleString("ko-KR")}</b>}<strong>{state.round}/5 라운드</strong></div></header>
    <section className="indian-poker-table">
      <div className="indian-poker-opponents">{(["cpu-1", "cpu-2", "cpu-3"] as const).map((seatId) => { const character = characters.get(state.seats[seatId].characterId ?? ""); return <article key={seatId} className={`reaction-${state.reactions[seatId]}`} title={reactionLabel(state.reactions[seatId])}><img src={assets[character?.portraits[state.reactions[seatId]] ?? ""]} alt={`${nameOf(seatId)}의 ${reactionLabel(state.reactions[seatId])} 표정`} /><strong>{nameOf(seatId)}</strong><span>{state.seats[seatId].score}점 · {reactionLabel(state.reactions[seatId])}</span>{state.hands[seatId] && <Card card={cards.get(state.hands[seatId]!)} atlas={atlas} />}{state.status === "revealing" && <em>{state.choices[seatId] === "continue" ? "계속" : "기권"}</em>}</article>; })}</div>
      <div className="indian-poker-center">
        {state.status === "ready" && <div><p>내 카드는 상대만 봅니다. 세 사람의 표정을 읽고 계속할지 정하세요.</p><button className="primary" onClick={() => dispatch({ type: "start" })}>5라운드 시작</button></div>}
        {state.status === "choosing" && <div><p>상대는 내 카드를 보고 있습니다.</p><div className="indian-poker-actions"><button onClick={() => dispatch({ type: "choose", choice: "fold" })}>기권 · 0점</button><button className="primary" onClick={() => dispatch({ type: "choose", choice: "continue" })}>계속 · 승 +2 / 패 −1</button></div></div>}
        {state.status === "revealing" && state.lastRound && <div><h2>{state.lastRound.winnerId ? `${nameOf(state.lastRound.winnerId)} 라운드 승리` : "전원 기권 · 무득점"}</h2><p>내 선택: {state.choices.player === "continue" ? "계속" : "기권"} · {state.lastRound.scoreDelta.player >= 0 ? "+" : ""}{state.lastRound.scoreDelta.player}점</p><button className="primary" onClick={() => dispatch({ type: "next_round" })}>{state.round === 5 ? "최종 결과" : "다음 라운드"}</button></div>}
        {state.status === "complete" && <div><h2>5라운드 최종 순위</h2><ol>{indianPokerRanking(state).map((standing) => <li key={standing.seatId}><b>{standing.rank}위</b> {nameOf(standing.seatId)} <span>{standing.score}점</span></li>)}</ol>{lastAward && <p>{lastAward.amount >= 0 ? "+" : ""}{lastAward.amount} 메달 · {lastAward.rank}등</p>}<button className="primary" onClick={() => dispatch({ type: "restart", seed: `${state.seed}:next:${state.sequence}` })}><IconRefresh /> 새 게임</button></div>}
      </div>
      <article className="indian-poker-player"><strong>플레이어</strong><span>{state.seats.player.score}점</span>{state.hands.player && (state.status === "revealing" ? <Card card={cards.get(state.hands.player)} atlas={atlas} /> : <div className="indian-poker-back"><PlayingCardBack decorative={false} label="공개 전인 내 카드" /></div>)}</article>
    </section>
  </main>;
}

function Card({ card, atlas }: { card: IndianPokerCard | undefined; atlas: CourtAtlas }) {
  if (!card) return null;
  if (card.rank === "j" || card.rank === "q" || card.rank === "k") return <CourtCard atlas={atlas} id={`${card.suit}-${card.rank}` as CourtCardId} scale={0.5} />;
  return <div className="indian-poker-pip"><PlayingCard suit={card.suit} rank={card.rank as PlayingCardPipRank} /></div>;
}
function reactionLabel(reaction: string): string { return reaction === "pleased" ? "여유" : reaction === "tense" ? "긴장" : "무표정"; }
