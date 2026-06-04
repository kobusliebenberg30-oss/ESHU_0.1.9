(function () {
  'use strict';

  ESHU_DB.ensure();
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';

  const pageParams = new URLSearchParams(window.location.search);
  const creationId = pageParams.get('id');
  const returnTo = pageParams.get('returnTo') || 'creation-focus.html';
  const returnContext = pageParams.get('returnContext') || '';
  const returnGameId = pageParams.get('returnGameId') || '';
  const returnMode = pageParams.get('returnMode') || '';
  const returnSourceGroupId = pageParams.get('returnSourceGroupId') || '';
  const returnLeftCreationId = pageParams.get('returnLeftCreationId') || '';
  const returnRightCreationId = pageParams.get('returnRightCreationId') || '';
  const runtime = window.ESHU_RUNTIME;

  const backBtn = document.getElementById('backBtn');
  const detailsImage = document.getElementById('detailsImage');
  const imagePlaceholder = document.getElementById('imagePlaceholder');
  const detailsGrid = document.getElementById('detailsGrid');
  const detailsMetaGrid = document.getElementById('detailsMetaGrid');
  const detailsMetaSection = document.getElementById('detailsMetaSection');
  const headerActions = document.getElementById('headerActions');
  const leftHeaderActions = document.getElementById('leftHeaderActions');
  const detailsActions = document.getElementById('detailsActions');
  const profileBtn = document.getElementById('profileBtn');
  const profileNameNav = document.getElementById('profileNameNav');
  const xpCounter = document.getElementById('xpCounter');

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function getActiveProfileId() {
    return getActiveProfile()?.id || ESHU_DB.getValue('currentProfileId') || null;
  }

  function isCreationOwner(creation) {
    if (!creation) return false;
    const profileId = getActiveProfileId();
    if (!profileId) return false;
    const ownerId = creation.ownerProfileId || creation.createdByProfileId || creation.authorProfileId || creation.authorId || null;
    return !ownerId || ownerId === profileId;
  }

  function formatDate(value) {
    if (!value) return '—';
    const parsed = Number.isFinite(Number(value)) ? new Date(Number(value)) : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  }

  function renderDetailItem(label, value) {
    const item = document.createElement('div');
    item.className = 'detail-item';
    item.innerHTML = `
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value || '—'}</div>
    `;
    return item;
  }

  function getBackUrl() {
    if (returnTo === 'eshu.html') {
      const query = new URLSearchParams();
      if (returnGameId) query.set('gameId', returnGameId);
      if (returnMode) query.set('mode', returnMode);
      if (returnSourceGroupId) query.set('sourceGroupId', returnSourceGroupId);
      if (returnLeftCreationId) query.set('leftCreationId', returnLeftCreationId);
      if (returnRightCreationId) query.set('rightCreationId', returnRightCreationId);
      const qs = query.toString();
      return qs ? `eshu.html?${qs}` : 'eshu.html';
    }

    if (returnTo === 'creation-focus.html') {
      const query = new URLSearchParams();
      if (creationId) query.set('id', creationId);
      if (returnContext) {
        const contextParams = new URLSearchParams(returnContext);
        contextParams.forEach((value, key) => query.set(key, value));
      }
      const qs = query.toString();
      return qs ? `creation-focus.html?${qs}` : 'creation-focus.html';
    }

    return returnTo;
  }

  function renderNavProfile() {
    const profile = getActiveProfile();
    if (profileNameNav) profileNameNav.textContent = profile?.name || 'Player';
    if (profileBtn) {
      if (profile?.image) {
        profileBtn.innerHTML = `<img src="${profile.image}" alt="${profile?.name || 'Player'}">`;
      } else {
        profileBtn.innerHTML = '';
      }
      profileBtn.addEventListener('click', () => {
        window.location.href = 'profile.html';
      });
    }

  }

  function renderXP() {
    if (!xpCounter) return;
    const xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
    xpCounter.textContent = `${xpPoints} XP`;
  }

  function renderCreation() {
    if (!detailsGrid) return;
    detailsGrid.innerHTML = '';
    if (detailsMetaGrid) detailsMetaGrid.innerHTML = '';
    if (headerActions) headerActions.innerHTML = '';
    if (leftHeaderActions) leftHeaderActions.innerHTML = '';
    if (detailsActions) detailsActions.innerHTML = '';
    if (detailsMetaSection) detailsMetaSection.style.display = 'none';

    if (!creationId) {
      detailsGrid.appendChild(renderDetailItem('Error', 'Creation ID is missing'));
      return;
    }

    const creation = ESHU_DB.getEntityById('creations', creationId);
    if (!creation || !ESHU_DB.isEntityActive(creation)) {
      detailsGrid.appendChild(renderDetailItem('Not found', 'This creation is unavailable.'));
      return;
    }

    const games = ESHU_DB.getTable('games') || [];
    const hostGame = games.find(g => g.id === creation.hostGameId || g.id === creation.gameId);
    const profileId = getActiveProfileId();
    const canEdit = isCreationOwner(creation);
    const isLiked = profileId && (creation.likedBy || []).includes(profileId);
    const isFollowed = profileId && (creation.followedBy || []).includes(profileId);

    // --- Information section ---
    detailsGrid.appendChild(renderDetailItem('Title', creation.title || creation.name || 'Untitled'));
    // Player - clickable link to that player's home feed
    const authorProfileId = creation.authorProfileId || creation.ownerProfileId || creation.createdByProfileId || null;
    const authorName = creation.authorName || creation.author || 'Player';
    if (authorProfileId) {
      const playerItem = document.createElement('div');
      playerItem.className = 'detail-item';
      const playerLabel = document.createElement('div');
      playerLabel.className = 'detail-label';
      playerLabel.textContent = 'Player';
      const playerValue = document.createElement('div');
      playerValue.className = 'detail-value';
      const playerLink = document.createElement('a');
      playerLink.href = `home.html?profileId=${encodeURIComponent(authorProfileId)}`;
      playerLink.textContent = authorName;
      playerLink.title = `View ${authorName}'s profile`;
      playerLink.style.color = 'inherit';
      playerLink.style.textDecoration = 'underline';
      playerLink.style.cursor = 'pointer';
      playerValue.appendChild(playerLink);
      playerItem.appendChild(playerLabel);
      playerItem.appendChild(playerValue);
      detailsGrid.appendChild(playerItem);
    } else {
      detailsGrid.appendChild(renderDetailItem('Player', authorName));
    }
    detailsGrid.appendChild(renderDetailItem('Description', creation.description || 'No description'));
    // Host Game - clickable link to the game front page
    if (hostGame && hostGame.id) {
      const hostGameItem = document.createElement('div');
      hostGameItem.className = 'detail-item';
      const labelDiv = document.createElement('div');
      labelDiv.className = 'detail-label';
      labelDiv.textContent = 'Host Game';
      const valueDiv = document.createElement('div');
      valueDiv.className = 'detail-value';
      const link = document.createElement('a');
      link.href = `games.html?view=front&gameId=${encodeURIComponent(hostGame.id)}`;
      link.textContent = hostGame.name || 'Open game';
      link.title = `Go to "${hostGame.name || 'host game'}"`;
      link.style.color = 'inherit';
      link.style.textDecoration = 'underline';
      link.style.cursor = 'pointer';
      valueDiv.appendChild(link);
      // Add a small Play link next to the name
      const playMode = hostGame.gameType === 'book' ? 'book' : 'arena';
      const playLink = document.createElement('a');
      playLink.href = `eshu.html?gameId=${encodeURIComponent(hostGame.id)}&mode=${playMode}`;
      playLink.textContent = 'Play';
      playLink.title = `Play "${hostGame.name || 'this game'}"`;
      playLink.style.marginLeft = '8px';
      playLink.style.padding = '2px 8px';
      playLink.style.fontSize = '11px';
      playLink.style.fontWeight = '600';
      playLink.style.background = 'var(--accent-coral, #e53935)';
      playLink.style.color = '#fff';
      playLink.style.borderRadius = 'var(--radius-md, 6px)';
      playLink.style.textDecoration = 'none';
      valueDiv.appendChild(playLink);
      hostGameItem.appendChild(labelDiv);
      hostGameItem.appendChild(valueDiv);
      detailsGrid.appendChild(hostGameItem);
    } else {
      detailsGrid.appendChild(renderDetailItem('Host Game', creation.hostGameId || creation.gameId || '—'));
    }
    if (creation.tags) detailsGrid.appendChild(renderDetailItem('Tags', Array.isArray(creation.tags) ? creation.tags.join(', ') : creation.tags));
    if (creation.devices) detailsGrid.appendChild(renderDetailItem('Devices', creation.devices));

    // --- Metadata section ---
    if (detailsMetaGrid && detailsMetaSection) {
      detailsMetaSection.style.display = '';
      detailsMetaGrid.appendChild(renderDetailItem('Privacy', (creation.privacy || 'public').charAt(0).toUpperCase() + (creation.privacy || 'public').slice(1)));
      detailsMetaGrid.appendChild(renderDetailItem('Votes', String(creation.votes || 0)));
      detailsMetaGrid.appendChild(renderDetailItem('Burns', String(creation.burns || 0)));
      if (creation.dateMade) detailsMetaGrid.appendChild(renderDetailItem('Date Made', creation.dateMade));
      detailsMetaGrid.appendChild(renderDetailItem('Created', formatDate(creation.createdAt || creation.timestamp)));
    }

    // --- Left Header actions: Like, Follow, Edit (cog) ---
    if (leftHeaderActions) {
      // Like button
      const likeBtn = document.createElement('button');
      likeBtn.className = 'header-action-btn' + (isLiked ? ' liked' : '');
      likeBtn.innerHTML = HEART_SVG;
      likeBtn.title = isLiked ? 'Unlike' : 'Like';
      likeBtn.addEventListener('click', () => {
        toggleLike(creation);
      });
      leftHeaderActions.appendChild(likeBtn);

      // Follow button
      const followBtn = document.createElement('button');
      followBtn.className = 'header-action-btn' + (isFollowed ? ' followed' : '');
      followBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
      followBtn.title = isFollowed ? 'Unfollow' : 'Follow';
      followBtn.addEventListener('click', () => {
        toggleFollow(creation);
      });
      leftHeaderActions.appendChild(followBtn);

      // Edit (cog) button - only if owner
      if (canEdit) {
        const editBtn = document.createElement('button');
        editBtn.className = 'header-action-btn';
        editBtn.innerHTML = COG_SVG;
        editBtn.title = 'Edit Creation';
        editBtn.addEventListener('click', () => {
          window.location.href = `creations.html?edit=${creationId}`;
        });
        leftHeaderActions.appendChild(editBtn);
      }
    }

    // --- Bottom action bar (simplified) ---
    if (detailsActions) {
      detailsActions.style.display = 'none';
    }

    // --- Image background color ---
    if (detailsImage) {
      const imageFrame = detailsImage.closest('.image-frame');
      if (imageFrame) imageFrame.style.background = creation.bgColor || '';
    }

    // --- Image ---
    const hasVisual = !!(creation.image || creation.imageAssetId || creation.imageRef?.id);
    if (!hasVisual) {
      if (detailsImage) {
        detailsImage.removeAttribute('src');
        detailsImage.style.display = 'none';
      }
      if (imagePlaceholder) {
        imagePlaceholder.style.display = 'block';
        imagePlaceholder.textContent = 'No image available';
      }
      return;
    }

    if (detailsImage) {
      detailsImage.src = creation.image || '';
      detailsImage.style.display = creation.image ? 'block' : 'none';
    }
    if (imagePlaceholder) {
      imagePlaceholder.style.display = creation.image ? 'none' : 'block';
    }

    if (window.ESHU_MEDIA?.resolveCreationImageSrc) {
      window.ESHU_MEDIA.resolveCreationImageSrc(creation)
        .then(src => {
          if (!src || !detailsImage) return;
          detailsImage.src = src;
          detailsImage.style.display = 'block';
          if (imagePlaceholder) imagePlaceholder.style.display = 'none';
        })
        .catch(() => {
          if (!creation.image && imagePlaceholder) {
            imagePlaceholder.style.display = 'block';
          }
        });
    }
  }

  function toggleLike(creation) {
    const profileId = getActiveProfileId();
    if (!profileId || !creation) return;
    const creations = ESHU_DB.getTable('creations') || [];
    const c = creations.find(x => x.id === creation.id);
    if (!c) return;
    c.likedBy = Array.isArray(c.likedBy) ? c.likedBy : [];
    const idx = c.likedBy.indexOf(profileId);
    if (idx >= 0) c.likedBy.splice(idx, 1);
    else c.likedBy.push(profileId);
    ESHU_DB.setTable('creations', creations);
    renderCreation();
  }

  function toggleFollow(creation) {
    const profileId = getActiveProfileId();
    if (!profileId || !creation) return;
    const creations = ESHU_DB.getTable('creations') || [];
    const c = creations.find(x => x.id === creation.id);
    if (!c) return;
    c.followedBy = Array.isArray(c.followedBy) ? c.followedBy : [];
    const idx = c.followedBy.indexOf(profileId);
    if (idx >= 0) c.followedBy.splice(idx, 1);
    else c.followedBy.push(profileId);
    ESHU_DB.setTable('creations', creations);
    renderCreation();
  }

  function setupBackButton() {
    if (!backBtn) return;
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = getBackUrl();
      }
    });
  }

  function init() {
    renderNavProfile();
    renderXP();
    renderCreation();
    setupBackButton();
  }

  ESHU_DB.subscribe(() => {
    renderNavProfile();
    renderXP();
    renderCreation();
  });

  document.addEventListener('DOMContentLoaded', init);
})();
