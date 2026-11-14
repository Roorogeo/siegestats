import { Info, Search, SearchX, Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { THEME_CATEGORIES, themesInCategory } from '@shared/theme';
import type { Theme, ThemeMode } from '@shared/types/theme';
import { useTheme } from '../../theme/ThemeProvider';
import { Button, EmptyState, IconButton, Switch, Tabs, TextInput, tabPanelProps, type TabItem } from '../../ui';
import {
  categoryLabel,
  describeMatchWindows,
  describePick,
  favoriteThemes,
  searchThemes,
  windowsPair,
  type PickerTab,
} from './picker-model';
import { ThemePreviewCard } from './ThemePreviewCard';

const CATEGORY_COUNTS = new Map(THEME_CATEGORIES.map((c) => [c.id, themesInCategory(c.id).length]));

/** 3 columns at the minimum window width, more as the window grows. */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3';

/**
 * The theme picker: tabs per category plus favourites, search across all 56, and "Match Windows light/dark".
 * Picking applies at once through useTheme(), which also saves. The rules of what a pick does live in
 * src/shared/theme/settings.ts; this component only makes them visible.
 */
export function ThemePicker() {
  const { theme: current, settings, systemMode, select, toggleFavorite, setMatchSystem } = useTheme();
  const [tab, setTab] = useState<PickerTab>(() => current.category);
  const [query, setQuery] = useState('');
  /** Feedback for a pick whose effect the screen does not show; dropped once Windows changes mode. */
  const [notice, setNotice] = useState<{ text: string; systemMode: ThemeMode } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusStarAt = useRef<number | null>(null);

  const searching = query.trim() !== '';
  const favorites = useMemo(() => favoriteThemes(settings), [settings]);
  const favoriteIds = useMemo(() => new Set<string>(settings.favoriteThemeIds), [settings.favoriteThemeIds]);
  const pair = settings.matchSystem ? windowsPair(settings) : null;

  const tabs = useMemo<TabItem<PickerTab>[]>(
    () => [
      ...THEME_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: CATEGORY_COUNTS.get(c.id) ?? 0 })),
      { id: 'favorites', label: 'Favorites', count: favorites.length, icon: <Star className="size-3.5" aria-hidden /> },
    ],
    [favorites.length],
  );

  const onSelect = useCallback(
    (theme: Theme) => {
      const text = describePick(settings, systemMode, theme);
      setNotice(text ? { text, systemMode } : null);
      select(theme.id);
    },
    [settings, systemMode, select],
  );

  const onToggleFavorite = useCallback(
    (theme: Theme) => {
      // Un-starring on the Favorites tab removes the card under the focus: keep the focus in the grid.
      if (tab === 'favorites' && !searching && favoriteIds.has(theme.id)) {
        focusStarAt.current = favorites.findIndex((t) => t.id === theme.id);
      }
      toggleFavorite(theme.id);
    },
    [tab, searching, favoriteIds, favorites, toggleFavorite],
  );

  const onTabChange = (next: PickerTab): void => setTab(next);

  useEffect(() => {
    const index = focusStarAt.current;
    if (index === null) return;
    focusStarAt.current = null;
    const stars = panelRef.current?.querySelectorAll<HTMLElement>('[data-star-for]');
    const target = stars && stars.length > 0 ? stars[Math.min(index, stars.length - 1)] : panelRef.current;
    target?.focus();
  }, [favorites]);

  const clearSearch = (): void => {
    setQuery('');
    searchRef.current?.focus();
  };

  const card = (theme: Theme, mixed: boolean): ReactNode => (
    <ThemePreviewCard
      key={theme.id}
      theme={theme}
      active={theme.id === current.id}
      favorite={favoriteIds.has(theme.id)}
      windowsMode={pair ? (pair.light.id === theme.id ? 'light' : pair.dark.id === theme.id ? 'dark' : null) : null}
      categoryLabel={mixed ? categoryLabel(theme.category) : undefined}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
    />
  );

  const explanation = notice && notice.systemMode === systemMode ? notice.text : describeMatchWindows(settings, systemMode);

  let navigation: ReactNode;
  let content: ReactNode;
  if (searching) {
    const groups = searchThemes(query);
    const total = groups.reduce((sum, group) => sum + group.themes.length, 0);
    navigation = (
      <div className="flex h-9 items-center justify-between gap-3 border-b border-border">
        <p role="status" className="min-w-0 truncate text-[13px] text-text">
          <span className="tabular font-medium">{total}</span> {total === 1 ? 'result' : 'results'} for “{query.trim()}”
        </p>
        {total > 0 && (
          <Button variant="ghost" size="sm" onClick={clearSearch}>
            Clear search
          </Button>
        )}
      </div>
    );
    content =
      total === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" aria-hidden />}
          title={`No themes match “${query.trim()}”`}
          description="Search looks at theme names, categories, and light or dark."
          action={<Button onClick={clearSearch}>Clear search</Button>}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`theme-group-${group.category}`}>
              <h3 id={`theme-group-${group.category}`} className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
                {group.label}
                <span className="tabular">{group.themes.length}</span>
              </h3>
              <ul className={GRID}>{group.themes.map((theme) => card(theme, false))}</ul>
            </section>
          ))}
        </div>
      );
  } else {
    const themes = tab === 'favorites' ? favorites : themesInCategory(tab);
    navigation = (
      <div>
        <Tabs items={tabs} value={tab} onChange={onTabChange} label="Theme categories" idPrefix="themes" />
      </div>
    );
    content =
      themes.length === 0 ? (
        <EmptyState
          icon={<Star className="size-5" aria-hidden />}
          title="No favorites yet"
          description="Star a theme to keep it here."
        />
      ) : (
        <ul className={GRID}>{themes.map((theme) => card(theme, tab === 'favorites'))}</ul>
      );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <TextInput
          ref={searchRef}
          type="text"
          role="searchbox"
          aria-label="Search themes"
          placeholder="Search themes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              setQuery('');
            }
          }}
          spellCheck={false}
          autoComplete="off"
          wrapperClassName="w-72 pr-1"
          leading={<Search className="size-4 shrink-0" aria-hidden />}
          trailing={
            query ? (
              <IconButton size="sm" label="Clear search" onClick={clearSearch} className="size-6">
                <X className="size-3.5" aria-hidden />
              </IconButton>
            ) : null
          }
        />

        <div className="grid max-w-[480px] min-w-0 flex-1 basis-80 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
          {/* The label wraps the switch and its title, so clicking the title toggles it too. */}
          <label className="contents">
            <Switch
              checked={settings.matchSystem}
              onChange={(on) => {
                setNotice(null);
                setMatchSystem(on);
              }}
              label="Match Windows light/dark"
            />
            <span className="text-[13px] leading-5 font-medium text-text">Match Windows light/dark</span>
          </label>
          <p aria-live="polite" className="col-start-2 text-[12px] text-text-muted">
            {explanation}
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-1 bg-bg px-1">{navigation}</div>

      {settings.matchSystem && (
        <p className="flex items-start gap-2 text-[12px] text-text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Picking a generic theme sets its half of the pair. Picking a specialty theme turns Match Windows off.
        </p>
      )}

      <div
        ref={panelRef}
        tabIndex={-1}
        {...(searching
          ? { role: 'region', 'aria-label': 'Search results' }
          : tabPanelProps('themes', tab))}
      >
        {content}
      </div>
    </div>
  );
}
