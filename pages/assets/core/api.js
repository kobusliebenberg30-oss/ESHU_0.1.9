/**
 * ESHU API client (browser)
 *
 * Thin fetch wrapper around the Node/Express backend. Single responsibility:
 *   - Resolve the API base URL once.
 *   - Always send credentials (cookie session).
 *   - Normalize errors into { status, code, message, details }.
 *   - Provide typed-ish helpers grouped by resource.
 *
 * The base URL resolves in this order:
 *   1) <meta name="eshu-api-base" content="https://api.example.com">
 *   2) window.ESHU_API_BASE        (set inline before this script)
 *   3) localStorage.eshu_api_base  (override for testing)
 *   4) Same-origin /api            (fallback)
 *
 * Exposed as window.ESHU_API.
 */
(function () {
  'use strict';

  function resolveBase() {
    try {
      const meta = document.querySelector('meta[name="eshu-api-base"]');
      if (meta && meta.content) return String(meta.content).replace(/\/+$/, '');
    } catch {}
    if (typeof window.ESHU_API_BASE === 'string' && window.ESHU_API_BASE) {
      return window.ESHU_API_BASE.replace(/\/+$/, '');
    }
    try {
      const ls = localStorage.getItem('eshu_api_base');
      if (ls) return ls.replace(/\/+$/, '');
    } catch {}
    try {
      const host = window.location && window.location.hostname;
      const port = window.location && window.location.port;
      if ((host === 'localhost' || host === '127.0.0.1') && port && port !== '3000') {
        return window.location.protocol + '//' + host + ':3000/api';
      }
    } catch {}
    // Fallback: single-server mode uses same-origin /api.
    // Split-mode dev can still opt in explicitly via meta/window/localStorage.
    return '/api';
  }

  const BASE = resolveBase();
  let pendingRequests = 0;
  let busyTimer = null;
  let busyVisibleSince = 0;
  const BUSY_SHOW_DELAY_MS = 180;
  const BUSY_MIN_VISIBLE_MS = 260;

  function ensureBusyIndicator() {
    if (!document || !document.body) return null;
    let el = document.getElementById('eshuNetworkBusy');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'eshuNetworkBusy';
    el.className = 'eshu-network-busy';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="eshu-busy-spinner"></span>';
    document.body.appendChild(el);
    return el;
  }

  function setBusyVisible(visible) {
    const el = ensureBusyIndicator();
    if (!el) return;
    el.classList.toggle('active', !!visible);
    if (visible) busyVisibleSince = Date.now();
  }

  function beginRequestBusy() {
    pendingRequests += 1;
    if (pendingRequests !== 1) return;
    if (busyTimer) clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      busyTimer = null;
      if (pendingRequests > 0) setBusyVisible(true);
    }, BUSY_SHOW_DELAY_MS);
  }

  function endRequestBusy() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests > 0) return;
    if (busyTimer) {
      clearTimeout(busyTimer);
      busyTimer = null;
    }
    const elapsed = Date.now() - busyVisibleSince;
    const waitMs = Math.max(0, BUSY_MIN_VISIBLE_MS - elapsed);
    setTimeout(() => {
      if (pendingRequests === 0) setBusyVisible(false);
    }, waitMs);
  }

  function isSameOriginApiBase() {
    return BASE === '/api' || /^https?:\/\/[^/]+\/api$/i.test(BASE) === false;
  }

  function isLocalHost() {
    try {
      const host = window.location && window.location.hostname;
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  }

  class ApiError extends Error {
    constructor(status, code, message, details) {
      super(message || code || 'ApiError');
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  async function request(method, path, opts) {
    const cfg = opts || {};
    const url = BASE + path;
    const headers = Object.assign(
      { 'Accept': 'application/json' },
      cfg.body && !(cfg.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
      cfg.headers || {}
    );

    let body;
    if (cfg.body instanceof FormData) body = cfg.body;
    else if (cfg.body !== undefined) body = JSON.stringify(cfg.body);

    let res;
    beginRequestBusy();
    try {
      res = await fetch(url, {
        method,
        credentials: 'include',
        headers,
        body,
        signal: cfg.signal
      });
    } catch (err) {
      throw new ApiError(0, 'NetworkError', err && err.message ? err.message : 'Network failure');
    } finally {
      endRequestBusy();
    }

    if (res.status === 204) return null;

    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

    if (!res.ok) {
      if (res.status === 404 && isSameOriginApiBase() && !isLocalHost()) {
        throw new ApiError(
          404,
          'ApiNotConfigured',
          'This site is not connected to a backend API. Configure ESHU_API_BASE or deploy the server routes.',
          payload
        );
      }
      const code = (payload && payload.error) || res.statusText || 'HttpError';
      const message = (payload && (payload.message || payload.error)) || `Request failed (${res.status})`;
      const details = payload && payload.issues ? payload.issues : (payload && payload.details);
      throw new ApiError(res.status, code, message, details);
    }

    return payload;
  }

  const json = {
    get:    (p, opts) => request('GET',    p, opts),
    post:   (p, body, opts) => request('POST',   p, Object.assign({ body }, opts)),
    put:    (p, body, opts) => request('PUT',    p, Object.assign({ body }, opts)),
    patch:  (p, body, opts) => request('PATCH',  p, Object.assign({ body }, opts)),
    delete: (p, opts) => request('DELETE', p, opts)
  };

  // ---------- Resource helpers ----------

  const auth = {
    register: (input) => json.post('/auth/register', input),
    supabaseConfig: () => json.get('/auth/supabase/config'),
    supabaseSession: (input) => json.post('/auth/supabase/session', input),
    /**
     * Sign in. `input.rememberMe = false` produces a browser-session cookie
     * (cleared when the browser closes). Omit it (or send `true`) for the
     * default 30-day rolling session.
     */
    login:    (input) => json.post('/auth/login', input),
    logout:   ()      => json.post('/auth/logout'),
    /** Rotate the password. Backend regenerates the session id. */
    changePassword: (input) => json.post('/auth/change-password', input),
    /** Permanently delete the account. Requires the current password. */
    deleteAccount:  (input) => json.delete('/auth/account', { body: input }),
    /** Returns null on 401 instead of throwing (probe pattern). */
    me: async () => {
      try { return await json.get('/auth/me'); }
      catch (e) { if (e.status === 401) return null; throw e; }
    }
  };

  const users = {
    me: () => json.get('/users/me'),
    byUsername: (u) => json.get('/users/' + encodeURIComponent(u))
  };

  const profiles = {
    list:        ()        => json.get('/profiles'),
    playerbase:  (limit)   => json.get('/profiles/playerbase' + qs({ limit })),
    publicContent: (id)    => json.get('/profiles/' + encodeURIComponent(id) + '/public-content'),
    create:      (input)   => json.post('/profiles', input),
    update:      (id, p)   => json.patch('/profiles/' + encodeURIComponent(id), p),
    setActive:   (profileId) => json.post('/profiles/active', { profileId })
  };

  function qs(obj) {
    if (!obj) return '';
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  const groups = {
    list:    (filters) => json.get('/groups' + qs(filters)),
    get:     (id)      => json.get('/groups/' + encodeURIComponent(id)),
    create:  (input)   => json.post('/groups', input),
    update:  (id, p)   => json.patch('/groups/' + encodeURIComponent(id), p),
    remove:  (id, mode) => json.delete('/groups/' + encodeURIComponent(id) + qs({ mode })),
    /**
     * Authoritative join: server inserts a GroupMember row for the session's
     * active profile. Idempotent — calling twice is a no-op. Returns the
     * updated group. Errors: 403 GROUP_PRIVATE, 409 group not active, 404.
     */
    join:    (id) => json.post('/groups/' + encodeURIComponent(id) + '/join'),
    /**
     * Authoritative leave: removes the GroupMember row. Idempotent. Owners
     * cannot leave their own group (409 OWNER_CANNOT_LEAVE).
     */
    leave:   (id) => json.post('/groups/' + encodeURIComponent(id) + '/leave')
  };

  const games = {
    list:    (filters) => json.get('/games' + qs(filters)),
    get:     (id)      => json.get('/games/' + encodeURIComponent(id)),
    create:  (input)   => json.post('/games', input),
    update:  (id, p)   => json.patch('/games/' + encodeURIComponent(id), p),
    remove:  (id, mode) => json.delete('/games/' + encodeURIComponent(id) + qs({ mode })),
    /**
     * Authoritative finalization. Owner submits rankings; server picks top
     * 3, awards placement XP to creation owners atomically. Idempotent.
     * Body: { rankings: [{ creationId, voteCount }] }.
     * Returns: { gameId, finalizedAt, placements, alreadyFinalized }.
     */
    finalize: (id, rankings) => json.post('/games/' + encodeURIComponent(id) + '/finalize', { rankings })
  };

  const creations = {
    list:    (filters) => json.get('/creations' + qs(filters)),
    get:     (id)      => json.get('/creations/' + encodeURIComponent(id)),
    create:  (input)   => json.post('/creations', input),
    update:  (id, p)   => json.patch('/creations/' + encodeURIComponent(id), p),
    remove:  (id, mode) => json.delete('/creations/' + encodeURIComponent(id) + qs({ mode }))
  };

  /**
   * Server-backed comments. Replaces the legacy `comments_*` localStorage
   * keys that never synced and disappeared on logout. Always filtered by
   * (targetKind, targetId) so a single endpoint serves creation/game/group
   * threads without forcing the caller to dispatch by URL.
   *
   *   ESHU_API.comments.list({ targetKind: 'creation', targetId: 'cre_x' })
   *   ESHU_API.comments.create({ targetKind: 'group', targetId: 'grp_x', text: 'hi' })
   *
   * Reactions (likedBy / followedBy) are toggled server-side so two devices
   * can't race on the JSON array. Soft-delete supports the platform's
   * existing burn/restore model via `{ mode: 'burned' }`.
   */
  const comments = {
    list:   (filters) => json.get('/comments' + qs(filters)),
    get:    (id)      => json.get('/comments/' + encodeURIComponent(id)),
    create: (input)   => json.post('/comments', input),
    update: (id, p)   => json.patch('/comments/' + encodeURIComponent(id), p),
    toggleLike:   (id) => json.post('/comments/' + encodeURIComponent(id) + '/like'),
    toggleFollow: (id) => json.post('/comments/' + encodeURIComponent(id) + '/follow'),
    remove: (id, mode) => json.delete('/comments/' + encodeURIComponent(id) + qs({ mode }))
  };

  const assets = {
    /** Upload a Blob/File. Returns { asset }. */
    upload: (fileOrBlob, filename) => {
      const fd = new FormData();
      fd.append('file', fileOrBlob, filename || (fileOrBlob && fileOrBlob.name) || 'upload.bin');
      return request('POST', '/assets', { body: fd });
    },
    get:    (id) => json.get('/assets/' + encodeURIComponent(id)),
    rawUrl: (id) => BASE + '/assets/' + encodeURIComponent(id) + '/raw',
    /**
     * Reap orphaned uploads owned by the authenticated user.
     * Returns `{ rowsDeleted, blobsDeleted, bytesReclaimed, ids }`.
     */
    gc:     (opts) => json.post('/assets/gc', opts || {})
  };

  const settings = {
    get:    ()    => json.get('/settings'),
    update: (p)   => json.put('/settings', p)
  };

  const sync = {
    pull: () => json.get('/sync'),
    push: (db) => json.put('/sync', db)
  };

  /**
   * Server-authoritative XP. The client never decides how much XP an action
   * is worth — it just tells the server which event happened and the server
   * applies its rule table.
   *
   *   await ESHU_API.xp.award({ kind: 'creation_uploaded', refId: creation.id });
   *
   * Idempotent on (kind, refId): the same pair will never double-award.
   * Response: { xpPoints, delta, alreadyAwarded, unlocks: string[], reason }.
   */
  // Mirror of the server's RULES table — kept here ONLY to drive the local
  // fallback path. The server remains authoritative whenever remote mode is
  // active; the helper below reconciles local cache to whatever the server
  // returns. If these amounts drift from the server's, the server still wins.
  const LOCAL_XP_RULES = {
    creation_uploaded: { amount: 1, reason: 'Uploaded creation' },
    comment_posted:    { amount: 1, reason: 'Comment posted' },
    comment_animated:  { amount: 2, reason: 'Animated comment' },
    game_created:      { amount: 2, reason: 'Created a game' }
  };

  const xp = {
    award: (input) => json.post('/xp/award', input),
    gates: ()      => json.get('/xp/gates'),

    /**
     * High-level XP award. Use this from page code instead of calling `award`
     * directly. Handles four scenarios in one call:
     *   - Remote mode + server reachable: server is authoritative; local
     *     cache is mirrored from the response. Idempotent on (kind, refId).
     *   - Remote mode + server unreachable: falls back to local addProfileXp,
     *     logs a warning.
     *   - Local-only mode: applies local addProfileXp directly.
     *   - Unknown kind or no ESHU_DB: returns a zero-result without throwing.
     *
     * Always returns the same shape so callers don't need to branch:
     *   { xpPoints, delta, alreadyAwarded, unlocks, source: 'remote'|'local' }
     */
    async awardSafe(kind, refId) {
      const rule = LOCAL_XP_RULES[kind];
      const remoteMode = !!(window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());

      const localAward = () => {
        if (typeof window.ESHU_DB === 'undefined' || !rule) {
          return { xpPoints: 0, delta: 0, alreadyAwarded: false, unlocks: [], source: 'local' };
        }
        const pid = window.ESHU_DB.getActiveProfileId();
        const newXp = window.ESHU_DB.addProfileXp(rule.amount, pid, rule.reason);
        return { xpPoints: newXp, delta: rule.amount, alreadyAwarded: false, unlocks: [], source: 'local' };
      };

      if (!remoteMode) return localAward();

      try {
        const result = await json.post('/xp/award', { kind, refId });
        if (typeof window.ESHU_DB !== 'undefined') {
          const pid = window.ESHU_DB.getActiveProfileId();
          if (pid) window.ESHU_DB.setProfileXp(pid, result.xpPoints);
        }
        return { ...result, source: 'remote' };
      } catch (err) {
        console.warn('[xp.awardSafe] server unavailable, falling back to local:', err);
        return localAward();
      }
    }
  };

  window.ESHU_API = {
    base: BASE,
    ApiError,
    request,
    auth, users, profiles, groups, games, creations, comments, assets, settings, sync, xp
  };
})();
