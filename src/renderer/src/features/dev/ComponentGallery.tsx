import { RefreshCw, Star } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getTheme } from '@shared/theme';
import type { LeaderboardEntry, LeaderboardQuery } from '@shared/types/leaderboard';
import type { MatchPeriod } from '@shared/types/match';
import type { MatchId, OperatorId, PlaylistId, RankId } from '@shared/types/primitives';
import type { PlayerKey } from '@shared/types/player';
import type { OperatorStats, SeasonRecord } from '@shared/types/stats';
import { kd, roundWinRate, winRate } from '@shared/util/stats';
import { useGame } from '../../app/GameConfigProvider';
import { parsePlayerParams, playerPath } from '../../app/routes';
import { PointsLineChart, pointsSeries } from '../../charts';
import { Avatar, MapBadge, OperatorBadge, PlatformLabel, RankBadge } from '../../components';
import { formatKd, formatNumber, formatRatio, updatedAgo } from '../../lib/format';
import { useNow } from '../../lib/useNow';
import {
  matchHistoryItems, useFavoriteToggle, useLeaderboard, useMatch, useMatches, useOperators, useProfile, useRankDistribution,
  useSeasons, useUpdatePlayer,
} from '../../queries';
import { ThemeScope } from '../../theme/ThemeScope';
import {
  Badge, Button, ChipGroup, DataTable, Delta, SectionCard, SegmentedControl, ShowMore, Skeleton, StatTile, type Column,
  type QueryLike,
} from '../../ui';

/**
 * Development-only gallery (route /dev/components, dev server and browser build only, linked from nowhere): every
 * shared phase 2 component rendered on real mock data, in several themes side by side, so badges, tables and charts
 * can be checked by eye and by screenshot (scripts/screenshot.mjs). `?themes=a,b` picks the themes, `?player=pc:<id>`
 * the player.
 */

const DEFAULT_THEMES = ['graphite', 'daylight', 'neon-district'];

const STILL_LOADING: QueryLike<never> = {
  data: undefined,
  error: null,
  status: 'pending',
  fetchStatus: 'fetching',
  isFetching: true,
  refetch: () => undefined,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-28 shrink-0 text-xs text-text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function RankBadges() {
  const game = useGame();
  const plain = game.playlistsWithPoints().find((p) => p.points === 'plain') ?? null;
  return (
    <Section title="Rank badges (every division in the config)">
      {game.config.rankSystems.map((system) => (
        <Row key={system.id} label={system.name}>
          {system.ranks.map((rank) => (
            <RankBadge key={rank.id} rankId={rank.id} points={rank.minPoints} />
          ))}
        </Row>
      ))}
      <Row label="Sizes">
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <RankBadge key={size} size={size} rank={{ rankId: game.ranksOf(game.config.rankSystems.at(-1)?.id ?? '')[12]?.id ?? null, points: 2350 }} />
        ))}
        <RankBadge size="lg" withName rank={{ rankId: game.ranksOf(game.config.rankSystems.at(-1)?.id ?? '').at(-1)?.id ?? null, points: 5012 }} />
      </Row>
      <Row label="States">
        <RankBadge rank={null} withName />
        <RankBadge rankId={'r0.not-in-config' as RankId} withName />
        <RankBadge rank={{ rankId: null, points: 1234 }} unit={plain ? 'points' : 'RP'} withName />
        <RankBadge rank={{ rankId: null, points: 2481 }} size="sm" />
      </Row>
    </Section>
  );
}

