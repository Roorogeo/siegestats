import { ArrowLeft, House, SearchX, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { PlayerKey } from '@shared/types/player';
import { playerPath, ROUTES } from '../../app/routes';
import { Button, Card } from '../../ui';

/** A link that looks like the primary button (navigation stays a link: middle-click, the address in the status). */
const LINK_BUTTON =
  'inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-control border border-transparent bg-accent px-3 text-[13px] font-medium whitespace-nowrap text-on-accent transition-opacity hover:opacity-90';

interface MatchNotFoundProps {
  /** The profile the link came from: offered as the way back. */
  pov: PlayerKey | null;
  /** The link itself is malformed (no match id in it), as opposed to an id the source does not know. */
  invalid?: boolean;
}

/** A match page with no match: the source does not know the id, or the link names none. Offers a way back. */
export function MatchNotFound({ pov, invalid = false }: MatchNotFoundProps) {
  const navigate = useNavigate();
  // The first page of the session has nothing to go back to.
  const canGoBack = useLocation().key !== 'default';
  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 py-5">
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-muted">
          <SearchX className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-text">{invalid ? 'This match link is not valid' : 'Match not found'}</h1>
        <p className="mx-auto max-w-md text-[13px] text-text-muted">
          {invalid
            ? 'It does not name a match. Open the match again from a match history.'
            : 'The stats source has no match with this id. The link may be old, or the source may no longer keep this match.'}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {pov ? (
            <Link to={playerPath(pov)} className={LINK_BUTTON}>
              <User className="size-3.5" aria-hidden />
              Back to the profile
            </Link>
          ) : (
            <Link to={ROUTES.home} className={LINK_BUTTON}>
              <House className="size-3.5" aria-hidden />
              Go to Home
            </Link>
          )}
          {canGoBack && (
            <Button icon={<ArrowLeft className="size-3.5" aria-hidden />} onClick={() => void navigate(-1)}>
              Go back
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
