# ESHU — Production deployment (Supabase + Vercel)

ESHU uses **Express + Prisma + PostgreSQL** with **cookie sessions** (not the Supabase JS client or Supabase Auth). Supabase is the managed Postgres host; Vercel runs the combined API + static site as one serverless app.

## Architecture

```
Browser  →  Vercel (api/index.ts → Express)
              ├── static: pages/
              ├── /api/*  REST + session cookies
              └── Prisma  →  Supabase Postgres
                    └── connect-pg-simple (Session table)
```

Auth is application-owned: `POST /api/auth/register`, `POST /api/auth/login`, Argon2id, `express-session`.

## Prerequisites

1. A **Supabase** project with Postgres enabled.
2. A **GitHub** repo connected to **Vercel** (`liebenbergkobus00-sketch/ESHU_0.1.4` or your fork).
3. Node **20+** locally for migrations and smoke tests.

## 1. Supabase database

### Connection strings

In Supabase: **Project Settings → Database**.

| Variable | Use | Typical Supabase value |
| -------- | --- | ---------------------- |
| `DATABASE_URL` | Runtime (Prisma + sessions) | **Session pooler** URI, port **5432**, or **Transaction pooler** `:6543?pgbouncer=true` |
| `DIRECT_URL` | `prisma migrate deploy` only | **Direct** connection, port **5432** |

Append `?sslmode=require` if your client does not default to SSL.

Example (replace placeholders):

```env
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
```

> **Sessions:** `connect-pg-simple` issues simple queries. Prefer the **session** pooler (5432) for `DATABASE_URL` on Vercel. If you use the transaction pooler (6543), test login/logout carefully.

### Apply migrations

From your machine (with env vars set):

```powershell
cd server
$env:DATABASE_URL="..."   # direct or pooler
$env:DIRECT_URL="..."     # direct, required by Prisma schema
npm run db:deploy
```

Vercel’s `vercel-build` script also runs `db:deploy` when `DATABASE_URL` and `DIRECT_URL` are set in the project.

### Email / password login (important)

Sign-up and sign-in use **ESHU’s own API** (`POST /api/auth/register`, `POST /api/auth/login`) with passwords hashed by Argon2 and stored in the Prisma `User` table on **Supabase Postgres**.

This is **not** the Supabase Dashboard → Authentication product. Users created in the app will **not** appear under Supabase Auth unless you migrate to `@supabase/supabase-js` later. For production, enable email confirmation in your **app** flow (already handled by register/login routes), not in Supabase Auth settings.

To confirm auth works after deploy: register on the live site → check the `User` row in Supabase **Table Editor** → `GET /api/auth/me` returns 200 with the session cookie.

## 2. Vercel project

### Import repository

1. [vercel.com/new](https://vercel.com/new) → Import Git repository.
2. **Root directory:** repository root (where `vercel.json` lives).
3. Framework preset: **Other** (overridden by `vercel.json`).

### Environment variables

Set for **Production** and **Preview** (preview may share the same DB or use a branch DB).

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Supabase pooler URL |
| `DIRECT_URL` | Yes | Supabase direct URL (migrations) |
| `SESSION_SECRET` | Yes | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SESSION_COOKIE_NAME` | No | Default `eshu.sid` |
| `SESSION_MAX_AGE_MS` | No | Default 30 days |
| `CORS_ORIGIN` | Yes | `https://your-production-domain.vercel.app` (comma-separated) |
| `LOG_LEVEL` | No | `info` |
| `STORAGE_DRIVER` | No | `local` |
| `STORAGE_LOCAL_DIR` | On Vercel | `/tmp/eshu-assets` (ephemeral; see risks) |
| `STORAGE_MAX_BYTES` | No | Default 25MB |

`VERCEL_URL` / `VERCEL_BRANCH_URL` are injected by Vercel; the server auto-allows them for CORS.

### Deploy

```powershell
npx vercel link
npx vercel env pull .env.local   # optional, for local prod-like runs
npx vercel --prod
```

Or push to `main` with Git integration.

### Post-deploy checks

```text
GET https://<your-app>/healthz          → { "ok": true, "env": "production" }
POST https://<your-app>/api/auth/register
POST https://<your-app>/api/auth/login
GET  https://<your-app>/api/auth/me     → 200 with session cookie
```

In the browser (remote backend):

```js
ESHU_REMOTE.enable();  // reload; sign in via overlay
```

## 3. Local production-like run

```powershell
npm run install:all
node server/scripts/bootstrap-env.mjs
# Edit server/.env: paste Supabase URLs + set NODE_ENV=production
npm run build --prefix server
npm run db:deploy --prefix server
$env:NODE_ENV="production"; node server/dist/index.js
```

## 4. Asset storage on Vercel

`STORAGE_DRIVER=local` on Vercel writes to `/tmp`, which is **not durable** across invocations. Image uploads may appear to work once, then 404 later. For production media, implement `STORAGE_DRIVER=s3` or Supabase Storage (not yet in repo).

## 5. Troubleshooting

| Symptom | Likely cause |
| ------- | ------------- |
| Build fails on `db:deploy` | Missing `DATABASE_URL` / `DIRECT_URL` in Vercel env |
| `database invariant failed` at cold start | Migrations not applied to Supabase |
| 403 CORS | Add your custom domain to `CORS_ORIGIN` |
| Login works, then 401 | Transaction pooler + session store; switch to session pooler |
| Static HTML 404 | `pages/**` not bundled — check `vercel.json` `includeFiles` |

## 6. Credential checklist (you provide)

- [ ] Supabase `DATABASE_URL` (runtime)
- [ ] Supabase `DIRECT_URL` (migrations)
- [ ] `SESSION_SECRET` (≥ 32 chars)
- [ ] `CORS_ORIGIN` with final Vercel/production URL(s)
- [ ] Vercel project linked to this GitHub repo
