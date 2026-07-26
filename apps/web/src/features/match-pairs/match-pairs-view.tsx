import { MATCH_PAIRS_VERSION, createMatchPairsState, isMatchPairsState, matchPairsResultHash, reduceMatchPairs, type MatchPairsAction, type MatchPairsState } from "@lucky-arcade/match-pairs";
import { MatchPairsScreen } from "@lucky-arcade/match-pairs/react";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import type { MatchRecord } from "@lucky-arcade/persistence";
import { useEffect, useState } from "react";
import { appendAction, appendMatchRecord, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "./temerosa-match-pairs-selection.ts";

const SESSION = "temerosa-match-pairs:table-1";

export default function MatchPairsView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ assets: Readonly<Record<string, string>>; state: MatchPairsState } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadTemerosaCasinoAssets().then(async (bundle) => {
      for (const face of TEMEROSA_MATCH_PAIRS_FACES) if (!bundle.assets[face.assetId]) throw new Error(`match_pairs_asset_missing:${face.assetId}`);
      const recovered = await recoverSession<MatchPairsState, MatchPairsAction>({
        sessionId: SESSION,
        fresh: createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION, dailySeed(), "easy", SESSION),
        cabinetVersion: MATCH_PAIRS_VERSION,
        packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        isState: (value): value is MatchPairsState => isMatchPairsState(value) && value.packVersion === TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        reduce: (state, action) => reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, state, action),
      });
      if (alive) setReady({ assets: bundle.assets, state: recovered.state });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  async function persist(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction): Promise<void> {
    const receipt = makeReceipt(next.sequence, action, next.attempts, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    await saveSnapshot({
      contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next,
      stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: MATCH_PAIRS_VERSION,
      packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
    }, {
      contract: "recent-play/0.1", cabinetId: "temerosa-match-pairs", sessionId: SESSION,
      title: "짝맞추기", progressLabel: progressLabel(next), updatedAt: new Date().toISOString(),
    });
    if (previous.status !== "complete" && next.status === "complete") {
      const record: MatchRecord = {
        contract: "match-record/0.1", recordId: `${SESSION}#${next.sequence}`, cabinetId: "temerosa-match-pairs",
        cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION, sessionId: SESSION,
        sequence: next.sequence, seed: next.seed, completedAt: new Date().toISOString(), turns: next.attempts,
        standings: [{ seatId: "player", participantId: "player", displayName: "플레이어", rank: 1, isPlayer: true }],
        outcome: "win", resultHash: matchPairsResultHash(next),
      };
      await appendMatchRecord(record);
      await pruneMatchRecords(200);
    }
  }

  if (error) return <main className="game-shell"><div className="game-loading" role="alert">짝맞추기 이미지를 준비하지 못했습니다.<button onClick={onExit}>카지노로 돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">짝맞추기 카드를 준비하고 있어요…</div></main>;
  return <MatchPairsScreen faces={TEMEROSA_MATCH_PAIRS_FACES} assets={ready.assets} packVersion={TEMEROSA_MATCH_PAIRS_PACK_VERSION} seed={ready.state.seed} sessionId={SESSION} initialState={ready.state} onTransition={persist} onExit={onExit} />;
}

function progressLabel(state: MatchPairsState): string {
  if (state.status === "ready") return "게임 준비";
  if (state.status === "complete") return `시도 ${state.attempts}회 · 완료`;
  const pairs = state.difficulty === "easy" ? 6 : 8;
  return `${state.matchedPairIds.length}/${pairs}쌍 · 시도 ${state.attempts}회`;
}

function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
