import type { Column, SortState } from '../../../ui';

function compare(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The rows in the order DataTable would show them for `sort` (stable, unknown values last in both directions), for
 * tables that sort before they cut the list short ("Show N more"): the table then gets them with manualSort.
 */
export function sortRows<Row>(rows: readonly Row[], columns: readonly Column<Row>[], sort: SortState | null): Row[] {
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
