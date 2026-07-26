import type {
  ForfeitGameWagerInput,
  GameWagerReceipt,
  GameWagerTransactionResult,
  InvalidateGameWagerInput,
  ReserveGameWagerInput,
  SettleGameWagerInput,
} from "@lucky-arcade/persistence";
import {
  forfeitGameWager,
  listGameWagers,
  reserveGameWager,
  settleGameWager,
  systemInvalidateGameWager,
} from "./database.ts";

export type NewGameWager = Omit<ReserveGameWagerInput, "wagerId"> & { wagerId?: string };

export function reserveWager(input: NewGameWager): Promise<GameWagerTransactionResult> {
  return reserveGameWager({ ...input, wagerId: input.wagerId ?? crypto.randomUUID() });
}

export function settleWager(input: SettleGameWagerInput): Promise<GameWagerTransactionResult> {
  return settleGameWager(input);
}

export function forfeitWager(input: ForfeitGameWagerInput): Promise<GameWagerTransactionResult> {
  return forfeitGameWager(input);
}

export function invalidateWager(input: InvalidateGameWagerInput): Promise<GameWagerTransactionResult> {
  return systemInvalidateGameWager(input);
}

export function listWagers(sessionId?: string): Promise<GameWagerReceipt[]> {
  return listGameWagers(sessionId);
}
