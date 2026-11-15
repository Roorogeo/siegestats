import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface Column<Row> {
  id: string;
  header: ReactNode;
  /** Accessible name of the header when it is not plain text (an icon). */
  headerLabel?: string;
  cell(row: Row, index: number): ReactNode;
  /** Makes the column sortable here, in the table. null always sorts last, whichever the direction. */
  sortValue?(row: Row): number | string | null;
  /** Sortable without sortValue: the parent sorts (by asking the source again) and passes `sort` back. */
  sortable?: boolean;
  /** Direction of the first click on this header. Default 'desc' (most first), 'asc' for names and positions. */
  firstDirection?: SortDirection;
  /** Default: left, or right for numeric columns. */
  align?: 'left' | 'right' | 'center';
  /** Figures that line up: tabular numbers, right-aligned. */
  numeric?: boolean;
  /** CSS width, e.g. '4rem' or '20%'. */
  width?: string;
  /** The sorted stat of a leaderboard: a tinted column. */
  highlight?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  columns: readonly Column<Row>[];
  /** undefined = still loading: skeleton rows are shown. */
  rows: readonly Row[] | undefined;
  rowKey(row: Row, index: number): string;
  /** Accessible name of the table (a visually hidden caption). */
  label: string;
  /** Number of skeleton rows while loading. */
  skeletonRows?: number;
  /** Rows are being re-fetched: keep them, dimmed, instead of flashing skeletons. */
  busy?: boolean;
  /** Shown in place of the rows when there are none. */
  empty?: ReactNode;
  /** Controlled sort. Omit both sort and defaultSort for no initial sort. */
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?(sort: SortState): void;
  /** The rows already come in order (the source sorted them): a header click only reports onSortChange. */
  manualSort?: boolean;
  /**
   * The header row stays visible while the rows scroll. With maxHeight the table scrolls inside its own box;
   * without it the header sticks to the page's scroll area.
   */
  stickyHeader?: boolean;
  maxHeight?: string;
  /** Makes rows clickable: pointer, and Enter or Space on a focused row. */
  onRowClick?(row: Row, index: number): void;
  /** Marks a row as the current one (the profile owner in a match, "me" on a leaderboard). */
  isRowCurrent?(row: Row): boolean;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const JUSTIFY = { left: 'justify-start', right: 'justify-end', center: 'justify-center' } as const;
const HIGHLIGHT = 'bg-[color-mix(in_oklab,var(--accent)_9%,transparent)]';

function compare(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Dense data table: 32 px rows, sortable headers (aria-sort), optional sticky header, keyboard-operable row clicks,
 * skeleton rows while loading and an empty state. Sorting is stable and keeps unknown values (null) at the bottom.
 */
export function DataTable<Row>({
  columns, rows, rowKey, label, skeletonRows = 6, busy = false, empty, sort, defaultSort = null, onSortChange,
  manualSort = false, stickyHeader = false, maxHeight, onRowClick, isRowCurrent, className,
}: DataTableProps<Row>) {
  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort);
  const active = sort === undefined ? ownSort : sort;

  const sorted = useMemo(() => {
    if (!rows || manualSort || !active) return rows;
    const column = columns.find((c) => c.id === active.columnId);
    const value = column?.sortValue;
    if (!value) return rows;
    const sign = active.direction === 'asc' ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, key: value(row) }))
      .sort((a, b) => {
        // Unknown values stay last in both directions; ties keep the source order.
        if (a.key === null || b.key === null) return compare(a.key, b.key) || a.index - b.index;
        return sign * compare(a.key, b.key) || a.index - b.index;
      })
      .map((entry) => entry.row);
  }, [rows, manualSort, active, columns]);

  const sortBy = (column: Column<Row>): void => {
    const next: SortState =
      active?.columnId === column.id
        ? { columnId: column.id, direction: active.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId: column.id, direction: column.firstDirection ?? 'desc' };
    if (sort === undefined) setOwnSort(next);
    onSortChange?.(next);
  };

  const alignOf = (column: Column<Row>) => column.align ?? (column.numeric ? 'right' : 'left');
  const scrollStyle: CSSProperties | undefined = maxHeight ? { maxHeight } : undefined;
  const clickable = onRowClick !== undefined;

  return (
    <div
      className={cn(maxHeight ? 'overflow-auto' : stickyHeader ? '' : 'overflow-x-auto', className)}
      style={scrollStyle}
    >
      <table className="w-full border-separate border-spacing-0 text-[13px]" aria-busy={rows === undefined || busy || undefined}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const isSortable = column.sortValue !== undefined || column.sortable === true;
              const direction = active?.columnId === column.id ? active.direction : null;
              const align = alignOf(column);
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={isSortable ? (direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none') : undefined}
                  aria-label={column.headerLabel}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'h-8 border-b border-border bg-surface px-3 text-xs font-medium whitespace-nowrap text-text-muted',
                    ALIGN[align],
                    stickyHeader && 'sticky top-0 z-10',
                    column.highlight && 'text-text',
                  )}
                >
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => sortBy(column)}
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-control font-medium transition-colors hover:text-text',
                        JUSTIFY[align],
                        align === 'right' && 'flex-row-reverse',
                        direction && 'text-text',
                      )}
                    >
                      {column.header}
                      {direction === 'asc' ? (
                        <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                      ) : direction === 'desc' ? (
                        <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={cn(busy && 'opacity-60 transition-opacity')}>
          {sorted === undefined ? (
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`skeleton-${i}`} aria-hidden>
                {columns.map((column) => (
                  <td key={column.id} className="h-8 border-b border-border px-3">
                    <Skeleton className={cn('h-3.5', column.numeric ? 'ml-auto w-10' : 'w-3/4')} />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="border-b border-border">
                {empty ?? <EmptyState title="Nothing to show" className="py-8" />}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const current = isRowCurrent?.(row) ?? false;
              return (
                <tr
                  key={rowKey(row, index)}
                  aria-current={current || undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick(row, index) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          onRowClick(row, index);
                        }
                      : undefined
                  }
                  className={cn(
                    // The card around the table draws the bottom edge.
                    'group/row [&:last-child>td]:border-b-0',
                    clickable && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2',
                    current && 'bg-surface-2',
                  )}
                >
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.id}
                      className={cn(
                        'h-8 border-b border-border px-3 whitespace-nowrap',
                        ALIGN[alignOf(column)],
                        column.numeric && 'tabular',
                        column.highlight && cn(HIGHLIGHT, 'font-semibold text-text'),
                        current && columnIndex === 0 && 'relative before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent',
                        column.className,
                      )}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
