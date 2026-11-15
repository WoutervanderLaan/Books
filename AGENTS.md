<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes

- Local-only finance app: Next.js 16 App Router + SQLite (better-sqlite3, Drizzle). All pages are dynamic
  (`dynamic = "force-dynamic"` in the root layout); Cache Components is intentionally off.
- Money is integer cents, dates are `YYYY-MM-DD` strings. Keep pure logic in `src/lib/{import,rules,analytics,tax}`
  (no DB access, unit tested) and DB access in `src/lib/services` (functions take a `db` argument so tests can
  use `openDatabase(":memory:")`).
- `src/lib/db/index.ts` is `server-only`; scripts and tests import `src/lib/db/connection.ts` instead.
- Mutations go through server actions in `src/app/actions/*` and end with `refreshAll()`.
- Schema change: edit `src/lib/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`.
- Checks before committing (also run in CI, `.github/workflows/ci.yml`): `npm run format:check`, `npm test`,
  `npm run typecheck`, `npm run lint`, `npm run build`. Run `npm run format` to fix formatting.
- Never commit `data/` or `demo-data/` (personal financial data).

## Repository map

- `src/app/` — routes (one folder per page), `actions/` server actions, `api/` route handlers (backup, export).
- `src/lib/import/` bank file parsers · `rules/` categorisation · `analytics/`, `budget/`, `tax/` pure logic ·
  `services/` DB access · `db/` schema, connection, seed.
- `tests/` Vitest suites (`tests/fixtures/` sample bank files) · `drizzle/` generated migrations ·
  `scripts/` launcher, demo data generator and CI tooling (`scripts/ci/`).

## Pull requests

- Use `.github/pull_request_template.md`. The `PR Summary` workflow fills in **Summary** and **Changes per
  file** (one row per changed file) between the `ai-summary` markers on every push; agents opening a PR
  should write that block themselves too (see `.github/prompts/pr-summary.md` for the format) and keep
  their own notes outside the markers.
- Keep PRs focused; commit generated files (`drizzle/`, `package-lock.json`) together with their source.

## Security-sensitive areas

A PR touching any of these gets the `security-review` label and an extra Claude security review
(`.github/workflows/security-review.yml`, threat model in `.github/prompts/security-review.md`). The source
of truth is `scripts/ci/security-scope.ts`; update both when adding an area.

- Paths: `src/app/api/`, `src/app/actions/`, `src/lib/db/`, `drizzle/`, `src/lib/import/`, `src/lib/server.ts`,
  `src/middleware.ts`/`src/proxy.ts`, `next.config.ts`, `scripts/next.mjs`, `package.json`/lockfile,
  `.github/`, `scripts/ci/`, `.claude/`, `.gitignore`, `.env*`.
- Added code anywhere using: `dangerouslySetInnerHTML`, `eval`/`new Function`, `child_process`, raw or
  interpolated SQL, `fs` writes/deletes, `fetch`/outbound network, `process.env`, `cookies()`/`headers()`,
  host binding, workflow `permissions`/`secrets`/`pull_request_target`, or a likely hard-coded secret.
- Invariants: listen on `127.0.0.1` only, no outbound connections, validate server action input with zod,
  SQL only through Drizzle/bound parameters, never commit or serve `data/`, `demo-data/` or `*.db`.
