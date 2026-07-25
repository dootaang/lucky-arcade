import { ENGINE_VERSION, resultHash } from "@lucky-arcade/engine";
import type { SnapshotRecord, StoredActionReceipt } from "@lucky-arcade/persistence";
import { describe, expect, it } from "vitest";
import { recoverSession, type SessionRecoveryStore } from "./session-recovery.ts";

interface State { count: number; }
type Action = { type: "add"; value: number };
const reduce = (state: State, action: Action): State => ({ count: state.count + action.value });

describe("session recovery", () => {
  it("accepts a verified snapshot and replays a valid hash chain", async () => {
    const snapshot = record({ count: 2 }, 2);
    const next = reduce(snapshot.state, { type: "add", value: 3 });
    const action = receipt(3, { type: "add", value: 3 }, snapshot.state, next);
    const recovered = await recoverSession(options(store(snapshot, [action])));
    expect(recovered).toEqual({ state: { count: 5 }, sequence: 3 });
  });

  it("rejects a corrupt snapshot and stops at the first broken receipt", async () => {
    const corrupt = { ...record({ count: 99 }, 4), stateHash: "corrupt" };
    const valid = receipt(1, { type: "add", value: 2 }, { count: 0 }, { count: 2 });
    const broken = { ...receipt(2, { type: "add", value: 2 }, { count: 2 }, { count: 4 }), resultHash: "corrupt" };
    const truncated: number[] = [];
    const recovered = await recoverSession(options(store(corrupt, [valid, broken], (sequence) => truncated.push(sequence))));
    expect(recovered).toEqual({ state: { count: 2 }, sequence: 1 });
    expect(truncated).toEqual([1]);
  });

  it("lets a cabinet restore a verified legacy snapshot under a newer current version", async () => {
    const snapshot = { ...record({ count: 7 }, 4), cabinetVersion: "test/legacy" };
    const recovered = await recoverSession({
      ...options(store(snapshot, [])),
      cabinetVersion: "test/current",
      restoreSnapshot: (_cabinetVersion, value) => value as State,
    });
    expect(recovered).toEqual({ state: { count: 7 }, sequence: 4 });
  });
});

function options(value: SessionRecoveryStore) {
  return { sessionId: "test", fresh: { count: 0 }, cabinetVersion: "test/1", isState: (candidate: unknown): candidate is State => Boolean(candidate && typeof candidate === "object" && typeof (candidate as State).count === "number"), reduce, store: value };
}

function record(state: State, sequence: number): SnapshotRecord<State> {
  return { contract: "snapshot-record/0.1", sessionId: "test", sequence, state, stateHash: resultHash(state), engineVersion: ENGINE_VERSION, cabinetVersion: "test/1" };
}

function receipt(sequence: number, action: Action, previous: State, next: State): StoredActionReceipt<Action> {
  return { sequence, action, previousHash: resultHash(previous), resultHash: resultHash(next), rngPosition: 0 };
}

function store(snapshot: SnapshotRecord<State>, actions: StoredActionReceipt<Action>[], onTruncate?: (sequence: number) => void): SessionRecoveryStore {
  return {
    loadSnapshot: async <T>() => snapshot as SnapshotRecord<T>,
    listActionsAfter: async <T>(_sessionId: string, sequence: number) => actions.filter((item) => item.sequence > sequence) as StoredActionReceipt<T>[],
    truncateAfter: async (_sessionId: string, sequence: number) => { onTruncate?.(sequence); },
  };
}
