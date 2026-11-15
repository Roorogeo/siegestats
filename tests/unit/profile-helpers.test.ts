import { describe, expect, test } from 'vitest';
import { createManualClock } from '@core/memory/clock';
import { createMockProvider } from '@core/stats/mock/mock-provider';
import { ladderPlaylist, ladderRankText, ladderStats, pointsUnit } from '@renderer/features/profile/overview/ladder';
import { parseProfileTab, profileTabSearch } from '@renderer/features/profile/profile-tabs';
import { readFilters, scopeTotal, seasonLabel, statsQuery } from '@renderer/features/profile/tabs/stats-params';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { PlayerKey } from '@shared/types/player';
import type { IsoDateTime, PlayerId, PlaylistId, SeasonId } from '@shared/types/primitives';
import type { PlaylistStats, SeasonRecord } from '@shared/types/stats';

const NOW = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const game = createGameIndex(loadBundledGameConfig());
const provider = createMockProvider({ game, clock: createManualClock(NOW) });
const LUHAL: PlayerKey = { platform: 'pc', id: '17c92055-6505-482b-922b-f80b5a5c03a1' as PlayerId };
const ZALVOK: PlayerKey = { platform: 'pc', id: '3e7b27a1-3c75-4430-b770-2aed61b8a03b' as PlayerId };
const CURRENT = 'Y11S3' as SeasonId;

const line = (over: Partial<PlaylistStats>): PlaylistStats => ({
  playlistId: 'ranked' as PlaylistId,
  matches: 0,
  wins: 0,
  losses: 0,
  rounds: 0,
  damagePerRound: null,
  kills: 0,
  deaths: 0,
  assists: 0,
  headshotPct: null,
  standing: null,
  ...over,
});

describe('ladder helpers', () => {
  test('the ladder playlist is the config\'s one with ladder points', () => {
    const ladder = ladderPlaylist(game);
    expect(ladder?.id).toBe('ranked');
    expect(ladder?.points).toBe('ladder');
  });

  test('pointsUnit: RP on the ladder, points on a plain-points playlist, RP for anything else', () => {
    expect(pointsUnit(game, 'ranked' as PlaylistId)).toBe('RP');
    expect(pointsUnit(game, 'legend-division' as PlaylistId)).toBe('points');
    expect(pointsUnit(game, 'standard' as PlaylistId)).toBe('RP');
    expect(pointsUnit(game, 'not-in-config' as PlaylistId)).toBe('RP');
    expect(pointsUnit(game, null)).toBe('RP');
  });

  test('ladderRankText: placements only for ranked matches without a rank, running now or unfinished before', () => {
    const rank = { points: 2500, rankId: null };
    expect(ladderRankText(null, true)).toBeNull();
    expect(ladderRankText(line({ matches: 0 }), true)).toBeNull();
    expect(ladderRankText(line({ matches: 4, standing: { rank, peak: rank, topPosition: null } }), true)).toBeNull();
    expect(ladderRankText(line({ matches: 4, standing: null }), true)).toBe('In placements');
    expect(ladderRankText(line({ matches: 4, standing: { rank: null, peak: null, topPosition: null } }), false)).toBe('Placements unfinished');
  });

  test('ladderStats picks the Ranked line of a season; a mid-placements player reads In placements', async () => {
    const ladder = ladderPlaylist(game);
    const records = await provider.getSeasons(ZALVOK);
    const current = records.find((r) => r.seasonId === CURRENT);
    if (!current) throw new Error('no current season');
    const stats = ladderStats(current, ladder);
    expect(stats?.playlistId).toBe('ranked');
    expect(stats?.matches ?? 0).toBeGreaterThan(0);
    expect(ladderRankText(stats, true)).toBe('In placements');
    expect(ladderStats(current, null)).toBeNull();
    expect(ladderStats({ ...current, byPlaylist: current.byPlaylist.filter((p) => p.playlistId !== 'ranked') }, ladder)).toBeNull();
  });
});

