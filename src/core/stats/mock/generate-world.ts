import type { GameIndex } from '@shared/game-config';
import type { MapDef, PlaylistDef, PlaylistKind, SeasonDef } from '@shared/types/game-config';
import type { MatchDetail, MatchPlayer, MatchSummary, MatchTeam, RankChange } from '@shared/types/match';
import type {
  IsoDateTime, MatchId, OperatorId, PlatformFamily, PlaylistId, SeasonId, Side, TeamId,
} from '@shared/types/primitives';
import type { OperatorStats, RankPoint, RankedStanding, SeasonRecord } from '@shared/types/stats';
import { createRandom, type Random } from '@shared/util/random';
import { headshotPct } from '@shared/util/stats';
import { DAY_MS, MINUTE_MS, toIso, toMs } from '@shared/util/time';
import { mergeOperatorTallies, splitOverMaps, splitOverOperators, type OperatorSlot } from './breakdown';
import { familyOf, generateAccounts } from './players';
import { expandRounds, operatorIdsOf, simulateMatch, type SimPlayer } from './simulate';
import {
  addOperatorTally, addTally, emptyOperatorTally, emptyTally, toMatchStats, toOperatorStats, type OperatorTally, type Tally,
} from './tally';
import type {
  GeneratedMatch, MatchSlot, MockAccount, MockPerson, MockWorld, OperatorRounds, OperatorTallies, Participation, SeasonAgg,
  SummaryLine,
} from './world';

export const MOCK_MATCH_COUNT = 3000;
/** Matches are spread over this many days before "now", so the 7 / 30 / 90-day pickers always have data. */
export const MOCK_WINDOW_DAYS = 160;
/** Ranked placements at the start of every season. */
export const PLACEMENT_MATCHES = 5;
/** Matches all end at least this long before "now". */
const LATEST_START_BEFORE_NOW_MS = 50 * MINUTE_MS;

/** How often each kind of playlist is queued. Kinds, not ids: the config decides which playlists exist. */
const KIND_WEIGHTS: Partial<Record<PlaylistKind, number>> = { ranked: 46, standard: 20, quick: 22, arcade: 6, event: 6 };
const LEGEND_SHARE = 0.4; // of a Legend player's matches, in a season with a Legend edition

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const weightOf = (a: MockAccount): number => a.person.activity * a.activityShare;

export interface GenerateOptions {
  seed: number;
  now: IsoDateTime;
  game: GameIndex;
}

/**
 * The whole mock world as a pure function of (seed, now, config): the same three inputs give byte-identical
 * output. Accounts depend on the seed and config only; matches are placed relative to `now`, and each match
 * belongs to the season its date falls in, by the config's dates. The current season is
 * GameIndex.currentSeasonAt(now), the rule the renderer uses too.
 */
