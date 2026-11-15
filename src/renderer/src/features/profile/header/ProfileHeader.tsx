import type { PlayerProfile } from '@shared/types/player';
import type { Fetched } from '@shared/types/provider';
import { Avatar, PlatformLabel } from '../../../components';
import { formatNumber, timeAgo, updatedAgo } from '../../../lib/format';
import { useNow } from '../../../lib/useNow';
import type { StatsResult } from '../../../queries';
import { Badge, LoadingHeading, QueryState, Skeleton } from '../../../ui';
import type { ProfileTabId } from '../profile-tabs';
import { HeaderActions } from './HeaderActions';
import { PlatformSwitch } from './PlatformSwitch';

interface ProfileHeaderProps {
  profile: StatsResult<'getProfile'>;
  /** My Profile: the account is the user's own (pinned and active). */
  mine: boolean;
  tab: ProfileTabId;
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="size-16 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-80" />
      </div>
      <Skeleton className="h-8 w-64" />
    </div>
  );
}

/**
 * The page's h1 can take focus from code only (tabIndex -1): the shell moves focus to it after a screen change, and
 * My Profile after pinning. No outline then: it is a heading, not a control, and the focus is never from Tab.
 */
const HEADING_FOCUS = 'outline-none';

const Dot = () => (
  <span aria-hidden className="text-text-muted">
    ·
  </span>
);

function HeaderBody({ fetched, mine }: { fetched: Fetched<PlayerProfile>; mine: boolean }) {
  const now = useNow();
  const { player, level, lastPlayedAt } = fetched.data;
  const stale = fetched.from === 'stale_cache';

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      <Avatar player={player} size="xl" />
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 tabIndex={-1} className={`selectable min-w-0 truncate text-lg leading-7 font-semibold text-text ${HEADING_FOCUS}`}>
            {player.name}
          </h1>
          {mine && <Badge>Your account</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <PlatformLabel platform={player.platform} />
          <Dot />
          <span>
            Level <span className="font-medium text-text tabular">{formatNumber(level)}</span>
          </span>
          <Dot />
          <span>Last played {timeAgo(lastPlayedAt, now)}</span>
          <Dot />
          <span data-testid="profile-updated" data-from={fetched.from} title={fetched.from === 'source' ? 'Fetched from the stats source' : 'From the saved copy'}>
            {stale ? `Offline: saved copy from ${timeAgo(fetched.fetchedAt, now)}` : updatedAgo(fetched.fetchedAt, now)}
          </span>
        </div>
      </div>
      <HeaderActions player={player} />
    </div>
  );
}

/**
 * Avatar, name (the page's h1), platform, level, last played and "Updated X ago", with the star, "Pin as mine" and
 * Update; the platform switch sits along its bottom edge. Specialty themes draw the accent -> accent-2 gradient as a
 * band across the top, with everything readable on a surface-coloured panel laid over it (design.md 3a): no text
 * ever sits on the gradient.
 */
export function ProfileHeader({ profile, mine, tab }: ProfileHeaderProps) {
  const data = profile.data?.data;
  return (
    // No overflow-hidden: the platform switch's panel must be free to reach past the header's edge.
    <header className="rounded-card border border-border bg-surface">
      <div aria-hidden className="hidden h-14 rounded-t-[calc(var(--radius-card)-1px)] bg-linear-to-r from-accent to-accent-2 specialty:block" />
      <div className="px-5 py-4 specialty:mx-3 specialty:-mt-7 specialty:rounded-t-card specialty:bg-surface specialty:px-2 specialty:pt-3">
        {/* While the player loads; if it has focus when the name heading replaces it, the focus moves on to that. */}
        {!data && <LoadingHeading>Player profile</LoadingHeading>}
        <QueryState query={profile} skeleton={<HeaderSkeleton />} loadingLabel="Loading player" compact errorTitle="This player could not be loaded">
          {(fetched) => <HeaderBody fetched={fetched} mine={mine} />}
        </QueryState>
      </div>
      {(data !== undefined || profile.isPending) && (
        <div className="border-t border-border px-5 py-2">
          {data ? <PlatformSwitch profile={data} tab={tab} /> : <Skeleton className="h-8 w-80" />}
        </div>
      )}
    </header>
  );
}
