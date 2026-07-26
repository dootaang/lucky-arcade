import { CourtCard, PlayingCard, PlayingCardBack, type CourtAtlas, type CourtCardId, type PlayingCardPipRank } from "@lucky-arcade/ui/playing-card";
import { useState } from "react";
import { CASINO_CARD_STAKES, CASINO_GAME_INFO, blackjackValue, bestPokerHand, cardById, type CasinoCardAction, type CasinoCardStake, type CasinoCardState, type CasinoSeatId } from "../index.ts";
import "./casino-card-screen.css";

export interface CasinoCardScreenProps {
  state: CasinoCardState;
  atlas: CourtAtlas;
  balance: number;
  busy: boolean;
  error?: string;
  onStart(stake: CasinoCardStake): void | Promise<void>;
  onAction(action: CasinoCardAction): void | Promise<void>;
  onExit(): void;
}

export function CasinoCardScreen({ state, atlas, balance, busy, error, onStart, onAction, onExit }: CasinoCardScreenProps) {
  const [stake, setStake] = useState<CasinoCardStake>(CASINO_CARD_STAKES[0]);
  const info = CASINO_GAME_INFO[state.gameId], required = stake * info.maxExposure;
  return <main className="casino-card-shell">
    <header className="casino-card-header"><button onClick={onExit} aria-label="카지노로 돌아가기">←</button><div><span>THE MARGIN · TABLE GAME</span><h1>{info.title}</h1></div><strong>{balance.toLocaleString("ko-KR")} P</strong></header>
    <section className={`casino-card-table game-${state.gameId}`}>
      {state.status === "ready" ? <Ready state={state} balance={balance} stake={stake} required={required} busy={busy} onStake={setStake} onStart={onStart} /> : <Game state={state} atlas={atlas} busy={busy} onAction={onAction} />}
      {error && <p className="casino-card-error" role="alert">{error}</p>}
    </section>
  </main>;
}

function Ready({ state, balance, stake, required, busy, onStake, onStart }: { state: CasinoCardState; balance: number; stake: CasinoCardStake; required: number; busy: boolean; onStake(value: CasinoCardStake): void; onStart(value: CasinoCardStake): void | Promise<void> }) {
  const info = CASINO_GAME_INFO[state.gameId];
  return <div className="casino-card-ready"><span className="casino-card-kicker">{state.gameId === "texas-holdem" ? "최대 네 단위 예약" : "한 판 판돈"}</span><h2>{info.description}</h2><p>{ruleText(state.gameId)}</p><div className="casino-card-stakes">{CASINO_CARD_STAKES.map((value) => <button key={value} aria-pressed={stake === value} disabled={busy || balance < value * info.maxExposure} onClick={() => onStake(value)}>{value} P</button>)}</div><small>시작할 때 {required.toLocaleString("ko-KR")} P를 최대 손실액으로 예약합니다.</small><button className="casino-card-primary" disabled={busy || balance < required} onClick={() => { void onStart(stake); }}>{balance < required ? "포인트 부족" : "시작"}</button></div>;
}

function Game({ state, atlas, busy, onAction }: { state: CasinoCardState; atlas: CourtAtlas; busy: boolean; onAction(action: CasinoCardAction): void | Promise<void> }) {
  if (state.gameId === "high-low") return <HighLow state={state} atlas={atlas} busy={busy} onAction={onAction} />;
  if (state.gameId === "blackjack") return <Blackjack state={state} atlas={atlas} busy={busy} onAction={onAction} />;
  if (state.gameId === "doubt") return <Doubt state={state} atlas={atlas} busy={busy} onAction={onAction} />;
  if (state.gameId === "one-card") return <OneCard state={state} atlas={atlas} busy={busy} onAction={onAction} />;
  return <Holdem state={state} atlas={atlas} busy={busy} onAction={onAction} />;
}

