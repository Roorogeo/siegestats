# Design notes (before phase 1)

Status: pre-code. This file holds the planned folder structure and the open questions from the brief.
The core types are in `src/shared/types/`. No application code exists yet.

Working name: "Sightline" (placeholder, see question 2).

**Sources.** Overwolf's and Ubisoft's websites could not be opened while this was written.
"Verified" means read directly in Overwolf's npm packages, its sample project or its archived docs
repository. "Reportedly" means search-result summaries only.

## 1. Folder structure

```
siegestats/
├─ package.json                  name, productName, author fixed in phase 1 (Overwolf's app id derives from them)
├─ electron.vite.config.ts       builds main, preload (one sandbox-safe file) and renderer
├─ electron-builder.yml          plain-Electron installer (phase 6)
├─ electron-builder.ow.yml       ow-electron variant (phase 7)
├─ tsconfig.json                 + tsconfig.pure.json (shared + core: no DOM, no Node, no Electron), .node.json, .web.json
├─ eslint.config.js              enforces the import rules below
├─ .github/workflows/build-windows.yml   builds the Windows installer
├─ resources/                    app icon, tray icon, logo source
├─ config/
│  ├─ app.json                   which provider runs, backend URL, bug-report and community links (URLs only, never keys)
│  └─ game/                      versioned game data: the only place seasons, ranks, playlists, operators, maps exist
│     ├─ manifest.json           schemaVersion, dataVersion, currentSeasonId
│     └─ seasons.json  rank-systems.json  playlists.json  operators.json  maps.json  regions.json
├─ src/
│  ├─ shared/                    pure TypeScript, imported by everything
│  │  ├─ types/                  the core types
│  │  ├─ game-config/            load, validate, look up (rank for points, season at date, upstream name -> our id)
│  │  ├─ theme/                  the 56 theme seeds, token derivation, contrast maths
│  │  ├─ ipc/                    channel list derived from the Bridge type
│  │  └─ util/                   seeded RNG, time, stat maths (K/D, win rate), errors
│  ├─ core/                      all product logic; knows nothing about Electron, the DOM or Node
│  │  ├─ ports.ts                what core needs from outside: cache / snapshot / match stores, settings, clock, HTTP, notifier
│  │  ├─ memory/                 in-memory stores (browser mode, tests, and the app itself until SQLite arrives in phase 6)
│  │  ├─ stats/
│  │  │  ├─ mock/                MockProvider + seeded generator (~300 players, ~3,000 matches; aggregates summed from the matches)
│  │  │  ├─ live/                LiveProvider stub: backend URL from config/app.json, HTTP calls left as marked TODOs
│  │  │  └─ stats-service.ts     picks the provider, applies the cache times, writes snapshots
│  │  ├─ live-match/
│  │  │  ├─ session.ts           source events -> state -> stat lookups -> display policy -> LiveMatchView; saves the finished match
│  │  │  ├─ mock/                MockLiveMatchSource: scripted matches in fast-forward
│  │  │  └─ overwolf/            (phase 7) turns raw Overwolf events into LiveMatchEvents; tested with recorded event files
│  │  ├─ history/                snapshots -> trend series, saved matches, encounters
│  │  ├─ favorites/              favourites and the rank-change check
│  │  └─ notifications/
│  ├─ main/                      Electron main: wiring and adapters only, no product logic
│  │  ├─ index.ts                single instance, create window, connect core to IPC
│  │  ├─ window/                 frameless main window (min 1100x700, remembers bounds), overlay window
│  │  ├─ ipc/                    one generic Bridge <-> IPC adapter
│  │  ├─ storage/                SQLite driver, migrations, stores implementing core's ports (phase 6)
│  │  ├─ settings/               electron-store
│  │  ├─ system/                 tray, launch on startup, global hotkey, Windows notifications, external links
│  │  └─ runtime/                the ONLY code that knows which Electron it runs on
│  │     ├─ electron/            plain Electron: no live events
│  │     └─ overwolf/            (phase 7) Overwolf events transport, analytics switch-off, events-status check
│  ├─ preload/index.ts           exposes the typed Bridge as window.bridge, nothing else
│  └─ renderer/                  React UI; talks only to window.bridge
│     ├─ index.html
│     └─ src/
│        ├─ app/                 providers, hash router and typed routes, keyboard shortcuts
│        ├─ bridge/              uses window.bridge, or a browser stand-in that runs core in the page (dev and tests)
│        ├─ shell/               title bar, nav buttons, global search, tab bar, account switcher, bell, window controls
│        ├─ features/            home/ profile/ match/ leaderboards/ (also Legend Division) live-match/ overlay/
│        │                       search/ favorites/ notifications/ settings/ themes/
│        ├─ queries/             TanStack Query hooks over bridge.stats
│        ├─ theme/               applies tokens as CSS variables, follows Windows light/dark
│        ├─ ui/                  buttons, cards, tabs, tables, skeleton / empty / error states, rank / operator / map badges
│        ├─ charts/              Recharts wrappers that read the CSS-variable colours
│        └─ styles/index.css     Tailwind entry: utilities mapped to the theme variables
├─ tests/                        unit (theme contrast x56, generator determinism, live session, config validation), e2e (Playwright)
└─ scripts/                      validate game config, theme contrast report, icon build
```

