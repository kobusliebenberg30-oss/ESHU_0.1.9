(function () {
  'use strict';

  const FOLLOW_ARROW_SVG = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
  const PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  const xpCounter = document.getElementById('xpCounter');
  const runtime = window.ESHU_RUNTIME;
  ESHU_DB.ensure();
  let xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
  const playWrapper = document.getElementById('playBtnWrapper');
  if (playWrapper) {
    // Placeholder; real href is set once the creation (and its host game) are known
    playWrapper.innerHTML = '<a href="#" class="play-link" id="playLink" style="display:none;">Play Game</a>';
  }
  if (xpCounter) xpCounter.textContent = xpPoints + ' XP';

  function updatePlayLinkForGame(hostGame) {
    const playLink = document.getElementById('playLink');
    if (!playLink) return;
    if (!hostGame || !hostGame.id) {
      playLink.style.display = 'none';
      playLink.removeAttribute('href');
      return;
    }
    const mode = hostGame.gameType === 'book' ? 'book' : 'arena';
    playLink.href = `eshu.html?gameId=${encodeURIComponent(hostGame.id)}&mode=${mode}`;
    playLink.title = `Play "${hostGame.name || 'this game'}"`;
    playLink.style.display = '';
  }

  function goToHostGame(hostGame) {
    if (!hostGame || !hostGame.id) return;
    window.location.href = `games.html?view=front&gameId=${encodeURIComponent(hostGame.id)}`;
  }

  function goToPlayerProfile(profileId) {
    if (!profileId) return;
    window.location.href = `home.html?profileId=${encodeURIComponent(profileId)}`;
  }
  function updateXP(amount, reason) {
    xpPoints = ESHU_DB.addProfileXp(amount || 1, ESHU_DB.getActiveProfileId(), reason || 'XP earned');
    if (window.XP_ANIM) XP_ANIM.show(amount || 1);
  }

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  // Holds a pending animation (created via ANIMATION_DRAW) until comment is submitted
  let pendingAnimation = null;

  function getCurrentCreationImageUrl() {
    const img = document.getElementById('creationImage');
    return (img && img.src) ? img.src : '';
  }

  // Resolve creation image URL from the creation data (handles IndexedDB blob URLs)
  async function resolveCreationImageUrl() {
    const creation = activeCreationId ? ESHU_DB.getEntityById('creations', activeCreationId) : null;
    if (!creation) return '';
    
    // If ESHU_MEDIA is available, use it to resolve the proper image URL
    if (window.ESHU_MEDIA?.resolveCreationImageSrc) {
      try {
        const resolved = await window.ESHU_MEDIA.resolveCreationImageSrc(creation);
        if (resolved) return resolved;
      } catch (e) {
        console.warn('[creation-focus] Failed to resolve image via ESHU_MEDIA:', e);
      }
    }
    
    // Fallback to direct image property
    return creation.image || '';
  }

  // Store pending animation and its associated image URL
  let pendingAnimationImageUrl = '';

  async function openAnimationDraw() {
    if (typeof window.ANIMATION_DRAW === 'undefined') {
      console.warn('ANIMATION_DRAW not loaded');
      return;
    }
    
    // Get creation metadata for image processing info
    const creation = activeCreationId ? ESHU_DB.getEntityById('creations', activeCreationId) : null;
    const imageMeta = window.DRAWING_COMPOSITOR 
      ? window.DRAWING_COMPOSITOR.extractImageMeta(creation)
      : {};
    
    // Resolve image URL fresh to ensure it's valid
    const imageUrl = await resolveCreationImageUrl() || getCurrentCreationImageUrl();
    pendingAnimationImageUrl = imageUrl;
    
    window.ANIMATION_DRAW.open({
      imageUrl: imageUrl,
      imageMeta: imageMeta,
      initialData: pendingAnimation,
      onSave: (data) => {
        pendingAnimation = data;
        // Show indicator in comment input that drawing is ready
        const input = document.getElementById('commentInput');
        if (input) {
          input.placeholder = '🎨 Drawing attached - type message and send...';
          input.classList.add('has-pending-animation');
        }
        if (typeof TOAST !== 'undefined') TOAST.success('Drawing saved! Add a message and send.');
      }
    });
  }

  // Delegates to shared Eshu engine component
  function extractCommentAnimation(c) { return window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(c) : (c && c.animation || null); }
  function hasCommentAnimation(c) { return window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(c) : !!(c && c.animation); }
  function openAnimationPlayer(data, img) { if (window.ANIMATION_PLAYER) window.ANIMATION_PLAYER.open(data, img); }

  // Exposed so render() can call it back to re-render comments
  let commentsRerender = null;

  async function toggleDrawOverlay() {
    // Exit fullscreen if active so the draw tool can appear properly
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    if (fsElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      else if (document.msExitFullscreen) await document.msExitFullscreen();
    }
    await openAnimationDraw();
  }

  function setupQuickOverlayActions() {
    const quickCommentBtn = document.getElementById('focusQuickCommentBtn');
    const quickDrawBtn = document.getElementById('focusQuickDrawBtn');
    const likeBtn = document.getElementById('focusLikeBtn');
    const followBtn = document.getElementById('focusFollowBtn');
    const commentInput = document.getElementById('commentInput');

    if (quickCommentBtn && commentInput) {
      quickCommentBtn.addEventListener('click', () => {
        commentInput.focus();
        commentInput.select();
      });
    }

    if (quickDrawBtn) {
      quickDrawBtn.addEventListener('click', async () => {
        await toggleDrawOverlay();
      });
    }

    if (likeBtn) {
      likeBtn.addEventListener('click', () => {
        toggleCreationLike();
      });
    }

    if (followBtn) {
      followBtn.addEventListener('click', () => {
        toggleCreationFollow();
      });
    }

    // Header action buttons (title row): Like, Follow, Edit (owner-only cog)
    const headerLikeBtn = document.getElementById('focusHeaderLikeBtn');
    if (headerLikeBtn) {
      headerLikeBtn.addEventListener('click', () => {
        toggleCreationLike();
      });
    }

    const headerFollowBtn = document.getElementById('focusHeaderFollowBtn');
    if (headerFollowBtn) {
      headerFollowBtn.addEventListener('click', () => {
        toggleCreationFollow();
      });
    }

    const headerEditBtn = document.getElementById('focusHeaderEditBtn');
    if (headerEditBtn) {
      headerEditBtn.addEventListener('click', () => {
        if (!activeCreationId) return;
        const targetUrl = `creations.html?edit=${encodeURIComponent(activeCreationId)}`;
        const returnUrl = `creation-focus.html?id=${encodeURIComponent(activeCreationId)}`;
        if (window.NAV_BACK) window.NAV_BACK.goToWithReturn(targetUrl, returnUrl);
        else window.location.href = targetUrl;
      });
    }
  }

  function isCreationOwner(creation) {
    if (!creation) return false;
    const profileId = getActiveProfileId();
    if (!profileId) return false;
    const ownerId = creation.ownerProfileId || creation.createdByProfileId || creation.authorProfileId || creation.authorId || null;
    return !ownerId || ownerId === profileId;
  }

  function updateHeaderEditVisibility(creation) {
    const headerEditBtn = document.getElementById('focusHeaderEditBtn');
    if (!headerEditBtn) return;
    const canEdit = isCreationOwner(creation) && creation && creation.status !== 'burned';
    headerEditBtn.style.display = canEdit ? '' : 'none';
  }

  function updateLikedState(creation) {
    const likeBtn = document.getElementById('focusLikeBtn');
    const headerLikeBtn = document.getElementById('focusHeaderLikeBtn');
    const profileId = getActiveProfileId();
    const isLiked = creation && profileId && (creation.likedBy || []).includes(profileId);
    if (likeBtn) {
      likeBtn.classList.toggle('liked', !!isLiked);
      likeBtn.innerHTML = HEART_SVG;
      likeBtn.title = isLiked ? 'Unlike' : 'Like';
    }
    if (headerLikeBtn) {
      headerLikeBtn.classList.toggle('active', !!isLiked);
      headerLikeBtn.innerHTML = HEART_SVG;
      headerLikeBtn.title = isLiked ? 'Unlike' : 'Like';
    }
  }

  function updateFollowedState(creation) {
    const followBtn = document.getElementById('focusFollowBtn');
    const headerFollowBtn = document.getElementById('focusHeaderFollowBtn');
    const profileId = getActiveProfileId();
    const isFollowed = creation && profileId && (creation.followedBy || []).includes(profileId);
    if (followBtn) {
      followBtn.classList.toggle('followed', !!isFollowed);
      followBtn.title = isFollowed ? 'Unfollow' : 'Follow';
    }
    if (headerFollowBtn) {
      headerFollowBtn.classList.toggle('active', !!isFollowed);
      headerFollowBtn.title = isFollowed ? 'Unfollow' : 'Follow';
    }
  }

  function toggleCreationLike() {
    if (!activeCreationId) return;
    const profileId = getActiveProfileId();
    if (!profileId) return;
    const creations = ESHU_DB.getTable('creations') || [];
    const creation = creations.find(c => c.id === activeCreationId);
    if (!creation) return;
    creation.likedBy = Array.isArray(creation.likedBy) ? creation.likedBy : [];
    const idx = creation.likedBy.indexOf(profileId);
    if (idx >= 0) creation.likedBy.splice(idx, 1);
    else creation.likedBy.push(profileId);
    ESHU_DB.setTable('creations', creations);
    updateLikedState(creation);
  }

  function toggleCreationFollow() {
    if (!activeCreationId) return;
    const profileId = getActiveProfileId();
    if (!profileId) return;
    const creations = ESHU_DB.getTable('creations') || [];
    const creation = creations.find(c => c.id === activeCreationId);
    if (!creation) return;
    creation.followedBy = Array.isArray(creation.followedBy) ? creation.followedBy : [];
    const idx = creation.followedBy.indexOf(profileId);
    if (idx >= 0) creation.followedBy.splice(idx, 1);
    else creation.followedBy.push(profileId);
    ESHU_DB.setTable('creations', creations);
    updateFollowedState(creation);
  }

  function setupDetailsNavigation() {
    const detailsBtn = document.getElementById('focusDetailsBtn');
    if (!detailsBtn) return;
    detailsBtn.addEventListener('click', () => {
      if (!activeCreationId) return;
      const query = new URLSearchParams();
      query.set('id', activeCreationId);
      query.set('returnTo', 'creation-focus.html');
      const backContext = getReturnContextQuery();
      if (backContext) query.set('returnContext', backContext);
      window.location.href = `creation-details.html?${query.toString()}`;
    });
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function getActiveProfileId() {
    return getActiveProfile()?.id || ESHU_DB.getValue('currentProfileId') || null;
  }

  function initNavProfile() {
    const activeProfile = getActiveProfile();
    const profileNameNav = document.getElementById('profileNameNav');
    const profileBtn = document.getElementById('profileBtn');
    const fallbackName = ESHU_DB.getValue('profileName') || 'Player';
    const displayName = activeProfile?.name || fallbackName;

    if (profileNameNav) {
      profileNameNav.textContent = displayName;
    }

    if (profileBtn) {
      if (activeProfile?.image) {
        profileBtn.innerHTML = `<img src="${activeProfile.image}" alt="${displayName}">`;
      } else {
        profileBtn.innerHTML = '';
      }
      if (profileBtn.dataset.profileNavBound !== 'true') {
        profileBtn.addEventListener('click', () => {
          window.location.href = 'profile.html';
        });
        profileBtn.dataset.profileNavBound = 'true';
      }
    }
  }

  function getCreationId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function getReturnContextQuery() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    const gameId = params.get('gameId');
    const mode = params.get('mode');
    const sourceGroupId = params.get('sourceGroupId');
    const next = new URLSearchParams();
    if (from) next.set('from', from);
    if (gameId) next.set('gameId', gameId);
    if (mode) next.set('mode', mode);
    if (sourceGroupId) next.set('sourceGroupId', sourceGroupId);
    return next.toString();
  }

  let activeCreationId = null;
  let commentsInitialized = false;

  function buildCreationFallbackMarkup(creation, gameName, hostGame) {
    const title = creation.title || creation.name || 'Untitled';
    const authorName = creation.authorName || creation.author || 'Player';
    const desc = creation.description || 'No description';
    const votes = creation.votes || 0;
    const burns = creation.burns || 0;
    const devices = creation.devices || '—';
    const tags = creation.tags || '—';
    const privacy = creation.privacy || 'public';
    const gameDesc = hostGame?.description || '';
    const gameRules = hostGame?.rules || '';

    return `
      <div class="creation-fallback-card">
        <div class="creation-fallback-title">${title}</div>
        <div class="creation-fallback-meta">Player: ${authorName}</div>
        <div class="creation-fallback-meta">Game: ${gameName}</div>
        <div class="creation-fallback-meta">Votes: ${votes} · Burns: ${burns} · Privacy: ${privacy}</div>
        <div class="creation-fallback-meta">Devices: ${devices}</div>
        <div class="creation-fallback-meta">Tags: ${tags}</div>
        <div class="creation-fallback-desc">${desc}</div>
        ${gameDesc ? `<div class="creation-fallback-extra">Game Description: ${gameDesc}</div>` : ''}
        ${gameRules ? `<div class="creation-fallback-extra">Game Rules: ${gameRules}</div>` : ''}
      </div>
    `;
  }

  function renderCreationDisplay() {
    if (!activeCreationId) return;
    const selected = ESHU_DB.getEntityById('creations', activeCreationId) || { name: 'No Creation', description: '' };
    const displayName = selected.status === 'burned' ? 'BURNED' : (selected.name || 'No Creation');
    const displayDesc = selected.status === 'burned' ? '' : (selected.description || '');
    const authorName = selected.authorName || selected.author || 'Player';
    const games = ESHU_DB.getTable('games') || [];
    const hostGame = games.find(g => g.id === selected.hostGameId || g.id === selected.gameId);
    const gameName = hostGame?.name || selected.hostGameId || selected.gameId || '—';
    const creationDisplay = document.getElementById('creationDisplay');
    const creationImage = document.getElementById('creationImage');
    const overlayTitle = document.getElementById('focusOverlayTitle');
    const overlayAuthor = document.getElementById('focusOverlayAuthor');
    const overlayGame = document.getElementById('focusOverlayGame');
    const headerTitle = document.getElementById('focusHeaderTitle');
    const headerAuthor = document.getElementById('focusHeaderAuthor');
    const headerGame = document.getElementById('focusHeaderGame');
    if (creationDisplay) {
      creationDisplay.textContent = `${displayName}\n${displayDesc}`;
      creationDisplay.classList.remove('fallback-active');
      creationDisplay.style.display = 'none';
    }
    if (overlayTitle) overlayTitle.textContent = displayName;
    if (overlayAuthor) overlayAuthor.textContent = authorName;
    if (overlayGame) overlayGame.textContent = gameName;
    if (headerTitle) headerTitle.textContent = displayName;
    if (headerAuthor) headerAuthor.textContent = authorName;
    if (headerGame) headerGame.textContent = gameName;

    // Make the game chips clickable to navigate to the host game front
    [headerGame, overlayGame].forEach((el) => {
      if (!el) return;
      if (hostGame && hostGame.id) {
        el.style.cursor = 'pointer';
        el.style.textDecoration = 'underline';
        el.title = `Go to "${hostGame.name || 'host game'}"`;
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          goToHostGame(hostGame);
        };
      } else {
        el.style.cursor = '';
        el.style.textDecoration = '';
        el.title = '';
        el.onclick = null;
      }
    });

    // Make the player chips clickable to navigate to that player's home feed
    const authorProfileId = selected.authorProfileId || selected.ownerProfileId || selected.createdByProfileId || null;
    [headerAuthor, overlayAuthor].forEach((el) => {
      if (!el) return;
      if (authorProfileId) {
        el.style.cursor = 'pointer';
        el.style.textDecoration = 'underline';
        el.title = `View ${authorName}'s profile`;
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          goToPlayerProfile(authorProfileId);
        };
      } else {
        el.style.cursor = '';
        el.style.textDecoration = '';
        el.title = '';
        el.onclick = null;
      }
    });

    // Point the nav "Play Game" link at this creation's host game
    updatePlayLinkForGame(hostGame);

    // Render award badge for winning creations
    renderAwardBadge(selected);

    // Update liked/followed indicators
    updateLikedState(selected);
    updateFollowedState(selected);

    // Apply stored background color to the image container
    const imageBox = creationImage?.closest('.image-box');
    if (imageBox) {
      imageBox.style.background = selected.bgColor || '';
    }

    if (!creationImage) return;

    const hasVisual = !!(selected.image || selected.imageRef?.id);
    if (!hasVisual) {
      creationImage.removeAttribute('src');
      creationImage.style.display = 'none';
      if (creationDisplay) {
        creationDisplay.innerHTML = buildCreationFallbackMarkup(selected, gameName, hostGame);
        creationDisplay.classList.add('fallback-active');
        creationDisplay.style.display = 'block';
      }
      return;
    }

    creationImage.src = selected.image || '';
    creationImage.style.display = selected.image ? 'block' : 'none';
    if (creationDisplay) {
      creationDisplay.classList.remove('fallback-active');
      creationDisplay.style.display = 'none';
    }
    if (window.ESHU_IMAGE_VIEWER) window.ESHU_IMAGE_VIEWER.attach(creationImage);

    if (window.ESHU_MEDIA?.resolveCreationImageSrc) {
      window.ESHU_MEDIA.resolveCreationImageSrc(selected)
        .then(src => {
          if (!src) return;
          creationImage.src = src;
          creationImage.style.display = 'block';
          if (creationDisplay) {
            creationDisplay.classList.remove('fallback-active');
            creationDisplay.style.display = 'none';
          }
          if (window.ESHU_IMAGE_VIEWER) window.ESHU_IMAGE_VIEWER.attach(creationImage);
        })
        .catch(() => {
          if (!selected.image) {
            creationImage.style.display = 'none';
            if (creationDisplay) {
              creationDisplay.innerHTML = buildCreationFallbackMarkup(selected, gameName, hostGame);
              creationDisplay.classList.add('fallback-active');
              creationDisplay.style.display = 'block';
            }
          }
        });
    }
  }

  function renderAwardBadge(selected) {
    const badgeEl = document.getElementById('focusAwardBadge');
    if (!badgeEl) return;
    
    // Check if creation has an award
    if (selected?.awardRank && selected.awardRank > 0) {
      const rank = selected.awardRank;
      const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
      const label = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';
      const competition = selected.awardCompetition || 'Competition';
      
      badgeEl.innerHTML = `<div class="award-diamond ${cls}" title="${label} Place — ${competition}"></div>`;
      badgeEl.style.display = 'block';
    } else {
      badgeEl.style.display = 'none';
      badgeEl.innerHTML = '';
    }
  }

  function getCreationCommentsStorageKey(creationId) { return `comments_${creationId}`; }

  function loadCreation() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (!id) {
      console.warn('No creation ID in URL');
      return;
    }
    activeCreationId = id;
    const selected = ESHU_DB.getEntityById('creations', id);
    if (!selected) {
      console.warn('Creation not found in local DB:', id);
      return;
    }
    renderCreationDisplay();
    if (activeCreationId && !commentsInitialized) {
      setupComments('commentForm', 'commentInput', 'commentSection', activeCreationId, 'commentCount');
      commentsInitialized = true;
    }
  }

  function escapeCommentHtml(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCommentTimestamp(ts) {
    if (!ts) return 'Unknown time';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'Unknown time';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function loadCreationComments(creationId) {
    if (!creationId) return [];
    const key = getCreationCommentsStorageKey(creationId);
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((c, index) => {
          if (typeof c === 'string') {
            return {
              id: `creation_comment_${creationId}_${index}_${Date.now()}`,
              text: c,
              authorProfileId: null,
              authorName: 'Legacy',
              timestamp: Date.now(),
              status: 'active'
            };
          }
          return {
            id: c?.id || `creation_comment_${creationId}_${index}_${Date.now()}`,
            text: c?.text || '',
            authorProfileId: c?.authorProfileId || c?.ownerProfileId || c?.createdByProfileId || c?.authorId || null,
            authorName: c?.authorName || c?.author || 'Player',
            timestamp: c?.timestamp || c?.createdAt || Date.now(),
            status: c?.status || 'active',
            likedBy: Array.isArray(c?.likedBy) ? c.likedBy : [],
            followedBy: Array.isArray(c?.followedBy) ? c.followedBy : [],
            editedAt: c?.editedAt || null,
            animation: extractCommentAnimation(c),
            animationImageUrl: c?.animationImageUrl || c?.imageUrl || ''
          };
        })
        .filter(c => c && ((typeof c.text === 'string' && c.text.trim()) || hasCommentAnimation(c)))
        .filter(c => c.status !== 'deleted' && c.status !== 'burned')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (err) {
      console.warn('Failed to load creation comments:', err);
      return [];
    }
  }

  function saveCreationComments(creationId, comments) {
    if (!creationId) return;
    const key = getCreationCommentsStorageKey(creationId);
    localStorage.setItem(key, JSON.stringify(comments || []));
  }

  function bindCreationCommentCardActions(section, creationId, activeProfileId, rerender) {
    if (!section || !creationId || !window.ESHU_COMMENT_ACTIONS?.bindThreadCardActions) return;
    const bindingKey = `creation:${creationId}`;
    if (section.dataset.commentActionsBoundFor === bindingKey) return;
    if (typeof section._unbindCommentActions === 'function') {
      section._unbindCommentActions();
    }
    section._unbindCommentActions = window.ESHU_COMMENT_ACTIONS.bindThreadCardActions({
      containerEl: section,
      getThreadIdFromCard: () => creationId,
      loadThreadComments: (threadId) => loadCreationComments(threadId),
      makeTarget: (threadId) => ({ kind: 'creation', id: threadId }),
      toggleLike: ({ comment, comments }) => {
        const profileId = activeProfileId;
        comment.likedBy = Array.isArray(comment.likedBy) ? comment.likedBy : [];
        const idx = comment.likedBy.indexOf(profileId);
        if (idx >= 0) comment.likedBy.splice(idx, 1);
        else comment.likedBy.push(profileId);
        saveCreationComments(creationId, comments);
      },
      toggleFollow: ({ comment, comments }) => {
        const profileId = activeProfileId;
        comment.followedBy = Array.isArray(comment.followedBy) ? comment.followedBy : [];
        const idx = comment.followedBy.indexOf(profileId);
        if (idx >= 0) comment.followedBy.splice(idx, 1);
        else comment.followedBy.push(profileId);
        saveCreationComments(creationId, comments);
      },
      applyStatus: ({ action, comment, comments }) => {
        if (action === 'burn') comment.status = 'burned';
        else if (action === 'clear') comment.status = 'deleted';
        else if (action === 'boot') comment.status = 'active';
        saveCreationComments(creationId, comments);
      },
      onStatusChanged: (action) => {
        // Only re-render for status changes that affect visibility (burn/boot/clear)
        // Like/Follow don't need re-render as button states are updated by bindThreadCardActions
        if (action === 'burn' || action === 'boot' || action === 'clear') {
          rerender();
        }
      },
    });
    section.dataset.commentActionsBoundFor = bindingKey;
  }

  function setupComments(formId, inputId, sectionId, creationId, countId) {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const section = document.getElementById(sectionId);
    const count = countId ? document.getElementById(countId) : null;
    if (!form || !input || !section || !creationId) return;

    function render() {
      const comments = loadCreationComments(creationId);
      if (count) {
        count.textContent = `${comments.length} comment${comments.length === 1 ? '' : 's'}`;
      }

      if (comments.length === 0) {
        section.innerHTML = '<div class="comment-empty">No comments yet.</div>';
        return;
      }

      const activeProfileId = getActiveProfileId();
      section.innerHTML = comments.map((comment, idx) => {
        const text = comment.text || '';
        const hasAnim = hasCommentAnimation(comment);
        const isOwner = comment.authorProfileId && comment.authorProfileId === activeProfileId;
        const isLiked = (comment.likedBy || []).includes(activeProfileId);
        const isFollowed = (comment.followedBy || []).includes(activeProfileId);
        const isBurned = comment.status === 'burned';
        const isDeleted = comment.status === 'deleted';

        let expandBtns = '';
        if (isOwner && !isBurned && !isDeleted) {
          expandBtns += '<button type="button" class="u-card-btn comment-edit-btn" data-comment-idx="' + idx + '">' + PENCIL_SVG + ' Edit</button>';
          expandBtns += '<button type="button" class="u-card-btn dark" data-action="clear" data-comment-idx="' + idx + '">Boot</button>';
        }
        if (isOwner && isDeleted) {
          expandBtns += '<button type="button" class="u-card-btn" data-action="boot" data-comment-idx="' + idx + '">Restore</button>';
          expandBtns += '<button type="button" class="u-card-btn danger" data-action="burn" data-comment-idx="' + idx + '">Delete</button>';
        }

        return `
        <div class="u-card${isBurned ? ' burned' : ''}${isDeleted ? ' deleted' : ''}" data-comment-idx="${idx}">
          <div class="u-card-body">
            <div class="u-card-thumb">${isBurned ? CLOSE_SVG : CHAT_SVG}</div>
            <div class="u-card-content">
              <div class="u-card-title">${escapeCommentHtml(comment.authorName || 'Player')}</div>
              <div class="u-card-subtitle">${formatCommentTimestamp(comment.timestamp)}</div>
              <div class="u-card-desc">${escapeCommentHtml(text)}${hasAnim ? ' <button type="button" class="comment-animation-badge" data-anim-idx="' + idx + '"></button>' : ''}</div>
            </div>
            <div class="u-card-indicators">
              <span class="u-card-ind liked${isLiked ? ' active' : ''}" title="Liked">${HEART_SVG}</span>
              <span class="u-card-ind followed${isFollowed ? ' active' : ''}" title="Followed">${FOLLOW_ARROW_SVG}</span>
            </div>
            <button type="button" class="u-card-options-btn" title="Options">${COG_SVG}</button>
          </div>
          <div class="u-card-expand">
            <div class="u-card-actions">
              <button type="button" class="u-card-like-btn${isLiked ? ' active' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">${HEART_SVG}</button>
              <button type="button" class="u-card-follow-btn${isFollowed ? ' active' : ''}" title="${isFollowed ? 'Unfollow' : 'Follow'}">${FOLLOW_ARROW_SVG}</button>
              ${expandBtns}
            </div>
          </div>
        </div>
      `;
      }).join('');

      // Cog button - edit own comments, or show expanded actions for others
      section.querySelectorAll('.u-card-options-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = btn.closest('.u-card');
          if (card.classList.contains('burned') && typeof BURNED_MODAL !== 'undefined') {
            BURNED_MODAL.open({}, 'comments'); return;
          }
          const idx = parseInt(card.dataset.commentIdx, 10);
          const allComments = loadCreationComments(creationId);
          const comment = allComments[idx];
          if (!comment) return;
          
          const isOwner = comment.authorProfileId === activeProfileId;
          const isDeleted = comment.status === 'deleted';
          const isBurned = comment.status === 'burned';
          
          // If it's the user's own active comment, go straight to edit mode
          if (isOwner && !isDeleted && !isBurned) {
            const descEl = card.querySelector('.u-card-desc');
            const origText = comment.text || '';
            card.classList.add('editing', 'expanded');
            descEl.innerHTML = `
              <textarea class="comment-edit-input" maxlength="1000">${escapeCommentHtml(origText)}</textarea>
              <div class="comment-edit-actions">
                <button type="button" class="u-card-btn comment-edit-cancel">Cancel</button>
                <button type="button" class="u-card-btn dark comment-edit-save">Save</button>
              </div>
            `;
            const textarea = descEl.querySelector('.comment-edit-input');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            
            // Save handler
            const saveBtn = descEl.querySelector('.comment-edit-save');
            saveBtn.addEventListener('click', () => {
              const newText = textarea.value.trim().slice(0, 1000);
              comment.text = newText;
              saveCreationComments(creationId, allComments);
              render();
              if (typeof TOAST !== 'undefined') TOAST.success('Comment updated');
            });
            
            // Cancel handler
            const cancelBtn = descEl.querySelector('.comment-edit-cancel');
            cancelBtn.addEventListener('click', () => render());
            return;
          }
          
          // Otherwise, just toggle expanded actions
          card.classList.toggle('expanded');
        });
      });

      bindCreationCommentCardActions(section, creationId, activeProfileId, render);

      // Edit
      section.querySelectorAll('.comment-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = btn.closest('.u-card');
          const idx = parseInt(item.dataset.commentIdx, 10);
          const allComments = loadCreationComments(creationId);
          const comment = allComments[idx];
          if (!comment) return;
          const descEl = item.querySelector('.u-card-desc');
          const origText = comment.text || '';
          item.classList.add('editing', 'expanded');
          descEl.innerHTML = `
            <textarea class="comment-edit-input" maxlength="1000">${escapeCommentHtml(origText)}</textarea>
            <div class="comment-edit-actions">
              <button type="button" class="u-card-btn comment-edit-cancel">Cancel</button>
              <button type="button" class="u-card-btn dark comment-edit-save">Save</button>
            </div>
          `;
          const textarea = descEl.querySelector('.comment-edit-input');
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          const saveEdit = () => {
            const newText = textarea.value.trim().slice(0, 1000);
            if (newText) { allComments[idx].text = newText; allComments[idx].editedAt = Date.now(); saveCreationComments(creationId, allComments); }
            render();
          };
          textarea.onkeydown = (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); saveEdit(); }
            if (ev.key === 'Escape') render();
          };
          descEl.querySelector('.comment-edit-cancel').onclick = () => render();
          descEl.querySelector('.comment-edit-save').onclick = saveEdit;
        });
      });
    }

    function openFocusCommentOptionsModal(entityId, idx, rerenderFn) {
      const allComments = loadCreationComments(entityId);
      const comment = allComments[idx];
      if (!comment) return;
      const activeProfileId = getActiveProfileId();
      const isOwner = comment.authorProfileId && comment.authorProfileId === activeProfileId;
      const isLiked = (comment.likedBy || []).includes(activeProfileId);
      const isFollowed = (comment.followedBy || []).includes(activeProfileId);
      const isBurned = comment.status === 'burned';

      let modal = document.getElementById('commentOptionsModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'commentOptionsModal';
        modal.className = 'comment-options-modal';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
      <div class="comment-options-panel">
        <div class="comment-options-title">Comment Options</div>
        <div class="comment-options-list">
          ${isOwner && !isBurned ? `<button type="button" class="comment-option-btn" data-action="edit">
            <span class="opt-icon">${PENCIL_SVG}</span> Edit
          </button>` : ''}
          <button type="button" class="comment-option-btn" data-action="like">
            <span class="opt-icon">${HEART_SVG}</span> ${isLiked ? 'Unlike' : 'Like'}
          </button>
          <button type="button" class="comment-option-btn" data-action="follow">
            <span class="opt-icon">${FOLLOW_ARROW_SVG}</span> ${isFollowed ? 'Unfollow' : 'Follow'}
          </button>
          ${isOwner && !isBurned ? `<button type="button" class="comment-option-btn danger" data-action="burn">
            <span class="opt-icon">🔥</span> Burn
          </button>` : ''}
          ${isOwner && isBurned ? `<button type="button" class="comment-option-btn" data-action="restore">
            <span class="opt-icon">↩</span> Restore
          </button>` : ''}
        </div>
        <button type="button" class="comment-options-close">Close</button>
      </div>
    `;

      modal.classList.add('open');
      modal.querySelector('.comment-options-close').onclick = () => modal.classList.remove('open');
      modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

      modal.querySelectorAll('.comment-option-btn').forEach(optBtn => {
        optBtn.onclick = () => {
          const action = optBtn.dataset.action;
          if (action === 'edit') {
            modal.classList.remove('open');
            triggerCommentInlineEdit(comment, document.querySelector(`.u-card[data-comment-idx="${idx}"]`));
            return;
          } else if (action === 'like') {
            comment.likedBy = comment.likedBy || [];
            if (isLiked) {
              comment.likedBy = comment.likedBy.filter(id => id !== activeProfileId);
            } else {
              comment.likedBy.push(activeProfileId);
            }
          } else if (action === 'follow') {
            comment.followedBy = comment.followedBy || [];
            if (isFollowed) {
              comment.followedBy = comment.followedBy.filter(id => id !== activeProfileId);
            } else {
              comment.followedBy.push(activeProfileId);
            }
          } else if (action === 'burn') {
            comment.status = 'burned';
          } else if (action === 'restore') {
            comment.status = 'active';
          }
          saveCreationComments(entityId, allComments);
          modal.classList.remove('open');
          rerenderFn();
        };
      });
    }

    input.maxLength = 1000;

    form.onsubmit = async (e) => {
      e.preventDefault();

      if (window.MESSAGES_GATE && !window.MESSAGES_GATE.canComment()) {
        const needed = window.MESSAGES_GATE.COMMENTS_UNLOCK_XP || 3;
        if (typeof TOAST !== 'undefined') TOAST.error('You need at least ' + needed + ' XP to comment.');
        return;
      }

      const text = input.value.trim().slice(0, 1000);
      if (!text && !pendingAnimation) return;

      const activeProfile = getActiveProfile();
      const activeProfileId = getActiveProfileId();
      const nextComment = {
        id: `creation_comment_${creationId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: text || (pendingAnimation ? '(animation)' : ''),
        authorProfileId: activeProfileId,
        authorName: activeProfile?.name || ESHU_DB.getValue('profileName') || 'Player',
        timestamp: Date.now(),
        status: 'active'
      };
      if (pendingAnimation) {
        nextComment.animation = pendingAnimation;
        nextComment.animationImageUrl = pendingAnimationImageUrl || getCurrentCreationImageUrl();
        pendingAnimation = null;
        pendingAnimationImageUrl = '';
      }

      const existing = loadCreationComments(creationId);
      saveCreationComments(creationId, [nextComment, ...existing]);
      input.value = '';
      // Clear the drawing attached indicator
      input.placeholder = 'Add a comment...';
      input.classList.remove('has-pending-animation');
      render();
      const kind = nextComment.animation ? 'comment_animated' : 'comment_posted';
      const awardResult = await ESHU_API.xp.awardSafe(kind, nextComment.id);
      xpPoints = awardResult.xpPoints;
      if (window.XP_ANIM && awardResult.delta > 0) XP_ANIM.show(awardResult.delta);
    };

    input.onkeydown = (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    };

    // Expose render so the animation-save callback can refresh the list
    commentsRerender = render;

    // Animation play badge handler (delegated)
    section.addEventListener('click', async (e) => {
      const badge = e.target.closest('.comment-animation-badge');
      if (!badge) return;
      e.stopPropagation();
      const idx = parseInt(badge.dataset.animIdx, 10);
      const all = loadCreationComments(creationId);
      const c = all[idx];
      const anim = extractCommentAnimation(c);
      if (anim) {
        // Resolve image URL fresh to ensure it's valid (handles expired blob URLs)
        let imageUrl = c.animationImageUrl;
        if (!imageUrl || imageUrl.startsWith('blob:')) {
          imageUrl = await resolveCreationImageUrl();
        }
        if (!imageUrl) {
          imageUrl = getCurrentCreationImageUrl();
        }
        openAnimationPlayer(anim, imageUrl);
      }
    });

    render();
  }

  const drawBtn = document.getElementById('drawBtn');
  if (drawBtn) {
    drawBtn.addEventListener('click', async () => {
      await toggleDrawOverlay();
    });
  }
  setupDetailsNavigation();
  setupQuickOverlayActions();

  // Fullscreen toggle
  const fsBtn = document.querySelector('.fullscreen-btn');
  const imageBox = document.querySelector('.image-box');
  let fullscreenUiTimer = null;

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  function isImageBoxFullscreen() {
    return getFullscreenElement() === imageBox;
  }

  function revealFullscreenUi() {
    if (!isImageBoxFullscreen()) return;
    imageBox.classList.add('fullscreen-ui-visible');
    if (fullscreenUiTimer) clearTimeout(fullscreenUiTimer);
    fullscreenUiTimer = setTimeout(() => {
      imageBox.classList.remove('fullscreen-ui-visible');
    }, 1600);
  }

  const FS_ICON_ENTER = '<path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4h-4v2h6v-6h-2v4z"/>';
  const FS_ICON_EXIT  = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';

  function syncFullscreenUiState() {
    const icon = document.getElementById('fullscreenIcon');
    if (isImageBoxFullscreen()) {
      fsBtn.classList.add('is-exit');
      if (icon) icon.innerHTML = FS_ICON_EXIT;
      revealFullscreenUi();
      return;
    }

    fsBtn.classList.remove('is-exit');
    if (icon) icon.innerHTML = FS_ICON_ENTER;
    imageBox.classList.remove('fullscreen-ui-visible');
    if (fullscreenUiTimer) {
      clearTimeout(fullscreenUiTimer);
      fullscreenUiTimer = null;
    }
  }

  if (fsBtn && imageBox) {
    fsBtn.addEventListener('click', () => {
      if (!isImageBoxFullscreen()) {
        if (imageBox.requestFullscreen) imageBox.requestFullscreen();
        else if (imageBox.webkitRequestFullscreen) imageBox.webkitRequestFullscreen();
        else if (imageBox.msRequestFullscreen) imageBox.msRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      }
    });
    ['mousemove', 'click', 'touchstart'].forEach(eventName => {
      imageBox.addEventListener(eventName, () => {
        if (isImageBoxFullscreen()) revealFullscreenUi();
      });
    });
    document.addEventListener('fullscreenchange', syncFullscreenUiState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenUiState);
    document.addEventListener('MSFullscreenChange', syncFullscreenUiState);
    syncFullscreenUiState();
  }

  // Comment section minimize/maximize toggle
  const commentToggleBtn = document.getElementById('commentToggleBtn');
  if (commentToggleBtn) {
    const commentSection = document.getElementById('commentSection');
    const commentForm = document.getElementById('commentForm');
    let commentsCollapsed = false;
    commentToggleBtn.addEventListener('click', () => {
      commentsCollapsed = !commentsCollapsed;
      if (commentSection) commentSection.style.display = commentsCollapsed ? 'none' : '';
      if (commentForm) commentForm.style.display = commentsCollapsed ? 'none' : '';
      commentToggleBtn.classList.toggle('is-expanded', commentsCollapsed);
      commentToggleBtn.title = commentsCollapsed ? 'Expand comments' : 'Minimize comments';
    });
  }

  // Close button — go back to previous page
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'creations.html';
      }
    });
  }

  window.onload = loadCreation;

  initNavProfile();

  ESHU_DB.subscribe(() => {
    initNavProfile();
    renderCreationDisplay();
  });
})();
