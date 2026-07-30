import type {
  InvalidateSpectatorPredictionInput,
  PredictionStake,
  PredictionMultiplier,
  PredictionTransactionResult,
  ReserveSpectatorPredictionInput,
  SettleSpectatorPredictionInput,
  SpectatorPrediction,
} from "@lucky-arcade/persistence";
import {
  listSpectatorPredictions,
  reserveSpectatorPrediction,
  settleSpectatorPrediction,
  systemInvalidateSpectatorPrediction,
} from "./database.ts";
import { TEMEROSA_HOUSE_ACCOUNT_ID } from "@lucky-arcade/casino-ledger";
import { casinoCounterpartyContext } from "./casino-economy.ts";

export const PREDICTION_STAKES = [10, 50, 200] as const satisfies readonly PredictionStake[];
export const PREDICTION_MULTIPLIERS = [2, 3, 4, 5] as const satisfies readonly PredictionMultiplier[];

export type NewSpectatorPrediction = Omit<ReserveSpectatorPredictionInput, "predictionId"> & { predictionId?: string };

export async function reservePrediction(input: NewSpectatorPrediction): Promise<PredictionTransactionResult> {
  const counterparty = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID);
  return reserveSpectatorPrediction({
    ...input,
    predictionId: input.predictionId ?? crypto.randomUUID(),
    ...counterparty,
    counterpartyReservedAmount: input.stake * input.multiplier,
    casinoTableId: input.outcomeKey.startsWith("temerosa-old-maid|") ? "temerosa-old-maid" : "temerosa-match-pairs",
  });
}

export function settlePrediction(input: SettleSpectatorPredictionInput): Promise<PredictionTransactionResult> {
  return settleSpectatorPrediction(input);
}

/** Only storage/system invalidation may return an unresolved reservation. */
export function invalidatePrediction(input: InvalidateSpectatorPredictionInput): Promise<PredictionTransactionResult> {
  return systemInvalidateSpectatorPrediction(input);
}

export function listPredictions(): Promise<SpectatorPrediction[]> {
  return listSpectatorPredictions();
}
