import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as TabDots from '@renderer/app/tab-dots';

/** The store is module state that lasts for the session, so every test loads a fresh copy. */
type TabDotsModule = typeof TabDots;
let store: TabDotsModule;

beforeEach(async () => {
  vi.resetModules();
  store = await import('@renderer/app/tab-dots');
});

describe('tab dots', () => {
  test('no tab has a dot at the start of a session', () => {
    expect(Object.values(store.getTabDots())).toEqual([false, false, false, false, false]);
  });

  test('a dot can be set on a tab that is not open, and only that tab gets it', () => {
    store.setOpenTab('home');
    store.setTabDot('live', true);
    expect(store.getTabDots()).toEqual({ home: false, leaderboards: false, legend: false, profile: false, live: true });
  });

  test('opening a tab clears its dot, and leaving it again does not bring the dot back', () => {
    store.setOpenTab('home');
    store.setTabDot('live', true);
    store.setOpenTab('live');
    expect(store.getTabDots().live).toBe(false);
    store.setOpenTab('home');
    expect(store.getTabDots().live).toBe(false);
  });

  test('the open tab never gets a dot: what happens there is already on screen', () => {
    store.setOpenTab('live');
    store.setTabDot('live', true);
    expect(store.getTabDots().live).toBe(false);
  });

  test('on a page that is not a tab (Settings), every tab can get a dot', () => {
    store.setOpenTab(null);
    store.setTabDot('home', true);
    store.setTabDot('profile', true);
    expect(store.getTabDots()).toMatchObject({ home: true, profile: true });
  });

  test('a dot can be taken back by whoever set it', () => {
    store.setTabDot('home', true);
    store.setTabDot('home', false);
    expect(store.getTabDots().home).toBe(false);
  });

  test('subscribers hear real changes only, and the snapshot is stable between them', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribeTabDots(listener);
    const before = store.getTabDots();
    store.setTabDot('home', false); // already off
    expect(listener).not.toHaveBeenCalled();
    expect(store.getTabDots()).toBe(before);

    store.setTabDot('home', true);
    store.setTabDot('home', true); // already on
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getTabDots()).not.toBe(before);

    unsubscribe();
    store.setTabDot('home', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('tabForPath', () => {
  test('each tab owns its path and what is below it; Home owns only "/"', () => {
    expect(store.tabForPath('/')).toBe('home');
    expect(store.tabForPath('/leaderboards')).toBe('leaderboards');
    expect(store.tabForPath('/legend-division')).toBe('legend');
    expect(store.tabForPath('/profile')).toBe('profile');
    expect(store.tabForPath('/profile/pc/abc')).toBe('profile');
    expect(store.tabForPath('/live')).toBe('live');
  });

  test('pages that are not tabs belong to none', () => {
    expect(store.tabForPath('/settings/themes')).toBeNull();
    expect(store.tabForPath('/livestream')).toBeNull();
  });
});
