import {
  keepPreviousData, skipToken, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { LeaderboardQuery, RankDistributionQuery } from '@shared/types/leaderboard';
import type { MatchHistoryPage, MatchSummary } from '@shared/types/match';
import type { MatchId } from '@shared/types/primitives';
import type { PlayerKey, PlayerSearchQuery } from '@shared/types/player';
import type {
  AppError, Fetched, PlayerStatsQuery, ProviderCapabilities, StatsCalls, StatsMethod,
} from '@shared/types/provider';
import { toAppError } from '@shared/util/errors';
import { bridge } from '../bridge';
import { isForced, updatePlayerQueries } from './force';
import { queryKeys, type MatchHistoryFilter } from './keys';

/** Every hook's data is what core answered: the data plus fetchedAt and where it came from. */
export type StatsResult<K extends StatsMethod> = UseQueryResult<Fetched<StatsCalls[K]['response']>, AppError>;

export interface QueryOpts {
  /** false = do not fetch yet (the default is true). */
  enabled?: boolean;
  /** Keep showing the previous answer while a changed request loads (filters, pagination, search-as-you-type). */
  keepPrevious?: boolean;
}

/** Anything a bridge call rejects with arrives as an AppError (core already rejects with one; this guards the rest). */
export async function asAppError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw toAppError(error);
  }
}

type StatsCall<K extends StatsMethod> = (
  request: StatsCalls[K]['request'],
  opts: { force: boolean },
) => Promise<Fetched<StatsCalls[K]['response']>>;

/** One bridge.stats call; `force` bypasses core's cache (Update / refresh). */
export function callStats<K extends StatsMethod>(
  method: K,
  request: StatsCalls[K]['request'],
  force: boolean,
): Promise<Fetched<StatsCalls[K]['response']>> {
  const stats = bridge.stats;
  const fn = stats[method] as unknown as StatsCall<K>;
  return asAppError(fn.call(stats, request, { force }));
}

/** The shared body of every single-call hook. `request` null = waiting for input: nothing is fetched. */
function useStatsQuery<K extends StatsMethod>(method: K, request: StatsCalls[K]['request'] | null, opts: QueryOpts = {}): StatsResult<K> {
  return useQuery({
    queryKey: queryKeys.stats(method, request),
    queryFn: request === null ? skipToken : ({ queryKey }) => callStats(method, request, isForced(queryKey)),
    enabled: opts.enabled ?? true,
    ...(opts.keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/**
 * Player search. Nothing is fetched for blank text. Pass keepPrevious for search-as-you-type, so the list does
 * not flash empty between keystrokes.
 */
export function useSearchPlayers(query: PlayerSearchQuery, opts: QueryOpts = {}): StatsResult<'searchPlayer'> {
  const blank = query.name.trim() === '';
  return useStatsQuery('searchPlayer', blank ? null : query, opts);
}

export const useProfile = (player: PlayerKey | null, opts?: QueryOpts): StatsResult<'getProfile'> =>
  useStatsQuery('getProfile', player, opts);

export const useSeasons = (player: PlayerKey | null, opts?: QueryOpts): StatsResult<'getSeasons'> =>
  useStatsQuery('getSeasons', player, opts);

export const useOperators = (query: PlayerStatsQuery | null, opts?: QueryOpts): StatsResult<'getOperators'> =>
  useStatsQuery('getOperators', query, opts);

export const useMaps = (query: PlayerStatsQuery | null, opts?: QueryOpts): StatsResult<'getMaps'> =>
  useStatsQuery('getMaps', query, opts);

export const useMatch = (id: MatchId | null, opts?: QueryOpts): StatsResult<'getMatch'> => useStatsQuery('getMatch', id, opts);

export const useEncounters = (player: PlayerKey | null, opts?: QueryOpts): StatsResult<'getEncounters'> =>
  useStatsQuery('getEncounters', player, opts);

export const useLeaderboard = (query: LeaderboardQuery | null, opts?: QueryOpts): StatsResult<'getLeaderboard'> =>
  useStatsQuery('getLeaderboard', query, opts);

export const useRankDistribution = (query: RankDistributionQuery | null, opts?: QueryOpts): StatsResult<'getRankDistribution'> =>
  useStatsQuery('getRankDistribution', query, opts);

/** What the stats source can deliver. Fixed for the life of the app, so it is asked once. */
export function useCapabilities(): UseQueryResult<ProviderCapabilities, AppError> {
  return useQuery({
    queryKey: queryKeys.capabilities(),
    queryFn: () => asAppError(bridge.stats.getCapabilities()),
    staleTime: Infinity,
  });
}

export type MatchPages = InfiniteData<Fetched<MatchHistoryPage>, string | null>;
export type MatchesResult = UseInfiniteQueryResult<MatchPages, AppError>;

const FIRST_PAGE: string | null = null;

/**
 * Match history as an infinite query over the provider's cursor: fetchNextPage() loads the next `limit` rows,
 * hasNextPage says whether there are more. The summary row is the same on every page (it covers the whole filtered
 * period); read it with matchHistorySummary().
 */
export function useMatches(filter: MatchHistoryFilter | null, opts: QueryOpts = {}): MatchesResult {
  return useInfiniteQuery({
    queryKey: queryKeys.matchPages(filter),
    queryFn:
      filter === null
        ? skipToken
        : ({ queryKey, pageParam }) => callStats('getMatches', { ...filter, cursor: pageParam }, isForced(queryKey)),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) => last.data.nextCursor,
    enabled: opts.enabled ?? true,
    ...(opts.keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/** Every loaded row of useMatches, newest first. */
export const matchHistoryItems = (pages: MatchPages | undefined): MatchSummary[] =>
  pages ? pages.pages.flatMap((page) => page.data.items) : [];

/** The summary row of useMatches (from the first page), or null before it loads. */
export const matchHistorySummary = (pages: MatchPages | undefined) => pages?.pages[0]?.data.summary ?? null;

/**
 * The Update button of a player page: re-fetches every per-player query of that player with { force: true }.
 * isUpdating stays true until all of them have settled.
 */
export function useUpdatePlayer(player: PlayerKey | null): { update(): Promise<void>; isUpdating: boolean } {
  const client = useQueryClient();
  const [running, setRunning] = useState(0);
  const update = useCallback(async () => {
    if (!player) return;
    setRunning((n) => n + 1);
    try {
      await updatePlayerQueries(client, player);
    } finally {
      setRunning((n) => n - 1);
    }
  }, [client, player]);
  return { update, isUpdating: running > 0 };
}