describe('stats filters', () => {
  const read = (search: string, prefix: 'o' | 'm' = 'o') => readFilters(new URLSearchParams(search), prefix, game, CURRENT);

  test('a missing or unknown season is the season passed in; "all" is All seasons', () => {
    expect(read('')).toEqual({ seasonId: CURRENT, playlistId: 'all' });
    expect(read('oseason=Y99S9')).toEqual({ seasonId: CURRENT, playlistId: 'all' });
    expect(read('oseason=all')).toEqual({ seasonId: 'all', playlistId: 'all' });
    expect(read('oseason=Y10S1&oplaylist=ranked')).toEqual({ seasonId: 'Y10S1', playlistId: 'ranked' });
    expect(read('oseason=Y10S1&oplaylist=nope')).toEqual({ seasonId: 'Y10S1', playlistId: 'all' });
    expect(readFilters(new URLSearchParams(''), 'o', game, 'Y11S4' as SeasonId).seasonId).toBe('Y11S4');
  });

  test('each tab reads its own prefix', () => {
    expect(read('oseason=Y10S1&mplaylist=ranked', 'm')).toEqual({ seasonId: CURRENT, playlistId: 'ranked' });
  });

  test('the query always asks for every map; season labels name the season and its id', () => {
    expect(statsQuery(LUHAL, { seasonId: 'all', playlistId: 'ranked' as PlaylistId })).toEqual({
      player: LUHAL,
      seasonId: 'all',
      playlistId: 'ranked',
      mapId: 'all',
    });
    expect(seasonLabel(game, 'Y11S3' as SeasonId)).toBe('Operation Split Fire (Y11S3)');
    expect(seasonLabel(game, 'Y99S9' as SeasonId)).toBe('Y99S9');
  });

  test('scopeTotal: one season or all of them, overall or one playlist line; unknown until the records load', async () => {
    const records: SeasonRecord[] = await provider.getSeasons(LUHAL);
    const one = records.find((r) => r.seasonId === CURRENT);
    if (!one) throw new Error('no current season');
    const ranked = (r: SeasonRecord) => r.byPlaylist.find((p) => p.playlistId === 'ranked')?.matches ?? 0;
    expect(scopeTotal(undefined, { seasonId: 'all', playlistId: 'all' }, 'matches')).toBeNull();
    expect(scopeTotal(records, { seasonId: CURRENT, playlistId: 'all' }, 'matches')).toBe(one.overall.matches);
    expect(scopeTotal(records, { seasonId: CURRENT, playlistId: 'all' }, 'rounds')).toBe(one.overall.rounds);
    expect(scopeTotal(records, { seasonId: 'all', playlistId: 'all' }, 'matches')).toBe(records.reduce((n, r) => n + r.overall.matches, 0));
    expect(scopeTotal(records, { seasonId: 'all', playlistId: 'ranked' as PlaylistId }, 'matches')).toBe(records.reduce((n, r) => n + ranked(r), 0));
    expect(scopeTotal(records, { seasonId: 'Y99S9' as SeasonId, playlistId: 'all' }, 'matches')).toBe(0);
    const unknownRounds = records.map((r) => (r === one ? { ...r, overall: { ...r.overall, rounds: null } } : r));
    expect(scopeTotal(unknownRounds, { seasonId: 'all', playlistId: 'all' }, 'rounds')).toBeNull();
  });
});

describe('profile tabs', () => {
  test('a link names its tab; anything unknown opens Overview, which is left out of links', () => {
    expect(parseProfileTab('seasons')).toBe('seasons');
    expect(parseProfileTab('linked')).toBe('linked');
    expect(parseProfileTab('nope')).toBe('overview');
    expect(parseProfileTab(null)).toBe('overview');
    expect(profileTabSearch('operators')).toBe('?tab=operators');
    expect(profileTabSearch('overview')).toBe('');
  });
});
