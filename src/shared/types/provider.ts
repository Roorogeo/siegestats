import type { IsoDateTime, MapId, MatchId, PlaylistId, ProviderId, SeasonId } from './primitives';
import type { PlayerKey, PlayerProfile, PlayerSearchQuery, PlayerSearchResult } from './player';
import type { MapStats, OperatorStats, SeasonRecord } from './stats';
import type { Encounter, MatchDetail, MatchHistoryPage, MatchHistoryQuery } from './match';
import type {
  LeaderboardMetric, LeaderboardPage, LeaderboardQuery, RankDistribution, RankDistributionQuery,
} from './leaderboard';

/** The Home / profile filter bar. */
export interface PlayerStatsQuery {
  player: PlayerKey;
  seasonId: SeasonId | 'all';
  playlistId: PlaylistId | 'all';
  mapId: MapId | 'all';
}

/** The ten calls of the brief, declared once: one JSON-safe request in, one response out. */
export interface StatsCalls {
  searchPlayer: { request: PlayerSearchQuery; response: PlayerSearchResult[] };
  getProfile: { request: PlayerKey; response: PlayerProfile };
  getSeasons: { request: PlayerKey; response: SeasonRecord[] };
  getOperators: { request: PlayerStatsQuery; response: OperatorStats[] };
  getMaps: { request: PlayerStatsQuery; response: MapStats[] };
  getMatches: { request: MatchHistoryQuery; response: MatchHistoryPage };
  getMatch: { request: MatchId; response: MatchDetail };
  getEncounters: { request: PlayerKey; response: Encounter[] };
  getLeaderboard: { request: LeaderboardQuery; response: LeaderboardPage };
  getRankDistribution: { request: RankDistributionQuery; response: RankDistribution };
}
export type StatsMethod = keyof StatsCalls;

/** What a source can deliver, so a screen explains a gap instead of showing zeros. */
export interface ProviderCapabilities {
  operatorStats: boolean;
  mapStats: boolean;
  matchHistory: boolean;
  matchRounds: boolean;
  rankChangePerMatch: boolean;
  damage: boolean;
  encounters: boolean;
  linkedAccounts: boolean;
  leaderboardMetrics: LeaderboardMetric[];
  rankDistribution: boolean;
}

type StatsMethods = { [K in StatsMethod]: (request: StatsCalls[K]['request']) => Promise<StatsCalls[K]['response']> };

/** The one data-source interface: MockProvider and LiveProvider implement it. Failures reject with an AppError. */
export interface StatsProvider extends StatsMethods {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
}

export type AppErrorCode =
  | 'not_found'
  | 'rate_limited'
  | 'unavailable' // backend or its upstream is down
  | 'network' // offline, DNS, timeout
  | 'unsupported' // this source cannot answer this call
  | 'not_configured' // LiveProvider without a backend URL
  | 'unknown';

/** The only error shape that crosses a provider or IPC boundary (a plain object, not an Error subclass). */
export interface AppError {
  code: AppErrorCode;
  message: string;
  retryAfterSec: number | null;
}

/** What the UI receives: the data plus where it came from ("updated X ago", offline banner). */
export interface Fetched<T> {
  data: T;
  fetchedAt: IsoDateTime;
  from: 'source' | 'cache' | 'stale_cache'; // stale_cache = the source failed; last known data is shown
}

/** The provider as the UI sees it through the bridge: cached by core, `force` = the Update / refresh buttons. */
export type StatsClient = {
  [K in StatsMethod]: (
    request: StatsCalls[K]['request'],
    opts?: { force: boolean },
  ) => Promise<Fetched<StatsCalls[K]['response']>>;
} & { getCapabilities(): Promise<ProviderCapabilities> };
