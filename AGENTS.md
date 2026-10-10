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
- Checks before committing: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Never commit `data/` or `demo-data/` (personal financial data).
