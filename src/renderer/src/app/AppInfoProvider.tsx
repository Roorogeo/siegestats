import { createContext, useContext, type ReactNode } from 'react';
import type { AppInfo } from '@shared/types/bridge';

const AppInfoContext = createContext<AppInfo | null>(null);

export function AppInfoProvider({ info, children }: { info: AppInfo; children: ReactNode }) {
  return <AppInfoContext.Provider value={info}>{children}</AppInfoContext.Provider>;
}

/** Name, version, runtime and build-time config. Loaded once before the first render. */
export function useAppInfo(): AppInfo {
  const info = useContext(AppInfoContext);
  if (!info) throw new Error('useAppInfo must be used inside <AppInfoProvider>');
  return info;
}
