# Contributing

## Setup

- Node.js 20.19 or newer (`.nvmrc` is `20.19`). Node 18 is not supported.
- npm 9 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

`ANTHROPIC_API_KEY` in `.env` is optional. Leave it unset and Human Lingo stays on this machine. The dashboard is at `http://127.0.0.1:5174`. The API is at `http://127.0.0.1:3002` and only accepts the per-launch token the dev server injects.

## Scripts

| Script                  | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run dev`           | API and Vite together                                                 |
| `npm run typecheck`     | `tsc --noEmit`                                                        |
| `npm run lint`          | ESLint                                                                |
| `npm run format`        | Prettier write                                                        |
| `npm run format:check`  | Prettier check                                                        |
| `npm test`              | Vitest, once                                                          |
| `npm run test:coverage` | Vitest with the coverage thresholds below                             |
| `npm run test:e2e`      | Playwright. Install Chromium first: `npx playwright install chromium` |
| `npm run build`         | `tsc` and the Vite production build                                   |

## Tests and coverage

Unit tests cover parsers, watchers, hook setup against a temp home directory, the open-session command builder, auth, and the dashboard components. `npm run test:coverage` fails the run when line coverage drops below:

- 80% for `server/**/*.ts`
- 80% for `shared/**/*.ts`
- 60% for `src/**/*.{ts,tsx}`

`server/index.ts` is excluded from coverage. It only binds the port and installs signal handlers. The Playwright boot covers that process.

`npm run test:e2e` starts the server and Vite against fixture sessions and checks the HUD, sidebar, agent cards, and the hooks panel. It does not launch Cursor or Terminal.

[TESTS.md](TESTS.md) is only the checks that need a person on macOS: `open` / `osascript`, live `ps`/`lsof` status, and looking at the 3D scene. Do not put automated cases there.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request targeting `main`. The job uses Node 20.19 and runs, in order: `npm ci`, typecheck, lint, format check, coverage, build, `npm audit --audit-level=high`, Playwright Chromium install, and e2e.

Dependabot opens a weekly pull request for grouped npm updates and a weekly pull request for grouped GitHub Actions updates (`.github/dependabot.yml`).

## Pre-commit

`npm install` installs a `simple-git-hooks` pre-commit hook. The hook runs lint-staged: ESLint `--fix` and Prettier on staged TypeScript, and Prettier on staged JSON, Markdown, YAML, and CSS. If the hook rejects a commit, fix the reported files and commit again. `npm run prepare` reinstalls the hook.

## Dependency upgrades we did not take

These majors are current upstream and are intentionally not installed. Each one drops the Node 20.19 floor this repo still supports, or it fails a peer range we still need.

| Package                          | Latest | Why it stays back                                                                                                                                                  |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest` / `@vitest/coverage-v8` | 5.0.3  | Engines are `^22.12.0 \|\| ^24 \|\| >=26`. CI and `engines` still allow Node 20.19. Stay on 4.1.11.                                                                |
| `typescript`                     | 7.0.2  | `typescript-eslint` 8.71 peers `typescript >=4.8.4 <6.1`. Stay on 5.9.3.                                                                                           |
| `eslint`                         | 10.12  | `eslint-plugin-react` 7.37.5 peers ESLint through `^9.7` only, and ESLint 9.39.5 is marked deprecated upstream. Stay on 9.39.5 until that plugin allows ESLint 10. |
| `jsdom`                          | 30.1.2 | Engines are `^22.22.2 \|\| ^24.15 \|\| >=26`. Stay on 29.1.1, which still allows Node 20.19.                                                                       |
| `lint-staged`                    | 17.6.0 | Engines are `>=22.22.1`. Stay on 16.4.0.                                                                                                                           |
| `concurrently`                   | 10.0.6 | Engines are `>=22`. `npm run dev` stays on 9.2.5.                                                                                                                  |

Revisit this table when the Node floor moves to 22.22 or the peer ranges above widen.
