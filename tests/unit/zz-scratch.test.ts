import { test } from 'vitest';
import { loadBundledGameConfig } from '@shared/game-config/bundled';
import { createGameIndex } from '@shared/game-config';
import { generateWorld } from '@core/stats/mock/generate-world';
import type { IsoDateTime } from '@shared/types/primitives';
import { kd, winRate } from '@shared/util/stats';
test('x', () => {
  const game = createGameIndex(loadBundledGameConfig());
  const t0 = performance.now();
  const w = generateWorld({ seed: 7, now: '2026-11-15T12:00:00.000Z' as IsoDateTime, game });
  const t1 = performance.now();
  console.log('ms', Math.round(t1 - t0), 'accounts', w.accounts.length, 'matches', w.matches.length, 'current', w.currentSeasonId);
  const byPl: Record<string, number> = {};
  for (const m of w.matches) byPl[m.playlist.id] = (byPl[m.playlist.id] ?? 0) + 1;
  console.log(byPl);
  const bySeason: Record<string, number> = {};
  for (const m of w.matches) bySeason[m.season.id] = (bySeason[m.season.id] ?? 0) + 1;
  console.log(bySeason);
  const counts = w.accounts.map((a) => w.participations.get(a.key)!.length).sort((a, b) => a - b);
  console.log('matches per account min/med/max', counts[0], counts[150], counts[299], 'zero', counts.filter((c) => c === 0).length);
  const plat: Record<string, number> = {};
  for (const a of w.accounts) plat[a.ref.platform] = (plat[a.ref.platform] ?? 0) + 1;
  console.log(plat, 'linked', w.accounts.filter((a) => a.linked.length).length, 'legend', w.accounts.filter((a) => a.legendRegionId).length, 'party', w.accounts.filter(a=>a.partyId!==null).length);
  console.log(w.accounts.slice(0, 30).map((a) => a.ref.name).join(', '));
  // rounds distribution
  const rd: Record<number, number> = {};
  for (const m of w.matches) rd[m.detail.rounds!.length] = (rd[m.detail.rounds!.length] ?? 0) + 1;
  console.log('rounds', rd);
  // some player stats
  for (const a of w.accounts.slice(0, 8)) {
    const rec = w.seasonRecords.get(a.key)!;
    const cur = rec[0]!;
    const r = cur.byPlaylist.find((p) => p.playlistId === 'ranked');
    console.log(a.ref.name, a.ref.platform, 'skill', a.person.skill.toFixed(2), 'lvl', a.person.level, cur.seasonId, 'm', cur.overall.matches, 'kd', kd(cur.overall.kills, cur.overall.deaths)?.toFixed(2), 'wr', winRate(cur.overall.wins, cur.overall.losses)?.toFixed(2), 'hs', cur.overall.headshotPct?.toFixed(2), 'dpr', cur.overall.damagePerRound?.toFixed(0), 'rank', r?.standing?.rank?.rankId, r?.standing?.rank?.points, 'peak', r?.standing?.peak?.rankId, 'seasons', rec.map(s=>s.seasonId).join(' '));
  }
});
