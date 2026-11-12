import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import type { AppInfo } from '@shared/types/bridge';
import type { AppSettings } from '@shared/types/settings';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppInfoProvider } from './AppInfoProvider';
import { createAppRouter } from './router';
import { SettingsProvider } from './SettingsProvider';

/**
 * Core is the only cache: a query asks the bridge on every mount and core answers from its own cache
 * inside the TTL. TanStack Query only de-duplicates in-flight calls and holds loading / error state.
 */
const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 0, networkMode: 'always', retry: false, refetchOnWindowFocus: false } },
  });

export function App({ info, settings }: { info: AppInfo; settings: AppSettings }) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  return (
    <AppInfoProvider info={info}>
      <SettingsProvider initial={settings}>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ThemeProvider>
      </SettingsProvider>
    </AppInfoProvider>
  );
}
