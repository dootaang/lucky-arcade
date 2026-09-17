import { createCasinoCardState, isCasinoCardState, reduceCasinoCard, type CasinoCardState } from "@lucky-arcade/casino-cards";
import { canAffordVipStake, vipCompTier, type VipCompTier, type VipStatus } from "../../lib/vip.ts";
import type { VipTableSession, VipTableSnapshot } from "./vip-table-session.ts";

export const VIP_PREVIEW_KEY = "lucky-arcade:vip-blackjack-preview:0.1";
const SESSION = "temerosa-vip-blackjack:preview";
interface PreviewData {
  contract: "vip-preview/0.1";
  state: CasinoCardState;
  balance: number;
  entered: boolean;
  wageredTotal: number;
  acknowledged: VipCompTier[];
  settledWagerId: string | null;
}
export interface VipPreviewSession extends VipTableSession { reset(): void; }
const fresh = (): PreviewData => ({ contract: "vip-preview/0.1", state: createCasinoCardState("blackjack", SESSION), balance: 10_000, entered: false, wageredTotal: 0, acknowledged: [], settledWagerId: null });

/** One tab-scoped atomic snapshot. No database, wallet, worldline or worker imports. */
export function createVipPreviewSession(storage: Pick<Storage, "getItem" | "setItem">): VipPreviewSession {
  function read(): PreviewData {
    const raw = storage.getItem(VIP_PREVIEW_KEY);
    if (!raw) return fresh();
    let value: PreviewData;
    try { value = JSON.parse(raw) as PreviewData; } catch { throw new Error("vip_preview_corrupt"); }
    if (!value || value.contract !== "vip-preview/0.1" || !isCasinoCardState(value.state) || value.state.gameId !== "blackjack" || value.state.sessionId !== SESSION || !Number.isSafeInteger(value.balance) || value.balance < 0 || !Number.isSafeInteger(value.wageredTotal) || value.wageredTotal < 0 || typeof value.entered !== "boolean" || !Array.isArray(value.acknowledged) || value.acknowledged.some((tier) => ![1, 2, 3, 4].includes(tier)) || !(value.settledWagerId === null || typeof value.settledWagerId === "string")) throw new Error("vip_preview_corrupt");
    return value;
  }
  function write(value: PreviewData) { storage.setItem(VIP_PREVIEW_KEY, JSON.stringify(value)); }
  function assertCurrent(data: PreviewData, state: CasinoCardState) {
    if (JSON.stringify(data.state) !== JSON.stringify(state)) throw new Error("vip_preview_conflict");
  }
  function snapshot(data: PreviewData): VipTableSnapshot {
    const tierReached = vipCompTier(data.wageredTotal);
    const tiers: VipCompTier[] = [1, 2, 3, 4];
    const status: VipStatus = {
      membership: { id: "vip:membership", contract: "vip-membership/0.1", purchasedAt: "preview", casinoOccurredAtSecond: 0, price: 1000, transactionId: "vip:membership", ...(data.entered ? { firstEntryAt: "preview" } : {}) },
      comp: { id: "vip:comp", contract: "vip-comp/0.1", wageredTotal: data.wageredTotal, tierReached, pendingTiers: tiers.filter((tier) => tier <= tierReached && !data.acknowledged.includes(tier)), acknowledgedTiers: [...data.acknowledged], updatedAt: "preview" },
      completedPublicWagers: 20, publicWinRate: .5,
    };
    return { state: data.state, balance: data.balance, status };
  }
  const adapter: VipPreviewSession = {
    async load() {
      const data = read();
      if (data.state.status === "complete") await adapter.settle(data.state);
      return snapshot(read());
    },
    async markFirstEntry() { const data = read(); const first = !data.entered; write({ ...data, entered: true }); return first; },
    async start(previous, stake, seed) {
      const data = read(); assertCurrent(data, previous);
      if (previous.status !== "ready") throw new Error("vip_preview_conflict");
      if (!canAffordVipStake(data.balance, stake)) throw new Error("insufficient_points");
      const state = reduceCasinoCard(previous, { type: "start", seed, stake, reservedAmount: stake, wagerId: `vip-preview:${seed}` });
      const balance = data.balance - stake;
      // Deal and debit in a single write: refresh cannot lose a reservation.
      write({ ...data, state, balance });
      return { state, balance };
    },
    async persist(previous, next, action) {
      const data = read(); assertCurrent(data, previous);
      if (action.type === "start" || JSON.stringify(reduceCasinoCard(previous, action)) !== JSON.stringify(next)) throw new Error("vip_preview_conflict");
      if (action.type === "restart" && previous.wagerId !== data.settledWagerId) throw new Error("vip_preview_conflict");
      write({ ...data, state: next });
    },
    async settle(state) {
      const data = read(); assertCurrent(data, state);
      if (state.status !== "complete" || !state.wagerId || state.stake === null) throw new Error("vip_preview_conflict");
      if (data.settledWagerId !== state.wagerId) {
        write({ ...data, balance: data.balance + state.creditAmount, wageredTotal: data.wageredTotal + state.stake, settledWagerId: state.wagerId });
      }
      return snapshot(read());
    },
    async acknowledgeComp(tier) {
      const data = read();
      if (!snapshot(data).status.comp.pendingTiers.includes(tier)) return snapshot(data).status;
      write({ ...data, acknowledged: [...data.acknowledged, tier] });
      return snapshot(read()).status;
    },
    reset() { write(fresh()); },
  };
  return adapter;
}
