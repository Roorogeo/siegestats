import type { Bridge } from '../types/bridge';

/** One channel carries every call, one carries every event; the manifest says which names are valid. */
export const IPC_INVOKE = 'bridge:invoke';
export const IPC_EVENT = 'bridge:event';

/**
 * Runtime description of the Bridge type: per namespace, which members are calls (request -> reply)
 * and which are subscriptions (main pushes, the callback receives). The preload builds window.bridge
 * from this list and main refuses anything that is not on it.
 */
export const BRIDGE_MANIFEST = {
  app: { calls: ['getInfo', 'getGameConfig', 'openLink'], events: [] },
  window: { calls: ['minimize', 'toggleMaximize', 'close', 'isMaximized'], events: ['onMaximizedChange'] },
  settings: { calls: ['get', 'update'], events: ['onChange'] },
  stats: {
    calls: [
      'searchPlayer', 'getProfile', 'getSeasons', 'getOperators', 'getMaps', 'getMatches', 'getMatch',
      'getEncounters', 'getLeaderboard', 'getRankDistribution', 'getCapabilities',
    ],
    events: [],
  },
  trends: { calls: ['get'], events: [] },
  favorites: { calls: ['list', 'add', 'remove'], events: ['onChange'] },
  searches: { calls: ['recent', 'remember'], events: [] },
  notifications: { calls: ['list', 'markRead'], events: ['onChange'] },
  live: { calls: ['getView', 'retry', 'simulate'], events: ['onView'] },
  overlay: { calls: ['toggle'], events: [] },
  data: { calls: ['clearCache'], events: [] },
} as const satisfies {
  [N in keyof Bridge]: { calls: readonly (keyof Bridge[N])[]; events: readonly (keyof Bridge[N])[] };
};

export type BridgeNamespace = keyof Bridge;

// Compile-time proof that the manifest names every member of every namespace.
type Listed<N extends BridgeNamespace> =
  | (typeof BRIDGE_MANIFEST)[N]['calls'][number]
  | (typeof BRIDGE_MANIFEST)[N]['events'][number];
type Unlisted = { [N in BridgeNamespace]: Exclude<keyof Bridge[N], Listed<N>> }[BridgeNamespace];
export const MANIFEST_IS_COMPLETE: [Unlisted] extends [never] ? true : never = true;

const has = (list: readonly string[], name: unknown): name is string => typeof name === 'string' && list.includes(name);

export const isBridgeNamespace = (ns: unknown): ns is BridgeNamespace =>
  typeof ns === 'string' && Object.prototype.hasOwnProperty.call(BRIDGE_MANIFEST, ns);

export const isBridgeCall = (ns: BridgeNamespace, method: unknown): method is string =>
  has(BRIDGE_MANIFEST[ns].calls, method);

export const isBridgeEvent = (ns: BridgeNamespace, name: unknown): name is string =>
  has(BRIDGE_MANIFEST[ns].events, name);
