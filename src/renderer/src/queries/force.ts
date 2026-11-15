import { hashKey, type QueryClient, type QueryFilters, type QueryKey } from '@tanstack/react-query';
import type { PlayerKey } from '@shared/types/player';
import { isQueryOfPlayer, STATS } from './keys';

/**
 * Update and the title-bar refresh re-fetch with { force: true }, which makes core skip its cache (design question
 * 17). TanStack re-runs a query's own queryFn, which cannot be given an argument, so the queries being forced are
 * listed here for the duration of the re-fetch and every stats queryFn asks isForced() for its key. An infinite
 * query re-fetches every loaded page inside that window, so all of its pages are forced too.
 */
const forced = new Map<string, number>(); // query hash -> forced re-fetches in progress

export const isForced = (queryKey: QueryKey): boolean => forced.has(hashKey(queryKey));

/** Re-fetches the queries matching `filters` (active and inactive, not disabled ones), bypassing core's cache. */
export async function refetchForced(client: QueryClient, filters: QueryFilters): Promise<void> {
  const hashes = client
    .getQueryCache()
    .findAll(filters)
    .map((query) => query.queryHash);
  for (const hash of hashes) forced.set(hash, (forced.get(hash) ?? 0) + 1);
  try {
    // A query already fetching from cache is cancelled and re-run, so it too sees the flag.
    await client.refetchQueries(filters, { throwOnError: false, cancelRefetch: true });
  } finally {
    for (const hash of hashes) {
      const left = (forced.get(hash) ?? 1) - 1;
      if (left > 0) forced.set(hash, left);
      else forced.delete(hash);
    }
  }
}

/**
 * The Update button: every per-player query of this player that TanStack holds (profile, seasons, operators, maps,
 * match history with all loaded pages, encounters), mounted or not, fetched again from the source. Queries that
 * were never made have nothing cached in core either, so they need nothing.
 */
export const updatePlayerQueries = (client: QueryClient, player: PlayerKey): Promise<void> =>
  refetchForced(client, { predicate: (query) => isQueryOfPlayer(query.queryKey, player) });

/** The title-bar refresh: what is on screen now. Stats bypass core's cache; anything else is simply re-read. */
export async function refreshScreen(client: QueryClient): Promise<void> {
  await Promise.all([
    refetchForced(client, { queryKey: [STATS], type: 'active' }),
    client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== STATS }),
  ]);
}
