import { useEffect, useRef, useState } from "react";
import { CASINO_CARD_PACK_VERSION, CASINO_CARDS_VERSION, blackjackValue, casinoCardResultHash, createCasinoCardState, isCasinoCardState, reduceCasinoCard, type CasinoCardAction, type CasinoCardState } from "@lucky-arcade/casino-cards";
import { ENGINE_VERSION, makeReceipt, resultHash } from "@lucky-arcade/engine";
import { TEMEROSA_HOUSE_ACCOUNT_ID } from "@lucky-arcade/casino-ledger";
import { StandardPlayingCard, PlayingCardBack, type CourtAtlas, type StandardPlayingCardId } from "@lucky-arcade/ui/playing-card";
import { appendAction, appendMatchRecord, saveSnapshot } from "../../lib/database.ts";
import { casinoCounterpartyContext } from "../../lib/casino-economy.ts";
import { invalidateWager, reserveWager, settleWager } from "../../lib/game-wager.ts";
import { loadPlayingCardAtlas } from "../../lib/playing-card-atlas.ts";
import { recoverSession } from "../../lib/session-recovery.ts";
import { readWallet } from "../../lib/wallet.ts";
import { readVipStatus, readVipRecoveryWagers, markVipFirstEntry, acknowledgeVipComp, VIP_STAKES, isVipStake, type VipStatus, type VipStake, type VipCompTier } from "../../lib/vip.ts";
import { loadTemerosaVipAssets, selectVipArt, type VipArt, type VipArtPack, type VipExpressionGroup } from "../../lib/temerosa-vip-content.ts";
import { pickVipLine, rememberVipLine, type VipLine, type VipLineEvent, type VipSpeechMemory } from "./vip-dialogue.ts";
import { VipHostArt } from "./vip-host-art.tsx";
import "./vip-blackjack.css";

const CABINET = "temerosa-vip-blackjack", SESSION = `${CABINET}:main`, TERMS = `${CABINET}/0.1`;
interface Ready { state: CasinoCardState; atlas: CourtAtlas; pack: VipArtPack; }
const initialMemory = (): VipSpeechMemory => ({ recent: [], progressUsed: false, outcomeUsed: false });

