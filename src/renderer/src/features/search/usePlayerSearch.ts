import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { IsoDateTime, Platform } from '@shared/types/primitives';
import type { PlayerRef, PlayerSearchResult } from '@shared/types/player';
import type { AppError } from '@shared/types/provider';
import { useAppInfo } from '../../app/AppInfoProvider';
import { useSettings } from '../../app/SettingsProvider';
import {
  callStats, isForced, queryKeys, useFavorites, useRecentSearches, useRememberSearch, useSearchPlayers,
} from '../../queries';
import { PLATFORM_LABEL } from '../../shell/platforms';
import {
  MAX_FAVORITES_SHOWN, orderResults, playerKeyOf, SEARCH_DEBOUNCE_MS, SEARCH_LIMIT, stepIndex, toPlayerRef, withoutRepeats,
  type SuggestionKind,
} from './search-model';
import type { SearchRequest } from './open-search';

/** One choosable row. `domId` is what aria-activedescendant points at. */
export interface SearchOption {
  key: string;
  domId: string;
  player: PlayerRef;
}

export interface SuggestionItem {
  option: SearchOption;
  /** Recent searches: when. */
  at: IsoDateTime | null;
}

export interface SuggestionGroup {
  kind: SuggestionKind;
  items: SuggestionItem[];
  /** Entries left out of this group (favourites beyond the first few). */
  more: number;
}

export interface ResultItem {
  option: SearchOption;
  result: PlayerSearchResult;
}

export type ResultsState =
  /** The first answer for this name and platform is not there yet. */
  | { kind: 'loading' }
  | { kind: 'error'; error: AppError }
  /** The source cannot search at all ('unsupported' / 'not_configured'). */
  | { kind: 'unavailable'; error: AppError }
  | { kind: 'empty' }
  | {
      kind: 'results';
      items: ResultItem[];
      /** A newer search is on its way: these rows are the previous answer. */
      busy: boolean;
      /** The source failed and core answered from its cache, saved at this time. */
      staleSince: string | null;
      /** As many rows as asked for: there may be more. */
      limited: boolean;
    };

export type SearchView =
  | { mode: 'suggestions'; groups: SuggestionGroup[]; recentError: AppError | null; retryRecent(): void }
  | { mode: 'results'; name: string; platform: Platform; state: ResultsState; retry(): void };

export interface PlayerSearch {
  /** The field's text, as typed. */
  text: string;
  setText(text: string): void;
  platform: Platform;
  setPlatform(platform: Platform): void;
  /** openGlobalSearch: name and platform in one go, searched at once without the typing pause. */
  prefill(request: SearchRequest): void;
  view: SearchView;
  /** Every choosable row of the view, in screen order. */
  options: SearchOption[];
  activeKey: string | null;
  /** The active row's DOM id, for aria-activedescendant. */
  activeDomId: string | undefined;
  /** Arrow keys and Enter on the field; returns true when it handled the key (the caller then prevents the default). */
  handleKey(event: KeyboardEvent<HTMLInputElement>): boolean;
  choose(player: PlayerRef): void;
  /** One line for a polite live region: what the list now shows. Empty while a search runs. */
  announcement: string;
  /** Prefix of every DOM id this search uses. */
  idPrefix: string;
}

export interface PlayerSearchOptions {
  /** From useId(): option ids are built on it. */
  idPrefix: string;
  /** Which groups the empty box lists. */
  suggestions: readonly SuggestionKind[];
  /** false = do not read the recent searches yet (the dropdown is closed). */
  enabled: boolean;
  /** The user picked a player (click or Enter). The search is remembered before this is called. */
  onChoose(player: PlayerRef): void;
  /** Empty the field after a pick (the title bar's search). */
  clearOnChoose?: boolean;
}

/**
 * The platform picked for this search. It follows the default platform from settings until the user picks another
 * one here, and a later change of the default wins again; the setting itself is never written.
 */
function usePlatformChoice(): [Platform, (platform: Platform) => void] {
  const defaultPlatform = useSettings().settings.defaultPlatform;
  const [choice, setChoice] = useState<{ base: Platform; value: Platform } | null>(null);
  const platform = choice?.base === defaultPlatform ? choice.value : defaultPlatform;
  const set = useCallback((value: Platform) => setChoice({ base: defaultPlatform, value }), [defaultPlatform]);
  return [platform, set];
}

