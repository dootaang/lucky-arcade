import type { CasinoCardAction, CasinoCardState } from "@lucky-arcade/casino-cards";
import type { VipCompTier, VipStake, VipStatus } from "../../lib/vip.ts";

export interface VipTableSnapshot { state: CasinoCardState; balance: number; status: VipStatus; }
export interface VipTableSession {
  load(): Promise<VipTableSnapshot>;
  markFirstEntry(): Promise<boolean>;
  start(previous: CasinoCardState, stake: VipStake, seed: string): Promise<{ state: CasinoCardState; balance: number }>;
  persist(previous: CasinoCardState, next: CasinoCardState, action: CasinoCardAction): Promise<void>;
  settle(state: CasinoCardState): Promise<{ balance: number; status: VipStatus }>;
  acknowledgeComp(tier: VipCompTier): Promise<VipStatus>;
}
