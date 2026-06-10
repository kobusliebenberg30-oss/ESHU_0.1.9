(function () {
  'use strict';

  // ===== GROUPS PAGE - SPLIT VIEW LAYOUT =====
  const FOLLOW_ARROW_SVG = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const CHECKMARK_SVG = '<svg viewBox="0 0 24 24"><path d="M9 16.17l-3.88-3.88L3.7 13.7 9 19l12-12-1.41-1.41z"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z"/></svg>';
  const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
  const PERSON_ADD_SVG = '<svg viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-8 0v-2H5V8H3v2H1v2h2v2h2v-2h2zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  const DOOR_SVG = '<svg viewBox="0 0 24 24"><path d="M19 19V5a2 2 0 00-2-2H7v2h10v14H7v2h10a2 2 0 002-2zM11 16l1.41-1.41L9.83 12H20v-2H9.83l2.58-2.59L11 6l-5 6 5 6z"/></svg>';
  const RESTORE_SVG = '<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l4 4 4-4H6a7 7 0 117 7 7.07 7.07 0 01-4.95-2.05l-1.42 1.42A9 9 0 1013 3zm-1 5v5l4.25 2.52.75-1.23-3.5-2.08V8z"/></svg>';
  const FIRE_SVG = '<svg viewBox="0 0 24 24"><path d="M13.5 2s.5 2-1.5 4-1 4 1 5c0 0-1-3 2-5 0 0 2 2 2 5 0 1.73-1.27 3-3 3s-3-1.27-3-3c0-1 .36-1.94 1-2.72C7.58 10.09 6 13 6 16a6 6 0 0012 0c0-4-2.5-7-4.5-9.5z"/></svg>';
  const CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
  const PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  const DEFAULT_GROUP_ID = 'group_default';
  const DEFAULT_GAME_ID = 'game_default';

  // Initialize XP Counter
  const xpCounter = document.getElementById('xpCounter');
  if (xpCounter) {
    const xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
    xpCounter.textContent = xpPoints + ' XP';
  }

  // DOM Elements
  const pageContainer = document.querySelector('.page-container');
  const leftPanel = document.getElementById('leftPanel');
  const groupsListWrapper = document.getElementById('groupsListWrapper');
  const editPanel = document.getElementById('editPanel');
  const groupsList = document.getElementById('groupsList');
  const searchBox = document.getElementById('searchBox');
  const typeFilter = document.getElementById('typeFilter');
  const scopeFilter = document.getElementById('scopeFilter');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const groupsCountLabel = document.getElementById('groupsCountLabel');
  const imagePanelTitle = document.getElementById('imagePanelTitle');
  const backBtn = document.getElementById('backBtn');

  // Edit Panel Elements
  const editPanelTitle = document.getElementById('editPanelTitle');
  const groupName = document.getElementById('groupName');
  const groupDescription = document.getElementById('groupDescription');
  const typeOptions = document.getElementById('typeOptions');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const saveGroupBtn = document.getElementById('saveGroupBtn');
  const createGroupBtn = document.getElementById('createGroupBtn');

  // Image Upload Elements
  const imageUploadArea = document.getElementById('imageUploadArea');
  const imagePreview = document.getElementById('imagePreview');
  const groupImageInput = document.getElementById('groupImageInput');

  // Preview Elements
  const previewImage = document.getElementById('previewImage');
  const previewName = document.getElementById('previewName');
  const previewType = document.getElementById('previewType');
  const previewMembers = document.getElementById('previewMembers');
  const previewGames = document.getElementById('previewGames');
  const emptyState = document.getElementById('emptyState');
  const groupPreviewPanel = document.getElementById('groupPreviewPanel');
  const previewLikeBtn = document.getElementById('previewLikeBtn');
  const previewFollowBtn = document.getElementById('previewFollowBtn');
  const previewSettingsBtn = document.getElementById('previewSettingsBtn');
  const groupPreviewCtaRow = document.getElementById('groupPreviewCtaRow');
  const previewPrimaryBadge = document.getElementById('previewPrimaryBadge');
  const previewPrivacyBadge = document.getElementById('previewPrivacyBadge');
  const previewInviteBtn = document.getElementById('previewInviteBtn');
  const previewJoinBtn = document.getElementById('previewJoinBtn');
  const previewLeaveBtn = document.getElementById('previewLeaveBtn');
  const previewSetPrimaryBtn = document.getElementById('previewSetPrimaryBtn');

  // Privacy Elements
  const privacyInfo = document.getElementById('privacyInfo');
  const runtime = window.ESHU_RUNTIME;

  // State
  let currentMode = 'list'; // 'list', 'create', 'edit'
  let editingGroupId = null;
  let selectedGroupId = null;
  let selectedType = null;
  let groupImageData = null;
  let hasShownQuotaError = false;
  let lastClickedGroupId = null;
  let lastGroupClickTime = 0;
  const privacyCheckedSelector = 'input[name="privacy"]:checked';

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function getActiveProfileId() {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.getActiveProfileId === 'function') {
      return window.ESHU_FLOW.getActiveProfileId();
    }
    return getActiveProfile()?.id || ESHU_DB.getValue('currentProfileId') || null;
  }

  function getGroupMembers(group) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.getMembers === 'function') {
      return window.ESHU_FLOW.getMembers(group);
    }
    const members = Array.isArray(group?.memberProfileIds) ? group.memberProfileIds.filter(Boolean) : [];
    const ownerId = getGroupOwnerProfileId(group);
    if (ownerId && !group?.ownerHasLeft && !members.includes(ownerId)) {
      members.push(ownerId);
    }
    return members;
  }

  function getActiveMembershipGroupIds(profileId, groups) {
    if (!profileId) return [];
    return (groups || [])
      .filter(group => group && group.status !== 'deleted' && group.status !== 'burned')
      .filter(group => isGroupMember(group, profileId))
      .map(group => group.id);
  }

  function isGroupMember(group, profileId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.isMember === 'function') {
      return window.ESHU_FLOW.isMember(group, profileId);
    }
    if (!group || !profileId) return false;
    return getGroupMembers(group).includes(profileId);
  }

  function canViewGroup(group, profileId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.canViewGroup === 'function') {
      return window.ESHU_FLOW.canViewGroup(group, profileId);
    }
    if (!group) return false;
    if (group.privacy !== 'private') return true;
    return isGroupMember(group, profileId);
  }

  function getGroupOwnerProfileId(group) {
    return group?.ownerProfileId || group?.createdByProfileId || group?.authorProfileId || group?.authorId || null;
  }

  function createDefaultGroup() {
    const now = Date.now();
    return {
      id: DEFAULT_GROUP_ID,
      name: 'GROUP',
      description: 'Default Group',
      type: 'social',
      privacy: 'public',
      image: null,
      members: 0,
      memberProfileIds: [],
      createdAt: now,
      updatedAt: now,
      ownerProfileId: null,
      createdByProfileId: null,
      isSystemDefault: true,
      status: 'active'
    };
  }

  function upsertDefaultGroup(groupsInput) {
    const groups = Array.isArray(groupsInput) ? groupsInput : [];
    const defaultIndex = groups.findIndex(group => group && group.id === DEFAULT_GROUP_ID);

    if (defaultIndex === -1) {
      return {
        groups: [createDefaultGroup(), ...groups],
        changed: true
      };
    }

    const existing = groups[defaultIndex] || {};
    const normalizedMemberProfileIds = Array.isArray(existing.memberProfileIds) ? existing.memberProfileIds.filter(Boolean) : [];
    const healed = {
      ...existing,
      id: DEFAULT_GROUP_ID,
      name: 'GROUP',
      description: 'Default Group',
      type: existing.type || 'social',
      privacy: existing.privacy || 'public',
      image: existing.image || null,
      members: normalizedMemberProfileIds.length,
      memberProfileIds: normalizedMemberProfileIds,
      ownerProfileId: null,
      createdByProfileId: null,
      isSystemDefault: true,
      status: 'active'
    };

    const changed =
      existing.name !== healed.name ||
      existing.description !== healed.description ||
      existing.type !== healed.type ||
      existing.privacy !== healed.privacy ||
      existing.image !== healed.image ||
      existing.members !== healed.members ||
      existing.ownerProfileId !== healed.ownerProfileId ||
      existing.createdByProfileId !== healed.createdByProfileId ||
      existing.isSystemDefault !== healed.isSystemDefault ||
      existing.status !== healed.status ||
      !Array.isArray(existing.memberProfileIds) ||
      existing.memberProfileIds.length !== normalizedMemberProfileIds.length ||
      existing.memberProfileIds.some((id, index) => id !== normalizedMemberProfileIds[index]);

    if (!changed) {
      return { groups, changed: false };
    }

    const next = [...groups];
    next[defaultIndex] = {
      ...healed,
      updatedAt: Date.now()
    };
    return { groups: next, changed: true };
  }

  function ensureDefaultGroupExists() {
    const groups = ESHU_DB.getTable('groups') || [];
    const result = upsertDefaultGroup(groups);
    if (result.changed) {
      ESHU_DB.setTable('groups', result.groups);
    }
    return result.groups;
  }

  function groupBelongsToProfile(group, profileId) {
    if (!group || !profileId) return false;
    return isGroupMember(group, profileId);
  }

  function shouldShowOnboardingJoinGroup(group, profileId) {
    return !!group &&
      group.id === DEFAULT_GROUP_ID &&
      group.status !== 'deleted' &&
      group.status !== 'burned' &&
      !isGroupMember(group, profileId);
  }

  function ensureDefaultOnboardingGame(profileId) {
    if (!profileId) return;
    const games = ESHU_DB.getTable('games') || [];
    const now = Date.now();
    const existingIndex = games.findIndex(game => game && game.id === DEFAULT_GAME_ID);
    const existing = existingIndex >= 0 ? games[existingIndex] : {};
    const memberProfileIds = Array.isArray(existing.memberProfileIds) ? existing.memberProfileIds.filter(Boolean) : [];
    if (!memberProfileIds.includes(profileId)) memberProfileIds.push(profileId);
    const nextGame = {
      ...existing,
      id: DEFAULT_GAME_ID,
      name: 'Default Game',
      description: 'Upload your first onboarding creations here.',
      rules: 'Upload image assets. Each upload awards XP toward the next unlock.',
      hostGroupId: DEFAULT_GROUP_ID,
      hostGroupName: 'GROUP',
      privacy: 'public',
      gameType: 'arena',
      timingMode: 'infinite',
      ownerProfileId: null,
      createdByProfileId: null,
      memberProfileIds,
      startTime: null,
      submissionCloseTime: null,
      endTime: null,
      timingOffsets: existing.timingOffsets || {
        start: { weeks: 0, days: 0, hours: 0, mins: 0 },
        submission: { weeks: 0, days: 0, hours: 0, mins: 0 },
        end: { weeks: 0, days: 0, hours: 0, mins: 0 }
      },
      timingExtensions: [],
      isSystemDefault: true,
      isOnboardingDefault: true,
      fixedSettings: true,
      awardsXp: true,
      status: 'active',
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    const nextGames = existingIndex >= 0 ? [...games] : [nextGame, ...games];
    if (existingIndex >= 0) nextGames[existingIndex] = nextGame;
    ESHU_DB.setTable('games', nextGames);
    STATE.set('games', nextGames);
  }

  function getPrimaryGroupIdForProfile(profileId) {
    const scoped = ESHU_DB.getValue('primaryGroupByProfileId');
    if (profileId && scoped && typeof scoped === 'object' && scoped[profileId]) {
      return scoped[profileId];
    }
    return ESHU_DB.getValue('primaryGroupId') || null;
  }

  function setPrimaryGroup(groupId) {
    const activeProfileId = getActiveProfileId();
    const scoped = ESHU_DB.getValue('primaryGroupByProfileId');
    const nextScoped = scoped && typeof scoped === 'object' ? { ...scoped } : {};

    if (activeProfileId) {
      if (groupId) nextScoped[activeProfileId] = groupId;
      else delete nextScoped[activeProfileId];
      ESHU_DB.setValue('primaryGroupByProfileId', nextScoped);
    }

    ESHU_DB.setValue('primaryGroupId', groupId || null);
  }

  function syncLegacyProfileValues(profile) {
    const effective = profile || { name: 'Player', description: '', image: null };
    ESHU_DB.setValue('profileName', effective.name || 'Player');
    ESHU_DB.setValue('profileDesc', effective.description || '');
    ESHU_DB.setValue('userProfile', {
      name: effective.name || 'Player',
      image: effective.image || null
    });
  }

  function initNavProfile() {
    const profile = getActiveProfile();
    if (profile) syncLegacyProfileValues(profile);

    const profileNameNav = document.getElementById('profileNameNav');
    const profileBtn = document.getElementById('profileBtn');
    const name = runtime?.getEffectiveProfileName?.(profile) || 'Player';
    if (profileNameNav) {
      profileNameNav.textContent = name;
    }
    if (profileBtn) {
      if (profile?.image) {
        profileBtn.innerHTML = `<img src="${profile.image}" alt="${name}">`;
      } else {
        profileBtn.innerHTML = '';
      }
      profileBtn.addEventListener('click', () => {
        window.location.href = 'profile.html';
      });
    }

    const messagesBtn = document.getElementById('messagesBtn');
    const messagesDropdown = document.getElementById('messagesDropdown');
    if (messagesBtn && messagesDropdown) {
      messagesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        messagesDropdown.classList.toggle('open');
      });
      document.addEventListener('click', () => {
        messagesDropdown.classList.remove('open');
      });
    }

  }

  // Type icons
  const typeIcons = {
    creative: '<svg viewBox="0 0 24 24"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c.55 0 1-.45 1-1 0-.28-.11-.53-.29-.71a.986.986 0 01-.29-.71c0-.55.45-1 1-1h1.17C17.73 18.58 20 16.31 20 13.5 20 7.36 16.42 2 12 2zM6.5 12c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5S18.33 12 17.5 12z"/></svg>',
    gaming: '<svg viewBox="0 0 24 24"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>',
    social: CHAT_SVG,
    educational: '<svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>'
  };

  // Builds a hex-framed image: an <img> clipped to a flat-top hex via CSS clip-path,
  // positioned to match the hex area inside hex-logo-v2.svg (1024x1024 viewBox),
  // with the hex outline + cap overlaid on top via an SVG. Uses native browser
  // image scaling for crisper rendering than SVG <image>.
  function buildHexImageSvg(imageUrl) {
    if (window.ESHU_UI_MARKUP && typeof window.ESHU_UI_MARKUP.hexImage === 'function') {
      return window.ESHU_UI_MARKUP.hexImage(imageUrl);
    }
    const safeUrl = String(imageUrl || '').replace(/"/g, '&quot;');
    return `
      <div class="hex-image-svg hex-image-frame">
        <img class="hex-image-inner" src="${safeUrl}" alt="" />
        <svg class="hex-image-overlay" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="#000" stroke-linejoin="miter" stroke-linecap="butt">
            <polyline points="184,450 316,220 708,220 840,450" stroke-width="78" />
            <polygon points="792,560 652,318 372,318 232,560 372,802 652,802" stroke-width="44" />
          </g>
        </svg>
      </div>
    `;
  }

  function renderImageUploadArea(imageData) {
    if (!imageUploadArea) return;
    if (imageData) {
      imageUploadArea.innerHTML = buildHexImageSvg(imageData);
    } else {
      imageUploadArea.innerHTML = `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo" id="imagePreview">`;
    }
  }

  function buildGroupFallbackMarkup(group, mode = 'compact') {
    const name = group?.name || 'Untitled Group';
    const type = group?.type || 'General';
    const desc = group?.description || 'No description';

    if (mode === 'preview') {
      return `
        <div class="group-fallback group-fallback-preview">
          <div class="group-fallback-title">${name}</div>
          <div class="group-fallback-meta">${type}</div>
          <div class="group-fallback-desc">${desc}</div>
        </div>
      `;
    }

    return `
      <div class="group-fallback group-fallback-compact">
        <div class="group-fallback-title">${name}</div>
      </div>
    `;
  }

  function getSelectedPrivacy() {
    return document.querySelector(privacyCheckedSelector)?.value || 'public';
  }

  function createGroupId() {
    return `group_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  function buildGameCountByGroupId(games) {
    return (games || []).reduce((acc, game) => {
      const groupId = game?.hostGroupId;
      if (!groupId) return acc;
      acc[groupId] = (acc[groupId] || 0) + 1;
      return acc;
    }, {});
  }

  window.toggleGroupLike = function(groupId, btnEl) {
    const groups = STATE.get('groups') || [];
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const activeProfileId = getActiveProfileId();
    group.likedBy = Array.isArray(group.likedBy) ? group.likedBy : [];
    const idx = group.likedBy.indexOf(activeProfileId);
    if (idx >= 0) { group.likedBy.splice(idx, 1); } else { group.likedBy.push(activeProfileId); }
    STATE.set('groups', groups);
    if (btnEl) {
      btnEl.classList.toggle('active', group.likedBy.includes(activeProfileId));
      const card = btnEl.closest('.u-card');
      if (card) { const ind = card.querySelector('.u-card-ind.liked'); if (ind) ind.classList.toggle('active', group.likedBy.includes(activeProfileId)); }
    }
  };

  window.toggleGroupFollow = function(groupId, btnEl) {
    const groups = STATE.get('groups') || [];
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const activeProfileId = getActiveProfileId();
    group.followedBy = Array.isArray(group.followedBy) ? group.followedBy : [];
    const idx = group.followedBy.indexOf(activeProfileId);
    if (idx >= 0) { group.followedBy.splice(idx, 1); } else { group.followedBy.push(activeProfileId); }
    STATE.set('groups', groups);
    if (btnEl) {
      btnEl.classList.toggle('active', group.followedBy.includes(activeProfileId));
      const card = btnEl.closest('.u-card');
      if (card) { const ind = card.querySelector('.u-card-ind.followed'); if (ind) ind.classList.toggle('active', group.followedBy.includes(activeProfileId)); }
    }
  };

  window.openGroupCardOptions = function(groupId) {
    const groups = STATE.get('groups') || [];
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    CARD_OPTIONS.open(group, 'group', getActiveProfileId(), () => {
      STATE.set('groups', groups);
    }, renderGroupsList);
  };

  window.joinGroup = async function(groupId, btnEl) {
    const activeProfileId = getActiveProfileId();
    if (!activeProfileId) {
      TOAST.error('Select a player profile first');
      return;
    }

    const groups = STATE.get('groups') || [];
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx === -1) {
      TOAST.error('Group not found');
      return;
    }

    const group = groups[idx];
    const wasMember = isGroupMember(group, activeProfileId);
    const ownerId = getGroupOwnerProfileId(group);
    const isOwner = !!ownerId && ownerId === activeProfileId;
    if (group.privacy === 'private' && !isOwner) {
      TOAST.error('This is a private group. You need an invite.');
      return;
    }

    const loadingKey = `join-group:${groupId}`;
    const loadingTarget = btnEl || (document.activeElement && document.activeElement.closest ? document.activeElement.closest('button') : null);
    if (window.ESHU_LOADING) {
      ESHU_LOADING.show({ key: loadingKey, maxMs: 12000 });
      ESHU_LOADING.showButton(loadingTarget);
    }

    try {
    // Authoritative server-side join when remote mode is active. The server
    // is the source of truth; ESHU_SYNC.mutate replaces the local row by id
    // and (with refresh: true) pulls a fresh /api/sync snapshot so server
    // side-effects (e.g. default game materialization) flow back into the
    // local mirror. Falls back to local mutation on any failure.
    let updatedGroup = null;
    const performServerJoin = () => ESHU_SYNC.mutate({
      entity: 'groups',
      call: () => ESHU_API.groups.join(groupId),
      pick: (resp) => {
        const serverGroup = resp && resp.group ? resp.group : resp;
        return {
          ...group,
          ...serverGroup,
          // Preserve client-only fields the server doesn't track.
          ownerHasLeft: isOwner ? false : !!group.ownerHasLeft,
        };
      },
      refresh: true,
    });

    if (ESHU_SYNC.isRemote()) {
      try {
        updatedGroup = await performServerJoin();
      } catch (err) {
        // First-time default-group case: the row may not yet exist server-side.
        // Force a bulk sync push so the new server-side system-default logic can
        // create it, then retry the authoritative join exactly once.
        const status = err && (err.status || err.statusCode);
        const isMissing = status === 404 || /not\s*found/i.test(String(err && err.message || ''));
        if (isMissing && window.ESHU_API && window.ESHU_API.sync && typeof window.ESHU_API.sync.push === 'function') {
          try {
            const snapshot = (window.ESHU_DB && typeof window.ESHU_DB.exportSnapshot === 'function')
              ? window.ESHU_DB.exportSnapshot()
              : null;
            if (snapshot) {
              await window.ESHU_API.sync.push(snapshot);
              updatedGroup = await performServerJoin();
            }
          } catch (retryErr) {
            console.warn('[joinGroup] server retry after sync push failed, falling back to local:', retryErr);
          }
        }
        if (!updatedGroup) {
          console.warn('[joinGroup] server unavailable, falling back to local:', err);
        }
      }
    }

    if (!updatedGroup) {
      // Local fallback: identical row shape; apply through the same helper so
      // STATE and ESHU_DB stay in sync without duplicated bookkeeping.
      const memberProfileIds = getGroupMembers(group);
      if (!memberProfileIds.includes(activeProfileId)) {
        memberProfileIds.push(activeProfileId);
      }
      updatedGroup = {
        ...group,
        memberProfileIds,
        ownerHasLeft: isOwner ? false : !!group.ownerHasLeft,
        members: memberProfileIds.length,
        updatedByProfileId: activeProfileId
      };
      ESHU_SYNC.applyEntityResponse('groups', updatedGroup);
    }

    selectedGroupId = groupId;
    // Only auto-assign as primary if the user has none yet.
    const refreshedGroups = STATE.get('groups') || [];
    const currentPrimaryId = getPrimaryGroupIdForProfile(activeProfileId);
    const currentPrimary = currentPrimaryId
      ? refreshedGroups.find(g => g && g.id === currentPrimaryId && g.status !== 'burned' && g.status !== 'deleted' && isGroupMember(g, activeProfileId))
      : null;
    if (!currentPrimary) setPrimaryGroup(groupId);
    if (groupId === DEFAULT_GROUP_ID && isGroupMember(updatedGroup, activeProfileId)) {
      ensureDefaultOnboardingGame(activeProfileId);
      // Onboarding XP: award 2 XP (game_created) for joining the default
      // group. In remote mode the server already handled this via the /join
      // endpoint response; this covers local-only and server-unreachable
      // fallback. Profile-scoped flag ensures local idempotency.
      const xpFlagKey = `defaultGroupJoinXpAwarded_${activeProfileId}`;
      const alreadyAwarded = !!(ESHU_DB.getValue && ESHU_DB.getValue(xpFlagKey));
      if (!alreadyAwarded) {
        let awardResult = null;
        if (typeof ESHU_API !== 'undefined' && ESHU_API.xp && ESHU_API.xp.awardSafe) {
          try {
            awardResult = await ESHU_API.xp.awardSafe('game_created', DEFAULT_GAME_ID);
          } catch (err) {
            console.warn('[joinGroup] onboarding XP helper failed, falling back to local:', err);
          }
        }
        if (!awardResult && typeof ESHU_DB !== 'undefined' && ESHU_DB.addProfileXp) {
          const xpPoints = ESHU_DB.addProfileXp(2, activeProfileId, 'Joined default group');
          awardResult = { xpPoints, delta: 2, source: 'local' };
        }
        if (awardResult && awardResult.delta > 0 && window.XP_ANIM) {
          XP_ANIM.show(awardResult.delta);
        }
        if (awardResult && typeof awardResult.xpPoints === 'number' && xpCounter) {
          xpCounter.textContent = awardResult.xpPoints + ' XP';
        } else if (xpCounter && typeof ESHU_DB !== 'undefined' && ESHU_DB.getProfileXp) {
          xpCounter.textContent = ESHU_DB.getProfileXp(activeProfileId) + ' XP';
        } else if (xpCounter) {
          xpCounter.textContent = parseInt(STATE.get('xpPoints') || 0, 10) + ' XP';
        }
        if (ESHU_DB.setValue) ESHU_DB.setValue(xpFlagKey, true);
      }
    }
    selectGroup(groupId);
    if (wasMember) {
      TOAST.info('Already a member of this group');
    } else {
      if (groupId === DEFAULT_GROUP_ID) {
        TOAST.success('Default Group joined. Default Game and Create Game are unlocked.');
        window.location.href = `games.html?view=front&gameId=${encodeURIComponent(DEFAULT_GAME_ID)}&sourceGroupId=${encodeURIComponent(DEFAULT_GROUP_ID)}&onboarding=joined`;
        return;
      }
      TOAST.success('Joined group. Game creation is now unlocked.');
    }
    } finally {
      if (window.ESHU_LOADING) {
        ESHU_LOADING.hide({ key: loadingKey, force: true });
        ESHU_LOADING.hideButton(loadingTarget, { force: true });
      }
    }
  };

  // ===== Set Primary Group (explicit user action) =====
  window.setAsPrimaryGroup = function(groupId) {
    const activeProfileId = getActiveProfileId();
    if (!activeProfileId) {
      TOAST.error('Select a player profile first');
      return;
    }
    const groups = STATE.get('groups') || [];
    const group = groups.find(g => g.id === groupId);
    if (!group) {
      TOAST.error('Group not found');
      return;
    }
    if (group.status === 'deleted' || group.status === 'burned') {
      TOAST.error('Cannot set a deleted group as primary');
      return;
    }
    if (!isGroupMember(group, activeProfileId)) {
      TOAST.error('Join this group before setting it as primary');
      return;
    }
    if (getPrimaryGroupIdForProfile(activeProfileId) === groupId) {
      TOAST.info('Already your primary group');
      return;
    }
    setPrimaryGroup(groupId);
    renderGroupsList();
    selectGroup(groupId);
    TOAST.success(`"${group.name || 'Group'}" is now your primary group`);
  };

  window.leaveGroup = async function(groupId) {
    const activeProfileId = getActiveProfileId();
    if (!activeProfileId) {
      TOAST.error('Select a player profile first');
      return;
    }

    const groups = STATE.get('groups') || [];
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx === -1) {
      TOAST.error('Group not found');
      return;
    }

    const group = groups[idx];
    const ownerId = getGroupOwnerProfileId(group);
    const isOwner = !!ownerId && ownerId === activeProfileId;

    // Owners cannot leave their own groups - they must delete them instead
    if (isOwner) {
      TOAST.error('You cannot leave a group you created. You must delete it instead.');
      return;
    }

    // Authoritative server leave for non-owners.
    let updatedGroup = null;
    if (ESHU_SYNC.isRemote()) {
      try {
        updatedGroup = await ESHU_SYNC.mutate({
          entity: 'groups',
          call: () => ESHU_API.groups.leave(groupId),
          pick: (resp) => {
            const serverGroup = resp && resp.group ? resp.group : resp;
            return { ...group, ...serverGroup, ownerHasLeft: !!group.ownerHasLeft };
          },
          refresh: true,
        });
      } catch (err) {
        console.warn('[leaveGroup] server unavailable, falling back to local:', err);
      }
    }

    if (!updatedGroup) {
      // Local fallback - remove self from memberProfileIds
      const memberProfileIds = (Array.isArray(group.memberProfileIds) ? group.memberProfileIds : [])
        .filter(id => id && id !== activeProfileId);
      updatedGroup = {
        ...group,
        memberProfileIds,
        ownerHasLeft: isOwner ? true : !!group.ownerHasLeft,
        members: isOwner ? memberProfileIds.length : getGroupMembers({ ...group, memberProfileIds }).length,
        updatedByProfileId: activeProfileId
      };
      ESHU_SYNC.applyEntityResponse('groups', updatedGroup);
    }

    const currentPrimary = getPrimaryGroupIdForProfile(activeProfileId);
    const remainingMembershipGroupIds = membershipGroupIds.filter(id => id !== groupId);
    if (currentPrimary === groupId) {
      setPrimaryGroup(remainingMembershipGroupIds[0] || null);
    }

    if (selectedGroupId === groupId) {
      if (remainingMembershipGroupIds.length > 0) {
        selectedGroupId = remainingMembershipGroupIds[0];
        selectGroup(selectedGroupId);
      } else {
        selectedGroupId = null;
        previewName.textContent = 'Group Name';
        previewType.textContent = 'General';
        previewMembers.textContent = '0';
        previewGames.textContent = '0';
        groupPreviewPanel.classList.remove('active');
        emptyState.style.display = '';
        previewImage.innerHTML = '<span style="font-size:64px;">👥</span>';
      }
    }

    TOAST.success('Left group');
  };

  // ===== Initialize =====
  function initializeApp() {
    try {
      ESHU_DB.ensure();
      const ensuredGroups = ensureDefaultGroupExists();
      initNavProfile();
      STATE.batch(() => {
        STATE.set('groups', ensuredGroups);
        STATE.set('games', ESHU_DB.getTable('games') || []);
        STATE.set('xpPoints', ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0);
      });
      // Self-heal: if the user is already a member of group_default but
      // never received the onboarding 2 XP (joined via a legacy path before
      // the fix), award it now. Idempotent via profile-scoped flag.
      healDefaultGroupXp();
      TOAST.success('Groups loaded!');
    } catch (err) {
      console.error('Init error:', err);
      STATE.set('groups', [createDefaultGroup()]);
      STATE.set('games', []);
    }
  }

  function healDefaultGroupXp() {
    try {
      const pid = ESHU_DB.getActiveProfileId();
      if (!pid) return;
      const xpFlagKey = `defaultGroupJoinXpAwarded_${pid}`;
      if (ESHU_DB.getValue && ESHU_DB.getValue(xpFlagKey)) return;
      const groups = ESHU_DB.getTable('groups') || [];
      const defaultGroup = groups.find(g => g && g.id === DEFAULT_GROUP_ID);
      if (!defaultGroup || !isGroupMember(defaultGroup, pid)) return;
      // User is a member but flag not set — award the onboarding XP.
      if (typeof ESHU_API !== 'undefined' && ESHU_API.xp && ESHU_API.xp.awardSafe) {
        ESHU_API.xp.awardSafe('game_created', DEFAULT_GAME_ID).then(function(res) {
          if (res && res.delta > 0) {
            STATE.set('xpPoints', res.xpPoints);
            if (window.XP_ANIM) XP_ANIM.show(res.delta);
          }
        }).catch(function() {});
      } else if (ESHU_DB.addProfileXp) {
        const newXp = ESHU_DB.addProfileXp(2, pid, 'Joined default group');
        STATE.set('xpPoints', newXp);
      }
      if (ESHU_DB.setValue) ESHU_DB.setValue(xpFlagKey, true);
    } catch (e) {
      console.warn('[healDefaultGroupXp]', e);
    }
  }

  function rehydrateFromStorage() {
    try {
      const ensuredGroups = ensureDefaultGroupExists();
      initNavProfile();
      STATE.batch(() => {
        STATE.set('groups', ensuredGroups);
        STATE.set('games', ESHU_DB.getTable('games') || []);
        STATE.set('xpPoints', ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0);
      });
      renderGroupsList();
      if (selectedGroupId) selectGroup(selectedGroupId);
      completeListLoadingWhenReady();
    } catch (err) {
      console.error('Rehydrate error:', err);
    }
  }

  function isRemoteHydrationPending() {
    return !!(
      window.ESHU_REMOTE &&
      window.ESHU_REMOTE.isEnabled &&
      window.ESHU_REMOTE.isEnabled() &&
      !window.ESHU_AUTH
    );
  }

  function completeListLoadingWhenReady() {
    if (isRemoteHydrationPending()) return;
    if (!window.ESHU_RUNTIME || typeof window.ESHU_RUNTIME.completeNavigationLoading !== 'function') return;
    requestAnimationFrame(() => {
      window.ESHU_RUNTIME.completeNavigationLoading();
    });
  }

  function checkUrlActions() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const onboarding = params.get('onboarding');

    if (onboarding === 'join-default') {
      selectGroup(DEFAULT_GROUP_ID);
      setTimeout(() => {
        const card = groupsList ? groupsList.querySelector(`.u-card[data-id="${DEFAULT_GROUP_ID}"]`) : null;
        if (card) card.classList.add('expanded');
      }, 0);
      if (typeof TOAST !== 'undefined') {
        TOAST.info('Start here: join the Default Group to unlock the Default Game and Create Game.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (action === 'create') {
      openCreateMode();
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (action === 'edit') {
      const targetGroupId = params.get('groupId');
      if (!targetGroupId) {
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      const groups = STATE.get('groups') || [];
      const targetGroup = groups.find(g => g.id === targetGroupId);
      if (!targetGroup) {
        TOAST.error('Group not found');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      const ownerId = targetGroup.ownerProfileId || targetGroup.createdByProfileId || targetGroup.authorProfileId || targetGroup.authorId || null;
      const activeProfileId = getActiveProfileId();
      if (ownerId && ownerId !== activeProfileId) {
        TOAST.error('Only the group owner can edit this group');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      selectGroup(targetGroupId);
      window.editGroup(targetGroupId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // ===== State Subscriptions =====
  STATE.subscribe('groups', () => {
    const expandedCard = groupsList ? groupsList.querySelector('.u-card.expanded') : null;
    const expandedId = expandedCard ? expandedCard.dataset.id : null;
    renderGroupsList();
    if (expandedId && groupsList) {
      var el = groupsList.querySelector('.u-card[data-id="' + expandedId + '"]');
      if (el) el.classList.add('expanded');
    }
    saveToStorage();
    updateStatusBar();
  });

  // ===== Storage =====
  function saveToStorage() {
    try {
      ESHU_DB.setTable('groups', STATE.get('groups'));
      ESHU_DB.setTable('games', STATE.get('games'));
      ESHU_DB.setProfileXp(ESHU_DB.getActiveProfileId(), STATE.get('xpPoints'));
      hasShownQuotaError = false;
    } catch (err) {
      console.error('Save error:', err);
      if (err && err.name === 'QuotaExceededError' && !hasShownQuotaError) {
        TOAST.error('Storage is full. Try smaller images or remove old creations.');
        hasShownQuotaError = true;
      }
    }
  }

  // ===== Loading =====
  function showLoading() { loadingOverlay.classList.add('active'); }
  function hideLoading() { loadingOverlay.classList.remove('active'); }

  // ===== Update Status Bar =====
  function updateStatusBar() {
    // Status bar removed - function kept for compatibility
  }

  // ===== Render Groups List =====
  function renderGroupsList() {
    const stateGroups = STATE.get('groups') || [];
    const upserted = upsertDefaultGroup(stateGroups);
    if (upserted.changed) {
      STATE.set('groups', upserted.groups);
      return;
    }
    const groups = upserted.groups;
    const games = STATE.get('games') || [];
    const gameCountByGroupId = buildGameCountByGroupId(games);
    const activeProfileId = getActiveProfileId();
    const searchQuery = searchBox.value.toLowerCase();
    const scope = scopeFilter ? scopeFilter.value : 'mine';

    let filtered;

    if (scope === 'all') {
      // All Groups: every group in the database (public, or private if member)
      filtered = groups.filter(group => {
        if (!group || group.status === 'deleted' || group.status === 'burned') return false;
        if (group.privacy === 'private' && !isGroupMember(group, activeProfileId)) return false;
        return true;
      });
    } else if (scope === 'public') {
      // Public Groups: only public groups
      filtered = groups.filter(group => {
        if (!group || group.status === 'deleted' || group.status === 'burned') return false;
        return group.privacy !== 'private';
      });
    } else if (scope === 'private') {
      // Private Groups: private groups you are a member of
      filtered = groups.filter(group => {
        if (!group || group.status === 'deleted' || group.status === 'burned') return false;
        return group.privacy === 'private' && isGroupMember(group, activeProfileId);
      });
    } else if (scope === 'byGame') {
      // By Game: get all accessible groups
      filtered = groups.filter(group => {
        if (!group || group.status === 'deleted' || group.status === 'burned') return false;
        if (group.privacy === 'private' && !isGroupMember(group, activeProfileId)) return false;
        return true;
      });
      
      // If search query provided, filter by game name
      if (searchQuery) {
        const matchingGameIds = new Set();
        games.forEach(g => {
          if (g && g.name && g.name.toLowerCase().includes(searchQuery)) {
            matchingGameIds.add(g.id);
          }
        });
        filtered = filtered.filter(group => {
          // Match by group's name or if group has a game that matches
          const groupNameMatch = (group.name || '').toLowerCase().includes(searchQuery);
          const hasMatchingGame = games.some(g => g.hostGroupId === group.id && matchingGameIds.has(g.id));
          return groupNameMatch || hasMatchingGame;
        });
      }
    } else {
      // Your Groups: groups you created/joined + owner deleted/burned groups so restore/delete actions stay available
      filtered = groups.filter(group => {
        if (!group) return false;
        if (shouldShowOnboardingJoinGroup(group, activeProfileId)) return true;
        const ownerId = getGroupOwnerProfileId(group);
        if (ownerId && ownerId === activeProfileId) return true;
        if (group.status === 'deleted' || group.status === 'burned') return false;
        return groupBelongsToProfile(group, activeProfileId);
      });
    }

    if (scope !== 'byGame' && searchQuery) {
      filtered = filtered.filter(g =>
        g.name?.toLowerCase().includes(searchQuery) ||
        g.description?.toLowerCase().includes(searchQuery)
      );
    }

    if (scope !== 'all' && scope !== 'byGame') {
      const defaultGroupInState = groups.find(group => group && group.id === DEFAULT_GROUP_ID);
      if (!defaultGroupInState) {
        const nextGroups = [createDefaultGroup(), ...groups];
        STATE.set('groups', nextGroups);
        return;
      }
      if (
        shouldShowOnboardingJoinGroup(defaultGroupInState, activeProfileId) &&
        !filtered.some(group => group && group.id === DEFAULT_GROUP_ID)
      ) {
        filtered = [defaultGroupInState, ...filtered];
      }
    }

    filtered = filtered.filter(group => !!group && typeof group === 'object');

    if (filtered.length === 0) {
      if (groupsCountLabel) groupsCountLabel.textContent = '0 groups';
      if (scope === 'byGame' && !searchQuery) {
        groupsList.innerHTML = '<div class="u-card-empty">Type a game name to filter groups by game.</div>';
      } else if (searchQuery) {
        groupsList.innerHTML = '<div class="u-card-empty">No groups match your search.</div>';
      } else {
        groupsList.innerHTML = '<div class="u-card-empty">No groups yet. Create your first one!</div>';
      }
      completeListLoadingWhenReady();
      return;
    }

    if (groupsCountLabel) groupsCountLabel.textContent = `${filtered.length} group${filtered.length !== 1 ? 's' : ''}`;

    const primaryGroupId = getPrimaryGroupIdForProfile(activeProfileId);
    const profiles = getProfiles();

    groupsList.innerHTML = filtered.map(group => {
      const gameCount = gameCountByGroupId[group.id] || 0;
      const memberProfileIds = getGroupMembers(group);
      const memberCount = memberProfileIds.length || group.members || 0;
      const isSelected = group.id === selectedGroupId;
      const isDeleted = group.status === 'deleted' || group.status === 'booted';
      const isBurned = group.status === 'burned';
      const ownerId = group.ownerProfileId || group.createdByProfileId || group.authorProfileId || group.authorId || null;
      const isOwner = !!activeProfileId && ownerId === activeProfileId;
      const isMember = isGroupMember(group, activeProfileId);
      const isOnboardingJoin = shouldShowOnboardingJoinGroup(group, activeProfileId);
      const isPrimary = group.id === primaryGroupId;
      const privacyLabel = group.privacy === 'private' ? 'Private' : 'Public';
      const privacyClass = group.privacy === 'private' ? 'private' : 'public';
      const canJoin = !isMember && (group.privacy !== 'private' || isOwner) && !isDeleted && !isBurned;
      const canSetPrimary = isMember && !isPrimary && !isDeleted && !isBurned;
      const showJoin = canJoin;
      const showInvite = isOwner && !isDeleted && !isBurned;
      const showEditClear = isOwner && !isDeleted && !isBurned && group.id !== DEFAULT_GROUP_ID;
      const showBootBurn = isOwner && isDeleted && !isBurned;

      // Resolve creator name
      const ownerProfile = ownerId ? profiles.find(p => p.id === ownerId) : null;
      const creatorName = ownerProfile?.name || group.creatorName || 'Unknown';
      const cardSubtitle = isOnboardingJoin
        ? 'Step 1: join to unlock the Default Game and Create Game'
        : `Group · by ${creatorName}`;
      const grpLiked = (group.likedBy || []).includes(activeProfileId);
      const grpFollowed = (group.followedBy || []).includes(activeProfileId);

      const iconContent = isBurned
        ? CLOSE_SVG
        : (group.image
            ? buildHexImageSvg(group.image)
            : `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo">`);
      const cogAction = `event.stopPropagation(); this.closest('.u-card').classList.toggle('expanded')`;

      const showBoot = isOwner && !isDeleted && !isBurned && !isPrimary && !group.isSystemDefault;
      const canLeaveCard = isMember && !isPrimary && !isDeleted && !isBurned && !isOwner;
      const canSetPrimaryCard = isMember && !isPrimary && !isDeleted && !isBurned;

      let expandBtns = '';
      if (showEditClear) expandBtns += `<button class="u-card-btn" onclick="event.stopPropagation(); editGroup('${group.id}')">Edit</button>`;
      if (showBoot) expandBtns += `<button class="u-card-btn dark" onclick="event.stopPropagation(); clearGroup('${group.id}')">Boot</button>`;
      if (canSetPrimaryCard) expandBtns += `<button class="u-card-btn" onclick="event.stopPropagation(); setAsPrimaryGroup('${group.id}')">Set Primary</button>`;
      if (showInvite) expandBtns += `<button class="u-card-btn accent" onclick="event.stopPropagation(); inviteToGroup('${group.id}')">Invite</button>`;
      if (canLeaveCard) expandBtns += `<button class="u-card-btn" onclick="event.stopPropagation(); leaveGroup('${group.id}')">Leave</button>`;
      if (showBootBurn) expandBtns += `<button class="u-card-btn" onclick="event.stopPropagation(); bootGroup('${group.id}')">Restore</button><button class="u-card-btn danger" onclick="event.stopPropagation(); burnGroup('${group.id}')">Delete</button>`;
      if (showJoin) expandBtns += `<button class="u-card-btn accent" onclick="event.stopPropagation(); joinGroup('${group.id}', this)">${isOnboardingJoin ? 'Join Default Group' : 'Join'}</button>`;

      return `
        <div class="u-card ${isSelected ? 'selected' : ''} ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}" data-id="${group.id}">
          <div class="u-card-body">
            <div class="u-card-top-right">
              ${isPrimary ? '<span class="u-card-primary-badge">Primary Group</span>' : ''}
              <span class="u-card-privacy-badge ${privacyClass}">${privacyLabel}</span>
              <span class="u-card-ind followed${grpFollowed ? ' active' : ''}" title="Followed">${FOLLOW_ARROW_SVG}</span>
              <span class="u-card-ind liked${grpLiked ? ' active' : ''}" title="Liked">${HEART_SVG}</span>
            </div>
            <div class="u-card-thumb">${iconContent}</div>
            <div class="u-card-content">
              <div class="u-card-title">${isBurned ? 'BURNED' : (group.name || 'Untitled')}</div>
              <div class="u-card-subtitle">${cardSubtitle}</div>
              ${group.description ? '<div class="u-card-desc">' + group.description + '</div>' : ''}
            </div>
            <button class="u-card-options-btn" title="Options" onclick="${cogAction}">${COG_SVG}</button>
          </div>
          <div class="u-card-expand">
            <div class="u-card-actions">
              <button type="button" class="u-card-like-btn${grpLiked ? ' active' : ''}" title="${grpLiked ? 'Unlike' : 'Like'}" onclick="event.stopPropagation(); window.toggleGroupLike('${group.id}', this)">${HEART_SVG}</button>
              <button type="button" class="u-card-follow-btn${grpFollowed ? ' active' : ''}" title="${grpFollowed ? 'Unfollow' : 'Follow'}" onclick="event.stopPropagation(); window.toggleGroupFollow('${group.id}', this)">${FOLLOW_ARROW_SVG}</button>
              ${expandBtns}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Burned card cog → open BURNED_MODAL
    groupsList.querySelectorAll('.u-card.burned .u-card-options-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const groupId = btn.closest('.u-card').dataset.id;
        const groups = STATE.get('groups') || [];
        const group = groups.find(g => g.id === groupId);
        if (group && typeof BURNED_MODAL !== 'undefined') BURNED_MODAL.open(group, 'groups');
      };
    });

    // Add click handlers for selection
    groupsList.querySelectorAll('.u-card').forEach(item => {
      item.addEventListener('click', () => {
        const groupId = item.dataset.id;
        if (!groupId) return;
        const groups = STATE.get('groups') || [];
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        if (group.status === 'burned') {
          if (typeof BURNED_MODAL !== 'undefined') {
            BURNED_MODAL.open(group, 'groups');
          }
          return;
        }
        if (group.status === 'deleted' || group.status === 'booted') {
          selectGroup(groupId);
          return;
        }
        const now = Date.now();
        const isDoubleClick = lastClickedGroupId === groupId && (now - lastGroupClickTime) < 300;
        if (isDoubleClick) {
          openGroupFrontPage(groupId);
          lastClickedGroupId = null;
          lastGroupClickTime = 0;
          return;
        }

        lastClickedGroupId = groupId;
        lastGroupClickTime = now;
        selectGroup(groupId);
      });
    });
    completeListLoadingWhenReady();
  }

  // ===== Select Group (Preview) =====
  function selectGroup(groupId) {
    selectedGroupId = groupId;
    const groups = STATE.get('groups') || [];
    const games = STATE.get('games') || [];
    const activeProfileId = getActiveProfileId();
    const scope = scopeFilter ? scopeFilter.value : 'mine';
    const visibleGroups = groups.filter(group => {
      if (!group) return false;
      if (shouldShowOnboardingJoinGroup(group, activeProfileId)) return true;
      const ownerId = getGroupOwnerProfileId(group);
      if (ownerId && ownerId === activeProfileId) return true;
      if (group.status === 'deleted' || group.status === 'burned') return false;
      if (scope === 'all') return canViewGroup(group, activeProfileId);
      return groupBelongsToProfile(group, activeProfileId);
    });
    const group = visibleGroups.find(g => g.id === groupId);

    // NOTE: primary group is only changed via an explicit user action
    // (Set Primary button, first join, or first create). Selecting a card
    // to preview must not mutate primary state.

    // Update selection UI
    groupsList.querySelectorAll('.u-card').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === groupId);
    });

    // Update preview
    if (group) {
      const gameCount = games.filter(g => g.hostGroupId === group.id).length;
      const memberCount = getGroupMembers(group).length || group.members || 0;
      const ownerId = getGroupOwnerProfileId(group);
      const isOwner = !!ownerId && ownerId === activeProfileId;
      const isMember = isGroupMember(group, activeProfileId);
      const isLiked = !!activeProfileId && (group.likedBy || []).includes(activeProfileId);
      const isFollowed = !!activeProfileId && (group.followedBy || []).includes(activeProfileId);
      const canJoin = !isMember && (group.privacy !== 'private' || isOwner);
      const membershipCount = getActiveMembershipGroupIds(activeProfileId, groups).length;
      const canLeave = isMember && membershipCount > 1 && !isOwner;
      const canInvite = isOwner;
      const primaryGroupId = getPrimaryGroupIdForProfile(activeProfileId);
      const isPrimary = group.id === primaryGroupId;
      const canSetPrimary = isMember && !isPrimary;

      // Show preview panel, hide empty state
      emptyState.style.display = 'none';
      groupPreviewPanel.classList.add('active');

      previewName.textContent = group.name || 'Untitled Group';
      previewType.textContent = group.type || 'General';
      previewMembers.textContent = `${memberCount}`;
      previewGames.textContent = `${gameCount}`;
      if (previewPrimaryBadge) {
        previewPrimaryBadge.style.display = isPrimary ? 'inline-flex' : 'none';
      }
      if (previewPrivacyBadge) {
        const privacyLabel = group.privacy === 'private' ? 'Private' : 'Public';
        previewPrivacyBadge.textContent = privacyLabel;
        previewPrivacyBadge.classList.toggle('private', group.privacy === 'private');
        previewPrivacyBadge.classList.toggle('public', group.privacy !== 'private');
      }

      if (group.image) {
        previewImage.innerHTML = buildHexImageSvg(group.image);
      } else {
        previewImage.innerHTML = `<div class="eshu-logo"></div>`;
      }

      // Image click → open group front page
      previewImage.onclick = () => {
        openGroupFrontPage(groupId);
      };

      if (previewLikeBtn) {
        previewLikeBtn.classList.toggle('active', isLiked);
        previewLikeBtn.title = isLiked ? 'Unlike' : 'Like';
      }
      if (previewFollowBtn) {
        previewFollowBtn.classList.toggle('active', isFollowed);
        previewFollowBtn.title = isFollowed ? 'Unfollow' : 'Follow';
      }
      if (previewSettingsBtn) {
        previewSettingsBtn.style.display = isOwner ? 'inline-flex' : 'none';
      }
      if (groupPreviewCtaRow) {
        groupPreviewCtaRow.style.display = (canJoin || canInvite || canLeave || canSetPrimary) ? 'flex' : 'none';
      }
      if (previewJoinBtn) {
        previewJoinBtn.style.display = canJoin ? 'inline-flex' : 'none';
        previewJoinBtn.textContent = shouldShowOnboardingJoinGroup(group, activeProfileId) ? 'Join Default Group' : 'Join';
      }
      if (previewInviteBtn) {
        previewInviteBtn.style.display = canInvite ? 'inline-flex' : 'none';
      }
      if (previewLeaveBtn) {
        previewLeaveBtn.style.display = canLeave ? 'inline-flex' : 'none';
      }
      if (previewSetPrimaryBtn) {
        previewSetPrimaryBtn.style.display = canSetPrimary ? 'inline-flex' : 'none';
      }
    }
  }

  function openGroupFrontPage(groupId) {
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    const visibleGroups = groups.filter(group => groupBelongsToProfile(group, activeProfileId));
    const group = visibleGroups.find(g => g.id === groupId);
    if (!group) {
      TOAST.error('Group not found or access denied');
      return;
    }
    window.location.href = `group-front.html?groupId=${encodeURIComponent(groupId)}`;
  }

  // ===== Edit Group =====
  window.editGroup = function(groupId) {
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const ownerId = getGroupOwnerProfileId(group);
    if (ownerId && ownerId !== activeProfileId) {
      TOAST.error('Only the group owner can edit this group');
      return;
    }

    currentMode = 'edit';
    editingGroupId = groupId;

    // Show edit mode
    pageContainer.classList.add('edit-mode');

    // Populate form
    editPanelTitle.textContent = 'Edit Group';
    if (imagePanelTitle) imagePanelTitle.textContent = group.name || 'Group Image';
    if (saveGroupBtn) saveGroupBtn.textContent = 'Save';

    groupName.value = group.name || '';
    groupDescription.value = group.description || '';

    // Set type
    selectedType = group.type || null;
    typeOptions.querySelectorAll('.type-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.type === selectedType);
    });

    // Set image
    groupImageData = group.image || null;
    renderImageUploadArea(groupImageData);

    // Set privacy
    const privacyRadio = document.querySelector(`input[name="privacy"][value="${group.privacy || 'public'}"]`);
    if (privacyRadio) privacyRadio.checked = true;
    updatePrivacyInfo();

    // Update preview
    previewName.textContent = group.name || 'Group Name';
    emptyState.style.display = 'none';
    groupPreviewPanel.classList.add('active');
  };

  // ===== Clear Group (set to deleted) =====
  window.clearGroup = function(groupId) {
    const activeProfileId = getActiveProfileId();
    const existing = (STATE.get('groups') || []).find(g => g.id === groupId);
    if (!existing) return;
    if (existing.isSystemDefault) {
      TOAST.error('Cannot boot the system default group');
      return;
    }
    if (existing.ownerProfileId && existing.ownerProfileId !== activeProfileId) {
      TOAST.error('Only the group owner can boot this group');
      return;
    }
    if (getPrimaryGroupIdForProfile(activeProfileId) === groupId) {
      TOAST.error('Set a different primary group before booting this one');
      return;
    }

    const groups = STATE.get('groups') || [];
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx === -1) return;
    const next = [...groups];
    next[idx] = { ...next[idx], status: 'deleted' };
    STATE.set('groups', next);
    TOAST.success('Group booted!');
  };

  // ===== Boot Group (restore from deleted) =====
  window.bootGroup = function(groupId) {
    const activeProfileId = getActiveProfileId();
    const groups = STATE.get('groups') || [];
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx === -1) return;
    const existing = groups[idx];
    if (existing?.ownerProfileId && existing.ownerProfileId !== activeProfileId) {
      TOAST.error('Only the group owner can restore this group');
      return;
    }
    const next = [...groups];
    next[idx] = { ...next[idx], status: 'active' };
    STATE.set('groups', next);
    TOAST.success('Group restored!');
  };

  // ===== Burn Group (permanent delete state) =====
  window.burnGroup = async function(groupId) {
    const activeProfileId = getActiveProfileId();
    const groups = STATE.get('groups') || [];
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx === -1) return;
    const existing = groups[idx];
    if (existing?.isSystemDefault) {
      TOAST.error('Cannot burn the system default group');
      return;
    }
    if (existing?.ownerProfileId && existing.ownerProfileId !== activeProfileId) {
      TOAST.error('Only the group owner can burn this group');
      return;
    }
    if (getPrimaryGroupIdForProfile(activeProfileId) === groupId) {
      TOAST.error('Set a different primary group before burning this one');
      return;
    }
    const yes = await MODAL.confirm({ title: 'Burn Group', message: 'Delete (burn) this group permanently?', danger: true, confirmLabel: 'Burn' });
    if (!yes) return;

    const next = [...groups];
    next[idx] = { ...next[idx], status: 'burned' };
    STATE.set('groups', next);
    if (getPrimaryGroupIdForProfile(getActiveProfileId()) === groupId) {
      setPrimaryGroup(null);
    }
    TOAST.error('Group burned!');

    if (selectedGroupId === groupId) {
      selectedGroupId = null;
      previewName.textContent = 'Group Name';
      previewType.textContent = 'Type';
      groupPreviewPanel.classList.remove('active');
      emptyState.style.display = '';
      previewImage.innerHTML = '<span style="font-size:64px;">👥</span>';
    }
  };

  window.deleteGroup = window.clearGroup;

  window.inviteToGroup = function(groupId) {
    const profiles = getProfiles();
    const groups = STATE.get('groups') || [];
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx === -1) { TOAST.error('Group not found'); return; }
    const group = groups[idx];
    const memberProfileIds = getGroupMembers(group);

    // Build player search modal content
    const wrapper = document.createElement('div');

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search players...';
    searchInput.style.cssText = `
      width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #e0e0e0);
      font-size: 13px; background: var(--bg-input, #fff); color: var(--text-primary, #111);
      margin-bottom: 10px; box-sizing: border-box;
    `;

    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
      max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
      border: 1px solid var(--border-color, #e0e0e0); padding: 8px;
    `;

    function renderPlayers(filter) {
      const query = (filter || '').toLowerCase();
      const available = profiles.filter(p =>
        !memberProfileIds.includes(p.id) &&
        (p.name || '').toLowerCase().includes(query)
      );
      if (available.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted,#888);padding:20px;font-size:13px;">No players found</div>';
        return;
      }
      listContainer.innerHTML = '';
      available.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; border: 1px solid var(--border-color, #e0e0e0);
          background: var(--bg-card, #fff); cursor: pointer; transition: background 0.1s;
        `;
        row.innerHTML = `
          <span style="font-size:13px;font-weight:600;color:var(--text-primary,#111);">${(p.name || 'Player').replace(/</g, '&lt;')}</span>
          <span style="font-size:11px;color:var(--text-muted,#888);">Tap to invite</span>
        `;
        row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg-hover, #f0f0f0)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'var(--bg-card, #fff)'; });
        row.addEventListener('click', () => {
          memberProfileIds.push(p.id);
          const next = [...groups];
          next[idx] = { ...group, memberProfileIds, members: memberProfileIds.length };
          STATE.set('groups', next);
          TOAST.success('Invited ' + p.name + ' to the group');
          modal.close();
          renderGroupsList();
        });
        listContainer.appendChild(row);
      });
    }

    searchInput.addEventListener('input', () => renderPlayers(searchInput.value));
    wrapper.appendChild(searchInput);
    wrapper.appendChild(listContainer);
    renderPlayers('');

    const modal = new Modal({
      title: 'Invite Player',
      content: wrapper,
      size: 'sm',
      buttons: [
        { label: 'Cancel', className: 'btn-secondary', onClick: () => {} }
      ],
      onOpen: () => searchInput.focus()
    });
    modal.open();
  };

  // ===== Create Group =====
  function openCreateMode() {
    currentMode = 'create';
    editingGroupId = null;

    // Show edit mode
    pageContainer.classList.add('edit-mode');

    // Reset form
    editPanelTitle.textContent = 'Create Group';
    if (imagePanelTitle) imagePanelTitle.textContent = 'Group Image';
    if (saveGroupBtn) saveGroupBtn.textContent = 'Create';

    groupName.value = '';
    groupDescription.value = '';

    // Reset type
    selectedType = null;
    typeOptions.querySelectorAll('.type-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // Reset image
    groupImageData = null;
    renderImageUploadArea(null);

    // Reset privacy
    document.querySelector('input[name="privacy"][value="public"]').checked = true;
    updatePrivacyInfo();

    // Update preview
    previewName.textContent = 'New Group';
    previewType.textContent = 'Select a type';
    emptyState.style.display = 'none';
    groupPreviewPanel.classList.add('active');
    previewImage.innerHTML = '<span style="font-size:64px;">👥</span>';
  }

  // ===== Cancel Edit =====
  function cancelEdit() {
    currentMode = 'list';
    editingGroupId = null;
    pageContainer.classList.remove('edit-mode');
  }

  // ===== Save Group =====
  async function saveGroup() {
    const name = groupName.value.trim();
    if (!name) {
      TOAST.error('Please enter a group title');
      return;
    }

    if (!selectedType) {
      TOAST.error('Please select a group type');
      return;
    }

    showLoading();

    const activeProfile = getActiveProfile();
    const activeProfileId = activeProfile?.id || ESHU_DB.getValue('currentProfileId') || null;
    const selectedPrivacy = getSelectedPrivacy();

    // Push the cover image (when it's a fresh data URL) through the
    // canonical asset pipeline so it survives /api/sync refreshes, fresh
    // devices, and IndexedDB eviction. The inline `image` field is kept as
    // a short-lived preview cache so the UI doesn't flicker while the
    // upload completes. Failures here log and fall back to inline-only.
    let coverAssetId;
    if (typeof groupImageData === 'string' && groupImageData.startsWith('data:') && window.ESHU_ASSETS) {
      try {
        const uploaded = await window.ESHU_ASSETS.uploadDataUrl(groupImageData, 'group-cover.png');
        if (uploaded && uploaded.assetId) coverAssetId = uploaded.assetId;
      } catch (err) {
        console.warn('[groups.save] cover upload failed; falling back to inline data URL:', err);
      }
    } else if (groupImageData === null) {
      coverAssetId = null;
    }

    try {
      if (currentMode === 'create') {
        const newGroup = {
          id: createGroupId(),
          name: name,
          description: groupDescription.value.trim(),
          type: selectedType,
          privacy: selectedPrivacy,
          image: groupImageData,
          ...(coverAssetId !== undefined ? { coverAssetId } : {}),
          members: 1,
          memberProfileIds: activeProfileId ? [activeProfileId] : [],
          createdAt: Date.now(),
          ownerProfileId: activeProfileId,
          createdByProfileId: activeProfileId
        };

        let savedGroup = newGroup;
        if (window.ESHU_SYNC && ESHU_SYNC.isRemote && ESHU_SYNC.isRemote() && ESHU_API.groups && typeof ESHU_API.groups.create === 'function') {
          try {
            savedGroup = await ESHU_SYNC.mutate({
              entity: 'groups',
              call: () => ESHU_API.groups.create({
                name: newGroup.name,
                description: newGroup.description,
                type: newGroup.type,
                privacy: newGroup.privacy,
                image: newGroup.image,
                ...(newGroup.coverAssetId !== undefined ? { coverAssetId: newGroup.coverAssetId } : {}),
                members: newGroup.members,
                memberProfileIds: newGroup.memberProfileIds
              }),
              pick: (resp) => {
                const serverGroup = resp && resp.group ? resp.group : resp;
                return { ...newGroup, ...serverGroup };
              },
              refresh: true
            }) || newGroup;
          } catch (err) {
            console.warn('[groups.save] server create failed:', err);
            TOAST.error('Could not sync this group to the backend. Please check your connection and try again.');
            return;
          }
        }

        const groups = STATE.get('groups') || [];
        const nextGroups = [savedGroup, ...groups.filter(group => group && group.id !== savedGroup.id)];

        ESHU_DB.setTable('groups', nextGroups);
        selectedGroupId = savedGroup.id;
        // Creating a group is an explicit branch away from onboarding, so make
        // it the active host for subsequent game creation.
        setPrimaryGroup(savedGroup.id);
        STATE.set('groups', nextGroups);
        if (scopeFilter) scopeFilter.value = 'mine';
        renderGroupsList();
        selectGroup(savedGroup.id);

        TOAST.success(`Group "${name}" created!`);
        const returnMode = new URLSearchParams(window.location.search).get('return');
        if (returnMode === 'create-game') {
          window.location.href = `games.html?action=create&groupId=${encodeURIComponent(savedGroup.id)}&sourceGroupId=${encodeURIComponent(savedGroup.id)}`;
          return;
        }

      } else if (currentMode === 'edit') {
        const groups = STATE.get('groups') || [];
        const groupIndex = groups.findIndex(g => g.id === editingGroupId);
        if (groupIndex === -1) {
          TOAST.error('Group not found');
          return;
        }

        // Prevent editing the default group
        if (editingGroupId === DEFAULT_GROUP_ID) {
          TOAST.error('The default group cannot be edited');
          hideLoading();
          return;
        }

        const existingMembers = getGroupMembers(groups[groupIndex]);

        const updatedGroup = {
          ...groups[groupIndex],
          name: name,
          description: groupDescription.value.trim(),
          type: selectedType,
          privacy: selectedPrivacy,
          image: groupImageData,
          ...(coverAssetId !== undefined ? { coverAssetId } : {}),
          ownerProfileId: groups[groupIndex].ownerProfileId || activeProfileId,
          memberProfileIds: existingMembers,
          members: existingMembers.length || groups[groupIndex].members || 1,
          updatedByProfileId: activeProfileId
        };

        let savedGroup = updatedGroup;
        if (window.ESHU_SYNC && ESHU_SYNC.isRemote && ESHU_SYNC.isRemote() && ESHU_API.groups && typeof ESHU_API.groups.update === 'function') {
          try {
            savedGroup = await ESHU_SYNC.mutate({
              entity: 'groups',
              call: () => ESHU_API.groups.update(updatedGroup.id, {
                name: updatedGroup.name,
                description: updatedGroup.description,
                type: updatedGroup.type,
                privacy: updatedGroup.privacy,
                image: updatedGroup.image,
                ...(updatedGroup.coverAssetId !== undefined ? { coverAssetId: updatedGroup.coverAssetId } : {}),
                members: updatedGroup.members,
                memberProfileIds: updatedGroup.memberProfileIds
              }),
              pick: (resp) => {
                const serverGroup = resp && resp.group ? resp.group : resp;
                return { ...updatedGroup, ...serverGroup };
              },
              refresh: true
            }) || updatedGroup;
          } catch (err) {
            console.warn('[groups.save] server update failed:', err);
            TOAST.error('Could not sync this group update. Please check your connection and try again.');
            return;
          }
        }

        const newGroups = [...groups];
        newGroups[groupIndex] = savedGroup;
        ESHU_DB.setTable('groups', newGroups);
        STATE.set('groups', newGroups);

        TOAST.success('Group updated!');
      }
      cancelEdit();

    } catch (err) {
      console.error('Save error:', err);
      if (err && err.name === 'QuotaExceededError') {
        TOAST.error('Storage is still full. Remove old creations/images and try again.');
      } else {
        TOAST.error('Failed to save group');
      }
    } finally {
      hideLoading();
    }
  }

  // ===== Privacy Info =====
  function updatePrivacyInfo() {
    const privacy = getSelectedPrivacy();
    if (privacy === 'public') {
      privacyInfo.innerHTML = `
        <div class="privacy-tag green">Anyone can find and join</div>
        <div class="privacy-tag coral">All content is visible</div>
      `;
    } else {
      privacyInfo.innerHTML = `
        <div class="privacy-tag dark">Invite only - hidden from search</div>
      `;
    }
  }

  // ===== Event Listeners =====
  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openCreateMode();
    });
  }
  cancelEditBtn.addEventListener('click', cancelEdit);
  saveGroupBtn.addEventListener('click', saveGroup);

  // Type selection
  typeOptions.querySelectorAll('.type-option').forEach(opt => {
    opt.addEventListener('click', () => {
      typeOptions.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedType = opt.dataset.type;

      // Update preview
      previewType.textContent = selectedType;
      const icon = typeIcons[selectedType] || '👥';
      if (!groupImageData) {
        previewImage.innerHTML = icon;
      }
    });
  });

  // Image upload - click on large image in edit mode
  imageUploadArea.addEventListener('click', () => {
    if ((currentMode === 'create' || currentMode === 'edit') && !imageUploadArea.classList.contains('is-editing')) {
      groupImageInput.click();
    }
  });

  groupImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        startHexImageEditor(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  });

  // ===== Hex Image Pan/Zoom Editor =====
  let hexEditorState = null;

  function startHexImageEditor(dataUrl) {
    endHexImageEditor(); // clean up any prior session
    imageUploadArea.classList.add('is-editing');
    imageUploadArea.innerHTML = `
      <div class="hex-image-frame hex-image-editor">
        <div class="hex-editor-wrap">
          <img class="hex-editor-img" src="${String(dataUrl).replace(/"/g, '&quot;')}" draggable="false" alt="" />
        </div>
        <svg class="hex-image-overlay" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="#000" stroke-linejoin="miter" stroke-linecap="butt">
            <polyline points="184,450 316,220 708,220 840,450" stroke-width="78" />
            <polygon points="792,560 652,318 372,318 232,560 372,802 652,802" stroke-width="44" />
          </g>
        </svg>
      </div>
    `;

    const area = imageUploadArea.parentElement;
    let controls = area.querySelector('.hex-editor-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'hex-editor-controls';
      imageUploadArea.insertAdjacentElement('afterend', controls);
    }
    controls.innerHTML = `
      <label class="hex-editor-zoom-label">
        <span>Zoom</span>
        <input type="range" class="hex-editor-zoom" min="0.5" max="4" step="0.01" value="1" />
      </label>
      <div class="hex-editor-actions">
        <button type="button" class="hex-editor-btn hex-editor-cancel">Cancel</button>
        <button type="button" class="hex-editor-btn hex-editor-apply">Apply</button>
      </div>
    `;
    controls.style.display = 'flex';

    const wrap = imageUploadArea.querySelector('.hex-editor-wrap');
    const img = imageUploadArea.querySelector('.hex-editor-img');
    const zoomSlider = controls.querySelector('.hex-editor-zoom');
    const applyBtn = controls.querySelector('.hex-editor-apply');
    const cancelBtn = controls.querySelector('.hex-editor-cancel');

    const state = {
      scale: 1, tx: 0, ty: 0,
      natural: { w: 0, h: 0 },
      wrap: { w: 0, h: 0 },
      baseScale: 1,
      prevImageData: groupImageData
    };
    hexEditorState = { controls };

    function updateTransform() {
      const total = state.scale * state.baseScale;
      // Center the image in the wrap area, then apply pan offset
      const dx = state.tx;
      const dy = state.ty;
      img.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${total})`;
    }

    function initializeOnImgReady() {
      state.natural.w = img.naturalWidth || 1;
      state.natural.h = img.naturalHeight || 1;
      const r = wrap.getBoundingClientRect();
      state.wrap.w = r.width || 1;
      state.wrap.h = r.height || 1;
      // Cover: min display size that covers the hex rect
      state.baseScale = Math.max(state.wrap.w / state.natural.w, state.wrap.h / state.natural.h);
      state.scale = 1;
      state.tx = 0;
      state.ty = 0;
      zoomSlider.value = '1';
      updateTransform();
    }
    if (img.complete && img.naturalWidth) initializeOnImgReady();
    else img.addEventListener('load', initializeOnImgReady, { once: true });

    // Drag
    let dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;
    function onDown(e) {
      dragging = true;
      const p = e.touches?.[0] || e;
      startX = p.clientX; startY = p.clientY;
      startTx = state.tx; startTy = state.ty;
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const p = e.touches?.[0] || e;
      state.tx = startTx + (p.clientX - startX);
      state.ty = startTy + (p.clientY - startY);
      updateTransform();
    }
    function onUp() { dragging = false; }
    wrap.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    wrap.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    // Zoom slider + wheel
    zoomSlider.addEventListener('input', () => {
      state.scale = parseFloat(zoomSlider.value);
      updateTransform();
    });
    function onWheel(e) {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      state.scale = Math.max(0.5, Math.min(4, state.scale + delta));
      zoomSlider.value = String(state.scale);
      updateTransform();
    }
    wrap.addEventListener('wheel', onWheel, { passive: false });

    applyBtn.addEventListener('click', () => {
      const baked = bakeHexCrop(img, state);
      groupImageData = baked;
      endHexImageEditor();
      previewImage.innerHTML = buildHexImageSvg(baked);
      renderImageUploadArea(baked);
    });

    cancelBtn.addEventListener('click', () => {
      endHexImageEditor();
      if (state.prevImageData) {
        groupImageData = state.prevImageData;
        previewImage.innerHTML = buildHexImageSvg(state.prevImageData);
        renderImageUploadArea(state.prevImageData);
      } else {
        groupImageData = null;
        previewImage.innerHTML = `<div class="eshu-logo"></div>`;
        renderImageUploadArea(null);
      }
      // reset file input so re-selecting same file fires change
      groupImageInput.value = '';
    });

    // Cleanup references for endHexImageEditor
    hexEditorState.cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }

  function endHexImageEditor() {
    if (hexEditorState) {
      try { hexEditorState.cleanup && hexEditorState.cleanup(); } catch {}
      hexEditorState.controls?.remove();
      hexEditorState = null;
    }
    imageUploadArea.classList.remove('is-editing');
  }

  // Bake the current crop state into a dataURL (rectangle matching the hex rect aspect)
  function bakeHexCrop(img, state) {
    const CW = 1120, CH = 968; // 2x the hex rect (560x484) for crisper output
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CW, CH);

    // Calculate the scale factors between wrap size and output canvas
    const sx = CW / state.wrap.w;
    const sy = CH / state.wrap.h;

    // Total scale includes base scale (fit to wrap) and user zoom
    const totalScale = state.scale * state.baseScale;

    // Calculate image dimensions on the output canvas
    const imgW = state.natural.w * totalScale * sx;
    const imgH = state.natural.h * totalScale * sy;

    // Center point of canvas plus user pan offset (scaled to canvas)
    const cx = (CW / 2) + (state.tx * sx);
    const cy = (CH / 2) + (state.ty * sy);

    // Draw image centered at cx,cy
    ctx.drawImage(img, cx - imgW / 2, cy - imgH / 2, imgW, imgH);

    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // Back button (on image panel header)
  if (backBtn) {
    backBtn.addEventListener('click', cancelEdit);
  }

  // Privacy toggle
  document.querySelectorAll('input[name="privacy"]').forEach(radio => {
    radio.addEventListener('change', updatePrivacyInfo);
  });

  // Search and filter
  searchBox.addEventListener('input', renderGroupsList);
  if (scopeFilter) {
    scopeFilter.addEventListener('change', () => {
      // Update search placeholder based on filter type
      if (searchBox) {
        if (scopeFilter.value === 'byGame') {
          searchBox.placeholder = 'Search Games...';
        } else {
          searchBox.placeholder = 'Search groups...';
        }
      }
      renderGroupsList();
    });
  }

  // Preview action buttons
  if (previewLikeBtn) {
    previewLikeBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.toggleGroupLike(selectedGroupId, previewLikeBtn);
      selectGroup(selectedGroupId);
    });
  }
  if (previewFollowBtn) {
    previewFollowBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.toggleGroupFollow(selectedGroupId, previewFollowBtn);
      selectGroup(selectedGroupId);
    });
  }
  if (previewSettingsBtn) {
    previewSettingsBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.editGroup(selectedGroupId);
    });
  }
  if (previewJoinBtn) {
    previewJoinBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.joinGroup(selectedGroupId, previewJoinBtn);
    });
  }
  if (previewLeaveBtn) {
    previewLeaveBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.leaveGroup(selectedGroupId);
    });
  }
  if (previewInviteBtn) {
    previewInviteBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.inviteToGroup(selectedGroupId);
    });
  }
  if (previewSetPrimaryBtn) {
    previewSetPrimaryBtn.addEventListener('click', () => {
      if (!selectedGroupId) return;
      window.setAsPrimaryGroup(selectedGroupId);
    });
  }

  // Live preview name update
  groupName.addEventListener('input', () => {
    previewName.textContent = groupName.value || 'Group Title';
  });

  // ===== Initialize =====
  function boot() {
    try { initializeApp(); } catch(e) { console.error('initializeApp error:', e); }
    try { renderGroupsList(); } catch(e) { console.error('renderGroupsList error:', e); }
    try { updateStatusBar(); } catch(e) { console.error('updateStatusBar error:', e); }
    try { checkUrlActions(); } catch(e) { console.error('checkUrlActions error:', e); }
    window.addEventListener('eshu:remote-activated', rehydrateFromStorage);
    window.addEventListener('eshu:sync-success', rehydrateFromStorage);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();