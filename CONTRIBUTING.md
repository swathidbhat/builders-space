# Contributing

## Setup

- Node.js 22.22.2 or newer (`.nvmrc` is `22.22.2`, the current LTS line). Node 20 is not supported. `engine-strict` and `scripts/check-node.mjs` enforce it.
- npm 9 or newer.
- Linux or macOS for the dashboard and session discovery. Opening a session from a card is macOS-only.

```bash
npm ci
cp .env.example .env
npm run dev
```

`ANTHROPIC_API_KEY` in `.env` is optional. Leave it commented and Human Lingo stays on this machine. The example placeholder is not a key. The dashboard is at `http://127.0.0.1:5174`. The API is at `http://127.0.0.1:3002` and only accepts the per-launch token the dev server injects.

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

- 90% for `server/**/*.ts`
- 90% for `shared/**/*.ts`
- 70% for `src/**/*.{ts,tsx}`

`server/index.ts` is excluded from coverage. It only binds the port and installs signal handlers. The Playwright boot covers that process.

`npm run test:e2e` starts the server and Vite against fixture sessions and checks the HUD, sidebar, agent cards, and the hooks panel. It does not launch Cursor or Terminal.

[TESTS.md](TESTS.md) is only the checks that need a person on macOS: `open` / `osascript`, live `ps`/`lsof` status, and looking at the 3D scene. Do not put automated cases there.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request targeting `main`. The job uses Node 22.22.2 and runs, in order: `npm ci`, typecheck, lint, format check, coverage, build, `npm audit --audit-level=high`, Playwright Chromium install, and e2e.

Dependabot opens a weekly pull request for grouped npm updates and a weekly pull request for grouped GitHub Actions updates (`.github/dependabot.yml`).

## Pre-commit

`npm ci` installs a `simple-git-hooks` pre-commit hook. The hook runs lint-staged: ESLint `--fix` and Prettier on staged TypeScript, and Prettier on staged JSON, Markdown, YAML, and CSS. If the hook rejects a commit, fix the reported files and commit again. `npm run prepare` reinstalls the hook.

## Dependency upgrades we did not take

Node is 22.22.2 or newer, which is what Vitest 5, jsdom 30, lint-staged 17, and concurrently 10 require. ESLint 10 is installed. `eslint-plugin-react` still peers only through ESLint 9, so React lint rules come from `@eslint-react/eslint-plugin` instead.

| Package      | Latest | Why it stays back                                                                                                   |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `typescript` | 7.0.2  | `typescript-eslint` 8.71.1 peers `typescript >=4.8.4 <6.1.0`. No newer release accepts TypeScript 7. Stay on 5.9.3. |

Revisit TypeScript 7 when `typescript-eslint` widens that peer range.
