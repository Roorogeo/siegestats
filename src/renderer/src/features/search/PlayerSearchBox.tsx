import type { PlayerRef } from '@shared/types/player';
import { EmptyState } from '../../ui';

export interface PlayerSearchBoxProps {
  /** Accessible name of the field, e.g. "Find your account". */
  label: string;
  /** Called with the player the user picked (click or Enter). */
  onSelect(player: PlayerRef): void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * CONTRACT STUB (owned by the search builder): an inline player search, username + platform, with results below.
 * Used by My Profile's onboarding ("search for my account and pin it"). The real component replaces this body.
 */
export function PlayerSearchBox({ label }: PlayerSearchBoxProps) {
  return <EmptyState title={label} description="Player search is being built." />;
}