function GameBadges() {
  const game = useGame();
  const attackers = game.config.operators.filter((o) => o.side === 'attack');
  const defenders = game.config.operators.filter((o) => o.side === 'defense');
  const sample = [attackers[0], defenders[0]].filter((o) => o !== undefined);
  return (
    <Section title="Operator and map badges (whole config)">
      <Row label={`Attack (${attackers.length})`}>
        {attackers.map((o) => (
          <OperatorBadge key={o.id} operatorId={o.id} size="sm" />
        ))}
      </Row>
      <Row label={`Defense (${defenders.length})`}>
        {defenders.map((o) => (
          <OperatorBadge key={o.id} operatorId={o.id} size="sm" />
        ))}
      </Row>
      <Row label="Sizes, names">
        {sample.map((o) => (
          <span key={o.id} className="flex items-center gap-2">
            <OperatorBadge operatorId={o.id} size="sm" />
            <OperatorBadge operatorId={o.id} size="md" />
            <OperatorBadge operatorId={o.id} size="lg" withName />
          </span>
        ))}
        <OperatorBadge operatorId={'not-an-operator' as OperatorId} withName />
        <OperatorBadge operatorId={null} />
      </Row>
      <Row label={`Maps (${game.config.maps.length})`}>
        {game.config.maps.map((m) => (
          <MapBadge key={m.id} mapId={m.id} size="sm" />
        ))}
      </Row>
      <Row label="Sizes, names">
        {game.config.maps.slice(0, 2).map((m) => (
          <span key={m.id} className="flex items-center gap-2">
            <MapBadge mapId={m.id} size="sm" />
            <MapBadge mapId={m.id} size="lg" withName />
          </span>
        ))}
        <MapBadge mapId={null} withName />
      </Row>
    </Section>
  );
}

function Players({ entries }: { entries: readonly LeaderboardEntry[] | undefined }) {
  const first = entries?.[0]?.player;
  return (
    <Section title="Avatars and platforms (real accounts)">
      {entries === undefined ? (
        <Skeleton className="h-8 w-80" />
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {entries.slice(0, 8).map((entry) => (
            <span key={entry.player.id} className="flex items-center gap-2">
              <Avatar player={entry.player} size="md" />
              <span className="flex flex-col">
                <span className="text-[13px] text-text">{entry.player.name}</span>
                <PlatformLabel platform={entry.player.platform} variant={entry.position % 2 === 0 ? 'short' : 'full'} />
              </span>
            </span>
          ))}
        </div>
      )}
      {first && (
        <Row label="Sizes">
          {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <Avatar key={size} player={first} size={size} label={first.name} />
          ))}
          <PlatformLabel platform="pc" variant="icon" />
          <PlatformLabel platform="psn" variant="icon" />
          <PlatformLabel platform="xbl" variant="icon" />
        </Row>
      )}
    </Section>
  );
}

function SeasonTiles({ current, previous, loading }: { current: SeasonRecord | null; previous: SeasonRecord | null; loading: boolean }) {
  const o = current?.overall;
  const p = previous?.overall;
  const wr = o ? winRate(o.wins, o.losses) : null;
  const lastWr = p ? winRate(p.wins, p.losses) : null;
  const kdNow = o ? kd(o.kills, o.deaths) : null;
  const kdLast = p ? kd(p.kills, p.deaths) : null;
  const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
  return (
    <Section title="Stat tiles and deltas (current season vs the previous one)">
      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="Matches played"
          loading={loading}
          value={formatNumber(o?.matches)}
          sub={`Last season ${formatNumber(p?.matches)}`}
          delta={{ value: diff(o?.matches ?? null, p?.matches ?? null) }}
        />
        <StatTile
          label="Win rate"
          loading={loading}
          value={formatRatio(wr)}
          sub={`Last season ${formatRatio(lastWr)}`}
          delta={{ value: diff(wr, lastWr), format: (n) => `${formatNumber(n * 100, 1)} pts` }}
        />
        <StatTile
          label="K/D"
          loading={loading}
          value={formatKd(kdNow)}
          sub={`Last season ${formatKd(kdLast)}`}
          delta={{ value: diff(kdNow, kdLast), format: (n) => formatNumber(n, 2) }}
        />
        <StatTile label="Damage per round" loading={loading} value={formatNumber(o?.damagePerRound ?? null)} sub="Unknown values show a dash" />
      </div>
      <Row label="Delta">
        <Delta value={24} unit="RP" />
        <Delta value={-18} unit="RP" />
        <Delta value={0} />
        <Delta value={null} />
        <Delta value={3} good="down" />
        <Delta value={-0.042} format={(n) => formatRatio(n)} />
      </Row>
    </Section>
  );
}

