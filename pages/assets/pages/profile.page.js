(function () {
  'use strict';

  const profileName = document.getElementById('profileName');
  const profileDesc = document.getElementById('profileDesc');
  const profileImagePreview = document.getElementById('profileImagePreview');
  const profileAvatarCircle = document.getElementById('profileAvatarCircle');
  const changeProfileImageBtn = document.getElementById('changeProfileImageBtn');
  const removeProfileImageBtn = document.getElementById('removeProfileImageBtn');
  const profileImageInput = document.getElementById('profileImageInput');
  const saveBtn = document.getElementById('saveProfileBtn');
  const deleteProfileBtn = document.getElementById('deleteProfileBtn');
  const burnBtn = document.getElementById('burnBtn');
  const xpCounter = document.getElementById('xpCounter');

  const profileNameNav = document.getElementById('profileNameNav');
  const profileBtnNav = document.getElementById('profileBtn');
  const PROFILE_IMAGE_MAX_SIDE = 512;
  const PROFILE_IMAGE_QUALITY = 0.82;
  const DEFAULT_GROUP_ID = 'group_default';
  const SUPPORTED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const EXPORT_PASSWORD_SHA256 = 'c2d363c54df21d3d3da733ed5f5935fa355d501a638d5e289a82c29c4d4ad49b';
  const runtime = window.ESHU_RUNTIME;
  let selectedProfileImage = null;

  // Load profile and XP
  ESHU_DB.ensure();

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  async function sha256Hex(value) {
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) {
      throw new Error('Secure hashing is not supported in this browser context.');
    }
    const encoded = new TextEncoder().encode(String(value || ''));
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function ensureDefaultProfile() {
    const profiles = getProfiles();
    if (profiles.length > 0) return;

    const now = Date.now();
    const defaultProfile = {
      id: 'profile_' + now,
      name: ESHU_DB.getValue('profileName') || 'Player',
      description: ESHU_DB.getValue('profileDesc') || '',
      image: null,
      createdAt: now,
      updatedAt: now,
      isActive: true
    };

    ESHU_DB.setTable('profiles', [defaultProfile]);
    ESHU_DB.setValue('currentProfileId', defaultProfile.id);
  }

  function ensureDefaultGroupExists() {
    const groups = ESHU_DB.getTable('groups') || [];
    if (groups.some(group => group && group.id === DEFAULT_GROUP_ID)) return;

    const defaultGroup = {
      id: DEFAULT_GROUP_ID,
      name: 'GROUP',
      description: 'Default Group',
      type: 'social',
      privacy: 'public',
      image: null,
      members: 0,
      memberProfileIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ownerProfileId: null,
      createdByProfileId: null,
      isSystemDefault: true,
      status: 'active'
    };

    ESHU_DB.setTable('groups', [defaultGroup, ...groups]);
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

  function itemBelongsToProfile(item, profileId) {
    if (!profileId || !item || typeof item !== 'object') return false;
    const ownerId = item.ownerProfileId || item.createdByProfileId || item.authorProfileId || item.authorId || null;
    if (!ownerId) return false;
    return ownerId === profileId;
  }

  function groupBelongsToProfile(group, profileId) {
    if (!profileId || !group || typeof group !== 'object') return false;
    if (itemBelongsToProfile(group, profileId)) return true;
    const members = Array.isArray(group.memberProfileIds) ? group.memberProfileIds : [];
    if (group.ownerProfileId && !members.includes(group.ownerProfileId)) {
      members.push(group.ownerProfileId);
    }
    return members.includes(profileId);
  }

  function gameBelongsToProfile(game, profileId, groups, creations) {
    if (!profileId || !game || typeof game !== 'object') return false;
    if (itemBelongsToProfile(game, profileId)) return true;
    const members = Array.isArray(game.memberProfileIds) ? game.memberProfileIds : [];
    if (game.ownerProfileId && !members.includes(game.ownerProfileId)) {
      members.push(game.ownerProfileId);
    }
    if (members.includes(profileId)) return true;
    const hasProfileCreation = (creations || []).some(creation => {
      if (!itemBelongsToProfile(creation, profileId)) return false;
      const hostGameId = creation?.hostGameId || creation?.gameId || null;
      return hostGameId === game.id;
    });
    if (hasProfileCreation) return true;
    if (!game.hostGroupId) return false;
    const hostGroup = (groups || []).find(g => g.id === game.hostGroupId);
    return groupBelongsToProfile(hostGroup, profileId);
  }

  function renderProfileImagePreview(imageSrc) {
    const target = profileAvatarCircle || profileImagePreview;
    if (!target) return;
    if (!imageSrc) {
      target.textContent = 'No image';
      return;
    }
    target.innerHTML = `<img src="${imageSrc}" alt="Profile picture">`;
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode selected image'));
      img.src = dataUrl;
    });
  }

  async function optimizeProfileImage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(new Error('Could not read selected image'));
      reader.readAsDataURL(file);
    });

    if (!dataUrl) throw new Error('Image data was empty');

    const image = await loadImageFromDataUrl(dataUrl);
    const maxSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
    const scale = maxSide > PROFILE_IMAGE_MAX_SIDE ? PROFILE_IMAGE_MAX_SIDE / maxSide : 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image canvas is unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', PROFILE_IMAGE_QUALITY);
  }

  async function handleProfileImageFile(file) {
    if (!file) return;
    if (!SUPPORTED_PROFILE_IMAGE_TYPES.includes(file.type)) {
      MODAL.alert({ title: 'Unsupported Type', message: 'Unsupported image type. Please use JPG, PNG, WEBP, or GIF.' });
      return;
    }
    try {
      selectedProfileImage = await optimizeProfileImage(file);
      renderProfileImagePreview(selectedProfileImage);
    } catch (err) {
      console.error('Profile image processing failed:', err);
      MODAL.alert({ title: 'Error', message: 'Could not process this image. Please try another file.' });
    }
  }

  function loadFormFromActiveProfile() {
    const active = getActiveProfile();
    profileName.value = active?.name || ESHU_DB.getValue('profileName') || '';
    profileDesc.value = active?.description || ESHU_DB.getValue('profileDesc') || '';
    selectedProfileImage = active?.image || null;
    renderProfileImagePreview(selectedProfileImage);
    const headerName = document.getElementById('profileHeaderName');
    if (headerName) headerName.textContent = active?.name || 'Profile';
  }

  function imageFromProfile(profile) {
    const dataImage = profile?.data && typeof profile.data === 'object' && typeof profile.data.image === 'string'
      ? profile.data.image
      : null;
    if (dataImage) return dataImage;
    if (profile?.avatarAssetId && window.ESHU_ASSETS && typeof window.ESHU_ASSETS.urlFor === 'function') {
      return window.ESHU_ASSETS.urlFor(profile.avatarAssetId);
    }
    return profile?.image || null;
  }

  function applyProfileToForm(profile) {
    if (!profile) return;
    const image = imageFromProfile(profile);
    profileName.value = profile.name || 'Player';
    profileDesc.value = profile.description || '';
    selectedProfileImage = image;
    renderProfileImagePreview(image);

    const localProfile = {
      ...profile,
      image,
      description: profile.description || '',
      updatedAt: profile.updatedAt ? Date.parse(profile.updatedAt) || Date.now() : Date.now(),
      isActive: true
    };
    ESHU_DB.setTable('profiles', [localProfile]);
    ESHU_DB.setValue('currentProfileId', profile.id);
    syncLegacyProfileValues(localProfile);
    updateNavProfile();

    const headerName = document.getElementById('profileHeaderName');
    if (headerName) headerName.textContent = profile.name || 'Profile';
  }

  async function hydrateFormFromServerProfile() {
    if (!window.ESHU_API || !window.ESHU_API.profiles) return null;
    try {
      const resp = await window.ESHU_API.profiles.list();
      const list = (resp && (resp.profiles || resp)) || [];
      const profile = Array.isArray(list)
        ? (list.find((p) => p && p.id === resp.currentProfileId) || list[0])
        : null;
      if (profile) applyProfileToForm(profile);
      return profile || null;
    } catch (err) {
      console.warn('[profile] could not hydrate server profile:', err);
      return null;
    }
  }

  ensureDefaultProfile();
  loadFormFromActiveProfile();
  hydrateFormFromServerProfile().catch(() => {});
  if (saveBtn) {
    saveBtn.textContent = 'Save Player';
  }
  if (deleteProfileBtn) {
    deleteProfileBtn.style.display = 'none';
  }

  if (changeProfileImageBtn && profileImageInput) {
    changeProfileImageBtn.addEventListener('click', () => profileImageInput.click());
  }
  if (profileImagePreview && profileImageInput) {
    profileImagePreview.addEventListener('click', () => profileImageInput.click());
  }
  if (removeProfileImageBtn) {
    removeProfileImageBtn.addEventListener('click', () => {
      selectedProfileImage = null;
      renderProfileImagePreview(null);
      if (profileImageInput) profileImageInput.value = '';
    });
  }
  if (profileImageInput) {
    profileImageInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Read failed'));
            reader.readAsDataURL(file);
          });
          openCropOverlay(dataUrl);
        } catch (err) {
          console.error('Profile image read failed:', err);
        }
      }
      profileImageInput.value = '';
    });
  }

  // === Crop / Pan / Zoom overlay ===
  const cropOverlay = document.getElementById('profileCropOverlay');
  const cropArea = document.getElementById('profileCropArea');
  const cropImg = document.getElementById('profileCropImg');
  const cropZoom = document.getElementById('profileCropZoom');
  const cropSave = document.getElementById('profileCropSave');
  const cropCancel = document.getElementById('profileCropCancel');

  let cropState = { imgW: 0, imgH: 0, scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, origX: 0, origY: 0, rawDataUrl: '' };

  function openCropOverlay(dataUrl) {
    if (!cropOverlay || !cropImg) return;
    cropState.rawDataUrl = dataUrl;
    cropImg.src = dataUrl;
    cropImg.onload = () => {
      cropState.imgW = cropImg.naturalWidth;
      cropState.imgH = cropImg.naturalHeight;
      cropState.scale = 1;
      if (cropZoom) cropZoom.value = 100;
      fitAndCenter();
      cropOverlay.classList.add('open');
    };
  }

  function fitAndCenter() {
    const boxSize = 280;
    const minDim = Math.min(cropState.imgW, cropState.imgH);
    const baseScale = boxSize / minDim;
    const zoom = cropState.scale;
    const s = baseScale * zoom;
    const w = cropState.imgW * s;
    const h = cropState.imgH * s;
    cropState.x = (boxSize - w) / 2;
    cropState.y = (boxSize - h) / 2;
    applyCropTransform();
  }

  function applyCropTransform() {
    if (!cropImg) return;
    const boxSize = 280;
    const minDim = Math.min(cropState.imgW, cropState.imgH);
    const baseScale = boxSize / minDim;
    const s = baseScale * cropState.scale;
    cropImg.style.width = (cropState.imgW * s) + 'px';
    cropImg.style.height = (cropState.imgH * s) + 'px';
    cropImg.style.left = cropState.x + 'px';
    cropImg.style.top = cropState.y + 'px';
  }

  if (cropZoom) {
    cropZoom.addEventListener('input', () => {
      const oldScale = cropState.scale;
      cropState.scale = parseInt(cropZoom.value, 10) / 100;
      // Zoom toward center
      const boxSize = 280;
      const cx = boxSize / 2;
      const cy = boxSize / 2;
      const ratio = cropState.scale / oldScale;
      cropState.x = cx - (cx - cropState.x) * ratio;
      cropState.y = cy - (cy - cropState.y) * ratio;
      applyCropTransform();
    });
  }

  if (cropArea) {
    cropArea.addEventListener('mousedown', (e) => {
      e.preventDefault();
      cropState.dragging = true;
      cropState.startX = e.clientX;
      cropState.startY = e.clientY;
      cropState.origX = cropState.x;
      cropState.origY = cropState.y;
    });
    window.addEventListener('mousemove', (e) => {
      if (!cropState.dragging) return;
      cropState.x = cropState.origX + (e.clientX - cropState.startX);
      cropState.y = cropState.origY + (e.clientY - cropState.startY);
      applyCropTransform();
    });
    window.addEventListener('mouseup', () => { cropState.dragging = false; });
    // Mouse wheel zoom
    cropArea.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 10 : -10;
      const newVal = Math.max(100, Math.min(300, parseInt(cropZoom.value, 10) + delta));
      cropZoom.value = newVal;
      cropZoom.dispatchEvent(new Event('input'));
    }, { passive: false });
  }

  if (cropCancel) {
    cropCancel.addEventListener('click', () => {
      if (cropOverlay) cropOverlay.classList.remove('open');
    });
  }

  if (cropSave) {
    cropSave.addEventListener('click', () => {
      // Render cropped result to canvas
      const boxSize = 280;
      const outputSize = 256;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const minDim = Math.min(cropState.imgW, cropState.imgH);
      const baseScale = boxSize / minDim;
      const s = baseScale * cropState.scale;
      const sx = -cropState.x / s;
      const sy = -cropState.y / s;
      const sSize = boxSize / s;

      ctx.drawImage(cropImg, sx, sy, sSize, sSize, 0, 0, outputSize, outputSize);
      selectedProfileImage = canvas.toDataURL('image/jpeg', 0.85);
      renderProfileImagePreview(selectedProfileImage);
      if (cropOverlay) cropOverlay.classList.remove('open');
    });
  }
  
  // Update XP display
  function updateXPDisplay() {
    const activeProfileId = ESHU_DB.getValue('currentProfileId');
    const xpPoints = parseInt(ESHU_DB.getProfileXp(activeProfileId) || 0, 10);
    if (xpCounter) xpCounter.textContent = xpPoints + ' XP';
  }
  updateXPDisplay();

  // Update nav profile display
  function updateNavProfile() {
    const active = getActiveProfile();
    const name = runtime?.getEffectiveProfileName?.(active) || 'Player';
    if (profileNameNav) profileNameNav.textContent = name;
    if (profileBtnNav) {
      if (active?.image) {
        profileBtnNav.innerHTML = `<img src="${active.image}" alt="${name}">`;
      } else {
        profileBtnNav.innerHTML = '';
      }
    }
  }
  updateNavProfile();

  // Profile button navigation
  if (profileBtnNav) {
    profileBtnNav.addEventListener('click', () => {
      // Already on profile page, do nothing or scroll to top
      window.scrollTo(0, 0);
    });
  }



  // Save profile
  saveBtn.addEventListener('click', async () => {
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const name = profileName.value.trim() || 'Player';
    const desc = profileDesc.value.trim();

    try {
      const profiles = getProfiles();
      const currentProfile = profiles[0] || null;
      const now = Date.now();
      let activeProfile;

      // Resolve the canonical (server-side) profile id whenever the API is
      // available. Profile edits are account data, so the server row is the
      // source of truth; local cache is just for instant UI.
      let canonicalProfileId = null;
      let serverProfileAvailable = false;
      const apiAvailable = !!(window.ESHU_API && window.ESHU_API.profiles);
      if (apiAvailable) {
        try {
          const resp = await window.ESHU_API.profiles.list();
          const list = (resp && (resp.profiles || resp)) || [];
          if (resp && resp.currentProfileId) canonicalProfileId = resp.currentProfileId;
          else if (Array.isArray(list) && list[0] && list[0].id) canonicalProfileId = list[0].id;
          serverProfileAvailable = !!canonicalProfileId;
        } catch (err) {
          if (err && err.status === 401) {
            serverProfileAvailable = false;
          } else {
            throw err;
          }
        }
      }

      if (!currentProfile) {
        const newProfile = {
          id: canonicalProfileId || ('profile_' + now + '_' + Math.random().toString(36).slice(2, 8)),
          name,
          description: desc,
          image: selectedProfileImage,
          xpPoints: 0,
          createdAt: now,
          updatedAt: now,
          isActive: true
        };
        activeProfile = newProfile;
        ESHU_DB.setValue('currentProfileId', newProfile.id);
      } else {
        // If we have a canonical id and it differs from the local id, prefer
        // the canonical so the bulk-sync push lands on the right Profile row.
        const targetId = canonicalProfileId || currentProfile.id;
        activeProfile = {
          ...currentProfile,
          id: targetId,
          name,
          description: desc,
          image: selectedProfileImage,
          updatedAt: now
        };
        ESHU_DB.setValue('currentProfileId', activeProfile.id);
      }

      ESHU_DB.setTable('profiles', [activeProfile]);
      ensureDefaultGroupExists();
      syncLegacyProfileValues(activeProfile);
      updateNavProfile();
      const headerName = document.getElementById('profileHeaderName');
      if (headerName) headerName.textContent = name;

      if (serverProfileAvailable) {
        if (!canonicalProfileId) throw new Error('Could not find your server profile. Please sign in again.');

      try {
        // Upload the avatar bytes through the canonical asset pipeline when
        // the user selected a fresh data URL. The resulting `avatarAssetId`
        // is the durable, cross-device source of truth; `data.image` stays
        // as a short-lived preview cache for instant UI while the upload
        // completes and as a fallback for pre-asset rows.
        let avatarAssetId;
        if (typeof selectedProfileImage === 'string' && selectedProfileImage.startsWith('data:') && window.ESHU_ASSETS) {
          try {
            const uploaded = await window.ESHU_ASSETS.uploadDataUrl(selectedProfileImage, 'avatar.png');
            if (uploaded && uploaded.assetId) {
              avatarAssetId = uploaded.assetId;
              activeProfile.avatarAssetId = avatarAssetId;
              ESHU_DB.setTable('profiles', [activeProfile]);
            }
          } catch (err) {
            console.warn('[profile.save] avatar upload failed; falling back to inline data URL:', err);
          }
        } else if (selectedProfileImage === null) {
          // User explicitly removed their avatar.
          avatarAssetId = null;
        }

        const updateResp = await window.ESHU_API.profiles.update(canonicalProfileId, {
          name,
          description: desc,
          ...(avatarAssetId !== undefined ? { avatarAssetId } : {}),
          data: { image: selectedProfileImage },
        });
        if (updateResp && updateResp.profile) applyProfileToForm(updateResp.profile);
        // Ask the playerbase / home page to refresh itself on next render.
        try { window.dispatchEvent(new CustomEvent('eshu:profile-updated', { detail: { id: canonicalProfileId } })); } catch {}
      } catch (err) {
        console.warn('[profile.save] granular PATCH failed:', err);
        throw err;
      }
      }

      // Replace the blocking alert with a subtle toast and auto-navigate back
      // to the home surface. This is what the user expected: save, then the
      // homepage profile section reflects the edit without extra clicks.
      showSaveToast(serverProfileAvailable ? 'Profile saved' : 'Profile saved locally');
      if (!serverProfileAvailable && apiAvailable && window.ESHU_AUTH_UI && typeof window.ESHU_AUTH_UI.open === 'function') {
        setTimeout(() => {
          window.ESHU_AUTH_UI.open({ tab: 'signin', reloadOnSuccess: false });
        }, 700);
        return;
      }
      setTimeout(() => {
        try { location.assign('home.html'); } catch { location.reload(); }
      }, 650);
    } catch (err) {
      console.error('[profile.save] failed:', err);
      const message = err?.message || 'Could not save profile. Please try again.';
      if (window.MODAL && typeof MODAL.alert === 'function') {
        MODAL.alert({ title: 'Profile not saved', message });
      } else {
        alert(message);
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText || 'Save Player';
    }
  });

  // Lightweight inline toast. Appended to <body> and auto-removes. Kept in
  // this file (rather than a shared component) because it has exactly one
  // caller and no existing toast primitive shipped with the app.
  function showSaveToast(message) {
    const existing = document.getElementById('eshu-profile-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'eshu-profile-toast';
    toast.textContent = message;
    toast.style.cssText = [
      'position:fixed', 'left:50%', 'top:18px', 'transform:translateX(-50%)',
      'background:var(--bg-panel, #111)', 'color:var(--text-primary, #fff)',
      'padding:10px 16px', 'border:1px solid var(--border-color, #2a2a2a)',
      'border-radius:8px', 'font:600 13px/1 Inter, system-ui, sans-serif',
      'letter-spacing:0.04em', 'text-transform:uppercase',
      'box-shadow:0 6px 18px rgba(0,0,0,0.18)', 'z-index:9999',
      'opacity:0', 'transition:opacity 160ms ease'
    ].join(';');
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => { try { toast.remove(); } catch {} }, 220);
    }, 900);
  }

  if (deleteProfileBtn) {
    deleteProfileBtn.addEventListener('click', async () => {
      MODAL.alert({ title: 'Unavailable', message: 'Only one player profile is allowed per account.' });
    });
  }

  // Boot everything
  burnBtn.addEventListener('click', async () => {
    const password = await MODAL.prompt({ title: 'Security Check', message: 'Enter the nuclear password to proceed:', confirmLabel: 'Submit' });
    if (password !== '#JESUS') {
      MODAL.alert({ title: 'Access Denied', message: 'Incorrect password. Deletion cancelled.' });
      return;
    }
    const yes = await MODAL.confirm({ title: 'Nuclear Delete', message: 'This will delete ALL your profile data, items, and stored images. The page will reload. Are you sure?', danger: true, confirmLabel: 'Delete Everything' });
    if (!yes) return;

    // 1) Clear IndexedDB media store (creation images)
    try {
      if (window.ESHU_MEDIA && typeof window.ESHU_MEDIA.clearAllImages === 'function') {
        await window.ESHU_MEDIA.clearAllImages();
      }
    } catch (err) {
      console.warn('Failed to clear ESHU_MEDIA images:', err);
    }

    // 2) Best-effort: delete the IndexedDB database entirely so any orphan
    //    state/version mismatches get reset.
    try {
      if ('indexedDB' in window && typeof indexedDB.deleteDatabase === 'function') {
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase('eshu_media_store_v1');
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
      }
    } catch (err) {
      console.warn('Failed to delete IndexedDB:', err);
    }

    // 3) Clear web storage and cookies
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        if (name) document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      });
    } catch (e) {}

    // 4) Reload to a clean home page
    window.location.replace('home.html');
  });

  const COLLAPSIBLE_MAX_VIEWPORT_RATIO = 0.42;

  function getExpandedContentMaxHeight(content) {
    const panel = content && content.closest ? content.closest('.right-panel') : null;
    const panelHeight = panel ? panel.clientHeight : 0;
    const viewportCap = Math.floor(window.innerHeight * COLLAPSIBLE_MAX_VIEWPORT_RATIO);
    const panelCap = panelHeight > 0 ? Math.floor(panelHeight * 0.45) : viewportCap;
    return Math.max(140, Math.min(viewportCap, panelCap));
  }

  function refreshExpandedCollapsibles() {
    document.querySelectorAll('.right-panel .collapsible').forEach(btn => {
      if (!btn.classList.contains('active')) return;
      const content = btn.nextElementSibling;
      if (!content) return;
      const cap = getExpandedContentMaxHeight(content);
      const targetHeight = Math.min(content.scrollHeight, cap);
      content.style.maxHeight = targetHeight + 'px';
    });
  }

  // Collapsible functionality
  document.querySelectorAll('.right-panel .collapsible').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const content = btn.nextElementSibling;
      if (!content) return;
      if (btn.classList.contains('active')) {
        const cap = getExpandedContentMaxHeight(content);
        const targetHeight = Math.min(content.scrollHeight, cap);
        content.style.maxHeight = targetHeight + 'px';
      } else {
        content.style.maxHeight = null;
      }
    });
  });

  window.addEventListener('resize', refreshExpandedCollapsibles);

  // Render right panel items
  function renderRightPanel() {
    const activeProfileId = getActiveProfile()?.id || ESHU_DB.getValue('currentProfileId') || null;
    const allGroups = ESHU_DB.getTable('groups') || [];
    const allGames = ESHU_DB.getTable('games') || [];
    const allCreations = ESHU_DB.getTable('creations') || [];

    const groups = allGroups.filter(group => groupBelongsToProfile(group, activeProfileId));
    const games = allGames.filter(game => gameBelongsToProfile(game, activeProfileId, allGroups, allCreations));
    const creations = allCreations.filter(creation => itemBelongsToProfile(creation, activeProfileId));

    function entityLabel(entity) {
      if (!entity || typeof entity !== 'object') return '';
      if (entity.status === 'burned') return 'BURNED';
      if (entity.status === 'deleted') return `[Deleted] ${entity.name || 'Unnamed'}`;
      return entity.name || 'Unnamed';
    }

    function makeItem(text, onclick) {
      const p = document.createElement('p');
      p.textContent = text;
      p.style.cursor = 'pointer';
      p.addEventListener('dblclick', onclick);
      return p;
    }

    const groupsEl = document.getElementById('groupsContent');
    groupsEl.innerHTML = '';
    if (groups.length) {
      groups.forEach(g => { groupsEl.appendChild(makeItem(entityLabel(g), () => { window.location.href = 'groups.html'; })); });
    } else { groupsEl.innerHTML = '<p>No groups yet.</p>'; }

    const gamesEl = document.getElementById('gamesContent');
    gamesEl.innerHTML = '';
    if (games.length) {
      games.forEach(g => { gamesEl.appendChild(makeItem(entityLabel(g), () => { window.location.href = 'games.html'; })); });
    } else { gamesEl.innerHTML = '<p>No games yet.</p>'; }

    const creationsEl = document.getElementById('creationsContent');
    creationsEl.innerHTML = '';
    if (creations.length) {
      creations.forEach(c => {
        const gameId = c.hostGameId || '';
        creationsEl.appendChild(makeItem(entityLabel(c), () => { window.location.href = `creation-focus.html?id=${c.id}&from=profile.html&gameId=${gameId}`; }));
      });
    } else { creationsEl.innerHTML = '<p>No creations yet.</p>'; }

    const commentsEl = document.getElementById('commentsContent');
    commentsEl.innerHTML = '';
    let hasComments = false;

    const seenKeys = new Set();
    const threadTargets = [];

    creations.forEach((creation) => {
      if (!creation?.id) return;
      const gameId = creation.hostGameId || '';
      threadTargets.push({
        key: `comments_${creation.id}`,
        defaultBelongs: itemBelongsToProfile(creation, activeProfileId),
        href: `creation-focus.html?id=${creation.id}&from=profile.html&gameId=${gameId}`,
      });
    });

    allGames.forEach((game) => {
      if (!game?.id) return;
      threadTargets.push({
        key: `comments_game_${game.id}`,
        defaultBelongs: gameBelongsToProfile(game, activeProfileId, allGroups, allCreations),
        href: `games.html?view=front&gameId=${encodeURIComponent(game.id)}&from=profile.html`,
      });
    });

    allGroups.forEach((group) => {
      if (!group?.id) return;
      threadTargets.push({
        key: `comments_group_${group.id}`,
        defaultBelongs: groupBelongsToProfile(group, activeProfileId),
        href: `group-front.html?groupId=${encodeURIComponent(group.id)}&from=profile.html`,
      });
    });

    threadTargets.forEach((target) => {
      if (!target?.key || seenKeys.has(target.key)) return;
      seenKeys.add(target.key);
      try {
        const raw = localStorage.getItem(target.key);
        if (!raw) return;
        const thread = JSON.parse(raw);
        if (!Array.isArray(thread)) return;
        thread.forEach((cm) => {
          const commentText = typeof cm === 'string' ? cm : (cm && (cm.text || cm.comment || cm.body)) || '';
          if (!String(commentText || '').trim()) return;
          const commentBelongsToProfile = typeof cm === 'object' && cm
            ? itemBelongsToProfile(cm, activeProfileId)
            : target.defaultBelongs;
          if (!commentBelongsToProfile) return;
          hasComments = true;
          commentsEl.appendChild(makeItem(commentText, () => { window.location.href = target.href; }));
        });
      } catch {}
    });

    if (!hasComments) commentsEl.innerHTML = '<p>No comments yet.</p>';

    refreshExpandedCollapsibles();
  }

  // Initial render
  renderRightPanel();

  ESHU_DB.subscribe(() => {
    renderRightPanel();
    updateXPDisplay();
    updateNavProfile();
    loadFormFromActiveProfile();
  });

  async function handleExportData() {
    const entered = await MODAL.prompt({ title: 'Export Password', message: 'Enter export password:', placeholder: 'Password' });
    if (entered === null) {
      return;
    }

    let enteredHash = '';
    try {
      enteredHash = await sha256Hex(entered);
    } catch (err) {
      console.error(err);
      MODAL.alert({ title: 'Error', message: 'This browser context cannot verify the export password securely.' });
      return;
    }

    if (enteredHash !== EXPORT_PASSWORD_SHA256) {
      MODAL.alert({ title: 'Wrong Password', message: 'Incorrect password. Export canceled.' });
      return;
    }

    let profileFileName = profileName.value.trim() || `Profile_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const localState = {};
    const sessionState = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        localState[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        localState[key] = localStorage.getItem(key);
      }
    }

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      try {
        sessionState[key] = JSON.parse(sessionStorage.getItem(key));
      } catch {
        sessionState[key] = sessionStorage.getItem(key);
      }
    }

    let creationImages = [];
    if (window.ESHU_MEDIA && typeof window.ESHU_MEDIA.exportAllImages === 'function') {
      try {
        creationImages = await window.ESHU_MEDIA.exportAllImages();
      } catch (err) {
        console.warn('Failed to export creation images:', err);
      }
    }

    const snapshot = {
      format: 'ESHU_FULL_STORAGE_EXPORT_V2',
      exportedAt: new Date().toISOString(),
      localStorage: localState,
      sessionStorage: sessionState,
      indexedDB: {
        creationImages
      }
    };

    const json = JSON.stringify(snapshot);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.href = url;
    dlAnchor.download = profileFileName + '.json';
    dlAnchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleImportData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const payload = JSON.parse(e.target.result);

          const hasStructuredExport = payload && typeof payload === 'object'
            && payload.localStorage && typeof payload.localStorage === 'object';
          const localState = hasStructuredExport ? payload.localStorage : payload;
          const sessionState = hasStructuredExport && payload.sessionStorage && typeof payload.sessionStorage === 'object'
            ? payload.sessionStorage
            : null;
          const indexedImages = hasStructuredExport
            && payload.indexedDB
            && Array.isArray(payload.indexedDB.creationImages)
            ? payload.indexedDB.creationImages
            : [];

          if (!localState || typeof localState !== 'object') {
            throw new Error('Invalid export format');
          }

          localStorage.clear();
          Object.keys(localState).forEach(key => {
            if (typeof localState[key] === 'object') {
              localStorage.setItem(key, JSON.stringify(localState[key]));
            } else {
              localStorage.setItem(key, localState[key]);
            }
          });

          sessionStorage.clear();
          if (sessionState) {
            Object.keys(sessionState).forEach(key => {
              if (typeof sessionState[key] === 'object') {
                sessionStorage.setItem(key, JSON.stringify(sessionState[key]));
              } else {
                sessionStorage.setItem(key, sessionState[key]);
              }
            });
          }

          let restoredAssets = 0;
          if (indexedImages.length > 0 && window.ESHU_MEDIA) {
            try {
              if (typeof window.ESHU_MEDIA.clearAllImages === 'function') {
                await window.ESHU_MEDIA.clearAllImages();
              }
              if (typeof window.ESHU_MEDIA.importImages === 'function') {
                restoredAssets = await window.ESHU_MEDIA.importImages(indexedImages);
              }
            } catch (assetErr) {
              console.warn('Failed to restore creation images:', assetErr);
            }
          }

          ESHU_DB.ensure();
          ensureDefaultProfile();
          loadFormFromActiveProfile();
          updateXPDisplay();
          renderRightPanel();
          updateNavProfile();
          MODAL.alert({
            title: 'Loaded',
            message: restoredAssets > 0
              ? `Profile state loaded. Restored ${restoredAssets} creation image(s).`
              : 'Profile state loaded successfully.'
          });
        } catch (err) {
          console.error(err);
          MODAL.alert({ title: 'Error', message: 'Invalid file. Could not load profile state.' });
        }
      };
      reader.readAsText(file);
    });
    fileInput.click();
  }
})();
