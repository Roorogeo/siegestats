# Game config

The only place Sightline knows seasons, rank ladders, playlists, operators, maps and regions. Nothing in `src/`
names one. The files are merged into one `GameConfig` (`src/shared/types/game-config.ts`) and checked by
`validateGameConfig` (`src/shared/game-config/validate.ts`) when the app starts. If the data is invalid, the app
refuses to start and lists every problem.

| File | Holds |
| --- | --- |
| `manifest.json` | `schemaVersion` (the shape of these files; the app refuses a version it does not know), `dataVersion` (bump on every content change: the date, `2026.11.15`, with `.2`, `.3` for further changes that day), `updatedAt`, `currentSeasonId` (only a fallback, see below) |
| `seasons.json` | Every season, oldest first: id (`Y11S3`), number (`(year - 1) * 4 + season`), name, `startsAt`, `endsAt` (= the next season's start, `null` for the last one), the rank system in force |
| `rank-systems.json` | `ranked-2` (Y7S4 to Y11S1): Copper V to Diamond I, 100 RP each from 1,000, then one open-ended Champions rank from 4,500. `ranked-3` (Y11S2 on): Copper V to Champion I, 40 divisions of 100 RP from 1,000, Champion I open-ended from 4,900. Tiers lowest first, each with original badge initials and a colour that is the same in every theme |
| `playlists.json` | Kind, whether points are a ladder or plain, the leaderboard (and its regions), Live Match support, round rules (`overtime`, `decidingRoundAt`), first and last season, upstream names |
| `operators.json` | 78 operators (39 attack, 39 defense): slug id, name, side, release season (`firstSeasonId`), two-letter initials, colour, upstream names |
| `maps.json` | 27 maps with release season (`firstSeasonId`), the kinds of playlist they are played in (`playlistKinds`), initials, colours and upstream names |
| `regions.json` | The five Legend Division regions |

`externalIds` is the only place an upstream name is mapped to our id. `backend` holds the names a stats backend
is expected to send (tracker-style playlist ids such as `pvp_ranked`, operator ids such as `solid_snake`).
`overwolf` holds the names Overwolf's game events send (`RANKED`, `QUICK MATCH`, `JACKAL`, `CLUB HOUSE`). They
are matched trimmed and case-insensitively, and a name nobody claims comes out as "unknown" without crashing. No
two entities of one kind may claim the same name.

## Round rules, release seasons and map kinds

- **`overtime`** (playlists): `{ "at": 3, "roundsToWin": 5 }` means that at 3-3 the match goes to overtime, first to
  5. `null` = no overtime. Both are positive whole numbers, and `roundsToWin` must be greater than `at`.
- **`decidingRoundAt`** (playlists): at that score each, one deciding round settles the match. `null` = none. A
  playlist has at most one of `overtime` and `decidingRoundAt`. These are the rules behind the match screen's
  Overtime and Decider labels, and the demo source plays its matches by them.
- **`firstSeasonId`** (operators and maps): the season it was released. `null` = before Y7S4, the first season in this
  config. It must name a season in `seasons.json`. The demo source never picks an operator or a map before it.
- **`playlistKinds`** (maps): the kinds of playlist the map is played in, e.g. `["arcade", "event", "training",
  "custom"]` for an arena map. `null` = every kind; an empty list or an unknown kind is refused. These are kinds, not
  each season's exact Ranked pool, which changes every season and is not kept here. Only the demo source reads it,
  to keep its matches plausible; a real stats source reports the map that was played.

## Where the data comes from

None of this was read on Ubisoft's or Overwolf's own pages; those sites could not be opened while it was written.

- **Season names and dates:** search-result summaries of Ubisoft's season pages and fan season lists, checked
  against the community library `siegeapi`. Season numbers follow `siegeapi` and Tracker Network.
  - Y7S4, Y8S3, Y8S4 and Y9S1 use the commonly reported dates, not `siegeapi`'s, which contain typos.
  - Y10S3 "High Stakes" (2025-09-02) is from memory.
  - **Y11S4 "Operation Vital Signal" has no confirmed start date.** 2026-12-01 is an estimate (the end of the Y11S3
    battle pass and of the Legend Division edition). Its `endsAt` is null.
- **Rank ladders:** Ranked 2.0 from `siegeapi`'s rank table (`ranks_v6`). Ranked 3.0 from search summaries: 100 RP per
  division, Champion V at 4,500 and Champion I from 4,900. Sources disagree, and Ubisoft reportedly does not
  publish the cutoffs. The tier colours are original.
- **Playlists:** tracker-style ids from the npm package `r6s-stats-api` (`pvp_ranked`, `pvp_standard`,
  `pvp_casual`, `pvp_living_game_mode`, `pvp_warmup`, `pvp_event`) and Ubisoft board ids seen in `siegeapi`.
  - The Overwolf playlist strings come from the live events documentation (search summaries) and Overwolf's
    archived 2024 docs (`MATCHMAKING_PVP_*`).
  - Legend Division's upstream ids are unknown, so it has none. Its `firstSeasonId` is Y11S3 (it launched
    2026-10-15).
  - Dual Front ran from Y10S2 to Y11S1.
  - Siege Cup is left out: its 2026 status is unknown, and an unknown playlist degrades to "unknown".
