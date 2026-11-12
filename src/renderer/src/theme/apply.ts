import type { CSSProperties } from 'react';
import { tokensToCssVars } from '@shared/theme';
import type { Theme } from '@shared/types/theme';

/** Attributes that go with a theme's variables; CSS variants (`specialty:`, `light-theme:`) key off them. */
export const themeAttributes = (theme: Theme): Record<string, string> => ({
  'data-theme': theme.id,
  'data-theme-mode': theme.mode,
  'data-theme-kind': theme.category === 'generic' ? 'generic' : 'specialty',
});

/** Switches the whole app: sets every token on <html>. No reload, no stylesheet swap. */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  for (const [name, value] of Object.entries(tokensToCssVars(theme.tokens))) root.style.setProperty(name, value);
  for (const [name, value] of Object.entries(themeAttributes(theme))) root.setAttribute(name, value);
  root.style.colorScheme = theme.mode;
}

/** The same tokens as inline style, for an element that previews a theme without switching the app. */
export const themeStyle = (theme: Theme): CSSProperties =>
  ({ ...tokensToCssVars(theme.tokens), colorScheme: theme.mode }) as CSSProperties;
