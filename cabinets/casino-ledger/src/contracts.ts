export interface CasinoClock {
  utcMinute(): number;
}

export interface CasinoPresentationClock extends CasinoClock {
  utcSecond(): number;
}

export type CasinoTableId =
  | "temerosa-old-maid"
  | "temerosa-match-pairs"
  | "temerosa-slot"
  | "indian-poker";

export type NpcStake = 0 | 10 | 50 | 200;

export type NpcPresencePhase = "idle" | "approaching" | "playing" | "settling" | "leaving";

export interface NpcSessionRange {
  min: number;
  max: number;
}

export interface NpcActiveWindow {
  startMinute: number;
  endMinute: number;
  weight: number;
}

export interface NpcTableWeight {
  tableId: CasinoTableId;
  weight: number;
}

export interface NpcGamblingProfile {
  id: string;
  name: string;
  target: number;
  volatility: number;
  reversion: number;
  sessionsPerDay: NpcSessionRange;
  tables: readonly NpcTableWeight[];
  activeHours: readonly NpcActiveWindow[];
}

export interface NpcSession {
  minuteOfDay: number;
  tableId: CasinoTableId;
  stake: NpcStake;
  reservedAmount: number;
  creditAmount: number;
  delta: number;
  resultKind: string;
  termsVersion: string;
}

export interface NpcLedgerContract {
  version: "npc-ledger/0.2";
  epochUtcDay: number;
  profiles: readonly NpcGamblingProfile[];
}

export interface NpcBalanceSnapshot {
  balance: number;
  today: readonly NpcSession[];
  dayIndex: number;
}

export interface NpcActivity {
  npcId: string;
  utcMinute: number;
  session: NpcSession;
}

export interface NpcPresence {
  npcId: string;
  phase: NpcPresencePhase;
  tableId?: CasinoTableId;
  session?: NpcSession;
  startedAtUtcSecond?: number;
  settlesAtUtcSecond?: number;
  availableAtUtcSecond?: number;
}

export interface NpcPresenceInterval {
  npcId: string;
  tableId: CasinoTableId;
  session: NpcSession;
  startedAtUtcSecond: number;
  settlesAtUtcSecond: number;
  availableAtUtcSecond: number;
}

export interface NpcAvailability {
  npcId: string;
  available: boolean;
  phase: NpcPresencePhase;
  tableId?: CasinoTableId;
  availableAtUtcSecond?: number;
}
