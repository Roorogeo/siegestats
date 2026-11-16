import type { GameIndex } from '@shared/game-config';
import type { PlayerProfile } from '@shared/types/player';
import type { SeasonId } from '@shared/types/primitives';
import type { AppError, Fetched, StatsCalls, StatsClient, StatsMethod, StatsProvider } from '@shared/types/provider';
import type { ProfileSnapshot, SnapshotCounters } from '@shared/types/storage';
import type { RankPoint } from '@shared/types/stats';
import { appError, toAppError } from '@shared/util/errors';
import { canonicalJson, jsonCopy } from '@shared/util/json';
import { hashSeed } from '@shared/util/random';
import { MINUTE_MS, SECOND_MS, toIso, toMs } from '@shared/util/time';
import type { CacheEntry, CacheStore, Clock, SnapshotStore } from '../ports';

/**
 * How long a cached answer counts as fresh (design question 17). One table for every call: a player's page
 * follows the brief's 5 minutes for profiles, boards and the distribution its 3 minutes for leaderboards, a
 * finished match never changes, search results go stale quickly. null = kept until the cache is cleared.
 */
export const CACHE_TTL_MS: Readonly<Record<StatsMethod, number | null>> = {
  searchPlayer: 60 * SECOND_MS,
  getProfile: 5 * MINUTE_MS,
  getSeasons: 5 * MINUTE_MS,
  getOperators: 5 * MINUTE_MS,
  getMaps: 5 * MINUTE_MS,
  getMatches: 5 * MINUTE_MS,
  getEncounters: 5 * MINUTE_MS,
  getMatch: null,
  getLeaderboard: 3 * MINUTE_MS,
  getRankDistribution: 3 * MINUTE_MS,
};

const STATS_METHODS = Object.keys(CACHE_TTL_MS) as StatsMethod[];

/** Errors after which the last cached answer is shown instead (the source is down, not the request wrong). */
const STALE_FALLBACK: ReadonlySet<AppError['code']> = new Set(['network', 'unavailable', 'rate_limited', 'unknown']);

/** Default artificial latency of a source call, so loading states can be seen while developing on the mock. */
export const DEFAULT_LATENCY_MS = { min: 250, max: 600 } as const;

/** `seasonInForce` is set for a request whose answer depends on the season in force (seasonDependent()). */
export const cacheKey = (method: StatsMethod, request: unknown, seasonInForce: SeasonId | null = null): string =>
  `${method}${seasonInForce === null ? '' : `@${seasonInForce}`}:${canonicalJson(request)}`;

/**
 * Whether the answer depends on which season is in force: a profile's currentSeason, a search hit's current rank, a
 * board or distribution asked for 'current'. Their cache keys carry that season, so once a new season starts no
 * answer cached for the one before is served as current (nor as the stale fallback).
 */
export function seasonDependent(method: StatsMethod, request: unknown): boolean {
  if (method === 'getProfile' || method === 'searchPlayer') return true;
  if (method !== 'getLeaderboard' && method !== 'getRankDistribution') return false;
  return typeof request === 'object' && request !== null && (request as { seasonId?: unknown }).seasonId === 'current';
}

export interface StatsServiceDeps {
  provider: StatsProvider;
  cache: CacheStore;
  snapshots: SnapshotStore;
  clock: Clock;
  /** Picks the Ranked standing a snapshot records. */
  game: GameIndex;
  /** Artificial latency per source call: a fixed number of ms (0 = none), or undefined for 250-600 ms with deterministic jitter. */
  latencyMs?: number;
}

export type StatsService = StatsClient & {
  /** Drops every cached answer ("Clear cache"); snapshots stay. */
  clearCache(): Promise<void>;
};

/**
 * The provider as the UI sees it: cached per call and request, `force` to bypass the cache (Update / refresh),
 * the last known answer when the source fails, one source call for identical requests in flight, and a
 * snapshot of every profile fetched from the source whose numbers changed.
 */