- **Import rules:** `shared` ← `core` ← `main`. Preload and renderer import only `shared`, with one exception:
  the browser stand-in in `renderer/src/bridge` imports `core`. The renderer never imports Electron.
- **Data path:** UI → TanStack Query → `bridge.stats` → core → provider. Core is the only cache
  (profiles 5 min, leaderboards 3 min); TanStack Query only de-duplicates calls.

### Stack choices that differ from "latest"

- **Electron 44.9.x, not 45.** ow-electron's newest line is 44.9.0, so 45 would make the later switch a
  downgrade. Electron 44 reportedly reaches end of life around March 2027.
- **TypeScript 6.0.3, not 7.** Version 7 is the new native compiler and the lint tooling does not support it
  yet. The types in `src/shared/types/` compile on both.
- **SQLite through Node's built-in `node:sqlite`.** There is no native module to rebuild for ow-electron. It
  is still marked "release candidate" and was run on Electron 44 under Linux only; better-sqlite3 is the
  fallback behind the same interface.
- **App icon.** `resources/` holds the icon set (`npm run icons` regenerates it from `icon.svg`). The main
  process loads `resources/icon.png` / `icon.ico` at run time, so the phase 6 installer must ship `resources/`
  (electron-builder `extraResources` or `asarUnpack`).
- **Windows installer built by GitHub Actions.** On Linux the build got as far as the unpacked app, then the
  installer step failed for lack of Wine.

## 2. Open questions

### Needed before phase 1

1. **Will you apply to Overwolf?** Only the owner can, and it has waiting time.
   - Verified: Overwolf's live-events component stays switched off unless the app runs with an Overwolf
     developer login (development), or is signed by Overwolf for an app registered in the owner's account and
     also signed with the owner's own Windows code-signing certificate (release).
   - Reportedly: access follows approval of the app idea, and since 2026-11-01 Overwolf only approves apps
     carrying its ads or paid subscriptions. Whether Siege events are enabled for ow-electron apps in
     production could not be confirmed.
   - Questions: (a) apply under your account: yes / no / later? (b) if ads or subscriptions are required, is
     that acceptable?
   - Default: phases 1-6 are unaffected. Phase 7 delivers the Overwolf source checked against documentation
     and sample events only, never against the game. If the answer is no, the brief allows no other live
     source and Live Match stays a simulator.
2. **App name and publisher name.** Working name "Sightline" (alternatives "Rappel", "Dronephase"), not
   checked against existing trademarks. The name and author field set the app's data folder and later its
   Overwolf registration, so both are needed before phase 1 writes `package.json`.
