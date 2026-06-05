/**
 * Runtime Supabase config bridge for the browser.
 * If the Vercel API exposes Supabase settings, use them here.
 */
(function () {
  'use strict';

  function fallbackConfig() {
    return {
      enabled: false,
      url: null,
      anonKey: null,
      message: 'Supabase is not configured yet. The app will continue using local storage until Vercel env vars are set.',
    };
  }

  async function loadConfig() {
    try {
      if (window.ESHU_API && window.ESHU_API.auth && typeof window.ESHU_API.auth.supabaseConfig === 'function') {
        const cfg = await window.ESHU_API.auth.supabaseConfig();
        if (cfg && typeof cfg === 'object') {
          window.ESHU_SUPABASE_CONFIG = { ...fallbackConfig(), ...cfg };
          return;
        }
      }
    } catch (err) {
      console.warn('[ESHU_SUPABASE_CONFIG] Falling back to local-only config:', err);
    }

    window.ESHU_SUPABASE_CONFIG = fallbackConfig();
  }

  window.ESHU_SUPABASE_CONFIG = fallbackConfig();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { loadConfig().catch(() => {}); }, { once: true });
  } else {
    loadConfig().catch(() => {});
  }
})();
