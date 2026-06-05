/**
 * Remote storage driver for ESHU_DB.
 *
 * Drops in to the existing pluggable driver layer in pages/assets/eshu-db.js.
 * Reads/writes the entire DB blob through GET / PUT /api/sync.
 *
 * Activation is opt-in. Any of:
 *   - URL query:  ?backend=remote
 *   - localStorage.eshu_backend === 'remote'
 *   - <html data-eshu-backend="remote">
 *
 * Architecture:
 *   ESHU_DB calls the driver synchronously (getItem / setItem return / accept
 *   strings immediately). HTTP is async, so this driver maintains an
 *   in-memory cache that mirrors the legacy DB blob:
 *     - On activation, fetch /api/sync and prime the cache.
 *     - getItem(DB_KEY) returns the cached JSON string.
 *     - setItem(DB_KEY, json) updates the cache and schedules a debounced
 *       PUT /api/sync push.
 *
 * Trade-off (intentional): every save sends the full DB. With realistic
 * sizes this is small, and avoids client-side diffing complexity. For
 * concurrent multi-device editing prefer the granular endpoints
 * (ESHU_API.groups/games/creations/profiles).
 *
 * Errors during push are surfaced via:
 *   - console.error
 *   - window.dispatchEvent(new CustomEvent('eshu:sync-error', { detail: { error } }))
 *   - window.dispatchEvent(new CustomEvent('eshu:sync-success'))
 *   Pages can listen and show a toast without coupling to this module.
 */