3. **Theme rules that contradict each other** (computed for all 56):
   - a. **Header gradient.** On 9 of the 50 specialty themes no single text colour reaches 4.5:1 on both
     accent and accent-2: Desert Dune, Eclipse, Sunflower, Carbon Fiber, Night Vision, Winter Frost, Harvest,
     Spooky Night, Winter Holiday. Default: the gradient is a band, and name and stats sit on a
     surface-coloured panel over it.
   - b. **Accent as a text colour.** On 12 themes the listed accent is under 4.5:1 against bg or surface:
     Volcanic Ash, Desert Dune, Vapor Pastel, Cherry Blossom, Sunflower, Arctic Tundra, Red Canyon, Carbon
     Fiber, Winter Frost, Spring Bloom, Summer Beach, Winter Holiday. Accent-2 fails on 15. Default: accents
     stay unchanged for fills, borders, indicators and charts; accent-coloured text uses one extra derived
     token, `accent-text`; accent-2 never colours text. A second derived token, `control-border`, gives inputs and
     an unchecked switch an edge of at least 3:1 (WCAG non-text contrast). Both add tokens beyond the brief's list.
   - c. **High Contrast** lists bg = surface, so panels are separated by the white borders only.
   - d. **"Match Windows light/dark".** Only one generic theme is light. Default: Windows light → Daylight,
     Windows dark → the last dark generic theme used; turning it on while a specialty theme is active
     switches to that pair.

### Conflicts between the brief and what was found

4. **Overwolf's Siege privacy rules vs the Live Match table** (before phase 5). Source: Overwolf's compliance
   page for Siege as archived in September 2024; search results indicate the live page still says the same.
   - For players using the game's privacy mode, an app may display only season win %, season K/D, season
     matches played and current rank.
   - The app must give no way to tell who is in privacy mode, must show custom names with their suffix as
     in-game, must not label players by behaviour, and must leave no way to trace a player back to a profile.
   - Since the app may not reveal who is private, the practical choices are the same four stats for everyone
     else, or looked-up stats for nobody. The brief's table also asks for level, the RP number, HS%, top
     operators, a "met before" badge and click-through.
   - Default: the simulator shows the full table plus an "Overwolf rules" preview so both can be reviewed.
     The real source shows looked-up stats for nobody until Overwolf answers, and nothing saved from a real
     match links another player to an account.
   - Worth asking Overwolf alongside question 1: does the four-stat limit cover only private players or
     everyone, and does it reach saved matches and Encounters?
5. **In-game overlay vs "never inject into or hook the game process"** (before phase 5). Verified:
   Overwolf's overlay works by injecting into the game. Options: (a) no overlay; (b) an ordinary
   always-on-top window, which should show over a borderless or windowed game but not exclusive fullscreen
   (untested); (c) accept Overwolf's overlay as an exception. Default: (b).
6. **Does that rule cover Overwolf itself?** (before phase 7). The app's own code will only call Overwolf's
   official events API. How Overwolf collects those events from the game is not documented anywhere that
   could be read. Default: "our code never does it" is what the rule means.
7. **"No telemetry unless I opt in" vs ow-electron** (phase 7). Verified: ow-electron sends anonymous
   analytics by default, and the switch-off call must be made at every launch. The app will make it unless
   the user opts in. The uninstaller Overwolf's build tool generates also sends one uninstall ping, and no
   switch for it was found. Default: disclose that on the About screen. The app has no telemetry of its own.
8. **Where real stats come from.** If a backend API already exists, it should be shared now.
   - No official public Siege stats API was found. Community libraries sign in to unofficial Ubisoft
     endpoints, Ubisoft's terms reportedly prohibit scraping at scale, and Tracker Network reportedly does
     not offer Siege on its developer API.
   - As far as could be established, Ubisoft's own services do not provide: damage, match history and
     per-match RP change for players nobody was already tracking, round timelines and operator picks,
     encounters, K/D / WR / level leaderboards, or rank distribution.
   - Operator and map stats come from a separate Ubisoft service whose current status is unknown. The one
     damage source found is Overwolf, which reportedly reports damage per round for the local player only.
   - Default: the backend API is defined in phase 7, one endpoint per provider method returning these types
     as JSON. Every field above is nullable, the provider reports what it can deliver, and each screen gets a
     "not available from this source" state.
