# ESHU Remote Backend (Phase 2 + 3)

The legacy frontend can keep running entirely on `localStorage`, OR transparently swap the bulk DB blob to the Node/Postgres backend. No page-level code changes — the swap happens through the existing pluggable driver layer in `eshu-db.js`.

## Architecture

```
HTML page
  └─ eshu-db.js (uses driver.getItem / setItem)
       ├── localstorage driver  (default, today)
       └── remote     driver    (new; this folder)
                └─ ESHU_API (api.js)
                     └─ Express  →  Prisma  →  PostgreSQL
```

`api.js` is a generic fetch wrapper. `remote-storage-driver.js` registers a "remote" driver that mirrors the bulk DB shape via `GET / PUT /api/sync`.

## Script include order

Every page that should support the remote backend needs (in this order, BEFORE other page scripts run):

```html
<!-- 1. API client (no UI) -->
<script src="assets/core/api.js"></script>

<!-- 2. Existing local DB (unchanged) -->
<script src="assets/eshu-db.js"></script>

<!-- 3. Remote driver (opt-in via flag) -->
<script src="assets/core/remote-storage-driver.js"></script>

<!-- 4. Auth UI (Phase 4) -->
<script src="assets/components/auth-overlay.js"></script>
<script src="assets/components/auth-chip.js"></script>
```

`api.js` must come before `eshu-db.js`. Steps 3, 4 can come in any order after step 2.

> Optional, recommended: add `<meta name="eshu-api-base" content="http://localhost:3000/api">` in the page `<head>` to make the API base explicit. Otherwise it auto-detects (default: `http://<host>:3000/api` for `localhost`/`127.0.0.1`, else same-origin `/api`).

## Enable / disable at runtime

The driver is **opt-in** to keep current behaviour identical until you flip the switch.

```js
// Turn on (will reload):
ESHU_REMOTE.enable();

// Turn off:
ESHU_REMOTE.disable();

// Or visit any page with ?backend=remote once; it persists in localStorage.
```

You can also gate it per-environment with `<html data-eshu-backend="remote">`.

## What happens on activation

1. Probe `GET /api/auth/me`. If 401, the driver dispatches `eshu:sync-unauthenticated` and stays inactive — `localStorage` continues to render the page. The Phase 4 auth overlay (if included) opens automatically.
2. `GET /api/sync` is called once. The response is cached in memory.
3. The driver registers itself as `remote` and is set active.
4. Every `setItem(DB_KEY, json)` updates the cache and schedules a debounced `PUT /api/sync` (600 ms).
5. Subscribers (UI components) are notified via the existing driver subscribe channel.

## Auth UI (Phase 4)

Two small components under `pages/assets/components/`:

- **`auth-overlay.js`** — a brutalist sign-in / register modal that auto-opens on `eshu:sync-unauthenticated`. Matches the existing palette (no radius, no shadows, monochrome + red accent, dark-mode aware).
  - `ESHU_AUTH_UI.open({ tab: 'signin' | 'register' })`
  - `ESHU_AUTH_UI.close()`
  - `ESHU_AUTH_UI.logout()`  ← clears session + reloads
- **`auth-chip.js`** — a small fixed bottom-right indicator showing the current account (or a "Sign in" trigger). Auto-mounts only when the remote backend is enabled. Disable per page with `<html data-eshu-auth-chip="off">` or mount it inline with `ESHU_AUTH_CHIP.mount(targetEl)`.

Both are zero-config — once the scripts are included they listen to the same events the remote driver dispatches and need no per-page wiring.

## Events you can listen for

```js
window.addEventListener('eshu:remote-activated', (e) => console.log('signed in as', e.detail.user));
window.addEventListener('eshu:sync-success', () => /* show subtle "saved" indicator */);
window.addEventListener('eshu:sync-error',   (e) => /* surface e.detail.error to the user */);
window.addEventListener('eshu:sync-unauthenticated', () => /* show login overlay */);
```

## Known limitations (intentional)

- **Single-device assumption**: `PUT /api/sync` does a bulk upsert. Two devices saving in parallel will not merge — last writer wins. For multi-device editing, prefer the granular endpoints (`ESHU_API.groups.create`, etc.).
- **Soft delete only**: status is set to `deleted`/`burned`; rows are never removed from the server by `PUT /api/sync`. This prevents stale clients from wiping data.
- **Asset images**: images stored in IndexedDB by the legacy `media-store.js` are not yet pushed to the server. Use `ESHU_API.assets.upload(blob)` and store the returned `assetId` in `creation.imageAssetId` for server-side images. Migration of existing IndexedDB blobs is a separate phase.

## Quick smoke test in DevTools

```js
// Confirm api wrapper
await ESHU_API.auth.me();

// Pull what the server has
await ESHU_API.sync.pull();

// Activate remote backend
ESHU_REMOTE.enable();   // page reloads

// After reload, on any page:
ESHU_DB.getStorageDriverName(); // -> 'remote'
```
