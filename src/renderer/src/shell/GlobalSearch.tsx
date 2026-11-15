import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import type { Platform } from '@shared/types/primitives';
import { playerPath } from '../app/routes';
import { useSettings } from '../app/SettingsProvider';
import { ariaKeyShortcuts, hotkeyParts } from '../app/shortcuts';
import { PLATFORM_LABEL } from '../components';
import { useGlobalSearchRequests } from '../features/search/open-search';
import { SearchAnnouncer, SearchPanel } from '../features/search/SearchPanel';
import { usePlayerSearch } from '../features/search/usePlayerSearch';
import { cn } from '../lib/cn';
import { Kbd, TextInput } from '../ui';
import { PLATFORMS } from './platforms';
import { FLOATING_SHADOW } from './Popover';

const SUGGESTIONS = ['mine', 'favorites', 'recent'] as const;

function PlatformSelect({ value, onChange }: { value: Platform; onChange(platform: Platform): void }) {
  return (
    <span className="relative flex h-5 items-center border-l border-border pl-1">
      <select
        aria-label="Platform to search"
        title={`Search on ${PLATFORM_LABEL[value]}`}
        value={value}
        onChange={(event) => onChange(event.target.value as Platform)}
        className="h-5 appearance-none rounded bg-transparent pr-5 pl-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
      >
        {PLATFORMS.map((platform) => (
          <option key={platform} value={platform} className="bg-surface text-text">
            {PLATFORM_LABEL[platform]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0.5 size-3.5" aria-hidden />
    </span>
  );
}

/**
 * The global player search in the title bar (brief: username + platform, recent and pinned results).
 *  - Empty field: My accounts (pinned), Favourites, Recent (design question 19).
 *  - Typing: a debounced search on the chosen platform, exact matches first.
 *  - Arrow keys move the active option, Enter opens it (or the first result), Escape closes and keeps focus.
 *  - Opening a player goes to their profile, remembers the search, closes the list and leaves the field.
 * The platform picked here applies to this search only, never to the default-platform setting. Other screens
 * open it pre-filled with openGlobalSearch().
 */
export function GlobalSearch({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;

  const search = usePlayerSearch({
    idPrefix,
    suggestions: SUGGESTIONS,
    enabled: open,
    clearOnChoose: true,
    onChoose: (player) => {
      setOpen(false);
      inputRef.current?.blur();
      void navigate(playerPath(player));
    },
  });

  // openGlobalSearch() from any screen: fill in, open, and focus once the new text is on screen.
  const [focusRequest, setFocusRequest] = useState(0);
  useGlobalSearchRequests((request) => {
    search.prefill(request);
    setOpen(true);
    setFocusRequest((n) => n + 1);
  });
  useEffect(() => {
    const input = inputRef.current;
    if (focusRequest === 0 || !input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focusRequest, inputRef]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const refocus = (): void => inputRef.current?.focus();
  const hint = hotkeyParts(settings.hotkeys.focusSearch);

  return (
    <div
      ref={containerRef}
      className="app-no-drag relative w-full"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        // The combobox pattern: Escape closes the list and leaves focus where it is; with the list closed it clears the field.
        if (open) {
          event.preventDefault();
          setOpen(false);
        } else if (event.target === inputRef.current && search.text !== '') {
          event.preventDefault();
          search.setText('');
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <TextInput
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Search players"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? search.activeDomId : undefined}
        aria-keyshortcuts={ariaKeyShortcuts(settings.hotkeys.focusSearch)}
        placeholder="Search players"
        autoComplete="off"
        spellCheck={false}
        value={search.text}
        onChange={(event) => {
          search.setText(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
          if (!open && plain && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          if (!open && plain && event.key === 'Enter') setOpen(true);
          if (search.handleKey(event)) event.preventDefault();
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        wrapperClassName="h-7! pr-1.5"
        leading={<Search className="size-4 shrink-0" aria-hidden />}
        trailing={
          <span className="flex shrink-0 items-center gap-1.5">
            {!open && !search.text && hint.length > 0 && (
              <span className="flex items-center gap-0.5" aria-hidden>
                {hint.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            )}
            {search.text !== '' && (
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                onClick={() => {
                  search.setText('');
                  refocus();
                }}
                className="flex size-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
            <PlatformSelect value={search.platform} onChange={search.setPlatform} />
          </span>
        }
      />
      {open && (
        <div
          id={panelId}
          // Clicks inside the panel keep focus in the field (buttons still work: click follows mousedown).
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            'absolute inset-x-0 top-full z-50 mt-1.5 max-h-[calc(100vh-64px)] overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-1.5',
            FLOATING_SHADOW,
          )}
        >
          <SearchPanel
            search={search}
            refocus={refocus}
            hint={
              <span className="text-text-muted">
                Type a player’s in-game name. Accounts you pin as yours, players you star and players you open are listed here.
              </span>
            }
          />
        </div>
      )}
      <SearchAnnouncer message={open ? search.announcement : ''} />
    </div>
  );
}