9. **"Thin main process".** `src/main` holds only wiring and `src/core` imports no Electron, so the
   ow-electron switch touches `src/main/runtime` only. But core runs inside the main process: one cache and
   one live session for window and overlay, saving and notifications continue in the tray, and Overwolf's
   events API exists only there. If the process itself should do almost nothing, core could move to an
   Electron utility process (untried on ow-electron).
10. **Phase order vs dependencies.** Settings, favourites and SQLite are phase 6, but earlier phases use
    them: theme saving (1), "Pin as mine" and the star (2), Home's pinned account and snapshot charts (3),
    saving a match (5).
    - Default: keep the briefed order. A small settings file exists from phase 1 (theme, window bounds,
      pinned accounts). Favourites, cache, snapshots and saved matches live in memory until phase 6, so in
      the phase 2-5 reviews they are empty after a restart.
    - Phase 1 shows search, the account switcher and the bell, but they do nothing yet.
    - Alternative: bring SQLite forward to phase 2.

### Ambiguous wording: the default used unless the owner objects

Phase 1

11. **"Mode" vs "playlist".** The brief uses both. Default: the same thing (Ranked, Standard, Quick Match,
    Legend Division). Objective type (Bomb / Secure Area / Hostage) is not modelled.
12. **Title bar buttons.** Fully custom minimize / maximize / close are expected to lose the layout panel
    Windows 11 shows when hovering maximize (from documentation, untestable on Linux). Default: custom
    buttons as briefed.
13. **Settings → hotkeys.** Default: search, back, forward and the overlay toggle are all listed and
    rebindable, with a reset. The overlay key has no default.

Phase 2

14. **Platform switch vs "no guessing".** Default: PC / PlayStation / Xbox switches only between accounts the
    data source says are linked. An unlinked platform offers "search this name on Xbox" as an ordinary search.
15. **"Best attacker and defender".** Default: the operator with the most rounds on that side this season.
16. **"Ranked sessions" chart.** Default: one point per ranked match of the selected season, with a faint
    divider where two matches are more than 3 hours apart. It needs per-match RP (question 8).
17. **Cache times the brief doesn't name, and what Update does.** Default: everything on a player's page
    follows the 5-minute rule, rank distribution the 3-minute rule, a finished match is kept until "clear
    cache", search results 60 s. Update and the title-bar refresh re-fetch the current screen, ignoring the
    cache.
18. **Encounters.** Default: on any profile, that player's encounters when the stats source has them. Matches
    saved by Live Match add to them only when they carry player identities (simulator yes, Overwolf source no).
19. **Search "recent and pinned results".** Default: with an empty box the dropdown lists pinned accounts,
    then favourites, then the last 10 searches.
20. **Avatars.** Default: initials unless the provider returns an avatar URL; never remote avatars in Live
    Match.
21. **Which provider runs.** Default: `config/app.json` decides at build time (mock until phase 7), with no
    switch in Settings. While it is the mock, the app shows a permanent "Demo data" label. Mock data is
    identical on every launch, with dates relative to today.

Phase 3

22. **Several pinned accounts.** Default: Home and My Profile show the one chosen in the account switcher;
    nothing is combined.
23. **Home filters and charts.** Default: season / playlist / map apply to all four sub-tabs.
    - The two charts read snapshots as briefed. With too few snapshots, or with a map filter, they are
      rebuilt from match history when the provider has it; otherwise they show "not available for this
      filter".
    - "Last season's value" is the season before the selected one with the same filters. The arrow is hidden
      for "All seasons" or a first season.

Phase 4

