import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { IsoDateTime } from '@shared/types/primitives';
import type { PlayerKey, PlayerRef } from '@shared/types/player';
import type { AppError } from '@shared/types/provider';
import type { Favorite, RecentSearch } from '@shared/types/storage';
import { bridge } from '../bridge';
import { queryKeys, samePlayer } from './keys';
import { asAppError } from './stats';

/**
 * Favourites, newest first. Kept in step with bridge.favorites.onChange, so a star toggled anywhere (another
 * screen, the overlay window later) shows everywhere without a re-fetch.
 */
export function useFavorites(): UseQueryResult<Favorite[], AppError> {
  const client = useQueryClient();
  useEffect(() => bridge.favorites.onChange((all) => client.setQueryData(queryKeys.favorites(), all)), [client]);
  return useQuery({
    queryKey: queryKeys.favorites(),
    queryFn: () => asAppError(bridge.favorites.list()),
    staleTime: Infinity,
  });
}

export function useIsFavorite(player: PlayerKey | null): boolean {
  const favorites = useFavorites().data;
  return player !== null && (favorites ?? []).some((f) => samePlayer(f.player, player));
}

interface FavoriteMutations {
  add: UseMutationResult<void, AppError, PlayerRef, { previous: Favorite[] | undefined }>;
  remove: UseMutationResult<void, AppError, PlayerKey, { previous: Favorite[] | undefined }>;
}

/** Add / remove with the star updated at once; a failed save puts the list back as it was. */
export function useFavoriteMutations(): FavoriteMutations {
  const client = useQueryClient();
  const key = queryKeys.favorites();

  const optimistic = async (change: (list: Favorite[]) => Favorite[]) => {
    await client.cancelQueries({ queryKey: key });
    const previous = client.getQueryData<Favorite[]>(key);
    client.setQueryData<Favorite[]>(key, change(previous ?? []));
    return { previous };
  };
  const rollback = (_error: AppError, _variables: unknown, context: { previous: Favorite[] | undefined } | undefined) => {
    if (context) client.setQueryData(key, context.previous);
  };
  const settle = () => client.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (player: PlayerRef) => asAppError(bridge.favorites.add(player)),
    onMutate: (player) =>
      optimistic((list) =>
        list.some((f) => samePlayer(f.player, player))
          ? list
          : [{ player, addedAt: new Date().toISOString() as IsoDateTime, lastKnownRank: null }, ...list],
      ),
    onError: rollback,
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (player: PlayerKey) => asAppError(bridge.favorites.remove({ platform: player.platform, id: player.id })),
    onMutate: (player) => optimistic((list) => list.filter((f) => !samePlayer(f.player, player))),
    onError: rollback,
    onSettled: settle,
  });
  return { add, remove };
}

/** The profile header's star: whether this player is a favourite, and a toggle. */
export function useFavoriteToggle(player: PlayerRef | null): { isFavorite: boolean; toggle(): void; isPending: boolean } {
  const isFavorite = useIsFavorite(player);
  const { add, remove } = useFavoriteMutations();
  return {
    isFavorite,
    isPending: add.isPending || remove.isPending,
    toggle: () => {
      if (!player) return;
      if (isFavorite) remove.mutate(player);
      else add.mutate(player);
    },
  };
}

/** The last searches (newest first, at most 10), for the search box's empty state. */
export function useRecentSearches(opts: { enabled?: boolean } = {}): UseQueryResult<RecentSearch[], AppError> {
  return useQuery({
    queryKey: queryKeys.recentSearches(),
    queryFn: () => asAppError(bridge.searches.recent()),
    enabled: opts.enabled ?? true,
  });
}

/** Call when the user opens a search result; the recent list re-reads afterwards. */
export function useRememberSearch(): UseMutationResult<void, AppError, PlayerRef> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (player: PlayerRef) => asAppError(bridge.searches.remember(player)),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.recentSearches() }),
  });
}
