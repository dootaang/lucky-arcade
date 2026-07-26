export const CASINO_CARDS_VERSION = "casino-cards/0.1" as const;
export const CASINO_CARD_STATE_CONTRACT = "casino-card-state/0.1" as const;
export const CASINO_CARD_PACK_VERSION = "temerosa-casino-cards/0.1" as const;
export const CASINO_CARD_STAKES = [10, 50, 200] as const;

export type CasinoCardGameId = "high-low" | "blackjack" | "doubt" | "one-card" | "texas-holdem";
export type CasinoCardStake = (typeof CASINO_CARD_STAKES)[number];
export type CasinoCardStatus = "ready" | "playing" | "round-result" | "complete";
export type CasinoCardOutcome = "win" | "loss" | "push" | null;
export type CasinoSeatId = "player" | "cpu-1" | "cpu-2" | "cpu-3";
export type PokerAction = "fold" | "call" | "raise";

export interface CasinoCardState {
  contract: typeof CASINO_CARD_STATE_CONTRACT;
  version: typeof CASINO_CARDS_VERSION;
  packVersion: string;
  sessionId: string;
  gameId: CasinoCardGameId;
  seed: string;
  sequence: number;
  status: CasinoCardStatus;
  stake: CasinoCardStake | null;
  reservedAmount: number;
  wagerId: string | null;
  deck: string[];
  cursor: number;
  hands: Record<CasinoSeatId, string[]>;
  community: string[];
  communityVisible: number;
  discard: string[];
  currentCard: string | null;
  hiddenCard: string | null;
  lastReveal: string | null;
  claim: string | null;
  tell: "neutral" | "pleased" | "tense";
  round: number;
  score: number;
  streak: number;
  currentSeat: CasinoSeatId;
  folded: Record<CasinoSeatId, boolean>;
  committed: number;
  outcome: CasinoCardOutcome;
  creditAmount: number;
  message: string;
}

export type CasinoCardAction =
  | { type: "start"; seed: string; stake: CasinoCardStake; reservedAmount: number; wagerId: string }
  | { type: "guess"; direction: "higher" | "lower" }
  | { type: "cash_out" }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "answer"; answer: "trust" | "doubt" }
  | { type: "next_round" }
  | { type: "play_card"; cardId: string }
  | { type: "draw_card" }
  | { type: "poker"; action: PokerAction }
  | { type: "restart" };

export interface PokerHandValue { category: number; kickers: number[]; label: string; }

export const CASINO_GAME_INFO: Readonly<Record<CasinoCardGameId, { title: string; description: string; minutes: { min: number; max: number }; maxExposure: number }>> = {
  "high-low": { title: "하이로우", description: "다음 카드가 더 높을지 낮을지 맞히고 배당을 쌓는 빠른 게임.", minutes: { min: 1, max: 2 }, maxExposure: 1 },
  blackjack: { title: "블랙잭", description: "21을 넘지 않게 카드를 받고 하우스보다 높은 수를 만든다.", minutes: { min: 1, max: 2 }, maxExposure: 1 },
  doubt: { title: "다우트", description: "상대의 선언과 표정을 읽고 진실인지 거짓인지 가려낸다.", minutes: { min: 1, max: 2 }, maxExposure: 1 },
  "one-card": { title: "원카드", description: "같은 무늬나 숫자를 이어 내고 먼저 손을 비운다.", minutes: { min: 2, max: 5 }, maxExposure: 1 },
  "texas-holdem": { title: "텍사스 홀덤", description: "공용 카드와 두 장의 패로 족보를 만들고 네 거리에서 판돈을 결정한다.", minutes: { min: 3, max: 7 }, maxExposure: 4 },
};
