import { hashKey, QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { matchPath, parseMatchParams, parsePlayerParams, parsePov, playerPath, ROUTES } from '@renderer/app/routes';
import { isForced, refreshScreen, updatePlayerQueries } from '@renderer/queries/force';
import {
  isQueryOfPlayer, keepAcrossSeasons, playerOfQueryKey, queryKeys, samePlayer, type MatchHistoryFilter,
} from '@renderer/queries/keys';
import type { LeaderboardQuery } from '@shared/types/leaderboard';
import type { MatchId, PlayerId, PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { PlayerStatsQuery } from '@shared/types/provider';

const A: PlayerKey = { platform: 'pc', id: 'a-1' as PlayerId };
const B: PlayerKey = { platform: 'psn', id: 'b-2' as PlayerId };
const stats = (player: PlayerKey): PlayerStatsQuery => ({ player, seasonId: 'all', playlistId: 'all', mapId: 'all' });
const history = (player: PlayerKey): MatchHistoryFilter => ({ player, playlistIds: 'all', mapId: 'all', period: 'all', limit: 20 });
const board: LeaderboardQuery = {
  playlistId: 'ladder' as PlaylistId, metric: 'points', scope: 'global', seasonId: 'current', regionId: 'all', page: 1, pageSize: 25,
};

describe('query keys', () => {
  test('stats keys carry the method and the request object', () => {
    expect(queryKeys.stats('getProfile', A)).toEqual(['stats', 'getProfile', A]);
    expect(queryKeys.matchPages(history(A))).toEqual(['stats', 'getMatches', history(A), 'pages']);
  });

  test('a call that depends on the season in force carries it: a new season is a new key, of the same player', () => {
    const y11s3 = queryKeys.stats('getProfile', A, 'Y11S3' as SeasonId);
    const y11s4 = queryKeys.stats('getProfile', A, 'Y11S4' as SeasonId);
    expect(y11s3).toEqual(['stats', 'getProfile', A, 'Y11S3']);
    expect(hashKey(y11s4)).not.toBe(hashKey(y11s3));
    expect(playerOfQueryKey(y11s4)).toEqual(A);
    expect(isQueryOfPlayer(y11s4, A)).toBe(true);
    expect(queryKeys.stats('getLeaderboard', board, 'Y11S4' as SeasonId)).toEqual(['stats', 'getLeaderboard', board, 'Y11S4']);
  });

  test('the player of every per-player key, and of no other', () => {
    expect(playerOfQueryKey(queryKeys.stats('getProfile', A))).toEqual(A);
    expect(playerOfQueryKey(queryKeys.stats('getSeasons', B))).toEqual(B);
    expect(playerOfQueryKey(queryKeys.stats('getEncounters', A))).toEqual(A);
    expect(playerOfQueryKey(queryKeys.stats('getOperators', stats(A)))).toEqual(A);
    expect(playerOfQueryKey(queryKeys.stats('getMaps', stats(B)))).toEqual(B);
    expect(playerOfQueryKey(queryKeys.matchPages(history(A)))).toEqual(A);
    expect(playerOfQueryKey(queryKeys.stats('getLeaderboard', board))).toBeNull();
    expect(playerOfQueryKey(queryKeys.stats('getMatch', 'm-1' as MatchId))).toBeNull();
    expect(playerOfQueryKey(queryKeys.stats('searchPlayer', { name: 'a', platform: 'pc', limit: 5 }))).toBeNull();
    expect(playerOfQueryKey(queryKeys.stats('getProfile', null))).toBeNull();
    expect(playerOfQueryKey(queryKeys.favorites())).toBeNull();
    expect(playerOfQueryKey(['stats', 'getProfile', { platform: 'switch', id: 'x' }])).toBeNull();
  });

  test('same player = same platform and id', () => {
    expect(samePlayer(A, { ...A })).toBe(true);
    expect(samePlayer(A, { platform: 'xbl', id: A.id })).toBe(false);
    expect(isQueryOfPlayer(queryKeys.stats('getMaps', stats(A)), A)).toBe(true);
    expect(isQueryOfPlayer(queryKeys.stats('getMaps', stats(A)), B)).toBe(false);
  });
});

describe('a season start under a season-keyed call on screen', () => {
  test('the answer for the season before stays until the new one is in; another player still starts empty', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    const options = (player: PlayerKey, season: string, queryFn: () => Promise<string>) => {
      const queryKey = queryKeys.stats('getProfile', player, season as SeasonId);
      return { queryKey, queryFn, placeholderData: keepAcrossSeasons<string, Error, QueryKey>(queryKey) };
    };
    const observer = new QueryObserver<string, Error, string, string, QueryKey>(client, options(A, 'Y11S3', () => Promise.resolve('A in Y11S3')));
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('A in Y11S3'));

    // Y11S4 starts: the same call under a new key. The header keeps its data (no skeleton) while it is fetched.
    let answer: (value: string) => void = () => undefined;
    observer.setOptions(options(A, 'Y11S4', () => new Promise<string>((resolve) => (answer = resolve))));
    expect(observer.getCurrentResult()).toMatchObject({ data: 'A in Y11S3', isPlaceholderData: true, isFetching: true });
    answer('A in Y11S4');
    await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({ data: 'A in Y11S4', isPlaceholderData: false }));

    // Another player is another call: nothing of A's is shown for B.
    observer.setOptions(options(B, 'Y11S4', () => new Promise<string>(() => undefined)));
    expect(observer.getCurrentResult()).toMatchObject({ data: undefined, isPlaceholderData: false, isPending: true });
    unsubscribe();
    client.clear();
  });
});

