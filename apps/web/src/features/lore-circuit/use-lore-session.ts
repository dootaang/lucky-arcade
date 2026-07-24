import type { LoreCircuitCartridge } from "@lucky-arcade/contracts";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import { LORE_CIRCUIT_VERSION, createLoreCircuitState, migrateLoreCircuit, reduceLoreCircuit, type LoreCircuitAction, type LoreCircuitState } from "@lucky-arcade/lore-circuit";
import { useCallback, useEffect, useRef, useState } from "react";
import { appendAction, listActionsAfter, loadSnapshot, saveSnapshot } from "../../lib/database.ts";

interface Runtime { state: LoreCircuitState; sequence: number; }

export function useLoreSession(cartridge: LoreCircuitCartridge) {
  const [runtime, setRuntime] = useState<Runtime | null>(null), [busy, setBusy] = useState(false);
  const runtimeRef = useRef<Runtime | null>(null), queue = useRef(Promise.resolve());
  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);
  useEffect(() => {
    let alive = true;
    void restore(cartridge).then((value) => { if (alive) { runtimeRef.current = value; setRuntime(value); } });
    return () => { alive = false; };
  }, [cartridge]);
  useEffect(() => {
    if (!runtime) return;
    const timer = window.setTimeout(() => void saveSnapshot(
      { contract: "snapshot-record/0.1", sessionId: runtime.state.sessionId, sequence: runtime.sequence, state: runtime.state, stateHash: resultHash(runtime.state), engineVersion: ENGINE_VERSION, cabinetVersion: LORE_CIRCUIT_VERSION },
      { contract: "recent-play/0.1", cabinetId: "lore-circuit", sessionId: runtime.state.sessionId, cardFingerprint: cartridge.cardFingerprint, title: `${cartridge.cardName} · 로어 회로`, progressLabel: loreProgress(runtime.state), updatedAt: new Date().toISOString() },
    ), 750);
    return () => window.clearTimeout(timer);
  }, [cartridge.cardName, runtime]);

  const dispatch = useCallback((action: LoreCircuitAction) => {
    setBusy(true);
    queue.current = queue.current.then(async () => {
      const current = runtimeRef.current;
      if (!current) return;
      const nextState = reduceLoreCircuit(current.state, action, cartridge);
      if (nextState === current.state) return;
      const sequence = current.sequence + 1;
      const receipt = makeReceipt(sequence, action, 0, resultHash(current.state), nextState);
      await appendAction(current.state.sessionId, receipt);
      const next = { state: nextState, sequence };
      runtimeRef.current = next; setRuntime(next);
    }).finally(() => setBusy(false));
  }, [cartridge]);
  return { runtime, busy, dispatch };
}

function loreProgress(state: LoreCircuitState): string {
  if (state.status === "ready") return "발굴 준비";
  if (state.status === "won") return `${state.score}점으로 발굴 완료`;
  if (state.status === "lost") return "탐사 종료";
  return `${state.moves}번 이동 · 실수 ${state.mistakes}/3`;
}

async function restore(cartridge: LoreCircuitCartridge): Promise<Runtime> {
  const fresh = createLoreCircuitState(cartridge, new Date().toISOString().slice(0, 10));
  const snapshot = await loadSnapshot<LoreCircuitState>(fresh.sessionId);
  let state = fresh, sequence = 0;
  if (snapshot) {
    try { state = migrateLoreCircuit(snapshot.cabinetVersion, snapshot.state); sequence = snapshot.sequence; if (snapshot.stateHash !== resultHash(state)) throw new Error("snapshot_hash_mismatch"); }
    catch { state = fresh; sequence = 0; }
  }
  for (const receipt of await listActionsAfter<LoreCircuitAction>(fresh.sessionId, sequence)) {
    if (receipt.previousHash !== resultHash(state)) break;
    const next = reduceLoreCircuit(state, receipt.action, cartridge);
    if (receipt.resultHash !== resultHash(next)) break;
    state = next; sequence = receipt.sequence;
  }
  return { state, sequence };
}
