import { LayoutDashboard } from 'lucide-react';
import { PagePlaceholder } from '../../shell/PagePlaceholder';

/** Placeholder until phase 3 builds the dashboard. */
export function HomePage() {
  return (
    <PagePlaceholder
      title="Home"
      description="Your recent activity: matches, win rate, K/D and damage per round, with trends, operators and maps."
      phase={3}
      icon={<LayoutDashboard className="size-5" aria-hidden />}
      emptyTitle="Your dashboard arrives in phase 3"
      emptyDescription="Once your account is pinned, Home shows your season at a glance: four stat cards against last season, matches and K/D over time, and your most-played operators and top maps."
    />
  );
}