describe('forced re-fetches (Update and the title-bar refresh)', () => {
  const clients: QueryClient[] = [];
  afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
  });

  /** A client whose queries record, per call, whether the bridge would have been asked with force. */
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    clients.push(client);
    const calls: { key: string; force: boolean; page?: string | null }[] = [];
    const queryFn = ({ queryKey }: { queryKey: QueryKey }) => {
      calls.push({ key: JSON.stringify(queryKey.slice(0, 2)) + playerOfQueryKey(queryKey)?.id, force: isForced(queryKey) });
      return Promise.resolve({ ok: true });
    };
    return { client, calls, queryFn };
  }

  test('Update re-fetches every per-player query of that player with force, mounted or not, and nothing else', async () => {
    const { client, calls, queryFn } = setup();
    await client.fetchQuery({ queryKey: queryKeys.stats('getProfile', A), queryFn });
    await client.fetchQuery({ queryKey: queryKeys.stats('getOperators', stats(A)), queryFn });
    await client.fetchQuery({ queryKey: queryKeys.stats('getProfile', B), queryFn });
    await client.fetchQuery({ queryKey: queryKeys.stats('getLeaderboard', board), queryFn });
    const pages: (string | null)[] = [];
    await client.fetchInfiniteQuery({
      queryKey: queryKeys.matchPages(history(A)),
      queryFn: ({ queryKey, pageParam }) => {
        pages.push(`${pageParam}:${isForced(queryKey)}`);
        return Promise.resolve({ next: pageParam === null ? 'p2' : null });
      },
      initialPageParam: null as string | null,
      getNextPageParam: (last: { next: string | null }) => last.next,
      pages: 2,
    });
    expect(calls.every((c) => !c.force)).toBe(true);
    expect(pages).toEqual(['null:false', 'p2:false']);
    calls.length = 0;
    pages.length = 0;

    await updatePlayerQueries(client, A);
    expect(calls.map((c) => c.key).sort()).toEqual(['["stats","getOperators"]a-1', '["stats","getProfile"]a-1']);
    expect(calls.every((c) => c.force)).toBe(true);
    // Every loaded page of the match history, all forced.
    expect(pages).toEqual(['null:true', 'p2:true']);
    // The flag lasts only for the re-fetch.
    expect(isForced(queryKeys.stats('getProfile', A))).toBe(false);
  });

  test('refresh forces the stats queries on screen only, and simply re-reads other active queries', async () => {
    const { client, calls, queryFn } = setup();
    const onScreen = new QueryObserver(client, { queryKey: queryKeys.stats('getLeaderboard', board), queryFn });
    const unsubscribe = onScreen.subscribe(() => undefined);
    let favoritesReads = 0;
    const favorites = new QueryObserver(client, { queryKey: queryKeys.favorites(), queryFn: () => Promise.resolve(++favoritesReads) });
    const unsubscribeFavorites = favorites.subscribe(() => undefined);
    await client.fetchQuery({ queryKey: queryKeys.stats('getProfile', A), queryFn }); // cached, not on screen
    await onScreen.refetch();
    await favorites.refetch();
    calls.length = 0;
    const readsBefore = favoritesReads;

    await refreshScreen(client);
    expect(calls).toEqual([{ key: '["stats","getLeaderboard"]undefined', force: true }]);
    expect(favoritesReads).toBe(readsBefore + 1);
    unsubscribe();
    unsubscribeFavorites();
  });
});

describe('routes', () => {
  test('player links round-trip, ids escaped', () => {
    expect(playerPath(A)).toBe('/player/pc/a-1');
    const odd: PlayerKey = { platform: 'xbl', id: 'we/ird id?#' as PlayerId };
    const path = playerPath(odd);
    expect(path).toBe('/player/xbl/we%2Fird%20id%3F%23');
    // React Router hands the decoded params over.
    const [, , platform, id] = path.split('/');
    expect(parsePlayerParams({ platform, id: decodeURIComponent(id ?? '') })).toEqual(odd);
    expect(ROUTES.player).toBe('/player/:platform/:id');
  });

  test('bad player params are refused', () => {
    expect(parsePlayerParams({ platform: 'switch', id: 'x' })).toBeNull();
    expect(parsePlayerParams({ platform: 'pc', id: '' })).toBeNull();
    expect(parsePlayerParams({ platform: 'pc' })).toBeNull();
    expect(parsePlayerParams({ platform: 'pc', id: 'x'.repeat(129) })).toBeNull();
  });

  test('match links with and without a point of view', () => {
    const id = 'm-3547f4424452568524c1' as MatchId;
    expect(matchPath(id)).toBe('/match/m-3547f4424452568524c1');
    expect(matchPath(id, A)).toBe('/match/m-3547f4424452568524c1?pov=pc:a-1');
    expect(parseMatchParams({ id })).toBe(id);
    expect(parseMatchParams({})).toBeNull();
    expect(parsePov('?pov=pc:a-1')).toEqual(A);
    const odd: PlayerKey = { platform: 'psn', id: 'a+b:c&d' as PlayerId };
    expect(parsePov(matchPath(id, odd).slice(matchPath(id, odd).indexOf('?')))).toEqual(odd);
    expect(parsePov('')).toBeNull();
    expect(parsePov('?pov=nope')).toBeNull();
    expect(parsePov('?pov=%E0%A4%A')).toBeNull();
    expect(parsePov('?x=1&pov=xbl:z')).toEqual({ platform: 'xbl', id: 'z' });
    expect(ROUTES.match).toBe('/match/:id');
  });
});
