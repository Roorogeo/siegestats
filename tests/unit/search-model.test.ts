import { describe, expect, test } from 'vitest';
import { orderResults, splitMatch, stepIndex, withoutRepeats } from '@renderer/features/search/search-model';
import type { PlayerKey, PlayerSearchResult } from '@shared/types/player';
import type { PlayerId } from '@shared/types/primitives';

const result = (id: string, exactMatch = false): PlayerSearchResult => ({
  platform: 'pc',
  id: id as PlayerId,
  name: id,
  avatarUrl: null,
  exactMatch,
  level: null,
  rankId: null,
  lastPlayedAt: null,
});
const item = (platform: PlayerKey['platform'], id: string, tag = '') => ({ player: { platform, id: id as PlayerId }, tag });

describe('orderResults', () => {
  test('exact matches first, otherwise the source order; the input is untouched', () => {
    const list = [result('a'), result('b', true), result('c'), result('d', true)];
    expect(orderResults(list).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(list.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('withoutRepeats', () => {
  test('each player once, in the first group that has them; the same id on another platform is another player', () => {
    const pinned = [item('pc', 'a', 'pinned')];
    const favorites = [item('pc', 'a', 'fav'), item('psn', 'a', 'fav'), item('pc', 'b', 'fav')];
    const recent = [item('pc', 'b', 'recent'), item('pc', 'c', 'recent'), item('pc', 'c', 'recent-again')];
    const [p, f, r] = withoutRepeats([pinned, favorites, recent]);
    expect(p?.map((x) => x.tag)).toEqual(['pinned']);
    expect(f?.map((x) => `${x.player.platform}:${x.player.id}`)).toEqual(['psn:a', 'pc:b']);
    expect(r?.map((x) => x.tag)).toEqual(['recent']);
  });
});

describe('stepIndex', () => {
  test('wraps at both ends', () => {
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(1, 3, 1)).toBe(2);
    expect(stepIndex(1, 3, -1)).toBe(0);
  });

  test('from no active option, Down goes to the first and Up to the last; no options is -1', () => {
    expect(stepIndex(-1, 4, 1)).toBe(0);
    expect(stepIndex(-1, 4, -1)).toBe(3);
    expect(stepIndex(7, 4, 1)).toBe(0);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});

describe('splitMatch', () => {
  test('splits around the first case-insensitive occurrence of the trimmed text', () => {
    expect(splitMatch('Otter_919', '  ter ')).toEqual({ before: 'Ot', match: 'ter', after: '_919' });
    expect(splitMatch('Otter_919', 'OTT')).toEqual({ before: '', match: 'Ott', after: 'er_919' });
  });

  test('null when nothing is typed, the text does not occur, or lower-casing changes the length', () => {
    expect(splitMatch('Otter', '   ')).toBeNull();
    expect(splitMatch('Otter', 'xyz')).toBeNull();
    expect(splitMatch('İstanbul', 'stan')).toBeNull();
  });
});