type PeriodId = '7' | '30' | '90' | 'season';
type ScopeId = 'global' | 'pc' | 'console';

function Controls() {
  const game = useGame();
  const [playlists, setPlaylists] = useState<PlaylistId[] | 'all'>('all');
  const [period, setPeriod] = useState<PeriodId>('30');
  const [scope, setScope] = useState<ScopeId>('global');
  const active = game.config.playlists.filter((p) => game.playlistActiveIn(p.id, game.currentSeason().id));
  return (
    <Section title="Filters">
      <Row label="Chip group">
        <ChipGroup label="Playlists" options={active.map((p) => ({ id: p.id, label: p.name }))} value={playlists} onChange={setPlaylists} />
      </Row>
      <Row label="Segmented">
        <SegmentedControl
          label="Period"
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { id: '7', label: '7 days' },
            { id: '30', label: '30 days' },
            { id: '90', label: '90 days' },
            { id: 'season', label: 'Season' },
          ]}
        />
        <SegmentedControl
          label="Leaderboard"
          value={scope}
          onChange={setScope}
          options={[
            { id: 'global', label: 'Global' },
            { id: 'pc', label: 'PC' },
            { id: 'console', label: 'Console' },
          ]}
        />
        <span className="text-xs text-text-muted">
          {playlists === 'all' ? 'All playlists' : `${playlists.length} playlist(s)`}, {period}, {scope}
        </span>
      </Row>
    </Section>
  );
}

function BoardTable({ entries, busy }: { entries: readonly LeaderboardEntry[] | undefined; busy: boolean }) {
  const navigate = useNavigate();
  const columns: Column<LeaderboardEntry>[] = [
    { id: 'pos', header: '#', cell: (e) => e.position, sortValue: (e) => e.position, firstDirection: 'asc', numeric: true, width: '3.5rem' },
    {
      id: 'player',
      header: 'Player',
      cell: (e) => (
        <span className="flex items-center gap-2">
          <Avatar player={e.player} size="sm" />
          <span className="truncate text-text">{e.player.name}</span>
          <PlatformLabel platform={e.player.platform} variant="icon" />
        </span>
      ),
      sortValue: (e) => e.player.name.toLowerCase(),
      firstDirection: 'asc',
    },
    { id: 'level', header: 'Level', cell: (e) => formatNumber(e.level), sortValue: (e) => e.level, numeric: true },
    { id: 'wr', header: 'WR', cell: (e) => formatRatio(e.winRate), sortValue: (e) => e.winRate, numeric: true, highlight: true },
    { id: 'kd', header: 'K/D', cell: (e) => formatKd(e.kd), sortValue: (e) => e.kd, numeric: true },
    { id: 'rank', header: 'Rank', cell: (e) => <RankBadge rank={e.rank} size="sm" />, sortValue: (e) => e.rank?.points ?? null, align: 'center' },
  ];
  return (
    <Section title="Data table (win-rate board, current season: sortable, sticky header, rows open the profile)">
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="rounded-card border border-border bg-surface">
          <DataTable
            label="Win-rate leaderboard"
            columns={columns}
            rows={entries}
            rowKey={(e) => `${e.player.platform}:${e.player.id}`}
            stickyHeader
            maxHeight="320px"
            busy={busy}
            isRowCurrent={(e) => e.position === 1}
            onRowClick={(e) => void navigate(playerPath(e.player))}
          />
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-border bg-surface">
            <DataTable label="Loading example" columns={columns.slice(0, 3)} rows={undefined} skeletonRows={3} rowKey={(e) => e.player.id} />
          </div>
          <div className="rounded-card border border-border bg-surface">
            <DataTable label="Empty example" columns={columns.slice(0, 3)} rows={[]} rowKey={(e) => e.player.id} />
          </div>
        </div>
      </div>
    </Section>
  );
}

