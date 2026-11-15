import appConfig from '@config/app.json';
import { createAppServices } from '@core/app-services';
import { createMemorySettingsStore } from '@core/memory/settings-store';
import type { Clock } from '@core/ports';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import type { Bridge } from '@shared/types/bridge';
import type { AppConfig } from '@shared/types/game-config';
import type { IsoDateTime } from '@shared/types/primitives';

const SETTINGS_KEY = 'sightline.settings';

/** The page's own clock: core never reads the time or sets timers itself. */
const pageClock: Clock = {
  now: () => new Date().toISOString() as IsoDateTime,
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms))),
};

/**
 * Runs core inside the page, for development in a plain browser and for browser-mode tests.
 * Settings live in localStorage; window controls do nothing because there is no window to control. The game
 * config is the bundled one, validated here as main validates it.
 */
export function createBrowserBridge(): Bridge {
  const core = createAppServices({
    info: { name: 'Sightline', version: __APP_VERSION__, runtime: 'browser', isDev: import.meta.env.DEV },
    config: appConfig as AppConfig,
    gameConfig: loadBundledGameConfig(),
    clock: pageClock,
    settingsStore: createMemorySettingsStore({
      read: () => window.localStorage.getItem(SETTINGS_KEY),
      write: (json) => window.localStorage.setItem(SETTINGS_KEY, json),
    }),
    links: {
      async open(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
  });

  return {
    ...core,
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      close: async () => undefined,
      isMaximized: async () => false,
      onMaximizedChange: () => () => undefined,
    },
  };
}
