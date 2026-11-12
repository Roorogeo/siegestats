import type { AppConfig } from '@shared/types/game-config';
import type { AppInfo, Bridge } from '@shared/types/bridge';
import type { StatsClient } from '@shared/types/provider';
import { BRIDGE_MANIFEST } from '@shared/ipc/manifest';
import { appError, notBuiltYet } from '@shared/util/errors';
import type { LinkOpener, SettingsStore } from './ports';
import { createSettingsService, type SettingsService } from './settings/service';

/** Everything behind the Bridge except window controls, which belong to whoever owns the window. */
export type CoreBridge = Omit<Bridge, 'window'> & { settings: SettingsService };

export interface AppServicesDeps {
  info: Omit<AppInfo, 'config'>;
  config: AppConfig;
  settingsStore: SettingsStore;
  links: LinkOpener;
}

const later = (what: string, phase: number) => (): Promise<never> => Promise.reject(notBuiltYet(what, phase));
const noEvents = (): (() => void) => () => undefined;

/**
 * The product, assembled. Phase 1 has settings and app info; everything else answers
 * "arrives in phase N" (or an empty list, so the shell can render its empty states).
 */
export function createAppServices(deps: AppServicesDeps): CoreBridge {
  const stats = Object.fromEntries(
    BRIDGE_MANIFEST.stats.calls.map((name) => [name, later('Player stats', 2)]),
  ) as unknown as StatsClient;

  return {
    app: {
      getInfo: async () => ({ ...deps.info, config: deps.config }),
      getGameConfig: later('The game config', 2),
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
    favorites: {
      list: async () => [],
      add: later('Favourites', 6),
      remove: later('Favourites', 6),
      onChange: noEvents,
    },
    searches: {
      recent: async () => [],
      remember: later('Search', 2),
    },
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
    data: { clearCache: async () => undefined },
  };
}
