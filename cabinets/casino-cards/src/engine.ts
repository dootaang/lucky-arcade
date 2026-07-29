import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import { CASINO_CARD_PACK_VERSION, CASINO_CARD_STATE_CONTRACT, CASINO_CARDS_VERSION, HIGH_LOW_RETURN_MULTIPLIERS, type CasinoCardAction, type CasinoCardGameId, type CasinoCardOutcome, type CasinoCardStake, type CasinoCardState, type CasinoSeatId, type HoldemCpuRead, type OneCardCpuChoice, type OneCardCpuRead } from "./contracts.ts";
import { RANKS, bestPokerHand, blackjackValue, cardById, comparePokerHands, rankValue, shuffledDeck } from "./deck.ts";

const SEATS: readonly CasinoSeatId[] = ["player", "cpu-1", "cpu-2", "cpu-3"];

export function createCasinoCardState(gameId: CasinoCardGameId, sessionId = `temerosa-${gameId}:table-1`): CasinoCardState {
  return { contract: CASINO_CARD_STATE_CONTRACT, version: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, sessionId, gameId, seed: "", sequence: 0, status: "ready", stake: null, reservedAmount: 0, wagerId: null, deck: [], cursor: 0, hands: emptyHands(), community: [], communityVisible: 0, discard: [], currentCard: null, hiddenCard: null, lastReveal: null, claim: null, tell: "neutral", round: 0, score: 0, streak: 0, currentSeat: "player", folded: emptyFolded(), committed: 0, outcome: null, creditAmount: 0, message: "판돈을 고르고 시작하세요." };
}

export function reduceCasinoCard(state: CasinoCardState, action: CasinoCardAction): CasinoCardState {
  if (action.type === "restart") return { ...createCasinoCardState(state.gameId, state.sessionId), sequence: state.sequence + 1 };
  if (action.type === "start") return startGame(state, action.seed, action.stake, action.reservedAmount, action.wagerId);
  assert(state.status !== "ready" && state.status !== "complete", "casino_card_action_invalid");
  switch (state.gameId) {
    case "high-low": return reduceHighLow(state, action);
    case "blackjack": return reduceBlackjack(state, action);
    case "doubt": return reduceDoubt(state, action);
    case "one-card": return reduceOneCard(state, action);
    case "texas-holdem": return reduceHoldem(state, action);
  }
}

export function casinoCardResultHash(state: CasinoCardState): string { return resultHash(state); }
export function casinoCardCredit(state: CasinoCardState): number { return state.status === "complete" ? state.creditAmount : 0; }

function startGame(state: CasinoCardState, seed: string, stake: CasinoCardStake, reservedAmount: number, wagerId: string): CasinoCardState {
  assert(state.status === "ready" || state.status === "complete", "casino_card_start_invalid");
  assert(seed.length > 0 && wagerId.length > 0 && reservedAmount >= stake, "casino_card_wager_invalid");
  const base: CasinoCardState = { ...createCasinoCardState(state.gameId, state.sessionId), sequence: state.sequence + 1, seed, stake, reservedAmount, wagerId, deck: shuffledDeck(`${CASINO_CARD_PACK_VERSION}:${state.gameId}:${seed}`), status: "playing" };
  if (state.gameId === "high-low") return { ...base, currentCard: base.deck[0] ?? null, cursor: 1, message: "다음 카드가 더 높을지 낮을지 고르세요." };
  if (state.gameId === "blackjack") {
    const hands = { ...base.hands, player: [base.deck[0]!, base.deck[2]!], "cpu-1": [base.deck[1]!, base.deck[3]!] };
    const dealt = { ...base, hands, cursor: 4, message: "카드를 더 받을지 멈출지 고르세요." };
    return blackjackValue(hands.player) === 21 || blackjackValue(hands["cpu-1"]) === 21 ? settleBlackjack(dealt) : dealt;
  }
  if (state.gameId === "doubt") return dealDoubt(base, 1);
  if (state.gameId === "one-card") {
    const hands = emptyHands(); let cursor = 0;
    for (let card = 0; card < 7; card += 1) for (const seat of SEATS) hands[seat].push(base.deck[cursor++]!);
    return { ...base, hands, cursor: cursor + 1, discard: [base.deck[cursor]!], currentSeat: "player", message: "같은 무늬나 숫자의 카드를 내세요." };
  }
  const hands = emptyHands(); let cursor = 0;
  for (let card = 0; card < 2; card += 1) for (const seat of SEATS) hands[seat].push(base.deck[cursor++]!);
  const community = base.deck.slice(cursor, cursor + 5);
  return { ...base, hands, community, cursor: cursor + 5, round: 0, communityVisible: 0, committed: stake, message: "프리플롭 · 콜, 레이즈 또는 폴드를 고르세요." };
}

