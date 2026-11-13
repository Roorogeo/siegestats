import { useEffect, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { canStep, type HistoryStep } from '../app/navigation';
import { useSettings } from '../app/SettingsProvider';
import { matchesHotkey } from '../app/shortcuts';

/** Mouse side buttons, as KeyboardEvent-free MouseEvent.button values. */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;

/**
 * The app-wide shortcuts, from one window listener: focus search (Ctrl+K) works from anywhere, inputs
 * included; back / forward (Alt+Left / Alt+Right, and the mouse side buttons) move through the history.
 * A component that wants a key for itself (a hotkey recorder) calls preventDefault and is left alone.
 */
export function useGlobalShortcuts(searchRef: RefObject<HTMLInputElement | null>): void {
  const { hotkeys } = useSettings().settings;
  const navigate = useNavigate();

  useEffect(() => {
    const step = (direction: HistoryStep): void => {
      if (canStep(direction)) void navigate(direction);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      if (matchesHotkey(event, hotkeys.focusSearch)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (matchesHotkey(event, hotkeys.navigateBack)) {
        event.preventDefault();
        step(-1);
      } else if (matchesHotkey(event, hotkeys.navigateForward)) {
        event.preventDefault();
        step(1);
      }
    };

    const onMouseUp = (event: MouseEvent): void => {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return;
      event.preventDefault();
      step(event.button === MOUSE_BACK ? -1 : 1);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [hotkeys.focusSearch, hotkeys.navigateBack, hotkeys.navigateForward, navigate, searchRef]);
}
