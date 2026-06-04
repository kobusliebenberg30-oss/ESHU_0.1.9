# ESHU Server

Production-grade Node.js + Express + PostgreSQL backend for ESHU.

## Stack

- **Node.js** 20+ (ESM + TypeScript)
- **Express 5** with `helmet`, `cors`, `pino-http`, `express-rate-limit`
- **PostgreSQL 16** (via Docker)
- **Prisma** ORM (migrations + typed client)
- **Sessions** via `express-session` + `connect-pg-simple` (httpOnly cookies)
- **Argon2id** password hashing
- **Zod** for runtime validation at every boundary
- **Pluggable storage** (`local` filesystem now, `s3` later) via `StorageDriver`

## Quick start

> Requires **Node.js 20+** and **Docker Desktop** running.

From the **repo root** (not `server/`):

```powershell
npm install              # root devDeps (http-server, concurrently)
npm install --prefix server   # backend deps
npm run setup            # idempotent: env files, postgres, migrations, test db
npm run dev              # website + api on :3000 (single local server)
```

Open `http://localhost:3000`. Static assets are served directly from `pages/`.

### What `npm run setup` does

8 idempotent steps; each one no-ops if already satisfied. See `@scripts/setup.mjs:1-19` for the pipeline contract. Re-run any time without side effects.

### Manual setup (fallback if setup script fails)

```powershell
# 1. Configure env (generates a fresh SESSION_SECRET each call)
node server/scripts/bootstrap-env.mjs           # writes server/.env
node server/scripts/bootstrap-env.mjs --test    # writes server/.env.test

# 2. Start Postgres
docker compose -f server/docker-compose.yml up -d

# 3. Migrate the dev database
npm run db:deploy --prefix server               # idempotent

# 4. Set up the test database
docker exec eshu-postgres psql -U eshu -d eshu -c "CREATE DATABASE eshu_test OWNER eshu"
npm run db:test:setup --prefix server

# 5. Run everything
npm run dev
#   website + api -> http://localhost:3000
```

Open `http://localhost:3000` (or any page). The frontend behaves identically to before. To activate the remote backend on the current page, open DevTools and run:

```js
ESHU_REMOTE.enable();   // reloads; auth overlay appears if no session
```

After signing in once, the chosen backend persists in `localStorage`.

## Run halves individually

From the **repo root**:

```powershell
npm run dev          # Backend + static frontend on :3000
npm run dev:web      # Static frontend only (port 8080, optional troubleshooting)
npm run dev:split    # Legacy split mode: API :3000 + static :8080
```

Or from inside `server/`:

```powershell
npm run dev          # Backend + static frontend (serves ../pages)
```

## Tests

Integration tests run against a **real Postgres test database**. They use Supertest agents to drive the actual Express app (no mocks), so route + middleware + Prisma + DB are all exercised.

If you ran `npm run setup` from the repo root, the test database, `.env.test`, and migrations are all in place — just run:

```powershell
npm test                          # from the repo root
# or
npm test --prefix server          # equivalent
npm run test:watch --prefix server # interactive
```

The setup file (`@src/test/setup.ts`) refuses to run unless `DATABASE_URL` contains the substring `test` — guards against accidentally truncating dev data.

### What's covered

- **`src/test/auth.test.ts`** — register / login by email or username / `me` / logout / 401 / 409 / 400 zod errors.
- **`src/test/groups.test.ts`** — full CRUD, default + burn soft-delete, ownership scoping, unauth 401, JSON-extras roundtrip via `data`.
- **`src/test/sync.test.ts`** — `GET /api/sync` blob shape, `PUT` upsert + extras flatten/collect, soft-delete-only semantics (omitted rows preserved), cross-profile id takeover prevention, `memberProfileIds` round-trip.
- **`src/test/groups.test.ts`** also covers `memberProfileIds` join-table persistence (replace-set semantics, dangling-id drop, denormalized count).

## Project layout

