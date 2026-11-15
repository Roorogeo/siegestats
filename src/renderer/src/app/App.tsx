import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import type { AppInfo } from '@shared/types/bridge';
import type { GameConfig } from '@shared/types/game-config';
import type { AppSettings } from '@shared/types/settings';
import { createQueryClient } from '../queries/client';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppInfoProvider } from './AppInfoProvider';
import { GameConfigProvider } from './GameConfigProvider';
import { createAppRouter } from './router';
import { SettingsProvider } from './SettingsProvider';

interface AppProps {
  info: AppInfo;
  settings: AppSettings;
  gameConfig: GameConfig;
}

export function App({ info, settings, gameConfig }: AppProps) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  return (
    <AppInfoProvider info={info}>
      <GameConfigProvider config={gameConfig}>
        <SettingsProvider initial={settings}>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </ThemeProvider>
        </SettingsProvider>
      </GameConfigProvider>
    </AppInfoProvider>
  );
}