24. **Legend Division.** Reportedly an official solo-queue playlist above Champion, started 2026-10-15,
    restarting each season, each player locked to one region, with its own points and no rank divisions.
    Defaults:
    - "Position" is the player's place on their own region's board; "#" is the row number in the current view.
    - The game-mode filter is hidden, and the type filter offers only what the provider has.
    - The rank-distribution chart is left out (the total count stays).
    - The tab shows an empty state in a season without a Legend edition.
25. **Leaderboards.** Defaults: "level" ignores the game-mode filter; the minimum-matches rule for K/D and WR
    boards is the provider's; 25 rows per page; position change comes from the provider and shows "–" when
    unknown.
26. **Rank distribution.** Default: one bar per division of the selected season's ladder (reportedly 40 on
    the current ladder, 36 on the previous one; the count comes from the config). Unranked is not shown.
    Mock counts are a synthetic population, not the 300 mock players.

Phase 5

27. **Whose history a live match goes to.** The game decides who is playing, not the account switcher.
    Default: saved under the pinned account that is the local player (simulator: the active account). If the
    local player isn't pinned, the match is shown and summarised but not saved. It is saved once at match
    end, and only if the final score is known.
28. **Saved live matches vs provider history.** Default: marked as recorded locally and replaced by the
    provider's copy when both carry the same game match id. There is no fuzzy matching, so if the ids differ
    both appear and count twice in the summary row.
29. **Tab dots.** Default: Live Match when a match started or ended on another tab; Home when a match was
    saved; My Profile when the rank changed since last viewed; the leaderboard tabs never. A dot clears when
    its tab is opened and lasts for the session.
30. **"Dev-only" Simulate.** Default: only when run from source. The phase 6 installed build's Live Match tab
    therefore stays in its not-connected state until the Overwolf source ships.

Phase 6

31. **Favourites and notifications.** Defaults:
    - The bell opens one panel with Notifications and Favourites tabs.
    - Favourites are checked every 15 minutes while the app is open or in the tray; each check calls the
      backend.
    - "Rank change" means a new division, not every RP movement.
    - "New season" fires when the config's next start date passes or the provider reports a newer season.
    - Each kind shows in-app and as a Windows notification, and can be turned off.
32. **"Store every profile refresh as a snapshot".** Default: for profiles opened or updated, pinned accounts
    and favourites, and only when the numbers changed. Live Match lookups are never stored.
33. **Minimize to tray.** Default: when on, minimize hides to the tray and close still quits; launch on
    startup starts hidden in the tray.
34. **"Clear cache".** Default: cached responses only. Snapshots, saved matches, favourites and settings stay.
35. **Installer and updates.** Default: an unsigned 64-bit installer (Windows will show its "protected your
    PC" warning), no auto-update, and game config bundled with the app.
    - Consequence: a new season, operator or map reaches users only through a new installer.
    - Questions: will a code-signing certificate be bought (also needed for an Overwolf release)? Is
      auto-update in scope? May this repository run GitHub Actions?
36. **"Report a bug" and the community link.** The URLs are not known. Default: plain links from
    `config/app.json`; bug report goes to this repository's issues page, and the community link is hidden
    until one is provided.

### Only a test on Windows with the real game can settle these (phase 7)

Someone with Windows and the game has to run a build that records the events and send back the file.

- Whether the per-player id Overwolf gives is a stats account id, is stable, and exists for private players.
  Overwolf gives no platform per player.
- Whether attack / defense can be derived reliably. The events expose no side; it is inferred from the local
  player's operator.
- Whether enemy operators arrive before the game reveals them. Whatever the result, the app never shows one
  earlier than the game does.
- How often events are down. They were reportedly switched off from December 2025 to February 2026 after
  Ubisoft asked Overwolf to change how they are gathered. The app reads Overwolf's status feed and shows
  "connection failed" or a degraded notice instead of wrong data.
- Whether ow-electron accepts the same main-process build and keeps the same data folder as plain Electron.
- Tray, launch on startup, the global hotkey while the game has focus, Windows notifications and snap layouts.
