/**
 * ESHU_REALTIME — live cross-device synchronization.
 *
 * The platform is "global": anyone signed in should see new groups / games /
 * creations / profile edits appear without manually reloading, on whatever
 * device they're on. The existing model is pull-based — `/api/sync` is fetched
 * on page load and on navigation, and the remote storage driver pushes local
 * writes back. This module closes the loop so OTHER devices learn about a
 * change quickly and re-render.
 *
 * Three layers, most-instant first, each independently sufficient:
 *
 *   1. Supabase Realtime (Broadcast)
 *      Subscribes to a PUBLIC Broadcast channel. The server emits a single
 *      payload-free "changed" message after each successful write (see
 *      server/src/lib/supabase.ts), which triggers a coalesced `/api/sync`
 *      pull the moment the database changes. This is the "truly live" path.
 *      Because the message carries NO row data, there is no RLS dependency and
 *      nothing is exposed cross-user on the socket. If Realtime can't connect,
 *      the layers below still keep the app live — just on a short delay.
 *
 *   2. Visibility-aware polling + pull-on-focus
 *      While the tab is visible we pull every POLL_VISIBLE_MS; we also pull
 *      immediately when the tab becomes visible / regains focus / the network
 *      comes back. This guarantees liveness on EVERY deployment with zero
 *      configuration — it's the safety net under the Realtime layer.
 *
 *   3. Cross-tab BroadcastChannel
 *      When one tab on this device pulls fresh data (or makes a local edit),
 *      it tells sibling tabs to refresh too, so multiple open tabs stay in
 *      lockstep without each waiting for its own poll tick.
 *
 * Integration contract:
 *   - Triggers `ESHU_SYNC.refresh()` (pull + apply snapshot), then dispatches
 *     `eshu:sync-success` so pages re-render via their existing listeners.
 *   - Activates after `eshu:remote-activated` (user + driver ready) and tears
 *     down on `eshu:auth-logout`.
 *   - No-ops entirely when remote mode is off (local-only sessions).
 *
 * Globals used: window.ESHU_SYNC, window.ESHU_SUPABASE, window.ESHU_REMOTE.
 */
