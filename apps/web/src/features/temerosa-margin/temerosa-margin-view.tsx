import { createTemerosaRun, reduceTemerosaRun, temerosaStoryContent, TEMEROSA_MARGIN_VERSION, TEMEROSA_PACK_VERSION, type TemerosaAction, type TemerosaRunState } from "@lucky-arcade/temerosa-margin";
import { TemerosaMarginScreen } from "@lucky-arcade/temerosa-margin/react";
import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import { useEffect, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaPilotAssets } from "../../lib/temerosa-content.ts";

const SESSION = "temerosa-margin:pilot";

export default function TemerosaMarginView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ assets: Readonly<Record<string, string>>; state: TemerosaRunState | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadTemerosaPilotAssets(), recoverSession<TemerosaRunState, TemerosaAction>({
      sessionId: SESSION,
      fresh: createTemerosaRun(temerosaStoryContent, new Date().toISOString().slice(0, 10), SESSION),
      cabinetVersion: TEMEROSA_MARGIN_VERSION,
      packVersion: TEMEROSA_PACK_VERSION,
      isState: (value): value is TemerosaRunState => Boolean(value && typeof value === "object" && (value as Partial<TemerosaRunState>).version === TEMEROSA_MARGIN_VERSION && (value as Partial<TemerosaRunState>).packVersion === TEMEROSA_PACK_VERSION),
      reduce: (state, action) => reduceTemerosaRun(temerosaStoryContent, state, action),
    })]).then(([assets, recovered]) => {
      if (!alive) return;
      setReady({ assets, state: recovered.state });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  async function persist(previous: TemerosaRunState, next: TemerosaRunState, action: TemerosaAction) {
    const receipt = makeReceipt(next.sequence, action, next.sequence, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: "arcade-engine/0.1", cabinetVersion: TEMEROSA_MARGIN_VERSION, packVersion: TEMEROSA_PACK_VERSION }, { contract: "recent-play/0.1", cabinetId: "temerosa-margin", sessionId: SESSION, title: "테메로세: 여백 — 첫 항로", progressLabel: progressLabel(next), updatedAt: new Date().toISOString() });
  }

  if (error) return <main className="game-shell"><div className="game-loading">테메로세 콘텐츠를 불러오지 못했습니다.<button onClick={() => window.location.reload()}>다시 불러오기</button><button onClick={onExit}>오락실로 돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">죽은 단말기의 전원을 복구하고 있습니다…</div></main>;
  return <TemerosaMarginScreen assets={ready.assets} initialState={ready.state} onPersist={persist} onExit={onExit} />;
}

function progressLabel(state: TemerosaRunState): string {
  if (state.nodeId === "pilot-complete") return "첫 편성 완료";
  if (state.nodeId.includes("companion") || state.nodeId.includes("pact") || state.nodeId.includes("departure") || state.nodeId.includes("nemo") || state.nodeId.includes("pale-boundary")) return "함께 갈 두 사람";
  if (state.nodeId.includes("alger") || state.nodeId.includes("registration")) return "마지막 인사부";
  return "죽은 단말기";
}
