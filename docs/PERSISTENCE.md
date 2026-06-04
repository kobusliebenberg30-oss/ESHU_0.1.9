# Persistence model

This document is the contract for how state lives, moves, and is reconciled in
ESHU. It exists because the same class of bug ("the client thought it
mutated, but the server forgot") kept recurring during onboarding. Following
the rules here prevents those bugs by construction.

---

## TL;DR (the four rules)

1. **The PostgreSQL database is the only source of truth.** `ESHU_DB`
   (localStorage) is a *mirror*, never an authority.
2. **Every mutation goes through `ESHU_SYNC.mutate(...)`** in the frontend.
   That helper performs the authoritative REST call, replaces the local row
   by id, and schedules a coalesced `/api/sync` refresh.
3. **No code writes directly to `ESHU_DB.setTable(...)` or `STATE.set(...)`
   for entity tables (`groups`, `games`, `creations`, `profiles`)** without
   going through `ESHU_SYNC`. If you find yourself wanting to, use
   `ESHU_SYNC.applyEntityResponse(...)` instead.
4. **Schema, migrations, and seed-time invariants are versioned and
   verified.** Prisma migrations are the only way to evolve the schema; the
   server refuses to start in production if migrations are pending.

---

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL  (source of truth, FK-enforced, FK cascades)    │
└──────────────────▲────────────────────────────────▲─────────┘
                   │                                │
   Prisma migrations                        Prisma client (typed)
                   │                                │
                   │                  ┌─────────────┴───────────────┐
                   │                  │   Node.js backend (Express) │
                   │                  │   - REST routes              │
                   │                  │   - bulk `/api/sync`         │
                   │                  │   - startup invariants       │
                   │                  └────────────▲────────────────┘
                   │                                │
                   │                          JSON over HTTP
                   │                                │
                   │                  ┌─────────────┴───────────────┐
                   │                  │   Frontend (vanilla JS)      │
                   │                  │                              │
                   │                  │   ESHU_API   ◄──── HTTP      │
                   │                  │   ESHU_SYNC  ◄──── helper    │
                   │                  │   ESHU_DB    ◄──── mirror    │
                   │                  │   STATE      ◄──── reactive  │
                   │                  └──────────────────────────────┘
```

`ESHU_DB` and `STATE` are **caches** of server state. Treating either as the
source of truth is the bug we keep hitting.

---

## The mutation pattern

Every write path in the frontend follows this template:

```js
let row = null;
if (ESHU_SYNC.isRemote()) {
  try {
    row = await ESHU_SYNC.mutate({
      entity: 'groups',                          // or 'games', 'creations'
      call:    () => ESHU_API.groups.join(id),   // authoritative REST
      pick:    (resp) => resp.group ?? resp,     // canonical row to upsert
      refresh: true,                             // pull /api/sync after
    });
  } catch (err) {
    console.warn('server unavailable, falling back to local:', err);
  }
}
if (!row) {
  // Build the local-fallback row, then route it through the SAME helper so
  // STATE and ESHU_DB cannot drift.
  row = buildLocalFallbackRow();
  ESHU_SYNC.applyEntityResponse('groups', row);
}
```

### What `ESHU_SYNC.mutate` does

1. Calls the authoritative endpoint.
2. Runs `pick(response)` to obtain one canonical row (or array if `bulk`).
3. Upserts that row into `ESHU_DB` by id (preserving other rows).
4. Mirrors the same row into `STATE` so reactive UI updates.
5. If `refresh: true`, schedules a single `/api/sync` GET (coalesced across
   parallel callers) so server side-effects (e.g. `game_default` materialised
   on join) flow back into the local mirror.

### What `ESHU_SYNC.applyEntityResponse(entity, row)` does

Same upsert as step 3+4 above, but without an HTTP call. Use this for:

- Local-only mode (`!ESHU_SYNC.isRemote()`)
- Offline fallback when the authoritative call failed
- Hydration of a row that came from another channel (e.g. a websocket frame)

### What `ESHU_SYNC.removeEntity(entity, idOrIds)` does

Filters those ids out of `ESHU_DB[entity]` and `STATE[entity]`. Pair with
`mutate({ ..., removeIds })` for delete flows.

### What NOT to do

- ❌ `STATE.set('groups', next)` directly. State without DB mirror is lost on
  navigation.
- ❌ `ESHU_DB.setTable('groups', next)` directly. The local mirror without
  the reactive `STATE` push won't update visible UI; the server won't see it
  until the next bulk-sync debounce.
- ❌ Mutating in-place objects pulled from `STATE.get(...)`. Always rebuild
  via the helper so reactive subscribers fire.

---

## Onboarding flow (canonical)

1. **Register.** `POST /api/auth/register` creates a `User` and a `Profile`.
2. **Initial sync.** Frontend pulls `GET /api/sync`. The response includes
   `values.currentProfileId` (canonical server profile id).
3. **Join default group.** User clicks *Join Group & Unlock Games*.
   `joinGroup('group_default')` calls `ESHU_API.groups.join('group_default')`.
4. **Server-side materialisation.** `groups.service.ensureDefaultOnboardingContent`
   upserts `Group(group_default)` and `Game(game_default)`, and inserts the
   profile into both `GroupMember(group_default, profileId)` and
   `GameMember(game_default, profileId)` in one transaction.
5. **Apply + refresh.** `ESHU_SYNC.mutate` upserts the returned group into the
   local mirror and `refresh: true` pulls `/api/sync` so the materialised
   `game_default` row reaches the mirror too.
6. **Gates unlock.** Create-game button stops blocking because both
   `STATE.get('groups')` and `ESHU_DB.getTable('groups')` now contain
   `group_default` with the active profile in `memberProfileIds`.
7. **Persistence.** Refresh the page, restart the server — the join survives
   because the canonical state is in PostgreSQL.

---

## Server-side guarantees

- **Foreign keys with explicit cascades.** Defined in `schema.prisma`. Deleting
  a `Profile` removes its `GroupMember`/`GameMember` rows but does not delete
  the system-default `group_default`/`game_default` rows themselves.
- **System-default group membership is additive.** `sync.service.bulkReplace`
  refuses to drop a member that another user added when reconciling a system
  default group. See `src/test/db-invariants.test.ts`.
- **Denormalised `Group.members` counts** are recomputed from the join table
  after every join/leave. The invariant test pins this.
- **`UserSetting.data` passthrough.** The PUT `/api/sync` schema is
  `passthrough` on `values` and merges unknown top-level keys
  (`readMessageIds_*`, `earnedMilestones_*`, `creationUploadUnlocked_*`)
  into `UserSetting.data` so profile-scoped onboarding flags round-trip.

---

## Migrations and schema hygiene

| Script                          | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| `npm run db:generate`           | Regenerate `@prisma/client` after schema edits       |
| `npm run db:migrate`            | Create + apply a new dev migration                   |
| `npm run db:deploy`             | Apply pending migrations in prod (no codegen)        |
| `npm run db:status`             | Show migration state vs. the database                |
| `npm run db:drift`              | Exit non-zero if schema and DB differ                |
| `npm run db:format`             | `prisma format` on the schema                        |
| `npm run db:validate`           | `prisma validate` on the schema                      |
| `npm run db:lint:sql`           | Lint migration SQL (no implicit destructive DDL)     |
| `npm run db:check`              | `db:lint:sql && db:status` — suitable for CI         |
| `npm run smoke:onboarding`      | End-to-end onboarding smoke vs. a running server     |

### SQL linter rules (see `scripts/lint-sql.mjs`)

- All files must end with a newline.
- No tabs; no trailing whitespace.
- In non-init migrations, `DROP TABLE`, `DROP COLUMN`, or `DROP ... CASCADE`
  require a `-- @allow-destructive` opt-in on the preceding line.

### Server startup invariants (see `src/db/invariants.ts`)

Run before the listening socket opens:

1. `SELECT 1` connectivity probe.
2. At least one applied migration exists in `_prisma_migrations`.
3. No pending or rolled-back migrations.

In production a failure calls `process.exit(1)`. In development it logs a
warning so hot-reloading is not blocked.

---

## Audit findings (and how this design prevents them)

| Symptom                                    | Old root cause                                     | Now prevented by                                                |
| ------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------- |
| "Joined group, still asked to join"        | `STATE.set('groups', ...)` without `ESHU_DB`       | `ESHU_SYNC.mutate` writes both                                  |
| "Game form submits, nothing persists"      | `STATE.set('games', ...)` only                     | `ESHU_SYNC.mutate` writes both + refresh                        |
| "Messages reset every navigation"          | zod stripped flat scoped keys from `/api/sync` PUT | `bulkSchema.values` uses `.passthrough()` + merge into `data`   |
| "Default game disappears after restart"    | Default never materialised on the server           | `ensureDefaultOnboardingContent` runs on join and on bulk sync  |
| "Create-game toast fires before sync pull" | URL action ran before remote driver activated      | `runUrlActionsWhenReady` defers until `eshu:remote-activated`   |
| "Two users overwrite each other's join"    | bulk replace was destructive                       | Additive reconciliation for system-default groups               |
| "Migration applied but schema drifted"     | No drift detection                                 | `db:drift`, `db:status`, startup invariants                     |
| "New account inherits previous user's state"| Flat localStorage keys (`comments_`, `_awards_granted_`, `burnedDismissed`, etc.) weren't cleared on logout | Logout sweeps `ACCOUNT_SCOPED_PREFIXES` + `ACCOUNT_SCOPED_EXACT_KEYS`; server tests `session-isolation.test.ts` |
| "Group/game logo disappears after a save"  | Granular `POST/PATCH` zod schemas dropped legacy top-level `image`; `/api/sync` then overwrote local with the imageless row | Schemas accept `image`; service folds it into `data.image`; `toWire` re-surfaces it; regression covered by `groups.test.ts` and `games.test.ts` |
| "Default game missing from 'Your Games'"   | Sidebar `mine` filter only matched `ownerProfileId`; `game_default` has `ownerProfileId: null` and is attached via `memberProfileIds` | Filter now treats owner OR membership as "yours" (members see active rows only) |
| "Create-game form forces re-picking host"  | Host-group modal always opened with no selection                | `resolveDefaultHostGroup` pre-selects source-context → primary group → only-joined fallback; user can still override |

---

## Test surface

- `src/test/auth.test.ts` — auth flow.
- `src/test/groups.test.ts` — group CRUD + default-group join + **image round-trip across partial PATCH and `/api/sync`**.
- `src/test/games.test.ts` — game image round-trip across partial PATCH and `/api/sync` (regression for the #6 logo-loss bug).
- `src/test/sync.test.ts` — bulk sync semantics.
- `src/test/assets.test.ts` — asset upload/download.
- `src/test/db-invariants.test.ts` — schema invariants (migrations table
  sanity, join-table consistency, additive system-default membership, FK
  cascade behaviour, simulated reconnect).
- `src/test/session-isolation.test.ts` — UserSetting.data is per-user;
  logout + new register yields a snapshot free of the previous user's
  scoped keys and memberships.

Total: **43 backend tests** (all passing as of this writing).

End-to-end smoke scripts (run against a live server):

- `npm run smoke:onboarding` — register → join → reload.
- `npm run smoke:account-cycle` — register A → join → set read flags →
  logout → register B → verify clean snapshot → logout → re-login A and
  verify A's state is intact.
