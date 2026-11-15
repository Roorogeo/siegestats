import type { GameIndex } from '@shared/game-config';
import type { LeaderboardMetric, LeaderboardPage, RankDistribution } from '@shared/types/leaderboard';
import type { Encounter, MatchHistoryPage, MatchHistorySummary, MatchSummary } from '@shared/types/match';
import type {
  IsoDateTime, LeaderboardScope, MapId, MatchId, Platform, PlaylistId, SeasonId,
} from '@shared/types/primitives';
import type { PlayerKey, PlayerProfile, PlayerSearchResult } from '@shared/types/player';
import type { PlayerStatsQuery, ProviderCapabilities, StatsProvider } from '@shared/types/provider';
import type { MapStats, OperatorStats, SeasonRecord } from '@shared/types/stats';
import { appError } from '@shared/util/errors';
import { jsonCopy } from '@shared/util/json';
import { DAY_MS, MINUTE_MS, toIso, toMs } from '@shared/util/time';
import type { Clock } from '../../ports';
import { emptySeasonRecord, generateWorld, matchDetail, matchSummary, mergeOperators } from './generate-world';
import { buildBoard, pageOf, type Board } from './leaderboards';
import { rankDistribution } from './rank-distribution';
import { addTally, emptyTally, toMatchStats, toOperatorStats, type OperatorTally, type Tally } from './tally';
import type { MockAccount, MockWorld, OperatorTallies, Participation } from './world';

/** The seed of the demo world. Fixed, so the demo data (players, ids) is the same on every launch (design question 21). */
export const MOCK_SEED = 20261115;

const PLATFORMS: readonly Platform[] = ['pc', 'psn', 'xbl'];
const SCOPES: readonly LeaderboardScope[] = ['global', 'pc', 'console'];
const METRICS: readonly LeaderboardMetric[] = ['points', 'kd', 'winRate', 'level'];
const MAX_PAGE = 100;

export const MOCK_CAPABILITIES: ProviderCapabilities = {
  operatorStats: true,
  mapStats: true,
  matchHistory: true,
  matchRounds: true,
  rankChangePerMatch: true,
  damage: true,
  encounters: true,
  linkedAccounts: true,
  leaderboardMetrics: [...METRICS],
  rankDistribution: true,
};

export interface MockProviderOptions {
  game: GameIndex;
  clock: Clock;
  seed?: number;
}

export type MockProvider = StatsProvider & {
  /** The generated world (generated on first use). For tests and dev tools; never sent over the bridge. */
  world(): MockWorld;
};

const intIn = (value: unknown, lo: number, hi: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, Math.floor(value))) : fallback;

const notFound = (what: string) => appError('not_found', `${what} was not found.`);

/**
 * StatsProvider over the seeded world: every capability, no latency (the stats service adds that), and every
 * answer a fresh JSON copy, so nothing a caller does can change the world. The world is generated on the first
 * call, relative to the clock's "now" at that moment.
 */
