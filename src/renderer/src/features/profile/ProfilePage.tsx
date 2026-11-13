import { UserRound } from 'lucide-react';
import { PagePlaceholder } from '../../shell/PagePlaceholder';

/** Placeholder until phase 2 builds player profiles. */
export function ProfilePage() {
  return (
    <PagePlaceholder
      title="My Profile"
      description="Your pinned account in depth: current season, peak ranks, ranked sessions, match history, encounters and linked accounts."
      phase={2}
      icon={<UserRound className="size-5" aria-hidden />}
      emptyTitle="Profiles arrive in phase 2"
      emptyDescription="Search for your account and pin it as yours. Its rank, seasons, operators, maps and matches will show here."
    />
  );
}
