import type { GameIndex } from '@shared/game-config';
import type { PlaylistDef, PlaylistKind } from '@shared/types/game-config';
import type { MatchRound, RoundOutcome } from '@shared/types/match';
import type { OperatorId, Side, TeamId } from '@shared/types/primitives';
import type { Random } from '@shared/util/random';
import { emptyTally, type Tally } from './tally';
import type { CompactRounds, MockAccount, OperatorPool, OperatorRounds } from './world';

/**
 * Plays one 5v5 match round by round. Everything adds up by construction: each death in a round is credited
 * to exactly one killer on the other team, so a team's kills always equal the other team's deaths; a player
 * dies at most once per round; operators are picked per round from the side the player is on, and no two
 * teammates pick the same operator in a round.
 *
 * This runs ~3,000 times per world, so the round loop reuses typed arrays and the rounds are kept compact
 * (expandRounds() turns them into MatchRound objects when a match is opened).
 */

/**
 * How a playlist is played. Overtime and the deciding round come from the playlist's config (the rules the UI
 * labels); rounds to win in regulation, side swaps and the objective stay internal to the simulator, by kind.
 */
interface MatchFormat {
  /** Rounds to win in regulation. */
  target: number;
  /** Sides swap after this many rounds in regulation; afterwards they alternate every round. */
  swapEvery: number;
  /** At `at`-`at`, the target becomes `target` (Ranked: 3-3 -> first to 5). */
  overtime: { at: number; target: number } | null;
  objective: 'bomb' | 'mixed' | 'elimination';
}

const KIND_FORMAT: Partial<Record<PlaylistKind, Pick<MatchFormat, 'target' | 'swapEvery' | 'objective'>>> = {
  ranked: { target: 4, swapEvery: 3, objective: 'bomb' },
  legend: { target: 4, swapEvery: 3, objective: 'bomb' },
  standard: { target: 4, swapEvery: 3, objective: 'bomb' },
  quick: { target: 3, swapEvery: 2, objective: 'mixed' },
};
const OTHER_FORMAT: Pick<MatchFormat, 'target' | 'swapEvery' | 'objective'> = { target: 3, swapEvery: 1, objective: 'elimination' };

export function formatFor(playlist: Pick<PlaylistDef, 'kind' | 'overtime' | 'decidingRoundAt'>): MatchFormat {
  const base = KIND_FORMAT[playlist.kind] ?? OTHER_FORMAT;
  // A tie at `at`-`at` (overtime or one deciding round) means regulation is first to at + 1.
  const tieAt = playlist.overtime?.at ?? playlist.decidingRoundAt;
  return {
    target: tieAt === null ? base.target : tieAt + 1,
    swapEvery: base.swapEvery,
    overtime: playlist.overtime ? { at: playlist.overtime.at, target: playlist.overtime.roundsToWin } : null,
    objective: base.objective,
  };
}

/**
 * The fewest and most rounds one match of the playlist can have, by the format simulateMatch() plays: a sweep to
 * the regulation target, and every round to the last one in overtime (Ranked 4-9, Standard 4-7, Quick Match 3-5).
 * Summary-only seasons keep their round counts inside these bounds too. `min` is also the fewest rounds the winner
 * of a match takes, so a won match has at least `min` rounds won and a lost one at least `min` rounds lost.
 */
export function roundsPerMatch(playlist: Pick<PlaylistDef, 'kind' | 'overtime' | 'decidingRoundAt'>): { min: number; max: number } {
  const format = formatFor(playlist);
  const decider = Math.max(format.target, format.overtime?.target ?? format.target);
  return { min: format.target, max: Math.min(MAX_ROUNDS, 2 * decider - 1) };
}

type Objective = 'bomb' | 'secure' | 'hostage' | 'elimination';
type Weighted<T> = readonly (readonly [T, number])[];

