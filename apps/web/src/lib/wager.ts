import type {
  InvalidateSpectatorPredictionInput,
  PredictionStake,
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

export const PREDICTION_STAKES = [10, 50, 200] as const satisfies readonly PredictionStake[];

export type NewSpectatorPrediction = Omit<ReserveSpectatorPredictionInput, "predictionId"> & { predictionId?: string };

export function reservePrediction(input: NewSpectatorPrediction): Promise<PredictionTransactionResult> {
  return reserveSpectatorPrediction({ ...input, predictionId: input.predictionId ?? crypto.randomUUID() });
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
