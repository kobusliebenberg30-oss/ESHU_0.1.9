/**
 * ESHU_COMMENTS — shared comment cache + server bridge.
 *
 * Legacy pages stored comment threads in localStorage under keys like
 * `comments_<creationId>`, `comments_game_<gameId>`, and
 * `comments_group_<groupId>`. Nothing ever round-tripped to the server, so
 * comments vanished on logout (the keys are sweep-cleared by design), didn't
 * survive cross-device login, and weren't visible to other players.
 *
 * This helper preserves the existing synchronous read pattern (so page render
 * code doesn't have to be rewritten to async) while routing every mutation
 * through the canonical `/api/comments` endpoints. The localStorage cache is
 * still useful as an instant-render store, but it's overwritten by the
 * server snapshot on `hydrate()`.
 *
 * Exposed as `window.ESHU_COMMENTS`:
 *
 *   load(target)        -> Comment[]                (sync, from cache)
 *   hydrate(target)     -> Promise<Comment[]>       (async, refreshes cache)
 *   post(target, fields)-> Promise<Comment | null>  (server + cache update)
 *   update(id, fields)  -> Promise<Comment | null>
 *   toggleLike(id)      -> Promise<Comment | null>
 *   toggleFollow(id)    -> Promise<Comment | null>
 *   remove(id, mode)    -> Promise<Comment | null>
 *
 * target = { kind: 'creation'|'game'|'group', id: '<parent id>' }
 */
