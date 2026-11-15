import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PERIOD, PERIOD_PARAM, PLAYLISTS_PARAM, periodDays, periodPhrase, readPeriod, readPlaylists, toMatchPeriod,
  writeHistoryParams,
} from '@renderer/features/profile/history/history-params';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { PlaylistId, SeasonId } from '@shared/types/primitives';
import { toIso } from '@shared/util/time';

const game = createGameIndex(loadBundledGameConfig());
const params = (search: string): URLSearchParams => new URLSearchParams(search);

/** What the history's Season period asks for at a moment: the rule useCurrentSeason() applies (config + clock). */
const seasonPeriodAt = (iso: string) => toMatchPeriod('season', game.currentSeasonAt(toIso(Date.parse(iso))).id);

describe('the period', () => {
  test('read from the URL: 7, 30, 90 or season; anything else is the default, 30 days', () => {
    expect(DEFAULT_PERIOD).toBe('30');
    expect(readPeriod(params(''))).toBe('30');
    expect(readPeriod(params(`${PERIOD_PARAM}=90`))).toBe('90');
    expect(readPeriod(params(`${PERIOD_PARAM}=season`))).toBe('season');
    expect(readPeriod(params(`${PERIOD_PARAM}=365`))).toBe('30');
  });

  test('days periods ask for that many days back; Season asks for the season passed in', () => {
    expect(toMatchPeriod('7', 'Y11S3' as SeasonId)).toEqual({ kind: 'days', days: 7 });
    expect(toMatchPeriod('90', 'Y11S3' as SeasonId)).toEqual({ kind: 'days', days: 90 });
    expect(toMatchPeriod('season', 'Y11S2' as SeasonId)).toEqual({ kind: 'season', seasonId: 'Y11S2' });
    expect([periodDays('7'), periodDays('30'), periodDays('90'), periodDays('season')]).toEqual([7, 30, 90, null]);
    expect(periodPhrase('season')).toBe('this season');
    expect(periodPhrase('7')).toBe('in the last 7 days');
  });

  test('the Season period follows the clock across a season boundary, whatever the manifest says', () => {
    expect(seasonPeriodAt('2026-11-15T12:00:00.000Z')).toEqual({ kind: 'season', seasonId: 'Y11S3' });
    expect(seasonPeriodAt('2026-11-30T23:59:59.999Z')).toEqual({ kind: 'season', seasonId: 'Y11S3' });
    expect(seasonPeriodAt('2026-12-01T00:00:00.000Z')).toEqual({ kind: 'season', seasonId: 'Y11S4' });
    expect(seasonPeriodAt('2026-12-03T12:00:00.000Z')).toEqual({ kind: 'season', seasonId: 'Y11S4' });
  });
});

describe('the playlist chips', () => {
  test('only ids the config knows, each once, in config order; none is All', () => {
    expect(readPlaylists(params(''), game)).toBe('all');
    expect(readPlaylists(params(`${PLAYLISTS_PARAM}=nope`), game)).toBe('all');
    expect(readPlaylists(params(`${PLAYLISTS_PARAM}=standard,nope,ranked,standard`), game)).toEqual(['ranked', 'standard']);
  });
});

describe('writeHistoryParams', () => {
  test('sets the filters and drops defaults, keeping every other parameter', () => {
    const start = params('tab=overview&x=1');
    const set = writeHistoryParams(start, { period: '90', playlists: ['ranked', 'standard'] as PlaylistId[] });
    expect(set.toString()).toBe('tab=overview&x=1&hperiod=90&hp=ranked%2Cstandard');
    expect(start.toString()).toBe('tab=overview&x=1');
    const cleared = writeHistoryParams(set, { period: DEFAULT_PERIOD, playlists: 'all' });
    expect(cleared.toString()).toBe('tab=overview&x=1');
    expect(writeHistoryParams(set, { playlists: [] }).has(PLAYLISTS_PARAM)).toBe(false);
    expect(writeHistoryParams(set, {}).toString()).toBe(set.toString());
  });
});