export function createStatsService(deps: StatsServiceDeps): StatsService {
  const { provider, cache, snapshots, clock, game } = deps;
  const inFlight = new Map<string, Promise<Fetched<unknown>>>();
  let calls = 0;

  const latency = (key: string): number => {
    if (deps.latencyMs !== undefined) return Math.max(0, deps.latencyMs);
    const { min, max } = DEFAULT_LATENCY_MS;
    calls += 1;
    return min + (hashSeed(key, calls) % (max - min + 1));
  };

  async function fromSource<K extends StatsMethod>(method: K, request: StatsCalls[K]['request'], key: string): Promise<Fetched<StatsCalls[K]['response']>> {
    let data: StatsCalls[K]['response'];
    try {
      const wait = latency(key);
      if (wait > 0) await clock.sleep(wait);
      const call = provider[method] as (r: StatsCalls[K]['request']) => Promise<StatsCalls[K]['response']>;
      data = await call.call(provider, request);
    } catch (error) {
      const appErr = toAppError(error);
      if (STALE_FALLBACK.has(appErr.code)) {
        const stale = await cache.get(key).catch(() => null);
        if (stale) return { data: stale.value as StatsCalls[K]['response'], fetchedAt: stale.storedAt, from: 'stale_cache' };
      }
      throw appErr;
    }
    const fetchedAt = clock.now();
    const ttl = CACHE_TTL_MS[method];
    const entry: CacheEntry = { key, method, value: data, storedAt: fetchedAt, expiresAt: ttl === null ? null : toIso(toMs(fetchedAt) + ttl) };
    // A cache or snapshot store that fails must not lose the answer the source just gave.
    await cache.set(entry).catch(() => undefined);
    if (method === 'getProfile') await recordSnapshot(data as PlayerProfile, fetchedAt).catch(() => undefined);
    return { data, fetchedAt, from: 'source' };
  }

  async function recordSnapshot(profile: PlayerProfile, takenAt: ProfileSnapshot['takenAt']): Promise<void> {
    const key = { platform: profile.player.platform, id: profile.player.id };
    const snapshot: ProfileSnapshot = {
      player: key,
      takenAt,
      seasonId: profile.currentSeason.seasonId,
      level: profile.level,
      rank: ladderRank(game, profile),
      counters: counters(profile),
      profile,
    };
    const previous = await snapshots.latest(key);
    if (previous && sameNumbers(previous, snapshot)) return;
    await snapshots.add(snapshot);
  }

  function call<K extends StatsMethod>(method: K, request: StatsCalls[K]['request'], opts?: { force: boolean }): Promise<Fetched<StatsCalls[K]['response']>> {
    const key = cacheKey(method, request, seasonDependent(method, request) ? game.currentSeasonAt(clock.now()).id : null);
    const join = (): Promise<Fetched<StatsCalls[K]['response']>> | undefined =>
      inFlight.get(key) as Promise<Fetched<StatsCalls[K]['response']>> | undefined;
    const run = async (): Promise<Fetched<StatsCalls[K]['response']>> => {
      // A source call already running for this request answers this one too (checked before and after the cache read).
      const early = join();
      if (early) return early;
      if (opts?.force !== true) {
        const cached = await cache.get(key).catch(() => null);
        if (cached && (cached.expiresAt === null || toMs(cached.expiresAt) > toMs(clock.now()))) {
          return { data: cached.value as StatsCalls[K]['response'], fetchedAt: cached.storedAt, from: 'cache' };
        }
      }
      // Identical requests share one source call, forced or not: both want fresh data, and they get the same.
      const pending = join();
      if (pending) return pending;
      const started = fromSource(method, request, key);
      inFlight.set(key, started);
      const forget = (): void => {
        if (inFlight.get(key) === started) inFlight.delete(key);
      };
      started.then(forget, forget);
      return started;
    };
    return run();
  }

  const client = Object.fromEntries(
    STATS_METHODS.map((method) => [method, (request: unknown, opts?: { force: boolean }) => call(method, request as never, opts)]),
  ) as unknown as StatsClient;

  return {
    ...client,
    getCapabilities: async () => jsonCopy(provider.capabilities),
    clearCache: () => cache.clear(),
  };
}

/** The standing a snapshot records: the season's Ranked ladder, if the player is placed on it. */
function ladderRank(game: GameIndex, profile: PlayerProfile): RankPoint | null {
  for (const entry of profile.currentSeason.byPlaylist) {
    if (game.playlist(entry.playlistId)?.points === 'ladder' && entry.standing?.rank) return entry.standing.rank;
  }
  return null;
}

function counters(profile: PlayerProfile): SnapshotCounters[] {
  const { overall, byPlaylist } = profile.currentSeason;
  const row = (playlistId: SnapshotCounters['playlistId'], s: typeof overall): SnapshotCounters => ({
    playlistId,
    matches: s.matches,
    wins: s.wins,
    losses: s.losses,
    kills: s.kills,
    deaths: s.deaths,
  });
  return [row('all', overall), ...byPlaylist.map((p) => row(p.playlistId, p))];
}

/** "Only when the numbers changed" (design question 32): season, level, rank and counters; the payload is not compared. */
function sameNumbers(a: ProfileSnapshot, b: ProfileSnapshot): boolean {
  return (
    a.seasonId === b.seasonId &&
    a.level === b.level &&
    canonicalJson(a.rank) === canonicalJson(b.rank) &&
    canonicalJson(a.counters) === canonicalJson(b.counters)
  );
}

/** The client used while no provider can run (provider 'live' before phase 7): every call is refused, nothing is built. */
export function createUnconfiguredStatsClient(message: string): StatsService {
  const refuse = (): Promise<never> => Promise.reject(appError('not_configured', message));
  const client = Object.fromEntries(STATS_METHODS.map((method) => [method, refuse])) as unknown as StatsClient;
  return { ...client, getCapabilities: refuse, clearCache: async () => undefined };
}
