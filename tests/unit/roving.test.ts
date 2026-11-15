import { describe, expect, test } from 'vitest';
import { rovingTarget, type KeyPress } from '@renderer/ui/roving';

const key = (name: string, mods: Partial<KeyPress> = {}): KeyPress => ({ key: name, altKey: false, ctrlKey: false, metaKey: false, ...mods });
const none = (): boolean => false;

describe('arrow-key movement in chip and segment groups', () => {
  test('arrows move by one and wrap; Home and End jump to the ends', () => {
    expect(rovingTarget(key('ArrowRight'), 1, 4, none)).toBe(2);
    expect(rovingTarget(key('ArrowDown'), 3, 4, none)).toBe(0);
    expect(rovingTarget(key('ArrowLeft'), 0, 4, none)).toBe(3);
    expect(rovingTarget(key('ArrowUp'), 2, 4, none)).toBe(1);
    expect(rovingTarget(key('Home'), 2, 4, none)).toBe(0);
    expect(rovingTarget(key('End'), 0, 4, none)).toBe(3);
  });

  test('disabled items are skipped, an all-disabled group goes nowhere', () => {
    const disabled = (i: number): boolean => i === 2 || i === 3;
    expect(rovingTarget(key('ArrowRight'), 1, 4, disabled)).toBe(0);
    expect(rovingTarget(key('End'), 0, 4, disabled)).toBe(1);
    expect(rovingTarget(key('Home'), 1, 4, (i) => i === 0)).toBe(1);
    expect(rovingTarget(key('ArrowRight'), 0, 3, () => true)).toBeNull();
  });

  test('other keys, and arrows with Alt / Ctrl (back, forward, page), are left alone', () => {
    expect(rovingTarget(key('Enter'), 0, 4, none)).toBeNull();
    expect(rovingTarget(key(' '), 0, 4, none)).toBeNull();
    expect(rovingTarget(key('ArrowLeft', { altKey: true }), 1, 4, none)).toBeNull();
    expect(rovingTarget(key('ArrowRight', { ctrlKey: true }), 1, 4, none)).toBeNull();
  });
});
