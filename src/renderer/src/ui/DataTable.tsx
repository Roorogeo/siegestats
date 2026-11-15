import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Fragment, useId, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { sortRows, type SortDirection, type SortState } from './sort-rows';

export { sortRows, type SortDirection, type SortState };

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
  /**
   * Rows that open a detail row under them. Each row starts with a disclosure button (aria-expanded, aria-controls);
   * a pointer click anywhere else on the row (not on a link or button in it) does the same, so there is one tab stop
   * per row. Rows stay open across sorting (by rowKey).
   */
  detail?(row: Row): ReactNode;
  /** Accessible name and tooltip of a row's disclosure button: "Playlists of Operation Silent Hunt". */
  detailLabel?(row: Row): string;
  /**
   * Totals under the rows, in the table's own <tfoot>: one or more <tr>, each starting with a <th scope="row"> that
   * names it ("Team total"). Its cells get the rows' height and padding, semibold on a tinted band, the row header
   * left-aligned; each <td> sets its own alignment (text-right tabular for figures). Sorting never moves it.
   */
  footer?: ReactNode;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const JUSTIFY = { left: 'justify-start', right: 'justify-end', center: 'justify-center' } as const;
const HIGHLIGHT = 'bg-[color-mix(in_oklab,var(--accent)_9%,transparent)]';
const CELL = 'h-8 border-b border-border px-3 whitespace-nowrap';
const CURRENT_BAR = 'relative before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent-text';
const FOOTER =
  'text-text [&>tr>*]:h-8 [&>tr>*]:bg-surface-2/50 [&>tr>*]:px-3 [&>tr>*]:font-semibold [&>tr>*]:whitespace-nowrap [&>tr>th]:text-left [&>tr:not(:last-child)>*]:border-b [&>tr:not(:last-child)>*]:border-border';

/**
 * Dense data table: 32 px rows, sortable headers (aria-sort), optional sticky header, keyboard-operable row clicks,
 * rows that open a detail row, a totals footer, skeleton rows while loading and an empty state. Sorting is stable
 * and keeps unknown values (null) at the bottom.
 */
export function DataTable<Row>({
  columns, rows, rowKey, label, skeletonRows = 6, busy = false, empty, sort, defaultSort = null, onSortChange,
  manualSort = false, stickyHeader = false, maxHeight, onRowClick, isRowCurrent, detail, detailLabel, footer, className,
}: DataTableProps<Row>) {
  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const baseId = useId();
  const active = sort === undefined ? ownSort : sort;

  const sorted = useMemo(
    () => (!rows || manualSort || !active ? rows : sortRows(rows, columns, active)),
    [rows, manualSort, active, columns],
  );

  const sortBy = (column: Column<Row>): void => {
    const next: SortState =
      active?.columnId === column.id
        ? { columnId: column.id, direction: active.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId: column.id, direction: column.firstDirection ?? 'desc' };
    if (sort === undefined) setOwnSort(next);
    onSortChange?.(next);
  };

  const toggle = (key: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const alignOf = (column: Column<Row>) => column.align ?? (column.numeric ? 'right' : 'left');
  const scrollStyle: CSSProperties | undefined = maxHeight ? { maxHeight } : undefined;
  const clickable = onRowClick !== undefined;
  const expandable = detail !== undefined;
  const span = columns.length + (expandable ? 1 : 0);
  // The card around the table draws the bottom edge, unless a footer comes after the rows.
  const lastRowEdge = footer === undefined && '[&:last-child>td]:border-b-0';

  return (
    <div
      className={cn(maxHeight ? 'overflow-auto' : stickyHeader ? '' : 'overflow-x-auto', className)}
      style={scrollStyle}
    >
      <table className="w-full border-separate border-spacing-0 text-[13px]" aria-busy={rows === undefined || busy || undefined}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {expandable && (
              <th scope="col" className={cn('h-8 w-9 border-b border-border bg-surface px-0', stickyHeader && 'sticky top-0 z-10')}>
                <span className="sr-only">Details</span>
              </th>
            )}
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
              <tr key={`skeleton-${i}`} aria-hidden className={cn(lastRowEdge)}>
                {expandable && <td className="h-8 border-b border-border px-0" />}
                {columns.map((column) => (
                  <td key={column.id} className="h-8 border-b border-border px-3">
                    <Skeleton className={cn('h-3.5', column.numeric ? 'ml-auto w-10' : 'w-3/4')} />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={span} className="border-b border-border">
                {empty ?? <EmptyState title="Nothing to show" className="py-8" />}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const key = rowKey(row, index);
              const current = isRowCurrent?.(row) ?? false;
              const expanded = expandable && open.has(key);
              const detailId = `${baseId}-detail-${index}`;
              const name = detailLabel?.(row) ?? 'Details';
              const onClick = clickable
                ? () => onRowClick(row, index)
                : expandable
                  ? (event: MouseEvent<HTMLTableRowElement>) => {
                      // Links and buttons inside the row do their own thing.
                      if (event.target instanceof Element && event.target.closest('a, button') !== null) return;
                      toggle(key);
                    }
                  : undefined;
              return (
                <Fragment key={key}>
                  <tr
                    aria-current={current || undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={onClick}
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
                      'group/row',
                      lastRowEdge,
                      clickable && 'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2',
                      expandable && !clickable && 'cursor-pointer hover:bg-surface-2',
                      (current || expanded) && 'bg-surface-2',
                    )}
                  >
                    {expandable && (
                      <td className={cn(CELL, 'w-9 px-0 text-center', current && CURRENT_BAR)}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={expanded ? detailId : undefined}
                          aria-label={name}
                          title={name}
                          onClick={() => toggle(key)}
                          className="inline-flex size-6 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface hover:text-text"
                        >
                          <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} aria-hidden />
                        </button>
                      </td>
                    )}
                    {columns.map((column, columnIndex) => (
                      <td
                        key={column.id}
                        className={cn(
                          CELL,
                          ALIGN[alignOf(column)],
                          column.numeric && 'tabular',
                          column.highlight && cn(HIGHLIGHT, 'font-semibold text-text'),
                          current && !expandable && columnIndex === 0 && CURRENT_BAR,
                          column.className,
                        )}
                      >
                        {column.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                  {expanded && detail && (
                    <tr className={cn(lastRowEdge)}>
                      <td id={detailId} colSpan={span} className="border-b border-border bg-bg p-0">
                        {detail(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
        {footer !== undefined && <tfoot className={cn(FOOTER, busy && 'opacity-60 transition-opacity')}>{footer}</tfoot>}
      </table>
    </div>
  );
}
