import { SLOT_MACHINE_PACK_VERSION, SLOT_MACHINE_STAKES, SLOT_MACHINE_TERMS_VERSION, SLOT_MACHINE_VERSION, createSlotMachineOutcome, createSlotMachineState, isSlotMachineState, reduceSlotMachine, selectSlotMachineVisualVariant, slotMachineCredit, slotMachineResultHash, type SlotMachineAction, type SlotMachineSeries, type SlotMachineStake, type SlotMachineState, type SlotMachineSymbol, type SlotMachineVisualVariant } from "@lucky-arcade/slot-machine";
import { SlotMachineScreen } from "@lucky-arcade/slot-machine/react";
import { ENGINE_VERSION, leveragedWagerCredit, makeReceipt, resultHash, wagerExposure, wagerMultiplierFromExposure, type WagerMultiplier } from "@lucky-arcade/engine";
import type { GameWagerReceipt } from "@lucky-arcade/persistence";
import { useEffect, useRef, useState } from "react";
import { TEMEROSA_HOUSE_ACCOUNT_ID } from "@lucky-arcade/casino-ledger";
import { casinoCounterpartyContext } from "../../lib/casino-economy.ts";
import { appendAction, saveSnapshot } from "../../lib/database.ts";
import { invalidateWager, listWagers, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { loadTemerosaCasinoAssets, type TemerosaCasinoAssetBundle } from "../../lib/temerosa-content.ts";
import { readWallet } from "../../lib/wallet.ts";

const CABINET_ID = "temerosa-slot";
const SESSION_ID = "temerosa-slot:machine-2";
const SLOT_SERIES = new Set<SlotMachineSeries>(["overture", "root2", "bestiaization", "finale"]);
const SLOT_EXCLUDED_CHARACTERS = new Set(["bacikal"]);

interface LoadedSlotPack { symbols: readonly SlotMachineSymbol[]; variants: readonly SlotMachineVisualVariant[]; }

export default function TemerosaSlotView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<{ pack: LoadedSlotPack; state: SlotMachineState; multiplier: WagerMultiplier } | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stateRef = useRef<SlotMachineState | null>(null);
  const symbolsRef = useRef<readonly SlotMachineSymbol[]>([]);

  useEffect(() => {
    let alive = true;
    void loadSlotPack().then(async (pack) => {
      const allWagers = await listWagers();
      for (const wager of allWagers) {
        if (wager.cabinetId === CABINET_ID && wager.status === "reserved" && (wager.sessionId !== SESSION_ID || wager.termsVersion !== SLOT_MACHINE_TERMS_VERSION)) {
          await invalidateWager({ wagerId: wager.wagerId, reason: "version-mismatch" });
        }
      }
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
      const reserved = (await listWagers(SESSION_ID)).filter((wager) => wager.status === "reserved");
      const pending = reserved.find((wager) => wager.termsVersion === SLOT_MACHINE_TERMS_VERSION && validReceipt(wager));
      for (const wager of reserved) if (wager !== pending) {
        const transaction = await invalidateWager({ wagerId: wager.wagerId, reason: wager.termsVersion === SLOT_MACHINE_TERMS_VERSION ? "corrupt-state" : "version-mismatch" });
        nextBalance = transaction.wallet.balance;
      }
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
        const settled = await settleWager({ wagerId: pending.wagerId, settlementSequence: state.sequence, resultKey: slotMachineResultHash(state), creditAmount: leveragedCredit(state, pending) });
        nextBalance = settled.wallet.balance;
      }
      if (!alive) return;
      symbolsRef.current = pack.symbols;
      stateRef.current = state;
      setBalance(nextBalance);
      const activeReceipt = pending ?? (state.wagerId ? allWagers.find((receipt) => receipt.wagerId === state.wagerId) : undefined);
      setReady({ pack, state, multiplier: activeReceipt && validReceipt(activeReceipt) ? wagerMultiplierFromExposure(activeReceipt.stake, activeReceipt.reservedAmount) : 2 });
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

  async function spin(stake: SlotMachineStake, multiplier: WagerMultiplier): Promise<void> {
    if (!ready || busy || balance < wagerExposure(stake, multiplier) || ready.state.status === "spinning") return;
    setBusy(true);
    setError("");
    try {
      const spinSeed = crypto.randomUUID();
      const reservedAmount = wagerExposure(stake, multiplier);
      const maximumCredit = leveragedWagerCredit(stake, stake * 30, multiplier);
      const counterparty = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID);
      const reserved = await reserveWager({
        outcomeKey: `${SLOT_MACHINE_TERMS_VERSION}:${spinSeed}`,
        cabinetId: CABINET_ID,
        sessionId: SESSION_ID,
        termsVersion: SLOT_MACHINE_TERMS_VERSION,
        choiceKey: `spin:${spinSeed}`,
        stake,
        reservedAmount,
        ...counterparty,
        counterpartyReservedAmount: maximumCredit - reservedAmount,
      });
      setBalance(reserved.wallet.balance);
      setReady((current) => current ? { ...current, multiplier } : current);
      const outcome = createSlotMachineOutcome(ready.pack.symbols, SLOT_MACHINE_PACK_VERSION, spinSeed);
      const sources = outcome.activeSymbolIds.map((symbolId) => selectSlotMachineVisualVariant(ready.pack.variants, symbolId, spinSeed).src);
      await Promise.allSettled([...new Set(sources)].map(preloadImage));
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
      const receipt = (await listWagers(SESSION_ID)).find((candidate) => candidate.wagerId === current.wagerId);
      if (!receipt) throw new Error("slot_wager_receipt_missing");
      const transaction = await settleWager({ wagerId: current.wagerId, settlementSequence: complete.sequence, resultKey: slotMachineResultHash(complete), creditAmount: leveragedCredit(complete, receipt) });
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
  return <SlotMachineScreen state={ready.state} symbols={ready.pack.symbols} variants={ready.pack.variants} balance={balance} busy={busy} error={error} initialMultiplier={ready.multiplier} onSpin={spin} onFinish={finish} onExit={onExit} />;
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
  return buildSlotPack(await loadTemerosaCasinoAssets());
}

export function buildSlotPack(bundle: TemerosaCasinoAssetBundle): LoadedSlotPack {
  const ids = new Set<string>();
  const variants: SlotMachineVisualVariant[] = [];
  for (const asset of bundle.allContentAssets) {
    if (!asset.characterId || !asset.expression || !asset.appearanceSet || ids.has(asset.id) || SLOT_EXCLUDED_CHARACTERS.has(asset.characterId)) continue;
    const series = asset.appearanceSet.split("/")[1] as SlotMachineSeries | undefined;
    const src = bundle.assets[asset.id];
    const previewSrc = bundle.thumbAssets[asset.id] ?? src;
    if (!series || !SLOT_SERIES.has(series) || !src || !previewSrc) continue;
    ids.add(asset.id);
    variants.push({
      id: asset.id,
      symbolId: asset.characterId,
      label: `${characterName(asset.characterId)} · ${expressionName(asset.expression)}`,
      expression: asset.expression,
      appearanceSet: asset.appearanceSet,
      series,
      src,
      previewSrc,
    });
  }
  const symbols = [...new Set(variants.map((variant) => variant.symbolId))].sort().map((id): SlotMachineSymbol => ({ id, label: characterName(id), weight: 1 }));
  if (symbols.length < 12 || symbols.length > 64 || variants.length < symbols.length * 2) throw new Error("slot_portrait_pack_invalid");
  return { symbols: Object.freeze(symbols), variants: Object.freeze(variants.sort((left, right) => left.id.localeCompare(right.id))) };
}

function preloadImage(src: string): Promise<void> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image.decode();
}

function characterName(characterId: string): string {
  const names: Readonly<Record<string, string>> = {
    adesha: "아데샤", alger: "알제", anna: "안나 나자레아", apollyon: "아폴리온", bche: "브체", camille: "카미유", cicero: "키케로",
    cradle: "크레이들", deokbae: "김덕배", diamo: "디아모", echo: "에코", esther: "에스더", flask: "플라스크", hiro: "히로", kano: "카노",
    katrinka: "카트린카", kreva: "크레바", levillotte: "레빌로트", lilim: "릴림", lyla: "라일라", machina: "마키나", morsisa: "모르시사",
    nieun: "박니은", nostalgia: "노스탤지아", pale: "페일", phaeo: "폐어", raven: "레이븐", riel: "리엘", sakabus: "사카부스",
    "snow-rim": "스노우 림", spiril: "스피릴", strelka: "스트렐카", temute: "테뮤테", traver: "트레버", ttaengchil: "땡칠이",
    "tumit-tu": "튜밋튜", wares: "워어즈", yul: "율",
  };
  return names[characterId] ?? characterId;
}
function expressionName(expression: string): string {
  return ({ neutral: "무표정", pleased: "미소", tense: "긴장", despair: "절망", blush: "홍조", surprised: "놀람", standing: "기본", smile: "미소", sad: "슬픔", angry: "분노", smirk: "미소", disappointed: "실망" } as Readonly<Record<string, string>>)[expression] ?? expression;
}

function spinSeedFromReceipt(receipt: GameWagerReceipt): string | null { return receipt.choiceKey?.startsWith("spin:") ? receipt.choiceKey.slice(5) || null : null; }
function isStake(value: number): value is SlotMachineStake { return (SLOT_MACHINE_STAKES as readonly number[]).includes(value); }
function validReceipt(receipt: GameWagerReceipt): boolean { try { wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount); return isStake(receipt.stake); } catch { return false; } }
function leveragedCredit(state: SlotMachineState, receipt: GameWagerReceipt): number { return leveragedWagerCredit(state.stake ?? receipt.stake, slotMachineCredit(state), wagerMultiplierFromExposure(receipt.stake, receipt.reservedAmount)); }
