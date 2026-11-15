/** The parts of a keyboard event the movement depends on (a React or DOM KeyboardEvent fits). */
export interface KeyPress {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Arrow-key movement inside a group of buttons (chips, segments): Left / Right (and Up / Down), Home, End.
 * Returns the index to move to, or null when the key is not a movement key. Disabled items are skipped.
 */
export function rovingTarget(event: KeyPress, current: number, count: number, isDisabled: (index: number) => boolean): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  const edge = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
  if (step === undefined && edge === null) return null;
  if (edge !== null) {
    const dir = edge === 0 ? 1 : -1;
    for (let i = edge; i >= 0 && i < count; i += dir) if (!isDisabled(i)) return i;
    return null;
  }
  for (let n = 1; n <= count; n += 1) {
    const i = (((current + n * (step ?? 0)) % count) + count) % count;
    if (!isDisabled(i)) return i;
  }
  return null;
}
