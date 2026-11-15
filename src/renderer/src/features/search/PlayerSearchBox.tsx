import { Search, X } from 'lucide-react';
import { useId, useRef } from 'react';
import type { Platform } from '@shared/types/primitives';
import type { PlayerRef } from '@shared/types/player';
import { PLATFORM_LABEL } from '../../components';
import { PLATFORMS } from '../../shell/platforms';
import { SegmentedControl, TextInput, type SegmentOption } from '../../ui';
import { SearchAnnouncer, SearchPanel } from './SearchPanel';
import { usePlayerSearch } from './usePlayerSearch';

export interface PlayerSearchBoxProps {
  /** Accessible name of the field, e.g. "Find your account". */
  label: string;
  /** Called with the player the user picked (click or Enter). */
  onSelect(player: PlayerRef): void;
  placeholder?: string;
  autoFocus?: boolean;
}

const SUGGESTIONS = ['favorites', 'recent'] as const;
const PLATFORM_OPTIONS: readonly SegmentOption<Platform>[] = PLATFORMS.map((id) => ({ id, label: PLATFORM_LABEL[id] }));

/**
 * An inline player search, username + platform, with the results in a card below the field instead of a dropdown.
 * Used by My Profile's onboarding ("search for my account and pin it"). It searches like the title bar's search
 * (same debounce, results, states and keys) but calls onSelect with the picked player instead of opening the
 * profile; the pick is remembered as a recent search too. With an empty field it lists favourites and recent
 * searches (not pinned accounts: picking one here would pin it again).
 */
export function PlayerSearchBox({ label, onSelect, placeholder = 'In-game name', autoFocus = false }: PlayerSearchBoxProps) {
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;
  const inputRef = useRef<HTMLInputElement>(null);
  const search = usePlayerSearch({ idPrefix, suggestions: SUGGESTIONS, enabled: true, onChoose: onSelect });
  const refocus = (): void => inputRef.current?.focus();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded
          aria-controls={panelId}
          aria-autocomplete="list"
          aria-activedescendant={search.activeDomId}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={search.text}
          onChange={(event) => search.setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search.text !== '') {
              event.preventDefault();
              search.setText('');
              return;
            }
            if (search.handleKey(event)) event.preventDefault();
          }}
          wrapperClassName="min-w-48 flex-1"
          leading={<Search className="size-4 shrink-0" aria-hidden />}
          trailing={
            search.text !== '' && (
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                onClick={() => {
                  search.setText('');
                  refocus();
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )
          }
        />
        <SegmentedControl label="Platform to search" options={PLATFORM_OPTIONS} value={search.platform} onChange={search.setPlatform} />
      </div>
      <div
        id={panelId}
        // Clicks inside the list keep focus in the field (buttons still work: click follows mousedown).
        onMouseDown={(event) => event.preventDefault()}
        className="max-h-[420px] overflow-y-auto rounded-card border border-border bg-surface p-1.5 text-left"
      >
        <SearchPanel
          search={search}
          refocus={refocus}
          hint={<span className="text-text-muted">Type your in-game name, then pick your account from the list.</span>}
        />
      </div>
      <SearchAnnouncer message={search.announcement} />
    </div>
  );
}
