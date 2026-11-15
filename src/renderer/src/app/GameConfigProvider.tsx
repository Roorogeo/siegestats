import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createGameIndex, type GameIndex } from '@shared/game-config';
import type { GameConfig, SeasonDef } from '@shared/types/game-config';
import { toIso } from '@shared/util/time';
import { useNow } from '../lib/useNow';

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

/**
 * The season in force now: game.currentSeasonAt(now), the same rule core and the mock use. Every "current season"
 * on screen (the Season period, the Current badge, default season filters) comes from here, never from
 * game.currentSeason(), so the app moves to a new season at its start date without a config edit.
 */
export function useCurrentSeason(): SeasonDef {
  const game = useGame();
  const now = useNow();
  return game.currentSeasonAt(toIso(now));
}
