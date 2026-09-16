import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import { buildCasinoSideMarketReplay, type CasinoSideMarketReplay, type CasinoSideMarketResult } from "./casino-side-market-replay.ts";

export interface ReplayWorkerRequest {
  readonly id: number;
  readonly market: CasinoSpectatorMarket;
  readonly mode: "replay" | "result";
}

export type ReplayWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: CasinoSideMarketReplay | CasinoSideMarketResult }
  | { readonly id: number; readonly ok: false; readonly error: { readonly name: string; readonly message: string } };

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<ReplayWorkerRequest>) => {
  const { id, market, mode } = event.data;
  try {
    const replay = await buildCasinoSideMarketReplay(market, mode === "replay");
    // Plain records/arrays and same-origin /content URL strings only; no DOM,
    // image bytes, callbacks, or transferable resources cross this boundary.
    const value = mode === "replay" ? replay : {
      marketId: replay.marketId, winningOutcomeId: replay.winningOutcomeId, resultHash: replay.resultHash,
    };
    scope.postMessage({ id, ok: true, value } satisfies ReplayWorkerResponse);
  } catch (error: unknown) {
    scope.postMessage({ id, ok: false, error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    } } satisfies ReplayWorkerResponse);
  }
};
