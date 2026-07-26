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

export const PREDICTION_STAKES = [10, 50, 200] as const satisfies readonly PredictionStake[];
export const PREDICTION_MULTIPLIERS = [2, 3, 4, 5] as const satisfies readonly PredictionMultiplier[];

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
