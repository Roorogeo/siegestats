import { describe, expect, test, vi } from 'vitest';
import { createAppServices } from '@core/app-services';
import { createMemoryCacheStore } from '@core/memory/cache-store';
import { createManualClock } from '@core/memory/clock';
import { createMemorySettingsStore } from '@core/memory/settings-store';
import { createMemorySnapshotStore } from '@core/memory/snapshot-store';
import { CACHE_TTL_MS, cacheKey, createStatsService, createUnconfiguredStatsClient } from '@core/stats/stats-service';
import type { Clock } from '@core/ports';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { AppConfig } from '@shared/types/game-config';
import type { IsoDateTime, MatchId, PlayerId, PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey, PlayerProfile } from '@shared/types/player';
import type { StatsProvider } from '@shared/types/provider';
import { appError } from '@shared/util/errors';
import { MINUTE_MS, SECOND_MS } from '@shared/util/time';

const NOW = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const game = createGameIndex(loadBundledGameConfig());
const PLAYER: PlayerKey = { platform: 'pc', id: 'p-1' as PlayerId };

function profile(kills: number, level = 100): PlayerProfile {
  const stats = { matches: 10, wins: 6, losses: 4, kills, deaths: 9, assists: 3, headshotPct: 0.5, rounds: 70, damagePerRound: 120 };
  return {
    player: { ...PLAYER, name: 'Tester', avatarUrl: null },
    level,
    lastPlayedAt: NOW,
    currentSeason: {
      seasonId: 'Y11S3' as SeasonId,
      platformFamily: 'pc',
      overall: stats,
      byPlaylist: [{ ...stats, playlistId: 'ranked' as PlaylistId, standing: { rank: { points: 2750, rankId: 'r3.gold-3' as never }, peak: null, topPosition: null } }],
      bestAttacker: null,
      bestDefender: null,
    },
    lifetime: stats,
    linkedAccounts: [],
  };
}

/** A provider whose every method answers through one spy, so calls can be counted and failures injected. */
function fakeProvider(answer: (method: string, request: unknown) => unknown) {
  const spy = vi.fn(async (method: string, request: unknown) => answer(method, request));
  const methods = ['searchPlayer', 'getProfile', 'getSeasons', 'getOperators', 'getMaps', 'getMatches', 'getMatch', 'getEncounters', 'getLeaderboard', 'getRankDistribution'];
  const provider = Object.fromEntries(methods.map((m) => [m, (request: unknown) => spy(m, request)])) as unknown as StatsProvider;
  Object.assign(provider, { id: 'mock', capabilities: { operatorStats: true } });
  return { provider, spy };
}

function setup(answer: (method: string, request: unknown) => unknown, opts: { latencyMs?: number; clock?: Clock } = {}) {
  const clock = createManualClock(NOW);
  const cache = createMemoryCacheStore();
  const snapshots = createMemorySnapshotStore();
  const { provider, spy } = fakeProvider(answer);
  const service = createStatsService({ provider, cache, snapshots, clock: opts.clock ?? clock, game, latencyMs: opts.latencyMs ?? 0 });
  return { clock, cache, snapshots, service, spy };
}