export function generateWorld({ seed, now, game }: GenerateOptions): MockWorld {
  const root = createRandom(seed);
  const nowMs = toMs(now);
  if (Number.isNaN(nowMs)) throw new Error(`generateWorld: not a date: ${now}`);
  const accounts = generateAccounts(root.fork('accounts'), game);
  const windowStartMs = nowMs - MOCK_WINDOW_DAYS * DAY_MS;

  const first = game.config.seasons[0] as SeasonDef;
  const current = game.currentSeasonAt(toIso(nowMs));
  const nowInConfig = game.seasonAt(toIso(nowMs)) !== null;
  // A match belongs to the season its date falls in. A date outside every season belongs to the current season
  // (currentSeasonAt's fallback, so the newest matches always agree with currentSeasonId), except a date before the
  // first season while the clock is inside the config: that is the first season, so seasons never run backwards.
  const seasonFor = (ms: number): SeasonDef =>
    game.seasonAt(toIso(ms)) ?? (nowInConfig && ms < toMs(first.startsAt) ? first : current);

  const { matches, standings } = simulateMatches(root.fork('matches'), game, accounts, { windowStartMs, nowMs, seasonFor });
  const participations = new Map<string, Participation[]>(accounts.map((a) => [a.key, []]));
  for (const match of matches) match.slots.forEach((s, slot) => participations.get(s.account.key)?.push({ match, slot }));
  const seasonAggs = aggregateSeasons(accounts, participations, standings);
  const history = root.fork('history');
  addSummarySeasons(history, game, accounts, seasonAggs, windowStartMs);
  assignLegendPositions(game, accounts, seasonAggs);

  // Summary-only seasons are broken down per map and operator on first use, one account at a time: ~13,000 playlist
  // lines in all, which would double the generation time (a long task on the browser build's main thread). Each
  // account draws from its own fork, so the result does not depend on the order accounts are asked for.
  const accountByKey = new Map(accounts.map((a) => [a.key, a]));
  const breakDown = summaryBreakdown(game);
  const detailed = new Set<string>();
  const seasonsOf = (key: string): Map<SeasonId, SeasonAgg> => {
    const aggs = seasonAggs.get(key) ?? new Map<SeasonId, SeasonAgg>();
    const account = accountByKey.get(key);
    if (account && !detailed.has(key)) {
      detailed.add(key);
      breakDown(history.fork(key), account, aggs);
    }
    return aggs;
  };
  const records = new Map<string, SeasonRecord[]>();
  const seasonRecords = (key: string): SeasonRecord[] => {
    let list = records.get(key);
    const account = accountByKey.get(key);
    if (!list && account) {
      const aggs = seasonsOf(key);
      list = game.seasonsDescending().flatMap((season) => {
        const agg = aggs.get(season.id);
        return agg && agg.overall.matches > 0 ? [toSeasonRecord(game, account.family, agg)] : [];
      });
      records.set(key, list);
    }
    return list ?? [];
  };

  return {
    seed,
    generatedAt: now,
    currentSeasonId: current.id,
    windowStart: toIso(windowStartMs),
    accounts,
    accountByKey,
    matches,
    matchById: new Map(matches.map((m) => [m.id, m])),
    participations,
    seasons: seasonAggs,
    seasonsOf,
    seasonRecords,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Public shapes, built on request

/** The full public match: both teams' scoreboards and the round timeline. */
export function matchDetail(game: GameIndex, match: GeneratedMatch): MatchDetail {
  const team = (teamId: TeamId): MatchTeam => ({
    id: teamId,
    score: match.score[teamId],
    result: teamId === match.winner ? 'win' : 'loss',
    players: match.slots.flatMap((s, slot): MatchPlayer[] =>
      s.team !== teamId
        ? []
        : [{
            slot,
            name: s.account.ref.name,
            player: { ...s.account.ref },
            kills: s.tally.kills,
            deaths: s.tally.deaths,
            assists: s.tally.assists,
            headshotPct: headshotPct(s.tally.headshots, s.tally.kills),
            damage: s.tally.damage,
            score: s.score,
            operatorIds: operatorIdsOf(s.operators),
          }],
    ),
  });
  return {
    id: match.id,
    origin: 'provider',
    gameMatchId: match.gameMatchId,
    playlistId: match.playlist.id,
    mapId: match.map.id,
    seasonId: match.season.id,
    startedAt: match.startedAt,
    durationSec: match.durationSec,
    teams: [team('blue'), team('orange')],
    recorderSlot: null,
    rounds: expandRounds(game, match.rounds),
  };
}

/** One row of an account's match history, from that account's point of view. */
export function matchSummary(p: Participation): MatchSummary {
  const { match } = p;
  const s = match.slots[p.slot] as MatchSlot;
  const opponent: TeamId = s.team === 'blue' ? 'orange' : 'blue';
  return {
    id: match.id,
    origin: 'provider',
    gameMatchId: match.gameMatchId,
    playlistId: match.playlist.id,
    mapId: match.map.id,
    seasonId: match.season.id,
    startedAt: match.startedAt,
    durationSec: match.durationSec,
    result: s.team === match.winner ? 'win' : 'loss',
    score: { own: match.score[s.team], opponent: match.score[opponent] },
    rankChange: s.rankChange,
    kills: s.tally.kills,
    deaths: s.tally.deaths,
    assists: s.tally.assists,
    headshotPct: headshotPct(s.tally.headshots, s.tally.kills),
    hasDetail: true,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Matches

interface PointsState {
  matches: number;
  points: number;
  placed: boolean;
  current: RankPoint;
  peak: RankPoint | null;
}

/** Per account, `${seasonId}|${playlistId}` -> the points state after its last match. */
type Standings = Map<string, Map<string, PointsState>>;

interface Timeline {
  windowStartMs: number;
  nowMs: number;
  seasonFor(ms: number): SeasonDef;
}

function hex(rng: Random, n: number): string {
  let out = '';
  for (let i = 0; i < n; i += 1) out += rng.int(0, 15).toString(16);
  return out;
}

/** Where a player's rating pulls their RP over a season. Hidden: only the RP it produces is visible. */
const targetPoints = (a: MockAccount): number => clamp(2900 + 830 * a.person.skill - (a.family === 'console' ? 80 : 0), 1000, 7000);

function simulateMatches(
  rng: Random,
  game: GameIndex,
  accounts: MockAccount[],
  timeline: Timeline,
): { matches: GeneratedMatch[]; standings: Standings } {
  const { windowStartMs, nowMs, seasonFor } = timeline;
  const span = nowMs - LATEST_START_BEFORE_NOW_MS - windowStartMs;
  const times = Array.from({ length: MOCK_MATCH_COUNT }, () => windowStartMs + Math.floor(rng.next() * span)).sort((a, b) => a - b);

  const busyUntil = new Float64Array(accounts.length);
  const byFamily: Record<PlatformFamily, MockAccount[]> = {
    pc: accounts.filter((a) => a.family === 'pc'),
    console: accounts.filter((a) => a.family === 'console'),
  };
  const familyWeights: [PlatformFamily, number][] = (['pc', 'console'] as const).map((f) => [f, byFamily[f].reduce((s, a) => s + weightOf(a), 0)]);
  const parties = new Map<number, MockAccount[]>();
  for (const a of accounts) if (a.partyId !== null) parties.set(a.partyId, [...(parties.get(a.partyId) ?? []), a]);

  const playlistsBySeason = new Map<SeasonId, { queue: [PlaylistDef, number][]; legend: PlaylistDef | null }>();
  const playable = (season: SeasonDef) => {
    let entry = playlistsBySeason.get(season.id);
    if (!entry) {
      const active = game.config.playlists.filter((p) => game.playlistActiveIn(p.id, season.id));
      const sameKind = (kind: PlaylistKind): number => active.filter((p) => p.kind === kind).length;
      entry = {
        queue: active.flatMap((p): [PlaylistDef, number][] => {
          const w = KIND_WEIGHTS[p.kind];
          return w ? [[p, w / sameKind(p.kind)]] : [];
        }),
        legend: active.find((p) => p.kind === 'legend') ?? null,
      };
      playlistsBySeason.set(season.id, entry);
    }
    return entry;
  };

  const mapsFor = mapPools(game);
  const unreleasedIn = unreleasedOperators(game);

  const standings: Standings = new Map();
  const applyPoints = (a: MockAccount, season: SeasonDef, playlist: PlaylistDef, won: boolean): RankChange | null => {
    if (playlist.points === null) return null;
    const perAccount = standings.get(a.key) ?? new Map<string, PointsState>();
    standings.set(a.key, perAccount);
    const key = `${season.id}|${playlist.id}`;
    const ladder = playlist.points === 'ladder';
    const system = ladder ? game.rankSystemFor(season.id) : null;
    const floor = system?.ranks[0]?.minPoints ?? 0;
    const target = targetPoints(a);
    let state = perAccount.get(key);
    if (!state) {
      // Season start: a soft reset below where the player belongs (the ladder then pulls them back up).
      const start = ladder ? target - 250 + rng.normal(0, 150) : 5000 + 260 * (a.person.skill - 2) + rng.normal(0, 80);
      const points = Math.max(floor, Math.round(start));
      state = { matches: 0, points, placed: !ladder, current: { points, rankId: null }, peak: null };
      perAccount.set(key, state);
    }
    let delta: number;
    if (!ladder) delta = won ? rng.int(18, 32) : -rng.int(16, 30);
    else if (state.matches < PLACEMENT_MATCHES) delta = won ? rng.int(55, 85) : -rng.int(25, 45); // boosted placements
    else {
      const pull = 26 + (target - state.points) / 45 + rng.normal(0, 4);
      delta = won ? Math.round(clamp(pull, 12, 48)) : -Math.round(clamp(52 - pull, 12, 48));
    }
    const points = Math.max(floor, state.points + delta);
    delta = points - state.points;
    state.matches += 1;
    state.points = points;
    if (ladder && state.matches >= PLACEMENT_MATCHES) state.placed = true;
    // A ladder match during placements has no division yet: rankId null (as when the season's ladder is not in the config).
    const rankId = ladder && state.placed && system ? (game.rankForPoints(system.id, points)?.id ?? null) : null;
    state.current = { points, rankId };
    if (state.placed && (!state.peak || points > state.peak.points)) state.peak = state.current;
    return { after: state.current, delta };
  };

  const matches: GeneratedMatch[] = [];
  for (const t of times) {
    const frac = (t - windowStartMs) / (nowMs - windowStartMs);
    const available = (a: MockAccount): boolean =>
      frac >= a.person.activeFrom && frac <= a.person.activeUntil && (busyUntil[a.index] ?? 0) <= t;
    const season = seasonFor(t);
    const { queue, legend } = playable(season);
    if (queue.length === 0) continue;

    let built: ReturnType<typeof buildTeams> = null;
    for (let attempt = 0; attempt < 8 && !built; attempt += 1) {
      const family = rng.weighted(familyWeights);
      const pool = byFamily[family].filter(available);
      if (pool.length < 10) continue;
      const taken = new Uint8Array(accounts.length);
      const anchor = drawAccount(rng, pool, taken);
      if (!anchor) continue;
      const playLegend = legend !== null && anchor.legendRegionId !== null && rng.chance(LEGEND_SHARE);
      const playlist = playLegend && legend ? legend : rng.weighted(queue);
      const eligible = playLegend ? pool.filter((a) => a.legendRegionId !== null) : pool;
      built = buildTeams(rng, anchor, eligible, playLegend ? null : parties, playlist, taken);
    }
    if (!built) continue;

    const { blue, orange, playlist, party } = built;
    const players: SimPlayer[] = [
      ...rng.shuffle(blue).map((account, i) => ({ account, slot: i, team: 'blue' as const })),
      ...rng.shuffle(orange).map((account, i) => ({ account, slot: blue.length + i, team: 'orange' as const })),
    ];
    const sim = simulateMatch(rng, game, playlist, players, party, unreleasedIn(season));
    const winner: TeamId = sim.score.blue > sim.score.orange ? 'blue' : 'orange';
    const slots: MatchSlot[] = players.map((p) => {
      const r = sim.players[p.slot];
      return {
        account: p.account,
        team: p.team,
        tally: r?.tally ?? { ...emptyTally(), matches: 1 },
        operators: r?.operators ?? [],
        score: r?.score ?? 0,
        rankChange: applyPoints(p.account, season, playlist, p.team === winner),
      };
    });
    matches.push({
      index: matches.length,
      id: `m-${hex(rng, 20)}` as MatchId,
      gameMatchId: `${hex(rng, 8)}-${hex(rng, 4)}-${hex(rng, 4)}-${hex(rng, 4)}-${hex(rng, 12)}`.toUpperCase(),
      startMs: t,
      startedAt: toIso(t),
      durationSec: sim.durationSec,
      season,
      playlist,
      map: rng.pick(mapsFor(season, playlist)),
      score: sim.score,
      winner,
      slots,
      rounds: sim.rounds,
    });
    for (const p of players) busyUntil[p.account.index] = t + sim.durationSec * 1000 + rng.int(1, 8) * MINUTE_MS;
  }
  return { matches, standings };
}

/**
 * The maps a match of that playlist can be on in that season: released by then, and played in that kind of
 * playlist (playlistKinds null = every kind). Every released map when none fits. Kinds, not each season's exact
 * pool: the config does not keep those.
 */
function mapPools(game: GameIndex): (season: SeasonDef, playlist: PlaylistDef) => readonly MapDef[] {
  const cache = new Map<string, readonly MapDef[]>();
  return (season, playlist) => {
    const key = `${season.id}|${playlist.id}`;
    let pool = cache.get(key);
    if (!pool) {
      const released = game.config.maps.filter((m) => game.releasedIn(m, season.id));
      const fitting = released.filter((m) => m.playlistKinds === null || m.playlistKinds.includes(playlist.kind));
      pool = fitting.length > 0 ? fitting : released.length > 0 ? released : game.config.maps;
      cache.set(key, pool);
    }
    return pool;
  };
}

/** Per season and side, by position in GameIndex.operatorsBySide: 1 = not released yet that season, never picked. */
function unreleasedOperators(game: GameIndex): (season: SeasonDef) => Record<Side, Uint8Array> {
  const cache = new Map<SeasonId, Record<Side, Uint8Array>>();
  const flags = (side: Side, season: SeasonDef): Uint8Array =>
    Uint8Array.from(game.operatorsBySide(side), (o) => (game.releasedIn(o, season.id) ? 0 : 1));
  return (season) => {
    let entry = cache.get(season.id);
    if (!entry) {
      entry = { attack: flags('attack', season), defense: flags('defense', season) };
      cache.set(season.id, entry);
    }
    return entry;
  };
}

/** A weighted draw (by activity) among the accounts not taken yet; the pick is marked taken. No allocation: it runs ~60,000 times. */
function drawAccount(rng: Random, items: readonly MockAccount[], taken: Uint8Array): MockAccount | null {
  let total = 0;
  for (const a of items) if (!taken[a.index]) total += weightOf(a);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  let last: MockAccount | null = null;
  for (const a of items) {
    if (taken[a.index]) continue;
    last = a;
    roll -= weightOf(a);
    if (roll < 0) break;
  }
  if (last) taken[last.index] = 1;
  return last;
}

/** Pick ten: the anchor's team (with part of their friend group, sometimes) and opponents, all within a skill band. */
function buildTeams(
  rng: Random,
  anchor: MockAccount,
  pool: MockAccount[],
  parties: Map<number, MockAccount[]> | null,
  playlist: PlaylistDef,
  taken: Uint8Array,
): { blue: MockAccount[]; orange: MockAccount[]; playlist: PlaylistDef; party: Record<TeamId, number> } | null {
  taken[anchor.index] = 1;
  let candidates: MockAccount[] = [];
  for (let band = 0.55; band <= 4.5; band += 0.4) {
    candidates = pool.filter((a) => !taken[a.index] && Math.abs(a.person.skill - anchor.person.skill) <= band);
    if (candidates.length >= 9) break;
  }
  if (candidates.length < 9) return null;
  const eligible = new Uint8Array(taken.length);
  for (const a of candidates) eligible[a.index] = 1;
  const partyOf = (a: MockAccount, chance: number): MockAccount[] => {
    if (!parties || a.partyId === null || !rng.chance(chance)) return [];
    const mates = rng.shuffle((parties.get(a.partyId) ?? []).filter((m) => !taken[m.index] && eligible[m.index]));
    const picked = mates.slice(0, rng.int(1, 4));
    for (const m of picked) taken[m.index] = 1;
    return picked;
  };

  const blue = [anchor, ...partyOf(anchor, 0.6)];
  const party: Record<TeamId, number> = { blue: blue.length, orange: 1 };
  while (blue.length < 5) {
    const a = drawAccount(rng, candidates, taken);
    if (!a) return null;
    blue.push(a);
  }
  const orangeAnchor = drawAccount(rng, candidates, taken);
  if (!orangeAnchor) return null;
  const orange = [orangeAnchor, ...partyOf(orangeAnchor, 0.45)].slice(0, 5);
  party.orange = orange.length;
  while (orange.length < 5) {
    const a = drawAccount(rng, candidates, taken);
    if (!a) return null;
    orange.push(a);
  }
  return { blue, orange, playlist, party };
}

// ---------------------------------------------------------------------------------------------------------------
// Aggregates

const newAgg = (seasonId: SeasonId, fromMatches: boolean): SeasonAgg => ({
  seasonId,
  fromMatches,
  overall: emptyTally(),
  byPlaylist: new Map(),
  operators: { attack: new Map(), defense: new Map() },
  summary: null,
});

export function mergeOperators(into: OperatorTallies, add: readonly OperatorRounds[]): void {
  for (const op of add) {
    const target = into[op.side];
    const existing = target.get(op.operatorId);
    if (existing) addOperatorTally(existing, op);
    else target.set(op.operatorId, addOperatorTally(emptyOperatorTally(), op));
  }
}

function aggregateSeasons(
  accounts: MockAccount[],
  participations: Map<string, Participation[]>,
  standings: Standings,
): Map<string, Map<SeasonId, SeasonAgg>> {
  const out = new Map<string, Map<SeasonId, SeasonAgg>>();
  for (const account of accounts) {
    const aggs = new Map<SeasonId, SeasonAgg>();
    for (const { match, slot } of participations.get(account.key) ?? []) {
      const s = match.slots[slot];
      if (!s) continue;
      const seasonId = match.season.id;
      const agg = aggs.get(seasonId) ?? newAgg(seasonId, true);
      aggs.set(seasonId, agg);
      addTally(agg.overall, s.tally);
      const pl = agg.byPlaylist.get(match.playlist.id) ?? { tally: emptyTally(), standing: null };
      agg.byPlaylist.set(match.playlist.id, pl);
      addTally(pl.tally, s.tally);
      mergeOperators(agg.operators, s.operators);
    }
    for (const [key, state] of standings.get(account.key) ?? []) {
      const [seasonId, playlistId] = key.split('|') as [SeasonId, PlaylistId];
      const pl = aggs.get(seasonId)?.byPlaylist.get(playlistId);
      if (pl) pl.standing = { rank: state.placed ? state.current : null, peak: state.placed ? state.peak : null, topPosition: null };
    }
    out.set(account.key, aggs);
  }
  return out;
}

/**
 * Seasons that ended before the generated window: one consistent summary per season the account played
 * (overall = the sum of its playlists, peak >= final rank). Their matches are not listed: a period filter on such a
 * season finds no matches. summaryBreakdown() adds their per-map and per-operator counts.
 */
function addSummarySeasons(
  rng: Random,
  game: GameIndex,
  accounts: MockAccount[],
  aggs: Map<string, Map<SeasonId, SeasonAgg>>,
  windowStartMs: number,
): void {
  const past = game.config.seasons.filter((s) => s.endsAt !== null && toMs(s.endsAt) <= windowStartMs);
  for (const account of accounts) {
    const r = rng.fork(account.key);
    const own = aggs.get(account.key) ?? new Map<SeasonId, SeasonAgg>();
    aggs.set(account.key, own);
    const p = account.person;
    for (const season of past) {
      if (season.number < p.firstSeasonNumber || !r.chance(0.82)) continue;
      const active = game.config.playlists.filter((pl) => game.playlistActiveIn(pl.id, season.id));
      const shares: [PlaylistDef, number][] = active.flatMap((pl): [PlaylistDef, number][] => {
        const w = pl.kind === 'other' ? 8 : KIND_WEIGHTS[pl.kind];
        return w ? [[pl, w * r.float(0.6, 1.4)]] : [];
      });
      const totalShare = shares.reduce((s, [, w]) => s + w, 0);
      const total = Math.round(clamp(70 * p.activity * account.activityShare * r.float(0.5, 1.5), 8, 400));
      const agg = newAgg(season.id, false);
      for (const [playlist, share] of shares) {
        const m = Math.round((total * share) / totalShare);
        if (m === 0) continue;
        const wr = clamp(0.5 + 0.035 * p.skill + r.normal(0, 0.04), 0.25, 0.75);
        const wins = Math.round(m * wr);
        const avgRounds = playlist.kind === 'ranked' || playlist.kind === 'standard' ? 7.4 : 4.4;
        const rounds = Math.max(m, Math.round(m * avgRounds * r.float(0.95, 1.05)));
        const kpr = clamp(0.78 + 0.16 * p.skill + r.normal(0, 0.05), 0.35, 1.4);
        const dpr = clamp(0.66 - 0.07 * p.skill + r.normal(0, 0.03), 0.35, 0.95);
        const kills = Math.round(rounds * kpr);
        const tally: Tally = {
          matches: m,
          wins,
          losses: m - wins,
          kills,
          deaths: Math.round(rounds * dpr),
          assists: Math.round(kills * r.float(0.25, 0.4)),
          headshots: Math.round(kills * p.headshotRate),
          rounds,
          roundsWon: Math.round(rounds * (0.5 + (wr - 0.5) * 0.6)),
          damage: Math.round(rounds * (kpr * 118 + 45)),
        };
        // As in generated seasons: a points playlist always has a standing, with no rank until placements are done.
        let standing: RankedStanding | null = playlist.points === null ? null : { rank: null, peak: null, topPosition: null };
        if (playlist.points === 'ladder' && m >= PLACEMENT_MATCHES) {
          const system = game.rankSystemFor(season.id);
          const floor = system?.ranks[0]?.minPoints ?? 0;
          const final = Math.max(floor, Math.round(targetPoints(account) + r.normal(0, 180)));
          const peak = final + r.int(0, 280);
          const point = (points: number): RankPoint => ({ points, rankId: system ? (game.rankForPoints(system.id, points)?.id ?? null) : null });
          standing = { rank: point(final), peak: point(peak), topPosition: null };
        }
        agg.byPlaylist.set(playlist.id, { tally, standing });
        addTally(agg.overall, tally);
      }
      if (agg.overall.matches === 0) continue;
      own.set(season.id, agg);
    }
  }
}

/**
 * Fills in the summary-only seasons of one account (`rng`: that account's fork of the history stream): each playlist
 * line broken down per map and per operator, both summing to the line, with only operators released by that season
 * and only maps played in that kind of playlist. The season's operators are the sum of its lines, so its best
 * attacker and defender are the top rows of its Operators list.
 */
function summaryBreakdown(game: GameIndex): (rng: Random, account: MockAccount, aggs: Map<SeasonId, SeasonAgg>) => void {
  const mapsFor = mapPools(game);
  const unreleasedIn = unreleasedOperators(game);
  const slots: OperatorSlot[] = (['attack', 'defense'] as const).flatMap((side) =>
    game.operatorsBySide(side).map((o): OperatorSlot => ({ side, operatorId: o.id })),
  );
  return (rng, account, aggs) => {
    for (const agg of aggs.values()) {
      const season = game.season(agg.seasonId);
      if (agg.fromMatches || agg.summary || !season) continue;
      const b = rng.fork(`${season.id}/breakdown`);
      const weights = seasonOperatorWeights(b, account.person, unreleasedIn(season));
      const summary = new Map<PlaylistId, SummaryLine>();
      for (const [playlistId, line] of agg.byPlaylist) {
        const playlist = game.playlist(playlistId);
        if (!playlist) continue;
        const maps = mapsFor(season, playlist);
        const mapWeights = maps.map(() => b.float(0.4, 1.6));
        const operators = splitOverOperators(b, line.tally, slots, weights);
        summary.set(playlistId, { maps: splitOverMaps(b, line.tally, maps.map((m) => m.id), mapWeights), operators });
        mergeOperatorTallies(agg.operators, operators);
      }
      agg.summary = summary;
    }
  };
}

/**
 * One person's operator pick weights for one summary season, by position in the slots (attackers, then defenders,
 * each in GameIndex.operatorsBySide order): their usual weights, varied a little per season, and 0 for an operator
 * not released yet that season. Each side sums to 1, so rounds split about evenly between the sides.
 */
function seasonOperatorWeights(rng: Random, person: MockPerson, unreleased: Record<Side, Uint8Array>): number[] {
  const out: number[] = [];
  for (const side of ['attack', 'defense'] as const) {
    const flags = unreleased[side];
    const weights = person.operatorWeights[side].weights.map((w, i) => (flags[i] ? 0 : w * rng.float(0.6, 1.4)));
    const sum = weights.reduce((s, w) => s + w, 0);
    for (const w of weights) out.push(sum > 0 ? w / sum : 0);
  }
  return out;
}

/** Legend Division "Position": the place on the player's own region's points board, that season. */
function assignLegendPositions(game: GameIndex, accounts: MockAccount[], aggs: Map<string, Map<SeasonId, SeasonAgg>>): void {
  const regional = game.config.playlists.filter((p) => p.leaderboard !== null && p.leaderboard.regionIds.length > 0);
  for (const playlist of regional) {
    for (const season of game.config.seasons) {
      const groups = new Map<string, { account: MockAccount; standing: RankedStanding; points: number }[]>();
      for (const account of accounts) {
        const standing = aggs.get(account.key)?.get(season.id)?.byPlaylist.get(playlist.id)?.standing;
        if (!standing?.rank || account.legendRegionId === null) continue;
        const list = groups.get(account.legendRegionId) ?? [];
        list.push({ account, standing, points: standing.rank.points });
        groups.set(account.legendRegionId, list);
      }
      for (const list of groups.values()) {
        list.sort((a, b) => b.points - a.points || a.account.ref.name.localeCompare(b.account.ref.name) || a.account.key.localeCompare(b.account.key));
        list.forEach((entry, i) => {
          entry.standing.topPosition = i + 1;
        });
      }
    }
  }
}

/**
 * The operator with the most rounds on that side (design question 15); ties go to the alphabetically first id, in
 * the provider's getOperators order, so the best attacker is always the top attacker row there.
 */
function bestOn(side: Side, operators: OperatorTallies): OperatorStats | null {
  let best: [OperatorId, OperatorTally] | null = null;
  for (const [id, tally] of operators[side]) {
    if (!best || tally.rounds > best[1].rounds || (tally.rounds === best[1].rounds && id.localeCompare(best[0]) < 0)) best = [id, tally];
  }
  return best ? toOperatorStats(best[0], best[1]) : null;
}

export function toSeasonRecord(game: GameIndex, family: PlatformFamily, agg: SeasonAgg): SeasonRecord {
  return {
    seasonId: agg.seasonId,
    platformFamily: family,
    overall: toMatchStats(agg.overall),
    byPlaylist: game.config.playlists.flatMap((playlist) => {
      const pl = agg.byPlaylist.get(playlist.id);
      return pl ? [{ ...toMatchStats(pl.tally), playlistId: playlist.id, standing: pl.standing }] : [];
    }),
    bestAttacker: bestOn('attack', agg.operators),
    bestDefender: bestOn('defense', agg.operators),
  };
}

/** A season with no matches: zero counts (the source knows there were none), ratios unknown. */
export function emptySeasonRecord(seasonId: SeasonId, account: MockAccount): SeasonRecord {
  return {
    seasonId,
    platformFamily: familyOf(account.ref.platform),
    overall: toMatchStats(emptyTally()),
    byPlaylist: [],
    bestAttacker: null,
    bestDefender: null,
  };
}
