import { useEffect } from 'react';
import type { Platform } from '@shared/types/primitives';

/**
 * Lets any screen open the title bar's player search with a name and platform already filled in
 * (e.g. the profile's "search this name on Xbox", design.md question 14). The search box subscribes.
 */
export interface SearchRequest {
  name: string;
  platform: Platform;
}

type Listener = (request: SearchRequest) => void;
const listeners = new Set<Listener>();

export function openGlobalSearch(request: SearchRequest): void {
  listeners.forEach((listener) => listener(request));
}

/** For the search box: called whenever a screen asks for a search. */
export function useGlobalSearchRequests(listener: Listener): void {
  useEffect(() => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [listener]);
}
