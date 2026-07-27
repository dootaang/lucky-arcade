import type { MatchRecord } from "@lucky-arcade/persistence";

export interface OpponentRecordSummary {
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

/** Summarise head-to-head records without trusting a game's display name. */
export function summarizeOpponentRecords(records: readonly MatchRecord[]): Readonly<Record<string, OpponentRecordSummary>> {
  const summaries: Record<string, OpponentRecordSummary> = {};
  for (const record of records) {
    if (record.outcome === "spectated") continue;
    const player = record.standings.find((standing) => standing.isPlayer);
    if (!player) continue;
    for (const opponent of record.standings) {
      const id = opponent.participantId;
      if (opponent.isPlayer || !id || id === "player") continue;
      const current = summaries[id] ?? { played: 0, wins: 0, losses: 0, draws: 0 };
      current.played += 1;
      if (player.rank < opponent.rank) current.wins += 1;
      else if (player.rank > opponent.rank) current.losses += 1;
      else current.draws += 1;
      summaries[id] = current;
    }
  }
  return summaries;
}

