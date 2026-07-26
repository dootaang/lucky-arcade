import { OLD_MAID_VERSION, TEMEROSA_OLD_MAID_PACK_VERSION, createOldMaidState, createTemerosaCasinoOldMaidCartridge, isOldMaidState, oldMaidOutcome, reduceOldMaid, restoreOldMaidState, type OldMaidAction, type OldMaidCartridge, type OldMaidPsychologySummary, type OldMaidState } from "@lucky-arcade/old-maid";
import { OldMaidScreen } from "@lucky-arcade/old-maid/react";
import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import { useEffect, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets } from "../../lib/temerosa-content.ts";
import { loadMatchSummary, recordOldMaidCompletion, type MatchSummary } from "../../lib/match-history.ts";
import { readCollection, unlockCollectionItem } from "../../lib/collection.ts";
import { grantOldMaidCompletion, readWallet } from "../../lib/wallet.ts";
import { invalidatePrediction, listPredictions, PREDICTION_MULTIPLIERS, PREDICTION_STAKES, reservePrediction, settlePrediction } from "../../lib/wager.ts";
import type { CollectionSnapshot, PredictionMultiplier, PredictionStake, SpectatorPrediction, WalletSnapshot } from "@lucky-arcade/persistence";

const SESSION = "temerosa-old-maid:table-1";
const COLLECTION = "temerosa-old-maid";