/** The typed name once typing pauses. A cleared field is cleared at once; set() skips the pause (prefill, Enter). */
function useDebouncedName(name: string): { value: string; set(value: string): void } {
  const [value, setValue] = useState(name);
  useEffect(() => {
    if (value === name) return;
    const timer = window.setTimeout(() => setValue(name), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [name, value]);
  return { value: name === '' ? '' : value, set: setValue };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The search behind both the title bar's dropdown and the inline PlayerSearchBox: the text, the platform, the
 * debounced search (useSearchPlayers, exact matches first), the empty-box suggestions, the active option for the
 * arrow keys, and what Enter does. Rendering is left to SearchPanel.
 */
export function usePlayerSearch({ idPrefix, suggestions, enabled, onChoose, clearOnChoose = false }: PlayerSearchOptions): PlayerSearch {
  const [text, setTextState] = useState('');
  const [platform, setPlatformChoice] = usePlatformChoice();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const name = text.trim();
  const debounced = useDebouncedName(name);
  const settled = debounced.value === name;

  const query = useSearchPlayers({ name: debounced.value, platform, limit: SEARCH_LIMIT }, { keepPrevious: true });
  const remember = useRememberSearch();
  const { settings } = useSettings();
  const { provider } = useAppInfo().config;
  const favorites = useFavorites();
  const recent = useRecentSearches({ enabled: enabled && suggestions.includes('recent') });

  // ---- results ----
  const raw = query.data;
  /** True when the answer on hand is the one for exactly what is typed, on this platform. */
  const forTyped = settled && !query.isPlaceholderData;
  /**
   * While the next answer loads, the previous one stays on screen (no flashing between keystrokes), but only its rows
   * that still fit: same platform, and the typed text inside the name. Never "quiet" players under "otter", never PC
   * rows under Xbox.
   */
  const shown =
    raw === undefined
      ? []
      : forTyped
        ? raw.data
        : raw.data.filter((r) => r.platform === platform && r.name.toLowerCase().includes(name.toLowerCase()));
  /** The answer for exactly what is typed now, or null while it is not in yet. */
  const current = name !== '' && forTyped && query.isSuccess ? query.data.data : null;

  const optionOf = (group: string, player: PlayerRef, index: number): SearchOption => ({
    key: `${group}:${playerKeyOf(player)}`,
    domId: `${idPrefix}-${group}-${index}`,
    player: toPlayerRef(player),
  });

  let state: ResultsState;
  if (settled && query.status === 'error' && !query.isFetching) {
    const code = query.error.code;
    state =
      code === 'unsupported' || code === 'not_configured'
        ? { kind: 'unavailable', error: query.error }
        : code === 'not_found'
          ? { kind: 'empty' }
          : { kind: 'error', error: query.error };
  } else if (raw !== undefined && shown.length > 0) {
    const items = orderResults(shown).map((result, index) => ({ option: optionOf('result', result, index), result }));
    state = {
      kind: 'results',
      items,
      busy: query.isFetching || !forTyped,
      staleSince: raw.from === 'stale_cache' ? raw.fetchedAt : null,
      limited: items.length >= SEARCH_LIMIT,
    };
  } else if (current !== null) {
    state = { kind: 'empty' };
  } else {
    state = { kind: 'loading' };
  }

  // ---- suggestions (empty box) ----
  const pinned = suggestions.includes('mine') ? settings.accounts[provider].pinned.map((p) => ({ player: p.player, at: null })) : [];
  const favs = suggestions.includes('favorites') ? (favorites.data ?? []).map((f) => ({ player: f.player, at: null })) : [];
  const recents = suggestions.includes('recent') ? (recent.data ?? []).map((r) => ({ player: r.player, at: r.searchedAt })) : [];
  const [mineList = [], favList = [], recentList = []] = withoutRepeats<{ player: PlayerRef; at: IsoDateTime | null }>([pinned, favs, recents]);
  const groupOf = (kind: SuggestionKind, list: { player: PlayerRef; at: IsoDateTime | null }[], max = Infinity): SuggestionGroup => ({
    kind,
    items: list.slice(0, max).map(({ player, at }, index) => ({ option: optionOf(kind, player, index), at })),
    more: Math.max(0, list.length - max),
  });
  const groups = [groupOf('mine', mineList), groupOf('favorites', favList, MAX_FAVORITES_SHOWN), groupOf('recent', recentList)].filter(
    (group) => group.items.length > 0,
  );

  const view: SearchView =
    name === ''
      ? {
          mode: 'suggestions',
          groups,
          recentError: recent.isError ? recent.error : null,
          retryRecent: () => void recent.refetch(),
        }
      : { mode: 'results', name, platform, state, retry: () => void query.refetch() };

  const options: SearchOption[] =
    view.mode === 'suggestions'
      ? view.groups.flatMap((group) => group.items.map((item) => item.option))
      : state.kind === 'results'
        ? state.items.map((item) => item.option)
        : [];
  const activeIndex = activeKey === null ? -1 : options.findIndex((o) => o.key === activeKey);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  // ---- actions ----
  const client = useQueryClient();
  /** Bumped by every change of text or platform, so an Enter still waiting for its answer can tell it is out of date. */
  const generation = useRef(0);

  const setText = useCallback((value: string) => {
    generation.current += 1;
    setTextState(value);
    setActiveKey(null);
  }, []);

  const setPlatform = useCallback(
    (value: Platform) => {
      generation.current += 1;
      setPlatformChoice(value);
      setActiveKey(null);
    },
    [setPlatformChoice],
  );

  const prefill = (request: SearchRequest): void => {
    generation.current += 1;
    setTextState(request.name);
    debounced.set(request.name.trim());
    setPlatformChoice(request.platform);
    setActiveKey(null);
  };

  const choose = (player: PlayerRef): void => {
    const ref = toPlayerRef(player);
    generation.current += 1;
    remember.mutate(ref);
    if (clearOnChoose) setText('');
    onChoose(ref);
  };

  const enter = (): void => {
    if (activeOption) {
      choose(activeOption.player);
      return;
    }
    if (name === '') return;
    if (current !== null) {
      const first = orderResults(current)[0];
      if (first) choose(first);
      return;
    }
    // The answer for what is typed is not in yet: search now (skipping the typing pause) and open the first result
    // when it arrives, unless the text or platform changed meanwhile. The list's own query shares this fetch.
    const request = { name, platform, limit: SEARCH_LIMIT };
    const asked = generation.current;
    debounced.set(name);
    client
      .fetchQuery({
        queryKey: queryKeys.stats('searchPlayer', request),
        queryFn: ({ queryKey }) => callStats('searchPlayer', request, isForced(queryKey)),
      })
      .then(
        (answer) => {
          const first = orderResults(answer.data)[0];
          if (first && generation.current === asked) choose(first);
        },
        // The list shows the error state with Retry.
        () => undefined,
      );
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = options[stepIndex(activeIndex, options.length, event.key === 'ArrowDown' ? 1 : -1)];
      if (next) setActiveKey(next.key);
      return true;
    }
    if (event.key === 'Enter') {
      enter();
      return true;
    }
    return false;
  };

  // Keep the active row in view when the list scrolls.
  const activeDomId = activeOption?.domId;
  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView({ block: 'nearest' });
  }, [activeDomId]);

  const where = PLATFORM_LABEL[platform];
  const announcement =
    view.mode === 'suggestions'
      ? ''
      : state.kind === 'results'
        ? state.busy
          ? ''
          : `${plural(state.items.length, 'player', 'players')} found on ${where}${state.limited ? ', showing the first ones' : ''}.`
        : state.kind === 'empty'
          ? `No players named “${name}” on ${where}.`
          : state.kind === 'error'
            ? `The search failed. ${state.error.message}`
            : state.kind === 'unavailable'
              ? 'Player search is not available from this source.'
              : '';

  return {
    text,
    setText,
    platform,
    setPlatform,
    prefill,
    view,
    options,
    activeKey: activeOption?.key ?? null,
    activeDomId,
    handleKey,
    choose,
    announcement,
    idPrefix,
  };
}
