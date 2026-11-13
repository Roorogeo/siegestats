import { Check, Monitor, Moon, Star, Sun } from 'lucide-react';
import { memo, useId } from 'react';
import type { Theme, ThemeMode } from '@shared/types/theme';
import { cn } from '../../lib/cn';
import { Badge, IconButton } from '../../ui';
import { ThemeMiniature } from './ThemeMiniature';

interface ThemePreviewCardProps {
  theme: Theme;
  /** On screen right now. */
  active: boolean;
  favorite: boolean;
  /** With "Match Windows" on: which half of the pair this theme is, if any. */
  windowsMode: ThemeMode | null;
  /** Also show the category, for lists that mix categories (search results, favourites). */
  categoryLabel?: string | undefined;
  onSelect(theme: Theme): void;
  onToggleFavorite(theme: Theme): void;
}

/**
 * One cell of the picker grid. The whole card is a single button that applies the theme; the favourite star is
 * its sibling (never nested), laid over the card's footer. Name, badges and the star are in the app's own
 * theme, so they read the same on every card; only the miniature is in the previewed theme.
 */
export const ThemePreviewCard = memo(function ThemePreviewCard({
  theme,
  active,
  favorite,
  windowsMode,
  categoryLabel,
  onSelect,
  onToggleFavorite,
}: ThemePreviewCardProps) {
  const metaId = useId();
  return (
    <li className="relative">
      <button
        type="button"
        data-theme-id={theme.id}
        aria-pressed={active}
        aria-label={theme.name}
        aria-describedby={metaId}
        onClick={() => onSelect(theme)}
        className={cn(
          'group flex w-full flex-col overflow-hidden rounded-card border bg-surface text-left transition-colors',
          active ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-text-muted',
        )}
      >
        <ThemeMiniature theme={theme} />
        <div className={cn('w-full border-t px-3 py-2 pr-11 transition-colors group-hover:bg-surface-2', active ? 'border-accent' : 'border-border')}>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-text">{theme.name}</span>
            {active && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent-text">
                <span aria-hidden className="flex size-4 items-center justify-center rounded-full bg-accent text-on-accent">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                In use
              </span>
            )}
          </div>
          <div id={metaId} className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            <Badge>
              {theme.mode === 'light' ? <Sun className="size-3" aria-hidden /> : <Moon className="size-3" aria-hidden />}
              {theme.mode === 'light' ? 'Light' : 'Dark'}
            </Badge>
            {windowsMode && (
              <Badge>
                <Monitor className="size-3" aria-hidden />
                {windowsMode === 'light' ? 'Windows light' : 'Windows dark'}
              </Badge>
            )}
            {categoryLabel && !windowsMode && <span className="truncate text-[11px] text-text-muted">{categoryLabel}</span>}
          </div>
        </div>
      </button>
      {/* A sibling of the card button, laid over its footer: buttons must not nest. */}
      <span className="absolute right-2 bottom-3.5">
        <IconButton
          data-star-for={theme.id}
          label={favorite ? `Remove ${theme.name} from favourites` : `Add ${theme.name} to favourites`}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(theme)}
        >
          <Star className={cn('size-4', favorite && 'fill-current text-accent-text')} aria-hidden />
        </IconButton>
      </span>
    </li>
  );
});