function HighLow({ state, atlas, busy, onAction }: GameProps) { return <div className="casino-card-game"><h2>{state.streak ? `${state.streak}연속 적중 · 현재 ${2 ** state.streak}배` : "첫 번째 예측"}</h2><Card id={state.currentCard} atlas={atlas} /><p>{state.message}</p>{state.status !== "complete" ? <div className="casino-card-actions"><button disabled={busy} onClick={() => onAction({ type: "guess", direction: "lower" })}>낮다</button>{state.streak > 0 && <button disabled={busy} onClick={() => onAction({ type: "cash_out" })}>여기서 받기</button>}<button className="casino-card-primary" disabled={busy} onClick={() => onAction({ type: "guess", direction: "higher" })}>높다</button></div> : <Complete state={state} onAction={onAction} />}</div>; }

function Blackjack({ state, atlas, busy, onAction }: GameProps) {
  const reveal = state.status === "complete";
  return <div className="casino-card-game"><Seat label={`하우스 ${reveal ? blackjackValue(state.hands["cpu-1"]) : ""}`} cards={state.hands["cpu-1"]} atlas={atlas} hideAfter={reveal ? 99 : 1} /><div className="casino-card-divider">21</div><Seat label={`내 패 ${blackjackValue(state.hands.player)}`} cards={state.hands.player} atlas={atlas} /> <p>{state.message}</p>{reveal ? <Complete state={state} onAction={onAction} /> : <div className="casino-card-actions"><button disabled={busy} onClick={() => onAction({ type: "stand" })}>멈추기</button><button className="casino-card-primary" disabled={busy} onClick={() => onAction({ type: "hit" })}>한 장 더</button></div>}</div>;
}

function Doubt({ state, atlas, busy, onAction }: GameProps) {
  const revealed = state.status === "round-result" || state.status === "complete";
  return <div className="casino-card-game"><div className={`casino-card-dealer tell-${state.tell}`}><span>워어즈 · {state.tell === "tense" ? "시선이 잠시 흔들린다" : state.tell === "pleased" ? "차분하게 기다린다" : "표정을 읽기 어렵다"}</span><strong>“{rankLabel(state.claim)}입니다.”</strong></div>{revealed ? <Card id={state.lastReveal} atlas={atlas} /> : <CardBack />}<h2>{state.round}/5 · 판정 {state.score >= 0 ? "+" : ""}{state.score}</h2><p>{state.message}</p>{state.status === "playing" ? <div className="casino-card-actions"><button disabled={busy} onClick={() => onAction({ type: "answer", answer: "doubt" })}>다우트</button><button className="casino-card-primary" disabled={busy} onClick={() => onAction({ type: "answer", answer: "trust" })}>믿는다</button></div> : state.status === "round-result" ? <button className="casino-card-primary" disabled={busy} onClick={() => onAction({ type: "next_round" })}>{state.round >= 5 ? "결과 보기" : "다음 선언"}</button> : <Complete state={state} onAction={onAction} />}</div>;
}

function OneCard({ state, atlas, busy, onAction }: GameProps) {
  const top = state.discard[state.discard.length - 1] ?? null, legal = state.hands.player.filter((id) => top && canPlay(id, top));
  return <div className="casino-card-game one-card-layout"><div className="casino-card-opponents">{(["cpu-1", "cpu-2", "cpu-3"] as const).map((seat) => <div key={seat}><strong>{seatName(seat)}</strong><span>{state.hands[seat].length}장</span></div>)}</div><div className="casino-card-discard"><span>버림패</span><Card id={top} atlas={atlas} /></div><p>{state.message}</p>{state.status === "complete" ? <Complete state={state} onAction={onAction} /> : <div className="casino-card-hand">{state.hands.player.map((id) => <button key={id} disabled={busy || !legal.includes(id)} onClick={() => onAction({ type: "play_card", cardId: id })}><Card id={id} atlas={atlas} /></button>)}{legal.length === 0 && <button className="casino-card-draw" disabled={busy} onClick={() => onAction({ type: "draw_card" })}>한 장 받기</button>}</div>}</div>;
}

