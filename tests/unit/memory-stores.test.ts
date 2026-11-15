import { describe, expect, test } from 'vitest';
import { createMemoryCacheStore } from '@core/memory/cache-store';
import { createManualClock } from '@core/memory/clock';
import { createMemoryFavoritesStore, createMemorySearchHistoryStore, MAX_RECENT_SEARCHES } from '@core/memory/favorites-store';
import { createMemorySnapshotStore } from '@core/memory/snapshot-store';
import type { Favorite } from '@shared/types/storage';
import type { IsoDateTime, PlayerId } from '@shared/types/primitives';
import type { PlayerRef } from '@shared/types/player';
import { MINUTE_MS } from '@shared/util/time';

const NOW = '2026-11-15T12:00:00.000Z' as IsoDateTime;
const ref = (id: string, name = `Name${id}`, platform: PlayerRef['platform'] = 'pc'): PlayerRef => ({ platform, id: id as PlayerId, name, avatarUrl: null });

describe('favourites (in memory until phase 6)', () => {
  test('add, list newest first, remove, and every change is announced with the full list', async () => {
    const clock = createManualClock(NOW);
    const favorites = createMemoryFavoritesStore(clock);
    const seen: Favorite[][] = [];
    const stop = favorites.onChange((all) => seen.push(all));
    await favorites.add(ref('a'));
    clock.advance(MINUTE_MS);
    await favorites.add(ref('b', 'Bee', 'psn'));
    expect((await favorites.list()).map((f) => f.player.id)).toEqual(['b', 'a']);
    expect((await favorites.list())[1]).toEqual({ player: ref('a'), addedAt: NOW, lastKnownRank: null });
    await favorites.remove({ platform: 'pc', id: 'a' as PlayerId });
    expect((await favorites.list()).map((f) => f.player.id)).toEqual(['b']);
    expect(seen.map((list) => list.length)).toEqual([1, 2, 1]);
    stop();
    await favorites.add(ref('c'));
    expect(seen).toHaveLength(3);
  });

  test('adding twice keeps one entry; the same id on another platform is another player', async () => {
    const favorites = createMemoryFavoritesStore(createManualClock(NOW));
    await favorites.add(ref('a'));
    await favorites.add(ref('a', 'Renamed'));
    await favorites.add(ref('a', 'Other', 'xbl'));
    const list = await favorites.list();
    expect(list.map((f) => [f.player.platform, f.player.name])).toEqual([['xbl', 'Other'], ['pc', 'Renamed']]);
    await favorites.remove({ platform: 'psn', id: 'a' as PlayerId }); // not a favourite: nothing happens
    expect(await favorites.list()).toHaveLength(2);
  });

  test('input from the bridge is checked: junk is refused, extra fields are dropped', async () => {
    const favorites = createMemoryFavoritesStore(createManualClock(NOW));
    await expect(favorites.add({ platform: 'switch', id: 'x', name: 'x' } as never)).rejects.toMatchObject({ code: 'unknown' });
    await expect(favorites.remove(null as never)).rejects.toMatchObject({ code: 'unknown' });
    await favorites.add({ ...ref('a'), avatarUrl: 'javascript:alert(1)', extra: 1 } as never);
    const [first] = await favorites.list();
    expect(first?.player).toEqual(ref('a'));
    // What list() returns is a copy.
    if (first) first.player.name = 'changed';
    expect((await favorites.list())[0]?.player.name).toBe('Namea');
  });
});

describe('recent searches', () => {
  test('newest first, one entry per player, at most 10', async () => {
    const clock = createManualClock(NOW);
    const searches = createMemorySearchHistoryStore(clock);
    for (let i = 0; i < 12; i += 1) {
      await searches.remember(ref(String(i)));
      clock.advance(1000);
    }
    await searches.remember(ref('5', 'Five again'));
    const recent = await searches.recent();
    expect(recent).toHaveLength(MAX_RECENT_SEARCHES);
    expect(recent.map((r) => r.player.id)).toEqual(['5', '11', '10', '9', '8', '7', '6', '4', '3', '2']);
    expect(recent[0]).toEqual({ player: ref('5', 'Five again'), searchedAt: '2026-11-15T12:00:12.000Z' });
    await expect(searches.remember({ id: 'x' } as never)).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('cache, snapshot store and clock', () => {
  test('the cache store keeps JSON copies and clears', async () => {
    const cache = createMemoryCacheStore();
    const value = { a: [1] };
    await cache.set({ key: 'k', method: 'getMatch', value, storedAt: NOW, expiresAt: null });
    value.a.push(2);
    const hit = await cache.get('k');
    expect(hit).toEqual({ key: 'k', method: 'getMatch', value: { a: [1] }, storedAt: NOW, expiresAt: null });
    (hit?.value as { a: number[] }).a.push(3);
    expect((await cache.get('k'))?.value).toEqual({ a: [1] });
    await cache.clear();
    expect(await cache.get('k')).toBeNull();
    expect(cache.size()).toBe(0);
  });

  test('snapshots per player, oldest first, latest', async () => {
    const store = createMemorySnapshotStore();
    const player = { platform: 'pc' as const, id: 'p' as PlayerId };
    expect(await store.latest(player)).toBeNull();
    const snap = (takenAt: string) => ({ player, takenAt: takenAt as IsoDateTime, seasonId: 'Y11S3' as never, level: 1, rank: null, counters: [], profile: {} as never });
    await store.add(snap('2026-11-15T12:00:00.000Z'));
    await store.add(snap('2026-11-15T13:00:00.000Z'));
    await store.add({ ...snap('2026-11-15T14:00:00.000Z'), player: { platform: 'psn', id: 'p' as PlayerId } });
    expect((await store.list(player)).map((s) => s.takenAt)).toEqual(['2026-11-15T12:00:00.000Z', '2026-11-15T13:00:00.000Z']);
    expect((await store.latest(player))?.takenAt).toBe('2026-11-15T13:00:00.000Z');
  });

  test('the manual clock moves only when told, and sleep moves it', async () => {
    const clock = createManualClock(NOW);
    expect(clock.now()).toBe(NOW);
    await clock.sleep(1500);
    expect(clock.now()).toBe('2026-11-15T12:00:01.500Z');
    clock.set('2027-01-01T00:00:00.000Z' as IsoDateTime);
    expect(clock.now()).toBe('2027-01-01T00:00:00.000Z');
    expect(() => createManualClock('yesterday')).toThrow();
  });
});
