/** A cell of a rows x cols grid, by zero-based row and column. */
export interface GridCell {
  row: number;
  col: number;
}

/**
 * Where a key moves the focus in a rows x cols grid (the ARIA grid pattern): arrows by one cell, Home / End to the
 * row's ends, Ctrl+Home / Ctrl+End to the grid's corners. Alt+arrows stay the app's back / forward.
 */
export function gridTarget(key: string, mods: { ctrl: boolean; alt: boolean; meta: boolean }, at: GridCell, rows: number, cols: number): GridCell | null {
  if (mods.alt || mods.meta) return null;
  const clamp = (value: number, size: number): number => Math.min(size - 1, Math.max(0, value));
  switch (key) {
    case 'ArrowRight':
      return mods.ctrl ? null : { row: at.row, col: clamp(at.col + 1, cols) };
    case 'ArrowLeft':
      return mods.ctrl ? null : { row: at.row, col: clamp(at.col - 1, cols) };
    case 'ArrowDown':
      return mods.ctrl ? null : { row: clamp(at.row + 1, rows), col: at.col };
    case 'ArrowUp':
      return mods.ctrl ? null : { row: clamp(at.row - 1, rows), col: at.col };
    case 'Home':
      return mods.ctrl ? { row: 0, col: 0 } : { row: at.row, col: 0 };
    case 'End':
      return mods.ctrl ? { row: rows - 1, col: cols - 1 } : { row: at.row, col: cols - 1 };
    default:
      return null;
  }
}
