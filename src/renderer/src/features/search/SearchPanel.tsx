import { CircleSlash, CloudOff, History, LoaderCircle, Pin, Search, SearchX, Star, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Platform } from '@shared/types/primitives';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import { PLATFORM_LABEL } from '../../components';
import { PLATFORMS } from '../../shell/platforms';
import { Button } from '../../ui';
import type { SuggestionKind } from './search-model';
import { ResultRow, ResultSkeleton, SuggestionRow } from './SearchRows';
import type { PlayerSearch, ResultsState, SearchOption } from './usePlayerSearch';

const GROUP: Record<SuggestionKind, { title: string; icon: ReactNode }> = {
  mine: { title: 'My accounts', icon: <Pin className="size-3.5" aria-hidden /> },
  favorites: { title: 'Favourites', icon: <Star className="size-3.5" aria-hidden /> },
  recent: { title: 'Recent', icon: <History className="size-3.5" aria-hidden /> },
};

/** A line inside the panel that is not an option: hints, empty and error states. */
function Note({ icon, children, action, className }: { icon: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 px-2 py-2.5 text-[13px]', className)}>
      <span className="mt-0.5 flex shrink-0 text-text-muted">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

function GroupLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} role="presentation" className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-medium text-text-muted">
      {children}
    </div>
  );
}

interface SearchPanelProps {
  search: PlayerSearch;
  /** Puts focus back in the field after a button inside the panel was used (platform switch, Retry). */
  refocus(): void;
  /** Shown with an empty field when there is nothing to suggest. */
  hint: ReactNode;
}

/**
 * What a player search shows under its field, shared by the title bar's dropdown and the inline PlayerSearchBox:
 * with an empty field the suggestions (pinned, favourites, recent); with text the results for the platform, or
 * their loading, empty, error and "not available" states. Rows are options of a listbox driven from the field.
 */
export function SearchPanel({ search, refocus, hint }: SearchPanelProps) {
  const now = useNow();
  const { view, idPrefix, activeKey } = search;
  const choose = (option: SearchOption): void => search.choose(option.player);

  if (view.mode === 'suggestions') {
    const { groups, recentError } = view;
    return (
      <>
        {groups.length > 0 && (
          <div id={`${idPrefix}-listbox`} role="listbox" aria-label="Search suggestions" className="flex flex-col">
            {groups.map((group, index) => {
              const labelId = `${idPrefix}-group-${group.kind}`;
              return (
                <div key={group.kind} role="group" aria-labelledby={labelId} className={cn(index > 0 && 'mt-1 border-t border-border pt-1')}>
                  <GroupLabel id={labelId}>
                    {GROUP[group.kind].icon}
                    {GROUP[group.kind].title}
                  </GroupLabel>
                  {group.items.map((item) => (
                    <SuggestionRow
                      key={item.option.key}
                      option={item.option}
                      at={item.at}
                      active={item.option.key === activeKey}
                      now={now}
                      onChoose={choose}
                    />
                  ))}
                  {group.more > 0 && (
                    <p className="px-2 py-1 text-xs text-text-muted">
                      {group.more} more in the Favourites tab of the notifications menu
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {recentError && (
          <Note
            icon={<TriangleAlert className="size-4 text-negative" aria-hidden />}
            action={
              <Button
                size="sm"
                variant="ghost"
                className="h-6"
                onClick={() => {
                  view.retryRecent();
                  refocus();
                }}
              >
                Retry
              </Button>
            }
          >
            <span className="text-text-muted">Recent searches could not be loaded.</span>
          </Note>
        )}
        {groups.length === 0 && !recentError && <Note icon={<Search className="size-4" aria-hidden />}>{hint}</Note>}
      </>
    );
  }

  const { state, platform, name } = view;
  const labelId = `${idPrefix}-results-label`;
  const busy = state.kind === 'loading' || (state.kind === 'results' && state.busy);
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1.5 text-xs text-text-muted">
        <span id={labelId} className="font-medium">
          Players on {PLATFORM_LABEL[platform]}
        </span>
        {busy && (
          <span className="flex items-center gap-1">
            <LoaderCircle className="size-3 animate-spin" aria-hidden />
            Searching
          </span>
        )}
      </div>
      <ResultsBody
        state={state}
        name={name}
        platform={platform}
        labelId={labelId}
        idPrefix={idPrefix}
        activeKey={activeKey}
        now={now}
        onChoose={choose}
        onRetry={() => {
          view.retry();
          refocus();
        }}
        onSwitch={(other) => {
          search.setPlatform(other);
          refocus();
        }}
      />
    </>
  );
}

interface ResultsBodyProps {
  state: ResultsState;
  name: string;
  platform: Platform;
  labelId: string;
  idPrefix: string;
  activeKey: string | null;
  now: number;
  onChoose(option: SearchOption): void;
  onRetry(): void;
  onSwitch(platform: Platform): void;
}

function ResultsBody({ state, name, platform, labelId, idPrefix, activeKey, now, onChoose, onRetry, onSwitch }: ResultsBodyProps) {
  switch (state.kind) {
    case 'loading':
      return <ResultSkeleton />;
    case 'empty':
      return (
        <Note icon={<SearchX className="size-4" aria-hidden />}>
          <p className="text-text">
            No players named “<span className="selectable">{name}</span>” on {PLATFORM_LABEL[platform]}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">Accounts are separate on each platform. Check the spelling, or try another platform:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLATFORMS.filter((other) => other !== platform).map((other) => (
              <Button key={other} size="sm" onClick={() => onSwitch(other)}>
                Search on {PLATFORM_LABEL[other]}
              </Button>
            ))}
          </div>
        </Note>
      );
    case 'error': {
      const wait = state.error.retryAfterSec !== null && state.error.retryAfterSec > 0 ? ` Try again in ${state.error.retryAfterSec} s.` : '';
      return (
        <Note
          icon={<TriangleAlert className="size-4 text-negative" aria-hidden />}
          action={
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          <p className="text-text">The search failed</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {state.error.message}
            {wait}
          </p>
        </Note>
      );
    }
    case 'unavailable':
      return (
        <Note icon={<CircleSlash className="size-4" aria-hidden />}>
          <p className="text-text">Not available from this source</p>
          <p className="mt-0.5 text-xs text-text-muted">{state.error.message}</p>
        </Note>
      );
    case 'results':
      return (
        <>
          {state.staleSince !== null && (
            <p className="mx-2 mb-1 flex items-center gap-1.5 rounded-control bg-surface-2 px-2 py-1 text-xs text-text-muted">
              <CloudOff className="size-3.5 shrink-0" aria-hidden />
              The stats source cannot be reached. Saved results from {timeAgo(state.staleSince, now)}.
            </p>
          )}
          <div id={`${idPrefix}-listbox`} role="listbox" aria-labelledby={labelId} aria-busy={state.busy} className="flex flex-col">
            {state.items.map((item) => (
              <ResultRow
                key={item.option.key}
                option={item.option}
                result={item.result}
                typed={name}
                active={item.option.key === activeKey}
                now={now}
                onChoose={onChoose}
              />
            ))}
          </div>
          {state.limited && (
            <p className="mt-1 border-t border-border px-2 pt-1.5 pb-0.5 text-xs text-text-muted">
              Showing the first {state.items.length} matches. Type more of the name to narrow them down.
            </p>
          )}
        </>
      );
  }
}

/** The polite live region that tells screen-reader users what the list now shows. Keep it mounted. */
export function SearchAnnouncer({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
