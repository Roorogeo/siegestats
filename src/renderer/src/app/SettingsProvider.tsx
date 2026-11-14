import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /**
   * Saves still in flight. While any is pending the screen shows the optimistic state; replies and change events
   * are applied only when the last save settles. Core applies saves in order, so the last reply holds every change.
   */
  const pending = useRef(0);

  useEffect(
    () =>
      bridge.settings.onChange((saved) => {
        if (pending.current === 0) setSettings(saved);
      }),
    [],
  );

  const update = useCallback((patch: SettingsPatch) => {
    pending.current += 1;
    setSettings((current) => optimistic(current, patch));
    const settle = (): boolean => {
      pending.current -= 1;
      return pending.current === 0;
    };
    bridge.settings.update(patch).then(
      (saved) => {
        if (settle()) setSettings(saved);
      },
      () => {
        // The save failed: fall back to what is really stored.
        if (settle()) void bridge.settings.get().then(setSettings);
      },
    );
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
