(function () {
  'use strict';

  // ===== DOM Elements =====
  const form = document.getElementById('creationForm');
  const xpCounter = document.getElementById('xpCounter');
  const gameDropdown = document.getElementById('gameDropdown');
  const gameDropdownTrigger = document.getElementById('gameDropdownTrigger');
  const gameDropdownValue = document.getElementById('gameDropdownValue');
  const gameDropdownMenu = document.getElementById('gameDropdownMenu');
  const gameDropdownList = document.getElementById('gameDropdownList');
  const gameSearchInput = document.getElementById('gameSearchInput');
  const imageDropzone = document.getElementById('imageDropzone');
  const imageInput = document.getElementById('imageInput');
  const previewImage = document.getElementById('previewImage');
  const backBtn = document.getElementById('backBtn');
  const backToStudioBtn = document.getElementById('backToStudioBtn');
  const createBtn = document.getElementById('createBtn');
  const uploadFooter = document.getElementById('uploadFooter');
  const formFooter = document.getElementById('formFooter');
  const uploadLockHint = document.getElementById('uploadLockHint');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingMessage = document.getElementById('loadingMessage');

  // ===== URL Parameters =====
  const pageParams = new URLSearchParams(window.location.search);
  const preselectedGameId = pageParams.get('gameId');
  const actionMode = pageParams.get('action');
  const sourceGroupId = pageParams.get('sourceGroupId');
  const editCreationId = pageParams.get('edit');

  // ===== State =====
  let games = [];
  let creations = [];
  let uploadedImage = null;
  let xpPoints = 0;
  let isSubmitting = false;
  let editingCreation = null;
  let imageLockedForEdit = false;
  let hostGameLockedForEdit = false;
  let selectedGameId = null;
  let editImageObjectUrl = '';

  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  // Inline preview is a fast-path/fallback only. The full-resolution original
  // file is what we upload to /api/assets (see processImageForStorage). The
  // preview is sized generously and encoded near-lossless so even when the
  // asset fetch is slow the user doesn't see a punishingly small thumbnail.
  const THUMBNAIL_MAX_SIDE = 1600;
  const THUMBNAIL_QUALITY = 0.92;
  const CREATION_UPLOAD_UNLOCK_XP = 2;
  const CREATION_UPLOAD_UNLOCK_KEY = 'creationUploadUnlocked';
  const DEFAULT_GROUP_ID = 'group_default';
  const DEFAULT_GAME_ID = 'game_default';
  const CREATION_EDIT_TRANSFER_KEY = 'eshu.creationEdit.transfer';
  const runtime = window.ESHU_RUNTIME;
  let uploadUnlocked = false;

  function runHype(message, onComplete, duration = 1500) {
    if (window.TOAST && typeof TOAST.hype === 'function') {
      TOAST.hype(message, { duration, onComplete });
      return;
    }
    if (typeof onComplete === 'function') {
      onComplete();
    }
  }

  // Both panels always visible — no wizard step toggling needed
  function setWizardStep(step) {
    // no-op: retained for compatibility with edit mode init
  }

  function applyHostGameLockUi() {
    if (!hostGameLockedForEdit) return;
    if (gameDropdownTrigger) {
      gameDropdownTrigger.classList.add('locked');
      gameDropdownTrigger.title = 'Host game cannot be changed after upload';
    }
    if (gameSearchInput) {
      gameSearchInput.disabled = true;
      gameSearchInput.placeholder = 'Host game is locked after upload';
      gameSearchInput.title = 'Host game cannot be changed after upload';
    }
    closeGameDropdown();
  }

  const IMAGE_STORE = {
    DB_NAME: 'eshu_media_store_v1',
    STORE_NAME: 'creation_images',
    VERSION: 1,
    dbPromise: null
  };

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function readUploadUnlockFlag() {
    const scopedKey = getUploadUnlockStorageKey();
    if (typeof ESHU_DB !== 'undefined') {
      return !!ESHU_DB.getValue(scopedKey);
    }
    if (typeof STATE !== 'undefined') {
      return !!STATE.get(scopedKey);
    }
    return localStorage.getItem(scopedKey) === 'true';
  }

  function writeUploadUnlockFlag(value) {
    const scopedKey = getUploadUnlockStorageKey();
    if (typeof ESHU_DB !== 'undefined') {
      ESHU_DB.setValue(scopedKey, !!value);
    } else if (typeof STATE !== 'undefined') {
      STATE.set(scopedKey, !!value);
    }
    localStorage.setItem(scopedKey, value ? 'true' : 'false');
  }

  function syncUploadUnlockState() {
    const alreadyUnlocked = readUploadUnlockFlag();
    const reachedThreshold = xpPoints >= CREATION_UPLOAD_UNLOCK_XP;
    uploadUnlocked = alreadyUnlocked || reachedThreshold;
    if (uploadUnlocked && !alreadyUnlocked) {
      writeUploadUnlockFlag(true);
    }
  }

  function updateUploadAccessUi() {
    const isEditing = !!editingCreation || !!editCreationId;
    const onboardingUploadAllowed = canUploadToSelectedOnboardingGame();
    const isLocked = !isEditing && !uploadUnlocked && !onboardingUploadAllowed;
    const lockMessage = `Requires ${CREATION_UPLOAD_UNLOCK_XP} XP to unlock uploads`;
    const remainingXp = Math.max(0, CREATION_UPLOAD_UNLOCK_XP - xpPoints);
    if (createBtn) {
      createBtn.disabled = isLocked || isSubmitting;
      createBtn.title = isLocked ? lockMessage : '';
    }
    if (uploadFooter) {
      uploadFooter.title = isLocked ? lockMessage : '';
    }
    if (formFooter) {
      formFooter.title = isLocked ? lockMessage : '';
    }
    if (uploadLockHint) {
      if (isLocked) {
        uploadLockHint.hidden = false;
        uploadLockHint.textContent = `Need ${remainingXp} more XP to unlock creation uploads (unlocks forever at ${CREATION_UPLOAD_UNLOCK_XP} XP).`;
      } else {
        uploadLockHint.hidden = true;
      }
    }
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

  function upsertLocalCreation(creation) {
    if (!creation || !creation.id || typeof ESHU_DB === 'undefined') return;
    ESHU_DB.updateTable('creations', (currentCreations) => {
      const list = Array.isArray(currentCreations) ? currentCreations : [];
      const idx = list.findIndex((item) => item && item.id === creation.id);
      if (idx < 0) return [creation, ...list];
      const next = [...list];
      next[idx] = { ...next[idx], ...creation };
      return next;
    });
  }

  function readTransferredCreation(id) {
    try {
      const raw = sessionStorage.getItem(CREATION_EDIT_TRANSFER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const creation = parsed && parsed.creation;
      if (!creation || creation.id !== id) return null;
      upsertLocalCreation(creation);
      return creation;
    } catch (err) {
      console.warn('[creations] Failed to read edit handoff:', err);
      return null;
    }
  }

  function setEditModeUi(creation) {
    document.title = 'ESHU - Edit Creation';
    const titleEl = document.querySelector('.creation-edit-panel .edit-title');
    if (titleEl) titleEl.textContent = creation ? 'Edit Creation' : 'Creation Not Found';
    if (createBtn) {
      createBtn.textContent = creation ? 'Save Changes' : 'Cannot Edit';
      createBtn.dataset.originalText = creation ? 'Save Changes' : 'Cannot Edit';
      createBtn.disabled = !creation;
    }
  }

  function getUploadUnlockStorageKey() {
    const profileId = getActiveProfileId() || 'global';
    return `${CREATION_UPLOAD_UNLOCK_KEY}_${profileId}`;
  }

  function getGroupMembers(group) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.getMembers === 'function') {
      return window.ESHU_FLOW.getMembers(group);
    }
    const members = Array.isArray(group?.memberProfileIds) ? group.memberProfileIds.filter(Boolean) : [];
    if (group?.ownerProfileId && !members.includes(group.ownerProfileId)) {
      members.push(group.ownerProfileId);
    }
    return members;
  }

  function getGameMembers(game) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.getMembers === 'function') {
      return window.ESHU_FLOW.getMembers(game);
    }
    const members = Array.isArray(game?.memberProfileIds) ? game.memberProfileIds.filter(Boolean) : [];
    if (game?.ownerProfileId && !members.includes(game.ownerProfileId)) {
      members.push(game.ownerProfileId);
    }
    return members;
  }

  function canAccessGame(game, profileId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.canAccessGame === 'function') {
      return window.ESHU_FLOW.canAccessGame(game, profileId, games || []);
    }
    if (!game) return false;
    if (game.privacy !== 'private') return true;
    if (!profileId) return false;
    if (game.ownerProfileId === profileId) return true;
    if (getGameMembers(game).includes(profileId)) return true;

    const groups = ESHU_DB.getTable('groups') || [];
    const hostGroup = groups.find(g => g.id === game.hostGroupId);
    if (!hostGroup) return false;
    return getGroupMembers(hostGroup).includes(profileId);
  }

  function canUploadToSelectedOnboardingGame() {
    const profileId = getActiveProfileId();
    if (!profileId || selectedGameId !== DEFAULT_GAME_ID) return false;
    const game = (games || []).find(g => g && g.id === DEFAULT_GAME_ID);
    if (!game || !canAccessGame(game, profileId)) return false;
    if (getGameMembers(game).includes(profileId)) return true;
    const groups = ESHU_DB.getTable('groups') || [];
    const defaultGroup = groups.find(g => g && g.id === DEFAULT_GROUP_ID);
    return getGroupMembers(defaultGroup).includes(profileId);
  }

  function ensureDefaultOnboardingGame(profileId) {
    if (!profileId) return null;
    const groups = ESHU_DB.getTable('groups') || [];
    const defaultGroup = groups.find(g => g && g.id === DEFAULT_GROUP_ID);
    const groupMembers = getGroupMembers(defaultGroup);
    if (!groupMembers.includes(profileId)) return null;

    const currentGames = ESHU_DB.getTable('games') || [];
    const now = Date.now();
    const existingIndex = currentGames.findIndex(g => g && g.id === DEFAULT_GAME_ID);
    const existing = existingIndex >= 0 ? currentGames[existingIndex] : {};
    const memberProfileIds = getGameMembers(existing);
    const hadMembership = memberProfileIds.includes(profileId);
    if (!hadMembership) memberProfileIds.push(profileId);

    const needsHealing = existingIndex < 0 ||
      !hadMembership ||
      existing.name !== 'Default Game' ||
      existing.hostGroupId !== DEFAULT_GROUP_ID ||
      existing.status !== 'active' ||
      existing.isSystemDefault !== true ||
      existing.isOnboardingDefault !== true;

    if (!needsHealing) {
      return existing;
    }

    const healed = {
      ...existing,
      id: DEFAULT_GAME_ID,
      name: 'Default Game',
      description: 'Upload your first creation here.',
      rules: 'Upload image assets. Each upload awards XP toward the next unlock.',
      hostGroupId: DEFAULT_GROUP_ID,
      hostGroupName: 'GROUP',
      privacy: 'public',
      gameType: existing.gameType || 'book',
      timingMode: 'infinite',
      ownerProfileId: null,
      createdByProfileId: null,
      memberProfileIds,
      startTime: existing.startTime ?? null,
      submissionCloseTime: existing.submissionCloseTime ?? null,
      endTime: existing.endTime ?? null,
      timingOffsets: existing.timingOffsets || {
        start: { weeks: 0, days: 0, hours: 0, mins: 0 },
        submission: { weeks: 0, days: 0, hours: 0, mins: 0 },
        end: { weeks: 0, days: 0, hours: 0, mins: 0 }
      },
      timingExtensions: Array.isArray(existing.timingExtensions) ? existing.timingExtensions : [],
      isSystemDefault: true,
      isOnboardingDefault: true,
      fixedSettings: true,
      awardsXp: true,
      status: 'active',
      createdAt: existing.createdAt || now,
      updatedAt: now
    };

    const nextGames = existingIndex >= 0 ? [...currentGames] : [healed, ...currentGames];
    if (existingIndex >= 0) nextGames[existingIndex] = healed;
    ESHU_DB.setTable('games', nextGames);
    if (typeof STATE !== 'undefined' && STATE.set) STATE.set('games', nextGames);
    games = nextGames;
    return healed;
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

  // ===== Preselection =====
  // Resolves the URL ?gameId= preselection against the live games table.
  // If the row hasn't landed locally yet (common right after onboarding
  // default-group join while /sync is still in flight) we still lock the
  // selection in with a best-effort label so the user can submit, and the
  // label upgrades to the real game name once sync delivers it.
  function applyPreselectedGame() {
    if (!preselectedGameId) return;
    if (preselectedGameId === DEFAULT_GAME_ID) {
      ensureDefaultOnboardingGame(getActiveProfileId());
    }
    if (selectedGameId === preselectedGameId && gameDropdownValue && !gameDropdownValue.classList.contains('placeholder')) {
      // Already locked in with a real label; no-op unless the game name changes.
      const refreshed = (games || []).find(g => g && g.id === preselectedGameId);
      if (refreshed && refreshed.name && gameDropdownValue.textContent !== refreshed.name) {
        gameDropdownValue.textContent = refreshed.name;
      }
      return;
    }
    const preGame = (games || []).find(g => g && g.id === preselectedGameId);
    const fallbackName = preselectedGameId === DEFAULT_GAME_ID ? 'Default Game' : preselectedGameId;
    setGameDropdownValue(preselectedGameId, preGame ? preGame.name : fallbackName);
  }

  // ===== Initialize =====
  function init() {
    if (typeof ESHU_DB !== 'undefined') {
      ESHU_DB.ensure();
      refreshState();
      initNavProfile();
    } else if (typeof STATE !== 'undefined') {
      games = STATE.get('games') || [];
      creations = STATE.get('creations') || [];
    }
    
    setupEventListeners();

    // Pre-select game if passed via URL. The local games table may still be
    // hydrating from /sync (especially right after onboarding default-group
    // join), so we also re-attempt on sync events and fall back to a
    // sensible label if the game row hasn't landed yet.
    applyPreselectedGame();
    window.addEventListener('eshu:remote-activated', () => {
      refreshState();
      applyPreselectedGame();
      renderGameList(gameSearchInput ? gameSearchInput.value : '');
    });
    window.addEventListener('eshu:sync-success', () => {
      refreshState();
      applyPreselectedGame();
      renderGameList(gameSearchInput ? gameSearchInput.value : '');
    });
    
    // Listen for Architect Mode toggle - update image lock state if editing
    window.addEventListener('eshu:architect-mode-changed', (e) => {
      const architectMode = e?.detail?.enabled;
      if (editingCreation) {
        const hasImage = !!(editingCreation.image || editingCreation.imageUrl);
        imageLockedForEdit = hasImage && !architectMode;
        // Update UI to reflect lock state change
        updateWizardImageLockUI();
      }
    });
    
    renderGameList();
    
    // Set today's date as default
    const dateInput = document.getElementById('creationDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    updateXPDisplay();
    syncUploadUnlockState();
    updateUploadAccessUi();
    studioInit();
    setWizardStep('studio');

    // Edit mode: pre-fill form if ?edit= is present
    if (editCreationId) {
      const loaded = loadCreationForEdit(editCreationId);
      if (!loaded) {
        setEditModeUi(null);
        if (typeof TOAST !== 'undefined') TOAST.error('Creation not found for editing. Please go back and try again.');
      }
      setWizardStep('details');
    }
  }

  function loadCreationForEdit(id) {
    const creation = ESHU_DB.getEntityById('creations', id) || readTransferredCreation(id);
    if (!creation) return false;
    editingCreation = creation;
    setEditModeUi(creation);
    
    // Lock image editing for published creations unless Architect Mode is enabled
    const hasImage = !!(creation.image || creation.imageUrl);
    const architectModeEnabled = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue) 
      ? !!ESHU_DB.getValue('architectMode') 
      : false;
    imageLockedForEdit = hasImage && !architectModeEnabled;

    const titleEl = document.getElementById('creationTitle');
    const descEl = document.getElementById('creationDesc');
    const devicesEl = document.getElementById('creationDevices');
    const tagsEl = document.getElementById('creationTags');
    const locationEl = document.getElementById('creationLocation');
    const dateEl = document.getElementById('creationDate');

    if (titleEl) titleEl.value = creation.title || creation.name || '';
    if (descEl) descEl.value = creation.description || '';
    if (devicesEl) devicesEl.value = creation.devices || '';
    if (tagsEl) tagsEl.value = Array.isArray(creation.tags) ? creation.tags.join(', ') : (creation.tags || '');
    if (locationEl) locationEl.value = creation.location || '';
    if (dateEl) dateEl.value = creation.dateMade || '';
    const editGameId = creation.hostGameId || creation.gameId || '';
    if (editGameId) {
      const editGame = games.find(g => g.id === editGameId);
      setGameDropdownValue(editGameId, editGame ? editGame.name : editGameId);
    }
    hostGameLockedForEdit = true;

    const privacyRadio = document.querySelector(`input[name="privacy"][value="${creation.privacy || 'public'}"]`);
    if (privacyRadio) privacyRadio.checked = true;

    loadStudioImageForEdit(creation);
    applyEditImageLockUi();
    applyHostGameLockUi();

    updateUploadAccessUi();
    return true;
  }

  async function resolveCreationEditImageUrl(creation) {
    if (!creation || typeof creation !== 'object') return '';
    if (window.ESHU_MEDIA?.resolveCreationImageSrc) {
      try {
        const resolved = await window.ESHU_MEDIA.resolveCreationImageSrc(creation);
        if (resolved) return resolved;
      } catch (err) {
        console.warn('[creations] Failed to resolve edit image via ESHU_MEDIA:', err);
      }
    }

    const imageRefId = creation?.imageRef?.id;
    if (imageRefId) {
      try {
        const db = await openImageStoreDb();
        const blob = await new Promise((resolve, reject) => {
          const tx = db.transaction(IMAGE_STORE.STORE_NAME, 'readonly');
          const store = tx.objectStore(IMAGE_STORE.STORE_NAME);
          const req = store.get(imageRefId);
          req.onsuccess = () => resolve(req.result?.blob || null);
          req.onerror = () => reject(req.error || new Error('Failed to read image from media store'));
        });
        if (blob instanceof Blob) {
          if (editImageObjectUrl) {
            try { URL.revokeObjectURL(editImageObjectUrl); } catch {}
          }
          editImageObjectUrl = URL.createObjectURL(blob);
          return editImageObjectUrl;
        }
      } catch (err) {
        console.warn('[creations] Failed to resolve edit image via local media store:', err);
      }
    }

    return creation.image || '';
  }

  function loadStudioImageFromUrl(imageUrl) {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => {
      studio.img = img;
      studio.naturalW = img.naturalWidth;
      studio.naturalH = img.naturalHeight;

      const stage = document.getElementById('cuPreviewStage');
      const maxW = stage ? (stage.clientWidth - 24) : 640;
      const maxH = stage ? (stage.clientHeight - 24) : 480;
      const scale = Math.min(maxW / studio.naturalW, maxH / studio.naturalH, 1);
      const canvas = getDisplayCanvas();
      if (canvas) {
        canvas.width = Math.round(studio.naturalW * scale);
        canvas.height = Math.round(studio.naturalH * scale);
        canvas.classList.remove('hidden');
      }

      studio.mode = 'preview';
      resetCropBox();
      studioRedraw();

      const emptyEl = document.getElementById('cuPreviewEmpty');
      if (emptyEl) emptyEl.style.display = 'none';
      if (previewImage) {
        previewImage.src = imageUrl;
        previewImage.style.display = 'block';
      }
      if (imageDropzone) imageDropzone.classList.add('has-image');
    };
    img.onerror = () => {
      console.warn('[creations] Failed to load edit image into studio canvas');
    };
    img.src = imageUrl;
  }

  async function loadStudioImageForEdit(creation) {
    const imageUrl = await resolveCreationEditImageUrl(creation);
    loadStudioImageFromUrl(imageUrl);
  }

  function applyEditImageLockUi() {
    if (!imageLockedForEdit) return;
    if (imageInput) imageInput.disabled = true;
    if (imageDropzone) {
      imageDropzone.classList.add('is-locked');
      imageDropzone.title = 'Creation image is locked after upload';
    }
    const trigger = document.getElementById('uploadTriggerBtn');
    if (trigger) {
      trigger.disabled = true;
      trigger.title = 'Creation image is locked after upload';
    }
    const emptyEl = document.getElementById('cuPreviewEmpty');
    if (emptyEl) {
      emptyEl.style.pointerEvents = 'none';
      emptyEl.title = 'Creation image is locked after upload';
    }
  }

  function refreshState() {
    if (typeof ESHU_DB !== 'undefined') {
      games = ESHU_DB.getTable('games') || [];
      creations = ESHU_DB.getTable('creations') || [];
      xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
      if (preselectedGameId === DEFAULT_GAME_ID || selectedGameId === DEFAULT_GAME_ID) {
        ensureDefaultOnboardingGame(ESHU_DB.getActiveProfileId());
      }
    } else if (typeof STATE !== 'undefined') {
      games = STATE.get('games') || [];
      creations = STATE.get('creations') || [];
    }
    syncUploadUnlockState();
  }

  function updateXPDisplay() {
    if (xpCounter) {
      xpCounter.textContent = `${xpPoints} XP +`;
    }
  }

  // ===== Game Dropdown =====
  function toggleGameDropdown() {
    if (gameDropdownMenu && gameDropdownMenu.classList.contains('open')) {
      closeGameDropdown();
    } else {
      openGameDropdown();
    }
  }

  function openGameDropdown() {
    if (hostGameLockedForEdit) return;
    if (gameDropdownTrigger) gameDropdownTrigger.classList.add('open');
    if (gameDropdownMenu) gameDropdownMenu.classList.add('open');
    if (gameSearchInput) {
      gameSearchInput.value = '';
      gameSearchInput.focus();
    }
    renderGameList();
  }

  function closeGameDropdown() {
    if (gameDropdownTrigger) gameDropdownTrigger.classList.remove('open');
    if (gameDropdownMenu) gameDropdownMenu.classList.remove('open');
  }

  function filterGameDropdown() {
    if (hostGameLockedForEdit) return;
    renderGameList(gameSearchInput ? gameSearchInput.value : '');
  }

  function renderGameList(searchQuery = '') {
    if (!gameDropdownList) return;
    const activeProfileId = getActiveProfileId();
    const query = String(searchQuery || '').trim().toLowerCase();

    let activeGames = games.filter(g => {
      if (typeof ESHU_DB !== 'undefined') {
        return ESHU_DB.isEntityActive(g) && canAccessGame(g, activeProfileId);
      }
      return g.status !== 'deleted' && g.status !== 'burned' && canAccessGame(g, activeProfileId);
    });

    if (query) {
      activeGames = activeGames.filter(g => String(g.name || '').toLowerCase().includes(query));
    }
    activeGames.sort((a, b) => {
      const aDefault = a.id === DEFAULT_GAME_ID;
      const bDefault = b.id === DEFAULT_GAME_ID;
      if (aDefault && !bDefault) return 1;
      if (!aDefault && bDefault) return -1;
      const aMine = a.ownerProfileId === activeProfileId || a.createdByProfileId === activeProfileId;
      const bMine = b.ownerProfileId === activeProfileId || b.createdByProfileId === activeProfileId;
      if (aMine && !bMine) return -1;
      if (!aMine && bMine) return 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (activeGames.length === 0) {
      gameDropdownList.innerHTML = '<div class="game-dropdown-empty">No games found</div>';
      return;
    }

    gameDropdownList.innerHTML = activeGames.map(g => `
      <div class="game-dropdown-item ${g.id === selectedGameId ? 'selected' : ''}" data-id="${g.id}" data-name="${g.name}">
        <div class="game-dropdown-icon"></div>
        <div class="game-dropdown-name">${g.name}</div>
        <div class="game-dropdown-check">✓</div>
      </div>
    `).join('');

    gameDropdownList.querySelectorAll('.game-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectGame(item.dataset.id, item.dataset.name);
      });
    });
  }

  function selectGame(gameId, gameName) {
    if (hostGameLockedForEdit) {
      if (typeof TOAST !== 'undefined') TOAST.error('Host game cannot be changed after upload.');
      return;
    }
    selectedGameId = gameId;

    if (gameDropdownValue) {
      gameDropdownValue.textContent = gameName;
      gameDropdownValue.classList.remove('placeholder');
    }

    if (gameDropdownList) {
      gameDropdownList.querySelectorAll('.game-dropdown-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.id === gameId);
      });
    }

    closeGameDropdown();
    updateUploadAccessUi();
  }

  function setGameDropdownValue(gameId, gameName) {
    selectedGameId = gameId;
    if (gameDropdownValue) {
      if (gameName) {
        gameDropdownValue.textContent = gameName;
        gameDropdownValue.classList.remove('placeholder');
      } else {
        gameDropdownValue.textContent = 'Select a game...';
        gameDropdownValue.classList.add('placeholder');
      }
    }
    updateUploadAccessUi();
  }

  function populateGamesDropdown() {
    renderGameList(gameSearchInput ? gameSearchInput.value : '');
  }

  // ===== Event Listeners =====
  function setupEventListeners() {
    if (gameDropdownTrigger) {
      gameDropdownTrigger.addEventListener('click', () => {
        if (hostGameLockedForEdit) return;
        toggleGameDropdown();
      });
    }

    if (gameSearchInput) {
      gameSearchInput.addEventListener('input', () => {
        if (hostGameLockedForEdit) return;
        filterGameDropdown();
      });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (gameDropdown && !gameDropdown.contains(e.target)) {
        closeGameDropdown();
      }
    });

    // Image dropzone click
    if (imageDropzone) {
      imageDropzone.addEventListener('click', () => {
        if (imageLockedForEdit) {
          if (typeof TOAST !== 'undefined') TOAST.error('Creation image cannot be changed after upload.');
          return;
        }
        imageInput.click();
      });
      
      // Drag and drop
      imageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageDropzone.style.borderColor = 'var(--accent-black)';
        imageDropzone.style.background = '#f0fff4';
      });
      
      imageDropzone.addEventListener('dragleave', () => {
        imageDropzone.style.borderColor = '#ccc';
        imageDropzone.style.background = '#fafafa';
      });
      
      imageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropzone.style.borderColor = '#ccc';
        imageDropzone.style.background = '#fafafa';

        if (imageLockedForEdit) {
          if (typeof TOAST !== 'undefined') TOAST.error('Creation image cannot be changed after upload.');
          return;
        }
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          handleImageFile(files[0]);
        }
      });
    }

    // Image input change
    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        if (imageLockedForEdit) return;
        if (e.target.files.length > 0) {
          handleImageFile(e.target.files[0]);
        }
      });
    }

    function exitCreationsPage() {
      // If we came from a game-front panel, re-open it explicitly.
      // history.back() would land on games.html without the gameId since
      // games.page.js clears the URL via replaceState after opening the panel.
      if (preselectedGameId) {
        const sourceGroupPart = sourceGroupId
          ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
          : '';
        window.location.href = `games.html?view=front&gameId=${encodeURIComponent(preselectedGameId)}${sourceGroupPart}`;
        return;
      }
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'home.html';
      }
    }

    // Back button
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        exitCreationsPage();
      });
    }

    if (backToStudioBtn) {
      backToStudioBtn.addEventListener('click', () => {
        exitCreationsPage();
      });
    }

    // Create button
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        handleCreate();
      });
    }

  }

  function setLoading(active, message) {
    if (loadingOverlay) {
      loadingOverlay.classList.toggle('active', !!active);
    }
    if (loadingMessage) {
      loadingMessage.textContent = message || 'Processing...';
    }
  }

  function setSubmitDisabled(disabled) {
    const baseDisabled = !!disabled || (!uploadUnlocked && !canUploadToSelectedOnboardingGame());
    if (createBtn) {
      if (!createBtn.dataset.originalText) createBtn.dataset.originalText = createBtn.textContent || 'CREATE';
      createBtn.disabled = baseDisabled;
      createBtn.textContent = disabled ? 'SAVING...' : createBtn.dataset.originalText;
    }
  }

  function isQuotaExceededError(error) {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    return error.name === 'QuotaExceededError' || message.includes('quota');
  }

  function openImageStoreDb() {
    if (!('indexedDB' in window)) {
      return Promise.reject(new Error('IndexedDB is not available in this browser'));
    }
    if (IMAGE_STORE.dbPromise) return IMAGE_STORE.dbPromise;

    IMAGE_STORE.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(IMAGE_STORE.DB_NAME, IMAGE_STORE.VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE.STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE.STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open media storage'));
    });

    return IMAGE_STORE.dbPromise;
  }

  async function saveImageBlob(blob, metadata) {
    const db = await openImageStoreDb();
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE.STORE_NAME, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE.STORE_NAME);
      store.put({
        id,
        blob,
        createdAt: Date.now(),
        ...metadata
      });

      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error || new Error('Failed to persist image blob'));
      tx.onabort = () => reject(tx.error || new Error('Image write transaction was aborted'));
    });
  }

  function loadImageFromObjectUrl(objectUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode selected image'));
      img.src = objectUrl;
    });
  }

  async function createThumbnailDataUrl(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImageFromObjectUrl(objectUrl);
      const maxSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
      const scale = maxSide > THUMBNAIL_MAX_SIDE ? THUMBNAIL_MAX_SIDE / maxSide : 1;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image canvas is unavailable');
      // High-quality downscaling for the inline preview.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      // PNG inputs keep PNG to avoid introducing JPEG artifacts in the inline
      // preview; everything else falls back to high-quality JPEG.
      if (file.type === 'image/png') {
        return canvas.toDataURL('image/png');
      }
      return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function processImageForStorage(file) {
    const thumbnailDataUrl = await createThumbnailDataUrl(file);
    let imageId = null;

    try {
      imageId = await saveImageBlob(file, {
        mimeType: file.type,
        size: file.size,
        name: file.name || 'upload'
      });
    } catch (err) {
      console.warn('IndexedDB image persistence unavailable, falling back to thumbnail-only storage:', err);
    }

    return {
      // Inline data URL is the fast-path/offline-fallback preview only. The
      // canonical full-resolution bytes live in `originalFile` (uploaded to
      // /api/assets at save time) and, as a secondary cache, in IndexedDB.
      previewDataUrl: thumbnailDataUrl,
      originalFile: file,
      imageRef: {
        storage: imageId ? 'indexeddb' : 'inline',
        id: imageId,
        mimeType: file.type,
        size: file.size,
        createdAt: Date.now()
      }
    };
  }

  // ===== Image Studio State =====
  const SWATCHES = [
    '#ffffff','#111111','#f5f5f5','#e0e0e0','#888888',
    '#e53935','#f57c00','#fdd835','#43a047','#1e88e5',
    '#8e24aa','#00acc1','#6d4c41','#fce4ec','#e3f2fd'
  ];

  const studio = {
    img: null,
    naturalW: 0, naturalH: 0,
    imageScale: 1,
    frameScale: 1,
    // mode kept for compatibility; studio now runs in preview-only flow
    mode: 'preview',
    // drag state (no pan; kept for future use)
    _drag: null,
    // border
    borderEnabled: false,
    borderWidth: 8,
    borderRadius: 0,
    borderColor: '#111111',
    // bg
    bgColor: '#ffffff'
  };

  const HANDLE_R  = 7;   // hit radius for corner handles
  const MIN_CROP  = 20;
  const BG_MARGIN = 24;  // fixed visible bg margin around image in preview mode (px, display space)
  const MIN_IMAGE_SCALE = 0.1;
  const MAX_IMAGE_SCALE = 4;
  const MIN_FRAME_SCALE = 0.1;
  const MAX_FRAME_SCALE = 2;

  function clampImageScale(scale) {
    return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, Number(scale) || 1));
  }

  function syncImageScaleUi() {
    const slider = document.getElementById('cuImageScale');
    const value = document.getElementById('cuImageScaleVal');
    const pct = Math.round(clampImageScale(studio.imageScale) * 100);
    if (slider) slider.value = String(pct);
    if (value) value.textContent = `${pct}%`;
  }

  function getCropImageRect(canvas) {
    const fitScale = Math.min(canvas.width / studio.naturalW, canvas.height / studio.naturalH);
    const totalScale = fitScale * (studio.imageScale || 1);
    const imgW = studio.naturalW * totalScale;
    const imgH = studio.naturalH * totalScale;
    const imgX = (canvas.width - imgW) / 2;
    const imgY = (canvas.height - imgH) / 2;
    return { fitScale, totalScale, imgW, imgH, imgX, imgY };
  }

  function studioInit() {
    // Accordion toggle
    document.querySelectorAll('.cu-tool-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const panel = document.getElementById(hdr.dataset.target);
        if (!panel) return;
        const open = panel.classList.toggle('open');
        hdr.classList.toggle('open', open);
      });
    });

    // "Choose Image" trigger
    const trigger = document.getElementById('uploadTriggerBtn');
    if (trigger) trigger.addEventListener('click', () => {
      if (imageLockedForEdit) {
        if (typeof TOAST !== 'undefined') TOAST.error('Creation image cannot be changed after upload.');
        return;
      }
      imageInput && imageInput.click();
    });

    // Empty state click
    const emptyEl = document.getElementById('cuPreviewEmpty');
    if (emptyEl) emptyEl.addEventListener('click', () => {
      if (imageLockedForEdit) {
        if (typeof TOAST !== 'undefined') TOAST.error('Creation image cannot be changed after upload.');
        return;
      }
      imageInput && imageInput.click();
    });

    // Output image size inside frame
    bindSlider('cuFrameScale', 'cuFrameScaleVal', v => {
      studio.frameScale = Math.max(MIN_FRAME_SCALE, Math.min(MAX_FRAME_SCALE, v / 100));
    }, v => `${v}%`);

    // Border enable toggle
    const borderCb = document.getElementById('cuBorderEnabled');
    if (borderCb) borderCb.addEventListener('change', () => {
      studio.borderEnabled = borderCb.checked;
      const ctrl = document.getElementById('cuBorderControls');
      if (ctrl) ctrl.classList.toggle('enabled', studio.borderEnabled);
      studioRedraw();
    });

    // Border thickness
    bindSlider('cuBorderWidth', 'cuBorderWidthVal', v => { studio.borderWidth = v; studioRedraw(); }, v => v + 'px');

    // Border radius
    bindSlider('cuBorderRadius', 'cuBorderRadiusVal', v => { studio.borderRadius = v; studioRedraw(); }, v => v + 'px');

    // Border color
    buildSwatches('cuBorderSwatches', 'cuBorderColorPicker', 'cuBorderColorHex', (c) => { studio.borderColor = c; studioRedraw(); }, studio.borderColor);
    bindColorPicker('cuBorderColorPicker', 'cuBorderColorHex', 'cuBorderSwatches', (c) => { studio.borderColor = c; studioRedraw(); });

    // Bg color
    buildSwatches('cuBgSwatches', 'cuBgColorPicker', 'cuBgColorHex', (c) => { studio.bgColor = c; studioRedraw(); }, studio.bgColor);
    bindColorPicker('cuBgColorPicker', 'cuBgColorHex', 'cuBgSwatches', (c) => { studio.bgColor = c; studioRedraw(); });

  }

  function bindSlider(sliderId, valId, setter, formatter) {
    const el = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseInt(el.value, 10);
      setter(v);
      if (valEl) valEl.textContent = formatter(v);
      studioRedraw();
    });
  }

  function buildSwatches(rowId, pickerId, hexId, onChange, current) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.innerHTML = '';
    SWATCHES.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'cu-swatch' + (color === current ? ' active' : '');
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        row.querySelectorAll('.cu-swatch').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const picker = document.getElementById(pickerId);
        const hex = document.getElementById(hexId);
        if (picker) picker.value = color;
        if (hex) hex.textContent = color;
        onChange(color);
      });
      row.appendChild(btn);
    });
  }

  function bindColorPicker(pickerId, hexId, rowId, onChange) {
    const picker = document.getElementById(pickerId);
    const hexEl  = document.getElementById(hexId);
    if (!picker) return;
    picker.addEventListener('input', () => {
      const c = picker.value;
      if (hexEl) hexEl.textContent = c;
      const row = document.getElementById(rowId);
      if (row) row.querySelectorAll('.cu-swatch').forEach(s => s.classList.remove('active'));
      onChange(c);
    });
  }

  // ── Canvas display helpers ──────────────────────────────────
  function getDisplayCanvas() { return document.getElementById('cuPreviewCanvas'); }
  function studioRedraw() {
    studioDraw(false);
    drawCardPreview();
  }

  function drawCardPreview() {
    const src = document.getElementById('cuPreviewCanvas');
    const dst = document.getElementById('cuCardPreviewCanvas');
    const wrap = document.getElementById('cuCardPreview');
    if (!src || !dst || !wrap || !studio.img) {
      if (wrap) wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    const ctx = dst.getContext('2d');
    const sw = src.width;
    const sh = src.height;
    // Square center-crop (object-fit: cover into 1:1)
    const size = Math.min(sw, sh);
    const sx = Math.round((sw - size) / 2);
    const sy = Math.round((sh - size) / 2);
    ctx.clearRect(0, 0, 80, 80);
    ctx.drawImage(src, sx, sy, size, size, 0, 0, 80, 80);
  }

  // Map a mouse event to canvas-local coordinates
  function canvasLocalPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width  / rect.width),
      y: (src.clientY - rect.top)  * (canvas.height / rect.height)
    };
  }

  // Corner handles for the crop box
  function cropHandles() {
    const { x, y, w, h } = studio.crop;
    return [
      { id: 'nw', cx: x,     cy: y     },
      { id: 'ne', cx: x + w, cy: y     },
      { id: 'sw', cx: x,     cy: y + h },
      { id: 'se', cx: x + w, cy: y + h },
    ];
  }

  function hitHandle(pos) {
    return cropHandles().find(h =>
      Math.abs(pos.x - h.cx) <= HANDLE_R + 2 &&
      Math.abs(pos.y - h.cy) <= HANDLE_R + 2
    ) || null;
  }

  function inCropBox(pos) {
    const { x, y, w, h } = studio.crop;
    return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
  }

  function clampCrop() {
    const c = studio.crop;
    const canvas = getDisplayCanvas();
    if (!canvas) return;
    c.w = Math.max(MIN_CROP, Math.min(c.w, canvas.width));
    c.h = Math.max(MIN_CROP, Math.min(c.h, canvas.height));
    c.x = Math.max(0, Math.min(c.x, canvas.width  - c.w));
    c.y = Math.max(0, Math.min(c.y, canvas.height - c.h));
  }

  function resetCropBox() {
    const canvas = getDisplayCanvas();
    if (!canvas || !studio.img) return;
    const rw = studio.ratioW, rh = studio.ratioH;
    if (rw === 0 || rh === 0) {
      studio.crop = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    } else {
      const ratio = rw / rh;
      let cw = canvas.width, ch = Math.round(cw / ratio);
      if (ch > canvas.height) { ch = canvas.height; cw = Math.round(ch * ratio); }
      studio.crop = {
        x: Math.round((canvas.width  - cw) / 2),
        y: Math.round((canvas.height - ch) / 2),
        w: cw, h: ch
      };
    }
  }

  // ── Canvas interaction ───────────────────────────────────────
  function bindCropInteraction() {
    const stage = document.getElementById('cuPreviewStage');
    if (!stage) return;

    function onWheel(e) {
      const canvas = getDisplayCanvas();
      if (!canvas || !studio.img) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      const step = e.shiftKey ? 0.2 : 0.1;
      const targetScale = (studio.frameScale || 1) + direction * step;
      const nextScale = Math.max(MIN_FRAME_SCALE, Math.min(MAX_FRAME_SCALE, targetScale));
      if (Math.abs(nextScale - (studio.frameScale || 1)) < 0.0001) return;
      studio.frameScale = nextScale;
      const frameSlider = document.getElementById('cuFrameScale');
      const frameVal = document.getElementById('cuFrameScaleVal');
      const pct = Math.round(nextScale * 100);
      if (frameSlider) frameSlider.value = String(pct);
      if (frameVal) frameVal.textContent = `${pct}%`;
      studioRedraw();
    }

    stage.addEventListener('wheel', onWheel, { passive: false });
  }

  // ── Draw ─────────────────────────────────────────────────────
  // cropActive: true = show crop overlay/handles; false = show border+bg preview
  function studioDraw(cropActive) {
    const canvas = getDisplayCanvas();
    if (!canvas || !studio.img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (cropActive !== false) {
      // ── CROP MODE: draw image + dim overlay + handles ──
      const rect = getCropImageRect(canvas);
      const imgW = rect.imgW;
      const imgH = rect.imgH;
      const imgX = rect.imgX;
      const imgY = rect.imgY;

      // Background color fills canvas (same as final output)
      ctx.fillStyle = studio.bgColor || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(studio.img, imgX, imgY, imgW, imgH);

      // Dim outside crop
      const { x, y, w, h } = studio.crop;
      ctx.fillStyle = 'rgba(0,0,0,0.50)';
      ctx.fillRect(0,     0,            canvas.width, y);
      ctx.fillRect(0,     y + h,        canvas.width, canvas.height - y - h);
      ctx.fillRect(0,     y,            x,            h);
      ctx.fillRect(x + w, y,            canvas.width - x - w, h);

      // Crop border line
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

      // Rule-of-thirds
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 2; i++) {
        const lx = x + (w / 3) * i;
        const ly = y + (h / 3) * i;
        ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
      }

      // Corner handles
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      cropHandles().forEach(hnd => {
        ctx.beginPath();
        ctx.rect(hnd.cx - HANDLE_R, hnd.cy - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
        ctx.fill();
        ctx.stroke();
      });

    } else {
      // ── PREVIEW MODE: canvas stays at fixed max size, image scales inside it ──
      const stage = document.getElementById('cuPreviewStage');
      const stageMaxW  = stage ? stage.clientWidth  - 24 : 640;
      const stageMaxH  = stage ? stage.clientHeight - 24 : 480;

      // Canvas always uses max available space - never changes size
      const canvasW = stageMaxW;
      const canvasH = stageMaxH;

      canvas.width  = canvasW;
      canvas.height = canvasH;

      // 1. Background color fills the whole canvas
      ctx.fillStyle = studio.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Calculate image size based on frameScale - image scales within the fixed canvas
      // Base size is the natural image size fitted to canvas
      const baseScale = Math.min(canvasW / studio.naturalW, canvasH / studio.naturalH, 1);
      const frameScale = Math.max(MIN_FRAME_SCALE, Math.min(MAX_FRAME_SCALE, studio.frameScale || 1));

      // Image dimensions based on frameScale
      const dispImgW = Math.round(studio.naturalW * baseScale * frameScale);
      const dispImgH = Math.round(studio.naturalH * baseScale * frameScale);
      const imgX = Math.round((canvasW - dispImgW) / 2);
      const imgY = Math.round((canvasH - dispImgH) / 2);

      // Scale bw/br relative to displayed image size so proportions match the export exactly
      const bw = studio.borderEnabled ? Math.round(studio.borderWidth * baseScale * frameScale) : 0;
      const br = Math.round(Math.max(0, studio.borderRadius || 0) * baseScale * frameScale);

      // 3. Border drawn outward from the image rect (behind image)
      if (bw > 0) {
        const bx = imgX - bw;
        const by = imgY - bw;
        const bW = dispImgW + 2 * bw;
        const bH = dispImgH + 2 * bw;
        ctx.fillStyle = studio.borderColor;
        if (br > 0) {
          ctx.beginPath();
          ctx.roundRect(bx, by, bW, bH, br + bw);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, bW, bH);
        }
      }

      // 4. Image (clipped to border radius when set)
      if (br > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, dispImgW, dispImgH, br);
        ctx.clip();
        ctx.drawImage(studio.img, imgX, imgY, dispImgW, dispImgH);
        ctx.restore();
      } else {
        ctx.drawImage(studio.img, imgX, imgY, dispImgW, dispImgH);
      }
    }
  }

  // ===== Handle Image File =====
  async function handleImageFile(file) {
    if (imageLockedForEdit) {
      if (typeof TOAST !== 'undefined') TOAST.error('Creation image cannot be changed after upload.');
      return;
    }

    if (!file || !file.type || !SUPPORTED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      if (typeof TOAST !== 'undefined') TOAST.error('Unsupported format. Use JPG, PNG, WEBP, or GIF');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        studio.img = img;
        studio.naturalW = img.naturalWidth;
        studio.naturalH = img.naturalHeight;
        studio.frameScale = 1;
        studio.imageOffsetX = 0;
        studio.imageOffsetY = 0;

        const frameSlider = document.getElementById('cuFrameScale');
        const frameVal = document.getElementById('cuFrameScaleVal');
        if (frameSlider) frameSlider.value = '100';
        if (frameVal) frameVal.textContent = '100%';

        // Size canvas to fit the stage container
        const stage = document.getElementById('cuPreviewStage');
        const maxW = stage ? (stage.clientWidth  - 24) : 640;
        const maxH = stage ? (stage.clientHeight - 24) : 480;
        const scale = Math.min(maxW / studio.naturalW, maxH / studio.naturalH, 1);
        const canvas = getDisplayCanvas();
        if (canvas) {
          canvas.width  = Math.round(studio.naturalW * scale);
          canvas.height = Math.round(studio.naturalH * scale);
        }

        studio.mode = 'preview';
        studioRedraw();

        if (canvas) canvas.classList.remove('hidden');
        const emptyEl = document.getElementById('cuPreviewEmpty');
        if (emptyEl) emptyEl.style.display = 'none';

        if (typeof TOAST !== 'undefined') TOAST.success('Image loaded — use transform, border, and background controls');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Export: bg color fills the full output canvas, image centered on top.
  // The output uses the image's own aspect ratio expanded to 1200px longest side,
  // so the bg color IS the empty space — visible in all viewers that use object-fit:contain.
  async function exportStudioImage() {
    if (!studio.img) return null;

    // Scale to max 1200px on longest side — this is the fixed frame size regardless of frameScale
    const MAX = 1200;
    const baseScale = Math.min(MAX / studio.naturalW, MAX / studio.naturalH, 1);
    const frameScale = Math.max(MIN_FRAME_SCALE, Math.min(MAX_FRAME_SCALE, studio.frameScale || 1));

    // Scale bw/br relative to the drawn image size (baseScale * frameScale),
    // matching the preview which uses fitScale * frameScale as its reference
    const bw = studio.borderEnabled ? Math.round(studio.borderWidth * baseScale * frameScale) : 0;
    const br = Math.round(Math.max(0, studio.borderRadius || 0) * baseScale * frameScale);

    // The output canvas is always the full base frame + border ring.
    // frameScale only affects how large the image is drawn INSIDE that canvas,
    // with bgColor filling the remainder — identical to what the preview shows.
    const frameW = Math.round(studio.naturalW * baseScale);
    const frameH = Math.round(studio.naturalH * baseScale);
    const imgW   = Math.round(frameW * frameScale);
    const imgH   = Math.round(frameH * frameScale);

    // Output canvas = full frame (bg fills the space around the image)
    const out = document.createElement('canvas');
    out.width  = frameW;
    out.height = frameH;
    const octx = out.getContext('2d');

    // 1. Background fills the whole canvas
    octx.fillStyle = studio.bgColor;
    octx.fillRect(0, 0, out.width, out.height);

    // Image is centered inside the frame
    const imgX = Math.round((frameW - imgW) / 2);
    const imgY = Math.round((frameH - imgH) / 2);

    // 2. Border drawn tightly around the image rect (outward from image edges)
    if (bw > 0) {
      const bx = imgX - bw;
      const by = imgY - bw;
      const bW = imgW + 2 * bw;
      const bH = imgH + 2 * bw;
      octx.fillStyle = studio.borderColor;
      if (br > 0) {
        octx.beginPath();
        octx.roundRect(bx, by, bW, bH, br + bw);
        octx.fill();
      } else {
        octx.fillRect(bx, by, bW, bH);
      }
    }

    // 3. Draw image (clipped to radius when set)
    if (br > 0) {
      octx.save();
      octx.beginPath();
      octx.roundRect(imgX, imgY, imgW, imgH, br);
      octx.clip();
      octx.drawImage(studio.img, imgX, imgY, imgW, imgH);
      octx.restore();
    } else {
      octx.drawImage(studio.img, imgX, imgY, imgW, imgH);
    }

    return new Promise(resolve => {
      out.toBlob(blob => {
        if (!blob) { resolve(null); return; }
        resolve(new File([blob], 'creation.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.92);
    });
  }

  // ===== Handle Create =====
  async function handleCreate() {
    if (isSubmitting) return;

    if (!editingCreation && !uploadUnlocked && !canUploadToSelectedOnboardingGame()) {
      if (typeof TOAST !== 'undefined') {
        TOAST.error('You need more XP to unlock this feature. You need at least 2 XP to Upload a Creation.');
      }
      return;
    }

    if (editCreationId && !editingCreation) {
      if (typeof TOAST !== 'undefined') TOAST.error('This creation could not be loaded for editing.');
      return;
    }

    const title = document.getElementById('creationTitle')?.value?.trim();
    const description = document.getElementById('creationDesc')?.value?.trim();
    const devices = document.getElementById('creationDevices')?.value?.trim();
    const tags = document.getElementById('creationTags')?.value?.trim();
    const location = document.getElementById('creationLocation')?.value?.trim();
    const dateMade = document.getElementById('creationDate')?.value;
    const hostGameId = selectedGameId;
    const privacy = document.querySelector('input[name="privacy"]:checked')?.value || 'public';

    // Validation
    if (!title) {
      if (typeof TOAST !== 'undefined') {
        TOAST.error('Please enter a title');
      }
      return;
    }

    if (!hostGameId) {
      if (typeof TOAST !== 'undefined') {
        TOAST.error('Please select a host game');
      }
      return;
    }

    // Check if submissions are still open for the selected game (skip in edit mode)
    if (!editingCreation) {
      const targetGameForCheck = (games || []).find(g => g.id === hostGameId);
      if (targetGameForCheck) {
        const now = Date.now();
        if (targetGameForCheck.endTime && now >= targetGameForCheck.endTime) {
          if (typeof TOAST !== 'undefined') TOAST.error('This game has ended. Submissions are no longer accepted.');
          return;
        }
        if (targetGameForCheck.submissionCloseTime && now >= targetGameForCheck.submissionCloseTime) {
          if (typeof TOAST !== 'undefined') TOAST.error('Submissions for this game have closed.');
          return;
        }
      }
    }

    // Export studio canvas if image is loaded (both create and edit mode)
    if (studio.img) {
      const exportedFile = await exportStudioImage();
      if (exportedFile) {
        setLoading(true, 'Processing image...');
        try {
          uploadedImage = await processImageForStorage(exportedFile);
        } catch (err) {
          console.error('Image export failed:', err);
          if (typeof TOAST !== 'undefined') TOAST.error('Image processing failed. Try again.');
          return;
        } finally {
          setLoading(false);
        }
      }
    }

    isSubmitting = true;
    setLoading(true, 'Saving creation...');
    setSubmitDisabled(true);

    const activeProfile = getActiveProfile();
    const activeProfileId = activeProfile?.id || ESHU_DB.getValue('currentProfileId') || null;
    const activeProfileName = activeProfile?.name || ESHU_DB.getValue('profileName') || 'Player';
    const targetGame = (games || []).find(g => g.id === hostGameId) ||
      (hostGameId === DEFAULT_GAME_ID ? ensureDefaultOnboardingGame(activeProfileId) : null);

    if (!targetGame) {
      setLoading(false);
      setSubmitDisabled(false);
      isSubmitting = false;
      TOAST.error('Selected game was not found');
      return;
    }

    if (!canAccessGame(targetGame, activeProfileId)) {
      setLoading(false);
      setSubmitDisabled(false);
      isSubmitting = false;
      TOAST.error('You cannot upload to this private game');
      return;
    }

    // Upload the canonical image bytes to /api/assets BEFORE writing the
    // creation row. Resolving `imageAssetId` server-side is what unlocks
    // the SU / versus mechanic — every other player's browser hydrates
    // the image via `/api/assets/<id>/raw`, not via the originator's
    // IndexedDB. The inline `image` / `imageRef` stay as fast-path local
    // caches and survive transient upload failures.
    let imageAssetId;
    // Prefer uploading the ORIGINAL file blob so /api/assets stores the full
    // resolution + original encoding (PNG stays PNG, no JPEG re-compression).
    // Every other player hydrates the image via /api/assets/<id>/raw, so this
    // is what controls server-side perceived quality. The inline data URL
    // path remains as a fallback for legacy flows / edit mode where only the
    // preview is available.
    const originalFile = uploadedImage && uploadedImage.originalFile;
    const freshDataUrl = uploadedImage && uploadedImage.previewDataUrl;
    let reusedExistingAsset = false;
    if (window.ESHU_ASSETS && originalFile instanceof Blob) {
      try {
        const filename = (originalFile && originalFile.name) || 'creation';
        const uploaded = await window.ESHU_ASSETS.uploadBlob(originalFile, filename);
        if (uploaded && uploaded.assetId) {
          imageAssetId = uploaded.assetId;
          reusedExistingAsset = !!uploaded.deduped;
        }
      } catch (err) {
        console.warn('[creations.save] full-resolution upload failed; falling back to inline data URL:', err);
      }
    }
    if (!imageAssetId && typeof freshDataUrl === 'string' && freshDataUrl.startsWith('data:') && window.ESHU_ASSETS) {
      try {
        const uploaded = await window.ESHU_ASSETS.uploadDataUrl(freshDataUrl, 'creation.png');
        if (uploaded && uploaded.assetId) {
          imageAssetId = uploaded.assetId;
          reusedExistingAsset = !!uploaded.deduped;
        }
      } catch (err) {
        console.warn('[creations.save] inline preview upload failed:', err);
      }
    }
    if (reusedExistingAsset && typeof TOAST !== 'undefined') {
      TOAST.info('Image was already uploaded, so ESHU reused the existing file.');
    }

    try {
      if (editingCreation) {
        // --- Edit mode: update existing creation ---
        const existingCreation = editingCreation;
        const updatedCreation = {
              ...existingCreation,
              title: title,
              name: title,
              description: description,
              devices: devices,
              tags: tags,
              location: location,
              dateMade: dateMade,
              hostGameId: existingCreation.hostGameId || existingCreation.gameId || hostGameId,
              gameId: existingCreation.gameId || existingCreation.hostGameId || hostGameId,
              image: uploadedImage?.previewDataUrl || existingCreation.image,
              imageRef: uploadedImage?.imageRef || existingCreation.imageRef,
              imageAssetId: imageAssetId || existingCreation.imageAssetId || null,
              // Image metadata for drawing system
              naturalWidth: studio.img ? studio.naturalW : (existingCreation.naturalWidth || null),
              naturalHeight: studio.img ? studio.naturalH : (existingCreation.naturalHeight || null),
              bgColor: studio.bgColor || existingCreation.bgColor || null,
              border: existingCreation.border || null,
              privacy: privacy,
              updatedAt: Date.now()
            };
        let savedCreation = updatedCreation;
        if (window.ESHU_SYNC && ESHU_SYNC.isRemote && ESHU_SYNC.isRemote()) {
          savedCreation = await ESHU_SYNC.mutate({
            entity: 'creations',
            call: () => ESHU_API.creations.update(editingCreation.id, {
              name: title,
              description,
              devices,
              tags,
              dateMade,
              hostGameId: updatedCreation.hostGameId,
              ...(imageAssetId !== undefined ? { imageAssetId } : {}),
              data: {
                image: updatedCreation.image,
                imageRef: updatedCreation.imageRef,
                naturalWidth: updatedCreation.naturalWidth,
                naturalHeight: updatedCreation.naturalHeight,
                bgColor: updatedCreation.bgColor,
                border: updatedCreation.border,
                privacy,
                gameId: updatedCreation.gameId,
                title,
                location,
              },
            }),
            pick: (resp) => resp && resp.creation,
            refresh: true,
          }) || updatedCreation;
        } else {
          ESHU_DB.updateTable('creations', (currentCreations) => {
            return currentCreations.map(c => c.id === editingCreation.id ? updatedCreation : c);
          });
        }

        updateXPDisplay();
        updateUploadAccessUi();

        if (typeof TOAST !== 'undefined') {
          TOAST.success('Creation updated successfully!');
        }

        setTimeout(() => {
          window.history.back();
        }, 1000);
      } else {
        // --- Create mode: new creation ---
        const newCreation = {
          id: generateId(),
          title: title,
          name: title,
          description: description,
          devices: devices,
          tags: tags,
          location: location,
          dateMade: dateMade,
          hostGameId: hostGameId,
          gameId: hostGameId,
          image: uploadedImage?.previewDataUrl || null,
          imageRef: uploadedImage?.imageRef || null,
          imageAssetId: imageAssetId || null,
          // Image metadata for drawing system (stores original dimensions and processing)
          naturalWidth: studio.img ? studio.naturalW : null,
          naturalHeight: studio.img ? studio.naturalH : null,
          bgColor: studio.img ? studio.bgColor : null,
          border: studio.img && studio.borderEnabled ? {
            width: studio.borderWidth,
            color: studio.borderColor
          } : null,
          privacy: privacy,
          status: 'active',
          votes: 0,
          burns: 0,
          author: activeProfileName,
          authorName: activeProfileName,
          authorId: activeProfileId || 'current-user',
          authorProfileId: activeProfileId,
          ownerProfileId: activeProfileId,
          createdByProfileId: activeProfileId,
          createdAt: Date.now(),
          timestamp: Date.now()
        };

        let savedCreation = newCreation;
        if (window.ESHU_SYNC && ESHU_SYNC.isRemote && ESHU_SYNC.isRemote()) {
          savedCreation = await ESHU_SYNC.mutate({
            entity: 'creations',
            call: () => ESHU_API.creations.create({
              name: newCreation.name,
              description: newCreation.description,
              devices: newCreation.devices,
              tags: newCreation.tags,
              dateMade: newCreation.dateMade,
              hostGameId: newCreation.hostGameId,
              imageAssetId: newCreation.imageAssetId,
              status: newCreation.status,
              timestamp: newCreation.timestamp,
              data: {
                title: newCreation.title,
                gameId: newCreation.gameId,
                image: newCreation.image,
                imageRef: newCreation.imageRef,
                naturalWidth: newCreation.naturalWidth,
                naturalHeight: newCreation.naturalHeight,
                bgColor: newCreation.bgColor,
                border: newCreation.border,
                privacy: newCreation.privacy,
                votes: newCreation.votes,
                burns: newCreation.burns,
                author: newCreation.author,
                authorName: newCreation.authorName,
                authorId: newCreation.authorId,
                authorProfileId: newCreation.authorProfileId,
                createdByProfileId: newCreation.createdByProfileId,
                location: newCreation.location
              }
            }),
            pick: (resp) => {
              const serverCreation = resp && resp.creation ? resp.creation : resp;
              return { ...newCreation, ...serverCreation };
            },
            refresh: true
          }) || newCreation;
        } else if (typeof ESHU_DB !== 'undefined') {
          ESHU_DB.updateTable('creations', (currentCreations) => [newCreation, ...currentCreations]);
        } else if (typeof STATE !== 'undefined') {
          const currentCreations = STATE.get('creations') || [];
          STATE.set('creations', [newCreation, ...currentCreations]);
        }

        const xpBeforeUpload = parseInt(xpPoints || 0, 10);
        let awardResult = null;
        try {
          if (ESHU_API && ESHU_API.xp && typeof ESHU_API.xp.awardSafe === 'function') {
            awardResult = await ESHU_API.xp.awardSafe('creation_uploaded', savedCreation.id);
          }
        } catch (err) {
          console.warn('[creations.save] XP award failed:', err);
        }

        const awardedDelta = Number(awardResult && awardResult.delta) || 0;
        xpPoints = Number.isFinite(Number(awardResult && awardResult.xpPoints))
          ? Number(awardResult.xpPoints)
          : xpBeforeUpload + awardedDelta;
        if (window.XP_ANIM && awardedDelta > 0) XP_ANIM.show(awardedDelta);
        if (window.ESHU_RUNTIME && typeof window.ESHU_RUNTIME.applyHudXp === 'function') {
          window.ESHU_RUNTIME.applyHudXp(xpPoints, { force: true });
        }
        if (xpPoints >= CREATION_UPLOAD_UNLOCK_XP) {
          writeUploadUnlockFlag(true);
          uploadUnlocked = true;
        }

        updateXPDisplay();
        updateUploadAccessUi();

        if (typeof TOAST !== 'undefined') {
          const unlockedComments = xpBeforeUpload < 3 && xpPoints >= 3;
          TOAST.success(unlockedComments
            ? 'Creation uploaded. Comments are now unlocked!'
            : 'Creation uploaded successfully!');
        }
        const resolvedSourceGroupId = sourceGroupId || targetGame.hostGroupId || '';
        const sourceGroupPart = resolvedSourceGroupId
          ? `&sourceGroupId=${encodeURIComponent(resolvedSourceGroupId)}`
          : '';
        const returnToGameFront = () => {
          window.location.href = `games.html?view=front&gameId=${encodeURIComponent(hostGameId)}${sourceGroupPart}`;
        };
        await new Promise((resolve) => {
          runHype('RIGHT ON!', () => {
            returnToGameFront();
            resolve();
          }, 1500);
        });
      }
    } catch (err) {
      console.error('Create upload failed:', err);
      if (typeof TOAST !== 'undefined') {
        if (isQuotaExceededError(err)) {
          TOAST.error('Local storage is full. Try removing older creations or smaller images.');
        } else {
          TOAST.error('Upload failed. Please try again.');
        }
      }
    } finally {
      setLoading(false);
      setSubmitDisabled(false);
      isSubmitting = false;
    }
  }

  // ===== Generate ID =====
  function generateId() {
    if (typeof ESHU_DB !== 'undefined') {
      return ESHU_DB.newId('creation');
    }
    return 'creation-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // ===== Reset Form =====
  function resetForm() {
    if (form) form.reset();
    uploadedImage = null;
    if (imageInput) imageInput.value = '';
    if (previewImage) {
      previewImage.src = '';
      previewImage.style.display = 'none';
    }
    if (imageDropzone) {
      imageDropzone.classList.remove('has-image');
    }
    
    // Reset date to today
    const dateInput = document.getElementById('creationDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Keep preselected game if any, otherwise reset dropdown
    if (preselectedGameId) {
      const preGame = games.find(g => g.id === preselectedGameId) ||
        (preselectedGameId === DEFAULT_GAME_ID ? ensureDefaultOnboardingGame(getActiveProfileId()) : null);
      if (preGame) {
        setGameDropdownValue(preselectedGameId, preGame.name);
      } else if (preselectedGameId === DEFAULT_GAME_ID) {
        setGameDropdownValue(preselectedGameId, 'Default Game');
      } else {
        setGameDropdownValue(null, null);
      }
    } else {
      setGameDropdownValue(null, null);
    }
  }

  // ===== Subscribe to State Changes =====
  if (typeof ESHU_DB !== 'undefined') {
    ESHU_DB.subscribe(() => {
      refreshState();
      populateGamesDropdown();
      updateXPDisplay();
      updateUploadAccessUi();
    });
  } else if (typeof STATE !== 'undefined') {
    STATE.subscribe(() => {
      refreshState();
      populateGamesDropdown();
      updateUploadAccessUi();
    });
  }

  // ===== Start =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
