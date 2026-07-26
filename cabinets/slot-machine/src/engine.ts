import { resultHash, XorShift32 } from "@lucky-arcade/engine";
import {
  SLOT_MACHINE_ERRORS,
  SLOT_MACHINE_LINE_MULTIPLIER,
  SLOT_MACHINE_PAYLINES,
  SLOT_MACHINE_STATE_CONTRACT,
  SLOT_MACHINE_STAKES,
  SLOT_MACHINE_VERSION,
  type SlotMachineAction,
  type SlotMachineOutcome,
  type SlotMachineStake,
  type SlotMachineState,
  type SlotMachineSymbol,
} from "./contracts.ts";

const ACTIVE_SYMBOL_COUNT = 6;

export function createSlotMachineState(packVersion: string, sessionId = "temerosa-slot:machine-1"): SlotMachineState {
  assert(packVersion.length > 0, SLOT_MACHINE_ERRORS.packVersionInvalid);
  assert(sessionId.length > 0, SLOT_MACHINE_ERRORS.sessionInvalid);
  return {
    contract: SLOT_MACHINE_STATE_CONTRACT,
    version: SLOT_MACHINE_VERSION,
    packVersion,
    sessionId,
    sequence: 0,
    status: "ready",
    spinNumber: 0,
    spinSeed: null,
    stake: null,
    wagerId: null,
    outcome: null,
  };
}

export function reduceSlotMachine(symbols: readonly SlotMachineSymbol[], state: SlotMachineState, action: SlotMachineAction): SlotMachineState {
  validateSymbols(symbols);
  if (action.type === "spin") {
    assert(state.status !== "spinning", SLOT_MACHINE_ERRORS.spinInvalid);
    assert(action.spinSeed.length > 0 && action.wagerId.length > 0 && isStake(action.stake), SLOT_MACHINE_ERRORS.spinInvalid);
    return {
      ...state,
      sequence: state.sequence + 1,
      status: "spinning",
      spinNumber: state.spinNumber + 1,
      spinSeed: action.spinSeed,
      stake: action.stake,
      wagerId: action.wagerId,
      outcome: createSlotMachineOutcome(symbols, state.packVersion, action.spinSeed),
    };
  }
  if (action.type === "finish") {
    assert(state.status === "spinning" && state.outcome !== null, SLOT_MACHINE_ERRORS.finishInvalid);
    return { ...state, sequence: state.sequence + 1, status: "complete" };
  }
  throw new Error(SLOT_MACHINE_ERRORS.actionInvalid);
}

export function createSlotMachineOutcome(symbols: readonly SlotMachineSymbol[], packVersion: string, spinSeed: string): SlotMachineOutcome {
  validateSymbols(symbols);
  assert(packVersion.length > 0 && spinSeed.length > 0, SLOT_MACHINE_ERRORS.spinInvalid);
  const rng = new XorShift32(`${packVersion}:${spinSeed}:slot-grid`);
  const shuffled = shuffle([...symbols].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0), rng);
  const activeSymbolIds = shuffled.slice(0, ACTIVE_SYMBOL_COUNT).map((symbol) => symbol.id);
  const grid = Array.from({ length: 9 }, () => activeSymbolIds[rng.nextUint32() % activeSymbolIds.length] as string);
  const winningLineIndexes = SLOT_MACHINE_PAYLINES.flatMap((line, index) => {
    const first = grid[line[0]];
    return first && line.every((cell) => grid[cell] === first) ? [index] : [];
  });
  return {
    activeSymbolIds,
    grid,
    winningLineIndexes,
    payoutMultiplier: winningLineIndexes.length * SLOT_MACHINE_LINE_MULTIPLIER,
    rngPosition: rng.position,
  };
}

export function slotMachineCredit(state: SlotMachineState): number {
  if (!state.stake || !state.outcome) return 0;
  return state.stake * state.outcome.payoutMultiplier;
}

export function slotMachineResultHash(state: SlotMachineState): string { return resultHash(state); }

function validateSymbols(symbols: readonly SlotMachineSymbol[]): void {
  assert(symbols.length >= 12 && symbols.length <= 20, SLOT_MACHINE_ERRORS.symbolsInvalid);
  const ids = new Set<string>();
  for (const symbol of symbols) {
    assert(symbol.id.length > 0 && symbol.label.length > 0 && symbol.weight === 1 && !ids.has(symbol.id), SLOT_MACHINE_ERRORS.symbolsInvalid);
    ids.add(symbol.id);
  }
}

function isStake(value: number): value is SlotMachineStake { return (SLOT_MACHINE_STAKES as readonly number[]).includes(value); }

function shuffle<T>(values: T[], rng: XorShift32): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = rng.nextUint32() % (index + 1);
    [values[index], values[target]] = [values[target] as T, values[index] as T];
  }
  return values;
}

function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
