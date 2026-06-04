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
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') !== 'confirmed') return false;

      const hash = window.location.hash.slice(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      if (!accessToken) return false;

      if (!window.ESHU_API || typeof window.ESHU_API.auth.supabaseSession !== 'function') return false;

      await window.ESHU_API.auth.supabaseSession({ accessToken });

      const clean = window.location.pathname + window.location.search.replace(/[?&]auth=confirmed/, '').replace(/^&/, '?');
      window.history.replaceState(null, '', clean || window.location.pathname);

      try { window.dispatchEvent(new CustomEvent('eshu:auth-success')); } catch {}
      try { localStorage.setItem('eshu_backend', 'remote'); } catch {}
      return true;
    } catch (err) {
      console.warn('[ESHU_SUPABASE] email confirmation exchange failed:', err);
      return false;
    }
  }

  window.ESHU_SUPABASE = {
    init,
    getClient,
    getConfig: fetchConfig,
    handleEmailConfirmation,
  };

  document.addEventListener('DOMContentLoaded', () => {
    handleEmailConfirmation().catch(() => {});
  });
})();