export function createMockProvider({ game, clock, seed = MOCK_SEED }: MockProviderOptions): MockProvider {
  let cached: MockWorld | null = null;
  const world = (): MockWorld => {
    cached ??= generateWorld({ seed, now: clock.now(), game });
    return cached;
  };

  const account = (key: unknown): MockAccount => {
    const k = key as Partial<PlayerKey> | null;
    if (!k || typeof k !== 'object' || !PLATFORMS.includes(k.platform as Platform) || typeof k.id !== 'string') {
      throw notFound('That player');
    }
    const found = world().accountByKey.get(`${k.platform}:${k.id}`);
    if (!found) throw notFound('That player');
    return found;
  };

  const resolveSeason = (seasonId: unknown): SeasonId => {
    if (seasonId === 'current') return world().currentSeasonId;
    const season = typeof seasonId === 'string' ? game.season(seasonId) : null;
    if (!season) throw notFound('That season');
    return season.id;
  };

  const currentLadderRank = (a: MockAccount) => {
    const agg = world().seasons.get(a.key)?.get(world().currentSeasonId);
    for (const playlist of game.config.playlists) {
      if (playlist.points !== 'ladder') continue;
      const rank = agg?.byPlaylist.get(playlist.id)?.standing?.rank;
      if (rank) return rank;
    }
    return null;
  };

  const participations = (a: MockAccount): Participation[] => world().participations.get(a.key) ?? [];
  const lastPlayedAt = (a: MockAccount): IsoDateTime | null => participations(a).at(-1)?.match.startedAt ?? null;

  /** The account's matches that pass the filter bar, oldest first. */
  const filtered = (a: MockAccount, q: Omit<PlayerStatsQuery, 'player'>): Participation[] =>
    participations(a).filter(
      ({ match }) =>
        (q.seasonId === 'all' || match.season.id === q.seasonId) &&
        (q.playlistId === 'all' || match.playlist.id === q.playlistId) &&
        (q.mapId === 'all' || match.map.id === q.mapId),
    );

  const encounterCache = new Map<string, Encounter[]>();
  const boardCache = new Map<string, Board>();

  const provider: MockProvider = {
    id: 'mock',
    capabilities: MOCK_CAPABILITIES,
    world,

    async searchPlayer(query) {
      const needle = typeof query?.name === 'string' ? query.name.trim().toLowerCase() : '';
      if (needle.length === 0 || !PLATFORMS.includes(query.platform)) return [];
      const limit = intIn(query.limit, 1, 50, 10);
      const hits = world()
        .accounts.filter((a) => a.ref.platform === query.platform && a.ref.name.toLowerCase().includes(needle))
        .map((a) => {
          const name = a.ref.name.toLowerCase();
          return { a, order: name === needle ? 0 : name.startsWith(needle) ? 1 : 2 };
        })
        .sort((x, y) => x.order - y.order || x.a.ref.name.localeCompare(y.a.ref.name) || x.a.key.localeCompare(y.a.key))
        .slice(0, limit);
      return jsonCopy(
        hits.map(({ a, order }): PlayerSearchResult => ({
          ...a.ref,
          level: a.person.level,
          rankId: currentLadderRank(a)?.rankId ?? null,
          lastPlayedAt: lastPlayedAt(a),
          exactMatch: order === 0,
        })),
      );
    },

    async getProfile(key) {
      const a = account(key);
      const w = world();
      const records = w.seasonRecords.get(a.key) ?? [];
      const lifetime = emptyTally();
      for (const agg of w.seasons.get(a.key)?.values() ?? []) addTally(lifetime, agg.overall);
      const profile: PlayerProfile = {
        player: a.ref,
        level: a.person.level,
        lastPlayedAt: lastPlayedAt(a),
        currentSeason: records.find((r) => r.seasonId === w.currentSeasonId) ?? emptySeasonRecord(w.currentSeasonId, a),
        lifetime: toMatchStats(lifetime),
        linkedAccounts: a.linked.flatMap((k) => {
          const other = w.accountByKey.get(k);
          return other ? [other.ref] : [];
        }),
      };
      return jsonCopy(profile);
    },

    async getSeasons(key) {
      const a = account(key);
      return jsonCopy<SeasonRecord[]>(world().seasonRecords.get(a.key) ?? []);
    },

    async getOperators(query) {
      const a = account(query?.player);
      const q = query;
      const tallies: OperatorTallies = { attack: new Map(), defense: new Map() };
      const agg = q.seasonId === 'all' ? null : world().seasons.get(a.key)?.get(q.seasonId);
      if (agg && !agg.fromMatches) {
        // A summary-only season knows its best attacker and defender, nothing per playlist or map.
        if (q.playlistId === 'all' && q.mapId === 'all') {
          for (const side of ['attack', 'defense'] as const) for (const [id, t] of agg.operators[side]) tallies[side].set(id, { ...t });
        }
      } else {
        for (const p of filtered(a, q)) mergeOperators(tallies, p.match.slots[p.slot]?.operators ?? []);
      }
      // OperatorStats has no side: an operator playable on both sides is one row.
      const byId = new Map<string, OperatorTally>();
      for (const side of ['attack', 'defense'] as const) {
        for (const [id, t] of tallies[side]) {
          const sum = byId.get(id);
          if (sum) for (const k of Object.keys(t) as (keyof OperatorTally)[]) sum[k] += t[k];
          else byId.set(id, { ...t });
        }
      }
      const rows = [...byId.entries()]
        .map(([id, t]) => toOperatorStats(id as OperatorStats['operatorId'], t))
        .sort((x, y) => y.rounds - x.rounds || x.operatorId.localeCompare(y.operatorId));
      return jsonCopy(rows);
    },

    async getMaps(query) {
      const a = account(query?.player);
      const byMap = new Map<MapId, Tally>();
      for (const p of filtered(a, query)) {
        const t = p.match.slots[p.slot]?.tally;
        if (!t) continue;
        byMap.set(p.match.map.id, addTally(byMap.get(p.match.map.id) ?? emptyTally(), t));
      }
      const rows = [...byMap.entries()]
        .map(([mapId, t]): MapStats => ({ ...toMatchStats(t), mapId }))
        .sort((x, y) => y.matches - x.matches || x.mapId.localeCompare(y.mapId));
      return jsonCopy(rows);
    },

    async getMatches(query) {
      const a = account(query?.player);
      const nowMs = toMs(clock.now());
      const playlistIds = query.playlistIds === 'all' ? null : new Set<string>(Array.isArray(query.playlistIds) ? query.playlistIds : []);
      const period = query.period;
      const fromMs = period !== 'all' && period?.kind === 'days' ? nowMs - intIn(period.days, 1, 3650, 30) * DAY_MS : -Infinity;
      const seasonId = period !== 'all' && period?.kind === 'season' ? period.seasonId : null;
      // Newest first. Participations are in start order and match ids break no ties: two of one account's matches never start together.
      const inPeriod = participations(a).filter(
        ({ match }) =>
          (query.mapId === 'all' || match.map.id === query.mapId) &&
          match.startMs >= fromMs &&
          (seasonId === null || match.season.id === seasonId),
      );
      const list = inPeriod.filter(({ match }) => !playlistIds || playlistIds.has(match.playlist.id)).reverse();
      const perPlaylist = new Map<PlaylistId, number>();
      for (const { match } of inPeriod) perPlaylist.set(match.playlist.id, (perPlaylist.get(match.playlist.id) ?? 0) + 1);
      const periodPlaylists = game.config.playlists
        .filter((pl) => perPlaylist.has(pl.id))
        .map((pl) => ({ playlistId: pl.id, matches: perPlaylist.get(pl.id) ?? 0 }));

      let start = 0;
      if (query.cursor !== null && query.cursor !== undefined) {
        const cursor = decodeCursor(query.cursor);
        if (!cursor) throw appError('unknown', 'That page link is no longer valid.');
        start = list.findIndex(({ match }) => match.startMs < cursor.startMs || (match.startMs === cursor.startMs && match.id < cursor.id));
        if (start < 0) start = list.length;
      }
      const limit = intIn(query.limit, 1, MAX_PAGE, 20);
      const page = list.slice(start, start + limit);
      const last = page.at(-1);
      const result: MatchHistoryPage = {
        items: page.map(matchSummary),
        nextCursor: last && start + limit < list.length ? encodeCursor(last.match.startMs, last.match.id) : null,
        summary: { ...summarize(list.map(matchSummary), (id) => game.playlist(id)?.points ?? null), periodPlaylists },
      };
      return jsonCopy(result);
    },

    async getMatch(id) {
      const match = typeof id === 'string' ? world().matchById.get(id) : undefined;
      if (!match) throw notFound('That match');
      return jsonCopy(matchDetail(game, match));
    },

    async getEncounters(key) {
      const a = account(key);
      let list = encounterCache.get(a.key);
      if (!list) {
        list = encounters(world(), a);
        encounterCache.set(a.key, list);
      }
      return jsonCopy(list);
    },

    async getLeaderboard(query) {
      const playlist = typeof query?.playlistId === 'string' ? game.playlist(query.playlistId) : null;
      if (!playlist) throw notFound('That playlist');
      if (!playlist.leaderboard) throw appError('unsupported', `${playlist.name} has no leaderboard.`);
      if (!METRICS.includes(query.metric)) throw appError('unsupported', 'Unknown leaderboard type.');
      if (!SCOPES.includes(query.scope)) throw appError('unsupported', 'Unknown leaderboard scope.');
      const seasonId = resolveSeason(query.seasonId);
      const regionId = query.regionId !== 'all' && playlist.leaderboard.regionIds.includes(query.regionId) ? query.regionId : 'all';
      const page = intIn(query.page, 1, 1_000_000, 1);
      const pageSize = intIn(query.pageSize, 1, MAX_PAGE, 25);
      const key = `${playlist.id}|${seasonId}|${query.metric}|${query.scope}`;
      let board = boardCache.get(key);
      if (!board) {
        board = game.playlistActiveIn(playlist.id, seasonId)
          ? buildBoard(game, world(), playlist, seasonId, query.metric, query.scope)
          : { rows: [], regional: playlist.leaderboard.regionIds.length > 0 };
        boardCache.set(key, board);
      }
      const { entries, total } = pageOf(board, regionId, page, pageSize);
      const result: LeaderboardPage = { entries, page, pageSize, totalEntries: total, updatedAt: boardTime(clock) };
      return jsonCopy(result);
    },

    async getRankDistribution(query) {
      const playlist = typeof query?.playlistId === 'string' ? game.playlist(query.playlistId) : null;
      if (!playlist) throw notFound('That playlist');
      if (playlist.points !== 'ladder') throw appError('unsupported', `${playlist.name} has no rank divisions.`);
      if (!SCOPES.includes(query.scope)) throw appError('unsupported', 'Unknown leaderboard scope.');
      const seasonId = resolveSeason(query.seasonId);
      const season = game.season(seasonId);
      const system = game.rankSystemFor(seasonId);
      if (!season || !system) throw appError('unsupported', 'That season has no rank ladder in the game config.');
      const updatedAt = boardTime(clock);
      const result: RankDistribution = game.playlistActiveIn(playlist.id, seasonId)
        ? rankDistribution(seed, system, season, query.scope, clock.now(), updatedAt)
        : { totalProfiles: 0, buckets: system.ranks.map((r) => ({ rankId: r.id, count: 0 })), updatedAt };
      return jsonCopy(result);
    },
  };
  return provider;
}

