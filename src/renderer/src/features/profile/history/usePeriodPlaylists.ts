import { useEffect, useMemo } from 'react';
import type { MatchPeriod } from '@shared/types/match';
import type { PlaylistId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import { matchHistoryItems, useMatches } from '../../../queries';

/** Rows per request while counting: the provider's largest page, so a busy 90 days takes two or three calls. */
const COUNT_PAGE_SIZE = 100;

export interface PeriodPlaylists {
  /** Matches per playlist in the period, every page counted. null while counting, or when counting failed. */
  counts: ReadonlyMap<PlaylistId, number> | null;
  failed: boolean;
}

/**
 * Which playlists the player has in a period, and how many matches each: the filter chips list only these.
 * MatchHistorySummary has no per-playlist split, so this reads the period's whole unfiltered history through
 * useMatches (an infinite query) and keeps fetching pages until the cursor runs out. Answers come from core's
 * 5-minute cache after the first time, like every other per-player query.
 */
export function usePeriodPlaylists(player: PlayerKey, period: MatchPeriod): PeriodPlaylists {
  const query = useMatches({ player, playlistIds: 'all', mapId: 'all', period, limit: COUNT_PAGE_SIZE });
  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const counts = useMemo(() => {
    const byPlaylist = new Map<PlaylistId, number>();
    for (const match of matchHistoryItems(data)) {
      if (match.playlistId !== null) byPlaylist.set(match.playlistId, (byPlaylist.get(match.playlistId) ?? 0) + 1);
    }
    return byPlaylist;
  }, [data]);

  const complete = data !== undefined && !hasNextPage && !isError;
  return { counts: complete ? counts : null, failed: isError };
}
