import { XorShift32 } from "@lucky-arcade/engine";
import type { CasinoPresentationClock, CasinoTableId, NpcPlayEvent, NpcPlayEventCode, NpcPresence } from "./contracts.ts";

const TAPE_VERSION = "npc-live-tape/0.1";
const DEFAULT_LOOKBACK_SECONDS = 90;
const ACTIONS = Object.freeze({
  "temerosa-old-maid": ["old-maid-draw", "old-maid-discard", "old-maid-reorder", "old-maid-watch"] as const,
  "temerosa-match-pairs": ["pairs-open-first", "pairs-open-second", "pairs-match", "pairs-turn"] as const,
  "temerosa-slot": ["slot-spin", "slot-reel-stop", "slot-line-check", "slot-reach"] as const,
  "indian-poker": ["poker-check", "poker-call", "poker-raise", "poker-read"] as const,
}) satisfies Readonly<Record<CasinoTableId, readonly NpcPlayEventCode[]>>;

/**
 * Expands active, already-determined NPC sessions into a second-resolution tape.
 * These events are theatre only: settlement remains owned by npcDaySessions.
 */
export function recentNpcPlayEventsAt(
  presences: readonly NpcPresence[],
  clock: CasinoPresentationClock,
  limit: number,
  lookbackSeconds = DEFAULT_LOOKBACK_SECONDS,
): readonly NpcPlayEvent[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("npc_live_tape_invalid_limit");
  if (!Number.isSafeInteger(lookbackSeconds) || lookbackSeconds < 1 || lookbackSeconds > 600) throw new Error("npc_live_tape_invalid_window");
  if (limit === 0) return Object.freeze([]);
  const now = clock.utcSecond();
  if (!Number.isSafeInteger(now)) throw new Error("npc_live_tape_invalid_clock");
  const lowerInclusive = now - lookbackSeconds + 1;
  const events: NpcPlayEvent[] = [];

  for (const presence of presences) {
    const { session, tableId, startedAtUtcSecond, settlesAtUtcSecond } = presence;
    if (!session || !tableId || startedAtUtcSecond === undefined || settlesAtUtcSecond === undefined) continue;
    const lastActionSecond = Math.min(now, settlesAtUtcSecond - 1);
    if (lastActionSecond < startedAtUtcSecond || now < startedAtUtcSecond) continue;
    const prefix = `${TAPE_VERSION}:${presence.npcId}:${startedAtUtcSecond}:${tableId}`;
    if (startedAtUtcSecond >= lowerInclusive) events.push(event(prefix, 0, presence.npcId, tableId, startedAtUtcSecond, "table-enter", session.stake));
    const wagerSecond = startedAtUtcSecond + 1;
    if (wagerSecond <= lastActionSecond && wagerSecond >= lowerInclusive) events.push(event(prefix, 1, presence.npcId, tableId, wagerSecond, "wager-placed", session.stake));
    const actionCodes = ACTIONS[tableId];
    const firstBucket = Math.max(1, Math.floor((lowerInclusive - startedAtUtcSecond) / 2));
    const lastBucket = Math.floor((lastActionSecond - startedAtUtcSecond) / 2);
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const rng = new XorShift32(`${prefix}:action:${bucket}`);
      const actionSecond = startedAtUtcSecond + bucket * 2 + Math.floor(rng.next() * 2);
      if (actionSecond < lowerInclusive || actionSecond > lastActionSecond) continue;
      const action = actionCodes[Math.floor(rng.next() * actionCodes.length)]!;
      events.push(event(prefix, bucket + 2, presence.npcId, tableId, actionSecond, action, session.stake));
    }
  }

  events.sort((left, right) => right.utcSecond - left.utcSecond
    || compareText(left.npcId, right.npcId)
    || compareText(left.eventId, right.eventId));
  return Object.freeze(events.slice(0, limit).map((value) => Object.freeze(value)));
}

function event(prefix: string, index: number, npcId: string, tableId: CasinoTableId, utcSecond: number, code: NpcPlayEventCode, stake: NpcPlayEvent["stake"]): NpcPlayEvent {
  return Object.freeze({ eventId: `${prefix}:${index}:${utcSecond}`, npcId, tableId, utcSecond, code, stake });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
