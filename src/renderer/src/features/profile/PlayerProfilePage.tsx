import { UserRound, UserX } from 'lucide-react';
import { useParams } from 'react-router';
import { parsePlayerParams } from '../../app/routes';
import { PLATFORM_LABEL } from '../../shell/platforms';
import { PagePlaceholder } from '../../shell/PagePlaceholder';
import { Card, EmptyState } from '../../ui';

/**
 * Route /player/:platform/:id (build links with playerPath()). Placeholder: the player profile screen replaces it.
 * It already parses the route, so a bad link shows an error state rather than a broken page.
 */
export function PlayerProfilePage() {
  const player = parsePlayerParams(useParams());
  if (!player) {
    return (
      <div className="px-6 py-5">
        <Card>
          <EmptyState icon={<UserX className="size-5" aria-hidden />} title="This player link is not valid" description="Search for the player instead." />
        </Card>
      </div>
    );
  }
  return (
    <PagePlaceholder
      title="Player profile"
      description={`${PLATFORM_LABEL[player.platform]} account ${player.id}`}
      phase={2}
      icon={<UserRound className="size-5" aria-hidden />}
      emptyTitle="The player profile is being built"
      emptyDescription="Header, current season, peak ranks, ranked sessions, match history, encounters and linked accounts."
    />
  );
}