describe('stats service cache', () => {
  test('a fresh answer comes from the cache, an expired one from the source again (5 minutes for a profile)', async () => {
    const { clock, service, spy } = setup(() => profile(5));
    const first = await service.getProfile(PLAYER);
    expect(first).toMatchObject({ from: 'source', fetchedAt: NOW });
    clock.advance(5 * MINUTE_MS - 1);
    const second = await service.getProfile(PLAYER);
    expect(second).toMatchObject({ from: 'cache', fetchedAt: NOW });
    expect(second.data).toEqual(first.data);
    clock.advance(1);
    expect(await service.getProfile(PLAYER)).toMatchObject({ from: 'source' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('one TTL table: leaderboards 3 min, search 60 s, a match until cleared', async () => {
    expect(CACHE_TTL_MS).toMatchObject({ getProfile: 5 * MINUTE_MS, getMatches: 5 * MINUTE_MS, getLeaderboard: 3 * MINUTE_MS, getRankDistribution: 3 * MINUTE_MS, searchPlayer: 60 * SECOND_MS, getMatch: null });
    const { clock, service, spy } = setup(() => ({}));
    const board = { playlistId: 'ranked', metric: 'points', scope: 'global', seasonId: 'current', regionId: 'all', page: 1, pageSize: 25 } as never;
    await service.getLeaderboard(board);
    await service.searchPlayer({ name: 'a', platform: 'pc', limit: 5 });
    await service.getMatch('m-1' as MatchId);
    clock.advance(60 * SECOND_MS);
    expect((await service.searchPlayer({ name: 'a', platform: 'pc', limit: 5 })).from).toBe('source');
    expect((await service.getLeaderboard(board)).from).toBe('cache');
    clock.advance(2 * MINUTE_MS);
    expect((await service.getLeaderboard(board)).from).toBe('source');
    clock.advance(365 * 24 * 60 * MINUTE_MS);
    expect((await service.getMatch('m-1' as MatchId)).from).toBe('cache');
    expect(spy.mock.calls.map(([m]) => m)).toEqual(['getLeaderboard', 'searchPlayer', 'getMatch', 'searchPlayer', 'getLeaderboard']);
  });

  test('force bypasses a fresh cache (Update / refresh) and refreshes it', async () => {
    let kills = 1;
    const { service, spy } = setup(() => profile(kills));
    await service.getProfile(PLAYER);
    kills = 2;
    const forced = await service.getProfile(PLAYER, { force: true });
    expect(forced).toMatchObject({ from: 'source' });
    expect(forced.data.currentSeason.overall.kills).toBe(2);
    expect((await service.getProfile(PLAYER)).data.currentSeason.overall.kills).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('cache keys are canonical: the same request in another key order hits the cache', async () => {
    const { service, spy } = setup(() => []);
    await service.getOperators({ player: PLAYER, seasonId: 'all', playlistId: 'all', mapId: 'all' });
    const reordered = { mapId: 'all', playlistId: 'all', seasonId: 'all', player: { id: PLAYER.id, platform: 'pc' } } as never;
    expect((await service.getOperators(reordered)).from).toBe('cache');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cacheKey('getOperators', { b: 1, a: 2 })).toBe(cacheKey('getOperators', { a: 2, b: 1 }));
    expect(cacheKey('getOperators', { a: 1 })).not.toBe(cacheKey('getMaps', { a: 1 }));
  });

  test('the cache hands out copies: changing an answer does not change the next one', async () => {
    const { service } = setup(() => profile(5));
    await service.getProfile(PLAYER);
    const cached = await service.getProfile(PLAYER);
    cached.data.currentSeason.overall.kills = 999;
    expect((await service.getProfile(PLAYER)).data.currentSeason.overall.kills).toBe(5);
  });
});

describe('stats service failures and concurrency', () => {
  test('a failing source falls back to the last answer, even an expired one, marked stale_cache', async () => {
    let fail = false;
    const { clock, service } = setup(() => {
      if (fail) throw appError('network', 'offline');
      return profile(5);
    });
    await service.getProfile(PLAYER);
    clock.advance(30 * MINUTE_MS);
    fail = true;
    const stale = await service.getProfile(PLAYER);
    expect(stale).toMatchObject({ from: 'stale_cache', fetchedAt: NOW });
    expect(stale.data.currentSeason.overall.kills).toBe(5);
    expect(await service.getProfile(PLAYER, { force: true })).toMatchObject({ from: 'stale_cache' });
  });

  test('without a cached answer the AppError is rethrown as is; not_found never falls back', async () => {
    let code: 'network' | 'not_found' = 'network';
    let fail = true;
    const { clock, service } = setup(() => {
      if (fail) throw appError(code, 'nope', code === 'network' ? 30 : null);
      return profile(1);
    });
    await expect(service.getProfile(PLAYER)).rejects.toEqual({ code: 'network', message: 'nope', retryAfterSec: 30 });
    fail = false;
    await service.getProfile(PLAYER);
    clock.advance(10 * MINUTE_MS);
    fail = true;
    code = 'not_found';
    await expect(service.getProfile(PLAYER)).rejects.toMatchObject({ code: 'not_found' });
  });

  test('a thrown non-AppError becomes an AppError', async () => {
    const { service } = setup(() => {
      throw new TypeError('boom');
    });
    await expect(service.getMatch('m-1' as MatchId)).rejects.toEqual({ code: 'unknown', message: 'boom', retryAfterSec: null });
  });

  test('identical requests in flight share one source call; different ones do not', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, spy } = setup(async () => {
      await gate;
      return profile(7);
    });
    const a = service.getProfile(PLAYER);
    const b = service.getProfile({ id: PLAYER.id, platform: 'pc' });
    const c = service.getProfile(PLAYER, { force: true });
    const other = service.getProfile({ platform: 'psn', id: 'p-2' as PlayerId });
    release();
    const [ra, rb, rc] = await Promise.all([a, b, c, other]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(ra).toEqual(rb);
    expect(rc).toEqual(ra);
    expect(ra.from).toBe('source');
    // Once settled, nothing is left in flight: a forced call goes to the source again.
    await service.getProfile(PLAYER, { force: true });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test('artificial latency: none for 0, 250-600 ms of deterministic jitter by default, never on a cache hit', async () => {
    const sleeps: number[] = [];
    const base = createManualClock(NOW);
    const clock: Clock = { now: () => base.now(), sleep: async (ms) => { sleeps.push(ms); } };
    const zero = setup(() => ({}), { clock, latencyMs: 0 });
    await zero.service.getMatch('m-1' as MatchId);
    expect(sleeps).toEqual([]);

    const { provider } = fakeProvider(() => ({}));
    const make = () => createStatsService({ provider, cache: createMemoryCacheStore(), snapshots: createMemorySnapshotStore(), clock, game });
    const one = make();
    for (let i = 0; i < 5; i += 1) await one.getMatch(`m-${i}` as MatchId);
    await one.getMatch('m-0' as MatchId);
    expect(sleeps).toHaveLength(5);
    expect(sleeps.every((ms) => ms >= 250 && ms <= 600)).toBe(true);
    const again: number[] = sleeps.splice(0);
    const two = make();
    for (let i = 0; i < 5; i += 1) await two.getMatch(`m-${i}` as MatchId);
    expect(sleeps).toEqual(again);
  });
});

describe('profile snapshots', () => {
  test('a snapshot per source fetch whose numbers changed; cache hits and unchanged numbers add none', async () => {
    let current = profile(5);
    const { clock, service, snapshots } = setup(() => current);
    await service.getProfile(PLAYER);
    await service.getProfile(PLAYER); // cache hit
    await service.getProfile(PLAYER, { force: true }); // same numbers
    expect(await snapshots.list(PLAYER)).toHaveLength(1);
    clock.advance(MINUTE_MS);
    current = profile(6);
    await service.getProfile(PLAYER, { force: true });
    current = { ...profile(6), lastPlayedAt: '2026-11-15T12:30:00.000Z' as IsoDateTime }; // not a counted number
    await service.getProfile(PLAYER, { force: true });
    current = profile(6, 101); // level changed
    await service.getProfile(PLAYER, { force: true });
    const list = await snapshots.list(PLAYER);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({
      player: PLAYER,
      takenAt: NOW,
      seasonId: 'Y11S3',
      level: 100,
      rank: { points: 2750, rankId: 'r3.gold-3' },
      counters: [
        { playlistId: 'all', matches: 10, wins: 6, losses: 4, kills: 5, deaths: 9 },
        { playlistId: 'ranked', matches: 10, wins: 6, losses: 4, kills: 5, deaths: 9 },
      ],
    });
    expect(list[1]?.takenAt).toBe('2026-11-15T12:01:00.000Z');
    expect(list[2]?.level).toBe(101);
    expect(list[0]?.profile).toEqual(profile(5));
  });

  test('a stale answer is not a refresh: no snapshot', async () => {
    let fail = false;
    const { service, snapshots } = setup(() => {
      if (fail) throw appError('unavailable', 'down');
      return profile(5);
    });
    await service.getProfile(PLAYER);
    fail = true;
    await service.getProfile(PLAYER, { force: true });
    expect(await snapshots.list(PLAYER)).toHaveLength(1);
  });
});

describe('wiring', () => {
  const appConfig = (provider: 'mock' | 'live'): AppConfig => ({ schemaVersion: 1, provider, backendUrl: null, links: { bug_report: null, community: null } });
  const services = (provider: 'mock' | 'live') =>
    createAppServices({
      info: { name: 'Sightline', version: '0.0.0', runtime: 'browser', isDev: true },
      config: appConfig(provider),
      gameConfig: loadBundledGameConfig(),
      clock: createManualClock(NOW),
      settingsStore: createMemorySettingsStore(),
      links: { open: async () => undefined },
      statsLatencyMs: 0,
    });

  test('with the live provider nothing is built yet and every stats call says not_configured', async () => {
    const core = services('live');
    await expect(core.stats.getProfile(PLAYER)).rejects.toMatchObject({ code: 'not_configured' });
    await expect(core.stats.getCapabilities()).rejects.toMatchObject({ code: 'not_configured' });
    await expect(createUnconfiguredStatsClient('x').searchPlayer({ name: 'a', platform: 'pc', limit: 1 })).rejects.toMatchObject({ code: 'not_configured', message: 'x' });
  });

  test('with the mock: config, search, profile, matches and a match, over the cache', async () => {
    const core = services('mock');
    const config = await core.app.getGameConfig();
    expect(config.dataVersion).toBe(loadBundledGameConfig().dataVersion);
    const [hit] = (await core.stats.searchPlayer({ name: 'e', platform: 'pc', limit: 1 })).data;
    expect(hit).toBeDefined();
    const key = { platform: hit?.platform ?? 'pc', id: hit?.id ?? ('' as PlayerId) };
    const profile = await core.stats.getProfile(key);
    expect(profile.data.player.id).toBe(key.id);
    const matches = await core.stats.getMatches({ player: key, playlistIds: 'all', mapId: 'all', period: 'all', cursor: null, limit: 5 });
    const first = matches.data.items[0];
    if (first) expect((await core.stats.getMatch(first.id)).data.id).toBe(first.id);
    expect((await core.stats.getProfile(key)).from).toBe('cache');
    await core.data.clearCache();
    expect((await core.stats.getProfile(key)).from).toBe('source');
    expect((await core.stats.getCapabilities()).encounters).toBe(true);
  });
});
