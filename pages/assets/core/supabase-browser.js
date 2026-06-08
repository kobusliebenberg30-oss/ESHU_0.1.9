(function () {
  'use strict';

  if (window.ESHU_SUPABASE) return;

  let initPromise = null;
  let cachedClient = null;
  let cachedConfig = null;

  function readInlineConfig() {
    const cfg = window.ESHU_SUPABASE_CONFIG;
    if (!cfg || typeof cfg !== 'object') return null;
    if (cfg.enabled === false) return null;
    return cfg;
  }

  async function fetchConfig() {
    if (cachedConfig) return cachedConfig;
    const inline = readInlineConfig();
    if (inline) {
      cachedConfig = inline;
      return cachedConfig;
    }
    if (!window.ESHU_API || !window.ESHU_API.auth || typeof window.ESHU_API.auth.supabaseConfig !== 'function') {
      return { enabled: false, url: null, anonKey: null };
    }
    cachedConfig = await window.ESHU_API.auth.supabaseConfig();
    return cachedConfig;
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const config = await fetchConfig();
      if (!config || !config.enabled || !config.url || !config.anonKey) {
        return { enabled: false, client: null, config };
      }
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase browser client is not loaded.');
      }
      cachedClient = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
      return { enabled: true, client: cachedClient, config };
    })();
    return initPromise;
  }

  async function getClient() {
    const result = await init();
    return result.client;
  }

  async function handleEmailConfirmation() {
    try {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const hash = window.location.hash.slice(1);
      const hashParams = new URLSearchParams(hash);
      const hasConfirmationMarker = params.get('auth') === 'confirmed';
      const code = params.get('code');
      let accessToken = hashParams.get('access_token');
      if (!hasConfirmationMarker && !code && !accessToken) return false;

      if (!accessToken && code) {
        const client = await getClient();
        if (!client || !client.auth || typeof client.auth.exchangeCodeForSession !== 'function') return false;
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        accessToken = data && data.session && data.session.access_token;
      }

      if (!accessToken) return false;

      if (!window.ESHU_API || typeof window.ESHU_API.auth.supabaseSession !== 'function') return false;

      await window.ESHU_API.auth.supabaseSession({ accessToken });

      params.delete('auth');
      params.delete('code');
      const cleanSearch = params.toString();
      const clean = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '');
      window.history.replaceState(null, '', clean || window.location.pathname);

      try { window.dispatchEvent(new CustomEvent('eshu:auth-success')); } catch {}
      try { localStorage.setItem('eshu_backend', 'remote'); } catch {}
      return true;
    } catch (err) {
      console.warn('[ESHU_SUPABASE] email confirmation exchange failed:', err);
      return false;
    }
  }

  /**
   * Re-establish the ESHU app session (the `eshu.sid` cookie) from a still-
   * valid persisted Supabase session, WITHOUT requiring the user to type
   * their password again.
   *
   * Why this exists: the Supabase client persists its own session in this
   * browser (`persistSession: true`), but the app's server session is a
   * separate cookie that is only minted on explicit sign-in / email
   * confirmation. If that cookie expires or is cleared while the Supabase
   * session lives on, the device silently drops to LOCAL-ONLY mode on the
   * next load — it looks signed in (cached name) but no longer syncs, so
   * creations made there never reach the server and other devices' data
   * never appears. Calling this on a 401 rebuilds the bridge so "signed in"
   * actually means "syncing".
   *
   * Returns true only if a fresh app session was established.
   */
  async function ensureAppSession() {
    try {
      const client = await getClient();
      if (!client || !client.auth || typeof client.auth.getSession !== 'function') return false;
      const { data } = await client.auth.getSession();
      const accessToken = data && data.session && data.session.access_token;
      if (!accessToken) return false;
      if (!window.ESHU_API || typeof window.ESHU_API.auth.supabaseSession !== 'function') return false;
      await window.ESHU_API.auth.supabaseSession({ accessToken });
      try { localStorage.setItem('eshu_backend', 'remote'); } catch {}
      return true;
    } catch (err) {
      console.warn('[ESHU_SUPABASE] ensureAppSession failed:', err);
      return false;
    }
  }

  window.ESHU_SUPABASE = {
    init,
    getClient,
    getConfig: fetchConfig,
    handleEmailConfirmation,
    ensureAppSession,
  };

  document.addEventListener('DOMContentLoaded', () => {
    handleEmailConfirmation().catch(() => {});
  });
})();
