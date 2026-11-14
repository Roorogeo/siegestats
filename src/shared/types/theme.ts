import type { HexColor, ThemeId } from './primitives';

export type ThemeCategory = 'generic' | 'elements' | 'neon' | 'nature' | 'tactical' | 'seasonal';
export type ThemeMode = 'dark' | 'light';

/** Exactly what the brief lists per theme. The 56 seeds are a data table. */
export interface ThemeSeed {
  id: ThemeId;
  name: string;
  category: ThemeCategory;
  mode: ThemeMode;
  bg: HexColor;
  surface: HexColor;
  accent: HexColor;
  accent2: HexColor;
  overrides: Partial<ThemeTokens>; // hand-set tokens that win over derivation (High Contrast's white borders)
}

/** Every colour the UI may use; one CSS variable each (--bg ... --chart-8). */
export interface ThemeTokens {
  bg: HexColor;
  surface: HexColor;
  surface2: HexColor;
  border: HexColor;
  text: HexColor;
  textMuted: HexColor;
  accent: HexColor;
  accent2: HexColor;
  onAccent: HexColor;
  /** Not in the brief's list (see docs/design.md, question 3b): the accent shifted in lightness until it reads at 4.5:1 on bg and surface. */
  accentText: HexColor;
  /** Not in the brief's list (question 3b): the edge of a control whose outline is its only boundary, at least 3:1 on every plane. */
  controlBorder: HexColor;
  positive: HexColor;
  negative: HexColor;
  chart: readonly [HexColor, HexColor, HexColor, HexColor, HexColor, HexColor, HexColor, HexColor];
}

export interface Theme extends ThemeSeed {
  tokens: ThemeTokens; // seed + derived + overrides; a unit test checks contrast for all 56
  headerGradient: boolean; // specialty themes: accent -> accent-2 on the profile header
}

export interface ThemeSettings {
  activeThemeId: ThemeId;
  favoriteThemeIds: ThemeId[];
  matchSystem: boolean; // generic themes only: follow the Windows light/dark setting
  systemLightThemeId: ThemeId;
  systemDarkThemeId: ThemeId;
}
