import { QueryClient } from '@tanstack/react-query';
import type { AppError } from '@shared/types/provider';

declare module '@tanstack/react-query' {
  /** Every query and mutation rejects with an AppError: the hooks in this folder convert anything else with toAppError. */
  interface Register {
    defaultError: AppError;
  }
}

/**
 * Core is the only cache: a query asks the bridge on every mount and core answers from its own cache
 * inside the TTL. TanStack Query only de-duplicates in-flight calls and holds loading / error state.
 */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 0, networkMode: 'always', retry: false, refetchOnWindowFocus: false } },
  });
