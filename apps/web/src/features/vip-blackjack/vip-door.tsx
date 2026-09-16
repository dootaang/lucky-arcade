import { useEffect, useRef, useState } from "react";
import { readVipStatus, purchaseVipMembership, subscribeVipChanges, type VipStatus } from "../../lib/vip.ts";
import { VIP_DOOR_LINES } from "./vip-door-lines.generated.ts";

/** Deliberately no VIP art, dialogue bundle, roster or economic polling import here. */
export default function VipDoor({ balance, onBalanceChange, onPlay }: { balance: number; onBalanceChange(value: number): void; onPlay(id: string): void }) {
  const [status, setStatus] = useState<VipStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [purchased, setPurchased] = useState(false); const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true, pending = false;
    const refresh = () => { if (pending || document.hidden) return; pending = true; void readVipStatus().then((next) => { if (alive) setStatus(next); }).catch(() => { if (alive) setError("회원권 기록을 읽지 못했습니다. 다시 입장해 주세요."); }).finally(() => { pending = false; }); };
    refresh(); const unsubscribe = subscribeVipChanges(refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; unsubscribe(); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  async function purchase() {
    if (busy) return; setBusy(true); setError("");
    try {
      // Clock header only; this does not request historical economic replay.
      const { casinoCurrentSecond } = await import("../../lib/casino-economy.ts");
      const result = await purchaseVipMembership(await casinoCurrentSecond());
      onBalanceChange(result.wallet.balance); setStatus(await readVipStatus()); setPurchased(true); dialog.current?.close(); trigger.current?.focus();
    } catch (cause) { setError(cause instanceof Error && cause.message === "insufficient_points" ? "회원권을 구매할 포인트가 부족합니다." : "회원권 구매를 완료하지 못했습니다. 기록을 확인한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const member = Boolean(status?.membership), eligible = (status?.completedPublicWagers ?? 0) >= 20;
  return <article className="table-card vip-door" data-state={member ? "open" : eligible ? "purchasable" : "locked"} aria-busy={!status || busy}>
    <div><h3 className="ca-serif">위층 · VIP 룸</h3><p className="vip-door-line">{member && !purchased ? "박니은의 블랙잭 테이블" : VIP_DOOR_LINES.find((line) => line.event === (purchased ? "door-purchase" : "door-locked"))?.text}</p></div>
    <div><p>{member ? "영구 회원권 보유" : status ? `공개 유료 테이블 완주 ${Math.min(20, status.completedPublicWagers)}/20` : "입장 기록 확인 중…"}</p>{!member && <p>회원권 1,000 P · 일회성 구매</p>}
      {member ? <button onClick={() => onPlay("temerosa-vip-blackjack")}>입장</button> : <button ref={trigger} disabled={!eligible || balance < 1000 || busy} onClick={() => dialog.current?.showModal()}>{eligible && balance < 1000 ? "포인트 부족" : "회원권 구매 · 1,000 P"}</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    <dialog ref={dialog} className="vip-purchase-dialog" aria-labelledby="vip-purchase-title" onClose={() => trigger.current?.focus()}>
      <h2 id="vip-purchase-title">VIP 회원권을 구매할까요?</h2><p>1,000 P가 차감됩니다. 영구 회원권이며 구매 후 환불되지 않습니다.</p><button disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button disabled={busy} onClick={() => void purchase()}>{busy ? "구매 중…" : "1,000 P로 구매"}</button>{error && <p role="alert">{error}</p>}
    </dialog>
  </article>;
}
