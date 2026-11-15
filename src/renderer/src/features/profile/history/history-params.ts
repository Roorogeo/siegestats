import type { GameIndex } from '@shared/game-config';
import type { MatchPeriod } from '@shared/types/match';
import type { PlaylistId } from '@shared/types/primitives';

/**
 * The match history's filters as URL search params, so back / forward restore them. Every name starts with "h" so it
 * never collides with the profile frame's own params (tab) or another tab's filters.
 *   hp=ranked,standard   the playlist chips (absent = All)
 *   hperiod=7|30|90|season   the period picker (absent = 30 days)
 */
export const PLAYLISTS_PARAM = 'hp';
export const PERIOD_PARAM = 'hperiod';

export type PeriodChoice = '7' | '30' | '90' | 'season';
export const PERIOD_CHOICES: readonly PeriodChoice[] = ['7', '30', '90', 'season'];
export const DEFAULT_PERIOD: PeriodChoice = '30';

export const PERIOD_LABEL: Readonly<Record<PeriodChoice, string>> = {
  '7': '7 days',
  '30': '30 days',
  '90': '90 days',
  season: 'Season',
};

const isPeriodChoice = (value: string | null): value is PeriodChoice => value !== null && (PERIOD_CHOICES as readonly string[]).includes(value);

export function readPeriod(params: URLSearchParams): PeriodChoice {
  const raw = params.get(PERIOD_PARAM);
  return isPeriodChoice(raw) ? raw : DEFAULT_PERIOD;
}

/** The chips from the URL: only ids the game config knows, each once, in config order. None = All. */
export function readPlaylists(params: URLSearchParams, game: GameIndex): PlaylistId[] | 'all' {
  const raw = new Set((params.get(PLAYLISTS_PARAM) ?? '').split(',').filter((id) => id.length > 0));
  const known = game.config.playlists.filter((p) => raw.has(p.id)).map((p) => p.id);
  return known.length === 0 ? 'all' : known;
}

/** A copy of `params` with the history filters set; defaults are removed so a plain profile link stays clean. */
export function writeHistoryParams(
  params: URLSearchParams,
  next: { period?: PeriodChoice; playlists?: readonly PlaylistId[] | 'all' },
): URLSearchParams {
  const out = new URLSearchParams(params);
  if (next.period !== undefined) {
    if (next.period === DEFAULT_PERIOD) out.delete(PERIOD_PARAM);
    else out.set(PERIOD_PARAM, next.period);
  }
  if (next.playlists !== undefined) {
    if (next.playlists === 'all' || next.playlists.length === 0) out.delete(PLAYLISTS_PARAM);
    else out.set(PLAYLISTS_PARAM, next.playlists.join(','));
  }
  return out;
}

/** The provider's period for a choice. "Season" is the current season of the game config. */
export function toMatchPeriod(choice: PeriodChoice, game: GameIndex): MatchPeriod {
  if (choice === 'season') return { kind: 'season', seasonId: game.currentSeason().id };
  return { kind: 'days', days: choice === '7' ? 7 : choice === '30' ? 30 : 90 };
}

/** "in the last 7 days" / "this season": the end of an empty-state sentence. */
export function periodPhrase(choice: PeriodChoice): string {
  return choice === 'season' ? 'this season' : `in the last ${choice} days`;
}
