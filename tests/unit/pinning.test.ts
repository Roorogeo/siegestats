import { describe, expect, test } from 'vitest';
import { withoutPinned, withPinned } from '@renderer/features/profile/pinning';
import type { PlayerRef } from '@shared/types/player';
import type { IsoDateTime, PlayerId } from '@shared/types/primitives';
import type { AccountSettings } from '@shared/types/settings';

const AT = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const LATER = '2026-11-16T12:00:00.000Z' as IsoDateTime;
const ref = (platform: PlayerRef['platform'], id: string, name = id): PlayerRef => ({ platform, id: id as PlayerId, name, avatarUrl: null });
const A = ref('pc', 'a', 'Alpha');
const B = ref('psn', 'b', 'Bravo');
const C = ref('xbl', 'c', 'Charlie');
const EMPTY: AccountSettings = { pinned: [], active: null };
const key = (p: PlayerRef) => ({ platform: p.platform, id: p.id });

describe('withPinned', () => {
  test('the first account pinned becomes the active one', () => {
    expect(withPinned(EMPTY, A, AT)).toEqual({ pinned: [{ player: A, pinnedAt: AT }], active: key(A) });
  });

  test('later pins go to the end and leave the active account, unless makeActive', () => {
    const one = withPinned(EMPTY, A, AT);
    const two = withPinned(one, B, LATER);
    expect(two.pinned.map((p) => p.player.id)).toEqual(['a', 'b']);
    expect(two.active).toEqual(key(A));
    expect(withPinned(two, C, LATER, true).active).toEqual(key(C));
  });

  test('an account is pinned once; pinning it again can still make it active', () => {
    const two = withPinned(withPinned(EMPTY, A, AT), B, AT);
    const again = withPinned(two, { ...B, name: 'Renamed' }, LATER, true);
    expect(again.pinned).toEqual(two.pinned);
    expect(again.active).toEqual(key(B));
    expect(withPinned(two, B, LATER).pinned).toBe(two.pinned);
  });

  test('only the PlayerRef fields are stored, and the active account is a bare key', () => {
    const result = { ...A, exactMatch: true, level: 120, rankId: null };
    const next = withPinned(EMPTY, result, AT);
    expect(next.pinned[0]?.player).toEqual(A);
    expect(Object.keys(next.pinned[0]?.player ?? {}).sort()).toEqual(['avatarUrl', 'id', 'name', 'platform']);
    expect(next.active).toEqual({ platform: 'pc', id: 'a' });
  });

  test('the same id on another platform is another account', () => {
    const next = withPinned(withPinned(EMPTY, A, AT), ref('xbl', 'a'), AT);
    expect(next.pinned).toHaveLength(2);
  });
});

describe('withoutPinned', () => {
  const three = withPinned(withPinned(withPinned(EMPTY, A, AT), B, AT), C, AT, true);

  test('unpinning an inactive account keeps the active one', () => {
    const next = withoutPinned(three, key(B));
    expect(next.pinned.map((p) => p.player.id)).toEqual(['a', 'c']);
    expect(next.active).toEqual(key(C));
  });

  test('unpinning the active account hands over to the first remaining one, then to nobody', () => {
    const next = withoutPinned(three, key(C));
    expect(next.active).toEqual(key(A));
    const last = withoutPinned(withoutPinned(next, key(A)), key(B));
    expect(last).toEqual({ pinned: [], active: null });
  });

  test('another platform with the same id, or an account not pinned, changes nothing', () => {
    expect(withoutPinned(three, { platform: 'psn', id: 'c' as PlayerId })).toEqual(three);
  });
});
