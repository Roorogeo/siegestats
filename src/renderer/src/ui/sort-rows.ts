/**
 * DataTable's sort as plain data, so it can be unit-tested and so a table that cuts its list short ("Show N more")
 * can sort the whole list first and hand the table the rows with manualSort.
 */

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

/** The part of a DataTable column the sort reads. */
export interface SortableColumn<Row> {
  id: string;
  sortValue?(row: Row): number | string | null;
}

function compare(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The rows in the order DataTable shows them for `sort`: stable (ties keep the source order), numbers by value,
 * text A to Z ignoring case with numbers in it compared as numbers, and unknown values (null) last in both
 * directions. A copy in the source order when there is no sort or the column has no sortValue.
 */
export function sortRows<Row>(rows: readonly Row[], columns: readonly SortableColumn<Row>[], sort: SortState | null): Row[] {
  const value = sort ? columns.find((c) => c.id === sort.columnId)?.sortValue : undefined;
  if (!sort || !value) return [...rows];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((a, b) => {
      if (a.key === null || b.key === null) return compare(a.key, b.key) || a.index - b.index;
      return sign * compare(a.key, b.key) || a.index - b.index;
    })
    .map((entry) => entry.row);
}