export const OUTCOME_CODES: readonly RoundOutcome[] = [
  'team_eliminated', 'bomb_detonated', 'bomb_defused', 'objective_secured', 'objective_protected', 'time_expired',
  'hostage_extracted', 'hostage_killed',
];
const code = (outcome: RoundOutcome): number => OUTCOME_CODES.indexOf(outcome);
const OBJECTIVES: Weighted<Objective> = [['bomb', 6], ['secure', 2], ['hostage', 2]];
const OUTCOMES: Record<Objective, Record<Side, Weighted<number>>> = {
  bomb: {
    attack: [[code('team_eliminated'), 55], [code('bomb_detonated'), 45]],
    defense: [[code('team_eliminated'), 50], [code('time_expired'), 25], [code('bomb_defused'), 25]],
  },
  secure: {
    attack: [[code('team_eliminated'), 55], [code('objective_secured'), 45]],
    defense: [[code('team_eliminated'), 50], [code('time_expired'), 20], [code('objective_protected'), 30]],
  },
  hostage: {
    attack: [[code('team_eliminated'), 55], [code('hostage_extracted'), 45]],
    defense: [[code('team_eliminated'), 58], [code('time_expired'), 36], [code('hostage_killed'), 6]],
  },
  elimination: { attack: [[code('team_eliminated'), 1]], defense: [[code('team_eliminated'), 1]] },
};
const ELIMINATED = code('team_eliminated');
const TIME_EXPIRED = code('time_expired');
/** Deaths on the losing team when it was not wiped out, and on the winning team. */
const LOSER_DEATHS: Weighted<number> = [[0, 1], [1, 2], [2, 4], [3, 4], [4, 3]];
const WINNER_DEATHS: Weighted<number> = [[0, 3], [1, 4], [2, 4], [3, 2], [4, 1]];
const MAX_ROUNDS = 15;

export interface SimPlayer {
  account: MockAccount;
  slot: number;
  team: TeamId;
}

export interface SimPlayerResult {
  tally: Tally;
  /** Per operator and side, in first-picked order. */
  operators: OperatorRounds[];
  score: number;
}

export interface SimResult {
  rounds: CompactRounds;
  score: Record<TeamId, number>;
  players: SimPlayerResult[]; // by slot
  durationSec: number;
}

const other = (team: TeamId): TeamId => (team === 'blue' ? 'orange' : 'blue');
const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

/** A weighted pick (by position in the side's list) among operators not marked as taken; -1 when all are. */
function pickOperator(rng: Random, pool: OperatorPool, taken: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < pool.weights.length; i += 1) if (!taken[i]) total += pool.weights[i] ?? 0;
  if (total <= 0) return -1;
  let roll = rng.next() * total;
  let last = -1;
  for (let i = 0; i < pool.weights.length; i += 1) {
    if (taken[i]) continue;
    last = i;
    roll -= pool.weights[i] ?? 0;
    if (roll < 0) return i;
  }
  return last;
}

/** A weighted pick among `slots` (weights by slot), skipping slots flagged in `skip`; -1 when none is left. */
function pickSlot(rng: Random, slots: readonly number[], weight: Float64Array, skip: Uint8Array | null): number {
  let total = 0;
  for (const s of slots) if (!skip?.[s]) total += weight[s] ?? 0;
  if (total <= 0) return -1;
  let roll = rng.next() * total;
  let last = -1;
  for (const s of slots) {
    if (skip?.[s]) continue;
    last = s;
    roll -= weight[s] ?? 0;
    if (roll < 0) return s;
  }
  return last;
}

/**
 * `unreleased` flags, per side and by position in GameIndex.operatorsBySide, the operators that did not exist yet in
 * the match's season: they are never picked.
 */
