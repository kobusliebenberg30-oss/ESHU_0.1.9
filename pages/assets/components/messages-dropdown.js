(function () {
  'use strict';

  const APP_VERSION = 'PROTOTYPE A version 1';
  const CREATION_UPLOAD_UNLOCK_XP = 2;
  const COMMENTS_UNLOCK_XP = 3;

  const ADMIN_ANNOUNCEMENTS = [
    {
      id: 'proto-a-v1',
      title: 'Welcome to ESHU',
      text: `You are using ${APP_VERSION}. Thank you for testing!`,
      date: '2026-04-09'
    }
  ];

  function hasJoinedAnyGroup(profileId) {
    if (!profileId) return false;
    const profileIds = new Set([profileId]);
    if (typeof ESHU_DB !== 'undefined') {
      if (ESHU_DB.getActiveProfileId) {
        const activeId = ESHU_DB.getActiveProfileId();
        if (activeId) profileIds.add(activeId);
      }
      if (ESHU_DB.getTable) {
        (ESHU_DB.getTable('profiles') || []).forEach(p => {
          if (p && p.id) profileIds.add(p.id);
        });
      }
    }
    const byId = new Map();
    if (typeof ESHU_DB !== 'undefined' && ESHU_DB.getTable) {
      (ESHU_DB.getTable('groups') || []).forEach(g => {
        if (g && g.id) byId.set(g.id, g);
      });
    }
    if (typeof STATE !== 'undefined' && STATE.get) {
      (STATE.get('groups') || []).forEach(g => {
        if (g && g.id) byId.set(g.id, g);
      });
    }
    const groups = Array.from(byId.values()).filter(g => {
      if (!g) return false;
      if (typeof ESHU_DB !== 'undefined' && ESHU_DB.isEntityActive) return ESHU_DB.isEntityActive(g);
      return g.status !== 'deleted' && g.status !== 'burned';
    });
    return groups.some(g => {
      const members = Array.isArray(g.memberProfileIds) ? g.memberProfileIds.filter(Boolean) : [];
      if (g.ownerProfileId && !members.includes(g.ownerProfileId)) members.push(g.ownerProfileId);
      return members.some(id => profileIds.has(id));
    });
  }

  function getProfileXpSafe(profileId) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getProfileXp) return 0;
    return parseInt(ESHU_DB.getProfileXp(profileId) || 0, 10);
  }

  function hasCreatedAnyGame(profileId) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable || !profileId) return false;
    const games = (ESHU_DB.getTable('games') || []).filter(g => g && ESHU_DB.isEntityActive(g));
    return games.some(g => (g.createdByProfileId && g.createdByProfileId === profileId) || (g.ownerProfileId && g.ownerProfileId === profileId));
  }

  // Onboarding parity: a player who only joined the default group (and thus
  // got `game_default` materialised onto their membership list) is at the
  // same XP threshold as one who created their own first game. The unlock
  // message should fire on either path.
  function isMemberOfDefaultGame(profileId) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable || !profileId) return false;
    const games = ESHU_DB.getTable('games') || [];
    const def = games.find(g => g && g.id === 'game_default');
    if (!def) return false;
    return Array.isArray(def.memberProfileIds) && def.memberProfileIds.includes(profileId);
  }

  function hasUploadedAnyCreation(profileId) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable || !profileId) return false;
    const creations = (ESHU_DB.getTable('creations') || []).filter(c => c && ESHU_DB.isEntityActive(c));
    return creations.some(c => (c.createdByProfileId && c.createdByProfileId === profileId) || (c.ownerProfileId && c.ownerProfileId === profileId));
  }

  // All possible milestone messages in unlock order
  const MILESTONE_CATALOG = [
    {
      id: 'onboard-join-group',
      type: 'onboard',
      icon: '👋',
      title: 'Get Started',
      text: 'Manually join a Group to unlock game creation and start playing!',
      check: function (profileId, inGroup, xp) { return true; }
    },
    {
      id: 'unlock-create-games',
      type: 'unlock',
      icon: '🎮',
      title: 'Create Games Unlocked',
      text: 'You joined a Group. You can now Create Games!',
      check: function (profileId, inGroup, xp) { return inGroup; }
    },
    {
      id: 'unlock-upload-creations',
      type: 'unlock',
      icon: '🎨',
      title: 'Upload Creation Unlocked',
      text: 'You Can Now Upload Creations!',
      check: function (profileId, inGroup, xp) {
        return hasCreatedAnyGame(profileId) || isMemberOfDefaultGame(profileId);
      }
    },
    {
      id: 'unlock-comments',
      type: 'unlock',
      icon: '💬',
      title: 'You Unlocked Comments',
      text: 'You can now comment forever!',
      // Mirror the runtime gate exactly so the announcement only appears
      // when comments truly become postable. The gate is `xp >= COMMENTS_UNLOCK_XP`
      // (see `canComment` below) — anything else creates the "I unlocked it
      // but Send does nothing" footgun the user hit.
      check: function (profileId, inGroup, xp) { return xp >= COMMENTS_UNLOCK_XP; }
    }
  ];

  function getEarnedMilestoneKey(profileId) {
    return 'earnedMilestones_' + (profileId || 'global');
  }

  function getEarnedMilestoneIds(profileId) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getValue) return [];
    const raw = ESHU_DB.getValue(getEarnedMilestoneKey(profileId));
    return Array.isArray(raw) ? raw : [];
  }

  function persistEarnedMilestones(profileId, ids) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.setValue) return;
    ESHU_DB.setValue(getEarnedMilestoneKey(profileId), ids);
  }

  function getUnlockMessages() {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getTable) return [];

    const activeProfileId = ESHU_DB.getValue('currentProfileId');
    const inGroup = hasJoinedAnyGroup(activeProfileId);
    const xp = getProfileXpSafe(activeProfileId);

    var earnedIds = getEarnedMilestoneIds(activeProfileId);
    var changed = false;

    // Check each milestone; persist newly-earned ones
    for (var i = 0; i < MILESTONE_CATALOG.length; i++) {
      var m = MILESTONE_CATALOG[i];
      if (!earnedIds.includes(m.id) && m.check(activeProfileId, inGroup, xp)) {
        earnedIds.push(m.id);
        changed = true;
      }
    }

    if (changed) {
      persistEarnedMilestones(activeProfileId, earnedIds);
    }

    // Return all earned messages in the order they were earned
    var messages = [];
    for (var j = 0; j < earnedIds.length; j++) {
      for (var k = 0; k < MILESTONE_CATALOG.length; k++) {
        if (MILESTONE_CATALOG[k].id === earnedIds[j]) {
          messages.push({
            id: MILESTONE_CATALOG[k].id,
            type: MILESTONE_CATALOG[k].type,
            icon: MILESTONE_CATALOG[k].icon,
            title: MILESTONE_CATALOG[k].title,
            text: MILESTONE_CATALOG[k].text
          });
          break;
        }
      }
    }

    return messages;
  }

  function getReadMessageKey(profileId) {
    return 'readMessageIds_' + (profileId || 'global');
  }

  function getReadMessageIds() {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getValue) return [];
    var profileId = ESHU_DB.getValue('currentProfileId');
    var raw = ESHU_DB.getValue(getReadMessageKey(profileId));
    var merged = new Set(Array.isArray(raw) ? raw : []);
    if (ESHU_DB.exportSnapshot) {
      var snapshot = ESHU_DB.exportSnapshot();
      var values = snapshot && snapshot.values && typeof snapshot.values === 'object' ? snapshot.values : {};
      Object.keys(values).forEach(function (key) {
        if (key.indexOf('readMessageIds_') !== 0) return;
        var ids = values[key];
        if (Array.isArray(ids)) ids.forEach(function (id) { merged.add(id); });
      });
    }
    return Array.from(merged);
  }

  function markMessageRead(id) {
    if (typeof ESHU_DB === 'undefined' || !ESHU_DB.setValue) return;
    var profileId = ESHU_DB.getValue('currentProfileId');
    var read = getReadMessageIds();
    if (!read.includes(id)) {
      read.push(id);
      ESHU_DB.setValue(getReadMessageKey(profileId), read);
    }
  }

  function initMessagesDropdown() {
    const messagesBtn = document.getElementById('messagesBtn');
    if (!messagesBtn) return;
    if (messagesBtn.dataset.messagesDropdownBound === 'true') return;

    const wrapper = messagesBtn.parentElement;
    if (!wrapper) return;

    wrapper.classList.add('messages-wrapper');

    let dropdown = document.getElementById('messagesDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'messages-dropdown';
      dropdown.id = 'messagesDropdown';
      wrapper.appendChild(dropdown);
    }

    const localReadMessageIdsByProfile = new Map();

    function getCurrentProfileIdSafe() {
      if (typeof ESHU_DB === 'undefined' || !ESHU_DB.getValue) return 'global';
      return ESHU_DB.getValue('currentProfileId') || 'global';
    }

    function getLocalReadSetForProfile(profileId) {
      const key = profileId || 'global';
      if (!localReadMessageIdsByProfile.has(key)) {
        localReadMessageIdsByProfile.set(key, new Set());
      }
      return localReadMessageIdsByProfile.get(key);
    }

    function getEffectiveReadMessageIds() {
      const profileId = getCurrentProfileIdSafe();
      const persisted = getReadMessageIds();
      const merged = new Set(Array.isArray(persisted) ? persisted : []);
      const localReadSet = getLocalReadSetForProfile(profileId);
      localReadSet.forEach(id => merged.add(id));
      return Array.from(merged);
    }

    function applyUnreadState(unreadCount) {
      if (unreadCount > 0) {
        messagesBtn.setAttribute('data-unread', unreadCount);
        messagesBtn.classList.add('has-unread');
      } else {
        messagesBtn.removeAttribute('data-unread');
        messagesBtn.classList.remove('has-unread');
      }
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatHistoryTime(timestamp) {
      const date = new Date(Number(timestamp) || Date.now());
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getToastHistoryRows() {
      if (typeof TOAST === 'undefined' || !TOAST || typeof TOAST.getHistory !== 'function') return [];
      const history = TOAST.getHistory();
      return Array.isArray(history) ? history : [];
    }

    function renderMessages() {
      const unlocks = getUnlockMessages();
      const readIds = getEffectiveReadMessageIds();

      const allMessages = [
        ...ADMIN_ANNOUNCEMENTS.map(a => ({
          ...a,
          type: 'announcement',
          icon: '📢'
        })),
        ...unlocks
      ];

      const unreadCount = allMessages.filter(m => !readIds.includes(m.id)).length;
      applyUnreadState(unreadCount);
      const toastHistoryRows = getToastHistoryRows();

      if (allMessages.length === 0 && toastHistoryRows.length === 0) {
        dropdown.innerHTML = `
          <div class="messages-panel-card" role="dialog" aria-modal="false" aria-label="Messages and toast history">
            <div class="messages-dropdown-header">
              <h3>Inbox</h3>
              <button type="button" class="messages-panel-close" aria-label="Close inbox panel">✕</button>
            </div>
            <div class="messages-dropdown-content">
              <div class="message-item message-empty">No messages or toast history yet</div>
            </div>
          </div>
        `;
        const closeBtn = dropdown.querySelector('.messages-panel-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', function () {
            dropdown.classList.remove('open');
          });
        }
        return;
      }

      dropdown.innerHTML = `
        <div class="messages-panel-card" role="dialog" aria-modal="false" aria-label="Messages and toast history">
          <div class="messages-dropdown-header">
            <h3>Inbox</h3>
            <div class="messages-header-actions">
              ${unreadCount > 0 ? `<span class="messages-badge">${unreadCount}</span>` : ''}
              <button type="button" class="messages-panel-close" aria-label="Close inbox panel">✕</button>
            </div>
          </div>
          <div class="messages-dropdown-content">
            <div class="messages-panel-section">
              <div class="messages-panel-section-title">Messages</div>
              <div class="messages-panel-list">
                ${allMessages.length === 0 ? '<div class="message-item message-empty">No messages yet</div>' : allMessages.map(m => {
                  const isRead = readIds.includes(m.id);
                  return `
                    <div class="message-item ${isRead ? 'read' : 'unread'}" data-id="${escapeHtml(m.id)}">
                      <span class="message-icon">${escapeHtml(m.icon || '•')}</span>
                      <div class="message-body">
                        <div class="message-title">${escapeHtml(m.title || 'Message')}</div>
                        <div class="message-text">${escapeHtml(m.text || '')}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="messages-panel-section">
              <div class="messages-panel-section-title">Toast History</div>
              <div class="messages-panel-list">
                ${toastHistoryRows.length === 0 ? '<div class="message-item message-empty">No toasts yet</div>' : toastHistoryRows.map(entry => `
                  <div class="toast-history-item">
                    <div class="toast-history-item-row">
                      <span class="toast-history-type">${escapeHtml((entry.type || 'info').toUpperCase())}</span>
                      <span class="toast-history-time">${escapeHtml(formatHistoryTime(entry.createdAt))}</span>
                    </div>
                    <div class="toast-history-message">${escapeHtml(entry.message || 'Notification')}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      const closeBtn = dropdown.querySelector('.messages-panel-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          dropdown.classList.remove('open');
        });
      }

      dropdown.querySelectorAll('.message-item[data-id]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = item.dataset.id;
          if (id) {
            getLocalReadSetForProfile(getCurrentProfileIdSafe()).add(id);
            markMessageRead(id);
            item.classList.remove('unread');
            item.classList.add('read');
            renderMessages();
          }
        });
      });
    }

    function canUploadCreation() {
      if (typeof ESHU_DB === 'undefined') return true;
      const activeProfileId = ESHU_DB.getValue ? ESHU_DB.getValue('currentProfileId') : null;
      const xp = getProfileXpSafe(activeProfileId);
      if (xp >= CREATION_UPLOAD_UNLOCK_XP) return true;
      const scopedUnlockKey = `creationUploadUnlocked_${activeProfileId || 'global'}`;
      return !!(ESHU_DB.getValue && ESHU_DB.getValue(scopedUnlockKey));
    }

    function canComment() {
      if (typeof ESHU_DB === 'undefined') return true;
      const activeProfileId = ESHU_DB.getValue ? ESHU_DB.getValue('currentProfileId') : null;
      return getProfileXpSafe(activeProfileId) >= COMMENTS_UNLOCK_XP;
    }

    // Expose globally so page scripts can check
    window.MESSAGES_GATE = {
      canComment: canComment,
      canUploadCreation: canUploadCreation,
      COMMENTS_UNLOCK_XP: COMMENTS_UNLOCK_XP,
      CREATION_UPLOAD_UNLOCK_XP: CREATION_UPLOAD_UNLOCK_XP
    };

    function showGateToast(message) {
      if (typeof TOAST !== 'undefined' && TOAST.error) {
        TOAST.error(message);
      }
    }

    document.addEventListener('click', (e) => {
      const createTrigger = e.target && e.target.closest ? e.target.closest('.create-game-btn') : null;
      if (createTrigger) {
        // If remote mode is enabled but the driver hasn't yet pulled /api/sync,
        // ESHU_DB is still empty/stale and would produce a false negative for a
        // user who just joined a group. Let the navigation through; the
        // destination page re-checks after activation.
        const remoteEnabled = !!(window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());
        const remoteReady = !remoteEnabled || !!window.ESHU_AUTH;
        const activeProfileId = ESHU_DB.getActiveProfileId
          ? ESHU_DB.getActiveProfileId()
          : (ESHU_DB.getValue ? ESHU_DB.getValue('currentProfileId') : null);
        if (remoteReady && !hasJoinedAnyGroup(activeProfileId)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          showGateToast('You need to join a Group to Create a Game');
          return;
        }
      }

      const uploadTrigger = e.target && e.target.closest ? e.target.closest('.upload-btn') : null;
      if (uploadTrigger) {
        if (!canUploadCreation()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          showGateToast('You need at least ' + CREATION_UPLOAD_UNLOCK_XP + ' XP to Upload a Creation.');
        }
      }
    }, true);

    document.addEventListener('click', (e) => {
      const trigger = e.target && e.target.closest ? e.target.closest('#messagesBtn') : null;
      if (!trigger || trigger !== messagesBtn) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();

      renderMessages();
      dropdown.classList.toggle('open');

      const settingsDropdown = document.getElementById('settingsDropdown');
      if (settingsDropdown) settingsDropdown.classList.remove('open');
    }, true);

    messagesBtn.dataset.messagesDropdownBound = 'true';

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    // --- Live XP counter + message badge refresh ---
    function refreshXpCounterLive() {
      var xpEl = document.getElementById('xpCounter');
      if (!xpEl) return;
      var pid = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue) ? ESHU_DB.getValue('currentProfileId') : null;
      var xp = getProfileXpSafe(pid);
      xpEl.textContent = xp + ' XP';
    }

    function refreshBadgeLive() {
      var unlocks = getUnlockMessages();
      var readIds = getEffectiveReadMessageIds();
      var allMessages = ADMIN_ANNOUNCEMENTS.map(function (a) {
        return { id: a.id, type: 'announcement', icon: '📢', title: a.title, text: a.text };
      }).concat(unlocks);
      var unreadCount = allMessages.filter(function (m) { return !readIds.includes(m.id); }).length;
      applyUnreadState(unreadCount);

      // If dropdown is open, re-render its contents too
      if (dropdown.classList.contains('open')) {
        renderMessages();
      }
    }

    document.addEventListener('eshu:toast-history-updated', function () {
      if (dropdown.classList.contains('open')) {
        renderMessages();
      }
    });

    // Subscribe to every DB change so XP + badge update instantly
    if (typeof ESHU_DB !== 'undefined' && ESHU_DB.subscribe) {
      ESHU_DB.subscribe(function () {
        refreshXpCounterLive();
        refreshBadgeLive();
      }, { immediate: false });
    }

    renderMessages();
    refreshXpCounterLive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessagesDropdown);
  } else {
    initMessagesDropdown();
  }
})();
