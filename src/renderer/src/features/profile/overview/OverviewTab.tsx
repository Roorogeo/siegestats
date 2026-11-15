import type { PlayerKey } from '@shared/types/player';
import { useProfile } from '../../../queries';
import { MatchHistory } from '../history/MatchHistory';
import { CurrentSeasonCard } from './CurrentSeasonCard';
import { PeakRanksCard } from './PeakRanksCard';
import { RankedSessionsCard } from './RankedSessionsCard';

/** The profile's first tab: current season and peak ranks side by side, the ranked sessions chart, match history. */
export function OverviewTab({ player }: { player: PlayerKey }) {
  const profile = useProfile(player);
  const profileFailed = profile.data === undefined && profile.status === 'error' && !profile.isFetching;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
        <CurrentSeasonCard profile={profile} />
        <PeakRanksCard player={player} />
      </div>
      <RankedSessionsCard player={player} profileFailed={profileFailed} />
      <MatchHistory player={player} />
    </div>
  );
}
