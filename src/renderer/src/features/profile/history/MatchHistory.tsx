import type { PlayerKey } from '@shared/types/player';
import { EmptyState } from '../../../ui';

/**
 * CONTRACT STUB (owned by the profile-tabs builder): the profile's match history, with playlist chips, the
 * 7 / 30 / 90 days / season picker, the summary row and one row per match with "View match".
 */
export function MatchHistory(_props: { player: PlayerKey }) {
  return <EmptyState title="Match history" description="Being built." />;
}
