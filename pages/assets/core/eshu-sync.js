/**
 * ESHU_SYNC — server-authoritative mutation pattern (Phase 1)
 *
 * The legacy frontend treats `ESHU_DB` (localStorage) as the source of truth
 * and pushes the whole snapshot to the backend on a debounce. That model
 * caused a cascade of "state forgot the change" bugs (joinGroup, createGame,
 * messages reset, etc.) because:
 *
 *   1. STATE was updated in-memory but never reached ESHU_DB on some paths.
 *   2. Bulk sync writes were strip-validated by zod, dropping unknown keys.
 *   3. Pages navigated before the debounced push completed.
 *
 * This module codifies a small, opinionated pattern instead:
 *
 *   const updatedGroup = await ESHU_SYNC.mutate({
 *     entity: 'groups',
 *     call: () => ESHU_API.groups.join(id),
 *     pick:  (resp) => resp.group,         // wire row to merge into ESHU_DB
 *     refresh: true,                       // also pull /api/sync after success
 *   });
 *
 * Contract:
 *   - `call` is the authoritative REST call. The server is the source of truth.
 *   - `pick` returns ONE row of the named entity (or an array if you set
 *     `bulk: true`) that we merge into `ESHU_DB.getTable(entity)` and into
 *     `STATE.get(entity)`. We always replace-by-id; never partial-merge fields
 *     (the server response is canonical).
 *   - `refresh: true` schedules a single `/api/sync` GET after the mutation
 *     resolves to reconcile any side-effects the server made (e.g. join
 *     materializing `game_default`). Multiple refresh requests inside one
 *     animation frame coalesce into one HTTP call.
 *   - On error, the helper rethrows. Callers are responsible for fallback
 *     paths (e.g. local-mutation when offline).
 *
 * No new dependencies. Uses globals: ESHU_API, ESHU_DB, STATE.
 */