export default function VipBlackjackView({ onExit }: { onExit(): void }) {
  const [ready, setReady] = useState<Ready | null>(null), [status, setStatus] = useState<VipStatus | null>(null);
  const [balance, setBalance] = useState(0), [stake, setStake] = useState<VipStake>(200), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [line, setLine] = useState<VipLine | null>(null), [art, setArt] = useState<VipArt | null>(null);
  const [entryBeat, setEntryBeat] = useState(0), [leaving, setLeaving] = useState(false), [locked, setLocked] = useState(false);
  const [revealing, setRevealing] = useState(false), [dealerShown, setDealerShown] = useState(2);
  const stateRef = useRef<CasinoCardState | null>(null), readyRef = useRef<Ready | null>(null), busyRef = useRef(true), alive = useRef(false);
  const memory = useRef(initialMemory()), hand = useRef(0), wins = useRef(0), losses = useRef(0);
  const artCounts = useRef<Record<string, number>>({}), currentArt = useRef<VipArt | null>(null);
  const lastInteraction = useRef(0), lineSequence = useRef(0), cancelPresentation = useRef<(() => void) | null>(null);
  const exitRef = useRef(onExit); exitRef.current = onExit;
  const operation = useRef<Promise<unknown> | null>(null);
  async function run(task: () => Promise<void>) {
    const pending = task(); operation.current = pending;
    try { await pending; } finally { if (operation.current === pending) operation.current = null; }
  }

  function changeArt(group: VipExpressionGroup) {
    const pack = readyRef.current?.pack; if (!pack) return;
    const index = artCounts.current[group] ?? 0; artCounts.current[group] = index + 1;
    const next = selectVipArt(pack, group, index, currentArt.current?.id); currentArt.current = next; setArt(next);
  }
  function speak(event: VipLineEvent, force = false) {
    if (event === "dealer-reveal") { setLine(null); return; }
    const selected = pickVipLine(event, { seed: stateRef.current?.seed || "entry", hand: hand.current, sequence: ++lineSequence.current, memory: memory.current, force });
    if (!selected) return;
    memory.current = rememberVipLine(memory.current, selected); setLine(selected);
    if (selected.group) changeArt(selected.group);
  }
  function publishState(state: CasinoCardState) { stateRef.current = state; setReady((old) => old ? { ...old, state } : old); }
  function working(value: boolean) { busyRef.current = value; setBusy(value); }
  async function pause(milliseconds: number) {
    if (!alive.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); cancelPresentation.current = null; resolve(); };
      const timer = setTimeout(finish, milliseconds); cancelPresentation.current = finish;
    });
  }

  useEffect(() => {
    alive.current = true; let cancelled = false; let unlock: (() => void) | undefined;
    const acquisition = new AbortController();
    let acquisitionTimer: ReturnType<typeof setTimeout> | undefined;
    async function initialize() {
      try {
        const vip = await readVipStatus(); if (cancelled) return;
        if (!vip.membership) { exitRef.current(); return; }
        const [atlas, pack, wallet, recovered] = await Promise.all([
          loadPlayingCardAtlas(), loadTemerosaVipAssets(), readWallet(),
          recoverSession<CasinoCardState, CasinoCardAction>({ sessionId: SESSION, fresh: createCasinoCardState("blackjack", SESSION), cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, isState: (value): value is CasinoCardState => isCasinoCardState(value) && value.gameId === "blackjack" && value.sessionId === SESSION, reduce: reduceCasinoCard }),
        ]);
        if (cancelled) return;
        let state = recovered.state; let currentBalance = wallet.balance;
        const wagers = await readVipRecoveryWagers(SESSION, state.wagerId);
        const pending = wagers.filter((receipt) => receipt.status === "reserved");
        for (const receipt of pending) {
          if (receipt.termsVersion !== TERMS) { const refunded = await invalidateWager({ wagerId: receipt.wagerId, reason: "version-mismatch" }); currentBalance = refunded.wallet.balance; continue; }
          if (!isVipStake(receipt.stake) || receipt.reservedAmount !== receipt.stake || !receipt.choiceKey?.startsWith("deal:")) throw new Error("vip_receipt_corrupt");
          if (state.wagerId !== receipt.wagerId) {
            // A crash after reserving but before first save can replay the same opening, never reroll/refund.
            if (state.status === "playing") throw new Error("vip_recovery_conflict");
            const next = reduceCasinoCard(state, { type: "start", seed: receipt.choiceKey.slice(5), stake: receipt.stake, reservedAmount: receipt.stake, wagerId: receipt.wagerId });
            await persist(state, next, { type: "start", seed: receipt.choiceKey.slice(5), stake: receipt.stake, reservedAmount: receipt.stake, wagerId: receipt.wagerId }); state = next;
          }
          if (state.stake !== receipt.stake || state.seed !== receipt.choiceKey.slice(5)) throw new Error("vip_recovery_conflict");
        }
        if (state.status === "complete" && state.wagerId) {
          const receipt = wagers.find((value) => value.wagerId === state.wagerId);
          if (receipt?.status === "reserved" || receipt?.status === "settled") {
            const settled = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: state.creditAmount }); currentBalance = settled.wallet.balance; await recordMatch(state, settled.wager.settledAt);
          }
        }
        if (cancelled) return;
        const currentVip = await readVipStatus();
        const data = { atlas, pack, state }; readyRef.current = data; stateRef.current = state; setReady(data); setBalance(currentBalance); setStatus(currentVip);
        const entry = await markVipFirstEntry(); if (cancelled) return;
        if (entry.firstEntry) { setEntryBeat(1); speak("first-entry-L1", true); }
        else if (currentVip.comp.pendingTiers[0]) speak(`comp-${currentVip.comp.pendingTiers[0]}` as VipLineEvent, true);
        else speak(vip.completedPublicWagers < 30 ? "entry-few-records" : vip.publicWinRate >= .55 ? "entry-high-rate" : vip.publicWinRate <= .4 ? "entry-low-rate" : "entry-default", true);
        if (!currentArt.current) changeArt("sulky");
        lastInteraction.current = Date.now(); working(currentVip.comp.pendingTiers.length > 0);
      } catch (cause) { if (!cancelled) { setError(message(cause)); working(false); } }
    }
    // One interactive VIP table per origin, including another tab. Never hold an IDB transaction across play.
    if (!navigator.locks) { setError("이 브라우저에서는 안전한 다중 탭 대국 잠금을 지원하지 않습니다. 최신 브라우저로 다시 열어 주세요."); working(false); }
    else {
      // Queue briefly instead of ifAvailable: StrictMode's disposed first effect may still be releasing its lock.
      acquisitionTimer = setTimeout(() => acquisition.abort(), 1_000);
      void navigator.locks.request("temerosa:vip:blackjack:table", { signal: acquisition.signal }, async () => {
        clearTimeout(acquisitionTimer);
        if (cancelled) return;
        setLocked(false);
        const released = new Promise<void>((resolve) => { unlock = resolve; });
        await run(initialize); await released;
      }).catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof DOMException && cause.name === "AbortError") setLocked(true);
        else setError(message(cause));
        working(false);
      });
    }
    return () => {
      cancelled = true; alive.current = false; clearTimeout(acquisitionTimer); acquisition.abort(); cancelPresentation.current?.();
      // An already-started IDB write must finish before a different tab may resume the same snapshot.
      if (operation.current) void operation.current.then(() => unlock?.(), () => unlock?.()); else unlock?.();
    };
  }, []);

  useEffect(() => {
    if (!ready || busy || entryBeat || leaving) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); lastInteraction.current = Date.now(); if (!document.hidden) timer = setTimeout(() => speak("idle", true), 90_000); };
    reset(); window.addEventListener("pointerdown", reset); window.addEventListener("keydown", reset); document.addEventListener("visibilitychange", reset);
    return () => { clearTimeout(timer); window.removeEventListener("pointerdown", reset); window.removeEventListener("keydown", reset); document.removeEventListener("visibilitychange", reset); };
  }, [ready?.state.sequence, busy, entryBeat, leaving]);

  useEffect(() => {
    if (ready?.state.status === "ready" && !busy && !entryBeat && !leaving && balance < VIP_STAKES[0] * 5) {
      memory.current = { ...memory.current, outcomeUsed: false }; speak("floor-miss", true);
    }
  }, [ready?.state.sequence, balance, busy, entryBeat, leaving]);

  async function apply(action: CasinoCardAction) {
    const previous = stateRef.current!; const next = reduceCasinoCard(previous, action);
    await persist(previous, next, action); // Do not advance the UI past an unsaved action.
    if (alive.current) publishState(next); return next;
  }
  async function settle(state: CasinoCardState) {
    if (!state.wagerId) throw new Error("vip_wager_missing");
    const result = await settleWager({ wagerId: state.wagerId, settlementSequence: state.sequence, resultKey: casinoCardResultHash(state), creditAmount: state.creditAmount });
    await recordMatch(state, result.wager.settledAt); const vip = await readVipStatus(); if (!alive.current) return;
    setBalance(result.wallet.balance); setStatus(vip);
    wins.current = state.outcome === "win" ? wins.current + 1 : 0; losses.current = state.outcome === "loss" ? losses.current + 1 : 0;
    changeArt(state.outcome === "win" ? "flustered" : state.outcome === "loss" ? losses.current >= 3 ? "weary" : "smug" : "sulky");
    const comp = vip.comp.pendingTiers[0];
    if (comp) { speak(`comp-${comp}` as VipLineEvent, true); return; }
    const playerNatural = state.hands.player.length === 2 && blackjackValue(state.hands.player) === 21;
    const dealerNatural = state.hands["cpu-1"].length === 2 && blackjackValue(state.hands["cpu-1"]) === 21;
    const event: VipLineEvent = wins.current >= 5 ? "player-streak-5" : wins.current === 3 ? "player-streak-3" : losses.current === 3 ? "house-streak-3" : playerNatural && dealerNatural ? "both-natural" : playerNatural ? "player-natural" : dealerNatural ? "dealer-natural" : blackjackValue(state.hands.player) > 21 ? "player-bust" : blackjackValue(state.hands["cpu-1"]) > 21 ? "dealer-bust" : state.outcome === "win" ? "player-win" : state.outcome === "push" ? "push" : "house-win";
    speak(event); if (alive.current) working(false);
  }
  async function start() {
    if (busyRef.current || !ready || balance < stake * 5) return;
    working(true); setError(""); lastInteraction.current = Date.now();
    try {
      const counterparty = await casinoCounterpartyContext(TEMEROSA_HOUSE_ACCOUNT_ID);
      if (!alive.current) return;
      const seed = crypto.randomUUID();
      const reservation = await reserveWager({ cabinetId: CABINET, sessionId: SESSION, termsVersion: TERMS, outcomeKey: `${TERMS}:${seed}`, choiceKey: `deal:${seed}`, stake, reservedAmount: stake, ...counterparty, counterpartyReservedAmount: Math.floor(stake * 2.5) - stake });
      setBalance(reservation.wallet.balance); memory.current = { ...memory.current, progressUsed: false, outcomeUsed: false }; hand.current++;
      const next = await apply({ type: "start", seed, stake, reservedAmount: stake, wagerId: reservation.wager.wagerId });
      changeArt("sulky"); setLine(null);
      if (next.status === "complete") await settle(next); else { speak("deal"); working(false); }
    } catch (cause) { if (alive.current) { setError(message(cause)); working(false); } }
  }
  async function act(action: CasinoCardAction) {
    if (busyRef.current) return; working(true); setError(""); lastInteraction.current = Date.now();
    try {
      if (action.type === "stand") {
        speak("player-stand"); await pause(700); if (!alive.current) return;
        speak("dealer-reveal"); setDealerShown(2); setRevealing(true);
      }
      const next = await apply(action);
      if (action.type === "stand") {
        await pause(500); if (!alive.current) return;
        for (let count = 3; count <= next.hands["cpu-1"].length; count++) {
          setDealerShown(count); speak("dealer-draw"); await pause(650); if (!alive.current) return;
        }
        setRevealing(false);
      }
      if (next.status === "complete") await settle(next);
      else { if (action.type === "hit") speak("player-hit"); if (action.type === "restart") changeArt("sulky"); working(false); }
    } catch (cause) { if (alive.current) { setError(message(cause)); working(false); } }
  }
  async function dismissComp(tier: VipCompTier) {
    try {
      await acknowledgeVipComp(tier); const vip = await readVipStatus(); if (!alive.current) return; setStatus(vip);
      memory.current = { ...memory.current, outcomeUsed: false };
      const next = vip.comp.pendingTiers[0]; if (next) speak(`comp-${next}` as VipLineEvent, true); else { setLine(null); working(false); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
  }
  const pendingComp = status?.comp.pendingTiers[0];
  return <main className="vip-room">
    <header className="vip-room-header"><button onClick={() => { if (leaving || !ready) onExit(); else { setLeaving(true); speak("leave", true); changeArt("back"); } }}>아래층으로</button><h1 className="ca-serif">VIP 블랙잭</h1><strong>{balance.toLocaleString("ko-KR")} P</strong></header>
    {locked ? <p role="status">다른 탭에서 VIP 대국이 열려 있습니다. 그 탭을 닫은 뒤 다시 입장해 주세요.</p> : <div className="vip-room-layout">
      <VipHostArt art={art} />
      <section className="vip-table" aria-label="블랙잭 테이블">
        <div className="vip-speech" aria-live="polite"><strong>박니은</strong><p>{line?.text ?? ""}</p></div>
        {error && <p role="alert" className="vip-error">{error}<button onClick={() => window.location.reload()}>저장된 판 다시 불러오기</button></p>}
        {leaving ? <div><p>진행 중인 판은 그대로 저장됩니다. 나가도 판돈은 반환되지 않습니다.</p><button onClick={onExit}>카지노로 돌아가기</button><button onClick={() => { setLeaving(false); setLine(null); changeArt("sulky"); }}>계속 앉아 있기</button></div> : !ready ? <p role="status">{error ? "" : "테이블을 준비하고 있어요…"}</p> : <>
          {entryBeat > 0 && <button onClick={() => { if (entryBeat < 3) { const next = entryBeat + 1; setEntryBeat(next); speak(`first-entry-L${next}` as VipLineEvent, true); } else { setEntryBeat(0); setLine(null); } }}>{entryBeat < 3 ? "계속" : "앉기"}</button>}
          {ready.state.status === "ready" ? <section className="vip-stakes"><h2>얼마로 시작할까요?</h2><div>{VIP_STAKES.map((value) => <button key={value} aria-pressed={stake === value} disabled={busy || balance < value * 5} onClick={() => { setStake(value); speak(`seat-${value}` as VipLineEvent, true); }}><strong>{value.toLocaleString("ko-KR")} P</strong><small>잔고 { (value * 5).toLocaleString("ko-KR")} P부터</small></button>)}</div><p>선택한 판돈만 예약합니다. 일반 승리 순이익 1배, 블랙잭 1.5배, 패배 손실 1배입니다.</p><button className="vip-primary" disabled={busy || entryBeat > 0 || balance < stake * 5 || Boolean(error)} onClick={() => void run(start)}>{busy ? "하우스 잔고 확인 중…" : balance < stake * 5 ? "착석 잔고 부족" : "시작"}</button></section> : <>
            <VipHand label={ready.state.status === "complete" ? `하우스 · ${blackjackValue(revealing ? ready.state.hands["cpu-1"].slice(0, dealerShown) : ready.state.hands["cpu-1"])}점` : "하우스"} cards={revealing ? ready.state.hands["cpu-1"].slice(0, dealerShown) : ready.state.hands["cpu-1"]} atlas={ready.atlas} hidden={ready.state.status !== "complete"} />
            <div className="vip-table-rule">21</div>
            <VipHand label={`내 패 · ${blackjackValue(ready.state.hands.player)}점`} cards={ready.state.hands.player} atlas={ready.atlas} />
            <p role="status">{revealing ? "하우스의 패를 공개합니다." : ready.state.message}</p>
            {ready.state.status === "complete" && !revealing ? <div className="vip-result"><strong>{ready.state.creditAmount.toLocaleString("ko-KR")} P 반환</strong><span>순손익 {(ready.state.creditAmount - ready.state.reservedAmount).toLocaleString("ko-KR")} P</span><button disabled={busy || Boolean(error) || Boolean(pendingComp)} onClick={() => void run(() => act({ type: "restart" }))}>다시하기</button></div> : <div className="vip-actions"><button disabled={busy || Boolean(error) || entryBeat > 0} onClick={() => void run(() => act({ type: "stand" }))}>멈추기</button><button className="vip-primary" disabled={busy || Boolean(error) || entryBeat > 0} onClick={() => void run(() => act({ type: "hit" }))}>한 장 더</button></div>}
          </>}
          {pendingComp && <button onClick={() => void run(() => dismissComp(pendingComp))}>컴프 {pendingComp}단계 이야기 확인</button>}
          <details className="vip-rules"><summary>게임 룰 · 컴프</summary><p>21을 넘지 않고 하우스보다 높은 수를 만드세요. J·Q·K는 10, A는 1 또는 11입니다. 하우스는 17 이상에서 멈추며 동점은 판돈을 돌려줍니다. 매판 새 덱을 사용합니다.</p><p>컴프 누적 판돈 {status?.comp.wageredTotal.toLocaleString("ko-KR") ?? 0} P. 단계 기준은 시험 운영값이며 공개 전 확정됩니다.</p></details>
        </>}
      </section>
    </div>}
  </main>;
}

function VipHand({ label, cards, atlas, hidden = false }: { label: string; cards: readonly string[]; atlas: CourtAtlas; hidden?: boolean }) {
  return <section className="vip-hand"><h2>{label}</h2><div>{cards.map((id, index) => <div className="vip-playing-card" key={`${id}:${index}`} style={{ animationDelay: `${index * 65}ms` }}>{hidden && index > 0 ? <PlayingCardBack decorative /> : <StandardPlayingCard id={id as StandardPlayingCardId} atlas={atlas} />}</div>)}</div></section>;
}
async function persist(previous: CasinoCardState, next: CasinoCardState, action: CasinoCardAction) {
  const receipt = makeReceipt(next.sequence, action, next.cursor, resultHash(previous), next);
  await appendAction(SESSION, receipt);
  await saveSnapshot({ contract: "snapshot-record/0.1", sessionId: SESSION, sequence: next.sequence, state: next, stateHash: receipt.resultHash, engineVersion: ENGINE_VERSION, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION });
}
async function recordMatch(state: CasinoCardState, completedAt?: string) {
  if (!state.outcome || !state.wagerId) return;
  await appendMatchRecord({ contract: "match-record/0.1", recordId: `${SESSION}#${state.wagerId}`, cabinetId: CABINET, cabinetVersion: CASINO_CARDS_VERSION, packVersion: CASINO_CARD_PACK_VERSION, sessionId: SESSION, sequence: state.sequence, seed: state.seed, completedAt: completedAt ?? new Date().toISOString(), turns: Math.max(1, state.cursor - 3), standings: [
    { seatId: "player", participantId: "player", displayName: "플레이어", rank: state.outcome === "loss" ? 2 : 1, isPlayer: true },
    { seatId: "house", participantId: "nieun", displayName: "박니은", rank: state.outcome === "win" ? 2 : 1, isPlayer: false },
  ], outcome: state.outcome === "push" ? "draw" : state.outcome, resultHash: casinoCardResultHash(state) });
}
function message(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "insufficient_points" || code === "vip_floor_below_minimum") return "선택한 판돈에 필요한 잔고가 부족합니다.";
  if (code.includes("counterparty_insufficient")) return "하우스가 이번 판의 최대 당첨금을 준비하지 못했습니다. 낮은 판돈을 골라 주세요.";
  if (code.includes("corrupt") || code.includes("conflict")) return "저장된 판과 영수증이 일치하지 않습니다. 판돈은 보존되어 있으며 자동 환불하거나 새 판으로 바꾸지 않습니다.";
  return "테이블 처리를 완료하지 못했습니다. 저장된 판을 다시 불러와 주세요.";
}
