import { Crown } from 'lucide-react';
import { PagePlaceholder } from '../../shell/PagePlaceholder';

/** Placeholder until phase 4 builds the Legend Division board. */
export function LegendDivisionPage() {
  return (
    <PagePlaceholder
      title="Legend Division"
      description="The Legend Division leaderboard, filterable by region, with each player's position and region."
      phase={4}
      icon={<Crown className="size-5" aria-hidden />}
      emptyTitle="Legend Division arrives in phase 4"
      emptyDescription="The same board as Leaderboards for the Legend Division playlist, with a region filter and Position and Region columns."
    />
  );
}