(function () {
  'use strict';

  // Legacy keys to purge when moving between authenticated users in remote mode.
  const LEGACY_STORAGE_KEYS = ['eshu_db_v1', 'groups', 'games', 'creationsList', 'xpPoints', 'profileName', 'profileDesc', 'primaryGroupId', 'userProfile'];
  const DRIVER_NAME = 'remote';
  const PUSH_DEBOUNCE_MS = 600;

  function isHostedDeployment() {
    try {
      const host = location.hostname;
      return !!(host && host !== 'localhost' && host !== '127.0.0.1');
    } catch {
      return false;
    }
  }

  function shouldUseRemote() {
    if (isHostedDeployment()) return true;
    try {
      const params = new URLSearchParams(location.search || '');
      const fromQuery = params.get('backend');
      if (fromQuery) {
        // Persist for subsequent navigations within the app.
        try { localStorage.setItem('eshu_backend', fromQuery); } catch {}
        return fromQuery === 'remote';
      }
    } catch {}
    try {
      const htmlAttr = document.documentElement && document.documentElement.dataset
        ? document.documentElement.dataset.eshuBackend
        : null;
      if (htmlAttr === 'remote') return true;
    } catch {}
    try {
      return localStorage.getItem('eshu_backend') === 'remote';
    } catch {
      return false;
    }
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch {}
  }

  function safeParseJson(value) {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function toUpdatedAtMs(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    const updatedAt = snapshot.updatedAt;
    if (!updatedAt || typeof updatedAt !== 'string') return 0;
    const ms = Date.parse(updatedAt);
    return Number.isFinite(ms) ? ms : 0;
  }

  // UI-only preferences that are never stored on the server and must always
  // be taken from the local snapshot when merging with a server pull.
  const LOCAL_ONLY_VALUE_KEYS = ['uiTheme', 'hideBurned', 'devModeEnabled', 'infiniteVotes'];

  function mergeProfileScopedFlags(baseSnapshot, localSnapshot) {
    if (!baseSnapshot || typeof baseSnapshot !== 'object') return baseSnapshot;
    if (!localSnapshot || typeof localSnapshot !== 'object') return baseSnapshot;
    const localValues = localSnapshot.values && typeof localSnapshot.values === 'object' ? localSnapshot.values : {};
    const prefixes = ['readMessageIds_', 'earnedMilestones_', 'creationUploadUnlocked_'];
    const keys = Object.keys(localValues).filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
    // Also carry over local-only UI preference keys regardless of prefix match.
    const localOnlyKeys = LOCAL_ONLY_VALUE_KEYS.filter((key) => localValues[key] !== undefined && localValues[key] !== null);
    const allKeys = Array.from(new Set([...keys, ...localOnlyKeys]));
    if (!allKeys.length) return baseSnapshot;
    let merged;
    try {
      merged = JSON.parse(JSON.stringify(baseSnapshot));
    } catch {
      return baseSnapshot;
    }
    if (!merged.values || typeof merged.values !== 'object') merged.values = {};
    for (const key of allKeys) {
      const localValue = localValues[key];
      const existingValue = merged.values[key];
      if (Array.isArray(localValue)) {
        const set = new Set(Array.isArray(existingValue) ? existingValue : []);
        localValue.forEach((id) => { if (id) set.add(id); });
        merged.values[key] = Array.from(set);
      } else if (LOCAL_ONLY_VALUE_KEYS.includes(key)) {
        // Local-only keys always win over whatever the server has (or doesn't have).
        merged.values[key] = localValue;
      } else if (existingValue === undefined) {
        merged.values[key] = localValue;
      }
    }
    return merged;
  }

  // Entity tables whose locally-created rows must NEVER be silently dropped by
  // a server pull. The server never hard-deletes (soft-delete via status), so
  // any row present locally but ABSENT from the server pull is one that simply
  // hasn't synced yet (created offline, or its push hasn't landed). Adopting
  // the server snapshot wholesale would erase it — the "it disappears when I'm
  // signed in" divergence from offline. We union those rows back in and mark
  // the result dirty so they get pushed on activation.
  const UNION_TABLES = ['groups', 'games', 'creations'];

  function unionLocalRows(serverSnapshot, localSnapshot) {
    if (!serverSnapshot || typeof serverSnapshot !== 'object') return { snapshot: serverSnapshot, added: false };
    if (!localSnapshot || typeof localSnapshot !== 'object') return { snapshot: serverSnapshot, added: false };
    const sTables = serverSnapshot.tables && typeof serverSnapshot.tables === 'object' ? serverSnapshot.tables : {};
    const lTables = localSnapshot.tables && typeof localSnapshot.tables === 'object' ? localSnapshot.tables : {};
    let next = serverSnapshot;
    let added = false;
    for (const table of UNION_TABLES) {
      const localRows = Array.isArray(lTables[table]) ? lTables[table] : [];
      if (!localRows.length) continue;
      const serverRows = Array.isArray(sTables[table]) ? sTables[table] : [];
      const serverIds = new Set(serverRows.map((r) => r && r.id).filter(Boolean));
      const missing = localRows.filter((r) => r && r.id && !serverIds.has(r.id));
      if (!missing.length) continue;
      if (next === serverSnapshot) {
        try {
          next = JSON.parse(JSON.stringify(serverSnapshot));
        } catch {
          return { snapshot: serverSnapshot, added: false };
        }
        if (!next.tables || typeof next.tables !== 'object') next.tables = {};
      }
      const baseRows = Array.isArray(next.tables[table]) ? next.tables[table] : [];
      next.tables[table] = baseRows.concat(missing);
      added = true;
    }
    return { snapshot: next, added };
  }

  function adoptServer(pulled, local) {
    const flagged = mergeProfileScopedFlags(pulled, local);
    const unioned = unionLocalRows(flagged, local);
    const changed = flagged !== pulled || unioned.added;
    return { snapshot: unioned.snapshot, source: changed ? 'merged' : 'server' };
  }

  function resolveInitialSnapshot(cacheKey, dbKey, pulledSnapshot) {
    const pulled = pulledSnapshot && typeof pulledSnapshot === 'object' ? pulledSnapshot : {};
    let local = null;
    const seenKeys = new Set();
    const localKeys = [cacheKey, dbKey].filter((key) => {
      if (!key || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    for (const key of localKeys) {
      try {
        const candidate = safeParseJson(localStorage.getItem(key));
        if (!candidate) continue;
        if (!local || toUpdatedAtMs(candidate) > toUpdatedAtMs(local)) {
          local = candidate;
        }
      } catch {
      }
    }

    const pulledMs = toUpdatedAtMs(pulled);
    const localMs = toUpdatedAtMs(local);
    if (hasServerProgress(pulled)) {
      return adoptServer(pulled, local);
    }
    if (local && localMs > pulledMs) {
      return { snapshot: local, source: 'local' };
    }
    return adoptServer(pulled, local);
  }

  // Whether a cached local snapshot is rich enough to render the page from
  // immediately (optimistic activation). We require a profile + a current
  // profile pointer so list filters resolve to the right owner; otherwise we
  // fall back to the blocking pull so a fresh login never flashes empty UI.
  function hasUsableData(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const tables = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : null;
    if (!tables) return false;
    const profiles = Array.isArray(tables.profiles) ? tables.profiles : [];
    const hasProfile = profiles.some((p) => p && p.id);
    const hasCurrent = !!(snapshot.values && snapshot.values.currentProfileId);
    return hasProfile && hasCurrent;
  }

  function hasServerProgress(snapshot) {
    const tables = snapshot && typeof snapshot === 'object' && snapshot.tables && typeof snapshot.tables === 'object'
      ? snapshot.tables
      : {};
    const profiles = Array.isArray(tables.profiles) ? tables.profiles : [];
    const creations = Array.isArray(tables.creations) ? tables.creations : [];
    const games = Array.isArray(tables.games) ? tables.games : [];
    const groups = Array.isArray(tables.groups) ? tables.groups : [];

    if (profiles.some((p) => p && Number(p.xpPoints || 0) > 0)) return true;
    if (creations.some((c) => c && c.status !== 'deleted' && c.status !== 'burned')) return true;
    if (games.some((g) => g && g.id !== 'game_default' && g.status !== 'deleted' && g.status !== 'burned')) return true;
    if (groups.some((g) => g && g.id !== 'group_default' && g.status !== 'deleted' && g.status !== 'burned')) return true;
    return false;
  }

  function createRemoteDriver(initialDb, dbKey, cacheKey) {
    let cache = JSON.stringify(initialDb || {});
    let pushTimer = null;
    let inflight = null;
    let pendingAfterInflight = false;
    // True whenever `cache` holds changes not yet confirmed-saved on the
    // server. Drives the navigation flush below so a quick page change can't
    // outrun the debounced push and lose the write.
    let dirty = false;

    function writeLocalMirror() {
      try {
        localStorage.setItem(cacheKey || dbKey, cache);
      } catch {}
    }

    writeLocalMirror();

    async function pushNow() {
      if (inflight) {
        // Coalesce: we'll re-push when current call resolves.
        pendingAfterInflight = true;
        return;
      }
      const snapshot = cache;
      let body;
      try {
        body = JSON.parse(snapshot);
      } catch (err) {
        console.error('[ESHU remote] cache is not valid JSON; aborting push', err);
        emit('eshu:sync-error', { error: err });
        return;
      }
      inflight = window.ESHU_API.sync.push(body)
        .then(() => {
          // Only clear the dirty flag if nothing was written while this push
          // was in flight; otherwise newer edits still need to go up.
          if (cache === snapshot) dirty = false;
          emit('eshu:sync-success');
        })
        .catch((err) => {
          console.error('[ESHU remote] push failed', err);
          emit('eshu:sync-error', { error: err });
        })
        .finally(() => {
          inflight = null;
          if (pendingAfterInflight) {
            pendingAfterInflight = false;
            schedulePush();
          }
        });
    }

    function schedulePush() {
      dirty = true;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        pushTimer = null;
        pushNow();
      }, PUSH_DEBOUNCE_MS);
    }

    // Last-chance synchronous save when the page is being hidden/unloaded
    // (link click, back/forward, tab close, mobile background). A normal
    // fetch would be aborted as the document tears down; `keepalive` lets the
    // browser finish the request after navigation. This is what makes the
    // signed-in experience match offline: changes are durable across page
    // transitions instead of depending on the 600ms debounce winning the
    // race. Body cap for keepalive is ~64KB; if exceeded we still attempt it
    // and the regular debounced push remains the fallback on the next load.
    function flushOnExit() {
      if (!dirty) return;
      try {
        const base = (window.ESHU_API && window.ESHU_API.base) || '/api';
        fetch(base + '/sync', {
          method: 'PUT',
          credentials: 'include',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: cache,
        }).then(() => { dirty = false; }).catch(() => {});
      } catch {}
    }
    try {
      window.addEventListener('pagehide', flushOnExit);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushOnExit();
      });
    } catch {}

    return {
      name: DRIVER_NAME,

      getItem(key) {
        if (key === dbKey) return cache;
        // The legacy driver protocol allows arbitrary keys (e.g. xp_history_*).
        // For now, fall through to localStorage so non-bulk reads still work
        // during the transition.
        try { return localStorage.getItem(key); } catch { return null; }
      },

      setItem(key, value) {
        if (key === dbKey) {
          cache = String(value);
          writeLocalMirror();
          schedulePush();
          return;
        }
        try { localStorage.setItem(key, value); } catch {}
      },

      removeItem(key) {
        if (key === dbKey) {
          cache = JSON.stringify({});
          writeLocalMirror();
          schedulePush();
          return;
        }
        try { localStorage.removeItem(key); } catch {}
      },

      listKeys() {
        const keys = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) keys.push(k);
          }
        } catch {}
        if (!keys.includes(dbKey)) keys.unshift(dbKey);
        return keys;
      },

      subscribe(fn) {
        return () => {};
      },

      // Replace the in-memory cache with a reconciled snapshot (used by the
      // background-pull phase of activation). Does NOT schedule a push — the
      // snapshot already reflects server truth; callers decide whether to push
      // (e.g. when local-only rows were unioned in).
      __applySnapshot(snapshotObj) {
        try { cache = JSON.stringify(snapshotObj || {}); } catch { return; }
        writeLocalMirror();
      },

      // Test/diagnostic hook. Marks dirty first so that if this push is still
      // in flight when the page navigates away, flushOnExit re-delivers via
      // keepalive (the in-flight fetch would otherwise be aborted).
      __forcePushNow: () => { dirty = true; return pushNow(); },
      __flushOnExit: flushOnExit,
      __getCache: () => cache
    };
  }

  // Keys that should be wiped on logout. Each entry is either an exact key
  // or a prefix matcher. Anything user-scoped that page code writes as a
  // flat global localStorage key must be listed here, otherwise it leaks
  // into the next account on the same browser.
  const ACCOUNT_SCOPED_PREFIXES = [
    'xp_history_',            // per-profile xp ring buffer
    'comments_',              // per-group/game/creation thread blobs
    '_awards_granted_',       // one-shot game-end XP award guards
    'creationUploadUnlocked_',// upload gate (also lives in db.values)
    'earnedMilestones_',      // onboarding milestone progress
    'readMessageIds_',        // inbox read flags
    'burnedDismissed',        // burned-modal "do not show again" records
  ];
  // Exact keys to drop. Theme is intentionally NOT here so the user's
  // light/dark preference survives logout, as in any normal app.
  // The hud.* keys are the instant-paint caches for the top-nav XP counter
  // and the auth chip's identity; clearing them on logout stops the previous
  // account's XP/name from flashing for the next user on this browser.
  const ACCOUNT_SCOPED_EXACT_KEYS = ['comments', 'eshu.hud.xp', 'eshu.hud.auth'];

  // Standalone key for UI-only preferences that must survive account cache clears.
  const UI_PREFS_KEY = 'eshu_ui_prefs';

  function saveUiPrefsBeforeClear(dbKey) {
    try {
      const keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k) keys.push(k);
      }
      const userKeyPrefix = dbKey + '__user_';
      var best = null;
      var bestMs = -1;
      keys.forEach(function (k) {
        if (!k.startsWith(userKeyPrefix)) return;
        try {
          var c = JSON.parse(localStorage.getItem(k));
          if (c && c.values && typeof c.values.uiTheme === 'string') {
            var ms = c.updatedAt ? Date.parse(c.updatedAt) : 0;
            if (!best || ms > bestMs) { best = c; bestMs = ms; }
          }
        } catch {}
      });
      if (best && best.values) {
        var prefs = {};
        LOCAL_ONLY_VALUE_KEYS.forEach(function (key) {
          if (best.values[key] !== undefined && best.values[key] !== null) prefs[key] = best.values[key];
        });
        if (Object.keys(prefs).length) localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
      }
    } catch {}
  }

  function clearLocalAccountCache(dbKey) {
    saveUiPrefsBeforeClear(dbKey);
    try {
      if (dbKey) {
        localStorage.removeItem(dbKey);
      }
      LEGACY_STORAGE_KEYS.forEach((key) => {
        localStorage.removeItem(key);
      });
      ACCOUNT_SCOPED_EXACT_KEYS.forEach((key) => {
        try { localStorage.removeItem(key); } catch {}
      });
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }
      const perAccountPrefix = `${dbKey}__user_`;
      keys.forEach((key) => {
        if (key.startsWith(perAccountPrefix)) {
          try { localStorage.removeItem(key); } catch {}
          return;
        }
        for (const prefix of ACCOUNT_SCOPED_PREFIXES) {
          if (key.startsWith(prefix)) {
            try { localStorage.removeItem(key); } catch {}
            return;
          }
        }
      });
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
  }

  function safeCachePart(value) {
    return String(value || 'anonymous')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'anonymous';
  }

  function accountCacheKey(dbKey, user) {
    const userKey = user && (user.id || user.username || user.email);
    return `${dbKey}__user_${safeCachePart(userKey)}`;
  }

  /**
   * Diagnostic preflight. Runs only when remote activation has already failed
   * or returned no session. Probes /healthz (no credentials) to distinguish:
   *   - server unreachable / not running
   *   - server reachable but session cookie absent (just need to sign in)
   *   - server reachable but cross-origin credentials mishandled
   * Emits a single actionable console line. Safe to call repeatedly.
   */
  async function preflightDiagnose(reason) {
    const apiBase = (window.ESHU_API && window.ESHU_API.base) || '/api';
    const healthUrl = String(apiBase).replace(/\/api\/?$/, '') + '/healthz';
    let healthOk = false;
    let healthErr = null;
    try {
      const res = await fetch(healthUrl, { credentials: 'omit' });
      healthOk = res.ok;
    } catch (err) {
      healthErr = err;
    }

    const sameOrigin = (() => {
      try {
        if (apiBase.startsWith('/')) return true;
        return new URL(apiBase, location.href).origin === location.origin;
      } catch { return false; }
    })();

    if (!healthOk) {
      console.warn(
        `[ESHU remote] preflight: server not reachable at ${healthUrl}. ` +
        `Start it with \`npm run dev\` (or check the port). Reason: ${reason}. ` +
        (healthErr ? `Network error: ${healthErr.message}` : 'Non-2xx from /healthz.')
      );
      return 'server-unreachable';
    }

    if (reason === 'unauthenticated') {
      console.info(
        `[ESHU remote] preflight: server is up but no active session. ` +
        `Sign in via the auth overlay. Origin=${location.origin}, API=${apiBase}.`
      );
      return 'no-session';
    }

    if (!sameOrigin) {
      console.warn(
        `[ESHU remote] preflight: server reachable but auth probe failed across origins ` +
        `(${location.origin} -> ${apiBase}). Check CORS_ORIGIN on the server includes ` +
        `"${location.origin}" and the session cookie uses SameSite=None; Secure for HTTPS, ` +
        `or use same-origin (serve pages via the API server).`
      );
      return 'cross-origin';
    }

    console.warn(
      `[ESHU remote] preflight: server reachable, same-origin, but auth probe failed. ` +
      `Likely a stale session cookie or a server-side error. Reason: ${reason}.`
    );
    return 'unknown';
  }

  /**
   * Phase 1: rewrite legacy local profile ids (e.g. 'profile_default') to the
   * server's canonical profile id, using the pulled server snapshot as the
   * source of truth.
   *
   * Pure function: takes (localSnapshot, serverSnapshot), returns a new
   * snapshot with all references remapped. If nothing needs rewriting it
   * returns the input unchanged (idempotent).
   *
   * Fields covered (everything that affects gating + ownership today):
   *   - values.currentProfileId
   *   - tables.profiles[].id
   *   - tables.groups[].{ownerProfileId, memberProfileIds[]}
   *   - tables.games[].{ownerProfileId, createdByProfileId}
   *   - tables.creations[].{ownerProfileId, createdByProfileId, authorProfileId}
   *   - values.xpHistoryByProfileId   (object keyed by profileId)
   *   - values.primaryGroupByProfileId (object keyed by profileId)
   *   - values.creationUploadUnlocked_<pid> and values.earnedMilestones_<pid>
   *
   * Out of scope for now: nested comment authorProfileId (doesn't affect
   * gating; remap later if attribution turns out to be visibly wrong).
   */
  function migrateLegacyProfileIds(localSnapshot, serverSnapshot) {
    if (!localSnapshot || typeof localSnapshot !== 'object') return localSnapshot;
    if (!serverSnapshot || typeof serverSnapshot !== 'object') return localSnapshot;

    const serverProfiles = Array.isArray(serverSnapshot?.tables?.profiles)
      ? serverSnapshot.tables.profiles
      : [];
    const serverActiveId = serverSnapshot?.values?.currentProfileId
      || (serverProfiles[0] && serverProfiles[0].id)
      || null;
    if (!serverActiveId) return localSnapshot;

    const serverIds = new Set(serverProfiles.map((p) => p && p.id).filter(Boolean));
    const localProfiles = Array.isArray(localSnapshot?.tables?.profiles)
      ? localSnapshot.tables.profiles
      : [];

    // Build remap: any local profile id that isn't on the server is treated as
    // a legacy id and rewritten to the server's active id. Current model is
    // single-profile-per-user, so this is safe.
    const remap = new Map();
    for (const p of localProfiles) {
      if (p && p.id && !serverIds.has(p.id)) {
        remap.set(p.id, serverActiveId);
      }
    }
    if (remap.size === 0) return localSnapshot;

    const swap = (id) => (id && remap.has(id)) ? remap.get(id) : id;

    // Deep clone via JSON to avoid mutating the input.
    let next;
    try {
      next = JSON.parse(JSON.stringify(localSnapshot));
    } catch {
      return localSnapshot;
    }

    if (next.tables && typeof next.tables === 'object') {
      // Profiles: rewrite ids. Dedupe if two locals collapse onto one canonical.
      if (Array.isArray(next.tables.profiles)) {
        const seen = new Set();
        const out = [];
        for (const p of next.tables.profiles) {
          if (!p) continue;
          if (p.id && remap.has(p.id)) p.id = remap.get(p.id);
          if (p.id && seen.has(p.id)) continue;
          if (p.id) seen.add(p.id);
          out.push(p);
        }
        next.tables.profiles = out;
      }

      if (Array.isArray(next.tables.groups)) {
        for (const g of next.tables.groups) {
          if (!g) continue;
          if (g.ownerProfileId) g.ownerProfileId = swap(g.ownerProfileId);
          if (Array.isArray(g.memberProfileIds)) {
            const set = new Set();
            const remapped = [];
            for (const mid of g.memberProfileIds) {
              const v = swap(mid);
              if (v && !set.has(v)) { set.add(v); remapped.push(v); }
            }
            g.memberProfileIds = remapped;
          }
        }
      }

      if (Array.isArray(next.tables.games)) {
        for (const game of next.tables.games) {
          if (!game) continue;
          if (game.ownerProfileId) game.ownerProfileId = swap(game.ownerProfileId);
          if (game.createdByProfileId) game.createdByProfileId = swap(game.createdByProfileId);
        }
      }

      if (Array.isArray(next.tables.creations)) {
        for (const c of next.tables.creations) {
          if (!c) continue;
          if (c.ownerProfileId) c.ownerProfileId = swap(c.ownerProfileId);
          if (c.createdByProfileId) c.createdByProfileId = swap(c.createdByProfileId);
          if (c.authorProfileId) c.authorProfileId = swap(c.authorProfileId);
        }
      }
    }

    if (next.values && typeof next.values === 'object') {
      if (next.values.currentProfileId) {
        next.values.currentProfileId = swap(next.values.currentProfileId);
      }

      // Object-keyed-by-profile maps.
      const objectKeyedMaps = ['xpHistoryByProfileId', 'primaryGroupByProfileId'];
      for (const mapKey of objectKeyedMaps) {
        const src = next.values[mapKey];
        if (src && typeof src === 'object' && !Array.isArray(src)) {
          const dst = {};
          for (const [pid, val] of Object.entries(src)) {
            const canonical = swap(pid);
            // Merge if two legacy ids collapse onto the same canonical id.
            // For xp history we concatenate; for primary group we keep the
            // existing value (first write wins).
            if (mapKey === 'xpHistoryByProfileId' && Array.isArray(dst[canonical]) && Array.isArray(val)) {
              dst[canonical] = dst[canonical].concat(val);
            } else if (dst[canonical] === undefined) {
              dst[canonical] = val;
            }
          }
          next.values[mapKey] = dst;
        }
      }

      // Scoped value keys with a `<prefix><profileId>` shape.
      const scopedPrefixes = ['creationUploadUnlocked_', 'earnedMilestones_', 'readMessageIds_'];
      for (const key of Object.keys(next.values)) {
        for (const prefix of scopedPrefixes) {
          if (key.startsWith(prefix)) {
            const oldId = key.slice(prefix.length);
            if (remap.has(oldId)) {
              const newKey = prefix + remap.get(oldId);
              // Prefer existing canonical-keyed value if both exist.
              if (next.values[newKey] === undefined) {
                next.values[newKey] = next.values[key];
              }
              delete next.values[key];
            }
            break;
          }
        }
      }
    }

    return next;
  }

  function waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        try {
          if (predicate()) return resolve();
        } catch {}
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(tick, 25);
      };
      tick();
    });
  }

  async function activate() {
    if (!window.ESHU_API) {
      console.warn('[ESHU remote] api.js not loaded; remote backend disabled');
      return;
    }

    try {
      await waitFor(() => !!(window.ESHU_DB && typeof window.ESHU_DB.registerStorageDriver === 'function'), 5000);
    } catch {
      console.warn('[ESHU remote] ESHU_DB never became available; remote backend disabled');
      return;
    }

    const dbKey = window.ESHU_DB && typeof window.ESHU_DB.key === 'string'
      ? window.ESHU_DB.key
      : 'eshu_db_v2';

    let me = null;
    try {
      me = await window.ESHU_API.auth.me();
    } catch (err) {
      console.error('[ESHU remote] /auth/me failed', err);
      preflightDiagnose('auth-me-error');
      emit('eshu:sync-error', { error: err });
      return;
    }
    if (!me) {
      // Not signed in. Don't switch drivers; legacy localStorage stays active
      // so the page renders normally. The auth overlay listens for
      // eshu:sync-unauthenticated and prompts the user to sign in.
      clearLocalAccountCache(dbKey);
      if (window.ESHU_DB && typeof window.ESHU_DB.resetStorage === 'function') {
        try {
          window.ESHU_DB.resetStorage({ dropLegacy: true });
        } catch {}
      }
      preflightDiagnose('unauthenticated');
      emit('eshu:sync-unauthenticated');
      return;
    }

    const cacheKey = accountCacheKey(dbKey, me.user || {});

    // ----- PHASE 1 (instant): render from the local mirror, no network wait -----
    // If this browser already holds a cached snapshot for THIS signed-in user
    // (a returning session), register the remote driver seeded from it and let
    // the page render immediately. The authoritative /api/sync pull then runs
    // in the BACKGROUND (phase 2) and reconciles. This is what makes signed-in
    // feel like offline: no staring at a loader for the ~3-4s pull on every
    // navigation. First-ever login (no usable cache) skips this and uses the
    // blocking path below so we never flash an empty UI.
    let driver = null;
    let phase1Rendered = false;
    try {
      const localSnap = safeParseJson(localStorage.getItem(cacheKey))
        || safeParseJson(localStorage.getItem(dbKey));
      if (hasUsableData(localSnap)) {
        driver = createRemoteDriver(localSnap, dbKey, cacheKey);
        window.ESHU_DB.registerStorageDriver('remote', () => driver);
        window.ESHU_DB.configureStorageDriver({ driver: 'remote' });
        try { window.ESHU_AUTH = { user: me.user || null }; } catch {}
        phase1Rendered = true;
        emit('eshu:remote-activated', { user: me.user || null });
        console.info('[ESHU remote] activated (cached) for user', (me.user && me.user.username) || '(unknown)');
      }
    } catch (err) {
      console.warn('[ESHU remote] optimistic activation failed; falling back to blocking pull', err);
      driver = null;
      phase1Rendered = false;
    }

    // ----- PHASE 2: pull the authoritative snapshot (background if phase 1 ran) -----
    let initial;
    try {
      initial = await window.ESHU_API.sync.pull();
    } catch (err) {
      console.error('[ESHU remote] /api/sync pull failed', err);
      preflightDiagnose('sync-pull-error');
      emit('eshu:sync-error', { error: err });
      // If we already rendered from cache, keep showing it — the next
      // navigation (or the keepalive flush) retries. Only a no-cache first
      // login is left without data here.
      return;
    }

    // Rewrite legacy local profile ids (e.g. 'profile_default') to the server's
    // canonical id BEFORE reconciliation. Idempotent; no-op when nothing to do.
    let migrationOccurred = false;
    try {
      const seenKeys = new Set();
      [cacheKey, dbKey].forEach((key) => {
        if (!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        const localRaw = safeParseJson(localStorage.getItem(key));
        if (!localRaw) return;
        const migrated = migrateLegacyProfileIds(localRaw, initial);
        if (migrated && migrated !== localRaw) {
          try {
            localStorage.setItem(key, JSON.stringify(migrated));
            migrationOccurred = true;
            console.info('[ESHU remote] migrated legacy profile ids to canonical server ids');
          } catch (writeErr) {
            console.warn('[ESHU remote] migration computed but failed to persist', writeErr);
          }
        }
      });
    } catch (err) {
      console.warn('[ESHU remote] migration step failed, continuing without remap', err);
    }

    const resolved = resolveInitialSnapshot(cacheKey, dbKey, initial);
    const needsPush = resolved.source === 'local' || resolved.source === 'merged' || migrationOccurred;

    try {
      if (phase1Rendered && driver) {
        // Reconcile the already-rendered page with the authoritative snapshot.
        // Re-configuring the same driver invalidates ESHU_DB's in-memory cache
        // so getTable re-reads; sync-success makes open pages rehydrate.
        driver.__applySnapshot(resolved.snapshot);
        window.ESHU_DB.configureStorageDriver({ driver: 'remote' });
        if (needsPush) driver.__forcePushNow();
        emit('eshu:sync-success');
      } else {
        // No usable cache (first login): register now with the resolved
        // snapshot — the original blocking behavior.
        driver = createRemoteDriver(resolved.snapshot, dbKey, cacheKey);
        window.ESHU_DB.registerStorageDriver('remote', () => driver);
        window.ESHU_DB.configureStorageDriver({ driver: 'remote' });
        try { window.ESHU_AUTH = { user: me.user || null }; } catch {}
        if (needsPush) driver.__forcePushNow();
        emit('eshu:remote-activated', { user: me.user || null });
        console.info('[ESHU remote] activated for user', (me.user && me.user.username) || '(unknown)');
      }
    } catch (err) {
      console.error('[ESHU remote] failed to register/reconcile driver', err);
      emit('eshu:sync-error', { error: err });
    }
  }

  // Resolves the active dbKey at call-time so cache clears work even when
  // ESHU_DB hasn't fully booted (logout edge case).
  function resolveDbKey() {
    try {
      if (window.ESHU_DB && typeof window.ESHU_DB.key === 'string') return window.ESHU_DB.key;
    } catch {}
    return 'eshu_db_v2';
  }

  if (!shouldUseRemote()) {
    // Provide a tiny helper so users / pages can flip backend at runtime.
    window.ESHU_REMOTE = {
      enable() { try { localStorage.setItem('eshu_backend', 'remote'); location.reload(); } catch {} },
      disable() { try { localStorage.setItem('eshu_backend', 'local'); location.reload(); } catch {} },
      isEnabled: () => false,
      clearLocalCache: () => clearLocalAccountCache(resolveDbKey()),
      diagnose: () => preflightDiagnose('manual')
    };
    return;
  }

  window.ESHU_REMOTE = {
    enable() { try { localStorage.setItem('eshu_backend', 'remote'); location.reload(); } catch {} },
    disable() { try { localStorage.setItem('eshu_backend', 'local'); location.reload(); } catch {} },
    isEnabled: () => true,
    activate,
    clearLocalCache: () => clearLocalAccountCache(resolveDbKey()),
    diagnose: () => preflightDiagnose('manual')
  };

  // Guarded, idempotent activation. `activate()` sets window.ESHU_AUTH on
  // success; until then it's safe to retry (e.g. it bailed because there was
  // no session yet). `activationInFlight` prevents overlapping pulls.
  let activationInFlight = false;
  function activateOnce() {
    if (window.ESHU_AUTH) return;        // already activated for a signed-in user
    if (activationInFlight) return;
    activationInFlight = true;
    Promise.resolve()
      .then(activate)
      .catch(() => {})
      .finally(() => { activationInFlight = false; });
  }

  // A session can be established WITHOUT a full page reload — notably the
  // Supabase email-confirmation link handler and any sign-in opened with
  // reloadOnSuccess:false. In those cases the initial (unauthenticated)
  // activation already bailed and left the legacy localStorage driver active,
  // so the page keeps a stale local profile id and never pulls server data
  // (created groups/games then don't show in "Your Games/Groups"). Activating
  // here pulls /api/sync, reconciles legacy→canonical profile ids, and
  // rehydrates the open page.
  window.addEventListener('eshu:auth-success', activateOnce);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activateOnce, { once: true });
  } else {
    activateOnce();
  }
})();
