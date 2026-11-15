import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createGameIndex, type GameIndex } from '@shared/game-config';
import type { GameConfig } from '@shared/types/game-config';

const GameContext = createContext<GameIndex | null>(null);

/**
 * The versioned game data (seasons, ranks, playlists, operators, maps, regions), received from the bridge before
 * the first render, as settings are. Components look things up through useGame(); none imports the JSON itself.
 */
export function GameConfigProvider({ config, children }: { config: GameConfig; children: ReactNode }) {
  const index = useMemo(() => createGameIndex(config), [config]);
  return <GameContext.Provider value={index}>{children}</GameContext.Provider>;
}

/** Lookups over the game config: game.rank(id), game.operator(id), game.currentSeason(), ... */
export function useGame(): GameIndex {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside <GameConfigProvider>');
  return game;
}