- **Operators:** names and sides from the community npm packages `@zerobertoo/r6operators` 2.0.0 and `r6operators`
  2.12.0: 39 attackers and 39 defenders, Noor (Y11S3) newest.
  - Release seasons of Rauora (Y10S1, Prep Phase), Denari (Y10S3, High Stakes), Solid Snake (Y11S1, Silent Hunt)
    and Noor (Y11S3, Split Fire): Ubisoft season pages seen in search summaries.
  - Release seasons of Solis (Y7S4), Brava (Y8S1), Fenrir (Y8S2), Ram (Y8S3), Tubarão (Y8S4), Deimos (Y9S1),
    Striker and Sentry (Y9S2) and Skopos (Y9S3): general knowledge, **to be confirmed by the owner**. Every other
    operator was released before Y7S4 (`null`).
  - **Recruits are not included.** The five recruit variants are not regular picks, and the name Overwolf sends
    for one is unknown. A live recruit pick therefore arrives as an unknown operator (the raw name is kept). A recruit
    can be added here later without a code change.
  - Initials and colours are original: warm hues for attackers, cool hues for defenders.
  - Overwolf names are the upper-case name. For names with diacritics, the plain-letter spelling is listed too
    (`JÄGER`, `JAGER`).
- **Maps:** the 27 maps of `@silver-3/r6-info` 2.2.7 (Y11S1.2), with its duplicate `stadium2020` entry merged into
  Stadium Alpha, plus Calypso Casino (Y11S2).
  - Overwolf names are from Overwolf's 2024 docs; Overwolf reportedly renamed some in October 2026 (GEP 315.3).
  - Release seasons (Nighthaven Labs Y7S4, Lair Y8S4, Calypso Casino Y11S2) and playlist kinds are from general
    knowledge, **to be confirmed by the owner**. Close Quarter and Stadium Alpha / Bravo are arena maps (Arcade, Event,
    Training, Custom). Favela, Hereford Base, House, Presidential Plane, Tower and Yacht are casual-only (Standard,
    Quick Match, Arcade, Event, Training, Custom). Every other map can come up in any playlist, Ranked included.
  - These are kinds, not per-season pools: the demo source keeps Ranked and Legend Division matches off the arena
    and casual-only maps, but may still put one on a map that was out of that season's Ranked pool. Dual Front's own
    map is not in the config, so the demo source counts its matches on general maps.
- **Round rules:** Ranked and Legend Division go to overtime at 3-3, first to 5; Standard plays one deciding round at
  3-3; other playlists have neither. General knowledge, **to be confirmed by the owner**.
- **Regions:** the five labels on stats.cc's Legend Division boards. Backend codes: `EUMENA`, `LATAM` and `APAC` were
  seen in Tracker Network URLs; `NA` and `OCE` are assumptions.

## How to add a new season

1. Append it to `seasons.json`: `id`, `number`, `name`, `startsAt`, `endsAt: null`, `rankSystemId`.
2. Set the previous last season's `endsAt` to the new `startsAt`.
3. Bump `dataVersion` (and `updatedAt`) in `manifest.json`. The current season follows the clock
   (`GameIndex.currentSeasonAt`): the app moves to the new season at its `startsAt` with no further edit.
   `currentSeasonId` is only the fallback for a clock outside every season (before the first one), so move it to
   the new season when convenient.

Nothing else changes. A new operator or map is one more entry in its file (with its `firstSeasonId`, and for a map
its `playlistKinds`), plus a `dataVersion` bump. A new rank ladder is a new rank system, referenced from the seasons
that use it. `npm test` validates the result.
