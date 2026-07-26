import { MATCH_PAIRS_VERSION, createMatchPairsState, isMatchPairsState, matchPairsResultHash, reduceMatchPairs, type MatchPairsAction, type MatchPairsOpponent, type MatchPairsState } from "@lucky-arcade/match-pairs";
import { MatchPairsScreen } from "@lucky-arcade/match-pairs/react";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import type { MatchRecord } from "@lucky-arcade/persistence";
import { useEffect, useState } from "react";
import { appendAction, appendMatchRecord, pruneMatchRecords, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { createTemerosaMatchPairsOpponents } from "./temerosa-match-pairs-opponents.ts";
import { TEMEROSA_MATCH_PAIRS_FACES, TEMEROSA_MATCH_PAIRS_PACK_VERSION } from "./temerosa-match-pairs-selection.ts";

const SESSION = "temerosa-match-pairs:versus-1";

interface ReadyMatchPairs {
  assets: Readonly<Record<string, string>>;
  thumbAssets: Readonly<Record<string, string>>;
  opponents: readonly MatchPairsOpponent[];
  state: MatchPairsState;
}

export default function MatchPairsView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<ReadyMatchPairs | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadTemerosaCasinoAssets().then(async (bundle) => {
      for (const face of TEMEROSA_MATCH_PAIRS_FACES) if (!bundle.assets[face.assetId]) throw new Error(`match_pairs_asset_missing:${face.assetId}`);
      const opponents = createTemerosaMatchPairsOpponents(bundle.contentAssets);
      if (opponents.length !== 30) throw new Error(`match_pairs_opponent_count:${opponents.length}`);
      for (const opponent of opponents) for (const assetId of [...Object.values(opponent.portraits), opponent.despairPortrait]) {
        if (!bundle.assets[assetId]) throw new Error(`match_pairs_opponent_asset_missing:${assetId}`);
      }
      const firstOpponent = opponents[0];
      if (!firstOpponent) throw new Error("match_pairs_opponent_missing");
      const recovered = await recoverSession<MatchPairsState, MatchPairsAction>({
        sessionId: SESSION,
        fresh: createMatchPairsState(TEMEROSA_MATCH_PAIRS_FACES, opponents, TEMEROSA_MATCH_PAIRS_PACK_VERSION, dailySeed(), "easy", firstOpponent.id, SESSION),
        cabinetVersion: MATCH_PAIRS_VERSION,
        packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
        isState: (value): value is MatchPairsState => isMatchPairsState(value) && value.packVersion === TEMEROSA_MATCH_PAIRS_PACK_VERSION && opponents.some((opponent) => opponent.id === value.opponentId),
        reduce: (state, action) => reduceMatchPairs(TEMEROSA_MATCH_PAIRS_FACES, opponents, state, action),
      });
      if (alive) setReady({ assets: bundle.assets, thumbAssets: bundle.thumbAssets, opponents, state: recovered.state });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  async function persist(previous: MatchPairsState, next: MatchPairsState, action: MatchPairsAction): Promise<void> {
    if (!ready) return;
    const receipt = makeReceipt(next.sequence, action, next.attempts, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    const opponent = ready.opponents.find((candidate) => candidate.id === next.opponentId);
    await saveSnapshot({
      contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next,
      stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: MATCH_PAIRS_VERSION,
      packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION,
    }, {
      contract: "recent-play/0.1", cabinetId: "temerosa-match-pairs", sessionId: SESSION,
      title: "짝맞추기", progressLabel: progressLabel(next, opponent?.name ?? "NPC"), updatedAt: new Date().toISOString(),
    });
    if (previous.status !== "complete" && next.status === "complete") {
      const playerWon = next.outcome === "player";
      const npcWon = next.outcome === "npc";
      const record: MatchRecord = {
        contract: "match-record/0.1", recordId: `${SESSION}#${next.sequence}`, cabinetId: "temerosa-match-pairs",
        cabinetVersion: MATCH_PAIRS_VERSION, packVersion: TEMEROSA_MATCH_PAIRS_PACK_VERSION, sessionId: SESSION,
        sequence: next.sequence, seed: next.seed, completedAt: new Date().toISOString(), turns: next.turnNumber,
        standings: [
          { seatId: "player", participantId: "player", displayName: "플레이어", rank: playerWon ? 1 : npcWon ? 2 : 1, isPlayer: true },
          { seatId: "npc", participantId: next.opponentId, displayName: opponent?.name ?? next.opponentId, rank: npcWon ? 1 : playerWon ? 2 : 1, isPlayer: false },
        ],
        outcome: playerWon ? "win" : npcWon ? "loss" : "draw", resultHash: matchPairsResultHash(next),
      };
      await appendMatchRecord(record);
      await pruneMatchRecords(200);
    }
  }

  if (error) return <main className="game-shell"><div className="game-loading" role="alert">짝맞추기 이미지를 준비하지 못했습니다.<button onClick={onExit}>카지노로 돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">짝맞추기 테이블을 준비하고 있어요…</div></main>;
  return <MatchPairsScreen faces={TEMEROSA_MATCH_PAIRS_FACES} opponents={ready.opponents} assets={ready.assets} thumbAssets={ready.thumbAssets}
    packVersion={TEMEROSA_MATCH_PAIRS_PACK_VERSION} seed={ready.state.seed} sessionId={SESSION} initialState={ready.state}
    onTransition={persist} onExit={onExit} />;
}

function progressLabel(state: MatchPairsState, opponentName: string): string {
  if (state.status === "ready") return `${opponentName} · 게임 준비`;
  if (state.status === "complete") return `나 ${state.claims.player.length} : ${state.claims.npc.length} ${opponentName} · 완료`;
  return `나 ${state.claims.player.length} : ${state.claims.npc.length} ${opponentName} · ${state.currentTurn === "player" ? "내 차례" : "상대 차례"}`;
}
function dailySeed(): string { return new Date().toISOString().slice(0, 10); }
