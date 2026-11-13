import { useSyncExternalStore } from 'react';

/**
 * Whether the in-app history can move back or forward, for the title-bar buttons and the shortcuts.
 *
 * Read from the Navigation API (window.navigation), which knows the app's own session-history entries
 * and fires `currententrychange` on every push, replace and traversal. Chromium has it, so Electron
 * always does. Where it is missing both directions report true, so the controls are never stuck
 * disabled; going back past the first entry is then simply a no-op of the router.
 */

const api = (): Navigation | undefined => ('navigation' in window ? window.navigation : undefined);

function subscribe(onChange: () => void): () => void {
  const navigation = api();
  if (!navigation) return () => undefined;
  navigation.addEventListener('currententrychange', onChange);
  return () => navigation.removeEventListener('currententrychange', onChange);
}

/** -1 = back, 1 = forward. */
export type HistoryStep = -1 | 1;

/** Non-hook read, for event handlers: true when the history has an entry in that direction (or it cannot tell). */
export function canStep(step: HistoryStep): boolean {
  const navigation = api();
  if (!navigation) return true;
  return step === -1 ? navigation.canGoBack : navigation.canGoForward;
}

const canGoBack = (): boolean => canStep(-1);
const canGoForward = (): boolean => canStep(1);
const always = (): boolean => true;

export interface HistoryState {
  canGoBack: boolean;
  canGoForward: boolean;
}

/** Live back / forward availability; re-renders when the current history entry changes. */
export function useHistoryState(): HistoryState {
  return {
    canGoBack: useSyncExternalStore(subscribe, canGoBack, always),
    canGoForward: useSyncExternalStore(subscribe, canGoForward, always),
  };
}
