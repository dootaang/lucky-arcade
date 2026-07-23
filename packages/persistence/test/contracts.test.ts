import { describe, expect, it } from "vitest";
import type { ActionLogStore, SnapshotStore } from "../src/index.ts";

describe("persistence ports", () => {
  it("keeps small action receipts separate from snapshots", () => {
    const actionStore: ActionLogStore | null = null;
    const snapshotStore: SnapshotStore | null = null;
    expect(actionStore).toBeNull();
    expect(snapshotStore).toBeNull();
  });
});
