import type { IsoDateTime, PlaylistId, SeasonId } from './primitives';
import type { PlayerKey, PlayerProfile, PlayerRef } from './player';
import type { PlayerStatsQuery } from './provider';
import type { RankPoint } from './stats';

export interface SnapshotCounters {
  playlistId: PlaylistId | 'all';
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
}

/** One row per stored profile refresh (SQLite). Trend charts read these, not the live profile. */
export interface ProfileSnapshot {
  player: PlayerKey;
  takenAt: IsoDateTime;
  seasonId: SeasonId;
  level: number | null;
  rank: RankPoint | null;
  counters: SnapshotCounters[]; // 'all' plus one per playlist, as columns: trend queries never parse JSON
  profile: PlayerProfile; // the full payload
}

/** The Home filter bar plus a bucket size. */
export interface TrendQuery extends PlayerStatsQuery {
  bucket: 'day' | 'week';
}

export interface TrendPoint {
  at: IsoDateTime;
  matches: number;
  kills: number;
  deaths: number;
}

export interface TrendSeries {
  /** snapshots = as the brief asks. match_history = rebuilt from matches (few snapshots yet, or a map filter). unavailable = this filter cannot be answered. */
  basis: 'snapshots' | 'match_history' | 'unavailable';
  points: TrendPoint[];
}

export interface Favorite {
  player: PlayerRef;
  addedAt: IsoDateTime;
  lastKnownRank: RankPoint | null; // compared on refresh to raise "rank changed"
}

export interface RecentSearch {
  player: PlayerRef;
  searchedAt: IsoDateTime;
}
