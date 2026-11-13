import { Trophy } from 'lucide-react';
import { PagePlaceholder } from '../../shell/PagePlaceholder';

/** Placeholder until phase 4 builds the leaderboards. */
export function LeaderboardsPage() {
  return (
    <PagePlaceholder
      title="Leaderboards"
      description="Global, PC and console boards ranked by RP, K/D, win rate or level, with the rank distribution above the table."
      phase={4}
      icon={<Trophy className="size-5" aria-hidden />}
      emptyTitle="Leaderboards arrive in phase 4"
      emptyDescription="Filter by game mode and leaderboard type, see how many players hold each rank division, and page through the board."
    />
  );
}
