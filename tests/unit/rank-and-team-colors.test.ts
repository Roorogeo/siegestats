import { describe, expect, test } from 'vitest';
import { rankLabel, rankState } from '@renderer/components/rank-state';
import { teamSlots } from '@renderer/features/match/team-slots';
import { createGameIndex } from '@shared/game-config';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import { THEMES, color } from '@shared/theme';
import type { RankId } from '@shared/types/primitives';

const game = createGameIndex(loadBundledGameConfig());

describe('rankState and rankLabel', () => {
  const someRank = game.config.rankSystems.at(-1)?.ranks[4];

  test('a known division: its tier colour, names and points', () => {
    if (!someRank) throw new Error('no rank in the config');
    const state = rankState(game, someRank.id, 2458);
    expect(state).toEqual({
      kind: 'rank',
      rankId: someRank.id,
      name: someRank.name,
      shortName: someRank.shortName,
      color: game.tierOf(someRank.id)?.color,
      points: 2458,
    });
    expect(rankLabel(state)).toBe(`${someRank.name}, 2,458 RP`);
    expect(rankLabel(rankState(game, someRank.id, null))).toBe(someRank.name);
  });

  test('points without a division, an unknown rank id, and unranked', () => {
    expect(rankState(game, null, 1234)).toEqual({ kind: 'points', points: 1234 });
    expect(rankLabel(rankState(game, null, 1234), 'points')).toBe('1,234 points');
    expect(rankState(game, 'r9.nope-1' as RankId, 50)).toEqual({ kind: 'unknown', points: 50 });
    expect(rankLabel(rankState(game, 'r9.nope-1' as RankId, 50))).toBe('Unknown rank, 50 RP');
    expect(rankState(game, null, null)).toEqual({ kind: 'unranked' });
    expect(rankLabel(rankState(game, null, null))).toBe('Unranked');
  });
});

describe('teamSlots', () => {
  test('in every theme, Blue and Orange get two different chart colours, blue and orange in hue', () => {
    expect(THEMES).toHaveLength(56);
    for (const theme of THEMES) {
      const slots = teamSlots(theme);
      expect(slots.blue, theme.id).not.toBe(slots.orange);
      for (const slot of [slots.blue, slots.orange]) {
        expect(Number.isInteger(slot) && slot >= 0 && slot < theme.tokens.chart.length, theme.id).toBe(true);
      }
      const hue = (slot: number) => color.toOklch(theme.tokens.chart[slot] ?? '#000000').h;
      expect(color.hueDistance(hue(slots.blue), 255), `${theme.id} blue`).toBeLessThan(30);
      expect(color.hueDistance(hue(slots.orange), 45), `${theme.id} orange`).toBeLessThan(30);
    }
  });
});
