# Game config

The only place Sightline knows seasons, rank ladders, playlists, operators, maps and regions. Nothing in `src/`
names one. The files are merged into one `GameConfig` (`src/shared/types/game-config.ts`) and checked by
`validateGameConfig` (`src/shared/game-config/validate.ts`) when the app starts. If the data is invalid, the app
refuses to start and lists every problem.

| File | Holds |
| --- | --- |
| `manifest.json` | `schemaVersion` (the shape of these files; the app refuses a version it does not know), `dataVersion` (bump on every content change), `updatedAt`, `currentSeasonId` |
| `seasons.json` | Every season, oldest first: id (`Y11S3`), number (`(year - 1) * 4 + season`), name, `startsAt`, `endsAt` (= the next season's start, `null` for the last one), the rank system in force |
| `rank-systems.json` | `ranked-2` (Y7S4 to Y11S1): Copper V to Diamond I, 100 RP each from 1,000, then one open-ended Champions rank from 4,500. `ranked-3` (Y11S2 on): Copper V to Champion I, 40 divisions of 100 RP from 1,000, Champion I open-ended from 4,900. Tiers lowest first, each with original badge initials and a colour that is the same in every theme |
| `playlists.json` | Kind, whether points are a ladder or plain, the leaderboard (and its regions), Live Match support, first and last season, upstream names |
| `operators.json` | 78 operators (39 attack, 39 defense): slug id, name, side, two-letter initials, colour, upstream names |
| `maps.json` | 27 maps with initials, colours and upstream names |
| `regions.json` | The five Legend Division regions |

`externalIds` is the only place an upstream name is mapped to our id. `backend` holds the names a stats backend
is expected to send (tracker-style playlist ids such as `pvp_ranked`, operator ids such as `solid_snake`).
`overwolf` holds the names Overwolf's game events send (`RANKED`, `QUICK MATCH`, `JACKAL`, `CLUB HOUSE`). They
are matched trimmed and case-insensitively, and a name nobody claims comes out as "unknown" without crashing. No
two entities of one kind may claim the same name.

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
  - **Recruits are not included.** The five recruit variants are not regular picks, and the name Overwolf sends
    for one is unknown. A live recruit pick therefore arrives as an unknown operator (the raw name is kept). A recruit
    can be added here later without a code change.
  - Initials and colours are original: warm hues for attackers, cool hues for defenders.
  - Overwolf names are the upper-case name. For names with diacritics, the plain-letter spelling is listed too
    (`JÄGER`, `JAGER`).
- **Maps:** the 27 maps of `@silver-3/r6-info` 2.2.7 (Y11S1.2), with its duplicate `stadium2020` entry merged into
  Stadium Alpha, plus Calypso Casino (Y11S2).
  - Overwolf names are from Overwolf's 2024 docs; Overwolf reportedly renamed some in October 2026 (GEP 315.3).
  - The config has no map pools, so the mock can put any match on any map.
- **Regions:** the five labels on stats.cc's Legend Division boards. Backend codes: `EUMENA`, `LATAM` and `APAC` were
  seen in Tracker Network URLs; `NA` and `OCE` are assumptions.

## How to add a new season

1. Append it to `seasons.json`: `id`, `number`, `name`, `startsAt`, `endsAt: null`, `rankSystemId`.
2. Set the previous last season's `endsAt` to the new `startsAt`.
3. Bump `dataVersion` (and `updatedAt`) in `manifest.json`, and `currentSeasonId` once it has started.

Nothing else changes. A new operator or map is one more entry in its file, plus a `dataVersion` bump. A new rank
ladder is a new rank system, referenced from the seasons that use it. `npm test` validates the result.
