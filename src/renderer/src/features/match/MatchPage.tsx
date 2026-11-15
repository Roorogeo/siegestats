import { FileQuestion, Swords } from 'lucide-react';
import { useLocation, useParams } from 'react-router';
import { parseMatchParams, parsePov } from '../../app/routes';
import { PagePlaceholder } from '../../shell/PagePlaceholder';
import { Card, EmptyState } from '../../ui';

/**
 * Route /match/:id?pov=platform:id (build links with matchPath()). Placeholder: the match details screen replaces it.
 */
export function MatchPage() {
  const id = parseMatchParams(useParams());
  const pov = parsePov(useLocation().search);
  if (!id) {
    return (
      <div className="px-6 py-5">
        <Card>
          <EmptyState icon={<FileQuestion className="size-5" aria-hidden />} title="This match link is not valid" />
        </Card>
      </div>
    );
  }
  return (
    <PagePlaceholder
      title="Match details"
      description={`Match ${id}${pov ? `, seen by ${pov.platform}:${pov.id}` : ''}`}
      phase={2}
      icon={<Swords className="size-5" aria-hidden />}
      emptyTitle="Match details are being built"
      emptyDescription="Both scoreboards, the round-by-round timeline and operator picks per round."
    />
  );
}