export default function TemerosaOldMaidView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ thumbAssets: Readonly<Record<string, string>>; assets: Readonly<Record<string, string>>; detailAssets: Readonly<Record<string, string>>; cartridge: OldMaidCartridge; state: OldMaidState | null } | null>(null);
  const [error, setError] = useState(false);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [collection, setCollection] = useState<CollectionSnapshot | null>(null);
  const [award, setAward] = useState<{ amount: number; rank: number } | null>(null);
  const [activePrediction, setActivePrediction] = useState<SpectatorPrediction | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTemerosaCasinoAssets().then(async (bundle) => {
      const cartridge = createTemerosaCasinoOldMaidCartridge(bundle.contentAssets);
      const [recovered, predictions] = await Promise.all([recoverSession<OldMaidState, OldMaidAction>({
        sessionId: SESSION,
        fresh: createOldMaidState(cartridge, new Date().toISOString().slice(0, 10), SESSION),
        cabinetVersion: OLD_MAID_VERSION,
        packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
        isState: (value): value is OldMaidState => isOldMaidState(value) && value.packVersion === TEMEROSA_OLD_MAID_PACK_VERSION,
        restoreSnapshot: restoreOldMaidState,
        reduce: (state, action) => reduceOldMaid(cartridge, state, action),
      }), listPredictions()]);
      if (!alive) return;
      const currentOutcomeKey = spectatorOutcomeKey(recovered.state);
      for (const prediction of predictions) {
        if (prediction.status !== "reserved" || !prediction.outcomeKey.startsWith("temerosa-old-maid|")) continue;
        if (prediction.outcomeKey === currentOutcomeKey) continue;
        const reason = prediction.outcomeKey.split("|")[1] === TEMEROSA_OLD_MAID_PACK_VERSION ? "outcome-unavailable" : "pack-version-mismatch";
        const refunded = await invalidatePrediction({ predictionId: prediction.predictionId, reason });
        if (alive) setWallet(refunded.wallet);
      }
      if (!alive) return;
      setReady({ thumbAssets: bundle.thumbAssets, assets: bundle.assets, detailAssets: bundle.detailAssets, cartridge, state: recovered.state });
      setActivePrediction(predictions.find((prediction) => prediction.outcomeKey === currentOutcomeKey) ?? null);
      if (recovered.state.status === "complete") void loadMatchSummary(SESSION).then(setMatchSummary).catch(() => undefined);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { void Promise.all([readWallet(), readCollection(COLLECTION)]).then(([nextWallet, nextCollection]) => { setWallet(nextWallet); setCollection(nextCollection); }).catch(() => undefined); }, []);

  async function persist(previous: OldMaidState, next: OldMaidState, action: OldMaidAction, psychology: OldMaidPsychologySummary) {
    const cartridge = ready?.cartridge;
    if (!cartridge) throw new Error("temerosa_old_maid_not_ready");
    const receipt = makeReceipt(next.sequence, action, next.turn, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    await saveSnapshot({
      contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next,
      stateHash: receipt.resultHash, engineVersion: "arcade-engine/0.1", cabinetVersion: next.version, packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
    }, {
      contract: "recent-play/0.1", cabinetId: "temerosa-old-maid", sessionId: SESSION,
      title: "테메로세 도둑잡기", progressLabel: progressLabel(next), updatedAt: new Date().toISOString(),
    });
    if (previous.status !== "complete" && next.status === "complete") {
      void recordOldMaidCompletion(cartridge, previous, next, {
        cabinetId: "temerosa-old-maid", sessionId: SESSION, cabinetVersion: next.version, packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
      }, psychology, activePrediction).then((summary) => { if (summary) setMatchSummary(summary); }).catch(() => undefined);
      if (next.mode === "spectate") void settleCurrentPrediction(next);
      else void grantOldMaidCompletion(previous, next, "temerosa-old-maid").then((result) => { if (result) { setWallet(result.wallet); setAward({ amount: result.amount, rank: result.rank }); } }).catch(() => undefined);
    }
  }

  async function startPrediction(input: { seed: string; characterIds: readonly string[]; predictedCharacterId: string; stake: number; multiplier: number }): Promise<"reserved" | "replay"> {
    const outcomeKey = spectatorOutcomeKey({ seed: input.seed, mode: "spectate", characters: { "cpu-1": input.characterIds[0] as string, "cpu-2": input.characterIds[1] as string, "cpu-3": input.characterIds[2] as string }, spectatorCharacterId: input.characterIds[3] as string });
    const existing = (await listPredictions()).find((prediction) => prediction.outcomeKey === outcomeKey);
    if (existing) { setActivePrediction(existing); return existing.status === "reserved" ? "reserved" : "replay"; }
    const result = await reservePrediction({ outcomeKey, predictedCharacterId: input.predictedCharacterId, stake: input.stake as PredictionStake, multiplier: input.multiplier as PredictionMultiplier });
    setWallet(result.wallet);
    setActivePrediction(result.prediction);
    return "reserved";
  }

  async function settleCurrentPrediction(state: OldMaidState): Promise<void> {
    const outcome = oldMaidOutcome(state);
    if (!outcome?.oddCardHolderCharacterId) return;
    const outcomeKey = spectatorOutcomeKey(state);
    const prediction = (await listPredictions()).find((candidate) => candidate.outcomeKey === outcomeKey && candidate.status === "reserved");
    if (!prediction) return;
    const result = await settlePrediction({ predictionId: prediction.predictionId, winningCharacterId: outcome.oddCardHolderCharacterId });
    setWallet(result.wallet);
    setActivePrediction(result.prediction);
  }

  if (error) return <main className="game-shell"><div className="game-loading">도둑잡기 카드를 불러오지 못했습니다.<button onClick={() => window.location.reload()}>다시 불러오기</button><button onClick={onExit}>오락실로 돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">도둑잡기 카드와 캐릭터 표정을 불러오고 있습니다…</div></main>;
  const economy = wallet && collection ? { balance: wallet.balance, award, unlockedFaceIds: collection.unlockedFaceIds, onUnlock: async () => { const result = await unlockCollectionItem(COLLECTION, ready.cartridge.faces.map((face) => face.id)); setWallet(result.wallet); setCollection(result.collection); }, prediction: { stakes: PREDICTION_STAKES, multipliers: PREDICTION_MULTIPLIERS, active: activePrediction, onStart: startPrediction } } : undefined;
  return <OldMaidScreen cartridge={ready.cartridge} thumbAssets={ready.thumbAssets} assets={ready.assets} detailAssets={ready.detailAssets} initialState={ready.state} matchSummary={matchSummary} {...(economy ? { economy } : {})} onPersist={persist} onExit={onExit} />;
}

function spectatorOutcomeKey(state: Pick<OldMaidState, "seed" | "mode" | "characters" | "spectatorCharacterId">): string {
  if (state.mode !== "spectate" || !state.spectatorCharacterId) return "";
  return ["temerosa-old-maid", TEMEROSA_OLD_MAID_PACK_VERSION, state.seed, "spectate", state.characters["cpu-1"], state.characters["cpu-2"], state.characters["cpu-3"], state.spectatorCharacterId].join("|");
}

function progressLabel(state: OldMaidState): string {
  if (state.status === "complete") return `${state.turn}턴 · 대국 완료`;
  if (state.status === "playing") return `${state.turn}턴 · ${Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0)}장 남음`;
  if (state.status === "revealing") return `${state.turn + 1}번째 카드 확인 중`;
  if (state.status === "discarding") return "맞은 짝 공개 중";
  if (state.status === "dealing") return "카드 배분 중";
  return "상대 선택";
}
