import type { AppConfig, GameConfig } from '@shared/types/game-config';
import type { AppInfo, Bridge } from '@shared/types/bridge';
import { createGameIndex } from '@shared/game-config';
import { appError, notBuiltYet } from '@shared/util/errors';
import { jsonCopy } from '@shared/util/json';
import type { Clock, LinkOpener, SettingsStore } from './ports';
import { createMemoryCacheStore } from './memory/cache-store';
import { createMemoryFavoritesStore, createMemorySearchHistoryStore } from './memory/favorites-store';
import { createMemorySnapshotStore } from './memory/snapshot-store';
import { createSettingsService, type SettingsService } from './settings/service';
import { createMockProvider } from './stats/mock/mock-provider';
import { createStatsService, createUnconfiguredStatsClient, type StatsService } from './stats/stats-service';

/** Everything behind the Bridge except window controls, which belong to whoever owns the window. */
export type CoreBridge = Omit<Bridge, 'window'> & { settings: SettingsService; stats: StatsService };

export interface AppServicesDeps {
  info: Omit<AppInfo, 'config'>;
  config: AppConfig;
  /** Validated game data (main and the browser bridge pass the bundled config/game). */
  gameConfig: GameConfig;
  clock: Clock;
  settingsStore: SettingsStore;
  links: LinkOpener;
  /** Artificial latency of mock stats calls in ms; omitted = 250-600 ms so loading states show while developing. */
  statsLatencyMs?: number;
}

const later = (what: string, phase: number) => (): Promise<never> => Promise.reject(notBuiltYet(what, phase));
const noEvents = (): (() => void) => () => undefined;

/**
 * The product, assembled. Phase 2: settings, app info, the game config, player stats on the seeded mock world,
 * favourites and recent searches (in memory until phase 6). Everything else answers "arrives in phase N"
 * (or an empty list, so the shell can render its empty states).
 */
export function createAppServices(deps: AppServicesDeps): CoreBridge {
  const game = createGameIndex(deps.gameConfig);
  const cache = createMemoryCacheStore();
  const snapshots = createMemorySnapshotStore();
  // config/app.json picks the provider at build time (design question 21). LiveProvider is phase 7: until then 'live'
  // builds nothing and every stats call is refused.
  const stats: StatsService =
    deps.config.provider === 'mock'
      ? createStatsService({
          provider: createMockProvider({ game, clock: deps.clock }),
          cache,
          snapshots,
          clock: deps.clock,
          game,
          ...(deps.statsLatencyMs === undefined ? {} : { latencyMs: deps.statsLatencyMs }),
        })
      : createUnconfiguredStatsClient('Live stats need a backend; the live provider arrives in phase 7.');

  return {
    app: {
      getInfo: async () => ({ ...deps.info, config: deps.config }),
      getGameConfig: async () => jsonCopy(deps.gameConfig),
      async openLink(link) {
        // Only the links named in config/app.json can be opened, and only over https.
        const url = Object.prototype.hasOwnProperty.call(deps.config.links, link) ? deps.config.links[link] : null;
        if (!url || !/^https:\/\//i.test(url)) throw appError('not_configured', 'This link is not configured.');
        await deps.links.open(url);
      },
    },
    settings: createSettingsService(deps.settingsStore),
    stats,
    trends: { get: later('Trend charts', 3) },
    favorites: createMemoryFavoritesStore(deps.clock),
    searches: createMemorySearchHistoryStore(deps.clock),
    notifications: {
      list: async () => [],
      markRead: async () => undefined,
      onChange: noEvents,
    },
    live: {
      getView: later('Live Match', 5),
      onView: noEvents,
      retry: later('Live Match', 5),
      simulate: later('Live Match', 5),
    },
    overlay: { toggle: later('The overlay', 5) },
    data: { clearCache: () => stats.clearCache() },
  };
}