(function () {
  'use strict';

  const ENTITY_TABLES = new Set(['groups', 'games', 'creations', 'profiles']);

  function getTableSafe(name) {
    try {
      if (typeof ESHU_DB !== 'undefined' && ESHU_DB.getTable) {
        const rows = ESHU_DB.getTable(name);
        return Array.isArray(rows) ? rows.slice() : [];
      }
    } catch {}
    if (typeof STATE !== 'undefined' && STATE.get) {
      const rows = STATE.get(name);
      return Array.isArray(rows) ? rows.slice() : [];
    }
    return [];
  }

  function setTableSafe(name, rows) {
    if (!Array.isArray(rows)) return;
    try {
      if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setTable) {
        ESHU_DB.setTable(name, rows);
      }
    } catch (err) {
      console.warn(`[ESHU_SYNC] ESHU_DB.setTable('${name}') failed:`, err);
    }
    try {
      if (typeof STATE !== 'undefined' && STATE.set) STATE.set(name, rows);
    } catch (err) {
      console.warn(`[ESHU_SYNC] STATE.set('${name}') failed:`, err);
    }
  }

  /**
   * Replace-or-append the given row(s) into `tableName` by id. Pure: returns
   * the new array, does not mutate inputs.
   */
  function upsertById(currentRows, incoming) {
    const list = Array.isArray(incoming) ? incoming : [incoming];
    const byId = new Map();
    for (const row of currentRows) {
      if (row && row.id) byId.set(row.id, row);
    }
    for (const row of list) {
      if (!row || !row.id) continue;
      byId.set(row.id, row);
    }
    return Array.from(byId.values());
  }

  function removeById(currentRows, idOrIds) {
    const ids = new Set(Array.isArray(idOrIds) ? idOrIds : [idOrIds]);
    return currentRows.filter((row) => row && !ids.has(row.id));
  }

  /**
   * Apply a server response to the local mirror + reactive state. Returns
   * the merged rows so callers can chain.
   */
  function applyEntityResponse(entity, row) {
    if (!ENTITY_TABLES.has(entity)) {
      throw new Error(`ESHU_SYNC.applyEntityResponse: unknown entity '${entity}'`);
    }
    if (row == null) return getTableSafe(entity);
    const next = upsertById(getTableSafe(entity), row);
    setTableSafe(entity, next);
    return next;
  }

  function removeEntity(entity, idOrIds) {
    if (!ENTITY_TABLES.has(entity)) {
      throw new Error(`ESHU_SYNC.removeEntity: unknown entity '${entity}'`);
    }
    const next = removeById(getTableSafe(entity), idOrIds);
    setTableSafe(entity, next);
    return next;
  }

  // ---- Coalesced refresh ----------------------------------------------------
  //
  // Multiple writes in a single tick should produce one /api/sync pull, not N.
  // We resolve all callers' promises with the same snapshot.

  let pendingRefresh = null;

  function refresh() {
    if (pendingRefresh) return pendingRefresh;
    if (!isRemote()) {
      pendingRefresh = Promise.resolve(null);
      Promise.resolve().then(() => { pendingRefresh = null; });
      return pendingRefresh;
    }
    pendingRefresh = Promise.resolve()
      .then(async () => {
        try {
          const snapshot = await ESHU_API.sync.pull();
          applySnapshot(snapshot);
          return snapshot;
        } catch (err) {
          console.warn('[ESHU_SYNC] refresh /api/sync failed:', err);
          return null;
        }
      })
      .finally(() => {
        // Allow a fresh refresh on the *next* tick so chained mutations after
        // the snapshot returns trigger their own pull.
        Promise.resolve().then(() => { pendingRefresh = null; });
      });
    return pendingRefresh;
  }

  function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    // Set identity first. Table updates notify page subscribers immediately,
    // and list filters need the canonical active profile before they render.
    if (snapshot.values && typeof snapshot.values === 'object') {
      try {
        if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue && snapshot.values.currentProfileId !== undefined) {
          ESHU_DB.setValue('currentProfileId', snapshot.values.currentProfileId);
        }
      } catch {}
    }
    const tables = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
    for (const name of ENTITY_TABLES) {
      if (Array.isArray(tables[name])) {
        setTableSafe(name, tables[name]);
      }
    }
  }

  function isRemote() {
    return !!(
      typeof window !== 'undefined' &&
      window.ESHU_API &&
      window.ESHU_REMOTE &&
      window.ESHU_REMOTE.isEnabled &&
      window.ESHU_REMOTE.isEnabled()
    );
  }

  /**
   * Run a server-authoritative mutation and reconcile local state.
   *
   * @param {Object} opts
   * @param {'groups'|'games'|'creations'|'profiles'} opts.entity
   * @param {() => Promise<any>} opts.call             — authoritative REST call
   * @param {(resp: any) => any} [opts.pick]           — extract row(s) to upsert
   * @param {boolean} [opts.bulk=false]                — pick returns an array
   * @param {boolean} [opts.refresh=false]             — also /api/sync after
   * @param {(resp: any) => string|string[]} [opts.removeIds]
   *        — if set, treat as a delete: remove these ids locally on success
   * @returns {Promise<any>} the value of `pick(resp)` (or the raw response)
   */
  async function mutate(opts) {
    if (!opts || typeof opts !== 'object') throw new Error('ESHU_SYNC.mutate: opts required');
    const { entity, call } = opts;
    if (!ENTITY_TABLES.has(entity)) {
      throw new Error(`ESHU_SYNC.mutate: unknown entity '${entity}'`);
    }
    if (typeof call !== 'function') throw new Error('ESHU_SYNC.mutate: opts.call must be a function');

    let resp;
    try {
      resp = await call();
    } catch (err) {
      // A 401 here means the page is in remote mode but the server session is
      // gone/never-established (e.g. Supabase signed in but app session missing,
      // or an expired cookie). Without this signal, callers silently fall back
      // to a LOCAL-only write that looks saved in-session but is wiped on the
      // next reload — the "created group/game doesn't show up" report. Prompt a
      // re-auth so the write can actually reach the server.
      if (err && err.status === 401) {
        try { window.dispatchEvent(new CustomEvent('eshu:sync-unauthenticated')); } catch {}
      }
      throw err;
    }
    if (opts.removeIds) {
      const ids = opts.removeIds(resp);
      removeEntity(entity, ids);
    } else {
      const picked = typeof opts.pick === 'function' ? opts.pick(resp) : null;
      if (picked != null) {
        applyEntityResponse(entity, picked);
      }
    }
    if (opts.refresh) {
      await refresh();
    }
    return typeof opts.pick === 'function' ? opts.pick(resp) : resp;
  }

  window.ESHU_SYNC = {
    mutate,
    refresh,
    applyEntityResponse,
    removeEntity,
    applySnapshot,
    isRemote,
  };
})();