function reduceHighLow(state: CasinoCardState, action: CasinoCardAction): CasinoCardState {
  if (action.type === "cash_out") { assert(state.streak > 0, "high_low_cashout_invalid"); return complete({ ...state, sequence: state.sequence + 1 }, "win", highLowCredit(state.stake ?? 0, state.streak), `${state.streak}연속 적중으로 멈췄습니다.`); }
  assert(action.type === "guess" && state.currentCard, "high_low_guess_invalid");
  const next = state.deck[state.cursor]; assert(next, "high_low_deck_empty");
  const difference = rankValue(next) - rankValue(state.currentCard), correct = action.direction === "higher" ? difference > 0 : difference < 0;
  if (!correct) return complete({ ...state, sequence: state.sequence + 1, lastReveal: next, currentCard: next, cursor: state.cursor + 1 }, "loss", 0, difference === 0 ? "같은 숫자가 나와 판돈을 잃었습니다." : "예측이 빗나갔습니다.");
  const streak = state.streak + 1, nextState = { ...state, sequence: state.sequence + 1, lastReveal: next, currentCard: next, cursor: state.cursor + 1, streak, message: `${streak}연속 적중 · 지금 멈추거나 한 번 더 고르세요.` };
  return streak >= 5 ? complete(nextState, "win", highLowCredit(state.stake ?? 0, streak), "다섯 번 연속으로 맞혔습니다.") : nextState;
}

function highLowCredit(stake: number, streak: number): number {
  const multiplier = HIGH_LOW_RETURN_MULTIPLIERS[streak - 1];
  assert(multiplier !== undefined, "high_low_streak_invalid");
  return Math.round(stake * multiplier);
}

function reduceBlackjack(state: CasinoCardState, action: CasinoCardAction): CasinoCardState {
  if (action.type === "hit") {
    const next = state.deck[state.cursor]; assert(next, "blackjack_deck_empty");
    const hands = { ...state.hands, player: [...state.hands.player, next] }, updated = { ...state, sequence: state.sequence + 1, hands, cursor: state.cursor + 1 };
    return blackjackValue(hands.player) > 21 ? complete(updated, "loss", 0, "21을 넘었습니다.") : { ...updated, message: "한 장 더 받거나 멈추세요." };
  }
  assert(action.type === "stand", "blackjack_action_invalid");
  return settleBlackjack({ ...state, sequence: state.sequence + 1 });
}
function settleBlackjack(state: CasinoCardState): CasinoCardState {
  const initialPlayer = blackjackValue(state.hands.player), initialDealer = blackjackValue(state.hands["cpu-1"]);
  const playerNatural = state.hands.player.length === 2 && initialPlayer === 21;
  const dealerNatural = state.hands["cpu-1"].length === 2 && initialDealer === 21;
  if (playerNatural && dealerNatural) return complete(state, "push", state.stake ?? 0, "양쪽 모두 블랙잭입니다.");
  if (playerNatural) return complete(state, "win", Math.floor((state.stake ?? 0) * 2.5), "블랙잭입니다.");
  if (dealerNatural) return complete(state, "loss", 0, "딜러가 블랙잭입니다.");
  let cursor = state.cursor, dealer = [...state.hands["cpu-1"]]; while (blackjackValue(dealer) < 17) dealer.push(state.deck[cursor++]!);
  const hands = { ...state.hands, "cpu-1": dealer }, player = blackjackValue(hands.player), house = blackjackValue(dealer);
  if (player > 21) return complete({ ...state, hands, cursor }, "loss", 0, "21을 넘었습니다.");
  if (house > 21 || player > house) return complete({ ...state, hands, cursor }, "win", (state.stake ?? 0) * 2, "하우스를 이겼습니다.");
  if (player === house) return complete({ ...state, hands, cursor }, "push", state.stake ?? 0, "무승부로 판돈을 돌려받습니다.");
  return complete({ ...state, hands, cursor }, "loss", 0, "하우스의 수가 더 높습니다.");
}

