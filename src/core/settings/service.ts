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

  return {
    get: load,
    async update(patch) {
      const next = applySettingsPatch(await load(), patch);
      settings = next;
      await store.save(next);
      listeners.forEach((listener) => listener(next));
      return next;
    },
    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current: () => settings,
  };
}
