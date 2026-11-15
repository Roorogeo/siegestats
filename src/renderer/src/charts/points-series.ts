import type { MatchSummary } from '@shared/types/match';
import type { IsoDateTime, MatchId, RankId } from '@shared/types/primitives';
import { HOUR_MS } from '@shared/util/time';

/** One point of a "points after every match" chart. */
export interface PointsDatum {
  /** The match it came from (for "View match"); null for points that do not come from one match. */
  matchId: MatchId | null;
  at: IsoDateTime;
  /** Points after the match. */
  points: number;
  /** Change that match made; null = unknown. */
  delta: number | null;
  /** Division after the match; null = no division (plain points, placements, ladder missing from the config). */
  rankId: RankId | null;
}

/** Design question 16: matches more than 3 hours apart are separate sessions. */
export const SESSION_GAP_MS = 3 * HOUR_MS;

/**
 * Match-history rows -> chart points, oldest first: only rows whose source tracked a points change, filtered by
 * `include` (e.g. the season's ladder playlist). Pure: unit-tested in tests/unit/rank-axis.test.ts.
 */
export function pointsSeries(matches: readonly MatchSummary[], include: (match: MatchSummary) => boolean = () => true): PointsDatum[] {
  return matches
    .filter((match) => match.rankChange !== null && include(match))
    .map((match, index) => ({ match, index, ms: Date.parse(match.startedAt) }))
    .sort((a, b) => a.ms - b.ms || b.index - a.index)
    .flatMap(({ match }) =>
      match.rankChange
        ? [{ matchId: match.id, at: match.startedAt, points: match.rankChange.after.points, delta: match.rankChange.delta, rankId: match.rankChange.after.rankId }]
        : [],
    );
}

/** Indices (>= 1) of the points that start a new session: more than `gapMs` after the point before. */
export function sessionStarts(data: readonly { at: string }[], gapMs: number = SESSION_GAP_MS): number[] {
  const starts: number[] = [];
  for (let i = 1; i < data.length; i += 1) {
    const before = data[i - 1];
    const current = data[i];
    if (before && current && Date.parse(current.at) - Date.parse(before.at) > gapMs) starts.push(i);
  }
  return starts;
}
