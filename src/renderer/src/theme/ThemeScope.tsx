import type { HTMLAttributes, ReactNode } from 'react';
import type { Theme } from '@shared/types/theme';
import { themeAttributes, themeStyle } from './apply';

interface ThemeScopeProps extends HTMLAttributes<HTMLDivElement> {
  theme: Theme;
  children: ReactNode;
}

/** Everything inside renders in `theme`, whatever the app's active theme is. Used for live preview cards. */
export function ThemeScope({ theme, children, style, ...rest }: ThemeScopeProps) {
  return (
    <div {...themeAttributes(theme)} style={{ ...themeStyle(theme), ...style }} {...rest}>
      {children}
    </div>
  );
}
