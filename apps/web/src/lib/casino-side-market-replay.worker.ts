import type { CasinoSpectatorMarket } from "@lucky-arcade/casino-ledger";
import {
  buildCasinoSideMarketReplay,
  type CasinoSideMarketReplay,
  type CasinoSideMarketResult,
} from "./casino-side-market-replay.ts";

interface ReplayWorkerRequest {
  market: CasinoSpectatorMarket;
  mode: "replay" | "result";
}

type ReplayWorkerResponse =
  | { ok: true; value: CasinoSideMarketReplay | CasinoSideMarketResult }
  | { ok: false; error: string };

const workerScope = globalThis as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<ReplayWorkerRequest>) => void): void;
  postMessage(message: ReplayWorkerResponse): void;
};

workerScope.addEventListener("message", (event) => {
  const { market, mode } = event.data;
  void buildCasinoSideMarketReplay(market, mode === "replay")
    .then((replay) => workerScope.postMessage({
      ok: true,
      value: mode === "replay"
        ? replay
        : { marketId: replay.marketId, winningOutcomeId: replay.winningOutcomeId, resultHash: replay.resultHash },
    }))
    .catch((error: unknown) => workerScope.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }));
});
