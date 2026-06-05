(function () {
  'use strict';

  function initSettingsDropdown() {
    const settingsBtn = document.getElementById('settingsBtn');
    if (!settingsBtn) return;
    if (settingsBtn.dataset.settingsDropdownBound === 'true') return;

    const wrapper = settingsBtn.parentElement;
    if (!wrapper) return;

    wrapper.classList.add('settings-wrapper');

    let dropdown = document.getElementById('settingsDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'settings-dropdown';
      dropdown.id = 'settingsDropdown';
      wrapper.appendChild(dropdown);
    }

    const currentTheme = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? ESHU_DB.getValue('uiTheme') || 'light'
      : document.documentElement.getAttribute('data-theme') || 'light';

    const hideBurned = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('hideBurned')
      : false;

    const prebuiltInstalled = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? (!!ESHU_DB.getValue('prebuiltInstalled') || (ESHU_DB.isPrivatePrebuiltInstalled && ESHU_DB.isPrivatePrebuiltInstalled()))
      : false;

    const infiniteVotes = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('infiniteVotes')
      : false;

    const devModeEnabled = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('devModeEnabled')
      : false;

    const architectMode = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('architectMode')
      : false;

    dropdown.innerHTML = `
      <div class="settings-panel-card" role="dialog" aria-modal="false" aria-label="Settings">
        <div class="settings-dropdown-header">
          <h3>Settings</h3>
          <button type="button" class="settings-panel-close" id="settingsPanelClose" aria-label="Close settings">✕</button>
        </div>
        <div class="settings-dropdown-content">
          <div class="settings-row">
            <span class="settings-label">Theme</span>
            <button type="button"
                    class="theme-toggle${currentTheme === 'dark' ? ' is-dark' : ''}"
                    id="globalThemeToggle"
                    role="switch"
                    aria-checked="${currentTheme === 'dark'}"
                    aria-label="Toggle dark mode">
              <span class="theme-toggle-icon theme-toggle-sun" aria-hidden="true">☀</span>
              <span class="theme-toggle-icon theme-toggle-moon" aria-hidden="true">☾</span>
              <span class="theme-toggle-thumb" aria-hidden="true"></span>
            </button>
          </div>
          <div id="devSettingsSection" class="dev-settings-section${devModeEnabled ? '' : ' hidden'}">
            <div class="dev-settings-divider"></div>
            <div class="dev-settings-title">Developer Settings</div>
            <div class="settings-row">
              <span class="settings-label" id="globalBurnToggleLabel">${hideBurned ? 'Remove Ash' : 'Burn'}</span>
              <button type="button"
                      class="theme-toggle burn-toggle${hideBurned ? ' is-dark' : ''}"
                      id="globalBurnToggle"
                      role="switch"
                      aria-checked="${hideBurned}"
                      aria-label="Toggle burned card visibility">
                <span class="theme-toggle-icon burn-toggle-flame" aria-hidden="true">🔥</span>
                <span class="theme-toggle-icon burn-toggle-ash" aria-hidden="true">💨</span>
                <span class="theme-toggle-thumb" aria-hidden="true"></span>
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label" id="globalPrebuiltToggleLabel">Prebuilt Pack</span>
              <button type="button"
                      class="theme-toggle prebuilt-toggle${prebuiltInstalled ? ' is-dark' : ''}"
                      id="globalPrebuiltToggle"
                      role="switch"
                      aria-checked="${prebuiltInstalled}"
                      aria-label="Toggle prebuilt pack install">
                <span class="theme-toggle-thumb" aria-hidden="true"></span>
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label" id="globalInfiniteVotesToggleLabel">Infinite Votes</span>
              <button type="button"
                      class="theme-toggle infinite-votes-toggle${infiniteVotes ? ' is-dark' : ''}"
                      id="globalInfiniteVotesToggle"
                      role="switch"
                      aria-checked="${infiniteVotes}"
                      aria-label="Toggle infinite votes">
                <span class="theme-toggle-thumb" aria-hidden="true"></span>
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label" id="globalArchitectToggleLabel">Architect Mode</span>
              <button type="button"
                      class="theme-toggle architect-toggle${architectMode ? ' is-dark' : ''}"
                      id="globalArchitectToggle"
                      role="switch"
                      aria-checked="${architectMode}"
                      aria-label="Toggle Architect Mode - allows editing published creation assets">
                <span class="theme-toggle-thumb" aria-hidden="true"></span>
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">Data Management</span>
              <div class="settings-data-actions">
                <button type="button" id="eshuDownloadDataBtn" class="settings-action-btn">Export Data</button>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-build-info" id="buildInfo">ESHU Prototype A version 1</div>
      </div>
    `;

    // Account tools (Change password / Reclaim uploads / Delete account)
    // are contributed by an optional sibling component when authenticated.
    // Mounting is idempotent and safe even if the script isn't loaded.
    try {
      if (window.ESHU_ACCOUNT_TOOLS && typeof window.ESHU_ACCOUNT_TOOLS.mount === 'function') {
        window.ESHU_ACCOUNT_TOOLS.mount(dropdown);
      }
    } catch {}

    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Refresh auth-derived UI each time the panel opens, so logout/login
      // events that happened in another tab show up immediately.
      try {
        if (window.ESHU_ACCOUNT_TOOLS && typeof window.ESHU_ACCOUNT_TOOLS.refresh === 'function') {
          window.ESHU_ACCOUNT_TOOLS.refresh();
        }
      } catch {}
      dropdown.classList.toggle('open');

      // Sync developer settings visibility with stored state when dropdown opens
      const devSection = document.getElementById('devSettingsSection');
      if (devSection && typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue) {
        const devModeEnabled = !!ESHU_DB.getValue('devModeEnabled');
        if (devModeEnabled) {
          devSection.classList.remove('hidden');
        } else {
          devSection.classList.add('hidden');
        }
      }

      // Sync developer toggle states with stored values
      if (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue) {
        const prebuiltToggle = document.getElementById('globalPrebuiltToggle');
        if (prebuiltToggle) {
          const prebuiltInstalled = !!ESHU_DB.getValue('prebuiltInstalled');
          prebuiltToggle.classList.toggle('is-dark', prebuiltInstalled);
          prebuiltToggle.setAttribute('aria-checked', String(prebuiltInstalled));
        }

        const infiniteVotesToggle = document.getElementById('globalInfiniteVotesToggle');
        if (infiniteVotesToggle) {
          const infiniteVotes = !!ESHU_DB.getValue('infiniteVotes');
          infiniteVotesToggle.classList.toggle('is-dark', infiniteVotes);
          infiniteVotesToggle.setAttribute('aria-checked', String(infiniteVotes));
        }

        const architectToggle = document.getElementById('globalArchitectToggle');
        if (architectToggle) {
          const architectMode = !!ESHU_DB.getValue('architectMode');
          architectToggle.classList.toggle('is-dark', architectMode);
          architectToggle.setAttribute('aria-checked', String(architectMode));
        }

        const burnToggle = document.getElementById('globalBurnToggle');
        const burnLabel = document.getElementById('globalBurnToggleLabel');
        if (burnToggle) {
          const hideBurned = !!ESHU_DB.getValue('hideBurned');
          burnToggle.classList.toggle('is-dark', hideBurned);
          burnToggle.setAttribute('aria-checked', String(hideBurned));
          if (burnLabel) burnLabel.textContent = hideBurned ? 'Remove Ash' : 'Burn';
        }
      }

      const messagesDropdown = document.getElementById('messagesDropdown');
      if (messagesDropdown) messagesDropdown.classList.remove('open');

      const followedPanel = document.getElementById('globalFollowedPanel');
      if (followedPanel) followedPanel.classList.remove('open');
    });

    const settingsPanelClose = document.getElementById('settingsPanelClose');
    if (settingsPanelClose) {
      settingsPanelClose.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdown.classList.remove('open');
      });
    }

    const themeToggle = document.getElementById('globalThemeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = themeToggle.classList.contains('is-dark') ? 'light' : 'dark';
        themeToggle.classList.toggle('is-dark', next === 'dark');
        themeToggle.setAttribute('aria-checked', String(next === 'dark'));
        document.documentElement.setAttribute('data-theme', next);

        try { localStorage.setItem('eshu_theme', next); } catch {}
        if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
          ESHU_DB.setValue('uiTheme', next);
        }
        try { localStorage.setItem('eshu_ui_prefs', JSON.stringify({ uiTheme: next })); } catch {}

        const profileThemeSelect = document.getElementById('themeSelect');
        if (profileThemeSelect) {
          profileThemeSelect.value = next;
          profileThemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    const prebuiltToggle = document.getElementById('globalPrebuiltToggle');
    if (prebuiltToggle) {
      prebuiltToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const canInstall = typeof ESHU_DB !== 'undefined' && typeof ESHU_DB.forceImportPrivatePrebuilt === 'function';
        const canUninstall = typeof ESHU_DB !== 'undefined' && typeof ESHU_DB.uninstallPrivatePrebuilt === 'function';
        if (!canInstall || !canUninstall) {
          if (typeof TOAST !== 'undefined' && TOAST && typeof TOAST.error === 'function') {
            TOAST.error('Prebuilt toggle is unavailable right now.');
          }
          return;
        }

        const nextInstalled = !prebuiltToggle.classList.contains('is-dark');
        prebuiltToggle.classList.toggle('is-dark', nextInstalled);
        prebuiltToggle.setAttribute('aria-checked', String(nextInstalled));

        if (nextInstalled) {
          ESHU_DB.forceImportPrivatePrebuilt();
        } else {
          ESHU_DB.uninstallPrivatePrebuilt();
        }
        // Broadcast event so all pages update immediately
        window.dispatchEvent(new CustomEvent('eshu:prebuilt-pack-changed', { detail: { installed: nextInstalled } }));
        if (typeof TOAST !== 'undefined' && TOAST && typeof TOAST.success === 'function') {
          TOAST.success(nextInstalled ? 'Prebuilt games and creations imported.' : 'Prebuilt pack uninstalled.');
        }
      });
    }

    const burnToggle = document.getElementById('globalBurnToggle');
    const burnLabel = document.getElementById('globalBurnToggleLabel');
    if (burnToggle) {
      burnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextHide = !burnToggle.classList.contains('is-dark');
        burnToggle.classList.toggle('is-dark', nextHide);
        burnToggle.setAttribute('aria-checked', String(nextHide));
        if (burnLabel) burnLabel.textContent = nextHide ? 'Remove Ash' : 'Burn';
        if (nextHide) document.documentElement.setAttribute('data-hide-burned', 'true');
        else document.documentElement.removeAttribute('data-hide-burned');

        if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
          ESHU_DB.setValue('hideBurned', nextHide);
        }
      });
    }

    // Infinite Votes toggle
    const infiniteVotesToggle = document.getElementById('globalInfiniteVotesToggle');
    if (infiniteVotesToggle) {
      infiniteVotesToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextState = !infiniteVotesToggle.classList.contains('is-dark');
        infiniteVotesToggle.classList.toggle('is-dark', nextState);
        infiniteVotesToggle.setAttribute('aria-checked', String(nextState));

        if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
          ESHU_DB.setValue('infiniteVotes', nextState);
        }
        // Broadcast event so all pages update immediately
        window.dispatchEvent(new CustomEvent('eshu:infinite-votes-changed', { detail: { enabled: nextState } }));
        if (typeof TOAST !== 'undefined') {
          TOAST.success(nextState ? 'Infinite Votes enabled' : 'Infinite Votes disabled');
        }
      });
    }

    // Architect Mode toggle - allows editing published creation assets
    const architectToggle = document.getElementById('globalArchitectToggle');
    if (architectToggle) {
      architectToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextState = !architectToggle.classList.contains('is-dark');
        architectToggle.classList.toggle('is-dark', nextState);
        architectToggle.setAttribute('aria-checked', String(nextState));

        if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
          ESHU_DB.setValue('architectMode', nextState);
        }
        // Broadcast event so creation edit forms can update
        window.dispatchEvent(new CustomEvent('eshu:architect-mode-changed', { detail: { enabled: nextState } }));
        if (typeof TOAST !== 'undefined') {
          TOAST.success(nextState ? 'Architect Mode enabled - creation assets editable' : 'Architect Mode disabled - creation assets locked');
        }
      });
    }

    // Data Management - Export/Import
    bindDataManagementButtons();

    // Developer Mode - 6 clicks on build info
    const buildInfo = document.getElementById('buildInfo');
    let devModeClicks = 0;
    let devModeClickTimer = null;
    
    if (buildInfo) {
      buildInfo.style.cursor = 'pointer';
      buildInfo.addEventListener('click', () => {
        devModeClicks++;
        
        if (devModeClicks >= 6) {
          devModeClicks = 0;
          clearTimeout(devModeClickTimer);
          
          // Check if dev mode is already enabled
          const isDevModeEnabled = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
            ? !!ESHU_DB.getValue('devModeEnabled')
            : false;
          
          if (!isDevModeEnabled) {
            if (confirm('Enable Developer Mode?')) {
              if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
                ESHU_DB.setValue('devModeEnabled', true);
              }
              // Show developer settings
              const devSection = document.getElementById('devSettingsSection');
              if (devSection) devSection.classList.remove('hidden');
              if (typeof TOAST !== 'undefined') TOAST.success('Developer Mode enabled');
            }
          } else {
            // Dev mode already enabled, toggle it off
            if (confirm('Developer Mode is already enabled. Disable Developer Mode?')) {
              if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
                ESHU_DB.setValue('devModeEnabled', false);
              }
              // Hide developer settings
              const devSection = document.getElementById('devSettingsSection');
              if (devSection) devSection.classList.add('hidden');
              if (typeof TOAST !== 'undefined') TOAST.success('Developer Mode disabled');
            }
          }
          return;
        }
        
        // Reset click counter after 2 seconds
        clearTimeout(devModeClickTimer);
        devModeClickTimer = setTimeout(() => {
          devModeClicks = 0;
        }, 2000);
      });
    }

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    settingsBtn.dataset.settingsDropdownBound = 'true';
  }

  // Data Management Helper Functions
  function bindDataManagementButtons() {
    const downloadBtn = document.getElementById('eshuDownloadDataBtn');
    if (downloadBtn && !downloadBtn.dataset.bound) {
      downloadBtn.dataset.bound = 'true';
      downloadBtn.addEventListener('click', handleExportData);
    }
  }

  async function sha256(message) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      console.warn('crypto.subtle not available, using fallback hash');
      return btoa(message).slice(0, 64);
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function sanitizeFilename(value) {
    return String(value)
      .replace(/[^a-zA-Z0-9-_ ]+/g, '_')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50) || 'unknown';
  }

  function downloadBlob(blob, filename) {
    if (navigator.msSaveOrOpenBlob) {
      navigator.msSaveOrOpenBlob(blob, filename);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);

    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    a.dispatchEvent(clickEvent);

    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function handleExportData(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.exportDatabase) {
      if (typeof TOAST !== 'undefined') TOAST.error('Export not available');
      console.error('ESHU_DB not available');
      return;
    }
    try {
      const data = await ESHU_DB.exportDatabase();
      const profiles = data?.tables?.profiles || data?.profiles || [];
      const activeId = data?.activeProfileId;
      const activeProfile = profiles.find(p => p?.id === activeId);
      const profileName = sanitizeFilename(activeProfile?.name || 'unknown');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
      const filename = `eshu-${profileName}-${dateStr}-${timeStr}.json`;

      const EXPORT_PASSWORD = localStorage.getItem('eshuExportPassword') || '';
      let passwordHash = null;
      if (EXPORT_PASSWORD) {
        try {
          passwordHash = await sha256(EXPORT_PASSWORD);
        } catch (hashErr) {
          console.warn('Password hashing failed:', hashErr);
        }
      }
      const exportObj = {
        ...data,
        _eshuExport: true,
        _exportedAt: now.toISOString(),
        _exportVersion: '1.0',
        _exportPasswordHash: passwordHash,
        _profileName: profileName
      };

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      downloadBlob(blob, filename);
      if (typeof TOAST !== 'undefined') TOAST.success(`Exported: ${filename}`);
    } catch (err) {
      console.error('Export failed:', err);
      if (typeof TOAST !== 'undefined') TOAST.error(`Export failed: ${err.message}`);
      alert('Export failed: ' + err.message);
    }
  }

  function initFollowedButtonIcon() {
    const followedBtn = document.getElementById('followedBtn');
    if (!followedBtn) return;
    followedBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
    followedBtn.setAttribute('aria-label', 'Followed');
    if (!followedBtn.getAttribute('title')) {
      followedBtn.setAttribute('title', 'Followed');
    }
  }

  function initGlobalFollowedPanel() {
    const followedBtn = document.getElementById('followedBtn');
    if (!followedBtn) return;
    if (followedBtn.dataset.globalFollowPanelBound === 'true') return;

    let panel = document.getElementById('globalFollowedPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'globalFollowedPanel';
      panel.innerHTML = `
        <div class="global-followed-panel-card" role="dialog" aria-modal="false" aria-label="Followed activity">
          <div class="global-followed-panel-header">
            <h3>Followed Items</h3>
            <button type="button" id="globalFollowedPanelClose" aria-label="Close follow activity">✕</button>
          </div>
          <div class="global-followed-panel-content" id="globalFollowedPanelContent"></div>
        </div>
      `;
      document.body.appendChild(panel);
    }

    if (!document.getElementById('globalFollowedPanelStyles')) {
      const style = document.createElement('style');
      style.id = 'globalFollowedPanelStyles';
      style.textContent = `
        #globalFollowedPanel {
          position: fixed;
          top: 56px;
          right: 0;
          width: 320px;
          height: calc(100vh - 56px);
          display: flex;
          z-index: 1200;
          transform: translateX(100%);
          transition: transform 0.3s ease;
        }
        #globalFollowedPanel.open { transform: translateX(0); }
        #globalFollowedPanel .global-followed-panel-card {
          width: 100%;
          height: 100%;
          background: var(--bg-panel, #fff);
          color: var(--text-primary, #1b1f23);
          border-left: 1px solid var(--border-color, #e0e0e0);
          box-shadow: none;
          display: flex;
          flex-direction: column;
        }
        #globalFollowedPanel .global-followed-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-light, #eee);
        }
        #globalFollowedPanel .global-followed-panel-header h3 {
          margin: 0;
          font-size: 16px;
        }
        #globalFollowedPanel #globalFollowedPanelClose {
          width: 28px;
          height: 28px;
          min-width: 28px;
          min-height: 28px;
          padding: 0;
          border-radius: 0;
          background: var(--accent-black, #111);
          border: 1px solid var(--accent-black, #111);
          cursor: pointer;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s, border-color 0.15s;
          line-height: 1;
        }
        #globalFollowedPanel #globalFollowedPanelClose:hover {
          background: #333;
          border-color: #333;
        }
        #globalFollowedPanel .global-followed-panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        #globalFollowedPanel .global-followed-entry {
          border: 0;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          background: #f5f5f5;
        }
        #globalFollowedPanel .global-followed-entry:hover {
          background: #eee;
        }
        #globalFollowedPanel .global-followed-entry-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex: 0 0 auto;
          background: #ddd;
        }
        #globalFollowedPanel .global-followed-entry-body {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        #globalFollowedPanel .global-followed-entry-title {
          font-weight: 500;
          font-size: 14px;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #globalFollowedPanel .global-followed-entry-meta {
          font-size: 12px;
          color: #888;
        }
        #globalFollowedPanel .global-followed-empty {
          color: #888;
          text-align: center;
          padding: 14px;
          font-size: 13px;
        }
        html[data-theme="dark"] #globalFollowedPanel .global-followed-panel-card {
          background: #1a1a1a;
          color: #e5e7eb;
          border-left-color: #333;
          box-shadow: none;
        }
        html[data-theme="dark"] #globalFollowedPanel .global-followed-panel-header {
          border-bottom-color: #333;
        }
        html[data-theme="dark"] #globalFollowedPanel #globalFollowedPanelClose {
          background: #000000;
          border-color: #333333;
          color: #ffffff;
        }
        html[data-theme="dark"] #globalFollowedPanel #globalFollowedPanelClose:hover {
          background: #333333;
          border-color: #555555;
        }
        html[data-theme="dark"] #globalFollowedPanel .global-followed-entry {
          background: #252525;
        }
        html[data-theme="dark"] #globalFollowedPanel .global-followed-entry:hover {
          background: #2e2e2e;
        }
        html[data-theme="dark"] #globalFollowedPanel .global-followed-entry-icon {
          background: #333;
        }
        html[data-theme="dark"] #globalFollowedPanel .global-followed-entry-meta,
        html[data-theme="dark"] #globalFollowedPanel .global-followed-empty {
          color: #9ca3af;
        }
      `;
      document.head.appendChild(style);
    }

    const content = panel.querySelector('#globalFollowedPanelContent');
    const closeBtn = panel.querySelector('#globalFollowedPanelClose');

    function getCurrentProfileId() {
      if (typeof ESHU_DB === 'undefined') return null;
      const current = ESHU_DB.getValue ? ESHU_DB.getValue('currentProfileId') : null;
      if (current) return current;
      if (!ESHU_DB.getTable) return null;
      const profiles = (ESHU_DB.getTable('profiles') || []).filter((p) => p && p.isActive !== false);
      return profiles[0]?.id || null;
    }

    function getOwnerId(item) {
      if (!item || typeof item !== 'object') return null;
      return item.ownerProfileId || item.createdByProfileId || item.authorProfileId || item.authorId || null;
    }

    function isOwnedByProfile(item, profileId) {
      if (!profileId) return true;
      const ownerId = getOwnerId(item);
      if (!ownerId) return false;
      return ownerId === profileId;
    }

    function parseCommentsForProfile(profileId) {
      const rows = [];
      const pushComment = (comment, extras) => {
        if (!comment || typeof comment !== 'object') return;
        if (!isOwnedByProfile(comment, profileId)) return;
        const text = typeof comment.text === 'string'
          ? comment.text
          : (typeof comment.comment === 'string' ? comment.comment : 'Comment');
        const ts = comment.timestamp || comment.createdAt || extras.timestamp || Date.now();
        if (comment.followed) {
          rows.push({
            kind: 'follow-comment',
            label: `Followed comment: ${text.slice(0, 56)}`,
            meta: extras.creationName ? `in ${extras.creationName}` : 'global comment',
            timestamp: ts,
            href: extras.creationId ? `creation-focus.html?id=${extras.creationId}&from=${encodeURIComponent(window.location.pathname.split('/').pop() || 'home.html')}` : 'home.html?tab=comments',
            icon: '💬'
          });
        }
        if (comment.liked) {
          rows.push({
            kind: 'liked-comment',
            label: `Liked comment: ${text.slice(0, 56)}`,
            meta: extras.creationName ? `in ${extras.creationName}` : 'global comment',
            timestamp: ts,
            href: extras.creationId ? `creation-focus.html?id=${extras.creationId}&from=${encodeURIComponent(window.location.pathname.split('/').pop() || 'home.html')}` : 'home.html?tab=comments',
            icon: '❤️'
          });
        }
      };

      const globalComments = JSON.parse(localStorage.getItem('comments') || '[]');
      if (Array.isArray(globalComments)) {
        globalComments.forEach((entry) => pushComment(entry, { creationId: null, creationName: '' }));
      }

      const creations = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getTable) ? (ESHU_DB.getTable('creations') || []) : [];
      creations.forEach((creation) => {
        if (!creation?.id) return;
        const key = `comments_${creation.id}`;
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(list)) return;
        list.forEach((entry) => pushComment(entry, {
          creationId: creation.id,
          creationName: creation.name || creation.title || 'Creation',
          timestamp: creation.createdAt || creation.timestamp || Date.now()
        }));
      });

      return rows;
    }

    function buildProfileEntries() {
      const profileId = getCurrentProfileId();
      if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable) return [];

      const entries = [];
      const creations = ESHU_DB.getTable('creations') || [];
      const groups = ESHU_DB.getTable('groups') || [];
      const games = ESHU_DB.getTable('games') || [];

      creations.forEach((item) => {
        if (!item || !isOwnedByProfile(item, profileId)) return;
        const name = item.name || item.title || 'Creation';
        const createdTs = item.createdAt || item.timestamp || Date.now();
        entries.push({
          kind: 'created-creation',
          label: `Created: ${name}`,
          meta: 'creation',
          timestamp: createdTs,
          href: `creation-focus.html?id=${item.id}&from=${encodeURIComponent(window.location.pathname.split('/').pop() || 'home.html')}`,
          icon: '🎨'
        });
        if (item.followed) {
          entries.push({
            kind: 'followed-creation',
            label: `Followed creation: ${name}`,
            meta: 'creation',
            timestamp: createdTs,
            href: `creation-focus.html?id=${item.id}&from=${encodeURIComponent(window.location.pathname.split('/').pop() || 'home.html')}`,
            icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>'
          });
        }
        if (item.liked) {
          entries.push({
            kind: 'liked-creation',
            label: `Liked creation: ${name}`,
            meta: 'creation',
            timestamp: createdTs,
            href: `creation-focus.html?id=${item.id}&from=${encodeURIComponent(window.location.pathname.split('/').pop() || 'home.html')}`,
            icon: '❤️'
          });
        }
      });

      groups.forEach((item) => {
        if (!item || !isOwnedByProfile(item, profileId)) return;
        const name = item.name || 'Group';
        const ts = item.createdAt || item.timestamp || Date.now();
        entries.push({
          kind: 'created-group',
          label: `Created group: ${name}`,
          meta: item.type || 'group',
          timestamp: ts,
          href: `group-front.html?groupId=${item.id}`,
          icon: '👥'
        });
        if (item.followed) {
          entries.push({
            kind: 'followed-group',
            label: `Followed group: ${name}`,
            meta: item.type || 'group',
            timestamp: ts,
            href: `group-front.html?groupId=${item.id}`,
            icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>'
          });
        }
      });

      games.forEach((item) => {
        if (!item || !isOwnedByProfile(item, profileId)) return;
        const name = item.name || 'Game';
        const ts = item.createdAt || item.timestamp || item.startTime || Date.now();
        entries.push({
          kind: 'created-game',
          label: `Created game: ${name}`,
          meta: item.hostGroupName || 'game',
          timestamp: ts,
          href: `games.html?view=front&gameId=${item.id}`,
          icon: '🎮'
        });
        if (item.followed) {
          entries.push({
            kind: 'followed-game',
            label: `Followed game: ${name}`,
            meta: item.hostGroupName || 'game',
            timestamp: ts,
            href: `games.html?view=front&gameId=${item.id}`,
            icon: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>'
          });
        }
      });

      entries.push(...parseCommentsForProfile(profileId));
      entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return entries.slice(0, 80);
    }

    function renderPanel() {
      if (!content) return;
      const rows = buildProfileEntries();
      content.innerHTML = '';

      if (rows.length === 0) {
        content.innerHTML = '<div class="global-followed-empty">No follow activity for this player yet.</div>';
        return;
      }

      rows.forEach((row) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'global-followed-entry';
        item.innerHTML = `
          <div class="global-followed-entry-icon">${row.icon || '<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>'}</div>
          <div class="global-followed-entry-body">
            <div class="global-followed-entry-title">${row.label}</div>
            <div class="global-followed-entry-meta">${row.meta || ''}</div>
          </div>
        `;
        item.addEventListener('click', () => {
          if (row.href) {
            window.location.href = row.href;
          }
        });
        content.appendChild(item);
      });
    }

    function openPanel() {
      renderPanel();
      panel.classList.add('open');
    }

    function closePanel() {
      panel.classList.remove('open');
    }

    followedBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      if (panel.classList.contains('open')) {
        closePanel();
      } else {
        openPanel();
      }
    }, true);

    if (closeBtn && !closeBtn.dataset.globalFollowPanelBound) {
      closeBtn.addEventListener('click', closePanel);
      closeBtn.dataset.globalFollowPanelBound = 'true';
    }

    if (!panel.dataset.globalFollowPanelBound) {
      panel.addEventListener('click', (event) => {
        if (event.target === panel) closePanel();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('open')) {
          closePanel();
        }
      });
      panel.dataset.globalFollowPanelBound = 'true';
    }

    followedBtn.dataset.globalFollowPanelBound = 'true';
  }

  function initGlobalPlayGameModal() {
    const navPlayButtons = Array.from(document.querySelectorAll('.top-nav .nav-center .action-btn.play-btn'));
    if (navPlayButtons.length === 0) return;

    function escapeHtml(text) {
      if (typeof text !== 'string') return '';
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function runHype(message, onComplete, duration = 1500) {
      if (window.TOAST && typeof TOAST.hype === 'function') {
        TOAST.hype(message, { duration, onComplete });
        return;
      }

      if (!document.getElementById('global-play-hype-styles')) {
        const style = document.createElement('style');
        style.id = 'global-play-hype-styles';
        style.textContent = `
          .global-play-hype-overlay {
            position: fixed;
            inset: 0;
            z-index: 10020;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
            background: rgba(0, 0, 0, 0.28);
            backdrop-filter: blur(1px);
            touch-action: none;
          }
          .global-play-hype-text {
            background: #050607;
            color: #fff;
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 8px;
            min-width: min(88vw, 400px);
            padding: 20px 34px;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: .12em;
            text-transform: uppercase;
            text-align: center;
            box-shadow: 0 14px 34px rgba(0,0,0,.42);
            animation: globalPlayHypeInOut 1500ms cubic-bezier(.22,1,.36,1) forwards;
          }
          @keyframes globalPlayHypeInOut {
            0% { opacity: 0; transform: translateY(18px) scale(.86); filter: blur(2px); }
            18% { opacity: 1; transform: translateY(0) scale(1.02); filter: blur(0); }
            72% { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-10px) scale(1.06); }
          }
        `;
        document.head.appendChild(style);
      }

      const overlay = document.createElement('div');
      overlay.className = 'global-play-hype-overlay';
      overlay.innerHTML = `<div class="global-play-hype-text">${escapeHtml(message)}</div>`;
      document.body.appendChild(overlay);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (typeof onComplete === 'function') onComplete();
      };

      const textEl = overlay.querySelector('.global-play-hype-text');
      if (textEl) {
        textEl.style.animationDuration = `${Math.max(1000, Number(duration) || 1500)}ms`;
        textEl.addEventListener('animationend', cleanup, { once: true });
      }
      setTimeout(cleanup, Math.max(1100, Number(duration) || 1500) + 120);
    }

    function getActiveProfileId() {
      if (typeof ESHU_DB === 'undefined') return null;
      const current = ESHU_DB.getValue ? ESHU_DB.getValue('currentProfileId') : null;
      if (current) return current;
      if (!ESHU_DB.getTable) return null;
      const profiles = (ESHU_DB.getTable('profiles') || []).filter(p => p && p.isActive !== false);
      return profiles[0]?.id || null;
    }

    function getGroups() {
      if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable) return [];
      return ESHU_DB.getTable('groups') || [];
    }

    function getGames() {
      if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable) return [];
      return ESHU_DB.getTable('games') || [];
    }

    function getGroupMembers(group) {
      const members = Array.isArray(group?.memberProfileIds) ? group.memberProfileIds.filter(Boolean) : [];
      if (group?.ownerProfileId && !members.includes(group.ownerProfileId)) {
        members.push(group.ownerProfileId);
      }
      return members;
    }

    function getGameMembers(game) {
      const members = Array.isArray(game?.memberProfileIds) ? game.memberProfileIds.filter(Boolean) : [];
      if (game?.ownerProfileId && !members.includes(game.ownerProfileId)) {
        members.push(game.ownerProfileId);
      }
      return members;
    }

    function isGroupMember(group, profileId) {
      if (!group || !profileId) return false;
      return getGroupMembers(group).includes(profileId);
    }

    function canAccessGame(game, profileId, groups) {
      if (!game) return false;
      if (game.status === 'deleted' || game.status === 'burned') return false;
      if (game.privacy !== 'private') return true;
      if (!profileId) return false;
      if (game.ownerProfileId === profileId) return true;
      if (getGameMembers(game).includes(profileId)) return true;
      const hostGroup = (groups || []).find(g => g.id === game.hostGroupId);
      return isGroupMember(hostGroup, profileId);
    }

    function injectModalStyles() {
      if (document.getElementById('global-play-modal-styles')) return;
      const style = document.createElement('style');
      style.id = 'global-play-modal-styles';
      style.textContent = `
        #globalPlayGameModal {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 10000;
          align-items: center;
          justify-content: center;
        }
        #globalPlayGameModal.active { display: flex; }
        #globalPlayGameModal .create-modal-content {
          background: var(--bg-panel, #fff);
          width: 90%;
          max-width: 520px;
          max-height: 90vh;
          border-radius: var(--radius-lg, 6px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        #globalPlayGameModal .create-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-light, #e0e0e0);
        }
        #globalPlayGameModal .create-modal-header h2 {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }
        #globalPlayGameModal .create-modal-header .eshu-icon {
          width: 24px;
          height: 24px;
          background: #333;
          border-radius: 4px;
        }
        #globalPlayGameModal .create-modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--text-secondary, #666);
          padding: 0;
          line-height: 1;
        }
        #globalPlayGameModal .create-modal-close:hover { color: var(--text-primary, #111); }
        #globalPlayGameModal .create-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        #globalPlayGameModal .step-instruction {
          font-size: 13px;
          color: var(--text-primary, #111);
          margin: 0 0 16px 0;
        }
        #globalPlayGameModal .modal-search-wrap { margin-bottom: 12px; }
        #globalPlayGameModal .modal-search-input {
          width: 100%;
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: var(--radius-lg, 6px);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }
        #globalPlayGameModal .modal-search-input:focus {
          border-color: var(--accent-black, #111);
        }
        #globalPlayGameModal .group-list-container {
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: var(--radius-md, 4px);
          overflow: hidden;
        }
        #globalPlayGameModal .group-list-header {
          background: var(--bg-surface, #f8f8f8);
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary, #666);
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }
        #globalPlayGameModal .group-list-items {
          max-height: 320px;
          overflow-y: auto;
        }
        #globalPlayGameModal .group-list-item {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border-light, #e0e0e0);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.15s;
        }
        #globalPlayGameModal .group-list-item:last-child { border-bottom: none; }
        #globalPlayGameModal .group-list-item:hover { background: var(--bg-hover, #f9f9f9); }
        #globalPlayGameModal .group-list-item .group-icon {
          width: 32px;
          height: 32px;
          background: #ddd;
          border-radius: 4px;
          flex-shrink: 0;
        }
        #globalPlayGameModal .play-game-item-main { flex: 1; min-width: 0; }
        #globalPlayGameModal .play-game-item-title {
          font-size: 13px;
          color: #111;
          font-weight: 600;
          margin-bottom: 2px;
        }
        #globalPlayGameModal .play-game-item-meta {
          font-size: 12px;
          color: #666;
        }
        #globalPlayGameModal .play-game-item-votes {
          border: none;
          min-height: 34px;
          border-radius: 6px;
          background: var(--accent-black, #111);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          letter-spacing: 0.03em;
        }
        #globalPlayGameModal .play-game-item-votes-value {
          color: #3ea6ff;
          font-weight: 900;
          margin-left: 3px;
        }
        #globalPlayGameModal .play-game-item-action {
          border: none;
          min-height: 34px;
          border-radius: 6px;
          background: var(--accent-black, #111);
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          padding: 0 12px;
          cursor: pointer;
        }
        #globalPlayGameModal .play-game-item-action:hover { opacity: 0.9; }
        #globalPlayGameModal .create-modal-footer {
          display: flex;
          justify-content: center;
          padding: 14px 20px;
          border-top: 1px solid var(--border-light, #e0e0e0);
        }
        #globalPlayGameModal .btn-cancel {
          background: none;
          border: none;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #111);
          cursor: pointer;
          padding: 6px 18px;
        }
        #globalPlayGameModal .btn-cancel:hover { opacity: 0.7; }
      `;
      document.head.appendChild(style);
    }

    function ensureModalDom() {
      let modal = document.getElementById('globalPlayGameModal');
      if (modal) return modal;

      injectModalStyles();
      modal = document.createElement('div');
      modal.id = 'globalPlayGameModal';
      modal.className = 'create-game-modal play-game-modal';
      modal.innerHTML = `
        <div class="create-modal-content">
          <div class="create-modal-header">
            <h2><span class="eshu-icon"></span> Play Game</h2>
            <button class="create-modal-close" id="globalPlayGameClose">×</button>
          </div>
          <div class="create-modal-body">
            <p class="step-instruction">Search and choose a game to play</p>
            <div class="modal-search-wrap">
              <input type="text" class="modal-search-input" id="globalPlayGameSearch" placeholder="Search games..." />
              <select class="modal-search-input" id="globalPlayGameVotesFilter" aria-label="Filter games by votes available">
                <option value="all">All Games</option>
                <option value="votes_available">Votes Available</option>
              </select>
            </div>
            <div class="group-list-container">
              <div class="group-list-header">Games</div>
              <div class="group-list-items" id="globalPlayGameList"></div>
            </div>
          </div>
          <div class="create-modal-footer">
            <button type="button" class="btn-cancel" id="globalPlayGameCancelBtn">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      return modal;
    }

    const modal = ensureModalDom();
    const closeBtn = document.getElementById('globalPlayGameClose');
    const cancelBtn = document.getElementById('globalPlayGameCancelBtn');
    const searchInput = document.getElementById('globalPlayGameSearch');
    const votesFilterInput = document.getElementById('globalPlayGameVotesFilter');
    const listEl = document.getElementById('globalPlayGameList');
    if (!modal || !closeBtn || !searchInput || !listEl) return;

    function getGameVoteCount(game, profileId) {
      if (!game || !game.id) return 0;
      // Check for infinite votes (developer mode)
      const infiniteVotes = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
        ? !!ESHU_DB.getValue('infiniteVotes')
        : false;
      if (infiniteVotes) return Infinity;
      if (game.gameType === 'book') return Infinity;
      const creations = (ESHU_DB.getTable ? ESHU_DB.getTable('creations') : []) || [];
      const visible = creations.filter(c => {
        if ((c.hostGameId || c.gameId) !== game.id) return false;
        if (c.status === 'deleted' || c.status === 'burned') return false;
        if (c.privacy === 'private') {
          const ownerId = c.ownerProfileId || c.createdByProfileId || c.authorProfileId || c.authorId || null;
          return ownerId === profileId;
        }
        return true;
      });
      const cap = visible.length;
      let used = 0;
      try {
        const usageStore = typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue
          ? ESHU_DB.getValue('gameVoteUsageByProfile')
          : null;
        const byProfile = usageStore && typeof usageStore === 'object'
          ? usageStore[profileId]
          : null;
        if (byProfile && typeof byProfile === 'object') {
          used = Number(byProfile[game.id]) || 0;
        }
      } catch (e) { /* ignore */ }
      return Math.max(0, cap - used);
    }

    function renderGames() {
      const query = searchInput.value.trim().toLowerCase();
      const votesFilter = (votesFilterInput ? votesFilterInput.value : 'all').toLowerCase();
      const groups = getGroups();
      const activeProfileId = getActiveProfileId();

      let games = getGames().filter(game => canAccessGame(game, activeProfileId, groups));
      if (votesFilter === 'votes_available') {
        games = games.filter((game) => {
          const remainingVotes = getGameVoteCount(game, activeProfileId);
          return remainingVotes === Infinity || remainingVotes > 0;
        });
      }
      if (query) {
        games = games.filter((game) => {
          const name = (game.name || '').toLowerCase();
          const desc = (game.description || '').toLowerCase();
          const hostName = (groups.find(g => g.id === game.hostGroupId)?.name || '').toLowerCase();
          return name.includes(query) || desc.includes(query) || hostName.includes(query);
        });
      }

      if (games.length === 0) {
        listEl.innerHTML = query
          ? '<div style="padding:20px;text-align:center;color:#888;">No games match your search.</div>'
          : '<div style="padding:20px;text-align:center;color:#888;">No games available to play.</div>';
        return;
      }

      games.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      listEl.innerHTML = games.map((game) => {
        const hostGroup = groups.find(g => g.id === game.hostGroupId);
        const hostName = hostGroup?.name || 'No Group';
        const mode = game.gameType === 'book' ? 'Book' : 'Arena';
        const remaining = getGameVoteCount(game, activeProfileId);
        const remainingLabel = remaining === Infinity ? '∞' : remaining;
        return `
          <div class="group-list-item" data-game-id="${game.id}">
            <div class="group-icon"></div>
            <div class="play-game-item-main">
              <div class="play-game-item-title">${escapeHtml(game.name || 'Untitled Game')}</div>
              <div class="play-game-item-meta">${escapeHtml(hostName)} · ${mode}</div>
            </div>
            <span class="play-game-item-votes">Votes <span class="play-game-item-votes-value">${remainingLabel}</span></span>
            <button type="button" class="play-game-item-action">Play</button>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.group-list-item').forEach((item) => {
        const selectGame = () => {
          const gameId = item.dataset.gameId;
          if (!gameId) return;
          const game = getGames().find(g => g.id === gameId);
          if (!game) return;
          const mode = game.gameType === 'book' ? 'book' : 'arena';
          const currentParams = new URLSearchParams(window.location.search);
          const sourceGroupId = currentParams.get('sourceGroupId') || currentParams.get('groupId');
          const params = new URLSearchParams();
          params.set('gameId', game.id);
          params.set('mode', mode);
          if (sourceGroupId) params.set('sourceGroupId', sourceGroupId);
          closeModal();
          runHype('RIGHT ON!', () => {
            window.location.href = `eshu.html?${params.toString()}`;
          });
        };
        item.addEventListener('click', selectGame);
        const playBtn = item.querySelector('.play-game-item-action');
        if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); selectGame(); });
      });
    }

    function openModal() {
      searchInput.value = '';
      if (votesFilterInput) votesFilterInput.value = 'all';
      renderGames();
      modal.classList.add('active');
      searchInput.focus();
    }

    function closeModal() {
      modal.classList.remove('active');
    }

    if (!modal.dataset.bound) {
      closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
      });
      searchInput.addEventListener('input', renderGames);
      if (votesFilterInput) votesFilterInput.addEventListener('change', renderGames);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
          closeModal();
        }
      });
      modal.dataset.bound = 'true';
    }

    navPlayButtons.forEach((button) => {
      if (button.dataset.playModalBound === 'true') return;
      button.dataset.playModalBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        openModal();
      }, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSettingsDropdown();
      initFollowedButtonIcon();
      initGlobalFollowedPanel();
      initGlobalPlayGameModal();
    });
  } else {
    initSettingsDropdown();
    initFollowedButtonIcon();
    initGlobalFollowedPanel();
    initGlobalPlayGameModal();
  }
})();
