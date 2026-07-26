import { SLOT_MACHINE_PACK_VERSION, SLOT_MACHINE_STAKES, SLOT_MACHINE_TERMS_VERSION, SLOT_MACHINE_VERSION, createSlotMachineState, isSlotMachineState, reduceSlotMachine, slotMachineCredit, slotMachineResultHash, type SlotMachineAction, type SlotMachineStake, type SlotMachineState, type SlotMachineSymbol } from "@lucky-arcade/slot-machine";
import { SlotMachineScreen } from "@lucky-arcade/slot-machine/react";
import { makeReceipt, resultHash, ENGINE_VERSION } from "@lucky-arcade/engine";
import type { GameWagerReceipt } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { readWallet } from "../../lib/wallet.ts";

const CABINET_ID = "temerosa-slot";
const SESSION_ID = "temerosa-slot:machine-1";
const CONTENT_ROOT = `/content/temerosa-casino-slots/${SLOT_MACHINE_PACK_VERSION}`;

interface SlotPackVariant { scale: "1x" | "2x"; path: string; mime: "image/webp"; width: number; height: number; bytes: number; }
interface SlotPackAsset { id: string; use: "slot-symbol"; displayName: string; frequency: { tier: string; weight: number; evidence: string }; variants: SlotPackVariant[]; }
interface SlotPackManifest { contract: "temerosa-casino-asset-pack/1.0"; packId: "temerosa-casino-slots"; version: string; assets: SlotPackAsset[]; }
interface LoadedSlotPack { symbols: readonly SlotMachineSymbol[]; assets: Readonly<Record<string, string>>; }

export default function TemerosaSlotView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ pack: LoadedSlotPack; state: SlotMachineState } | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stateRef = useRef<SlotMachineState | null>(null);
  const symbolsRef = useRef<readonly SlotMachineSymbol[]>([]);

  useEffect(() => {
    let alive = true;
    void loadSlotPack().then(async (pack) => {
      const wallet = await readWallet();
      const recovered = await recoverSession<SlotMachineState, SlotMachineAction>({
        sessionId: SESSION_ID,
        fresh: createSlotMachineState(SLOT_MACHINE_PACK_VERSION, SESSION_ID),
        cabinetVersion: SLOT_MACHINE_VERSION,
        packVersion: SLOT_MACHINE_PACK_VERSION,
        isState: isSlotMachineState,
        reduce: (state, action) => reduceSlotMachine(pack.symbols, state, action),
      });
      let state = recovered.state;
      let nextBalance = wallet.balance;
      const pending = (await listWagers(SESSION_ID)).find((wager) => wager.status === "reserved");
      if (pending && state.wagerId !== pending.wagerId) {
        const seed = spinSeedFromReceipt(pending);
        if (seed && isStake(pending.stake)) {
          const action: SlotMachineAction = { type: "spin", spinSeed: seed, stake: pending.stake, wagerId: pending.wagerId };
          const next = reduceSlotMachine(pack.symbols, state, action);
          await persistSlotTransition(state, next, action);
          state = next;
        }
      }
      if (pending && state.wagerId === pending.wagerId && state.status === "complete") {
        const settled = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: slotMachineResultHash(state), creditAmount: slotMachineCredit(state) });
        nextBalance = settled.wallet.balance;
      }
      if (!alive) return;
      symbolsRef.current = pack.symbols;
      stateRef.current = state;
      setBalance(nextBalance);
      setReady({ pack, state });
    }).catch(() => { if (alive) setError("슬롯머신을 준비하지 못했습니다."); });
    return () => { alive = false; };
  }, []);

  async function apply(action: SlotMachineAction): Promise<SlotMachineState> {
    const previous = stateRef.current;
    if (!previous) throw new Error("slot_machine_not_ready");
    const next = reduceSlotMachine(symbolsRef.current, previous, action);
    stateRef.current = next;
    setReady((current) => current ? { ...current, state: next } : current);
    await persistSlotTransition(previous, next, action);
    return next;
  }

  async function spin(stake: SlotMachineStake): Promise<void> {
    if (!ready || busy || balance < stake || ready.state.status === "spinning") return;
    setBusy(true);
    setError("");
    try {
      const spinSeed = crypto.randomUUID();
      const reserved = await reserveWager({
        outcomeKey: `${SLOT_MACHINE_TERMS_VERSION}:${spinSeed}`,
        cabinetId: CABINET_ID,
        sessionId: SESSION_ID,
        termsVersion: SLOT_MACHINE_TERMS_VERSION,
        choiceKey: `spin:${spinSeed}`,
        stake,
        reservedAmount: stake,
      });
      setBalance(reserved.wallet.balance);
      await apply({ type: "spin", spinSeed, stake, wagerId: reserved.wager.wagerId });
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "insufficient_points" ? "포인트가 부족합니다." : "회전을 시작하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function finish(): Promise<void> {
    const current = stateRef.current;
    if (!current || current.status !== "spinning" || !current.wagerId || busy) return;
    setBusy(true);
    setError("");
    let settlementComplete = false;
    try {
      const complete = await apply({ type: "finish" });
      const transaction = await settleWager({ wagerId: current.wagerId, settlementSequence: complete.sequence, resultKey: slotMachineResultHash(complete), creditAmount: slotMachineCredit(complete) });
      setBalance(transaction.wallet.balance);
      settlementComplete = true;
    } catch {
      setError("결과는 보존됐지만 포인트 정산을 마치지 못했습니다. 다시 들어오면 이어서 처리합니다.");
    } finally {
      // Keep the machine locked when settlement fails. Re-entry retries the
      // same reserved receipt instead of allowing another wager to overlap it.
      if (settlementComplete) setBusy(false);
    }
  }

  if (!ready) return <main className="game-shell"><div className="game-loading" role={error ? "alert" : undefined}>{error || "슬롯 심볼을 준비하고 있어요…"}{error && <button onClick={onExit}>카지노로 돌아가기</button>}</div></main>;
  return <SlotMachineScreen state={ready.state} symbols={ready.pack.symbols} assets={ready.pack.assets} balance={balance} busy={busy} error={error} onSpin={spin} onFinish={finish} onExit={onExit} />;
}

