import { useSyncExternalStore } from 'react';

/** How often "X ago" labels move on. */
export const NOW_TICK_MS = 30_000;

let now = Date.now();
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, NOW_TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.clearInterval(timer);
  };
}

// While nobody listens the shared value is not ticking: refresh it on read when it is a tick old.
function snapshot(): number {
  if (listeners.size === 0 && Date.now() - now >= NOW_TICK_MS) now = Date.now();
  return now;
}

/**
 * The current time in epoch ms, re-rendering every 30 s, for timeAgo() / updatedAgo() labels. One shared timer
 * serves every component that uses it, so all labels on screen move together.
 */
export const useNow = (): number => useSyncExternalStore(subscribe, snapshot, snapshot);
