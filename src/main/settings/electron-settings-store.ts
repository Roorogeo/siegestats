import Store from 'electron-store';
import type { AppSettings } from '@shared/types/settings';
import type { SettingsStore } from '@core/ports';

/** settings.json in the app's user-data folder. Validation happens in core, not here. */
export function createElectronSettingsStore(): SettingsStore & { readSync(): unknown } {
  const store = new Store<{ settings?: AppSettings }>({ name: 'settings', clearInvalidConfig: true });
  return {
    readSync: () => store.get('settings') ?? null,
    load: async () => store.get('settings') ?? null,
    save: async (settings) => {
      store.set('settings', settings);
    },
  };
}