function OperatorList({ operators }: { operators: readonly OperatorStats[] | undefined }) {
  return (
    <Section title="Show more (the player's operators this season, most rounds first)">
      {operators === undefined ? (
        <Skeleton className="h-24 w-96" />
      ) : (
        <ShowMore
          items={[...operators].sort((a, b) => b.rounds - a.rounds)}
          initial={4}
          noun="operators"
          label="Operators"
          itemKey={(o) => o.operatorId}
          listClassName="w-[30rem] divide-y divide-border rounded-card border border-border bg-surface"
        >
          {(o) => (
            <div className="flex h-9 items-center gap-3 px-3">
              <OperatorBadge operatorId={o.operatorId} withName className="flex-1" />
              <span className="text-xs text-text-muted tabular">{formatNumber(o.rounds)} rounds</span>
              <span className="w-24 text-right text-xs whitespace-nowrap tabular">{formatRatio(roundWinRate(o.roundsWon, o.rounds))} round WR</span>
              <span className="w-16 text-right text-xs whitespace-nowrap tabular">{formatKd(kd(o.kills, o.deaths))} K/D</span>
            </div>
          )}
        </ShowMore>
      )}
    </Section>
  );
}

export function ComponentGallery() {
  const game = useGame();
  const now = useNow();
  const [search] = useSearchParams();
  const themes = (search.get('themes')?.split(',').filter(Boolean) ?? DEFAULT_THEMES).map((id) => getTheme(id));
  const season = game.currentSeason();
  const ladder = game.playlistsWithPoints().find((p) => p.points === 'ladder') ?? null;
  const plain = game.playlistsWithPoints().find((p) => p.points === 'plain') ?? null;

  const boardQuery: LeaderboardQuery | null = ladder
    ? { playlistId: ladder.id, metric: 'winRate', scope: 'global', seasonId: 'current', regionId: 'all', page: 1, pageSize: 25 }
    : null;
  const board = useLeaderboard(boardQuery);
  const entries = board.data?.data.entries;

  // The win-rate board lists only players with at least 20 ranked matches this season: the middle one has a
  // typical ranked season to chart. ?player=pc:<id> picks another.
  const override = useMemo(() => {
    const raw = search.get('player') ?? '';
    const colon = raw.indexOf(':');
    return colon < 0 ? null : parsePlayerParams({ platform: raw.slice(0, colon), id: raw.slice(colon + 1) });
  }, [search]);
  const middle = entries?.[Math.floor(entries.length / 2)]?.player ?? null;
  const player: PlayerKey | null = override ?? (middle ? { platform: middle.platform, id: middle.id } : null);

  const profile = useProfile(player);
  const seasons = useSeasons(player);
  const operators = useOperators(player ? { player, seasonId: season.id, playlistId: 'all', mapId: 'all' } : null);
  const period: MatchPeriod = { kind: 'season', seasonId: season.id };
  const matches = useMatches(player && ladder ? { player, playlistIds: [ladder.id], mapId: 'all', period, limit: 100 } : null);
  const missingMatch = useMatch('m-gallery-does-not-exist' as MatchId);
  const plainDistribution = useRankDistribution(plain ? { playlistId: plain.id, scope: 'global', seasonId: 'current' } : null);
  const { update, isUpdating } = useUpdatePlayer(player);
  const star = useFavoriteToggle(profile.data?.data.player ?? null);

  const series = useMemo(() => pointsSeries(matchHistoryItems(matches.data)), [matches.data]);
  const ranks = game.rankSystemFor(season.id)?.ranks ?? null;
  const seasonList = seasons.data?.data ?? [];
  const current = seasonList.find((s) => s.seasonId === season.id) ?? profile.data?.data.currentSeason ?? null;
  const previousId = game.previousSeason(season.id)?.id;
  const previous = seasonList.find((s) => s.seasonId === previousId) ?? null;

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-semibold">Component gallery</h1>
          <Badge>Development only</Badge>
        </div>
        <p className="text-[13px] text-text-muted">
          Phase 2 shared components on the mock data, in {themes.map((t) => t.name).join(', ')}. Not linked from the app.
        </p>
      </header>
      {themes.map((theme) => (
        <ThemeScope key={theme.id} theme={theme} className="flex flex-col gap-6 rounded-card border border-border bg-bg p-5 text-text">
          <h2 className="text-[15px] font-semibold">{theme.name}</h2>
          <RankBadges />
          <GameBadges />
          <Players entries={entries} />
          <SeasonTiles current={current} previous={previous} loading={profile.isPending || seasons.isPending} />
          <Controls />
          <Section title="Chart preset: points after every match">
            <SectionCard
              title="Ranked points after every match"
              subtitle={`${profile.data?.data.player.name ?? '…'}, ${season.name} (${series.length} matches)`}
              query={matches}
              isEmpty={() => series.length === 0}
              empty={{ title: 'No ranked matches this season' }}
              skeleton={<Skeleton className="h-60 w-full" />}
            >
              {() => <PointsLineChart label="Ranked points after every match" data={series} ranks={ranks} busy={matches.isFetching} />}
            </SectionCard>
            <SectionCard title="Same data: step curve, plain points axis, no session dividers" query={matches} skeleton={<Skeleton className="h-40 w-full" />}>
              {() => <PointsLineChart label="Points, plain axis" data={series} ranks={null} curve="step" height={160} sessionGapMs={null} />}
            </SectionCard>
          </Section>
          <BoardTable entries={entries} busy={board.isFetching && entries !== undefined} />
          <OperatorList operators={operators.data?.data} />
          <Section title="Section cards and query states">
            <div className="grid grid-cols-3 gap-4">
              <SectionCard
                title="Profile (data)"
                subtitle={profile.data ? `${updatedAgo(profile.data.fetchedAt, now)} · from ${profile.data.from}` : undefined}
                query={profile}
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={star.isFavorite}
                      onClick={star.toggle}
                      icon={<Star className="size-3.5" aria-hidden fill={star.isFavorite ? 'currentColor' : 'none'} />}
                    >
                      {star.isFavorite ? 'Favorite' : 'Add favorite'}
                    </Button>
                    <Button size="sm" onClick={() => void update()} disabled={isUpdating} icon={<RefreshCw className={isUpdating ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />}>
                      Update
                    </Button>
                  </>
                }
              >
                {(p) => (
                  <div className="flex items-center gap-3">
                    <Avatar player={p.data.player} size="lg" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-semibold">{p.data.player.name}</span>
                      <span className="flex items-center gap-2 text-xs text-text-muted">
                        <PlatformLabel platform={p.data.player.platform} /> Level {formatNumber(p.data.level)}
                      </span>
                    </div>
                    <RankBadge
                      className="ml-auto"
                      size="lg"
                      rank={p.data.currentSeason.byPlaylist.find((pl) => pl.playlistId === ladder?.id)?.standing?.rank ?? null}
                    />
                  </div>
                )}
              </SectionCard>
              <SectionCard title="Not found (a real not_found error)" query={missingMatch}>
                {() => null}
              </SectionCard>
              <SectionCard title="Unsupported (distribution of a plain-points playlist)" query={plainDistribution}>
                {() => null}
              </SectionCard>
              <SectionCard title="Empty" query={profile} isEmpty={() => true} empty={{ title: 'No encounters yet', description: 'Players met more than once show here.' }}>
                {() => null}
              </SectionCard>
              <SectionCard title="Loading" query={STILL_LOADING}>
                {() => null}
              </SectionCard>
            </div>
          </Section>
        </ThemeScope>
      ))}
    </div>
  );
}
