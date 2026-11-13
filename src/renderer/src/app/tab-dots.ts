import { useSyncExternalStore } from 'react';
import { TABS, type TabId } from './routes';

/**
 * "A tab shows a dot when it has something new" (docs/design.md, question 29).
 *
 * Rules: a dot clears when its tab is opened, a tab that is open never gets one (what happens there is
 * already on screen), and dots last for the session only (memory, not settings). Whoever detects
 * something new calls setTabDot(tab, true); the shell reports which tab is open with setOpenTab.
 * Nothing sets a dot in phase 1.
 */

export type TabDots = Readonly<Record<TabId, boolean>>;

const NONE: TabDots = { home: false, leaderboards: false, legend: false, profile: false, live: false };

let dots: TabDots = NONE;
let openTab: TabId | null = null;
const listeners = new Set<() => void>();

function publish(next: TabDots): void {
  dots = next;
  for (const listener of listeners) listener();
}

/** Marks a tab as having something new (on) or not (off). Ignored for the tab that is open. */
export function setTabDot(tab: TabId, on: boolean): void {
  if (on && tab === openTab) return;
  if (dots[tab] === on) return;
  publish({ ...dots, [tab]: on });
}

/** The tab on screen, or null on a page that is not a tab (Settings). Opening a tab clears its dot. */
export function setOpenTab(tab: TabId | null): void {
  openTab = tab;
  if (tab) setTabDot(tab, false);
}

export const getTabDots = (): TabDots => dots;

export function subscribeTabDots(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useTabDots = (): TabDots => useSyncExternalStore(subscribeTabDots, getTabDots, getTabDots);

/** Which tab a route belongs to: "/" is Home only, every other tab owns its path and what is below it. */
export function tabForPath(pathname: string): TabId | null {
  for (const tab of TABS) {
    if (tab.path === '/' ? pathname === '/' : pathname === tab.path || pathname.startsWith(`${tab.path}/`)) return tab.id;
  }
  return null;
}
