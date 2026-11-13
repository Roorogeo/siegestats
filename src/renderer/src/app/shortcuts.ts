import type { Hotkey } from '@shared/types/settings';

/**
 * The part of a KeyboardEvent a binding is compared with. Structural, so the matching is plain
 * data in, boolean out, and runs in a unit test without a DOM.
 */
export interface KeyChord {
  /** KeyboardEvent.code: the physical key, independent of the keyboard layout. */
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * True when the pressed keys are exactly the binding: same key, same Ctrl / Alt / Shift, no Windows key.
 * Exact matching keeps Ctrl+K apart from Ctrl+Shift+K and from AltGr+K (which Windows reports as Ctrl+Alt).
 */
export function matchesHotkey(event: KeyChord, hotkey: Hotkey | null): boolean {
  if (!hotkey) return false;
  return (
    !event.metaKey &&
    event.code === hotkey.code &&
    event.ctrlKey === hotkey.ctrl &&
    event.altKey === hotkey.alt &&
    event.shiftKey === hotkey.shift
  );
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** "KeyK" -> "K", "Digit1" -> "1", "ArrowLeft" -> "Left", "Numpad4" -> "Num 4". Unknown codes are shown as they are. */
export function keyName(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1]) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit?.[1]) return digit[1];
  const numpad = /^Numpad(.+)$/.exec(code);
  if (numpad?.[1]) return `Num ${numpad[1]}`;
  return KEY_NAMES[code] ?? code;
}

/** The keys of a binding in the order they are read out: ["Ctrl", "K"]. Empty when unbound. */
export function hotkeyParts(hotkey: Hotkey | null): string[] {
  if (!hotkey) return [];
  return [...(hotkey.ctrl ? ['Ctrl'] : []), ...(hotkey.alt ? ['Alt'] : []), ...(hotkey.shift ? ['Shift'] : []), keyName(hotkey.code)];
}

/** "Ctrl+K", "Alt+Left". An unbound hotkey gives an empty string. */
export const formatHotkey = (hotkey: Hotkey | null): string => hotkeyParts(hotkey).join('+');
