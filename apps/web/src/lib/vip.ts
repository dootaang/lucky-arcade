import type { WalletSnapshot } from "@lucky-arcade/persistence";

export const VIP_MEMBERSHIP_PRICE = 1_000 as const;
export const VIP_REQUIRED_PUBLIC_WAGERS = 20 as const;
export const VIP_STAKES = [200, 500, 1_000] as const;
export const VIP_FLOOR_MULTIPLE = 5 as const;
// Provisional / 오너 미확정: these thresholds await owner approval.
export const VIP_COMP_THRESHOLDS = [2_000, 6_000, 15_000, 30_000] as const;
export const PUBLIC_WAGER_CABINET_IDS = [
  "temerosa-match-pairs", "temerosa-slot", "indian-poker", "temerosa-high-low", "temerosa-five-card-draw",
] as const;
export const VIP_TERMS = {
  "temerosa-vip-blackjack": "temerosa-vip-blackjack/0.1",
} as const;
export type VipCabinetId = keyof typeof VIP_TERMS;
export type VipStake = (typeof VIP_STAKES)[number];
export type VipCompTier = 1 | 2 | 3 | 4;
export interface VipMembership {
  id: "vip:membership";
  contract: "vip-membership/0.1";
  purchasedAt: string;
  casinoOccurredAtSecond: number;
  price: typeof VIP_MEMBERSHIP_PRICE;
  transactionId: "vip:membership";
  firstEntryAt?: string;
}
export interface VipComp {
  id: "vip:comp";
  contract: "vip-comp/0.1";
  wageredTotal: number;
  tierReached: 0 | VipCompTier;
  pendingTiers: VipCompTier[];
  acknowledgedTiers: VipCompTier[];
  updatedAt: string;
}
export interface VipStatus {
  membership: VipMembership | null;
  comp: VipComp;
  completedPublicWagers: number;
  /** Net winning settlements / completed public wagers; 0 when there are none. */
  publicWinRate: number;
}
export interface VipMembershipPurchaseResult { wallet: WalletSnapshot; membership: VipMembership }
export interface VipFirstEntryResult { membership: VipMembership; firstEntry: boolean }

const VIP_CHANGE_CHANNEL = "lucky-arcade:vip-changes";
const vipListeners = new Set<() => void>();
let vipReceiver: BroadcastChannel | undefined;

function notifyVipListeners(): void {
  for (const listener of [...vipListeners]) {
    try { listener(); } catch { /* Observers cannot reject a committed purchase or settlement. */ }
  }
}

/** Subscribe to committed VIP status changes in this tab and other same-origin tabs. */
export function subscribeVipChanges(listener: () => void): () => void {
  const subscription = () => listener();
  vipListeners.add(subscription);
  if (!vipReceiver) {
    let receiver: BroadcastChannel | undefined;
    try {
      receiver = new BroadcastChannel(VIP_CHANGE_CHANNEL);
      receiver.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === "changed") notifyVipListeners();
      };
      vipReceiver = receiver;
    } catch {
      try { receiver?.close(); } catch { /* BroadcastChannel may be unavailable. */ }
    }
  }
  return () => {
    vipListeners.delete(subscription);
    if (vipListeners.size === 0 && vipReceiver) {
      const receiver = vipReceiver;
      vipReceiver = undefined;
      try { receiver.onmessage = null; receiver.close(); } catch { /* Best-effort cleanup. */ }
    }
  };
}

/** Internal commit hook: call only after the IndexedDB transaction completes. */
export function emitVipChange(): void {
  let sender: BroadcastChannel | undefined;
  try {
    sender = vipReceiver ?? new BroadcastChannel(VIP_CHANGE_CHANNEL);
    sender.postMessage("changed");
  } catch { /* Cross-tab delivery must never reject a successful economic commit. */ }
  finally {
    if (sender && sender !== vipReceiver) {
      try { sender.close(); } catch { /* Short-lived senders retain no resources. */ }
    }
  }
  notifyVipListeners();
}

export function isVipCabinet(cabinetId: string): cabinetId is VipCabinetId {
  return Object.hasOwn(VIP_TERMS, cabinetId);
}
export function isVipStake(stake: number): stake is VipStake {
  return VIP_STAKES.some((value) => value === stake);
}
export function canAffordVipStake(balance: number, stake: number): boolean {
  return isVipStake(stake) && Number.isSafeInteger(balance) && balance >= stake * VIP_FLOOR_MULTIPLE;
}
export function vipCompTier(wageredTotal: number): 0 | VipCompTier {
  return VIP_COMP_THRESHOLDS.filter((threshold) => wageredTotal >= threshold).length as 0 | VipCompTier;
}
export function readVipStatus(): Promise<VipStatus> {
  return import("./database.ts").then((database) => database.readVipStatus());
}
export function readVipRecoveryWagers(sessionId: string, currentWagerId: string | null) {
  return import("./database.ts").then((database) => database.readVipRecoveryWagers(sessionId, currentWagerId));
}
export function purchaseVipMembership(casinoOccurredAtSecond: number): Promise<VipMembershipPurchaseResult> {
  return import("./database.ts").then((database) => database.purchaseVipMembership(casinoOccurredAtSecond));
}
export function markVipFirstEntry(): Promise<VipFirstEntryResult> {
  return import("./database.ts").then((database) => database.markVipFirstEntry());
}
/** Acknowledge only after presenting the tier event; unacknowledged events survive reloads. */
export function acknowledgeVipComp(tier: VipCompTier): Promise<VipComp> {
  return import("./database.ts").then((database) => database.acknowledgeVipComp(tier));
}
