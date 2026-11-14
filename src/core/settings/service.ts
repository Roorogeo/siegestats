import type { Unsubscribe } from '@shared/types/primitives';
import type { Bridge } from '@shared/types/bridge';
import type { AppSettings, SettingsPatch } from '@shared/types/settings';
import type { SettingsStore } from '../ports';
import { normalizeSettings } from './defaults';

/** One level deep, as SettingsPatch promises: each given field of a section replaces the old value whole. */
export function applySettingsPatch(settings: AppSettings, patch: SettingsPatch): AppSettings {
  const next: Record<string, unknown> = { ...settings };
  for (const [section, value] of Object.entries(patch ?? {})) {
    if (section === 'schemaVersion' || !(section in settings) || value === undefined) continue;
    const current = settings[section as keyof AppSettings];
    next[section] =
      typeof current === 'object' && current !== null && typeof value === 'object' && value !== null
        ? { ...current, ...value }
        : value;
  }
  // Normalising after the merge means a bad patch can never store invalid settings.
  return normalizeSettings(next);
}

export type SettingsService = Bridge['settings'] & {
  /** Synchronous view for code that cannot wait (window background colour at start-up). */
  current(): AppSettings | null;
};

export function createSettingsService(store: SettingsStore): SettingsService {
  let settings: AppSettings | null = null;
  let loading: Promise<AppSettings> | null = null;
  const listeners = new Set<(settings: AppSettings) => void>();

  const load = (): Promise<AppSettings> => {
    if (settings) return Promise.resolve(settings);
    loading ??= store
      .load()
      .catch(() => null)
      .then((raw) => {
        settings = normalizeSettings(raw);
        return settings;
      });
    return loading;
  };

  // Updates run one after another, each on the result of the previous one, so none is lost; a failed write
  // leaves the settings as they were (in memory and on disk) and rejects that update only.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    get: load,
    update(patch) {
      const run = queue.then(async () => {
        const next = applySettingsPatch(await load(), patch);
        await store.save(next);
        settings = next;
        listeners.forEach((listener) => listener(next));
        return next;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current: () => settings,
  };
}
