import type { PlayerKey, PlayerSearchResult } from '@shared/types/player';
import { playerKeyString } from '@shared/util/player';

/** How many results one search asks for. A full page shows a hint to type more of the name. */
export const SEARCH_LIMIT = 8;
/** Pause in typing before the search runs. */
export const SEARCH_DEBOUNCE_MS = 200;
/** Favourites listed in the empty box; the rest are in the bell's Favourites tab. */
export const MAX_FAVORITES_SHOWN = 8;

/** The groups the empty box can list, in the order of design question 19. */
export type SuggestionKind = 'mine' | 'favorites' | 'recent';

/** Exact matches first; otherwise the source's own order is kept (a stable sort). */
export function orderResults(results: readonly PlayerSearchResult[]): PlayerSearchResult[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => Number(b.result.exactMatch) - Number(a.result.exactMatch) || a.index - b.index)
    .map(({ result }) => result);
}

export interface NameParts {
  before: string;
  match: string;
  after: string;
}

/**
 * Splits a name around the first case-insensitive occurrence of the typed text, so the matched part can be
 * emphasised. null when the text does not occur (or lower-casing would change the name's length, which would put
 * the emphasis on the wrong letters).
 */
export function splitMatch(name: string, typed: string): NameParts | null {
  const needle = typed.trim().toLowerCase();
  const haystack = name.toLowerCase();
  if (needle === '' || haystack.length !== name.length) return null;
  const at = haystack.indexOf(needle);
  if (at < 0) return null;
  return { before: name.slice(0, at), match: name.slice(at, at + needle.length), after: name.slice(at + needle.length) };
}

/**
 * Lists of players for the empty box, each player once: in the first group that has them (pinned, then favourites,
 * then recent), as design question 19 orders them.
 */
export function withoutRepeats<T extends { player: PlayerKey }>(lists: readonly (readonly T[])[]): T[][] {
  const seen = new Set<string>();
  return lists.map((list) =>
    list.filter((item) => {
      const key = playerKeyString(item.player);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

/** Index of the option the arrow keys move to, wrapping at both ends. From no active option, Down goes to the first and Up to the last. */
export function stepIndex(current: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0 || current >= count) return step > 0 ? 0 : count - 1;
  return (current + step + count) % count;
}