/** Boards look refreshed every 5 minutes. */
const boardTime = (clock: Clock): IsoDateTime => {
  const now = toMs(clock.now());
  return toIso(now - (now % (5 * MINUTE_MS)));
};

const encodeCursor = (startMs: number, id: MatchId): string => `${startMs.toString(36)}.${id}`;

function decodeCursor(cursor: unknown): { startMs: number; id: MatchId } | null {
  if (typeof cursor !== 'string') return null;
  const dot = cursor.indexOf('.');
  if (dot <= 0) return null;
  const startMs = parseInt(cursor.slice(0, dot), 36);
  const id = cursor.slice(dot + 1);
  return Number.isFinite(startMs) && id.length > 0 ? { startMs, id: id as MatchId } : null;
}

/**
 * The summary row over the whole filtered list (newest first). The current streak runs from the newest match.
 * pointsChange sums the per-match changes of the Ranked ladder when the list has any, else of a plain-points
 * playlist (Legend Division), and only inside the season of the newest such match: a season reset (and a new rank
 * system) starts the count again, so points of different seasons or systems are never added together.
 * periodPlaylists is left empty here; getMatches fills it from the list before the playlist filter.
 */
export function summarize(items: readonly MatchSummary[], pointsOf: (playlistId: PlaylistId) => 'ladder' | 'plain' | null): MatchHistorySummary {
  const summary: MatchHistorySummary = {
    matches: items.length, wins: 0, losses: 0, kills: 0, deaths: 0, streak: null,
    pointsChange: null, pointsChangeSeasonId: null, periodPlaylists: [],
  };
  const sums: Record<'ladder' | 'plain', { seasonId: SeasonId; total: number } | null> = { ladder: null, plain: null };
  for (const m of items) {
    if (m.result === 'win') summary.wins += 1;
    if (m.result === 'loss') summary.losses += 1;
    summary.kills += m.kills;
    summary.deaths += m.deaths;
    if (m.rankChange && m.playlistId) {
      const kind = pointsOf(m.playlistId);
      if (kind === null) continue;
      const sum = sums[kind] ?? { seasonId: m.seasonId, total: 0 }; // newest first: the first match fixes the season
      if (m.seasonId === sum.seasonId) sum.total += m.rankChange.delta;
      sums[kind] = sum;
    }
  }
  const counted = sums.ladder ?? sums.plain;
  if (counted) {
    summary.pointsChange = counted.total;
    summary.pointsChangeSeasonId = counted.seasonId;
  }
  const first = items[0];
  if (first && first.result !== 'draw') {
    let length = 0;
    while (items[length]?.result === first.result) length += 1;
    summary.streak = { result: first.result, length };
  }
  return summary;
}

function encounters(world: MockWorld, owner: MockAccount): Encounter[] {
  const met = new Map<string, Encounter>();
  for (const { match, slot } of world.participations.get(owner.key) ?? []) {
    const own = match.slots[slot];
    if (!own) continue;
    const won = own.team === match.winner;
    match.slots.forEach((s, i) => {
      if (i === slot) return;
      const e = met.get(s.account.key) ?? {
        player: s.account.ref,
        matches: 0,
        asTeammate: 0,
        asOpponent: 0,
        wins: 0,
        lastMetAt: match.startedAt,
        lastMatchId: match.id,
      };
      e.matches += 1;
      if (s.team === own.team) e.asTeammate += 1;
      else e.asOpponent += 1;
      if (won) e.wins += 1;
      e.lastMetAt = match.startedAt; // participations are oldest first: the last write is the latest meeting
      e.lastMatchId = match.id;
      met.set(s.account.key, e);
    });
  }
  return [...met.values()]
    .filter((e) => e.matches >= 2)
    .sort((a, b) => b.matches - a.matches || b.lastMetAt.localeCompare(a.lastMetAt) || a.player.name.localeCompare(b.player.name));
}