```
src/
  index.ts           # bootstrap + graceful shutdown
  app.ts             # express composition
  env.ts             # zod-validated env
  db/client.ts       # Prisma singleton
  lib/               # logger, hash
  middleware/        # auth, validate, error
  modules/
    auth/            # /api/auth: register, login, logout, me
    users/           # /api/users: me, :username
    assets/          # /api/assets: upload, fetch metadata, raw bytes
  storage/
    driver.ts        # StorageDriver interface
    local.ts         # filesystem implementation
    index.ts         # factory (driver selection by env)
prisma/schema.prisma # User, Session, Asset
storage/assets/      # blob store (gitignored)
```

## API

All `/api/*` routes (except `auth/register`, `auth/login`, `users/:username`) require an authenticated session cookie.

### Auth & users
| Method | Path                  | Notes                                  |
| ------ | --------------------- | -------------------------------------- |
| POST   | `/api/auth/register`  | `{ email, username, password }`        |
| POST   | `/api/auth/login`     | `{ emailOrUsername, password }`        |
| POST   | `/api/auth/logout`    |                                        |
| GET    | `/api/auth/me`        | session user                           |
| GET    | `/api/users/me`       | full account                           |
| GET    | `/api/users/:username`| public profile                         |

### Assets (binary uploads)
| Method | Path                  | Notes                                  |
| ------ | --------------------- | -------------------------------------- |
| POST   | `/api/assets`         | `multipart/form-data` field `file`     |
| GET    | `/api/assets/:id`     | metadata                               |
| GET    | `/api/assets/:id/raw` | binary stream                          |

### Profiles (in-app player identities)
| Method | Path                  | Notes                                  |
| ------ | --------------------- | -------------------------------------- |
| GET    | `/api/profiles`       | list user's profiles + `currentProfileId` |
| POST   | `/api/profiles`       | `{ name, description? }`               |
| PATCH  | `/api/profiles/:id`   | `{ name?, description?, xpPoints?, data? }` |
| POST   | `/api/profiles/active`| `{ profileId }` set active profile     |

### Groups / Games / Creations (scoped to active profile)
| Method | Path                       | Notes                                  |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/api/groups`              | `?status=active|deleted|burned|finished|all&privacy=public|private|all` |
| POST   | `/api/groups`              | create                                 |
| GET / PATCH / DELETE | `/api/groups/:id` | `DELETE ?mode=burned` for burn-vs-soft-delete |
| GET    | `/api/games`               | `?status=&hostGroupId=`                |
| POST   | `/api/games`               | create                                 |
| GET / PATCH / DELETE | `/api/games/:id`  | `DELETE ?mode=burned|finished`         |
| GET    | `/api/creations`           | `?status=&hostGameId=`                 |
| POST   | `/api/creations`           | create                                 |
| GET / PATCH / DELETE | `/api/creations/:id` | `DELETE ?mode=burned`              |

### Settings & sync
| Method | Path           | Notes                                                                |
| ------ | -------------- | -------------------------------------------------------------------- |
| GET    | `/api/settings`| `{ uiTheme, primaryGroupId, currentProfileId, data }`                |
| PUT    | `/api/settings`| partial update                                                       |
| GET    | `/api/sync`    | bulk-pull `{ tables: { groups, games, creations, profiles }, values }` for first-load hydration |
| GET    | `/healthz`     | liveness                                                             |

## Architectural notes

- **Sessions over JWT**: server-rendered web app, single trust domain. Cookies are httpOnly + SameSite=Lax; `connect-pg-simple` keeps sessions in the same DB so logout / revocation is trivial.
- **Content-addressed assets**: the blob is keyed by its sha256, dedup is automatic, and the storage driver never needs to know about user identity. The DB row carries ownership + access rules.
- **Driver swap to S3**: implement `StorageDriver` in `src/storage/s3.ts`, register in `src/storage/index.ts`. Routes don't change.
- **Failure modes**: every route uses `next(err)`; `errorHandler` distinguishes `ZodError`, `HttpError`, and unknown 500s. Never leak internals.

## Scripts

| Script              | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | tsx watch mode                           |
| `npm run build`     | tsc -> `dist/`                           |
| `npm start`         | run compiled output                      |
| `npm run db:migrate`| create + apply migration in dev          |
| `npm run db:studio` | Prisma Studio GUI                        |
| `npm test`          | vitest                                   |
