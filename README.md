# ESHU

Vanilla-JS frontend in `pages/` paired with a Node 20 + Express 5 + PostgreSQL backend in `server/`.

## One-command setup

> Requires **Node.js 20+** and **Docker Desktop** running.

```powershell
npm install               # root devDeps (http-server, concurrently)
npm install --prefix server   # backend deps
npm run setup             # idempotent: env files, postgres, migrations, test db
npm run dev               # website + api on :3000 (single local server)
```

Open `http://localhost:3000` once the server is up.

## Common commands

| Command                  | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `npm run setup`          | Idempotent first-time bootstrap. Re-runnable any time.              |
| `npm run dev`            | API + static frontend from one server on `:3000`.                   |
| `npm run dev:api`        | Same as `npm run dev` (backend process that also serves `pages/`).  |
| `npm run dev:split`      | Legacy split mode: API (`:3000`) + static frontend (`:8080`).       |
| `npm run dev:web`        | Static frontend only (`:8080`) for troubleshooting.                 |
| `npm test`               | Run the integration test suite (Vitest + Supertest + real Postgres).|
| `npm run install:all`    | Install root + server deps in one shot.                             |

## Layout

```
pages/                    # vanilla-JS frontend (static)
  assets/components/      # reusable UI components (modal, dropdown, auth overlay, ...)
  assets/core/            # storage drivers, API client, image migrator, etc.
  assets/pages/           # per-page controllers
server/                   # Node + Express + Prisma backend
  prisma/schema.prisma    # data model (see server/README.md for ERD)
  src/modules/            # auth, profiles, groups, games, creations, sync, assets
  scripts/                # bootstrap-env, kill-port, db-test-setup, backfill-members
scripts/setup.mjs         # the one-command bootstrap orchestrator
```

For backend internals (API surface, env vars, test layout, storage drivers), see `@server/README.md`.
For the remote-storage architecture and frontend integration story, see `@pages/assets/core/REMOTE_BACKEND.md`.
For **Supabase + Vercel production deployment**, see `@docs/DEPLOYMENT.md`.
