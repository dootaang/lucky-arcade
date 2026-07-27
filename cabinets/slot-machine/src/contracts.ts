export const SLOT_MACHINE_VERSION = "slot-machine/0.2" as const;
export const SLOT_MACHINE_STATE_CONTRACT = "slot-machine-state/0.2" as const;
export const SLOT_MACHINE_TERMS_VERSION = "temerosa-slot-paytable/0.3" as const;
export const SLOT_MACHINE_PACK_VERSION = "0.2.0" as const;
export const SLOT_MACHINE_STAKES = [10, 50, 200] as const;
export const SLOT_MACHINE_LINE_MULTIPLIER = 6;

export type SlotMachineStatus = "ready" | "spinning" | "complete";
export type SlotMachineStake = (typeof SLOT_MACHINE_STAKES)[number];

export interface SlotMachineSymbol {
  id: string;
  label: string;
  weight: 1;
}

export type SlotMachineSeries = "overture" | "root2" | "bestiaization" | "finale";

/** A character is the payout symbol; these are deterministic visual variants only. */
export interface SlotMachineVisualVariant {
  id: string;
  symbolId: string;
  label: string;
  expression: string;
  appearanceSet: string;
  series: SlotMachineSeries;
  src: string;
  previewSrc: string;
}

export interface SlotMachineOutcome {
  activeSymbolIds: readonly string[];
  grid: readonly string[];
  winningLineIndexes: readonly number[];
  payoutMultiplier: number;
  rngPosition: number;
}

export type SlotMachineAction =
  | { type: "spin"; spinSeed: string; stake: SlotMachineStake; wagerId: string }
  | { type: "finish" };

export interface SlotMachineState {
  contract: typeof SLOT_MACHINE_STATE_CONTRACT;
  version: typeof SLOT_MACHINE_VERSION;
  packVersion: string;
  sessionId: string;
  sequence: number;
  status: SlotMachineStatus;
  spinNumber: number;
  spinSeed: string | null;
  stake: SlotMachineStake | null;
  wagerId: string | null;
  outcome: SlotMachineOutcome | null;
}

export const SLOT_MACHINE_PAYLINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [6, 4, 2],
] as const;

export const SLOT_MACHINE_ERRORS = {
  symbolsInvalid: "slot_machine_symbols_invalid",
  packVersionInvalid: "slot_machine_pack_version_invalid",
  sessionInvalid: "slot_machine_session_invalid",
  spinInvalid: "slot_machine_spin_invalid",
  finishInvalid: "slot_machine_finish_invalid",
  actionInvalid: "slot_machine_action_invalid",
} as const;

export function isSlotMachineState(value: unknown): value is SlotMachineState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SlotMachineState>;
  if (state.contract !== SLOT_MACHINE_STATE_CONTRACT || state.version !== SLOT_MACHINE_VERSION) return false;
  if (typeof state.packVersion !== "string" || typeof state.sessionId !== "string") return false;
  if (!Number.isInteger(state.sequence) || !Number.isInteger(state.spinNumber)) return false;
  if (!state.status || !["ready", "spinning", "complete"].includes(state.status)) return false;
  if (state.spinSeed !== null && typeof state.spinSeed !== "string") return false;
  if (state.wagerId !== null && typeof state.wagerId !== "string") return false;
  if (state.stake !== null && (typeof state.stake !== "number" || !(SLOT_MACHINE_STAKES as readonly number[]).includes(state.stake))) return false;
  if (state.outcome !== null && !isOutcome(state.outcome)) return false;
  if (state.status === "ready") return state.spinSeed === null && state.stake === null && state.wagerId === null && state.outcome === null;
  return Boolean(state.spinSeed && state.stake && state.wagerId && state.outcome);
}

function isOutcome(value: unknown): value is SlotMachineOutcome {
  if (!value || typeof value !== "object") return false;
  const outcome = value as Partial<SlotMachineOutcome>;
  return Array.isArray(outcome.activeSymbolIds) && outcome.activeSymbolIds.length === 6
    && outcome.activeSymbolIds.every((id) => typeof id === "string")
    && Array.isArray(outcome.grid) && outcome.grid.length === 9 && outcome.grid.every((id) => typeof id === "string")
    && Array.isArray(outcome.winningLineIndexes) && outcome.winningLineIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < SLOT_MACHINE_PAYLINES.length)
    && Number.isInteger(outcome.payoutMultiplier) && (outcome.payoutMultiplier ?? -1) >= 0
    && Number.isInteger(outcome.rngPosition) && (outcome.rngPosition ?? -1) >= 0;
}
