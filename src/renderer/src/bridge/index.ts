import type { Bridge } from '@shared/types/bridge';

let current: Bridge | null = null;

/**
 * Picks the bridge once at start-up: the real one under Electron, otherwise an in-page stand-in
 * (loaded on demand, so the Electron build never runs it).
 */
export async function initBridge(): Promise<Bridge> {
  if (current) return current;
  if (window.bridge) current = window.bridge;
  // The stand-in exists only in the browser build. In the desktop app a missing bridge means the preload failed,
  // and running on localStorage instead would silently lose settings.
  else if (__WEB_BUILD__) current = (await import('./browser-bridge')).createBrowserBridge();
  else throw new Error('The desktop bridge did not load.');
  return current;
}

/** The only door out of the UI. Usable anywhere after initBridge() has resolved. */
export const bridge: Bridge = new Proxy({} as Bridge, {
  get(_target, property) {
    if (!current) throw new Error('bridge used before initBridge() finished');
    return current[property as keyof Bridge];
  },
});
