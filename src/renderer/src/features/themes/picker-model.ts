import { getTheme, isThemeId, resolveActiveTheme, THEME_CATEGORIES, THEMES, themeMatchesQuery } from '@shared/theme';
import type { Theme, ThemeCategory, ThemeMode, ThemeSettings } from '@shared/types/theme';

/** A picker tab: one per category, plus the user's favourites. */
export type PickerTab = ThemeCategory | 'favorites';

const CATEGORY_LABEL = new Map<string, string>(THEME_CATEGORIES.map((c) => [c.id, c.label]));
export const categoryLabel = (category: ThemeCategory): string => CATEGORY_LABEL.get(category) ?? category;

/** The two generic themes "Match Windows" switches between, resolved exactly as the theme provider does. */
export function windowsPair(settings: ThemeSettings): Record<ThemeMode, Theme> {
  return { light: resolveActiveTheme(settings, 'light'), dark: resolveActiveTheme(settings, 'dark') };
}

/** One line under the switch saying what it does right now. */
export function describeMatchWindows(settings: ThemeSettings, systemMode: ThemeMode): string {
  if (!settings.matchSystem) return 'Follow the Windows light/dark setting with a pair of generic themes.';
  const pair = windowsPair(settings);
  return systemMode === 'dark'
    ? `Windows is in dark mode: using ${pair.dark.name}. Light mode uses ${pair.light.name}.`
    : `Windows is in light mode: using ${pair.light.name}. Dark mode uses ${pair.dark.name}.`;
}

/**
 * What picking a theme does when the screen alone would not make it obvious (see selectTheme in
 * src/shared/theme/settings.ts). Null when the picked theme simply goes on screen.
 */
export function describePick(settings: ThemeSettings, systemMode: ThemeMode, theme: Theme): string | null {
  if (!settings.matchSystem) return null;
  if (theme.category !== 'generic') return "Match Windows turned off: specialty themes don't follow Windows.";
  if (theme.mode !== systemMode) return `${theme.name} will be used when Windows is in ${theme.mode} mode.`;
  return null;
}

/** Search results, grouped by category in tab order (empty groups left out). */
export function searchThemes(query: string): { category: ThemeCategory; label: string; themes: Theme[] }[] {
  return THEME_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    themes: THEMES.filter((t) => t.category === c.id && themeMatchesQuery(t, query)),
  })).filter((group) => group.themes.length > 0);
}

/** Favourites in the order they were starred. */
export const favoriteThemes = (settings: ThemeSettings): Theme[] =>
  settings.favoriteThemeIds.filter(isThemeId).map((id) => getTheme(id));
