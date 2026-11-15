import { Check, Pin, PinOff, RefreshCw, Star } from 'lucide-react';
import type { PlayerRef } from '@shared/types/player';
import { cn } from '../../../lib/cn';
import { useFavoriteToggle, useUpdatePlayer } from '../../../queries';
import { Button, IconButton } from '../../../ui';
import { usePinnedAccounts } from '../pinning';

/**
 * The header's three actions: the favourite star, "Pin as mine" (or "Pinned" + Unpin) and Update. Each keeps its
 * own button element across state changes, so keyboard focus stays where it was after a toggle.
 */
export function HeaderActions({ player }: { player: PlayerRef }) {
  const star = useFavoriteToggle(player);
  const { isPinned, pin, unpin } = usePinnedAccounts();
  const pinned = isPinned(player);
  const { update, isUpdating } = useUpdatePlayer(player);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <IconButton
        label={star.isFavorite ? `Remove ${player.name} from favourites` : `Add ${player.name} to favourites`}
        onClick={star.toggle}
        active={star.isFavorite}
      >
        <Star className={cn('size-4', star.isFavorite && 'fill-current text-accent-text')} aria-hidden />
      </IconButton>
      {/* Always in the page (visually hidden while empty), so pinning is announced as it happens. */}
      <span role="status" className={cn('inline-flex items-center gap-1 pl-1 text-xs font-medium text-text-muted', !pinned && 'sr-only')}>
        {pinned && (
          <>
            <Check className="size-3.5 text-accent-text" aria-hidden />
            Pinned as mine
          </>
        )}
      </span>
      <Button
        variant={pinned ? 'ghost' : 'secondary'}
        onClick={() => (pinned ? unpin(player) : pin(player))}
        icon={pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
        title={pinned ? 'Remove this account from My accounts' : 'Add this account to My accounts, for Home and My Profile'}
      >
        {pinned ? 'Unpin' : 'Pin as mine'}
      </Button>
      <Button
        aria-disabled={isUpdating || undefined}
        onClick={() => {
          if (!isUpdating) void update();
        }}
        icon={<RefreshCw className={cn('size-3.5', isUpdating && 'animate-spin')} aria-hidden />}
        title="Fetch this player's stats again from the source, ignoring the saved copy"
        className="aria-disabled:cursor-default aria-disabled:opacity-60"
      >
        {isUpdating ? 'Updating' : 'Update'}
      </Button>
    </div>
  );
}