function dealDoubt(state: CasinoCardState, round: number): CasinoCardState {
  const hiddenCard = state.deck[state.cursor] ?? null; assert(hiddenCard, "doubt_deck_empty");
  const actual = cardById(hiddenCard).rank, rng = new XorShift32(`${state.seed}:doubt:${round}`), truthful = rng.nextUint32() % 100 < 55;
  const falseRanks = RANKS.filter((rank) => rank !== actual);
  const claim = truthful ? actual : falseRanks[rng.nextUint32() % falseRanks.length]!;
  const tellTruth = rng.nextUint32() % 100 < 68, tell = (tellTruth ? truthful : !truthful) ? "pleased" : "tense";
  return { ...state, status: "playing", hiddenCard, lastReveal: null, claim, tell, round, cursor: state.cursor + 1, message: `워어즈가 “${rankLabel(claim)}입니다”라고 선언했습니다.` };
}
function reduceDoubt(state: CasinoCardState, action: CasinoCardAction): CasinoCardState {
  if (action.type === "next_round") { assert(state.status === "round-result", "doubt_next_invalid"); return state.round >= 5 ? settleDoubt({ ...state, sequence: state.sequence + 1 }) : dealDoubt({ ...state, sequence: state.sequence + 1 }, state.round + 1); }
  assert(state.status === "playing" && action.type === "answer" && state.hiddenCard && state.claim, "doubt_answer_invalid");
  const truthful = cardById(state.hiddenCard).rank === state.claim, correct = action.answer === (truthful ? "trust" : "doubt"), score = state.score + (correct ? 1 : -1);
  return { ...state, sequence: state.sequence + 1, status: "round-result", score, lastReveal: state.hiddenCard, message: correct ? "표정을 정확히 읽었습니다." : "상대의 속임수에 걸렸습니다." };
}
function settleDoubt(state: CasinoCardState): CasinoCardState { return state.score > 0 ? complete(state, "win", (state.stake ?? 0) * 2, "다섯 번의 선언에서 우위를 점했습니다.") : state.score === 0 ? complete(state, "push", state.stake ?? 0, "판정이 비겨 판돈을 돌려받습니다.") : complete(state, "loss", 0, "워어즈가 당신의 의심을 앞섰습니다."); }

function reduceOneCard(state: CasinoCardState, action: CasinoCardAction): CasinoCardState {
  assert(state.currentSeat === "player", "one_card_not_player_turn");
  let next = state, progressed = false;
  if (action.type === "play_card") {
    assert(state.hands.player.includes(action.cardId) && canPlay(action.cardId, topDiscard(state)), "one_card_play_invalid");
    const hands = { ...state.hands, player: state.hands.player.filter((id) => id !== action.cardId) };
    next = { ...state, sequence: state.sequence + 1, hands, discard: [...state.discard, action.cardId] };
    progressed = true;
    if (hands.player.length === 0) return complete(next, "win", (state.stake ?? 0) * 2, "손을 먼저 비웠습니다.");
  } else {
    assert(action.type === "draw_card" && !state.hands.player.some((id) => canPlay(id, topDiscard(state))), "one_card_draw_invalid");
    next = drawForSeat({ ...state, sequence: state.sequence + 1 }, "player");
    progressed = next.hands.player.length > state.hands.player.length;
  }
  return runCpuOneCard({ ...next, currentSeat: "cpu-1" }, progressed);
}
function runCpuOneCard(input: CasinoCardState, initialProgress: boolean): CasinoCardState {
  let state = input, progressed = initialProgress;
  for (const seat of ["cpu-1", "cpu-2", "cpu-3"] as const) {
    const choice = chooseOneCardCpuAction({ hand: state.hands[seat], topCard: topDiscard(state) });
    if (choice.type === "play") {
      const hands = { ...state.hands, [seat]: state.hands[seat].filter((id) => id !== choice.cardId) };
      state = { ...state, hands, discard: [...state.discard, choice.cardId], currentSeat: seat };
      progressed = true;
      if (hands[seat].length === 0) return complete(state, "loss", 0, `${seatName(seat)}가 먼저 손을 비웠습니다.`);
    } else {
      const before = state.hands[seat].length;
      state = drawForSeat(state, seat);
      progressed ||= state.hands[seat].length > before;
    }
  }
  if (!progressed) return complete(state, "push", state.stake ?? 0, "낼 카드가 없어 무승부로 판돈을 돌려받습니다.");
  return { ...state, currentSeat: "player", message: "당신의 차례입니다." };
}
function drawForSeat(input: CasinoCardState, seat: CasinoSeatId): CasinoCardState {
  let state = input; if (state.cursor >= state.deck.length) state = recycleOneCardDeck(state);
  const card = state.deck[state.cursor]; if (!card) return state;
  return { ...state, cursor: state.cursor + 1, hands: { ...state.hands, [seat]: [...state.hands[seat], card] } };
}
function recycleOneCardDeck(state: CasinoCardState): CasinoCardState { const top = topDiscard(state), recycled = state.discard.slice(0, -1).reverse(); return recycled.length > 0 ? { ...state, deck: recycled, cursor: 0, discard: [top] } : state; }
function topDiscard(state: CasinoCardState): string { const card = state.discard[state.discard.length - 1]; assert(card, "one_card_discard_empty"); return card; }
function canPlay(cardId: string, topId: string): boolean { const card = cardById(cardId), top = cardById(topId); return card.suit === top.suit || card.rank === top.rank; }

export function chooseOneCardCpuAction(read: OneCardCpuRead): OneCardCpuChoice {
  const cardId = [...read.hand].filter((id) => canPlay(id, read.topCard)).sort()[0];
  return cardId ? { type: "play", cardId } : { type: "draw" };
}