(function () {
  'use strict';

  if (window.ESHU_REALTIME) return; // idempotent

  // Realtime Broadcast channel + event. MUST match the server constants in
  // server/src/lib/supabase.ts (REALTIME_CHANGE_TOPIC / REALTIME_CHANGE_EVENT).
  // We use a payload-free Broadcast (server emits after each write) rather than
  // postgres_changes so no row data is ever exposed cross-user on the socket.
  const CHANGE_TOPIC = 'eshu-db-changes';
  const CHANGE_EVENT = 'changed';

  // Poll cadence while the tab is visible. Generous enough to be gentle on the
  // API, tight enough to feel live even if Supabase Realtime isn't enabled.
  const POLL_VISIBLE_MS = 12000;
  // Never fire two network pulls closer than this — coalesces event bursts
  // (e.g. a single save touching several tables emits several change events).
  const MIN_PULL_GAP_MS = 1200;
  // Small delay so a burst of triggers within one tick collapses to one pull.
  const PULL_DEBOUNCE_MS = 250;

  let started = false;
  let pollTimer = null;
  let debounceTimer = null;
  let lastPullAt = 0;
  let realtimeChannel = null;
  let realtimeClient = null;
  let bc = null; // BroadcastChannel | null
  let dbUnsubscribe = null;
  // While we're applying a remote snapshot, ESHU_DB still fires 'local' write
  // notifications. Suppress broadcasting during that window so a pull doesn't
  // echo back out to sibling tabs and ping-pong forever.
  let suppressBroadcast = false;

  function isRemote() {
    try {
      return !!(window.ESHU_SYNC && window.ESHU_SYNC.isRemote && window.ESHU_SYNC.isRemote());
    } catch {
      return false;
    }
  }

  function isVisible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  async function flushPendingWritesBeforePull(reason) {
    try {
      if (!window.ESHU_REMOTE || typeof window.ESHU_REMOTE.flushPending !== 'function') return true;
      const flushed = await Promise.race([
        window.ESHU_REMOTE.flushPending({ retries: 2 }),
        new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
      ]);
      if (flushed === false) {
        console.debug('[ESHU_REALTIME] skipped pull until local writes flush (' + reason + ')');
        return false;
      }
      return true;
    } catch (err) {
      console.debug('[ESHU_REALTIME] pending-write flush failed before pull (' + reason + '):', err && err.message || err);
      return false;
    }
  }

  // ---- Core pull -----------------------------------------------------------

  async function pullNow(reason) {
    if (!isRemote()) return;
    const now = Date.now();
    if (now - lastPullAt < MIN_PULL_GAP_MS) return; // coalesce bursts
    lastPullAt = now;
    suppressBroadcast = true;
    try {
      // Remote mode is still partly local-first: group/game/creation pages write
      // to ESHU_DB, then the remote storage driver pushes the bulk snapshot to
      // /api/sync on a short debounce. A realtime/focus/poll pull that lands
      // first would apply the older server snapshot and make the user's new
      // row vanish. Flush before pulling; if the flush cannot be confirmed,
      // keep the local view and let the next realtime/poll tick retry.
      const safeToPull = await flushPendingWritesBeforePull(reason);
      if (!safeToPull) return;
      await window.ESHU_SYNC.refresh();
      // Pages listen for this to re-render lists/panels from the fresh snapshot.
      try { window.dispatchEvent(new CustomEvent('eshu:sync-success', { detail: { reason } })); } catch {}
    } catch (err) {
      // Liveness is best-effort; the next tick / event retries.
      console.debug('[ESHU_REALTIME] pull failed (' + reason + '):', err && err.message || err);
    } finally {
      // Release after the (microtask-scheduled) ESHU_DB notify has flushed, so
      // the 'local' writes from applySnapshot don't trigger a broadcast.
      setTimeout(() => { suppressBroadcast = false; }, 0);
    }
  }

  function schedulePull(reason, delay) {
    if (!isRemote()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => pullNow(reason), typeof delay === 'number' ? delay : PULL_DEBOUNCE_MS);
  }

  // ---- Layer 2: visibility-aware polling -----------------------------------

  function startPolling() {
    stopPolling();
    if (!isVisible()) return; // don't poll a backgrounded tab
    pollTimer = setInterval(() => {
      if (isVisible()) pullNow('poll');
    }, POLL_VISIBLE_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function onVisibilityChange() {
    if (isVisible()) {
      // Returning to the tab: pull immediately, then resume polling.
      pullNow('visible');
      startPolling();
    } else {
      stopPolling();
    }
  }

  function onFocus() { if (isVisible()) schedulePull('focus', 0); }
  function onOnline() { schedulePull('online', 0); }

  // ---- Layer 3: cross-tab broadcast ----------------------------------------

  function setupBroadcast() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      bc = new BroadcastChannel('eshu-sync');
      bc.onmessage = (ev) => {
        if (ev && ev.data && ev.data.type === 'changed') {
          // A sibling tab made a local change. Pull to pick it up. This pull
          // sets suppressBroadcast, so it won't echo back (no ping-pong).
          schedulePull('broadcast', 0);
        }
      };
    } catch {
      bc = null;
    }
  }

  function broadcastChanged() {
    try { if (bc) bc.postMessage({ type: 'changed', at: Date.now() }); } catch {}
  }

  // Broadcast to sibling tabs only on GENUINE local writes (a user edit on
  // this tab), never on writes that came from applying a remote snapshot.
  function setupLocalWriteWatch() {
    if (!window.ESHU_DB || typeof window.ESHU_DB.subscribe !== 'function') return;
    try {
      dbUnsubscribe = window.ESHU_DB.subscribe((_snapshot, source) => {
        if (source === 'local' && !suppressBroadcast) {
          broadcastChanged();
        }
      }, { immediate: false });
    } catch {
      dbUnsubscribe = null;
    }
  }

  // ---- Layer 1: Supabase Realtime ------------------------------------------

  async function setupRealtime() {
    if (!window.ESHU_SUPABASE || typeof window.ESHU_SUPABASE.getClient !== 'function') return;
    let client;
    try {
      client = await window.ESHU_SUPABASE.getClient();
    } catch {
      client = null;
    }
    if (!client || !client.channel) return;

    realtimeClient = client;
    try {
      // Subscribe to a PUBLIC Broadcast channel. The server POSTs a payload-
      // free '{CHANGE_EVENT}' message after each successful write, so there is
      // no row data on the socket and no RLS / auth dependency — we simply
      // re-pull the server-authoritative /api/sync when notified.
      const channel = client
        .channel(CHANGE_TOPIC)
        .on('broadcast', { event: CHANGE_EVENT }, () => schedulePull('realtime:broadcast'));
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[ESHU_REALTIME] live updates active (Supabase Broadcast).');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Realtime not reachable: polling keeps us live.
          console.debug('[ESHU_REALTIME] Realtime unavailable (' + status + '); using polling fallback.');
        }
      });
      realtimeChannel = channel;
    } catch (err) {
      console.debug('[ESHU_REALTIME] Realtime setup skipped:', err && err.message || err);
    }
  }

  async function teardownRealtime() {
    try {
      if (realtimeChannel && realtimeClient && typeof realtimeClient.removeChannel === 'function') {
        await realtimeClient.removeChannel(realtimeChannel);
      }
    } catch {}
    realtimeChannel = null;
    realtimeClient = null;
  }

  // ---- Lifecycle -----------------------------------------------------------

  function start() {
    if (started) return;
    if (!isRemote()) return;
    started = true;

    setupBroadcast();
    setupLocalWriteWatch();
    startPolling();
    setupRealtime();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    // An initial reconciliation pull shortly after activation catches anything
    // created on another device between the activation pull and now.
    schedulePull('start', 500);
  }

  function stop() {
    if (!started) return;
    started = false;
    stopPolling();
    clearTimeout(debounceTimer);
    teardownRealtime();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onOnline);
    try { if (typeof dbUnsubscribe === 'function') dbUnsubscribe(); } catch {}
    dbUnsubscribe = null;
    try { if (bc) bc.close(); } catch {}
    bc = null;
  }

  // Activate once the remote driver has confirmed a signed-in user + ready DB.
  window.addEventListener('eshu:remote-activated', start);
  // Tear down cleanly on logout so we don't poll an unauthenticated session.
  window.addEventListener('eshu:auth-logout', stop);

  // If activation already happened before this script attached its listener
  // (script ordering), start immediately.
  if (window.ESHU_AUTH && isRemote()) start();

  window.ESHU_REALTIME = {
    start,
    stop,
    pullNow: () => pullNow('manual'),
    isActive: () => started,
    broadcastChanged,
  };
})();

/*
 * ───────────────────────── SUPABASE REALTIME SETUP ─────────────────────────
 * The polling + cross-tab layers work with NO configuration. The INSTANT
 * (sub-second) cross-device path uses Supabase Realtime BROADCAST, not
 * postgres_changes, so it needs NO database publication and NO RLS:
 *
 *   - The server emits a payload-free "changed" message on the PUBLIC channel
 *     "eshu-db-changes" after each successful write (server/src/lib/supabase.ts
 *     broadcastChange(), wired in server/src/app.ts). This requires only that
 *     SUPABASE_URL + a key (SUPABASE_SERVICE_ROLE_KEY preferred, else
 *     SUPABASE_ANON_KEY) are set in the server environment.
 *   - This browser subscribes to that channel and re-pulls the
 *     server-authoritative /api/sync when notified. No row data ever crosses
 *     the socket, so there is no cross-user exposure.
 *
 * If the Realtime socket can't connect, the polling fallback still keeps every
 * device live within POLL_VISIBLE_MS.
 */
