# Sightline

Fan-made desktop companion for Rainbow Six Siege players. Not affiliated with or endorsed by Ubisoft.

"Sightline" is a working name. Status: phase 1 of 7 (app shell, routing, theme tokens, all 56 themes, theme picker).
See [docs/design.md](docs/design.md) for the structure, the phase plan's open questions and the defaults in use.

## Run it

Requires Node 22.12 or newer.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts the Electron app with hot reload. To work on the UI in a plain browser instead
(same UI, in-page stand-in for the desktop bridge, settings in localStorage):

```bash
npm run dev:web
```

## Check it

```bash
npm run check
```

That runs the type check, lint and unit tests. End-to-end tests drive the real Electron app and the browser build:

```bash
npm run test:e2e
```

On a Linux machine without a display, use `npm run test:e2e:linux` (it wraps the run in `xvfb-run`).

## Layout

| Folder | What lives there |
| --- | --- |
| `src/shared` | Pure TypeScript used everywhere: core types, the theme engine (56 themes, token derivation, contrast maths), the bridge manifest |
| `src/core` | Product logic with no knowledge of Electron, the DOM or Node. Phase 1: settings |
| `src/main` | Electron main process: wiring and adapters only |
| `src/preload` | Exposes the typed bridge as `window.bridge` |
| `src/renderer` | The React UI. It reaches everything else through `window.bridge` |
| `config` | `app.json` (build-time app config) and, from phase 2, the versioned game data |
| `tests` | Unit tests (Vitest) and end-to-end tests (Playwright) |

## Themes

All 56 themes are data in `src/shared/theme/seeds.ts`: four colours each, exactly as specified. Every other
token is derived in `src/shared/theme/derive.ts`, and unit tests hold every theme to 4.5:1 contrast for text
and to the categorical-palette checks for its eight chart colours. The UI can only name colours through theme
tokens; a test fails if a colour literal appears in renderer code.
