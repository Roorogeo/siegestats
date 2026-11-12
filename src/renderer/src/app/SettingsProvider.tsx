import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSettings, SettingsPatch } from '@shared/types/settings';
import { bridge } from '../bridge';

interface SettingsContextValue {
  settings: AppSettings;
  /** Applies at once on screen and saves in the background; the saved result then replaces the optimistic one. */
  update(patch: SettingsPatch): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** One level deep, mirroring what core does with a SettingsPatch, so the UI can update before the save returns. */
function optimistic(settings: AppSettings, patch: SettingsPatch): AppSettings {
  const next: Record<string, unknown> = { ...settings };
  for (const [section, value] of Object.entries(patch)) {
    const current = settings[section as keyof AppSettings];
    next[section] = typeof current === 'object' && typeof value === 'object' && value !== null ? { ...current, ...value } : value;
  }
  return next as unknown as AppSettings;
}

export function SettingsProvider({ initial, children }: { initial: AppSettings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);

  useEffect(() => bridge.settings.onChange(setSettings), []);

  const update = useCallback((patch: SettingsPatch) => {
    setSettings((current) => optimistic(current, patch));
    bridge.settings.update(patch).then(setSettings, () => {
      // The save failed: fall back to what is really stored.
      void bridge.settings.get().then(setSettings);
    });
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
