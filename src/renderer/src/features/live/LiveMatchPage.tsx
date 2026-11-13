import { RadioTower } from 'lucide-react';
import { PagePlaceholder } from '../../shell/PagePlaceholder';

/** Placeholder until phase 5 builds Live Match. */
export function LiveMatchPage() {
  return (
    <PagePlaceholder
      title="Live Match"
      description="Everyone in your current match, grouped by team, with live K/D/A and score next to their looked-up profile stats."
      phase={5}
      icon={<RadioTower className="size-5" aria-hidden />}
      emptyTitle="Live Match arrives in phase 5"
      emptyDescription="During a match this screen shows both teams, the map, mode and round score, a round timeline that fills in as you play, and a summary when the match ends."
    />
  );
}
