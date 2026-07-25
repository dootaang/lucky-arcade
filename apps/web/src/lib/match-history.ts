import { resultHash } from "@lucky-arcade/engine";
import { oldMaidOutcome, type OldMaidCartridge, type OldMaidState } from "@lucky-arcade/old-maid";
import type { MatchRecord } from "@lucky-arcade/persistence";
import { appendMatchRecord, listMatchRecordsForSession, pruneMatchRecords } from "./database.ts";

export interface MatchSummary {
  played: number;
  wins: number;
  firstPlaces: number;
  jokerHolds: number;
  currentStreak: number;
  longestStreak: number;
  opponents: Array<{ participantId: string; displayName: string; played: number; beaten: number }>;
}

export interface OldMaidMatchIdentity {
  cabinetId: string;
  sessionId: string;
  cabinetVersion: string;
  packVersion: string;
  cardFingerprint?: string;
}

export function createOldMaidMatchRecord(cartridge: OldMaidCartridge, state: OldMaidState, identity: OldMaidMatchIdentity, completedAt = new Date().toISOString()): MatchRecord | null {
  const outcome = oldMaidOutcome(state);
  if (!outcome) return null;
  const names = new Map(cartridge.characters.map((character) => [character.id, character.name]));
  return {
    contract: "match-record/0.1",
    recordId: `${identity.sessionId}#${state.sequence}`,
    cabinetId: identity.cabinetId,
    cabinetVersion: identity.cabinetVersion,
    packVersion: identity.packVersion,
    ...(identity.cardFingerprint ? { cardFingerprint: identity.cardFingerprint } : {}),
    sessionId: identity.sessionId,
    sequence: state.sequence,
    seed: state.seed,
    completedAt,
    turns: outcome.turns,
    standings: outcome.ranking.map((standing) => ({
      seatId: standing.seatId,
      ...(standing.characterId ? { participantId: standing.characterId } : {}),
      displayName: standing.seatId === "player" && state.mode === "play" ? "플레이어" : names.get(standing.characterId ?? "") ?? "상대",
      rank: standing.rank,
      isPlayer: standing.seatId === "player" && state.mode === "play",
    })),
    outcome: state.mode === "spectate" ? "spectated" : outcome.loserId === "player" ? "loss" : "win",
    resultHash: resultHash(state),
  };
}

export async function recordOldMaidCompletion(cartridge: OldMaidCartridge, previous: OldMaidState, next: OldMaidState, identity: OldMaidMatchIdentity): Promise<MatchSummary | null> {
  if (previous.status === "complete" || next.status !== "complete") return null;
  const record = createOldMaidMatchRecord(cartridge, next, identity);
  if (!record) return null;
  await appendMatchRecord(record);
  await pruneMatchRecords(200);
  return loadMatchSummary(identity.sessionId);
}

export async function loadMatchSummary(sessionId: string): Promise<MatchSummary> {
  return summariseMatches(await listMatchRecordsForSession(sessionId, 200));
}

export function summariseMatches(records: readonly MatchRecord[]): MatchSummary {
  const playedRecords = [...records].filter((record) => record.outcome !== "spectated").sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  let currentStreak = 0;
  let longestStreak = 0;
  for (const record of playedRecords) {
    if (record.outcome === "win") currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
    else currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }
  const opponents = new Map<string, { participantId: string; displayName: string; played: number; beaten: number }>();
  for (const record of playedRecords) {
    const player = record.standings.find((standing) => standing.isPlayer);
    if (!player) continue;
    for (const standing of record.standings) {
      if (standing.isPlayer || !standing.participantId) continue;
      const item = opponents.get(standing.participantId) ?? { participantId: standing.participantId, displayName: standing.displayName, played: 0, beaten: 0 };
      item.played += 1;
      if (player.rank < standing.rank) item.beaten += 1;
      opponents.set(standing.participantId, item);
    }
  }
  return {
    played: playedRecords.length,
    wins: playedRecords.filter((record) => record.outcome === "win").length,
    firstPlaces: playedRecords.filter((record) => record.standings.some((standing) => standing.isPlayer && standing.rank === 1)).length,
    jokerHolds: playedRecords.filter((record) => record.standings.some((standing) => standing.isPlayer && standing.rank === record.standings.length)).length,
    currentStreak,
    longestStreak,
    opponents: [...opponents.values()].sort((left, right) => right.played - left.played || left.displayName.localeCompare(right.displayName, "ko")),
  };
}
