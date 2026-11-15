import type { MatchHistoryQuery } from '@shared/types/match';
import type { Platform } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { StatsCalls, StatsMethod } from '@shared/types/provider';
import { samePlayer } from '@shared/util/player';

/** Kept here too, so existing `queries` imports of samePlayer keep working. */
export { samePlayer };

/**
 * TanStack query keys, built from the request objects the bridge receives, so two components asking the same
 * question share one entry. Every stats key starts with 'stats' and the StatsMethod; the request object follows.
 * TanStack hashes keys with sorted object keys, so property order in a request does not matter.
 */

export const STATS = 'stats';

export type StatsQueryKey<K extends StatsMethod = StatsMethod> = readonly [typeof STATS, K, StatsCalls[K]['request'] | null];

/** useMatches pages over the cursor, so the cursor is not part of the filter or its key. */
export type MatchHistoryFilter = Omit<MatchHistoryQuery, 'cursor'>;
export type MatchPagesKey = readonly [typeof STATS, 'getMatches', MatchHistoryFilter | null, 'pages'];

export const queryKeys = {
  /** Everything from bridge.stats. */
  allStats: () => [STATS] as const,
  /** One call; null = the hook is waiting for its input (route param, search text). */
  stats: <K extends StatsMethod>(method: K, request: StatsCalls[K]['request'] | null): StatsQueryKey<K> => [STATS, method, request],
  /** The match history of useMatches, one entry per filter, holding every loaded page. */
  matchPages: (filter: MatchHistoryFilter | null): MatchPagesKey => [STATS, 'getMatches', filter, 'pages'],
  capabilities: () => [STATS, 'getCapabilities'] as const,
  favorites: () => ['favorites'] as const,
  recentSearches: () => ['searches', 'recent'] as const,
};

/** The calls whose request is about one player: Update re-fetches all of them for that player (design question 17). */
export const PER_PLAYER_METHODS = ['getProfile', 'getSeasons', 'getOperators', 'getMaps', 'getMatches', 'getEncounters'] as const;
type PerPlayerMethod = (typeof PER_PLAYER_METHODS)[number];

/** Which of those take the PlayerKey itself as the request; the others carry it in `request.player`. */
const KEY_IS_REQUEST: ReadonlySet<string> = new Set<PerPlayerMethod>(['getProfile', 'getSeasons', 'getEncounters']);
const KEY_IN_FIELD: ReadonlySet<string> = new Set<PerPlayerMethod>(['getOperators', 'getMaps', 'getMatches']);
const PLATFORMS: ReadonlySet<string> = new Set<Platform>(['pc', 'psn', 'xbl']);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function asPlayerKey(value: unknown): PlayerKey | null {
  if (!isObject(value)) return null;
  const { platform, id } = value;
  if (typeof platform !== 'string' || !PLATFORMS.has(platform) || typeof id !== 'string') return null;
  return { platform, id } as PlayerKey;
}

/** The player a stats query key is about, or null for a key that is not per player (leaderboards, a match, search). */
export function playerOfQueryKey(key: readonly unknown[]): PlayerKey | null {
  if (key[0] !== STATS || typeof key[1] !== 'string') return null;
  const request = key[2];
  if (KEY_IS_REQUEST.has(key[1])) return asPlayerKey(request);
  if (KEY_IN_FIELD.has(key[1])) return isObject(request) ? asPlayerKey(request.player) : null;
  return null;
}

/** True for a key of one of `player`'s per-player queries. */
export function isQueryOfPlayer(key: readonly unknown[], player: PlayerKey): boolean {
  const owner = playerOfQueryKey(key);
  return owner !== null && samePlayer(owner, player);
}
