import { Bug, MessagesSquare, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ExternalLink } from '@shared/types/game-config';
import { useAppInfo } from '../app/AppInfoProvider';
import { bridge } from '../bridge';
import { cn } from '../lib/cn';
import { Button } from '../ui';
import { FLOATING_SHADOW } from './Popover';

const NOTICE_MS = 6000;

/** "Report a bug" and the community link. Each is hidden while config/app.json has no URL for it. */
export function ExternalLinks() {
  const { links } = useAppInfo().config;
  const [failed, setFailed] = useState(false);

  // A failure note is a nudge, not a dialog: it fades on its own.
  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => setFailed(false), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [failed]);

  const open = (link: ExternalLink): void => {
    setFailed(false);
    bridge.app.openLink(link).catch(() => setFailed(true));
  };

  if (!links.bug_report && !links.community) return null;
  return (
    <div className="app-no-drag relative flex items-center gap-0.5">
      {links.bug_report && (
        <Button variant="ghost" size="sm" icon={<Bug className="size-4" aria-hidden />} onClick={() => open('bug_report')}>
          Report a bug
        </Button>
      )}
      {links.community && (
        <Button variant="ghost" size="sm" icon={<MessagesSquare className="size-4" aria-hidden />} onClick={() => open('community')}>
          Community
        </Button>
      )}
      <div role="alert" className="absolute top-full right-0 z-50 mt-1.5">
        {failed && (
          <p
            className={cn(
              'flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap text-text',
              FLOATING_SHADOW,
            )}
          >
            <TriangleAlert className="size-4 shrink-0 text-negative" aria-hidden />
            The link could not be opened. Try again in a moment.
          </p>
        )}
      </div>
    </div>
  );
}
