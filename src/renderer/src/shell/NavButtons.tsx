import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useHistoryState } from '../app/navigation';
import { ariaKeyShortcuts, formatHotkey } from '../app/shortcuts';
import { useSettings } from '../app/SettingsProvider';
import { cn } from '../lib/cn';
import { IconButton } from '../ui';

/** Tooltip with the shortcut, e.g. "Back (Alt+Left)"; the accessible name stays the plain label. */
const withHint = (label: string, hint: string): string => (hint ? `${label} (${hint})` : label);

/** Back / forward through the app's history, and refresh = re-fetch what the current screen shows. */
export function NavButtons() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canGoBack, canGoForward } = useHistoryState();
  const { hotkeys } = useSettings().settings;
  const [spinning, setSpinning] = useState(false);
  const spinTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(spinTimer.current), []);

  const refresh = (): void => {
    setSpinning(true);
    window.clearTimeout(spinTimer.current);
    // At least one turn of the icon, so the click visibly did something even when nothing is loaded.
    const minimum = new Promise<void>((done) => {
      spinTimer.current = window.setTimeout(done, 600);
    });
    void Promise.allSettled([queryClient.invalidateQueries(), minimum]).then(() => setSpinning(false));
  };

  return (
    <div className="app-no-drag flex items-center gap-0.5">
      <IconButton
        size="sm"
        label="Back"
        title={withHint('Back', formatHotkey(hotkeys.navigateBack))}
        aria-keyshortcuts={ariaKeyShortcuts(hotkeys.navigateBack)}
        disabled={!canGoBack}
        onClick={() => void navigate(-1)}
      >
        <ArrowLeft className="size-4" aria-hidden />
      </IconButton>
      <IconButton
        size="sm"
        label="Forward"
        title={withHint('Forward', formatHotkey(hotkeys.navigateForward))}
        aria-keyshortcuts={ariaKeyShortcuts(hotkeys.navigateForward)}
        disabled={!canGoForward}
        onClick={() => void navigate(1)}
      >
        <ArrowRight className="size-4" aria-hidden />
      </IconButton>
      <IconButton size="sm" label="Refresh" aria-busy={spinning} onClick={refresh}>
        <RotateCw className={cn('size-4', spinning && 'animate-spin')} aria-hidden />
      </IconButton>
    </div>
  );
}