async function persistSlotTransition(previous: SlotMachineState, next: SlotMachineState, action: SlotMachineAction): Promise<void> {
  const receipt = makeReceipt(next.sequence, action, next.outcome?.rngPosition ?? 0, resultHash(previous), next);
  await appendAction(SESSION_ID, receipt);
  await saveSnapshot({
    contract: "snapshot-record/0.1", sessionId: SESSION_ID, sequence: next.sequence, state: next,
    stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: SLOT_MACHINE_VERSION, packVersion: SLOT_MACHINE_PACK_VERSION,
  }, {
    contract: "recent-play/0.1", cabinetId: CABINET_ID, sessionId: SESSION_ID, title: "슬롯 777",
    progressLabel: next.status === "spinning" ? "릴 회전 중" : next.status === "complete" ? `최근 결과 · ${next.outcome?.winningLineIndexes.length ?? 0}줄 적중` : "회전 준비",
    updatedAt: new Date().toISOString(),
  });
}

async function loadSlotPack(): Promise<LoadedSlotPack> {
  const response = await fetch(`${CONTENT_ROOT}/manifest.json`);
  if (!response.ok) throw new Error("slot_pack_missing");
  const manifest = await response.json() as SlotPackManifest;
  if (manifest.contract !== "temerosa-casino-asset-pack/1.0" || manifest.packId !== "temerosa-casino-slots" || manifest.version !== SLOT_MACHINE_PACK_VERSION || manifest.assets.length !== 16) throw new Error("slot_pack_invalid");
  const ids = new Set<string>();
  const assets: Record<string, string> = {};
  const symbols = manifest.assets.map((asset): SlotMachineSymbol => {
    const variant = asset.variants.find((candidate) => candidate.scale === "2x") ?? asset.variants[0];
    if (!variant || asset.use !== "slot-symbol" || !asset.id || !asset.displayName || asset.frequency.weight !== 1 || ids.has(asset.id)) throw new Error("slot_symbol_invalid");
    ids.add(asset.id);
    assets[asset.id] = `${CONTENT_ROOT}/${variant.path}`;
    return { id: asset.id, label: asset.displayName, weight: 1 };
  });
  await Promise.all(Object.values(assets).map(preloadImage));
  return { symbols: Object.freeze(symbols), assets: Object.freeze(assets) };
}

function preloadImage(src: string): Promise<void> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image.decode();
}

function spinSeedFromReceipt(receipt: GameWagerReceipt): string | null { return receipt.choiceKey?.startsWith("spin:") ? receipt.choiceKey.slice(5) || null : null; }
function isStake(value: number): value is SlotMachineStake { return (SLOT_MACHINE_STAKES as readonly number[]).includes(value); }
