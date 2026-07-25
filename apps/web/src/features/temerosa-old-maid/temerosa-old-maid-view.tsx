import { OLD_MAID_VERSION, TEMEROSA_OLD_MAID_PACK_VERSION, createOldMaidState, reduceOldMaid, temerosaOldMaidCartridge, type OldMaidAction, type OldMaidState } from "@lucky-arcade/old-maid";
import { OldMaidScreen } from "@lucky-arcade/old-maid/react";
import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import { useEffect, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaPilotAssets } from "../../lib/temerosa-content.ts";
import { loadMatchSummary, recordOldMaidCompletion, type MatchSummary } from "../../lib/match-history.ts";
import { readCollection, unlockCollectionItem } from "../../lib/collection.ts";
import { grantOldMaidCompletion, readWallet } from "../../lib/wallet.ts";
import type { CollectionSnapshot, WalletSnapshot } from "@lucky-arcade/persistence";

const SESSION = "temerosa-old-maid:table-1";
const COLLECTION = "temerosa-old-maid";

export default function TemerosaOldMaidView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ assets: Readonly<Record<string, string>>; state: OldMaidState | null } | null>(null);
  const [error, setError] = useState(false);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [collection, setCollection] = useState<CollectionSnapshot | null>(null);
  const [award, setAward] = useState<{ amount: number; rank: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaPilotAssets(), recoverSession<OldMaidState, OldMaidAction>({
      sessionId: SESSION,
      fresh: createOldMaidState(temerosaOldMaidCartridge, new Date().toISOString().slice(0, 10), SESSION),
      cabinetVersion: OLD_MAID_VERSION,
      packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
      isState: (value): value is OldMaidState => Boolean(value && typeof value === "object" && (value as Partial<OldMaidState>).version === OLD_MAID_VERSION && (value as Partial<OldMaidState>).packVersion === TEMEROSA_OLD_MAID_PACK_VERSION),
      reduce: (state, action) => reduceOldMaid(temerosaOldMaidCartridge, state, action),
    })]).then(([assets, recovered]) => {
      if (!alive) return;
      setReady({ assets, state: recovered.state });
      if (recovered.state.status === "complete") void loadMatchSummary(SESSION).then(setMatchSummary).catch(() => undefined);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { void Promise.all([readWallet(), readCollection(COLLECTION)]).then(([nextWallet, nextCollection]) => { setWallet(nextWallet); setCollection(nextCollection); }).catch(() => undefined); }, []);

  async function persist(previous: OldMaidState, next: OldMaidState, action: OldMaidAction) {
    const receipt = makeReceipt(next.sequence, action, next.turn, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    await saveSnapshot({
      contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next,
      stateHash: receipt.resultHash, engineVersion: "arcade-engine/0.1", cabinetVersion: OLD_MAID_VERSION, packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
    }, {
      contract: "recent-play/0.1", cabinetId: "temerosa-old-maid", sessionId: SESSION,
      title: "테메로세 도둑잡기", progressLabel: progressLabel(next), updatedAt: new Date().toISOString(),
    });
    if (previous.status !== "complete" && next.status === "complete") {
      void recordOldMaidCompletion(temerosaOldMaidCartridge, previous, next, {
        cabinetId: "temerosa-old-maid", sessionId: SESSION, cabinetVersion: OLD_MAID_VERSION, packVersion: TEMEROSA_OLD_MAID_PACK_VERSION,
      }).then((summary) => { if (summary) setMatchSummary(summary); }).catch(() => undefined);
      void grantOldMaidCompletion(previous, next, "temerosa-old-maid").then((result) => { if (result) { setWallet(result.wallet); setAward({ amount: result.amount, rank: result.rank }); } }).catch(() => undefined);
    }
  }

  if (error) return <main className="game-shell"><div className="game-loading">도둑잡기 카드를 불러오지 못했습니다.<button onClick={() => window.location.reload()}>다시 불러오기</button><button onClick={onExit}>오락실로 돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">도둑잡기 카드와 캐릭터 표정을 불러오고 있습니다…</div></main>;
  const economy = wallet && collection ? { balance: wallet.balance, award, unlockedFaceIds: collection.unlockedFaceIds, onUnlock: async () => { const result = await unlockCollectionItem(COLLECTION, temerosaOldMaidCartridge.faces.map((face) => face.id)); setWallet(result.wallet); setCollection(result.collection); } } : undefined;
  return <OldMaidScreen cartridge={temerosaOldMaidCartridge} assets={ready.assets} initialState={ready.state} matchSummary={matchSummary} {...(economy ? { economy } : {})} onPersist={persist} onExit={onExit} />;
}

function progressLabel(state: OldMaidState): string {
  if (state.status === "complete") return `${state.turn}턴 · 대국 완료`;
  if (state.status === "playing") return `${state.turn}턴 · ${Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0)}장 남음`;
  if (state.status === "revealing") return `${state.turn + 1}번째 카드 확인 중`;
  if (state.status === "discarding") return "맞은 짝 공개 중";
  if (state.status === "dealing") return "카드 배분 중";
  return "상대 선택";
}
