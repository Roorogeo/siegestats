import type { ThemeId } from '../types/primitives';
import type { Theme, ThemeCategory, ThemeMode, ThemeSettings, ThemeTokens } from '../types/theme';
import { buildTheme } from './derive';
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID, DEFAULT_THEME_ID, THEME_SEEDS } from './seeds';

export { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID, DEFAULT_THEME_ID, THEME_SEEDS } from './seeds';
export { buildTheme, CONTROL_CONTRAST, deriveTokens, TEXT_CONTRAST } from './derive';
export { CHART_FAMILIES, CHART_L_BAND, CHART_MIN_CONTRAST, deriveChartPalette } from './chart-palette';
export * as color from './color';

/** All 56 themes, in the brief's order, with every token derived. Built once at module load. */
export const THEMES: readonly Theme[] = THEME_SEEDS.map(buildTheme);

const BY_ID = new Map<string, Theme>(THEMES.map((theme) => [theme.id, theme]));

export const isThemeId = (id: unknown): id is ThemeId => typeof id === 'string' && BY_ID.has(id);

/** Unknown ids fall back to the default theme, so a stale setting can never leave the app unstyled. */
export function getTheme(id: string | null | undefined): Theme {
  return (id != null ? BY_ID.get(id) : undefined) ?? (BY_ID.get(DEFAULT_THEME_ID) as Theme);
}

/** Picker tabs, in display order. */
export const THEME_CATEGORIES: readonly { id: ThemeCategory; label: string }[] = [
  { id: 'generic', label: 'Generic' },
  { id: 'elements', label: 'Elements' },
  { id: 'neon', label: 'Neon' },
  { id: 'nature', label: 'Nature' },
  { id: 'tactical', label: 'Tactical and Tech' },
  { id: 'seasonal', label: 'Seasonal and Mood' },
];

export const themesInCategory = (category: ThemeCategory): Theme[] => THEMES.filter((t) => t.category === category);

/** CSS custom-property names, one per token. The single place the names are spelled. */
export const TOKEN_VARS = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  border: '--border',
  text: '--text',
  textMuted: '--text-muted',
  accent: '--accent',
  accent2: '--accent-2',
  onAccent: '--on-accent',
  accentText: '--accent-text',
  controlBorder: '--control-border',
  positive: '--positive',
  negative: '--negative',
} as const satisfies Record<Exclude<keyof ThemeTokens, 'chart'>, `--${string}`>;

/** Tokens as CSS custom properties: set them on <html> for the app, or on any element for a scoped preview. */
export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, name] of Object.entries(TOKEN_VARS)) {
    vars[name] = tokens[key as keyof typeof TOKEN_VARS];
  }
  tokens.chart.forEach((hex, i) => {
    vars[`--chart-${i + 1}`] = hex;
  });
  return vars;
}

/**
 * Which theme is on screen. "Match Windows" applies to the generic themes only: while it is on,
 * the system's light / dark setting picks between the two chosen generic themes.
 */
export function resolveActiveTheme(settings: ThemeSettings, systemMode: ThemeMode): Theme {
  if (settings.matchSystem) {
    const id = systemMode === 'light' ? settings.systemLightThemeId : settings.systemDarkThemeId;
    const theme = getTheme(id);
    if (theme.category === 'generic' && theme.mode === systemMode) return theme;
    return getTheme(systemMode === 'light' ? DEFAULT_LIGHT_THEME_ID : DEFAULT_DARK_THEME_ID);
  }
  return getTheme(settings.activeThemeId);
}

export {
  defaultThemeSettings,
  normalizeThemeSettings,
  selectTheme,
  setMatchSystem,
  themeMatchesQuery,
  toggleFavoriteTheme,
} from './settings';
