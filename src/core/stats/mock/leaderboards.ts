import type { GameIndex } from '@shared/game-config';
import type { PlaylistDef } from '@shared/types/game-config';
import type { LeaderboardEntry, LeaderboardMetric } from '@shared/types/leaderboard';
import type { LeaderboardScope, RegionId, SeasonId } from '@shared/types/primitives';
import type { RankPoint } from '@shared/types/stats';
import { kd, winRate } from '@shared/util/stats';
import { PLACEMENT_MATCHES } from './generate-world';
import { subtractTally, type Tally } from './tally';
import type { MockAccount, MockWorld, Participation } from './world';

/** K/D and win-rate boards only list players with at least this many matches in that playlist and season. */
export const LEADERBOARD_MIN_MATCHES = 20;

interface Row {
  account: MockAccount;
  value: number;
  previous: number | null; // the value before the account's latest match in this board's scope; null = not on the board then
  kd: number | null;
  winRate: number | null;
  rank: RankPoint | null;
  regionId: RegionId | null;
  regionalPosition: number | null;
}

/** A full board (every row, sorted), before region filtering and paging. */
export interface Board {
  rows: Row[];
  regional: boolean;
}

const byValue = (a: { value: number; account: MockAccount }, b: { value: number; account: MockAccount }): number =>
  b.value - a.value || a.account.ref.name.localeCompare(b.account.ref.name) || a.account.key.localeCompare(b.account.key);

/** The Ranked standing a board shows as the badge column: the season's ladder playlist. */
function ladderRank(game: GameIndex, world: MockWorld, account: MockAccount, seasonId: SeasonId): RankPoint | null {
  const aggs = world.seasons.get(account.key)?.get(seasonId);
  if (!aggs) return null;
  for (const playlist of game.config.playlists) {
    if (playlist.points !== 'ladder') continue;
    const standing = aggs.byPlaylist.get(playlist.id)?.standing;
    if (standing?.rank) return standing.rank;
  }
  return null;
}

/**
 * Rows are the generated accounts themselves, so a row always agrees with that player's profile. Position change
 * compares with the board as it stood before each player's latest match in this playlist and season; seasons
 * without listed matches (summary-only) have no earlier standings, so their change is unknown.
 */
export function buildBoard(
  game: GameIndex,
  world: MockWorld,
  playlist: PlaylistDef,
  seasonId: SeasonId,
  metric: LeaderboardMetric,
  scope: LeaderboardScope,
): Board {
  const regional = (playlist.leaderboard?.regionIds.length ?? 0) > 0;
  const rows: Row[] = [];
  for (const account of world.accounts) {
    if (scope !== 'global' && account.family !== scope) continue;
    const agg = world.seasons.get(account.key)?.get(seasonId);
    if (!agg) continue;
    const scoped = metric === 'level' ? null : agg.byPlaylist.get(playlist.id);
    if (metric !== 'level' && !scoped) continue;
    // 'level' ignores the playlist (design question 25): everyone who played that season is on it.
    const tally: Tally = scoped ? scoped.tally : agg.overall;
    if (tally.matches === 0) continue;
    const latest = agg.fromMatches ? latestParticipation(world, account, seasonId, metric === 'level' ? null : playlist) : null;
    const before = latest ? subtractTally(tally, latest.match.slots[latest.slot]?.tally ?? tally) : null;

    let value: number | null = null;
    let previous: number | null = null;
    switch (metric) {
      case 'points': {
        const rank = scoped?.standing?.rank ?? null;
        if (!rank) continue;
        value = rank.points;
        const change = latest?.match.slots[latest.slot]?.rankChange ?? null;
        // Not on the board before the latest match if that match completed the placements (or was the first).
        const onBoardBefore = (before?.matches ?? 0) >= (playlist.points === 'ladder' ? PLACEMENT_MATCHES : 1);
        previous = change && onBoardBefore ? change.after.points - change.delta : null;
        break;
      }
      case 'kd':
        if (tally.matches < LEADERBOARD_MIN_MATCHES) continue;
        value = kd(tally.kills, tally.deaths) ?? 0;
        previous = before && before.matches >= LEADERBOARD_MIN_MATCHES ? (kd(before.kills, before.deaths) ?? 0) : null;
        break;
      case 'winRate':
        if (tally.matches < LEADERBOARD_MIN_MATCHES) continue;
        value = winRate(tally.wins, tally.losses) ?? 0;
        previous = before && before.matches >= LEADERBOARD_MIN_MATCHES ? (winRate(before.wins, before.losses) ?? 0) : null;
        break;
      case 'level':
        value = account.person.level;
        previous = before && before.matches > 0 ? account.person.level : null;
        break;
    }
    rows.push({
      account,
      value,
      previous,
      kd: kd(tally.kills, tally.deaths),
      winRate: winRate(tally.wins, tally.losses),
      rank: ladderRank(game, world, account, seasonId),
      regionId: regional ? account.legendRegionId : null,
      regionalPosition: regional ? (scoped?.standing?.topPosition ?? null) : null,
    });
  }
  rows.sort(byValue);
  return { rows, regional };
}

function latestParticipation(world: MockWorld, account: MockAccount, seasonId: SeasonId, playlist: PlaylistDef | null): Participation | null {
  const list = world.participations.get(account.key) ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i] as Participation;
    if (p.match.season.id === seasonId && (!playlist || p.match.playlist.id === playlist.id)) return p;
  }
  return null;
}

/** One page of a board, after the region filter; previous positions are computed on the same filtered view. */
export function pageOf(board: Board, regionId: RegionId | 'all', page: number, pageSize: number): { entries: LeaderboardEntry[]; total: number } {
  const rows = regionId === 'all' ? board.rows : board.rows.filter((r) => r.regionId === regionId);
  const previous = rows
    .filter((r) => r.previous !== null)
    .map((r) => ({ account: r.account, value: r.previous as number }))
    .sort(byValue);
  const previousPosition = new Map(previous.map((r, i) => [r.account.key, i + 1]));
  const start = (page - 1) * pageSize;
  const entries = rows.slice(start, start + pageSize).map(
    (r, i): LeaderboardEntry => ({
      position: start + i + 1,
      previousPosition: previousPosition.get(r.account.key) ?? null,
      regionalPosition: r.regionalPosition,
      regionId: r.regionId,
      player: { ...r.account.ref },
      level: r.account.person.level,
      winRate: r.winRate,
      kd: r.kd,
      rank: r.rank ? { ...r.rank } : null,
      value: r.value,
    }),
  );
  return { entries, total: rows.length };
}
