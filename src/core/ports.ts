import type { AppSettings } from '@shared/types/settings';

/** What core needs from the outside world. Main supplies Electron-backed versions; tests and the browser bridge supply in-memory ones. */

export interface SettingsStore {
  /** Whatever was saved last, unvalidated. null on first run. */
  load(): Promise<unknown>;
  save(settings: AppSettings): Promise<void>;
}

export interface LinkOpener {
  open(url: string): Promise<void>;
}
