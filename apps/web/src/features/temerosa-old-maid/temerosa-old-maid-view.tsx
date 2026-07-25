import { OLD_MAID_VERSION, TEMEROSA_OLD_MAID_PACK_VERSION, temerosaOldMaidCartridge, type OldMaidAction, type OldMaidState } from "@lucky-arcade/old-maid";
import { OldMaidScreen } from "@lucky-arcade/old-maid/react";
import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import { useEffect, useState } from "react";
import { appendAction, loadSnapshot, saveSnapshot } from "../../lib/database.ts";
import { loadTemerosaPilotAssets } from "../../lib/temerosa-content.ts";

const SESSION = "temerosa-old-maid:table-1";

export default function TemerosaOldMaidView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ assets: Readonly<Record<string, string>>; state: OldMaidState | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaPilotAssets(), loadSnapshot<OldMaidState>(SESSION)]).then(([assets, snapshot]) => {
      if (!alive) return;
      const saved = snapshot?.state;
      const state = saved?.version === OLD_MAID_VERSION && saved.packVersion === TEMEROSA_OLD_MAID_PACK_VERSION ? saved : null;
      setReady({ assets, state });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

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
  }

  if (error) return <main className="game-shell"><div className="game-loading">도둑잡기 카드를 불러오지 못했습니다.<button onClick={() => window.location.reload()}>다시 불러오기</button><button onClick={onExit}>오락실로 돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">도둑잡기 카드와 캐릭터 표정을 불러오고 있습니다…</div></main>;
  return <OldMaidScreen cartridge={temerosaOldMaidCartridge} assets={ready.assets} initialState={ready.state} onPersist={persist} onExit={onExit} />;
}

function progressLabel(state: OldMaidState): string {
  if (state.status === "complete") return `${state.turn}턴 · 대국 완료`;
  if (state.status === "playing") return `${state.turn}턴 · ${Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0)}장 남음`;
  if (state.status === "revealing") return `${state.turn + 1}번째 카드 확인 중`;
  if (state.status === "discarding") return "맞은 짝 공개 중";
  if (state.status === "dealing") return "19장 배분 중";
  return "19장 배분 준비";
}
