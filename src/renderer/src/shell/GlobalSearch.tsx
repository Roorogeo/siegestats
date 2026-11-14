import { useQuery } from '@tanstack/react-query';
import { ChevronDown, History, Pin, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Platform } from '@shared/types/primitives';
import type { PlayerRef } from '@shared/types/player';
import { useAppInfo } from '../app/AppInfoProvider';
import { useSettings } from '../app/SettingsProvider';
import { ariaKeyShortcuts, hotkeyParts } from '../app/shortcuts';
import { bridge } from '../bridge';
import { cn } from '../lib/cn';
import { Kbd, Skeleton, TextInput } from '../ui';
import { PLATFORM_LABEL, PLATFORMS } from './platforms';
import { FLOATING_SHADOW } from './Popover';

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

function Group({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="py-1">
      <div id={id} role="presentation" className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-text-muted">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/** A row that cannot be chosen yet: an empty-state line, or an entry whose target arrives later. */
function InertOption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="option" aria-selected={false} aria-disabled="true" className={cn('rounded-control px-2 py-1.5 text-[13px]', className)}>
      {children}
    </div>
  );
}

function PlayerLine({ player }: { player: PlayerRef }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate text-text">{player.name}</span>
      <span className="shrink-0 text-xs text-text-muted">{PLATFORM_LABEL[player.platform]}</span>
    </span>
  );
}

/**
 * The global player search. Phase 1: a working control with honest empty sections; results arrive with
 * the search backend in phase 2. The platform picked here applies to this search only, not to the setting.
 */
export function GlobalSearch({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { settings } = useSettings();
  const { config } = useAppInfo();
  const defaultPlatform = settings.defaultPlatform;
  // Follows the default platform until the user picks another one here; a later change of the default wins again.
  const [choice, setChoice] = useState<{ base: Platform; value: Platform } | null>(null);
  const platform = choice?.base === defaultPlatform ? choice.value : defaultPlatform;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const pinnedId = useId();
  const recentId = useId();

  const pinned = settings.accounts[config.provider].pinned;
  const recent = useQuery({ queryKey: ['searches', 'recent'], queryFn: () => bridge.searches.recent(), enabled: open });
  const hint = hotkeyParts(settings.hotkeys.focusSearch);
  const trimmed = query.trim();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="app-no-drag relative w-full"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
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
        aria-keyshortcuts={ariaKeyShortcuts(settings.hotkeys.focusSearch)}
        placeholder="Search players"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        wrapperClassName="h-7! pr-1.5"
        leading={<Search className="size-4 shrink-0" aria-hidden />}
        trailing={
          <span className="flex shrink-0 items-center gap-1.5">
            {!open && !query && hint.length > 0 && (
              <span className="flex items-center gap-0.5" aria-hidden>
                {hint.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            )}
            <PlatformSelect value={platform} onChange={(value) => setChoice({ base: defaultPlatform, value })} />
          </span>
        }
      />
      {open && (
        <div
          id={panelId}
          role="listbox"
          aria-label="Search suggestions"
          className={cn('absolute inset-x-0 top-full z-50 mt-1.5 rounded-card border border-border bg-surface p-1.5', FLOATING_SHADOW)}
        >
          {trimmed ? (
            <InertOption className="flex flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2 text-text">
                <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
                <span className="truncate">
                  “{trimmed}” on {PLATFORM_LABEL[platform]}
                </span>
              </span>
              <span className="pl-6 text-xs text-text-muted">Player search arrives in phase 2</span>
            </InertOption>
          ) : (
            <>
              <Group id={pinnedId} title="Pinned accounts" icon={<Pin className="size-3.5" aria-hidden />}>
                {pinned.length === 0 ? (
                  <InertOption className="text-text-muted">Accounts you pin as yours appear here</InertOption>
                ) : (
                  pinned.map(({ player }) => (
                    <InertOption key={`${player.platform}:${player.id}`}>
                      <PlayerLine player={player} />
                    </InertOption>
                  ))
                )}
              </Group>
              <div className="mx-2 border-t border-border" role="presentation" />
              <Group id={recentId} title="Recent searches" icon={<History className="size-3.5" aria-hidden />}>
                {recent.isPending ? (
                  <InertOption>
                    <Skeleton className="h-4 w-40" />
                    <span className="sr-only">Loading recent searches</span>
                  </InertOption>
                ) : recent.isError ? (
                  <InertOption className="text-text-muted">Recent searches could not be loaded.</InertOption>
                ) : recent.data.length === 0 ? (
                  <InertOption className="text-text-muted">Players you look up appear here</InertOption>
                ) : (
                  recent.data.map(({ player }) => (
                    <InertOption key={`${player.platform}:${player.id}`}>
                      <PlayerLine player={player} />
                    </InertOption>
                  ))
                )}
              </Group>
            </>
          )}
        </div>
      )}
    </div>
  );
}
