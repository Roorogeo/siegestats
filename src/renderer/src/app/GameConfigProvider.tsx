import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createGameIndex, type GameIndex } from '@shared/game-config';
import type { GameConfig, SeasonDef } from '@shared/types/game-config';
import { toIso } from '@shared/util/time';
import { NOW_TICK_MS } from '../lib/useNow';

const GameContext = createContext<GameIndex | null>(null);

/**
 * The versioned game data (seasons, ranks, playlists, operators, maps, regions), received from the bridge before
 * the first render, as settings are. Components look things up through useGame(); none imports the JSON itself.
 */
export function GameConfigProvider({ config, children }: { config: GameConfig; children: ReactNode }) {
  const index = useMemo(() => createGameIndex(config), [config]);
  return <GameContext.Provider value={index}>{children}</GameContext.Provider>;
}

/** Lookups over the game config: game.rank(id), game.operator(id), game.currentSeasonAt(iso), ... */
export function useGame(): GameIndex {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside <GameConfigProvider>');
  return game;
}

// One timer, at the useNow pace, re-checks the season for every component that asks for it.
const seasonWatchers = new Set<() => void>();
let seasonTimer: number | undefined;

function watchSeason(listener: () => void): () => void {
  seasonWatchers.add(listener);
  if (seasonWatchers.size === 1) {
    seasonTimer = window.setInterval(() => {
      for (const notify of seasonWatchers) notify();
    }, NOW_TICK_MS);
  }
  return () => {
    seasonWatchers.delete(listener);
    if (seasonWatchers.size === 0) window.clearInterval(seasonTimer);
  };
}

/**
 * The season in force now: game.currentSeasonAt(now), the same rule core and the mock use. Every "current season"
 * on screen (the Season period, the Current badge, default season filters) comes from here, never from
 * game.currentSeason(), so the app moves to a new season at its start date without a config edit. Re-checked every
 * useNow tick (30 s), it re-renders only when the season changes, so the stats hooks can key their queries on it.
 */
export function useCurrentSeason(): SeasonDef {
  const game = useGame();
  // currentSeasonAt answers the config's own SeasonDef objects: the same object until the season changes.
  const read = useCallback(() => game.currentSeasonAt(toIso(Date.now())), [game]);
  return useSyncExternalStore(watchSeason, read, read);
}
