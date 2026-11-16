import type { ReactNode } from 'react';
import type { IsoDateTime } from '@shared/types/primitives';
import type { PlayerSearchResult } from '@shared/types/player';
import { Avatar, PlatformLabel, RankBadge } from '../../components';
import { cn } from '../../lib/cn';
import { formatNumber, timeAgo } from '../../lib/format';
import { Skeleton } from '../../ui';
import { splitMatch } from './search-model';
import type { SearchOption } from './usePlayerSearch';

/** The typed text inside a name, in a heavier weight (not a colour), so the match reads in every theme. */
export function HighlightedName({ name, typed }: { name: string; typed: string }) {
  const parts = splitMatch(name, typed);
  if (!parts) return <>{name}</>;
  return (
    <>
      {parts.before}
      <mark className="bg-transparent font-semibold text-text">{parts.match}</mark>
      {parts.after}
    </>
  );
}

interface OptionRowProps {
  option: SearchOption;
  active: boolean;
  onChoose(option: SearchOption): void;
  /** The row's cells, with a space between each two (see OptionRow). */
  children: ReactNode;
}

/**
 * One choosable row of a search list. It never takes focus: the field keeps it and points at the active row with
 * aria-activedescendant. The active row has a surface tint and an accent bar on its left edge.
 *
 * It is named from its cells, not by an aria-label, so its name is the row's visible words in their order (what voice
 * control users say), with a hidden word where the row abbreviates ("S5 Silver V"). The spaces between the cells keep
 * their words apart in that name; flex layout does not draw them.
 */
export function OptionRow({ option, active, onChoose, children }: OptionRowProps) {
  return (
    <div
      id={option.domId}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      // Keep focus in the field while clicking.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onChoose(option)}
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-control px-2 py-1 text-[13px] text-text hover:bg-surface-2',
        active && 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent-text)]',
      )}
    >
      {children}
    </div>
  );
}

const LEVEL_CELL = 'w-14 shrink-0 text-right text-xs text-text-muted tabular';
const RANK_CELL = 'flex w-9 shrink-0 justify-center';
const PLAYED_CELL = 'w-[76px] shrink-0 text-right text-xs text-text-muted tabular whitespace-nowrap';

/** A search result: avatar, name with the typed part emphasised, level, current rank, last played. */
export function ResultRow({
  option, result, typed, active, now, onChoose,
}: { option: SearchOption; result: PlayerSearchResult; typed: string; active: boolean; now: number; onChoose(option: SearchOption): void }) {
  const played = timeAgo(result.lastPlayedAt, now);
  // Named from its cells: "Otter_919 Exact match Lv 236 S3 Silver III 7 h ago" (the badge by the short name it shows,
  // then the full one).
  return (
    <OptionRow option={option} active={active} onChoose={onChoose}>
      <Avatar player={result} size="md" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate" title={result.name}>
          <HighlightedName name={result.name} typed={typed} />
        </span>
        {result.exactMatch && (
          <>
            {' '}
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-border bg-surface-2 px-1.5 text-[10px] font-medium text-text-muted">
              Exact<span className="sr-only"> match</span>
            </span>
          </>
        )}
      </span>{' '}
      <span className={LEVEL_CELL} title="Level">
        Lv {formatNumber(result.level)}
      </span>{' '}
      <span className={RANK_CELL}>
        <RankBadge rankId={result.rankId} size="sm" shortNameInLabel />
      </span>{' '}
      <span className={PLAYED_CELL} title="Last played">
        {played}
      </span>
    </OptionRow>
  );
}

/** A pinned account, favourite or recent search: avatar, name, platform, and for recent searches when. */
export function SuggestionRow({
  option, at, active, now, onChoose,
}: { option: SearchOption; at: IsoDateTime | null; active: boolean; now: number; onChoose(option: SearchOption): void }) {
  const { player } = option;
  const when = at === null ? null : timeAgo(at, now);
  // Named from its cells: "quiet_luzensor PC just now".
  return (
    <OptionRow option={option} active={active} onChoose={onChoose}>
      <Avatar player={player} size="sm" />
      <span className="min-w-0 flex-1 truncate" title={player.name}>
        {player.name}
      </span>{' '}
      <PlatformLabel platform={player.platform} className="shrink-0" />
      {when !== null && (
        <>
          {' '}
          <span className={PLAYED_CELL}>{when}</span>
        </>
      )}
    </OptionRow>
  );
}

/** Placeholder rows while the first answer loads, shaped like ResultRow. */
export function ResultSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = ['w-32', 'w-24', 'w-40', 'w-28'];
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-h-9 items-center gap-2.5 px-2 py-1">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1">
            <Skeleton className={cn('h-3.5', widths[index % widths.length])} />
          </span>
          <Skeleton className="h-3 w-10 shrink-0" />
          <span className={RANK_CELL}>
            <Skeleton className="h-[18px] w-7" />
          </span>
          <span className="flex w-[76px] shrink-0 justify-end">
            <Skeleton className="h-3 w-14" />
          </span>
        </div>
      ))}
    </div>
  );
}
