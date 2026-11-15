import { describe, expect, test } from 'vitest';
import { createManualClock } from '@core/memory/clock';
import { createMockProvider, summarize } from '@core/stats/mock/mock-provider';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { MatchHistoryQuery, MatchSummary } from '@shared/types/match';
import type { IsoDateTime, MapId, MatchId, PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import { DAY_MS, toIso, toMs } from '@shared/util/time';

const NOW = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const game = createGameIndex(loadBundledGameConfig());
const clock = createManualClock(NOW);
const provider = createMockProvider({ game, clock });
const world = provider.world();
const keyOf = (p: PlayerKey): PlayerKey => ({ platform: p.platform, id: p.id });
const busiest = [...world.accounts].sort((a, b) => (world.participations.get(b.key)?.length ?? 0) - (world.participations.get(a.key)?.length ?? 0))[0]?.ref as PlayerRef;

const query = (over: Partial<MatchHistoryQuery> = {}): MatchHistoryQuery => ({
  player: keyOf(busiest),
  playlistIds: 'all',
  mapId: 'all',
  period: 'all',
  cursor: null,
  limit: 20,
  ...over,
});

async function everyPage(q: MatchHistoryQuery): Promise<{ items: MatchSummary[]; pages: number }> {
  const items: MatchSummary[] = [];
  let pages = 0;
  let cursor: string | null = null;
  do {
    const page = await provider.getMatches({ ...q, cursor });
    pages += 1;
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { items, pages };
}

describe('searchPlayer', () => {
  const target = world.accounts.find((a) => a.ref.platform === 'psn' && a.ref.name.length >= 6)?.ref as PlayerRef;

  test('case-insensitive, exact match first and flagged, then prefixes, then substrings', async () => {
    const results = await provider.searchPlayer({ name: `  ${target.name.toUpperCase()} `, platform: 'psn', limit: 10 });
    expect(results[0]).toMatchObject({ id: target.id, name: target.name, exactMatch: true, platform: 'psn' });
    expect(results.slice(1).every((r) => !r.exactMatch)).toBe(true);
    const part = target.name.slice(1, 4).toLowerCase();
    const partial = await provider.searchPlayer({ name: part, platform: 'psn', limit: 50 });
    expect(partial.some((r) => r.id === target.id)).toBe(true);
    expect(partial.every((r) => r.name.toLowerCase().includes(part))).toBe(true);
    const order = partial.map((r) => (r.name.toLowerCase() === part ? 0 : r.name.toLowerCase().startsWith(part) ? 1 : 2));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('only the asked platform, respects the limit, empty for an empty name', async () => {
    const pc = await provider.searchPlayer({ name: 'a', platform: 'pc', limit: 5 });
    expect(pc).toHaveLength(5);
    expect(pc.every((r) => r.platform === 'pc')).toBe(true);
    expect(await provider.searchPlayer({ name: target.name, platform: 'xbl', limit: 10 })).not.toContainEqual(expect.objectContaining({ id: target.id }));
    expect(await provider.searchPlayer({ name: '   ', platform: 'pc', limit: 10 })).toEqual([]);
    expect((await provider.searchPlayer({ name: 'a', platform: 'pc', limit: 10_000 })).length).toBeLessThanOrEqual(50);
  });

  test('results carry level, current rank and last played, consistent with the profile', async () => {
    const [hit] = await provider.searchPlayer({ name: target.name, platform: 'psn', limit: 1 });
    const profile = await provider.getProfile(keyOf(target));
    expect(hit?.level).toBe(profile.level);
    expect(hit?.lastPlayedAt).toBe(profile.lastPlayedAt);
    const rank = profile.currentSeason.byPlaylist.find((p) => p.playlistId === 'ranked')?.standing?.rank?.rankId ?? null;
    expect(hit?.rankId).toBe(rank);
  });
});

describe('getMatches', () => {
  test('cursor pagination returns every match exactly once, newest first, with the same summary on every page', async () => {
    const all = await provider.getMatches(query({ limit: 100 }));
    const { items, pages } = await everyPage(query({ limit: 7 }));
    expect(pages).toBeGreaterThan(3);
    expect(new Set(items.map((m) => m.id)).size).toBe(items.length);
    expect(items.length).toBe(all.summary.matches);
    const times = items.map((m) => toMs(m.startedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const second = await provider.getMatches(query({ limit: 7, cursor: (await provider.getMatches(query({ limit: 7 }))).nextCursor }));
    expect(second.summary).toEqual(all.summary);
    expect(all.summary).toEqual(summarize(items, (id) => game.playlist(id)?.points ?? null));
  });

  test('the summary covers the whole filtered set, not the page', async () => {
    const { items } = await everyPage(query({ limit: 50 }));
    const page = await provider.getMatches(query({ limit: 3 }));
    expect(page.items).toHaveLength(3);
    expect(page.summary.matches).toBe(items.length);
    expect(page.summary.wins).toBe(items.filter((m) => m.result === 'win').length);
    expect(page.summary.kills).toBe(items.reduce((s, m) => s + m.kills, 0));
    const first = items[0];
    let streak = 0;
    while (items[streak]?.result === first?.result) streak += 1;
    expect(page.summary.streak).toEqual({ result: first?.result, length: streak });
    const ranked = items.filter((m) => m.playlistId === 'ranked');
    expect(page.summary.pointsChange).toBe(ranked.reduce((s, m) => s + (m.rankChange?.delta ?? 0), 0));
  });

  test('playlist chips and the map filter', async () => {
    const { items: all } = await everyPage(query({ limit: 100 }));
    const chips = ['standard', 'quick-match'] as PlaylistId[];
    const { items: casual } = await everyPage(query({ playlistIds: chips, limit: 100 }));
    expect(casual.length).toBe(all.filter((m) => m.playlistId === 'standard' || m.playlistId === 'quick-match').length);
    expect(casual.every((m) => m.rankChange === null)).toBe(true);
    const page = await provider.getMatches(query({ playlistIds: chips, limit: 1 }));
    expect(page.summary.pointsChange).toBeNull();
    const map = all[0]?.mapId as MapId;
    const { items: onMap } = await everyPage(query({ mapId: map, limit: 100 }));
    expect(onMap.length).toBe(all.filter((m) => m.mapId === map).length);
    expect((await provider.getMatches(query({ playlistIds: [] }))).items).toEqual([]);
  });

  test('day periods count back from the clock now, inclusively, at the exact boundary', async () => {
    const { items: all } = await everyPage(query({ limit: 100 }));
    for (const days of [7, 30, 90] as const) {
      const { items } = await everyPage(query({ period: { kind: 'days', days }, limit: 100 }));
      expect(items.length).toBe(all.filter((m) => toMs(m.startedAt) >= toMs(NOW) - days * DAY_MS).length);
    }
    const edge = all[Math.floor(all.length / 3)] as MatchSummary;
    clock.set(toIso(toMs(edge.startedAt) + 7 * DAY_MS));
    try {
      const at = await everyPage(query({ period: { kind: 'days', days: 7 }, limit: 100 }));
      expect(at.items.at(-1)?.id).toBe(edge.id);
      clock.advance(1);
      const after = await everyPage(query({ period: { kind: 'days', days: 7 }, limit: 100 }));
      expect(after.items.some((m) => m.id === edge.id)).toBe(false);
    } finally {
      clock.set(NOW);
    }
  });

  test('season period: that season only; a summary-only season lists nothing', async () => {
    const { items } = await everyPage(query({ period: { kind: 'season', seasonId: 'Y11S3' as SeasonId }, limit: 100 }));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((m) => m.seasonId === 'Y11S3')).toBe(true);
    const old = await provider.getMatches(query({ period: { kind: 'season', seasonId: 'Y9S1' as SeasonId } }));
    expect(old).toEqual({ items: [], nextCursor: null, summary: { matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, streak: null, pointsChange: null } });
  });

  test('a cursor that is not ours is refused; unknown players and matches are not_found', async () => {
    await expect(provider.getMatches(query({ cursor: 'garbage' }))).rejects.toMatchObject({ code: 'unknown' });
    await expect(provider.getMatches(query({ player: { platform: 'pc', id: 'nobody' as never } }))).rejects.toMatchObject({ code: 'not_found' });
    // An id is only valid on its own platform.
    await expect(provider.getProfile({ platform: busiest.platform === 'pc' ? 'psn' : 'pc', id: busiest.id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(provider.getProfile({ platform: 'switch', id: busiest.id } as never)).rejects.toMatchObject({ code: 'not_found' });
    await expect(provider.getMatch('m-nope' as MatchId)).rejects.toMatchObject({ code: 'not_found', retryAfterSec: null });
    await expect(provider.getEncounters({ platform: 'xbl', id: 'x' as never })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('getOperators and getMaps', () => {
  test('operator rounds add up to the rounds of the filtered matches (one pick per player per round)', async () => {
    const { items } = await everyPage(query({ playlistIds: ['ranked' as PlaylistId], period: { kind: 'season', seasonId: 'Y11S3' as SeasonId }, limit: 100 }));
    let rounds = 0;
    for (const m of items) rounds += (await provider.getMatch(m.id)).rounds?.length ?? 0;
    const ops = await provider.getOperators({ player: keyOf(busiest), seasonId: 'Y11S3' as SeasonId, playlistId: 'ranked' as PlaylistId, mapId: 'all' });
    expect(ops.reduce((s, o) => s + o.rounds, 0)).toBe(rounds);
    expect(ops.reduce((s, o) => s + o.kills, 0)).toBe(items.reduce((s, m) => s + m.kills, 0));
    const sorted = ops.map((o) => o.rounds);
    expect([...sorted].sort((a, b) => b - a)).toEqual(sorted);
    const attackers = ops.filter((o) => game.operator(o.operatorId)?.side === 'attack');
    expect(attackers.length).toBeGreaterThan(0);
  });

  test('best attacker / defender = most rounds on that side this season', async () => {
    const ops = await provider.getOperators({ player: keyOf(busiest), seasonId: 'Y11S3' as SeasonId, playlistId: 'all', mapId: 'all' });
    const profile = await provider.getProfile(keyOf(busiest));
    const top = (side: 'attack' | 'defense') => ops.filter((o) => game.operator(o.operatorId)?.side === side)[0];
    expect(profile.currentSeason.bestAttacker).toEqual(top('attack'));
    expect(profile.currentSeason.bestDefender).toEqual(top('defense'));
  });

  test('map stats sum to the filtered matches; the map filter keeps one row', async () => {
    const maps = await provider.getMaps({ player: keyOf(busiest), seasonId: 'all', playlistId: 'all', mapId: 'all' });
    const { items } = await everyPage(query({ limit: 100 }));
    expect(maps.reduce((s, m) => s + m.matches, 0)).toBe(items.length);
    const one = maps[0];
    const only = await provider.getMaps({ player: keyOf(busiest), seasonId: 'all', playlistId: 'all', mapId: one?.mapId as MapId });
    expect(only).toEqual([one]);
  });

  test('a summary-only season knows only its best operators', async () => {
    const seasons = await provider.getSeasons(keyOf(busiest));
    const old = seasons.find((s) => s.seasonId === 'Y10S1');
    if (!old) return;
    const ops = await provider.getOperators({ player: keyOf(busiest), seasonId: old.seasonId, playlistId: 'all', mapId: 'all' });
    expect(ops.map((o) => o.operatorId).sort()).toEqual([old.bestAttacker?.operatorId, old.bestDefender?.operatorId].filter(Boolean).sort());
    expect(await provider.getMaps({ player: keyOf(busiest), seasonId: old.seasonId, playlistId: 'all', mapId: 'all' })).toEqual([]);
  });
});

describe('leaderboards and rank distribution', () => {
  const lb = (over: Record<string, unknown> = {}) =>
    provider.getLeaderboard({ playlistId: 'ranked', metric: 'points', scope: 'global', seasonId: 'current', regionId: 'all', page: 1, pageSize: 25, ...over } as never);

  test('pages: positions run on, totals stay, beyond the end is empty', async () => {
    const first = await lb();
    const second = await lb({ page: 2 });
    expect(first.totalEntries).toBeGreaterThan(50);
    expect(second.entries[0]?.position).toBe(26);
    expect(second.totalEntries).toBe(first.totalEntries);
    const last = Math.ceil(first.totalEntries / 25);
    expect((await lb({ page: last + 1 })).entries).toEqual([]);
    expect(first.updatedAt <= NOW).toBe(true);
  });

  test('scopes: PC and console boards hold only their pool, and together make the global board', async () => {
    const all = await lb({ pageSize: 100, page: 1 });
    const pc = await lb({ scope: 'pc', pageSize: 100 });
    const console_ = await lb({ scope: 'console', pageSize: 100 });
    expect(pc.entries.every((e) => e.player.platform === 'pc')).toBe(true);
    expect(console_.entries.every((e) => e.player.platform !== 'pc')).toBe(true);
    expect(pc.totalEntries + console_.totalEntries).toBe(all.totalEntries);
  });

  test('previous positions: some rows moved, none is outside the previous board', async () => {
    const board = await lb({ pageSize: 100 });
    const moved = board.entries.filter((e) => e.previousPosition !== null && e.previousPosition !== e.position);
    expect(moved.length).toBeGreaterThan(0);
    for (const e of board.entries) if (e.previousPosition !== null) expect(e.previousPosition).toBeLessThanOrEqual(board.totalEntries);
  });

  test('K/D and win-rate boards need 20 matches; level ignores the playlist', async () => {
    const kdBoard = await lb({ metric: 'kd', pageSize: 100 });
    for (const e of kdBoard.entries) {
      const profile = await provider.getProfile(keyOf(e.player));
      expect(profile.currentSeason.byPlaylist.find((p) => p.playlistId === 'ranked')?.matches).toBeGreaterThanOrEqual(20);
    }
    const level = await lb({ metric: 'level', pageSize: 5 });
    expect(level.entries[0]?.value).toBe(level.entries[0]?.level);
  });

  test('Legend Division: regional board with region and position columns, and a region filter', async () => {
    const all = await lb({ playlistId: 'legend-division', pageSize: 100 });
    expect(all.totalEntries).toBeGreaterThan(10);
    expect(all.entries.every((e) => e.regionId !== null && e.regionalPosition !== null && e.rank !== undefined)).toBe(true);
    const ones = all.entries.filter((e) => e.regionalPosition === 1);
    expect(new Set(ones.map((e) => e.regionId)).size).toBe(ones.length); // one leader per region
    const emea = await lb({ playlistId: 'legend-division', regionId: 'emea', pageSize: 100 });
    expect(emea.entries.every((e) => e.regionId === 'emea')).toBe(true);
    expect(emea.entries.map((e) => e.regionalPosition)).toEqual(emea.entries.map((_, i) => i + 1));
    const level = await lb({ playlistId: 'legend-division', metric: 'level', pageSize: 100 });
    expect(level.totalEntries).toBe(all.totalEntries); // a regional board lists only its own players, whatever the sort
    expect(level.entries.every((e) => e.regionId !== null)).toBe(true);
    const before = await lb({ playlistId: 'legend-division', seasonId: 'Y11S2' });
    expect(before).toMatchObject({ entries: [], totalEntries: 0 });
  });

  test('refusals: no leaderboard, unknown playlist or season', async () => {
    await expect(lb({ playlistId: 'standard' })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(lb({ playlistId: 'nope' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(lb({ seasonId: 'Y99S1' })).rejects.toMatchObject({ code: 'not_found' });
  });

  test('rank distribution: one bucket per division of that season, hundreds of thousands of profiles, global = PC + console', async () => {
    const dist = (scope: string, seasonId = 'current') =>
      provider.getRankDistribution({ playlistId: 'ranked', scope, seasonId } as never);
    const global = await dist('global');
    const pc = await dist('pc');
    const con = await dist('console');
    expect(global.buckets.map((b) => b.rankId)).toEqual(game.ranksOf('ranked-3').map((r) => r.id));
    expect(global.totalProfiles).toBe(global.buckets.reduce((s, b) => s + b.count, 0));
    expect(global.totalProfiles).toBeGreaterThan(100_000);
    expect(global.buckets.map((b, i) => b.count - (pc.buckets[i]?.count ?? 0) - (con.buckets[i]?.count ?? 0))).toEqual(global.buckets.map(() => 0));
    const counts = global.buckets.map((b) => b.count);
    const peak = counts.indexOf(Math.max(...counts));
    expect(peak).toBeGreaterThan(5); // most players in the middle tiers, not Copper
    expect(peak).toBeLessThan(35);
    expect((await dist('global', 'Y10S1')).buckets).toHaveLength(36); // Ranked 2.0 ladder that season
    expect(await dist('global')).toEqual(global);
    await expect(provider.getRankDistribution({ playlistId: 'legend-division', scope: 'global', seasonId: 'current' } as never)).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('provider answers', () => {
  test('are copies: changing one never changes the world', async () => {
    const a = await provider.getProfile(keyOf(busiest));
    a.player.name = 'changed';
    a.currentSeason.overall.kills = -1;
    const b = await provider.getProfile(keyOf(busiest));
    expect(b.player.name).toBe(busiest.name);
    expect(b.currentSeason.overall.kills).toBeGreaterThanOrEqual(0);
  });

  test('a player with no match this season gets an empty current season, not a missing one', async () => {
    const idle = world.accounts.find((a) => !(world.participations.get(a.key) ?? []).some((p) => p.match.season.id === world.currentSeasonId));
    if (!idle) return;
    const profile = await provider.getProfile(keyOf(idle.ref));
    expect(profile.currentSeason).toMatchObject({ seasonId: world.currentSeasonId, byPlaylist: [], bestAttacker: null });
    expect(profile.currentSeason.overall).toMatchObject({ matches: 0, headshotPct: null, damagePerRound: null });
  });

  test('all capabilities are on', () => {
    expect(provider.id).toBe('mock');
    expect(Object.values(provider.capabilities).every((v) => v === true || Array.isArray(v))).toBe(true);
    expect(provider.capabilities.leaderboardMetrics).toEqual(['points', 'kd', 'winRate', 'level']);
  });
});
