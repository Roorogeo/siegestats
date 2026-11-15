import { Gamepad2, Monitor, Search } from 'lucide-react';
import { Link } from 'react-router';
import type { Platform } from '@shared/types/primitives';
import type { PlayerProfile, PlayerRef } from '@shared/types/player';
import { playerPath } from '../../../app/routes';
import { cn } from '../../../lib/cn';
import { PLATFORM_LABEL } from '../../../components';
import { PLATFORMS } from '../../../shell/platforms';
import { Popover } from '../../../shell/Popover';
import { Button } from '../../../ui';
import { openGlobalSearch } from '../../search/open-search';
import { profileTabSearch, type ProfileTabId } from '../profile-tabs';

interface PlatformSwitchProps {
  profile: PlayerProfile;
  /** Kept when moving to a linked account, so its profile opens on the same section. */
  tab: ProfileTabId;
}

const ICON: Readonly<Record<Platform, typeof Monitor>> = { pc: Monitor, psn: Gamepad2, xbl: Gamepad2 };

const SEGMENT = 'inline-flex items-center gap-1.5 rounded-[4px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors';

/** What the caption beside the switch says about the source's links. */
function linkSummary(linked: readonly PlayerRef[] | null): string {
  if (linked === null) return 'This source does not show linked accounts';
  if (linked.length === 0) return 'No linked accounts on other platforms';
  return linked.length === 1 ? '1 linked account' : `${linked.length} linked accounts`;
}

/**
 * PC / PlayStation / Xbox (design question 14). The account's own platform is selected. A platform the data source
 * links to this player opens that account's profile. Any other platform is shown in muted text and stays focusable: it opens
 * a short explanation and offers an ordinary search for the same name there, since an equal name proves nothing.
 */
export function PlatformSwitch({ profile, tab }: PlatformSwitchProps) {
  const { player, linkedAccounts } = profile;
  const others = (linkedAccounts ?? []).filter((account) => account.platform !== player.platform);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div
        role="group"
        aria-label="Platform"
        className="inline-flex h-8 shrink-0 items-stretch gap-0.5 rounded-control border border-control-border bg-surface-2 p-0.5"
      >
        {PLATFORMS.map((platform) => {
          const Icon = ICON[platform];
          const label = PLATFORM_LABEL[platform];
          const content = (
            <>
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {label}
            </>
          );
          if (platform === player.platform) {
            return (
              // The inset accent-text edge keeps the selection visible where the accent fill alone is under 3:1.
              <span key={platform} aria-current="page" className={cn(SEGMENT, 'bg-accent text-on-accent shadow-[inset_0_0_0_1px_var(--accent-text)]')}>
                {content}
              </span>
            );
          }
          const linked = others.find((account) => account.platform === platform);
          if (linked) {
            return (
              <Link
                key={platform}
                to={`${playerPath(linked)}${profileTabSearch(tab)}`}
                aria-label={`${label}: ${linked.name}, linked account`}
                title={`Open ${linked.name} on ${label}`}
                className={cn(SEGMENT, 'text-text hover:bg-surface')}
              >
                {content}
              </Link>
            );
          }
          return <UnlinkedPlatform key={platform} platform={platform} name={player.name} sourceShowsLinks={linkedAccounts !== null} />;
        })}
      </div>
      <span className="text-xs text-text-muted">{linkSummary(linkedAccounts)}</span>
    </div>
  );
}

/**
 * A platform with no linked account: muted text (not dimmed further: it is an active control and keeps 4.5:1),
 * focusable, and explains itself in a small panel.
 */
function UnlinkedPlatform({ platform, name, sourceShowsLinks }: { platform: Platform; name: string; sourceShowsLinks: boolean }) {
  const label = PLATFORM_LABEL[platform];
  const Icon = ICON[platform];
  return (
    <Popover
      label={`${label}: no linked account`}
      align="start"
      className="w-72 p-3"
      trigger={(props, open) => (
        <button
          type="button"
          {...props}
          aria-label={`${label}, no linked account`}
          className={cn(SEGMENT, 'h-full text-text-muted hover:bg-surface', open && 'bg-surface')}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {label}
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-semibold text-text">No linked {label} account</p>
          <p className="text-xs text-text-muted">
            {sourceShowsLinks
              ? `The stats source links no ${label} account to ${name}. An account with the same name on ${label} may belong to someone else.`
              : `This source does not show linked accounts, so it cannot tell whether ${name} also plays on ${label}.`}
          </p>
          <Button
            size="sm"
            className="self-start"
            icon={<Search className="size-3.5" aria-hidden />}
            onClick={() => {
              // Close first: closing returns focus to this trigger, the search then takes it.
              close();
              openGlobalSearch({ name, platform });
            }}
          >
            Search “{name}” on {label}
          </Button>
        </div>
      )}
    </Popover>
  );
}
