(function () {
  'use strict';

  const NAV_PENDING_KEY = 'eshu:navigation-loading-started-at';

  function ensureLoadingOverlay() {
    if (!document || !document.body) return null;
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.id = 'loadingOverlay';
      overlay.innerHTML = '<div class="loading-spinner" aria-hidden="true"></div>';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function createLoadingRuntime() {
    const activeKeys = new Map();
    const buttonState = new WeakMap();
    let fallbackHideTimer = null;

    function setOverlayActive(active) {
      const overlay = ensureLoadingOverlay();
      if (!overlay) return;
      overlay.classList.toggle('active', !!active);
    }

    function hasActiveKeys() {
      return Array.from(activeKeys.values()).some((count) => count > 0);
    }

    function show(options = {}) {
      const key = options.key || 'global';
      activeKeys.set(key, (activeKeys.get(key) || 0) + 1);
      setOverlayActive(true);
      if (fallbackHideTimer) clearTimeout(fallbackHideTimer);
      fallbackHideTimer = setTimeout(() => hide({ key, force: true }), options.maxMs || 9000);
    }

    function hide(options = {}) {
      const key = options.key || 'global';
      const current = activeKeys.get(key) || 0;
      if (options.force || current <= 1) {
        activeKeys.delete(key);
      } else {
        activeKeys.set(key, current - 1);
      }
      if (!hasActiveKeys()) setOverlayActive(false);
    }

    function showButton(target) {
      if (!target || !target.classList) return;
      const current = buttonState.get(target) || { count: 0, disabled: target.disabled };
      current.count += 1;
      buttonState.set(target, current);
      target.classList.add('eshu-action-loading');
      if ('disabled' in target) target.disabled = true;
      if (!target.querySelector(':scope > .eshu-button-loading-spinner')) {
        const spinner = document.createElement('span');
        spinner.className = 'eshu-button-loading-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        target.appendChild(spinner);
      }
    }

    function hideButton(target, options = {}) {
      if (!target || !target.classList) return;
      const current = buttonState.get(target);
      if (!current) return;
      current.count = options.force ? 0 : Math.max(0, current.count - 1);
      if (current.count > 0) {
        buttonState.set(target, current);
        return;
      }
      const spinner = target.querySelector(':scope > .eshu-button-loading-spinner');
      if (spinner) spinner.remove();
      target.classList.remove('eshu-action-loading');
      if ('disabled' in target) target.disabled = !!current.disabled;
      buttonState.delete(target);
    }

    return { show, hide, showButton, hideButton };
  }

  function isInternalPageLink(anchor) {
    if (!anchor || !anchor.href) return false;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return false;
    }
    if (anchor.target && anchor.target !== '_self') return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.origin === window.location.origin && /\.html(?:$|\?)/.test(url.pathname + url.search);
    } catch {
      return false;
    }
  }

  function wireNavigationLoading() {
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!isInternalPageLink(anchor)) return;
      try { sessionStorage.setItem(NAV_PENDING_KEY, String(Date.now())); } catch {}
      window.ESHU_LOADING.show({ key: 'navigation', maxMs: 7000 });
    }, true);
  }

  function resumeNavigationLoading() {
    let startedAt = 0;
    try { startedAt = parseInt(sessionStorage.getItem(NAV_PENDING_KEY) || '0', 10); } catch {}
    if (!startedAt || Date.now() - startedAt > 8000) return;
    window.ESHU_LOADING.show({ key: 'navigation-target', maxMs: 6000 });

    const pathname = (window.location && window.location.pathname) || '';
    const waitsForPageRender = /(?:^|\/)(games|groups)\.html$/.test(pathname);
    if (!waitsForPageRender) {
      window.addEventListener('load', () => setTimeout(completeNavigationLoading, 1000), { once: true });
    }
    setTimeout(completeNavigationLoading, 12000);
  }

  function completeNavigationLoading() {
    try { sessionStorage.removeItem(NAV_PENDING_KEY); } catch {}
    if (window.ESHU_LOADING) {
      window.ESHU_LOADING.hide({ key: 'navigation', force: true });
      window.ESHU_LOADING.hide({ key: 'navigation-target', force: true });
    }
  }

  function getProfiles() {
    if (!window.ESHU_DB || typeof window.ESHU_DB.getTable !== 'function') {
      return [];
    }

    const profiles = (window.ESHU_DB.getTable('profiles') || []).filter((profile) => profile && profile.isActive !== false);
    if (!profiles.length) {
      return [];
    }

    const activeId = window.ESHU_DB.getValue('currentProfileId');
    const active = profiles.find((profile) => profile.id === activeId) || profiles[0];
    return active ? [active] : [];
  }

  function getAccountDisplayName() {
    const user = window.ESHU_AUTH?.user || null;
    return user?.displayName || user?.username || null;
  }

  function getEffectiveProfileName(profile) {
    const profileName = profile?.name || window.ESHU_DB?.getValue('profileName') || null;
    const accountName = getAccountDisplayName();
    if (!profileName || profileName === 'Player') {
      return accountName || 'Player';
    }
    return profileName;
  }

  function getPlayerHeading(name) {
    return name && name !== 'Player' ? `Player ${name}` : 'Player';
  }

  function getActiveProfile() {
    const profiles = getProfiles();
    const activeId = window.ESHU_DB?.getValue('currentProfileId');
    const found = profiles.find((profile) => profile.id === activeId);
    if (found) {
      return found;
    }
    if (profiles.length > 0) {
      return profiles[0];
    }
    return null;
  }

  function getProfileXpValue(profileId) {
    if (!window.ESHU_DB || typeof window.ESHU_DB.getProfileXp !== 'function') {
      return 0;
    }

    return parseInt(window.ESHU_DB.getProfileXp(profileId) || 0, 10);
  }

  // ---- XP HUD persistence -------------------------------------------------
  //
  // This is a multi-page app: every navigation is a full document load, so the
  // top-nav XP counter starts life as the hardcoded "0 XP" in the HTML and only
  // gets its real value once the page's boot() reads ESHU_DB (which may be
  // gated on remote activation / sync). That made XP visibly flash 0 → N on
  // every page change. We persist the last shown XP in localStorage and paint
  // it the instant this early script runs, so the number is CONSTANT across
  // navigations. A MutationObserver re-caches whatever any page writes into
  // #xpCounter, so this stays decoupled from each page's own formatting (some
  // append " +"); we only ever cache/repaint the numeric value.
  const HUD_XP_KEY = 'eshu.hud.xp';

  function getHudProfileId() {
    try {
      if (window.ESHU_DB && typeof window.ESHU_DB.getActiveProfileId === 'function') {
        const id = window.ESHU_DB.getActiveProfileId();
        if (id) return id;
      }
      if (window.ESHU_DB && typeof window.ESHU_DB.getValue === 'function') {
        const id = window.ESHU_DB.getValue('currentProfileId');
        if (id) return id;
      }
    } catch {}
    return null;
  }

  function getHudXpKey(profileId) {
    return profileId ? `${HUD_XP_KEY}.${profileId}` : null;
  }

  function getXpCounterEl() {
    return document.getElementById('xpCounter');
  }

  function readCachedXp() {
    const key = getHudXpKey(getHudProfileId());
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  function cacheXp(n) {
    const key = getHudXpKey(getHudProfileId());
    if (!key) return;
    try { localStorage.setItem(key, String(n)); } catch {}
  }

  function applyHudXp(n, options) {
    const el = getXpCounterEl();
    if (!el || !Number.isFinite(n)) return n;
    const opts = options || {};
    const prev = readCachedXp();
    const next = opts.force
      ? n
      : (prev != null ? Math.max(prev, n) : n);
    el.textContent = next + ' XP';
    el.dataset.hudPrimed = '1';
    cacheXp(next);
    return next;
  }

  function primeXpFromCache() {
    const el = getXpCounterEl();
    if (!el) return;
    const cached = readCachedXp();
    if (cached == null) return;
    // Always restore the cached value — theme-init may have primed already,
    // but page boot can briefly write a lower DB snapshot (optimistic XP
    // awards, sync lag). The HUD stays monotonic until logout.
    applyHudXp(cached, { force: true });
  }

  function syncHudFromActiveProfile() {
    const profileId = getHudProfileId();
    if (!profileId) return;
    const xp = getProfileXpValue(profileId);
    applyHudXp(xp, { force: true });
  }

  function observeXpCounter() {
    const el = getXpCounterEl();
    if (!el || typeof MutationObserver === 'undefined') return;
    const recache = () => {
      const n = parseInt(el.textContent || '', 10);
      if (!Number.isFinite(n)) return;
      const prev = readCachedXp();
      // Revert visible dips from stale DB reads during hydration — the HUD
      // stays monotonic until logout clears the cache key.
      if (prev != null && n < prev) {
        el.textContent = prev + ' XP';
        return;
      }
      if (prev !== n) cacheXp(n);
    };
    try {
      const obs = new MutationObserver(recache);
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    } catch {}
    recache();
  }

  function initXpHud() {
    try { localStorage.removeItem(HUD_XP_KEY); } catch {}
    primeXpFromCache();
    observeXpCounter();
    window.addEventListener('eshu:remote-activated', syncHudFromActiveProfile);
    window.addEventListener('eshu:sync-success', syncHudFromActiveProfile);
    window.addEventListener('eshu:auth-success', () => {
      try { localStorage.removeItem(HUD_XP_KEY); } catch {}
    });
    window.addEventListener('eshu:auth-logout', () => {
      try { localStorage.removeItem(HUD_XP_KEY); } catch {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initXpHud, { once: true });
  } else {
    initXpHud();
  }

  window.ESHU_RUNTIME = {
    getProfiles,
    getAccountDisplayName,
    getEffectiveProfileName,
    getPlayerHeading,
    getActiveProfile,
    getProfileXpValue,
    applyHudXp,
    completeNavigationLoading,
  };

  window.ESHU_LOADING = window.ESHU_LOADING || createLoadingRuntime();
  wireNavigationLoading();
  resumeNavigationLoading();
})();