export function simulateMatch(
  rng: Random,
  game: GameIndex,
  playlist: PlaylistDef,
  players: readonly SimPlayer[],
  partySize: Record<TeamId, number>,
  unreleased: Readonly<Record<Side, Uint8Array>>,
): SimResult {
  const format = formatFor(playlist);
  const objective: Objective = format.objective === 'mixed' ? rng.weighted(OBJECTIVES) : format.objective;
  const n = players.length;
  const slotsOf: Record<TeamId, number[]> = { blue: [], orange: [] };
  for (const p of players) slotsOf[p.team].push(p.slot);

  // Form on the day: the same player has good and bad matches. Weights are computed once per match.
  const form = new Float64Array(n);
  const killWeight = new Float64Array(n);
  const deathWeight = new Float64Array(n);
  for (const p of players) {
    const f = p.account.person.skill + rng.normal(0, 0.35);
    form[p.slot] = f;
    killWeight[p.slot] = Math.exp(0.6 * f);
    deathWeight[p.slot] = Math.exp(-0.4 * f);
  }
  const strength = (team: TeamId): number => {
    const slots = slotsOf[team];
    let sum = 0;
    for (const s of slots) sum += form[s] ?? 0;
    return sum / Math.max(1, slots.length) + 0.04 * Math.max(0, partySize[team] - 1);
  };
  const edge = strength('blue') - strength('orange');

  const results: SimPlayerResult[] = players.map(() => ({ tally: { ...emptyTally(), matches: 1 }, operators: [], score: 0 }));
  const lastPick = new Int32Array(n).fill(-1);
  const lastSide: (Side | null)[] = players.map(() => null);
  const takenOps: Record<Side, Uint8Array> = {
    attack: new Uint8Array(game.operatorsBySide('attack').length),
    defense: new Uint8Array(game.operatorsBySide('defense').length),
  };
  const kills = new Int32Array(n);
  const assists = new Int32Array(n);
  const headshots = new Int32Array(n);
  const dead = new Uint8Array(n);
  const pickOrder: Record<TeamId, number[]> = { blue: [...slotsOf.blue], orange: [...slotsOf.orange] };

  const compact: CompactRounds = {
    count: 0,
    winnerOrange: new Uint8Array(MAX_ROUNDS),
    attackersOrange: new Uint8Array(MAX_ROUNDS),
    outcome: new Uint8Array(MAX_ROUNDS),
    picks: new Int16Array(MAX_ROUNDS * n).fill(-1),
    slots: n,
  };

  const firstAttackers: TeamId = rng.chance(0.5) ? 'blue' : 'orange';
  const regulation = 2 * format.swapEvery;
  const attackersIn = (round: number): TeamId => {
    const flip = round <= regulation ? Math.floor((round - 1) / format.swapEvery) % 2 === 1 : (round - regulation) % 2 === 0;
    return flip ? other(firstAttackers) : firstAttackers;
  };

  const score: Record<TeamId, number> = { blue: 0, orange: 0 };
  let target = format.target;
  let durationSec = rng.int(40, 90); // ban phase, loading

  const credit = (victims: number, losers: TeamId, killers: TeamId): void => {
    const killerSlots = slotsOf[killers];
    for (let v = 0; v < victims; v += 1) {
      const victim = pickSlot(rng, slotsOf[losers], deathWeight, dead);
      if (victim < 0) return;
      dead[victim] = 1;
      const killer = pickSlot(rng, killerSlots, killWeight, null);
      if (killer < 0) return;
      kills[killer] = (kills[killer] ?? 0) + 1;
      const shooter = players[killer];
      if (shooter && rng.chance(shooter.account.person.headshotRate)) headshots[killer] = (headshots[killer] ?? 0) + 1;
      if (killerSlots.length > 1 && rng.chance(0.32)) {
        let helper = killerSlots[rng.int(0, killerSlots.length - 2)] ?? killer;
        if (helper === killer) helper = killerSlots[killerSlots.length - 1] ?? killer;
        assists[helper] = (assists[helper] ?? 0) + 1;
      }
    }
  };

  while (score.blue < target && score.orange < target && compact.count < MAX_ROUNDS) {
    const round = compact.count;
    const attackers = attackersIn(round + 1);
    const defenders = other(attackers);
    const sideOf = (team: TeamId): Side => (team === attackers ? 'attack' : 'defense');
    const pickBase = round * n;

    // Operator picks: per player, from their side's pool, unique within the team this round, in a random order.
    for (const team of ['blue', 'orange'] as const) {
      const side = sideOf(team);
      const taken = takenOps[side];
      taken.set(unreleased[side]); // an operator not released yet counts as taken
      const slots = pickOrder[team];
      for (let i = slots.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        const tmp = slots[i] as number;
        slots[i] = slots[j] as number;
        slots[j] = tmp;
      }
      for (const s of slots) {
        const p = players[s] as SimPlayer;
        const previous = lastPick[s] ?? -1;
        let pick =
          previous >= 0 && lastSide[s] === side && !taken[previous] && rng.chance(0.4)
            ? previous
            : pickOperator(rng, p.account.person.operatorWeights[side], taken);
        if (pick < 0) pick = Math.max(0, taken.indexOf(0)); // never: every released operator has a weight
        taken[pick] = 1;
        compact.picks[pickBase + s] = pick;
        lastPick[s] = pick;
        lastSide[s] = side;
      }
    }

    // Who wins the round: team strength, plus a small defender's advantage.
    const blueWins = rng.chance(logistic(1.6 * edge + (defenders === 'blue' ? 0.12 : -0.12)));
    const winner: TeamId = blueWins ? 'blue' : 'orange';
    const loser = other(winner);
    const outcome = rng.weighted(OUTCOMES[objective][sideOf(winner)]);
    const loserDeaths = outcome === ELIMINATED ? slotsOf[loser].length : rng.weighted(LOSER_DEATHS);
    const winnerDeaths = Math.min(rng.weighted(WINNER_DEATHS), slotsOf[winner].length - 1);

    kills.fill(0);
    assists.fill(0);
    headshots.fill(0);
    dead.fill(0);
    credit(loserDeaths, loser, winner);
    credit(winnerDeaths, winner, loser);

    for (const p of players) {
      const s = p.slot;
      const r = results[s] as SimPlayerResult;
      const side = sideOf(p.team);
      const k = kills[s] ?? 0;
      const d = dead[s] ?? 0;
      const a = assists[s] ?? 0;
      const h = headshots[s] ?? 0;
      const won = p.team === winner ? 1 : 0;
      const damage = Math.round(k * rng.int(100, 140) + a * rng.int(30, 80) + rng.int(0, 160) * (d ? 0.6 : 1));
      r.tally.kills += k;
      r.tally.deaths += d;
      r.tally.assists += a;
      r.tally.headshots += h;
      r.tally.rounds += 1;
      r.tally.roundsWon += won;
      r.tally.damage += damage;
      r.score += k * 100 + a * 50 + won * 50 + rng.int(0, 6) * 10;
      const operatorId = p.account.person.operatorWeights[side].ids[compact.picks[pickBase + s] ?? -1];
      if (operatorId) {
        let op = r.operators.find((o) => o.operatorId === operatorId && o.side === side);
        if (!op) {
          op = { operatorId, side, rounds: 0, roundsWon: 0, kills: 0, deaths: 0, assists: 0, headshots: 0 };
          r.operators.push(op);
        }
        op.rounds += 1;
        op.roundsWon += won;
        op.kills += k;
        op.deaths += d;
        op.assists += a;
        op.headshots += h;
      }
    }

    compact.winnerOrange[round] = winner === 'orange' ? 1 : 0;
    compact.attackersOrange[round] = attackers === 'orange' ? 1 : 0;
    compact.outcome[round] = outcome;
    compact.count += 1;
    score[winner] += 1;
    durationSec += rng.int(45, 60) + (outcome === TIME_EXPIRED ? 180 : rng.int(70, 175)) + rng.int(10, 20);
    if (format.overtime && score.blue === format.overtime.at && score.orange === format.overtime.at) target = format.overtime.target;
  }

  const winner: TeamId = score.blue > score.orange ? 'blue' : 'orange';
  for (const p of players) {
    const r = results[p.slot] as SimPlayerResult;
    if (p.team === winner) r.tally.wins = 1;
    else r.tally.losses = 1;
  }
  return { rounds: compact, score, players: results, durationSec };
}

