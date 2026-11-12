import type { Bridge } from '@shared/types/bridge';

let current: Bridge | null = null;

/**
 * Picks the bridge once at start-up: the real one under Electron, otherwise an in-page stand-in
 * (loaded on demand, so the Electron build never runs it).
 */
export async function initBridge(): Promise<Bridge> {
  current ??= window.bridge ?? (await import('./browser-bridge')).createBrowserBridge();
  return current;
}

/** The only door out of the UI. Usable anywhere after initBridge() has resolved. */
export const bridge: Bridge = new Proxy({} as Bridge, {
  get(_target, property) {
    if (!current) throw new Error('bridge used before initBridge() finished');
    return current[property as keyof Bridge];
  },
});
