import type { ThemeId } from '../types/primitives';
import type { ThemeMode, ThemeSettings } from '../types/theme';
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID, DEFAULT_THEME_ID } from './seeds';
import { getTheme, isThemeId, resolveActiveTheme, THEME_CATEGORIES } from './index';

/** The rules of the theme picker, as pure functions over ThemeSettings. */

export const defaultThemeSettings = (): ThemeSettings => ({
  activeThemeId: DEFAULT_THEME_ID,
  favoriteThemeIds: [],
  matchSystem: false,
  systemLightThemeId: DEFAULT_LIGHT_THEME_ID,
  systemDarkThemeId: DEFAULT_DARK_THEME_ID,
});

/** Drops ids that no longer exist and repairs the system pair, so stale settings never break the app. */
export function normalizeThemeSettings(raw: Partial<Record<keyof ThemeSettings, unknown>> | null | undefined): ThemeSettings {
  const d = defaultThemeSettings();
  if (!raw) return d;
  const pair = (id: unknown, mode: ThemeMode, fallback: ThemeId): ThemeId => {
    if (!isThemeId(id)) return fallback;
    const theme = getTheme(id);
    return theme.category === 'generic' && theme.mode === mode ? id : fallback;
  };
  const favorites = Array.isArray(raw.favoriteThemeIds) ? raw.favoriteThemeIds.filter(isThemeId) : [];
  return {
    activeThemeId: isThemeId(raw.activeThemeId) ? raw.activeThemeId : d.activeThemeId,
    favoriteThemeIds: [...new Set(favorites)],
    matchSystem: raw.matchSystem === true,
    systemLightThemeId: pair(raw.systemLightThemeId, 'light', d.systemLightThemeId),
    systemDarkThemeId: pair(raw.systemDarkThemeId, 'dark', d.systemDarkThemeId),
  };
}

/**
 * The user picked a theme.
 *  - "Match Windows" off: it becomes the active theme.
 *  - "Match Windows" on, generic theme: it becomes the light or the dark half of the pair (by its own mode).
 *  - "Match Windows" on, specialty theme: specialty themes cannot follow Windows, so matching is switched off.
 */
export function selectTheme(settings: ThemeSettings, id: ThemeId): ThemeSettings {
  if (!isThemeId(id)) return settings;
  const theme = getTheme(id);
  if (!settings.matchSystem) return { ...settings, activeThemeId: id };
  if (theme.category !== 'generic') return { ...settings, activeThemeId: id, matchSystem: false };
  return theme.mode === 'light'
    ? { ...settings, activeThemeId: id, systemLightThemeId: id }
    : { ...settings, activeThemeId: id, systemDarkThemeId: id };
}

/**
 * Turning matching on keeps a generic active theme as its mode's half of the pair.
 * Turning it off freezes whatever is on screen right now, so nothing jumps.
 */
export function setMatchSystem(settings: ThemeSettings, on: boolean, systemMode: ThemeMode): ThemeSettings {
  if (on === settings.matchSystem) return settings;
  if (!on) return { ...settings, matchSystem: false, activeThemeId: resolveActiveTheme(settings, systemMode).id };
  const active = getTheme(settings.activeThemeId);
  const next = { ...settings, matchSystem: true };
  if (active.category !== 'generic') return next;
  return active.mode === 'light' ? { ...next, systemLightThemeId: active.id } : { ...next, systemDarkThemeId: active.id };
}

export function toggleFavoriteTheme(settings: ThemeSettings, id: ThemeId): ThemeSettings {
  if (!isThemeId(id)) return settings;
  const favoriteThemeIds = settings.favoriteThemeIds.includes(id)
    ? settings.favoriteThemeIds.filter((f) => f !== id)
    : [...settings.favoriteThemeIds, id];
  return { ...settings, favoriteThemeIds };
}

/** Case-insensitive search over theme name, category (id and the label on its tab) and light / dark. */
export function themeMatchesQuery(theme: { name: string; category: string; mode: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const label = THEME_CATEGORIES.find((c) => c.id === theme.category)?.label ?? '';
  return `${theme.name} ${theme.category} ${label} ${theme.mode}`.toLowerCase().includes(q);
}
