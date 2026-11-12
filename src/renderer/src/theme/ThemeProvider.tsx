import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { resolveActiveTheme, selectTheme, setMatchSystem, toggleFavoriteTheme } from '@shared/theme';
import type { ThemeId } from '@shared/types/primitives';
import type { Theme, ThemeMode, ThemeSettings } from '@shared/types/theme';
import { useSettings } from '../app/SettingsProvider';
import { applyTheme } from './apply';

interface ThemeContextValue {
  /** The theme on screen right now. */
  theme: Theme;
  settings: ThemeSettings;
  /** What Windows is set to. */
  systemMode: ThemeMode;
  select(id: ThemeId): void;
  toggleFavorite(id: ThemeId): void;
  setMatchSystem(on: boolean): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';
const subscribeSystem = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const readSystem = (): ThemeMode => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/** Follows the Windows light/dark setting live (Electron mirrors it into prefers-color-scheme). */
export const useSystemMode = (): ThemeMode => useSyncExternalStore(subscribeSystem, readSystem, () => 'dark');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const systemMode = useSystemMode();
  const themeSettings = settings.theme;
  const theme = useMemo(() => resolveActiveTheme(themeSettings, systemMode), [themeSettings, systemMode]);

  // Layout effect: the new colours are in place before the browser paints.
  useLayoutEffect(() => applyTheme(document.documentElement, theme), [theme]);

  const select = useCallback((id: ThemeId) => update({ theme: selectTheme(themeSettings, id) }), [themeSettings, update]);
  const toggleFavorite = useCallback(
    (id: ThemeId) => update({ theme: toggleFavoriteTheme(themeSettings, id) }),
    [themeSettings, update],
  );
  const setMatch = useCallback(
    (on: boolean) => update({ theme: setMatchSystem(themeSettings, on, systemMode) }),
    [themeSettings, systemMode, update],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, settings: themeSettings, systemMode, select, toggleFavorite, setMatchSystem: setMatch }),
    [theme, themeSettings, systemMode, select, toggleFavorite, setMatch],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
