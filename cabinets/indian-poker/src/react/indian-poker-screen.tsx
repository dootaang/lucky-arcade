import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { CourtCard, PlayingCard, PlayingCardBack, type CourtAtlas, type CourtCardId, type PlayingCardPipRank } from "@lucky-arcade/ui/playing-card";
import { useRef, useState } from "react";
import { INDIAN_POKER_DECK } from "../deck.ts";
import { createIndianPokerState, indianPokerRanking, reduceIndianPoker } from "../engine.ts";
import { INDIAN_POKER_STAKES, type IndianPokerAction, type IndianPokerCard, type IndianPokerCartridge, type IndianPokerSeatId, type IndianPokerStake, type IndianPokerState } from "../contracts.ts";
import "./indian-poker.css";

export interface IndianPokerScreenProps {
  cartridge: IndianPokerCartridge;
  assets: Readonly<Record<string, string>>;
  atlas: CourtAtlas;
  initialState: IndianPokerState | null;
  walletBalance?: number;
  busy?: boolean;
  error?: string;
  onStart(stake: IndianPokerStake): Promise<IndianPokerState>;
  onPersist(previous: IndianPokerState, next: IndianPokerState, action: IndianPokerAction): Promise<void>;
  onExit(): void;
}

export function IndianPokerScreen({ cartridge, assets, atlas, initialState, walletBalance, busy = false, error, onStart, onPersist, onExit }: IndianPokerScreenProps) {
  const [state, setState] = useState(() => initialState ?? createIndianPokerState(cartridge, new Date().toISOString().slice(0, 10)));
  const [stake, setStake] = useState<IndianPokerStake>(INDIAN_POKER_STAKES[0]);
  const stateRef = useRef(state), queueRef = useRef(Promise.resolve());
  const cards = new Map(INDIAN_POKER_DECK.map((card) => [card.id, card]));
  const characters = new Map(cartridge.characters.map((character) => [character.id, character]));
  const dispatch = (action: IndianPokerAction) => {
    if (busy) return;
    const previous = stateRef.current, next = reduceIndianPoker(cartridge, previous, action);
    stateRef.current = next; setState(next);
    queueRef.current = queueRef.current.catch(() => undefined).then(() => onPersist(previous, next, action));
  };
  const nameOf = (seatId: IndianPokerSeatId) => seatId === "player" ? "플레이어" : characters.get(state.seats[seatId].characterId ?? "")?.name ?? "상대";
  return <main className="indian-poker-shell">
    <header><button onClick={onExit} aria-label="카지노로 돌아가기"><IconArrowLeft /></button><div><span>TABLE GAME · FIVE ROUNDS</span><h1>{cartridge.title}</h1></div><div className="indian-poker-meter">{walletBalance !== undefined && <b>{walletBalance.toLocaleString("ko-KR")} P</b>}<strong>{state.round}/5 라운드</strong></div></header>
    <section className="indian-poker-table">
      <div className="indian-poker-opponents">{(["cpu-1", "cpu-2", "cpu-3"] as const).map((seatId) => { const character = characters.get(state.seats[seatId].characterId ?? ""); return <article key={seatId} className={`reaction-${state.reactions[seatId]}`} title={reactionLabel(state.reactions[seatId])}><img src={assets[character?.portraits[state.reactions[seatId]] ?? ""]} alt={`${nameOf(seatId)}의 ${reactionLabel(state.reactions[seatId])} 표정`} /><strong>{nameOf(seatId)}</strong><span>{state.seats[seatId].score}점 · {reactionLabel(state.reactions[seatId])}</span>{state.hands[seatId] && <Card card={cards.get(state.hands[seatId]!)} atlas={atlas} />}{state.status === "revealing" && <em>{choiceLabel(state.choices[seatId])}</em>}</article>; })}</div>
      <div className="indian-poker-center">
        {state.status === "ready" && <div><p>내 카드는 상대만 봅니다. 표정을 읽고 콜·레이즈·폴드를 고르세요.</p><div className="indian-poker-actions">{INDIAN_POKER_STAKES.map((value) => <button key={value} aria-pressed={stake === value} disabled={busy || (walletBalance ?? 0) < value} onClick={() => setStake(value)}>{value} P</button>)}</div><button className="primary" disabled={busy || (walletBalance ?? 0) < stake} onClick={() => { void onStart(stake).then((next) => { stateRef.current = next; setState(next); }).catch(() => undefined); }}>5라운드 시작</button></div>}
        {state.status === "choosing" && <div><p>상대는 내 카드를 보고 있습니다.</p><div className="indian-poker-actions"><button onClick={() => dispatch({ type: "choose", choice: "fold" })}>폴드 · 0점</button><button onClick={() => dispatch({ type: "choose", choice: "call" })}>콜 · 승 +2 / 패 −1</button><button className="primary" onClick={() => dispatch({ type: "choose", choice: "raise" })}>레이즈 · 승 +4 / 패 −2</button></div></div>}
        {state.status === "revealing" && state.lastRound && <div><h2>{state.lastRound.winnerId ? `${nameOf(state.lastRound.winnerId)} 라운드 승리` : "전원 폴드 · 무득점"}</h2><p>내 선택: {choiceLabel(state.choices.player)} · {state.lastRound.scoreDelta.player >= 0 ? "+" : ""}{state.lastRound.scoreDelta.player}점</p><button className="primary" onClick={() => dispatch({ type: "next_round" })}>{state.round === 5 ? "최종 결과" : "다음 라운드"}</button></div>}
        {state.status === "complete" && <div><h2>5라운드 최종 순위</h2><ol>{indianPokerRanking(state).map((standing) => <li key={standing.seatId}><b>{standing.rank}위</b> {nameOf(standing.seatId)} <span>{standing.score}점</span></li>)}</ol><p>{state.creditAmount.toLocaleString("ko-KR")} P 반환</p><button className="primary" disabled={busy} onClick={() => dispatch({ type: "restart", seed: `${state.seed}:next:${state.sequence}` })}><IconRefresh /> 다시하기</button></div>}
        {error && <p role="alert">{error}</p>}
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
function choiceLabel(choice: IndianPokerState["choices"]["player"]): string { return choice === "raise" ? "레이즈" : choice === "call" ? "콜" : "폴드"; }
