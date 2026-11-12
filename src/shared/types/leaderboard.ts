import type { IsoDateTime, LeaderboardScope, PlaylistId, RankId, Ratio, RegionId, SeasonId } from './primitives';
import type { PlayerRef } from './player';
import type { RankPoint } from './stats';

export type LeaderboardMetric = 'points' | 'kd' | 'winRate' | 'level';

export interface LeaderboardQuery {
  playlistId: PlaylistId; // the Legend Division tab is this query with that playlist's id
  metric: LeaderboardMetric;
  scope: LeaderboardScope;
  seasonId: SeasonId | 'current';
  regionId: RegionId | 'all'; // regional boards only
  page: number; // 1-based
  pageSize: number;
}

export interface LeaderboardEntry {
  position: number; // "#": place in this result set
  previousPosition: number | null; // at the previous update; null = new or unknown
  /** Regional boards only: the player's place on their own region's board, and that region. */
  regionalPosition: number | null;
  regionId: RegionId | null;
  player: PlayerRef;
  level: number | null;
  winRate: Ratio | null; // ratios here: a board row carries no counts
  kd: number | null;
  rank: RankPoint | null; // the player's Ranked standing that season = the badge column
  value: number; // the sorted stat = the highlighted column (on a 'plain' points board: that playlist's points)
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  page: number;
  pageSize: number;
  totalEntries: number;
  updatedAt: IsoDateTime; // "Updated X minutes ago"
}

export interface RankDistributionQuery {
  playlistId: PlaylistId;
  scope: LeaderboardScope;
  seasonId: SeasonId | 'current';
}

export interface RankDistribution {
  totalProfiles: number;
  buckets: { rankId: RankId; count: number }[]; // one per division of that season's ladder, lowest first
  updatedAt: IsoDateTime;
}
