import { describe, expect, test } from 'vitest';
import { gridTarget, type GridCell } from '@renderer/ui/grid';
import { sortRows, type SortableColumn } from '@renderer/ui/sort-rows';

const NONE = { ctrl: false, alt: false, meta: false };
const CTRL = { ...NONE, ctrl: true };
const at = (row: number, col: number): GridCell => ({ row, col });
/** A 3 x 4 grid. */
const move = (key: string, from: GridCell, mods = NONE) => gridTarget(key, mods, from, 3, 4);

describe('gridTarget', () => {
  test('arrows move one cell and stop at the edges', () => {
    expect(move('ArrowRight', at(1, 1))).toEqual(at(1, 2));
    expect(move('ArrowLeft', at(1, 1))).toEqual(at(1, 0));
    expect(move('ArrowDown', at(1, 1))).toEqual(at(2, 1));
    expect(move('ArrowUp', at(1, 1))).toEqual(at(0, 1));
    expect(move('ArrowRight', at(1, 3))).toEqual(at(1, 3));
    expect(move('ArrowLeft', at(1, 0))).toEqual(at(1, 0));
    expect(move('ArrowDown', at(2, 1))).toEqual(at(2, 1));
    expect(move('ArrowUp', at(0, 1))).toEqual(at(0, 1));
  });

  test('Home and End go to the ends of the row', () => {
    expect(move('Home', at(2, 2))).toEqual(at(2, 0));
    expect(move('End', at(2, 2))).toEqual(at(2, 3));
    expect(move('Home', at(0, 0))).toEqual(at(0, 0));
    expect(move('End', at(1, 3))).toEqual(at(1, 3));
  });

  test('Ctrl+Home and Ctrl+End go to the corners of the grid, from anywhere including the corners', () => {
    for (const from of [at(1, 2), at(0, 0), at(2, 3), at(2, 0), at(0, 3)]) {
      expect(move('Home', from, CTRL)).toEqual(at(0, 0));
      expect(move('End', from, CTRL)).toEqual(at(2, 3));
    }
  });

  test('keys the grid does not own: Ctrl+arrows, anything with Alt or Meta (back / forward), other keys', () => {
    expect(move('ArrowRight', at(1, 1), CTRL)).toBeNull();
    expect(move('ArrowLeft', at(1, 1), { ...NONE, alt: true })).toBeNull();
    expect(move('Home', at(1, 1), { ...NONE, meta: true })).toBeNull();
    expect(move('Enter', at(1, 1))).toBeNull();
    expect(move('PageDown', at(1, 1))).toBeNull();
  });
});

interface Row {
  name: string;
  value: number | null;
}
const rows: Row[] = [
  { name: 'b10', value: 2 },
  { name: 'B2', value: null },
  { name: 'a', value: 5 },
  { name: 'c', value: 2 },
  { name: 'd', value: null },
];
const columns: SortableColumn<Row>[] = [
  { id: 'name', sortValue: (r) => r.name },
  { id: 'value', sortValue: (r) => r.value },
  { id: 'plain' },
];
const names = (list: Row[]) => list.map((r) => r.name);

describe('sortRows', () => {
  test('numbers by value, ties in the source order, unknown values last in both directions', () => {
    expect(names(sortRows(rows, columns, { columnId: 'value', direction: 'desc' }))).toEqual(['a', 'b10', 'c', 'B2', 'd']);
    expect(names(sortRows(rows, columns, { columnId: 'value', direction: 'asc' }))).toEqual(['b10', 'c', 'a', 'B2', 'd']);
  });

  test('text ignores case and compares the numbers in it as numbers', () => {
    expect(names(sortRows(rows, columns, { columnId: 'name', direction: 'asc' }))).toEqual(['a', 'B2', 'b10', 'c', 'd']);
    expect(names(sortRows(rows, columns, { columnId: 'name', direction: 'desc' }))).toEqual(['d', 'c', 'b10', 'B2', 'a']);
  });

  test('no sort, an unknown column or one without sortValue: a copy in the source order', () => {
    for (const sort of [null, { columnId: 'nope', direction: 'asc' as const }, { columnId: 'plain', direction: 'desc' as const }]) {
      const out = sortRows(rows, columns, sort);
      expect(out).not.toBe(rows);
      expect(names(out)).toEqual(names(rows));
    }
  });
});
