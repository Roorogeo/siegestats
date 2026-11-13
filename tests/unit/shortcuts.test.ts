import { describe, expect, test } from 'vitest';
import { DEFAULT_HOTKEYS } from '@core/settings/defaults';
import type { Hotkey } from '@shared/types/settings';

/**
 * Unit tests are type-checked by tsconfig.node.json, which does not list renderer files, so a static
 * import of src/renderer fails with TS6307. Until that project includes this module, it is loaded by a
 * computed path (which the compiler does not follow) and its signatures are restated here.
 */
interface KeyChord {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}
interface ShortcutsModule {
  matchesHotkey(event: KeyChord, hotkey: Hotkey | null): boolean;
  formatHotkey(hotkey: Hotkey | null): string;
  hotkeyParts(hotkey: Hotkey | null): string[];
  keyName(code: string): string;
  ariaKeyShortcuts(hotkey: Hotkey | null): string | undefined;
}
const MODULE_PATH: string = '../../src/renderer/src/app/shortcuts';
const { matchesHotkey, formatHotkey, hotkeyParts, keyName, ariaKeyShortcuts } = (await import(/* @vite-ignore */ MODULE_PATH)) as ShortcutsModule;

const chord = (code: string, mods: Partial<Omit<KeyChord, 'code'>> = {}): KeyChord => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

const CTRL_K: Hotkey = { code: 'KeyK', ctrl: true, alt: false, shift: false };
const ALT_LEFT: Hotkey = { code: 'ArrowLeft', ctrl: false, alt: true, shift: false };

describe('matchesHotkey', () => {
  test('the exact combination matches', () => {
    expect(matchesHotkey(chord('KeyK', { ctrlKey: true }), CTRL_K)).toBe(true);
    expect(matchesHotkey(chord('ArrowLeft', { altKey: true }), ALT_LEFT)).toBe(true);
  });

  test('a different key does not match', () => {
    expect(matchesHotkey(chord('KeyJ', { ctrlKey: true }), CTRL_K)).toBe(false);
    expect(matchesHotkey(chord('ArrowRight', { altKey: true }), ALT_LEFT)).toBe(false);
  });

  test('a missing modifier does not match', () => {
    expect(matchesHotkey(chord('KeyK'), CTRL_K)).toBe(false);
    expect(matchesHotkey(chord('ArrowLeft'), ALT_LEFT)).toBe(false);
  });

  test('an extra modifier does not match', () => {
    expect(matchesHotkey(chord('KeyK', { ctrlKey: true, shiftKey: true }), CTRL_K)).toBe(false);
    // AltGr arrives as Ctrl+Alt on Windows: it must not trigger Ctrl+K or Alt+Left.
    expect(matchesHotkey(chord('KeyK', { ctrlKey: true, altKey: true }), CTRL_K)).toBe(false);
    expect(matchesHotkey(chord('ArrowLeft', { ctrlKey: true, altKey: true }), ALT_LEFT)).toBe(false);
  });

  test('the Windows key is never part of a binding', () => {
    expect(matchesHotkey(chord('KeyK', { ctrlKey: true, metaKey: true }), CTRL_K)).toBe(false);
    expect(matchesHotkey(chord('ArrowLeft', { altKey: true, metaKey: true }), ALT_LEFT)).toBe(false);
  });

  test('an unbound hotkey matches nothing', () => {
    expect(matchesHotkey(chord('KeyK', { ctrlKey: true }), null)).toBe(false);
    expect(matchesHotkey(chord(''), null)).toBe(false);
  });

  test('a binding with no modifiers only matches the bare key', () => {
    const f5: Hotkey = { code: 'F5', ctrl: false, alt: false, shift: false };
    expect(matchesHotkey(chord('F5'), f5)).toBe(true);
    expect(matchesHotkey(chord('F5', { shiftKey: true }), f5)).toBe(false);
  });

  test('the three default bindings of the brief match their keys and nothing else of each other', () => {
    const pressed = {
      focusSearch: chord('KeyK', { ctrlKey: true }),
      navigateBack: chord('ArrowLeft', { altKey: true }),
      navigateForward: chord('ArrowRight', { altKey: true }),
    };
    for (const [action, event] of Object.entries(pressed)) {
      for (const other of ['focusSearch', 'navigateBack', 'navigateForward'] as const) {
        expect(matchesHotkey(event, DEFAULT_HOTKEYS[other])).toBe(action === other);
      }
    }
  });
});

describe('formatHotkey', () => {
  test('the defaults read as in the brief', () => {
    expect(formatHotkey(DEFAULT_HOTKEYS.focusSearch)).toBe('Ctrl+K');
    expect(formatHotkey(DEFAULT_HOTKEYS.navigateBack)).toBe('Alt+Left');
    expect(formatHotkey(DEFAULT_HOTKEYS.navigateForward)).toBe('Alt+Right');
  });

  test('modifiers come in a fixed order: Ctrl, Alt, Shift, key', () => {
    expect(formatHotkey({ code: 'KeyP', ctrl: true, alt: true, shift: true })).toBe('Ctrl+Alt+Shift+P');
    expect(hotkeyParts({ code: 'Digit1', ctrl: false, alt: true, shift: true })).toEqual(['Alt', 'Shift', '1']);
  });

  test('unbound gives nothing to show', () => {
    expect(formatHotkey(null)).toBe('');
    expect(hotkeyParts(null)).toEqual([]);
  });

  test('key codes become key names', () => {
    expect(keyName('KeyA')).toBe('A');
    expect(keyName('Digit7')).toBe('7');
    expect(keyName('ArrowUp')).toBe('Up');
    expect(keyName('Slash')).toBe('/');
    expect(keyName('Numpad4')).toBe('Num 4');
    expect(keyName('F5')).toBe('F5');
    expect(keyName('Space')).toBe('Space');
  });
});

describe('ariaKeyShortcuts', () => {
  test('bindings read in aria-keyshortcuts syntax', () => {
    expect(ariaKeyShortcuts(DEFAULT_HOTKEYS.focusSearch)).toBe('Control+K');
    expect(ariaKeyShortcuts(DEFAULT_HOTKEYS.navigateBack)).toBe('Alt+ArrowLeft');
    expect(ariaKeyShortcuts({ code: 'Digit3', ctrl: true, alt: false, shift: true })).toBe('Control+Shift+3');
    expect(ariaKeyShortcuts({ code: 'F5', ctrl: false, alt: false, shift: false })).toBe('F5');
  });

  test('unbound leaves the attribute out', () => {
    expect(ariaKeyShortcuts(null)).toBeUndefined();
  });
});
