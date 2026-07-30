import { TemerosaExpeditionScreen } from "@lucky-arcade/temerosa-expedition/react";
import { createTemerosaExpeditionRun, reduceTemerosaExpeditionRun, TEMEROSA_EXPEDITION_VERSION, type TemerosaExpeditionAction, type TemerosaExpeditionContentPack, type TemerosaExpeditionRunState } from "@lucky-arcade/temerosa-expedition";
import { makeReceipt, resultHash } from "@lucky-arcade/engine";
import { useEffect, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { loadTemerosaContentBundle } from "../../lib/built-in-content.ts";
import { recoverSession } from "../../lib/session-recovery.ts";

const SESSION = "temerosa-pequod-expedition:current";

export default function TemerosaPequodExpeditionView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ pack: TemerosaExpeditionContentPack; state: TemerosaExpeditionRunState | null } | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTemerosaContentBundle().then(async (bundle) => {
      const pack = bundle.expedition;
      const recovered = await recoverSession<TemerosaExpeditionRunState, TemerosaExpeditionAction>({
        sessionId: SESSION,
        fresh: createTemerosaExpeditionRun(pack, `${new Date().toISOString().slice(0, 10)}:0`, SESSION),
        cabinetVersion: TEMEROSA_EXPEDITION_VERSION,
        packVersion: pack.version,
        isState: (value): value is TemerosaExpeditionRunState => Boolean(value && typeof value === "object" && (value as Partial<TemerosaExpeditionRunState>).version === TEMEROSA_EXPEDITION_VERSION && (value as Partial<TemerosaExpeditionRunState>).packVersion === pack.version),
        reduce: (current, action) => reduceTemerosaExpeditionRun(pack, current, action),
      });
      if (alive) setReady({ pack, state: recovered.state });
    }).catch(() => { if (alive) setError("테메로세 원정 콘텐츠를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."); });
    return () => { alive = false; };
  }, []);
  const persist = async (previous: TemerosaExpeditionRunState, next: TemerosaExpeditionRunState, action: TemerosaExpeditionAction) => {
    const receipt = makeReceipt(next.sequence, action, next.sequence, resultHash(previous), next);
    await appendAction(SESSION, receipt);
    await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: "arcade-engine/0.1", cabinetVersion: next.version, packVersion: next.packVersion }, { contract: "recent-play/0.1", cabinetId: "temerosa-pequod-expedition", sessionId: SESSION, title: "테메로세: 피쿼드 원정", progressLabel: progressLabel(next), updatedAt: new Date().toISOString() });
  };
  if (error) return <main className="game-shell"><div className="game-loading">{error}<button onClick={onExit}>돌아가기</button></div></main>;
  if (!ready) return <main className="game-shell"><div className="game-loading">피쿼드 원정 기록을 준비하고 있습니다…</div></main>;
  return <TemerosaExpeditionScreen pack={ready.pack} initialState={ready.state} onPersist={persist} onExit={onExit} />;
}

function progressLabel(state: TemerosaExpeditionRunState): string {
  if (state.phase === "formation") return "동료 선택";
  if (state.phase === "finished") return state.outcome === "victory" ? "원정 완료" : "원정 종료";
  return `${Math.min(state.depth + 1, 7)}/7 구간 · ${state.phase === "route" ? "항로 선택" : state.phase === "reward" ? "기록 회수" : state.phase === "battle-report" ? "교전 기록" : "교전 준비"}`;
}
