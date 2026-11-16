import {
  keepPreviousData, skipToken, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { LeaderboardQuery, RankDistributionQuery } from '@shared/types/leaderboard';
import type { MatchHistoryPage, MatchSummary } from '@shared/types/match';
import type { MatchId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey, PlayerSearchQuery } from '@shared/types/player';
import type {
  AppError, Fetched, PlayerStatsQuery, ProviderCapabilities, StatsCalls, StatsMethod,
} from '@shared/types/provider';
import { toAppError } from '@shared/util/errors';
import { useCurrentSeason } from '../app/GameConfigProvider';
import { bridge } from '../bridge';
import { isForced, updatePlayerQueries } from './force';
import { keepAcrossSeasons, queryKeys, type MatchHistoryFilter, type StatsQueryKey } from './keys';

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

/**
 * The shared body of every single-call hook. `request` null = waiting for input: nothing is fetched. `seasonInForce`
 * goes in the key of a call whose answer depends on the season in force (queryKeys.stats); when a season starts,
 * the answer for the one before stays on screen until the new one is in (keepAcrossSeasons).
 */
function useStatsQuery<K extends StatsMethod>(
  method: K,
  request: StatsCalls[K]['request'] | null,
  opts: QueryOpts = {},
  seasonInForce?: SeasonId,
): StatsResult<K> {
  const queryKey = queryKeys.stats(method, request, seasonInForce);
  return useQuery({
    queryKey,
    queryFn: request === null ? skipToken : ({ queryKey }) => callStats(method, request, isForced(queryKey)),
    enabled: opts.enabled ?? true,
    ...(opts.keepPrevious
      ? { placeholderData: keepPreviousData }
      : seasonInForce === undefined
        ? {}
        : { placeholderData: keepAcrossSeasons<Fetched<StatsCalls[K]['response']>, AppError, StatsQueryKey<K>>(queryKey) }),
  });
}

/**
 * Player search. Nothing is fetched for blank text. Pass keepPrevious for search-as-you-type, so the list does
 * not flash empty between keystrokes. Each hit carries its current rank, so it is keyed on the season in force.
 */
export function useSearchPlayers(query: PlayerSearchQuery, opts: QueryOpts = {}): StatsResult<'searchPlayer'> {
  const season = useCurrentSeason().id;
  const blank = query.name.trim() === '';
  return useStatsQuery('searchPlayer', blank ? null : query, opts, season);
}

/** Its currentSeason is the season in force: keyed on it, so a season start while the profile is open re-fetches it. */
export function useProfile(player: PlayerKey | null, opts?: QueryOpts): StatsResult<'getProfile'> {
  const season = useCurrentSeason().id;
  return useStatsQuery('getProfile', player, opts, season);
}

export const useSeasons = (player: PlayerKey | null, opts?: QueryOpts): StatsResult<'getSeasons'> =>
  useStatsQuery('getSeasons', player, opts);

export const useOperators = (query: PlayerStatsQuery | null, opts?: QueryOpts): StatsResult<'getOperators'> =>
  useStatsQuery('getOperators', query, opts);

export const useMaps = (query: PlayerStatsQuery | null, opts?: QueryOpts): StatsResult<'getMaps'> =>
  useStatsQuery('getMaps', query, opts);

export const useMatch = (id: MatchId | null, opts?: QueryOpts): StatsResult<'getMatch'> => useStatsQuery('getMatch', id, opts);

export const useEncounters = (player: PlayerKey | null, opts?: QueryOpts): StatsResult<'getEncounters'> =>
  useStatsQuery('getEncounters', player, opts);

/** A board for seasonId 'current' is keyed on the season in force too (see useProfile). */
export function useLeaderboard(query: LeaderboardQuery | null, opts?: QueryOpts): StatsResult<'getLeaderboard'> {
  const season = useCurrentSeason().id;
  return useStatsQuery('getLeaderboard', query, opts, query?.seasonId === 'current' ? season : undefined);
}

export function useRankDistribution(query: RankDistributionQuery | null, opts?: QueryOpts): StatsResult<'getRankDistribution'> {
  const season = useCurrentSeason().id;
  return useStatsQuery('getRankDistribution', query, opts, query?.seasonId === 'current' ? season : undefined);
}

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
