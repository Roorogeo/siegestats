import { Bug, CircleAlert, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import type { AppInfo } from '@shared/types/bridge';
import type { ExternalLink } from '@shared/types/game-config';
import { useAppInfo } from '../../app/AppInfoProvider';
import { bridge } from '../../bridge';
import { Button, Card, Logo } from '../../ui';

/** The brief's exact wording; the e2e test looks for this sentence. */
export const DISCLAIMER = 'Fan-made. Not affiliated with or endorsed by Ubisoft.';

const RUNTIME_LABEL: Record<AppInfo['runtime'], string> = {
  electron: 'Electron',
  'ow-electron': 'Overwolf Electron',
  browser: 'Browser (in-page bridge)',
};

const LINK_LABEL: Record<ExternalLink, string> = { bug_report: 'the bug report page', community: 'the community page' };

/** Bridge calls reject with an AppError (a plain { code, message } object); shown as one sentence. */
function reason(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message.trim() : '';
  if (!message) return 'Something went wrong.';
  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function AboutSection() {
  const info = useAppInfo();
  const [failure, setFailure] = useState<string | null>(null);

  const open = (link: ExternalLink): void => {
    setFailure(null);
    bridge.app.openLink(link).catch((error: unknown) => setFailure(`Could not open ${LINK_LABEL[link]}. ${reason(error)}`));
  };

  const rows: [string, string][] = [
    ['Version', info.version],
    ['Runtime', RUNTIME_LABEL[info.runtime]],
    ['Build', info.isDev ? 'Development' : 'Release'],
    ['Data source', info.config.provider === 'mock' ? 'Demo data (generated on this computer)' : 'Live'],
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-card border border-border bg-surface-2">
          <Logo className="size-7" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-text">{info.name}</div>
          <div className="text-[12px] text-text-muted">A companion app for Rainbow Six Siege players.</div>
        </div>
      </Card>

      <Card flush>
        <dl className="selectable divide-y divide-border">
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
              <dt className="text-text-muted">{term}</dt>
              <dd className="tabular text-right text-text">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="space-y-2">
        <p className="text-[13px] font-medium text-text">{DISCLAIMER}</p>
        <p className="flex items-start gap-2 text-[12px] text-text-muted">
          <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
          <span>{info.name} sends no telemetry unless you opt in.</span>
        </p>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Bug className="size-4" aria-hidden />} onClick={() => open('bug_report')}>
            Report a bug
          </Button>
          {info.config.links.community && (
            <Button icon={<Users className="size-4" aria-hidden />} onClick={() => open('community')}>
              Community
            </Button>
          )}
        </div>
        {failure && (
          <p role="alert" className="flex items-start gap-2 text-[12px] text-negative">
            <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
            <span>{failure}</span>
          </p>
        )}
      </div>
    </div>
  );
}
