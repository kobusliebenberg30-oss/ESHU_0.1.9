(function () {
  'use strict';

  const LEGACY_DB_KEY = 'eshu_db_v1';
  const STORAGE_BASENAME = 'eshu_db_v2';
  const DB_KEY = resolveScopedDbKey();

  function normalizeStorageScope(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/^file:\/\//, '')
      .replace(/%20/g, ' ')
      .replace(/\\/g, '/')
      .replace(/\/pages\/.*$/, '')
      .replace(/\/[^/]*$/, '')
      .replace(/[^a-z0-9/_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function resolveScopedDbKey() {
    const href = (window.location && window.location.href) || '';
    const pathname = (window.location && window.location.pathname) || '';
    const rawScope = href.startsWith('file:///') ? href : pathname;
    const normalizedScope = normalizeStorageScope(rawScope);
    return normalizedScope ? `${STORAGE_BASENAME}__${normalizedScope}` : STORAGE_BASENAME;
  }

  function readDb() {
    try {
      // When the remote storage driver is active it writes to a user-scoped
      // cache key:  eshu_db_v2__user_<username>
      // theme-init runs before ESHU_DB so we must scan for those keys and
      // use the most recently-updated one that contains a valid uiTheme.
      var userKeyPrefix = DB_KEY + '__user_';
      var best = null;
      var bestMs = -1;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.startsWith(userKeyPrefix)) {
            try {
              var candidate = JSON.parse(localStorage.getItem(k));
              if (candidate && candidate.values && typeof candidate.values.uiTheme === 'string') {
                var ms = candidate.updatedAt ? Date.parse(candidate.updatedAt) : 0;
                if (!best || ms > bestMs) { best = candidate; bestMs = ms; }
              }
            } catch {}
          }
        }
      } catch {}
      if (best) return best;

      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
      const scopedLegacyRaw = localStorage.getItem(normalizeStorageScope(window.location && window.location.href).length
        ? `${LEGACY_DB_KEY}__${normalizeStorageScope(window.location && window.location.href)}`
        : LEGACY_DB_KEY);
      if (scopedLegacyRaw) return JSON.parse(scopedLegacyRaw);
      const legacyRaw = localStorage.getItem(LEGACY_DB_KEY);
      if (legacyRaw) return JSON.parse(legacyRaw);
      // Last resort: standalone UI prefs key written by remote-storage-driver
      // before it wipes the user-scoped cache on unauthenticated page loads.
      var uiPrefsRaw = localStorage.getItem('eshu_ui_prefs');
      if (uiPrefsRaw) {
        try { return { values: JSON.parse(uiPrefsRaw) }; } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  function readThemeFromDb() {
    // Primary source: a single flat key written directly on every toggle.
    // Nothing in the app ever wipes this key — it is the ground truth.
    try {
      var flat = localStorage.getItem('eshu_theme');
      if (flat === 'dark' || flat === 'light') return flat;
    } catch {}
    // Fallbacks for first-ever visit or migrated storage.
    const db = readDb();
    if (db && db.values && typeof db.values.uiTheme === 'string' && db.values.uiTheme) {
      return db.values.uiTheme;
    }
    return 'dark';
  }

  function readHideBurnedFromDb() {
    const db = readDb();
    return !!(db && db.values && db.values.hideBurned === true);
  }

  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }

  function applyHideBurned(hide) {
    if (hide) document.documentElement.setAttribute('data-hide-burned', 'true');
    else document.documentElement.removeAttribute('data-hide-burned');
  }

  applyTheme(readThemeFromDb());
  applyHideBurned(readHideBurnedFromDb());

  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY || e.key === LEGACY_DB_KEY) {
      applyTheme(readThemeFromDb());
      applyHideBurned(readHideBurnedFromDb());
    }
  });

  // ---------------------------------------------------------------------------
  // PAGE TRANSITION — smooth fade between pages
  // Injects an overlay that starts opaque (hides the white flash) and fades out
  // once the page is ready. On nav clicks it fades in before navigating away.
  // ---------------------------------------------------------------------------
  (function initPageTransition() {
    // Inject critical CSS inline so overlay works before stylesheets load
    var style = document.createElement('style');
    style.textContent = '.page-transition-overlay{position:fixed;inset:0;z-index:99999;pointer-events:none;opacity:0;transition:opacity .18s ease}.page-transition-overlay.active{opacity:1;pointer-events:all}';
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'page-transition-overlay active';
    // Match the page background so the overlay blends
    var theme = document.documentElement.getAttribute('data-theme');
    overlay.style.background = (theme === 'dark') ? '#000000' : '#ffffff';
    document.documentElement.appendChild(overlay);

    function fadeIn() {
      overlay.style.transition = 'opacity 0.15s ease';
      overlay.classList.add('active');
    }
    function fadeOut() {
      overlay.style.transition = 'opacity 0.18s ease';
      overlay.classList.remove('active');
    }

    // Fade out once DOM is interactive
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(fadeOut, 30); });
    } else {
      setTimeout(fadeOut, 30);
    }

    // Intercept internal link clicks for smooth exit
    document.addEventListener('click', function (e) {
      var anchor = e.target.closest('a[href]');
      if (!anchor) return;
      var href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto') || href.startsWith('tel')) return;
      if (anchor.target === '_blank') return;
      // Only intercept same-origin .html links
      if (href.indexOf('://') !== -1 && href.indexOf(location.origin) !== 0) return;
      e.preventDefault();
      fadeIn();
      setTimeout(function () { window.location.href = href; }, 150);
    });
  })();

  // ---------------------------------------------------------------------------
  // NAV_BACK
  // Small shared helper so any place that navigates away from a modal/overlay
  // can "stamp" a return URL onto the current history entry. When the target
  // page's Close/Back button then calls history.back(), the browser returns
  // here with the stamped query params, letting our bootstrap re-open the
  // same modal state the user left. Also provides a safe goBack() with fallback.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // HUD prime — paint XP + profile name from localStorage the instant the nav
  // elements are parsed (head script + MutationObserver), before first paint.
  // Stops the visible 0 XP → N jump and "Player" → name flash on every page.
  // ---------------------------------------------------------------------------
  (function hudPrime() {
    var HUD_XP_KEY = 'eshu.hud.xp';
    var HUD_AUTH_KEY = 'eshu.hud.auth';

    function readCachedXp() {
      try {
        var raw = localStorage.getItem(HUD_XP_KEY);
        if (raw == null) return null;
        var n = parseInt(raw, 10);
        return isFinite(n) ? n : null;
      } catch (e) {
        return null;
      }
    }

    function readCachedAuthName() {
      try {
        var raw = localStorage.getItem(HUD_AUTH_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        return parsed && parsed.name ? parsed.name : null;
      } catch (e) {
        return null;
      }
    }

    function paintHud() {
      var painted = false;
      var cachedXp = readCachedXp();
      var xpEl = document.getElementById('xpCounter');
      if (xpEl && cachedXp != null) {
        xpEl.textContent = cachedXp + ' XP';
        xpEl.dataset.hudPrimed = '1';
        painted = true;
      }
      var name = readCachedAuthName();
      if (name) {
        var navName = document.getElementById('profileNameNav');
        if (navName) navName.textContent = name;
        painted = true;
      }
      return painted;
    }

    function watchHud() {
      if (paintHud()) return;
      try {
        var obs = new MutationObserver(function () {
          if (paintHud()) obs.disconnect();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
      } catch (e) {
        document.addEventListener('DOMContentLoaded', paintHud, { once: true });
      }
    }

    watchHud();
  })();

  window.NAV_BACK = {
    /** Replace current history entry URL so Back from the next page lands here. */
    stamp(returnUrl) {
      if (!returnUrl) return;
      try {
        window.history.replaceState(window.history.state || null, document.title, returnUrl);
      } catch (_) { /* non-fatal in sandboxed contexts */ }
    },
    /** Stamp a return URL (optional) then navigate to target. */
    goToWithReturn(targetUrl, returnUrl) {
      if (!targetUrl) return;
      if (returnUrl) this.stamp(returnUrl);
      window.location.href = targetUrl;
    },
    /** Go back in history, or fall back to a URL if there's nowhere to go. */
    goBack(fallbackUrl) {
      if (window.history.length > 1) window.history.back();
      else if (fallbackUrl) window.location.href = fallbackUrl;
    }
  };
})();