/** Distinct operators of one player in one match, most rounds first; a tie keeps first-picked order. */
export function operatorIdsOf(operators: readonly OperatorRounds[]): OperatorId[] {
  const rounds = new Map<OperatorId, number>();
  for (const op of operators) rounds.set(op.operatorId, (rounds.get(op.operatorId) ?? 0) + op.rounds);
  return [...rounds.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** The public round timeline of a compact match. */
export function expandRounds(game: GameIndex, rounds: CompactRounds): MatchRound[] {
  const pools: Record<Side, readonly OperatorId[]> = {
    attack: game.operatorsBySide('attack').map((o) => o.id),
    defense: game.operatorsBySide('defense').map((o) => o.id),
  };
  const out: MatchRound[] = [];
  for (let r = 0; r < rounds.count; r += 1) {
    const attackers: TeamId = rounds.attackersOrange[r] ? 'orange' : 'blue';
    const picks = [];
    for (let s = 0; s < rounds.slots; s += 1) {
      const team: TeamId = s < rounds.slots / 2 ? 'blue' : 'orange';
      const side: Side = team === attackers ? 'attack' : 'defense';
      const position = rounds.picks[r * rounds.slots + s] ?? -1;
      picks.push({ slot: s, operatorId: pools[side][position] ?? null });
    }
    out.push({
      number: r + 1,
      winner: rounds.winnerOrange[r] ? 'orange' : 'blue',
      attackers,
      outcome: OUTCOME_CODES[rounds.outcome[r] ?? 0] ?? null,
      picks,
    });
  }
  return out;
}