function Holdem({ state, atlas, busy, onAction }: GameProps) {
  const street = state.round === 0 ? "프리플롭" : state.round === 1 ? "플롭" : state.round === 2 ? "턴" : "리버", complete = state.status === "complete";
  return <div className="casino-card-game holdem-layout"><div className="casino-card-opponents">{(["cpu-1", "cpu-2", "cpu-3"] as const).map((seat) => <div className={state.folded[seat] ? "folded" : ""} key={seat}><strong>{seatName(seat)}</strong><span>{state.folded[seat] ? "폴드" : "참가 중"}</span>{complete && <Seat cards={state.hands[seat]} atlas={atlas} />}</div>)}</div><div className="casino-card-community">{state.community.map((id, index) => index < state.communityVisible ? <Card key={id} id={id} atlas={atlas} /> : <CardBack key={id} />)}</div><span className="casino-card-kicker">{street} · 투입 {state.committed} P / 예약 {state.reservedAmount} P</span><Seat label={complete ? bestPokerHand([...state.hands.player, ...state.community]).label : "내 패"} cards={state.hands.player} atlas={atlas} /><p>{state.message}</p>{complete ? <Complete state={state} onAction={onAction} /> : <div className="casino-card-actions"><button disabled={busy} onClick={() => onAction({ type: "poker", action: "fold" })}>폴드</button><button disabled={busy} onClick={() => onAction({ type: "poker", action: "call" })}>콜 +{state.stake} P</button><button className="casino-card-primary" disabled={busy || state.committed + (state.stake ?? 0) * 2 > state.reservedAmount} onClick={() => onAction({ type: "poker", action: "raise" })}>레이즈 +{(state.stake ?? 0) * 2} P</button></div>}</div>;
}

function Complete({ state, onAction }: { state: CasinoCardState; onAction(action: CasinoCardAction): void | Promise<void> }) { return <section className={`casino-card-result result-${state.outcome}`}><h2>{state.outcome === "win" ? "승리" : state.outcome === "push" ? "무승부" : "패배"}</h2><p>{state.message}</p><strong>{state.creditAmount.toLocaleString("ko-KR")} P 반환</strong><button onClick={() => onAction({ type: "restart" })}>다시하기</button></section>; }
interface GameProps { state: CasinoCardState; atlas: CourtAtlas; busy: boolean; onAction(action: CasinoCardAction): void | Promise<void>; }
function Seat({ label, cards, atlas, hideAfter = 99 }: { label?: string; cards: readonly string[]; atlas: CourtAtlas; hideAfter?: number }) { return <div className="casino-card-seat">{label && <strong>{label}</strong>}<div>{cards.map((id, index) => index >= hideAfter ? <CardBack key={`${id}:${index}`} /> : <Card key={`${id}:${index}`} id={id} atlas={atlas} />)}</div></div>; }
function Card({ id, atlas }: { id: string | null; atlas: CourtAtlas }) { if (!id) return null; const card = cardById(id); return <div className="casino-standard-card">{card.rank === "j" || card.rank === "q" || card.rank === "k" ? <CourtCard atlas={atlas} id={`${card.suit}-${card.rank}` as CourtCardId} scale={0.4} /> : <PlayingCard suit={card.suit} rank={card.rank as PlayingCardPipRank} />}</div>; }
function CardBack() { return <div className="casino-standard-card"><PlayingCardBack decorative /></div>; }
function canPlay(id: string, topId: string): boolean { const card = cardById(id), top = cardById(topId); return card.suit === top.suit || card.rank === top.rank; }
function rankLabel(rank: string | null): string { return rank === "a" ? "에이스" : rank === "j" ? "잭" : rank === "q" ? "퀸" : rank === "k" ? "킹" : rank ?? "?"; }
function seatName(seat: CasinoSeatId): string { return seat === "cpu-1" ? "페일" : seat === "cpu-2" ? "카노" : seat === "cpu-3" ? "네모" : "플레이어"; }
function ruleText(gameId: CasinoCardState["gameId"]): string { return gameId === "high-low" ? "같은 숫자는 실패입니다. 연속 적중할수록 2·4·8·16·32배로 올라갑니다." : gameId === "blackjack" ? "J·Q·K는 10, A는 1 또는 11입니다. 하우스는 17 이상에서 멈춥니다." : gameId === "doubt" ? "다섯 번의 카드 선언을 듣고 믿을지 다우트를 외칠지 고릅니다." : gameId === "one-card" ? "같은 무늬나 숫자만 낼 수 있습니다. 낼 카드가 없으면 한 장 받습니다." : "두 장의 개인 패와 다섯 장의 공용 패로 가장 높은 5장 족보를 만듭니다."; }
