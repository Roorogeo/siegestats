import { useEffect, useEffectEvent } from 'react';
import type { Platform } from '@shared/types/primitives';

/**
 * Lets any screen open the title bar's player search with a name and platform already filled in
 * (e.g. the profile's "search this name on Xbox", design.md question 14). The search box subscribes.
 * An empty name opens the search on that platform with the empty-box suggestions (pinned, favourites, recent).
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

/**
 * For the search box: called whenever a screen asks for a search. The newest `listener` is always the one called,
 * and the subscription itself is made once, so passing an inline function does not re-subscribe on every render.
 */
export function useGlobalSearchRequests(listener: Listener): void {
  const onRequest = useEffectEvent(listener);
  useEffect(() => {
    const subscriber: Listener = (request) => onRequest(request);
    listeners.add(subscriber);
    return () => {
      listeners.delete(subscriber);
    };
  }, []);
}
