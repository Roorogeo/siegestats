import { ArrowRight, Link2, Link2Off } from 'lucide-react';
import { Link } from 'react-router';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import { playerKeyString } from '@shared/util/player';
import { playerPath } from '../../../app/routes';
import { Avatar, PlatformLabel } from '../../../components';
import { useCapabilities, useProfile } from '../../../queries';
import { EmptyState, SectionCard, Skeleton } from '../../../ui';

const SOURCE_NOTE = 'Links come from the data source, never from matching names.';

/** The link's name is its visible content (handle, platform, "Open profile"), so the platform is announced too. */
function AccountCard({ account }: { account: PlayerRef }) {
  return (
    <li>
      <Link
        to={playerPath(account)}
        className="group flex items-center gap-3 rounded-card border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-text-muted"
      >
        <Avatar player={account} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-text">{account.name}</span>
          <PlatformLabel platform={account.platform} />
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted group-hover:text-text">
          Open profile
          <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

function CardsSkeleton() {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 rounded-card" />
        ))}
      </div>
    </div>
  );
}

/**
 * The Linked accounts tab: the same person's accounts on other platforms, only as the data source asserts them
 * (PlayerProfile.linkedAccounts). null = the source does not expose links, which is said plainly; the app never
 * guesses a link from a matching name.
 */
export function LinkedAccountsTab({ player }: { player: PlayerKey }) {
  const profile = useProfile(player);
  const capabilities = useCapabilities();
  const exposed = capabilities.data?.linkedAccounts !== false;
  return (
    <SectionCard
      title="Linked accounts"
      subtitle={SOURCE_NOTE}
      query={profile}
      loadingLabel="Loading linked accounts"
      skeleton={<CardsSkeleton />}
    >
      {(data) => {
        const linked = exposed ? data.data.linkedAccounts : null;
        if (linked === null) {
          return (
            <EmptyState
              icon={<Link2Off className="size-5" aria-hidden />}
              title="This data source does not expose linked accounts"
              description={`So none are shown. ${SOURCE_NOTE}`}
              className="py-6"
            />
          );
        }
        if (linked.length === 0) {
          return (
            <EmptyState
              icon={<Link2 className="size-5" aria-hidden />}
              title="No linked accounts"
              description={`The data source lists no other accounts for ${data.data.player.name}.`}
              className="py-6"
            />
          );
        }
        return (
          <div className="@container">
            <ul aria-label="Linked accounts" className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
              {linked.map((account) => (
                <AccountCard key={playerKeyString(account)} account={account} />
              ))}
            </ul>
          </div>
        );
      }}
    </SectionCard>
  );
}
