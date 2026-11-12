import type { AppSettings } from '@shared/types/settings';
import type { SettingsStore } from '../ports';

/** Settings kept in memory, optionally mirrored through get/set callbacks (e.g. localStorage in the browser bridge). */
export function createMemorySettingsStore(persist?: { read(): string | null; write(json: string): void }): SettingsStore {
  let current: unknown = null;
  return {
    async load() {
      if (persist) {
        try {
          const json = persist.read();
          current = json ? (JSON.parse(json) as unknown) : null;
        } catch {
          current = null;
        }
      }
      return current;
    },
    async save(settings: AppSettings) {
      current = settings;
      try {
        persist?.write(JSON.stringify(settings));
      } catch {
        // storage full or blocked: keep working from memory
      }
    },
  };
}
