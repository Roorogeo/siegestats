import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { EmptyState, Skeleton, type Column, type SortState } from '../../../ui';
import { sortRows } from './sort-rows';

interface ExpandableTableProps<Row> {
  columns: readonly Column<Row>[];
  /** undefined = still loading: skeleton rows. */
  rows: readonly Row[] | undefined;
  rowKey(row: Row): string;
  /** Accessible name of the table (a visually hidden caption). */
  label: string;
  /** Accessible name of a row's disclosure button: "Playlists of Operation Silent Hunt". */
  expandLabel(row: Row): string;
  /** What opens under a row. */
  detail(row: Row): ReactNode;
  defaultSort?: SortState | null;
  skeletonRows?: number;
  empty?: ReactNode;
  busy?: boolean;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const JUSTIFY = { left: 'justify-start', right: 'justify-end', center: 'justify-center' } as const;
const CELL = 'h-8 border-b border-border px-3 whitespace-nowrap';

/**
 * DataTable's look and sorting (aria-sort headers, unknown values last) with rows that open a detail row under them.
 * Each row starts with a disclosure button (aria-expanded, aria-controls); a click anywhere on the row does the same
 * with the pointer, so there is one tab stop per row. DataTable has no expandable rows, so this lives here for the
 * Seasons tab until it is needed elsewhere.
 */
export function ExpandableTable<Row>({
  columns, rows, rowKey, label, expandLabel, detail, defaultSort = null, skeletonRows = 6, empty, busy = false, className,
}: ExpandableTableProps<Row>) {
  const [sort, setSort] = useState<SortState | null>(defaultSort);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const baseId = useId();
  const sorted = useMemo(() => (rows ? sortRows(rows, columns, sort) : undefined), [rows, columns, sort]);
  const alignOf = (column: Column<Row>) => column.align ?? (column.numeric ? 'right' : 'left');
  const span = columns.length + 1;

  const toggle = (key: string): void =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sortBy = (column: Column<Row>): void =>
    setSort((current) =>
      current?.columnId === column.id
        ? { columnId: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId: column.id, direction: column.firstDirection ?? 'desc' },
    );

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-separate border-spacing-0 text-[13px]" aria-busy={rows === undefined || busy || undefined}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className="h-8 w-9 border-b border-border bg-surface px-0">
              <span className="sr-only">Details</span>
            </th>
            {columns.map((column) => {
              const sortable = column.sortValue !== undefined;
              const direction = sort?.columnId === column.id ? sort.direction : null;
              const align = alignOf(column);
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={sortable ? (direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none') : undefined}
                  aria-label={column.headerLabel}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn('h-8 border-b border-border bg-surface px-3 text-xs font-medium whitespace-nowrap text-text-muted', ALIGN[align])}
                >
                  {sortable ? (
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
                <td className={cn(CELL, 'px-0')} />
                {columns.map((column) => (
                  <td key={column.id} className={CELL}>
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
              const key = rowKey(row);
              const expanded = open.has(key);
              const detailId = `${baseId}-detail-${index}`;
              const last = index === sorted.length - 1;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={(event) => {
                      // Links and buttons inside the row do their own thing.
                      if (event.target instanceof Element && event.target.closest('a, button') !== null) return;
                      toggle(key);
                    }}
                    className={cn('cursor-pointer hover:bg-surface-2', expanded && 'bg-surface-2', last && !expanded && '[&>td]:border-b-0')}
                  >
                    <td className={cn(CELL, 'w-9 px-0 text-center')}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={expanded ? detailId : undefined}
                        aria-label={expandLabel(row)}
                        title={expandLabel(row)}
                        onClick={() => toggle(key)}
                        className="inline-flex size-6 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface hover:text-text"
                      >
                        <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} aria-hidden />
                      </button>
                    </td>
                    {columns.map((column) => (
                      <td key={column.id} className={cn(CELL, ALIGN[alignOf(column)], column.numeric && 'tabular', column.className)}>
                        {column.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr>
                      <td id={detailId} colSpan={span} className={cn('border-b border-border bg-bg p-0', last && 'border-b-0')}>
                        {detail(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
