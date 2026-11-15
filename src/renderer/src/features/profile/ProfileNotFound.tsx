import { PinOff, Search, UserX } from 'lucide-react';
import type { PlayerKey } from '@shared/types/player';
import { useSettings } from '../../app/SettingsProvider';
import { PLATFORM_LABEL } from '../../shell/platforms';
import { Button, Card } from '../../ui';
import { openGlobalSearch } from '../search/open-search';
import { usePinnedAccounts } from './pinning';

interface ProfileNotFoundProps {
  /** null = the link itself is malformed (no platform and id in it). */
  player: PlayerKey | null;
}

/**
 * A player page with no player: a link that names no account, or an account the stats source does not know (any
 * more). Offers the title-bar search; a pinned account that is gone can also be unpinned from here.
 */
export function ProfileNotFound({ player }: ProfileNotFoundProps) {
  const { settings } = useSettings();
  const { isPinned, unpin } = usePinnedAccounts();
  const pinned = player !== null && isPinned(player);
  const platform = player?.platform ?? settings.defaultPlatform;
  const title = player ? 'Player not found' : 'This player link is not valid';
  const description = player
    ? `The stats source has no ${PLATFORM_LABEL[player.platform]} account with this id. The link may be old, or the account may have been removed.`
    : 'It does not name a platform and an account. Search for the player instead.';
  return (
    <div className="px-6 py-5">
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-muted">
          <UserX className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-text">{title}</h1>
        <p className="mx-auto max-w-md text-[13px] text-text-muted">{description}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button icon={<Search className="size-3.5" aria-hidden />} onClick={() => openGlobalSearch({ name: '', platform })}>
            Search for the player
          </Button>
          {pinned && (
            <Button variant="ghost" icon={<PinOff className="size-3.5" aria-hidden />} onClick={() => unpin(player)}>
              Unpin this account
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
