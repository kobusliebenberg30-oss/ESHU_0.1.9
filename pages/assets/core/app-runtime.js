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
    window.ESHU_LOADING.show({ key: 'navigation-target', maxMs: 2500 });

    const pathname = (window.location && window.location.pathname) || '';
    const waitsForPageRender = /(?:^|\/)(games|groups)\.html$/.test(pathname);
    if (!waitsForPageRender) {
      window.addEventListener('load', () => setTimeout(completeNavigationLoading, 120), { once: true });
    }
    setTimeout(completeNavigationLoading, waitsForPageRender ? 12000 : 3000);
  }

  function completeNavigationLoading() {
    try { sessionStorage.removeItem(NAV_PENDING_KEY); } catch {}
    if (window.ESHU_LOADING) {
      window.ESHU_LOADING.hide({ key: 'navigation', force: true });
      window.ESHU_LOADING.hide({ key: 'navigation-target', force: true });
    }
  }

  function isRemoteMode() {
    return !!(
      window.ESHU_REMOTE &&
      typeof window.ESHU_REMOTE.isEnabled === 'function' &&
      window.ESHU_REMOTE.isEnabled()
    );
  }

  function resolveProfileImage(profile) {
    if (!profile || typeof profile !== 'object') return null;
    if (profile.avatarAssetId && window.ESHU_ASSETS && typeof window.ESHU_ASSETS.urlFor === 'function') {
      return window.ESHU_ASSETS.urlFor(profile.avatarAssetId);
    }
    // In remote mode, inline profile images are legacy cache data. They can be
    // stale if a browser changed accounts, so only canonical asset ids render.
    if (isRemoteMode()) return null;
    if (typeof profile.image === 'string' && profile.image) return profile.image;
    if (profile.data && typeof profile.data === 'object' && typeof profile.data.image === 'string') {
      return profile.data.image;
    }
    return null;
  }

  function normalizeProfile(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    return {
      ...profile,
      image: resolveProfileImage(profile),
    };
  }

  function getProfiles() {
    if (!window.ESHU_DB || typeof window.ESHU_DB.getTable !== 'function') {
      return [];
    }

    const profiles = (window.ESHU_DB.getTable('profiles') || [])
      .filter((profile) => profile && profile.isActive !== false)
      .map(normalizeProfile);
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

  function initIdleScreensaver() {
    const IDLE_TIMEOUT_MS = 7.5 * 60 * 1000;
    const COLOR_INTERVAL_MS = 6500;
    const COLOR_TRANSITION_MS = 5200;
    let lastActivityAt = Date.now();
    let idleTimer = null;
    let colorTimer = null;
    let visible = false;
    let overlay = null;
    let playButton = null;

    function randomVividColor() {
      const hue = Math.floor(Math.random() * 360);
      const saturation = 82 + Math.floor(Math.random() * 19);
      const lightness = 38 + Math.floor(Math.random() * 21);
      return `hsl(${hue} ${saturation}% ${lightness}%)`;
    }

    function ensureStyles() {
      if (document.getElementById('eshu-idle-screensaver-style')) return;
      const style = document.createElement('style');
      style.id = 'eshu-idle-screensaver-style';
      style.textContent = `
        .eshu-idle-screensaver {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--eshu-idle-bg, #ffffff);
          opacity: 0;
          pointer-events: none;
          transition: opacity 420ms ease, background-color ${COLOR_TRANSITION_MS}ms ease-in-out;
        }
        .eshu-idle-screensaver.is-visible {
          opacity: 1;
          pointer-events: auto;
        }
        .eshu-idle-play-ring {
          position: relative;
          width: 180px;
          height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .eshu-idle-play-ring svg {
          position: absolute;
          inset: 0;
          width: 180px;
          height: 180px;
          transform: rotate(-90deg);
        }
        .eshu-idle-ring-bg {
          fill: none;
          stroke: rgba(255, 255, 255, 0.32);
          stroke-width: 6;
        }
        .eshu-idle-ring-fill {
          fill: none;
          stroke: #111111;
          stroke-width: 6;
          stroke-linecap: round;
        }
        .eshu-idle-play-button {
          appearance: none;
          -webkit-appearance: none;
          position: relative;
          z-index: 1;
          width: 150px;
          height: 150px;
          border: 0;
          border-radius: 9999px !important;
          background: #000;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font: 700 22px/1 Arial, sans-serif;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: background-color 220ms ease, color 220ms ease, transform 220ms ease;
        }
        .eshu-idle-play-button:hover,
        .eshu-idle-play-button:focus {
          background: #fff;
          color: #000;
          outline: none;
          transform: scale(1.02);
        }
        .eshu-idle-play-button:focus-visible {
          outline: 3px solid #66c0ff;
          outline-offset: 4px;
        }
      `;
      document.head.appendChild(style);
    }

    function ensureOverlay() {
      if (overlay) return overlay;
      ensureStyles();
      overlay = document.createElement('div');
      overlay.className = 'eshu-idle-screensaver';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Idle screen');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="eshu-idle-play-ring">
          <svg viewBox="0 0 180 180" aria-hidden="true">
            <circle class="eshu-idle-ring-bg" cx="90" cy="90" r="85"></circle>
            <circle class="eshu-idle-ring-fill" cx="90" cy="90" r="85"></circle>
          </svg>
          <button type="button" class="eshu-idle-play-button">PLAY</button>
        </div>
      `;
      overlay.style.setProperty('--eshu-idle-bg', '#ffffff');
      playButton = overlay.querySelector('.eshu-idle-play-button');
      if (playButton) {
        playButton.addEventListener('click', dismissScreensaver);
      }
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) event.stopPropagation();
      });
      document.body.appendChild(overlay);
      return overlay;
    }

    function cycleColor() {
      ensureOverlay().style.setProperty('--eshu-idle-bg', randomVividColor());
    }

    function startColorCycle() {
      stopColorCycle();
      cycleColor();
      colorTimer = window.setInterval(cycleColor, COLOR_INTERVAL_MS);
    }

    function stopColorCycle() {
      if (colorTimer) window.clearInterval(colorTimer);
      colorTimer = null;
    }

    function scheduleIdleTimer() {
      if (idleTimer) window.clearTimeout(idleTimer);
      if (visible) return;
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt));
      idleTimer = window.setTimeout(showScreensaver, remaining);
    }

    function showScreensaver() {
      if (visible || document.hidden) {
        scheduleIdleTimer();
        return;
      }
      visible = true;
      ensureOverlay();
      startColorCycle();
      window.requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
        if (playButton) playButton.focus({ preventScroll: true });
      });
    }

    function dismissScreensaver() {
      if (!visible) return;
      visible = false;
      lastActivityAt = Date.now();
      stopColorCycle();
      if (overlay) overlay.classList.remove('is-visible');
      scheduleIdleTimer();
    }

    function recordActivity() {
      if (visible) return;
      lastActivityAt = Date.now();
      scheduleIdleTimer();
    }

    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) showScreensaver();
      else scheduleIdleTimer();
    });
    scheduleIdleTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initXpHud();
      initIdleScreensaver();
    }, { once: true });
  } else {
    initXpHud();
    initIdleScreensaver();
  }

  window.ESHU_RUNTIME = {
    getProfiles,
    getAccountDisplayName,
    getEffectiveProfileName,
    getPlayerHeading,
    getActiveProfile,
    resolveProfileImage,
    getProfileXpValue,
    applyHudXp,
    completeNavigationLoading,
  };

  window.ESHU_LOADING = window.ESHU_LOADING || createLoadingRuntime();
  wireNavigationLoading();
  resumeNavigationLoading();
})();