function reduceHoldem(state: CasinoCardState, action: CasinoCardAction): CasinoCardState {
  assert(action.type === "poker", "holdem_action_invalid");
  if (action.action === "fold") return complete({ ...state, sequence: state.sequence + 1 }, "loss", state.reservedAmount - state.committed, "폴드했습니다. 쓰지 않은 판돈은 돌아옵니다.");
  const unit = state.stake ?? 0, cost = action.action === "raise" ? unit * 2 : unit, committed = Math.min(state.reservedAmount, state.committed + cost);
  const round = state.round + 1, communityVisible = round === 1 ? 3 : Math.min(5, round + 2), folded = { ...state.folded };
  for (const seat of ["cpu-1", "cpu-2", "cpu-3"] as const) if (!folded[seat]) folded[seat] = holdemCpuFolds({ seed: state.seed, seatId: seat, holeCards: state.hands[seat], visibleCommunity: state.community.slice(0, state.communityVisible), round, playerAction: action.action });
  const next = { ...state, sequence: state.sequence + 1, committed, round, communityVisible, folded, message: round === 1 ? "플롭이 열렸습니다." : round === 2 ? "턴 카드가 열렸습니다." : "리버 카드가 열렸습니다." };
  return round >= 3 || committed >= state.reservedAmount ? settleHoldem(next) : next;
}
export function holdemCpuFolds(read: HoldemCpuRead): boolean {
  assert(read.holeCards.length === 2 && read.visibleCommunity.length <= 5, "holdem_cpu_read_invalid");
  const cards = [...read.holeCards, ...read.visibleCommunity], high = Math.max(...cards.map(rankValue)), pair = new Set(cards.map((id) => cardById(id).rank)).size < cards.length;
  const strength = (pair ? 35 : 0) + high * 3 + read.visibleCommunity.length * 2, threshold = (read.playerAction === "raise" ? 58 : 42) + read.round * 2;
  const noise = new XorShift32(`${read.seed}:holdem:${read.round}:${read.seatId}`).nextUint32() % 31;
  return strength + noise < threshold;
}
function settleHoldem(state: CasinoCardState): CasinoCardState {
  const active = SEATS.filter((seat) => seat === "player" || !state.folded[seat]), allCards = (seat: CasinoSeatId) => [...state.hands[seat], ...state.community];
  let winners: CasinoSeatId[] = [active[0] ?? "player"];
  for (const seat of active.slice(1)) { const comparison = comparePokerHands(allCards(seat), allCards(winners[0]!)); if (comparison > 0) winners = [seat]; else if (comparison === 0) winners.push(seat); }
  const uncommitted = state.reservedAmount - state.committed;
  const foldedAntes = SEATS.filter((seat) => seat !== "player" && state.folded[seat]).length * (state.stake ?? 0);
  const pot = state.committed * active.length + foldedAntes;
  const won = winners.includes("player"), credit = uncommitted + (won ? Math.floor(pot / winners.length) : 0), hand = bestPokerHand(allCards("player")).label;
  return complete({ ...state, communityVisible: 5 }, won ? (winners.length > 1 ? "push" : "win") : "loss", credit, won ? `${hand} · ${winners.length > 1 ? "공동 승리" : "팟을 가져왔습니다."}` : `${hand} · 상대가 팟을 가져갔습니다.`);
}

function complete(state: CasinoCardState, outcome: Exclude<CasinoCardOutcome, null>, creditAmount: number, message: string): CasinoCardState { return { ...state, status: "complete", outcome, creditAmount, message }; }
function emptyHands(): Record<CasinoSeatId, string[]> { return { player: [], "cpu-1": [], "cpu-2": [], "cpu-3": [] }; }
function emptyFolded(): Record<CasinoSeatId, boolean> { return { player: false, "cpu-1": false, "cpu-2": false, "cpu-3": false }; }
function rankLabel(rank: string): string { return rank === "a" ? "에이스" : rank === "j" ? "잭" : rank === "q" ? "퀸" : rank === "k" ? "킹" : rank; }
function seatName(seat: CasinoSeatId): string { return seat === "cpu-1" ? "페일" : seat === "cpu-2" ? "카노" : seat === "cpu-3" ? "네모" : "플레이어"; }
function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }

export function isCasinoCardState(value: unknown): value is CasinoCardState {
  if (!value || typeof value !== "object") return false; const state = value as Partial<CasinoCardState>;
  return state.contract === CASINO_CARD_STATE_CONTRACT && state.version === CASINO_CARDS_VERSION && typeof state.gameId === "string" && typeof state.sessionId === "string" && Number.isInteger(state.sequence) && Array.isArray(state.deck) && Boolean(state.hands);
}