(function () {
  'use strict';

  function api() {
    return typeof window !== 'undefined' ? window.ESHU_API : null;
  }

  function isRemote() {
    return !!(
      typeof window !== 'undefined' &&
      window.ESHU_REMOTE &&
      typeof window.ESHU_REMOTE.isEnabled === 'function' &&
      window.ESHU_REMOTE.isEnabled()
    );
  }

  let commentsApiBackoffUntil = 0;

  function canUseRemoteComments() {
    return isRemote() && Date.now() >= commentsApiBackoffUntil;
  }

  function extractErrorText(err) {
    if (!err) return '';
    const code = typeof err.code === 'string' ? err.code : '';
    const message = typeof err.message === 'string' ? err.message : '';
    const details = typeof err.details === 'string'
      ? err.details
      : (err.details && typeof err.details === 'object'
        ? JSON.stringify(err.details)
        : '');
    const meta = (err.meta && typeof err.meta === 'object') ? JSON.stringify(err.meta) : '';
    return (code + ' ' + message + ' ' + details + ' ' + meta).toLowerCase();
  }

  function applyRemoteBackoff(err, op) {
    const text = extractErrorText(err);
    const status = typeof err?.status === 'number' ? err.status : 0;
    const tableMissing =
      text.includes('p2021') ||
      (text.includes('public.comment') && text.includes('does not exist')) ||
      (text.includes('table') && text.includes('comment') && text.includes('does not exist'));

    if (tableMissing) {
      commentsApiBackoffUntil = Date.now() + (10 * 60 * 1000);
      console.warn('[ESHU_COMMENTS] disabling remote comment calls for 10m (missing Comment table). op=', op);
      return;
    }

    if (status >= 500 || status === 0 || text.includes('networkerror')) {
      commentsApiBackoffUntil = Math.max(commentsApiBackoffUntil, Date.now() + 10_000);
    }
  }

  function getActiveProfileId() {
    try {
      if (typeof window === 'undefined') return null;
      if (window.ESHU_DB && typeof window.ESHU_DB.getActiveProfileId === 'function') {
        return window.ESHU_DB.getActiveProfileId() || null;
      }
      if (typeof window.getActiveProfileId === 'function') {
        return window.getActiveProfileId() || null;
      }
    } catch {}
    return null;
  }

  function storageKey(target) {
    if (!target || typeof target !== 'object' || !target.id) return null;
    if (target.kind === 'creation') return 'comments_' + target.id;
    if (target.kind === 'game') return 'comments_game_' + target.id;
    if (target.kind === 'group') return 'comments_group_' + target.id;
    return null;
  }

  function readCache(target) {
    const key = storageKey(target);
    if (!key) return [];
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('[ESHU_COMMENTS] cache read failed for', key, err);
      return [];
    }
  }

  const hydrateInFlight = new Map();

  function writeCache(target, comments) {
    const key = storageKey(target);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(comments || []));
    } catch (err) {
      console.warn('[ESHU_COMMENTS] cache write failed for', key, err);
    }
  }

  /**
   * Coerce a server-shape Comment into the legacy frontend shape so existing
   * render code (which reads c.timestamp, c.authorId, c.text, c.likedBy,
   * c.followedBy, c.status, c.animation, c.editedAt) keeps working without
   * modification.
   */
  function toLegacy(c) {
    if (!c || typeof c !== 'object') return null;
    const createdAt = c.createdAt ? Date.parse(c.createdAt) : Date.now();
    return {
      ...c,
      // Numeric ms epoch — what page code expects.
      timestamp: Number.isFinite(createdAt) ? createdAt : Date.now(),
      // Legacy alias for author profile id.
      authorId: c.authorProfileId || null,
      authorProfileId: c.authorProfileId || null,
      // Reactions surface as arrays of profile ids.
      likedBy: Array.isArray(c.likedBy) ? c.likedBy : [],
      followedBy: Array.isArray(c.followedBy) ? c.followedBy : [],
      status: c.status || 'active',
    };
  }

  /**
   * Read the cached thread for a target. Returns immediately (no network).
   * Page code can call this from synchronous render paths.
   */
  function load(target) {
    return readCache(target);
  }

  /**
   * Refresh the cache from the server. Returns the new array. When the
   * remote driver isn't enabled, this is a no-op that returns the cache.
   */
  async function hydrate(target) {
    if (!canUseRemoteComments()) return readCache(target);
    const client = api();
    if (!client || !client.comments) return readCache(target);
    const key = storageKey(target);
    if (key && hydrateInFlight.has(key)) {
      return hydrateInFlight.get(key);
    }

    const run = (async () => {
      try {
        const resp = await client.comments.list({
          targetKind: target.kind,
          targetId: target.id,
          status: 'active',
        });
        const arr = (resp && resp.comments ? resp.comments : []).map(toLegacy).filter(Boolean);
        writeCache(target, arr);
        try {
          window.dispatchEvent(new CustomEvent('eshu:comments-updated', {
            detail: { target, comments: arr },
          }));
        } catch {}
        return arr;
      } catch (err) {
        applyRemoteBackoff(err, 'hydrate');
        console.warn('[ESHU_COMMENTS] hydrate failed for', target, err);
        return readCache(target);
      } finally {
        if (key) hydrateInFlight.delete(key);
      }
    })();

    if (key) hydrateInFlight.set(key, run);
    return run;
  }

  function dispatchUpdated(target, comments, reason) {
    try {
      window.dispatchEvent(new CustomEvent('eshu:comments-updated', {
        detail: { target, comments, reason },
      }));
    } catch {}
  }

  function makeOptimisticRow(target, fields, activeProfileId) {
    const text = typeof fields?.text === 'string' ? fields.text.trim() : '';
    const animation = fields?.animation ?? null;
    return {
      id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      targetKind: target.kind,
      targetId: target.id,
      text,
      animation,
      animationImageUrl: fields?.animationImageUrl || null,
      authorName: fields?.authorName || null,
      timestamp: Date.now(),
      status: 'active',
      likedBy: [],
      followedBy: [],
      authorId: activeProfileId,
      authorProfileId: activeProfileId,
    };
  }

  function reconcileServerRow(target, optimisticId, serverRow) {
    const arr = readCache(target);
    const idx = arr.findIndex((c) => c && c.id === optimisticId);
    if (idx < 0) {
      const next = [serverRow, ...arr.filter((c) => c && c.id !== serverRow.id)];
      writeCache(target, next);
      dispatchUpdated(target, next, 'reconcile');
      return serverRow;
    }
    const prev = arr[idx];
    const merged = {
      ...serverRow,
      authorName: prev.authorName || serverRow.authorName || null,
      animationImageUrl: prev.animationImageUrl || serverRow.animationImageUrl || null,
    };
    const next = arr.slice();
    next[idx] = merged;
    writeCache(target, next);
    dispatchUpdated(target, next, 'reconcile');
    return merged;
  }

  /**
   * Post a new comment. Writes to the cache IMMEDIATELY (optimistic) so the
   * thread re-renders without waiting on the server round-trip, then reconciles
   * with the canonical server row in the background. Returns the optimistic row
   * right away (or null on validation failure).
   */
  async function post(target, fields) {
    if (!target || !target.id || !target.kind) return null;
    const text = typeof fields?.text === 'string' ? fields.text.trim() : '';
    const animation = fields?.animation ?? undefined;
    if (!text && !animation) return null;
    const activeProfileId = getActiveProfileId();

    const optimistic = toLegacy(makeOptimisticRow(target, fields, activeProfileId));
    const next = [optimistic, ...readCache(target)];
    writeCache(target, next);
    dispatchUpdated(target, next, 'post');

    const client = api();
    if (!canUseRemoteComments() || !client || !client.comments) {
      return optimistic;
    }

    // Background reconcile — never block the caller on this.
    void (async () => {
      try {
        const resp = await client.comments.create({
          targetKind: target.kind,
          targetId: target.id,
          text: text || '',
          ...(animation !== undefined ? { animation } : {}),
        });
        const created = toLegacy(resp && resp.comment ? resp.comment : resp);
        if (created) reconcileServerRow(target, optimistic.id, created);
      } catch (err) {
        applyRemoteBackoff(err, 'post');
        console.warn('[ESHU_COMMENTS] background post failed; keeping optimistic row:', err);
      }
    })();

    return optimistic;
  }

  /**
   * Locate the comment in cache, swap it for `mutator(prev)`, and write back.
   * Used by like/follow/edit/remove flows so individual mutations don't
   * have to repeat the cache plumbing.
   */
  function updateCacheById(targetCandidates, id, mutator, reason) {
    if (!id) return null;
    const candidates = Array.isArray(targetCandidates) ? targetCandidates : [targetCandidates];
    for (const t of candidates) {
      if (!t) continue;
      const arr = readCache(t);
      const idx = arr.findIndex((c) => c && c.id === id);
      if (idx === -1) continue;
      const updated = mutator(arr[idx]);
      const next = arr.slice();
      if (updated === null) next.splice(idx, 1);
      else next[idx] = updated;
      writeCache(t, next);
      try {
        window.dispatchEvent(new CustomEvent('eshu:comments-updated', {
          detail: { target: t, comments: next, reason },
        }));
      } catch {}
      return updated;
    }
    return null;
  }

  /**
   * Edit text / reactions / animation on an existing comment server-side.
   * Caller passes the inferred target list (the cache doesn't carry it).
   */
  async function update(id, fields, targetCandidates) {
    const client = api();
    if (!canUseRemoteComments() || !client || !client.comments) {
      return updateCacheById(targetCandidates, id, (prev) => ({
        ...prev,
        ...fields,
        editedAt: fields?.text !== undefined ? new Date().toISOString() : prev.editedAt,
      }));
    }
    try {
      const resp = await client.comments.update(id, fields);
      const next = toLegacy(resp && resp.comment ? resp.comment : resp);
      updateCacheById(targetCandidates, id, () => next);
      return next;
    } catch (err) {
      applyRemoteBackoff(err, 'update');
      console.warn('[ESHU_COMMENTS] update failed:', err);
      return null;
    }
  }

  async function toggleLike(id, targetCandidates) {
    const client = api();
    const activeProfileId = getActiveProfileId();
    const localToggle = () => updateCacheById(targetCandidates, id, (prev) => {
      const list = Array.isArray(prev?.likedBy) ? [...prev.likedBy] : [];
      if (activeProfileId) {
        const idx = list.indexOf(activeProfileId);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(activeProfileId);
      }
      return { ...prev, likedBy: list };
    }, 'like');
    if (!canUseRemoteComments() || !client || !client.comments) return localToggle();
    try {
      const resp = await client.comments.toggleLike(id);
      const next = toLegacy(resp && resp.comment ? resp.comment : resp);
      updateCacheById(targetCandidates, id, () => next, 'like');
      return next;
    } catch (err) {
      applyRemoteBackoff(err, 'toggleLike');
      console.warn('[ESHU_COMMENTS] toggleLike failed:', err);
      return localToggle();
    }
  }

  async function toggleFollow(id, targetCandidates) {
    const client = api();
    const activeProfileId = getActiveProfileId();
    const localToggle = () => updateCacheById(targetCandidates, id, (prev) => {
      const list = Array.isArray(prev?.followedBy) ? [...prev.followedBy] : [];
      if (activeProfileId) {
        const idx = list.indexOf(activeProfileId);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(activeProfileId);
      }
      return { ...prev, followedBy: list };
    }, 'follow');
    if (!canUseRemoteComments() || !client || !client.comments) return localToggle();
    try {
      const resp = await client.comments.toggleFollow(id);
      const next = toLegacy(resp && resp.comment ? resp.comment : resp);
      updateCacheById(targetCandidates, id, () => next, 'follow');
      return next;
    } catch (err) {
      applyRemoteBackoff(err, 'toggleFollow');
      console.warn('[ESHU_COMMENTS] toggleFollow failed:', err);
      return localToggle();
    }
  }

  async function remove(id, mode, targetCandidates) {
    const client = api();
    if (!canUseRemoteComments() || !client || !client.comments) {
      // Local: keep the row, just mark status. The legacy render code
      // already filters by status === 'active'.
      return updateCacheById(targetCandidates, id, (prev) => ({
        ...prev,
        status: mode === 'burned' ? 'burned' : 'deleted',
      }));
    }
    try {
      const resp = await client.comments.remove(id, mode);
      const next = toLegacy(resp && resp.comment ? resp.comment : resp);
      updateCacheById(targetCandidates, id, () => next);
      return next;
    } catch (err) {
      applyRemoteBackoff(err, 'remove');
      console.warn('[ESHU_COMMENTS] remove failed:', err);
      return null;
    }
  }

  window.ESHU_COMMENTS = {
    load,
    hydrate,
    post,
    update,
    toggleLike,
    toggleFollow,
    remove,
    // Exposed for tests / debugging.
    _toLegacy: toLegacy,
    _readCache: readCache,
    _writeCache: writeCache,
  };
})();
