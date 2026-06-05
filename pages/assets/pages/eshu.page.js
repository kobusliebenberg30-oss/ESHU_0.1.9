(function () {
  'use strict';

  /* ===== NAVIGATION SETUP ===== */
  ESHU_DB.ensure();
  
  // XP Counter
  const xpCounter = document.getElementById('xpCounter');
  let xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
  function updateXPDisplay() {
    xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
    if (xpCounter) xpCounter.textContent = xpPoints + ' XP';
  }
  updateXPDisplay();
  function updateXP(amount, reason) { 
    xpPoints = ESHU_DB.addProfileXp(amount || 1, ESHU_DB.getActiveProfileId(), reason || 'XP earned');
    updateXPDisplay();
    if (window.XP_ANIM) XP_ANIM.show(amount || 1);
  }

  // Builds diamond-framed game image markup (img clipped to diamond, cap+outline overlaid)
  function buildDiamondImageSvg(imageUrl) {
    const safeUrl = String(imageUrl || '').replace(/"/g, '&quot;');
    return `
      <div class="diamond-image-frame">
        <img class="diamond-image-inner" src="${safeUrl}" alt="" />
        <svg class="diamond-image-overlay" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="#000" stroke-linejoin="miter" stroke-linecap="butt">
            <polyline points="215,470 512,174 809,470" stroke-width="78" />
            <polygon points="512,312 790,590 512,868 234,590" stroke-width="44" />
          </g>
        </svg>
      </div>
    `;
  }

  // Messages Dropdown
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

  // Profile Button & Name Display
  const profileBtn = document.getElementById('profileBtn');
  const profileNameNav = document.getElementById('profileNameNav');
  const runtime = window.ESHU_RUNTIME;

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function getActiveProfileId() {
    return getActiveProfile()?.id || ESHU_DB.getValue('currentProfileId') || null;
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
  
  function loadProfileDisplay() {
    const profile = getActiveProfile() || ESHU_DB.getValue('userProfile') || {};
    if (profileNameNav) {
      profileNameNav.textContent = profile.name || 'Player';
    }
    if (profileBtn && profile.image) {
      profileBtn.innerHTML = `<img src="${profile.image}" alt="Profile">`;
    }
  }
  loadProfileDisplay();

  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
  }

  /* Elements */
  const leftChoiceBtn = document.getElementById('leftChoiceBtn');
  const rightChoiceBtn = document.getElementById('rightChoiceBtn');
  const leftSide = document.getElementById('leftSide');
  const rightSide = document.getElementById('rightSide');
  const leftCross = document.getElementById('leftCross');
  const rightCross = document.getElementById('rightCross');
  const currentGameThumbBtn = document.getElementById('currentGameThumbBtn');
  const currentGameThumbImage = document.getElementById('currentGameThumbImage');
  const currentGameThumbFallback = document.getElementById('currentGameThumbFallback');
  const currentGameThumbTitle = document.getElementById('currentGameThumbTitle');
  const currentGameInfoModal = document.getElementById('currentGameInfoModal');
  const currentGameInfoClose = document.getElementById('currentGameInfoClose');
  const currentGameInfoImageBtn = document.getElementById('currentGameInfoImageBtn');
  const currentGameInfoImage = document.getElementById('currentGameInfoImage');
  const currentGameInfoFallback = document.getElementById('currentGameInfoFallback');
  const currentGameInfoTitle = document.getElementById('currentGameInfoTitle');
  const currentGameInfoMeta = document.getElementById('currentGameInfoMeta');
  const currentGameResumeBtn = document.getElementById('currentGameResumeBtn');
  let currentGameId = null; let nextReady = false;
  let leftCreationId = null; let rightCreationId = null;
  let leftCreationRef = null; let rightCreationRef = null;
  let currentGameMode = 'arena';
  let randomGameQueue = [];
  const bookCursorByGame = {};
  const GAME_VOTE_USAGE_KEY = 'gameVoteUsageByProfile';

  function getSourceGroupIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('sourceGroupId') || '';
  }

  function getCurrentGame() {
    if (!currentGameId) return null;
    const game = ESHU_DB.getEntityById('games', currentGameId);
    if (!game || !ESHU_DB.isEntityActive(game)) return null;
    return game;
  }

  function creationBelongsToGame(creation, gameId) {
    return !!(creation && gameId && (creation.hostGameId || creation.gameId) === gameId);
  }

  function resolveGameImage(game) {
    if (!game) return '';
    return game.image || game.thumbnail || game.coverImage || '';
  }

  function setImageOrFallback(imageEl, fallbackEl, src) {
    if (!imageEl || !fallbackEl) return;
    if (src) {
      imageEl.src = src;
      imageEl.style.display = 'block';
      fallbackEl.style.display = 'none';
      return;
    }
    imageEl.removeAttribute('src');
    imageEl.style.display = 'none';
    fallbackEl.style.display = 'flex';
  }

  function formatCountdownShort(ms) {
    if (ms == null) return '';
    if (ms <= 0) return 'now';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  }

  function buildGameInfoRows(game) {
    if (!game) return '';
    const modeLabel = game.gameType === 'book' ? 'Book' : 'Arena';
    const groupName = getGroups().find(group => group.id === game.hostGroupId)?.name || 'No Group';
    const privacyLabel = (game.privacy || '').toLowerCase() === 'private' ? 'Private' : 'Public';
    const remaining = getRemainingVotes(game.id);
    const total = getGameVoteCap(game.id);

    const now = Date.now();
    const notStarted = game.startTime && now < game.startTime;
    const hasEnded = !!(game.endTime && now >= game.endTime);

    let phase;
    let phaseClass;
    if (game.status === 'burned') { phase = 'Burned'; phaseClass = 'burned'; }
    else if (game.status === 'booted') { phase = 'Booted'; phaseClass = 'booted'; }
    else if (hasEnded) { phase = 'Game Over'; phaseClass = 'ended'; }
    else if (notStarted) { phase = `Starts in ${formatCountdownShort(game.startTime - now)}`; phaseClass = 'starting'; }
    else { phase = 'Live'; phaseClass = 'live'; }

    let subsText = '—';
    if (!hasEnded && game.submissionCloseTime) {
      subsText = now < game.submissionCloseTime
        ? `Closes in ${formatCountdownShort(game.submissionCloseTime - now)}`
        : 'Closed';
    } else if (!game.submissionCloseTime) {
      subsText = 'Open';
    }

    let endsText = '—';
    if (hasEnded) endsText = 'Over';
    else if (game.endTime) endsText = `in ${formatCountdownShort(game.endTime - now)}`;
    else endsText = 'Infinite';

    const escape = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    return `
      <div class="cgi-row cgi-phase ${phaseClass}"><span class="cgi-dot"></span>${escape(phase)}</div>
      <div class="cgi-grid">
        <div class="cgi-row"><span class="cgi-label">Mode</span><span class="cgi-value">${escape(modeLabel)}</span></div>
        <div class="cgi-row"><span class="cgi-label">Group</span><span class="cgi-value">${escape(groupName)}</span></div>
        <div class="cgi-row"><span class="cgi-label">Privacy</span><span class="cgi-value">${escape(privacyLabel)}</span></div>
        <div class="cgi-row"><span class="cgi-label">Votes left</span><span class="cgi-value">${remaining === Infinity ? '∞' : remaining + '/' + total}</span></div>
        <div class="cgi-row"><span class="cgi-label">Submissions</span><span class="cgi-value">${escape(subsText)}</span></div>
        <div class="cgi-row"><span class="cgi-label">Game ends</span><span class="cgi-value">${escape(endsText)}</span></div>
      </div>
    `;
  }

  function updateCurrentGameContext() {
const game = getCurrentGame();
const title = game?.name || (currentGameId ? 'Loading game…' : 'Select a game');
    if (currentGameInfoTitle) currentGameInfoTitle.textContent = title;

    if (currentGameInfoMeta) {
      if (game) {
        currentGameInfoMeta.innerHTML = buildGameInfoRows(game);
      } else if (currentGameId) {
        currentGameInfoMeta.textContent = 'Loading game details...';
      } else {
        currentGameInfoMeta.textContent = 'Choose a game to start playing in ESHU.';
      }
    }

    // Mirror the active game's name into the small tile button under
    // LEFT/RIGHT. Falls back to "Select game" when no game is loaded so
    // the control reads as a call-to-action.
    if (currentGameThumbTitle) {
      currentGameThumbTitle.textContent = game?.name || 'Select game';
    }

    const imageSrc = resolveGameImage(game);
    const thumbWrap = currentGameThumbBtn?.querySelector('.game-thumb-logo-wrap');
    if (thumbWrap) {
      if (imageSrc) {
        // Use diamond-framed game tile logo instead of raw image
        thumbWrap.innerHTML = buildDiamondImageSvg(imageSrc);
        thumbWrap.classList.add('has-image');
      } else {
        // Reset to original structure with empty image and visible fallback
        thumbWrap.innerHTML = `
          <img id="currentGameThumbImage" class="game-thumb-img" alt="Current game thumbnail">
          <svg class="game-thumb-logo-svg" id="currentGameThumbFallback" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linejoin="miter" stroke-linecap="butt">
              <polyline points="215,470 512,174 809,470" stroke-width="78"/>
              <polygon points="512,312 790,590 512,868 234,590" stroke-width="44"/>
            </g>
          </svg>
        `;
        thumbWrap.classList.remove('has-image');
      }
    }
    if (currentGameInfoImage) {
      if (imageSrc) {
        currentGameInfoImage.src = imageSrc;
        currentGameInfoImage.style.display = 'block';
      } else {
        currentGameInfoImage.removeAttribute('src');
        currentGameInfoImage.style.display = 'none';
      }
    }
    if (currentGameInfoFallback) currentGameInfoFallback.style.display = 'block';
  }

  let currentGameInfoTickId = null;
  function startCurrentGameInfoTicker() {
    stopCurrentGameInfoTicker();
    currentGameInfoTickId = setInterval(() => {
      if (!currentGameInfoModal || !currentGameInfoModal.classList.contains('open')) {
        stopCurrentGameInfoTicker();
        return;
      }
      updateCurrentGameContext();
    }, 1000);
  }
  function stopCurrentGameInfoTicker() {
    if (currentGameInfoTickId) { clearInterval(currentGameInfoTickId); currentGameInfoTickId = null; }
  }

  function openCurrentGameInfoModal() {
    if (!currentGameInfoModal) return;
    updateCurrentGameContext();
    currentGameInfoModal.classList.add('open');
    startCurrentGameInfoTicker();
  }

  function closeCurrentGameInfoModal() {
    if (!currentGameInfoModal) return;
    currentGameInfoModal.classList.remove('open');
    stopCurrentGameInfoTicker();
  }

  function openCurrentGameFrontPage() {
    const game = getCurrentGame();
    const gameId = game?.id || currentGameId;
    if (!gameId) return;
    const params = new URLSearchParams();
    params.set('view', 'front');
    params.set('gameId', gameId);
    const sourceGroupId = getSourceGroupIdFromUrl() || game?.hostGroupId || '';
    if (sourceGroupId) params.set('sourceGroupId', sourceGroupId);
    window.location.href = `games.html?${params.toString()}`;
  }

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

  const sideLoaderShownAt = { left: 0, right: 0 };
  const SIDE_LOADER_MIN_MS = 160;

  function getImageBoxLoader(side) {
    return document.getElementById(`${side}ImageBoxLoader`);
  }

  function setSideImageLoading(side, loading) {
    const loader = getImageBoxLoader(side);
    if (!loader) return;
    if (loading) {
      sideLoaderShownAt[side] = Date.now();
      loader.classList.add('active');
      loader.setAttribute('aria-hidden', 'false');
      return;
    }
    const elapsed = Date.now() - (sideLoaderShownAt[side] || 0);
    const hide = () => {
      loader.classList.remove('active');
      loader.setAttribute('aria-hidden', 'true');
    };
    if (elapsed < SIDE_LOADER_MIN_MS) {
      setTimeout(hide, SIDE_LOADER_MIN_MS - elapsed);
      return;
    }
    requestAnimationFrame(hide);
  }

  function bindCreationImageLoad(side, imageEl, expectedCreationId, onReady, onFail) {
    if (!imageEl) return;
    const cleanup = () => {
      imageEl.onload = null;
      imageEl.onerror = null;
    };
    imageEl.onload = () => {
      if (imageEl.dataset.creationId !== expectedCreationId) return;
      cleanup();
      setSideImageLoading(side, false);
      if (typeof onReady === 'function') onReady();
    };
    imageEl.onerror = () => {
      if (imageEl.dataset.creationId !== expectedCreationId) return;
      cleanup();
      setSideImageLoading(side, false);
      if (typeof onFail === 'function') onFail();
    };
  }

  function showCreationImage(side, imageEl, textEl, src) {
    if (!imageEl) return;
    imageEl.src = src;
    imageEl.style.display = 'block';
    if (textEl) {
      textEl.classList.remove('fallback-active');
      textEl.style.display = 'none';
    }
    if (window.ESHU_IMAGE_VIEWER) window.ESHU_IMAGE_VIEWER.attach(imageEl);
  }

  function showCreationFallback(side, imageEl, textEl, creation, gameName, hostGame) {
    if (imageEl) {
      imageEl.removeAttribute('src');
      imageEl.style.display = 'none';
    }
    if (textEl) {
      textEl.innerHTML = buildCreationFallbackMarkup(creation, gameName, hostGame);
      textEl.classList.add('fallback-active');
      textEl.style.display = 'block';
    }
  }

  function updateCreationVisual(side, creation) {
    const textEl = document.getElementById(`${side}Creation`);
    const imageEl = document.getElementById(`${side}CreationImage`);
    const titleEl = document.getElementById(`${side}OverlayTitle`);
    const authorEl = document.getElementById(`${side}OverlayAuthor`);
    const gameEl = document.getElementById(`${side}OverlayGame`);

    if (!creation) {
      setSideImageLoading(side, false);
      if (textEl) {
        textEl.textContent = '';
        textEl.classList.remove('fallback-active');
        textEl.style.display = 'none';
      }
      if (imageEl) {
        imageEl.onload = null;
        imageEl.onerror = null;
        delete imageEl.dataset.creationId;
        imageEl.removeAttribute('src');
        imageEl.style.display = 'none';
        const imageBox = imageEl.closest('.image-box');
        if (imageBox) imageBox.style.background = '';
      }
      if (titleEl) titleEl.textContent = 'Untitled';
      if (authorEl) authorEl.textContent = 'Player';
      if (gameEl) gameEl.textContent = '—';
      updateLikedState(side, null);
      updateFollowedState(side, null);
      updateVoteState(side, null);
      return;
    }

    const title = creation.title || creation.name || 'Untitled';
    const desc = creation.description || '';
    const authorName = creation.authorName || creation.author || 'Player';
    const games = ESHU_DB.getTable('games') || [];
    const hostGame = games.find(g => g.id === creation.hostGameId || g.id === creation.gameId);
    const gameName = hostGame?.name || creation.hostGameId || creation.gameId || '—';
    if (textEl) {
      textEl.textContent = `${title}\n${desc}`;
      textEl.classList.remove('fallback-active');
      textEl.style.display = 'none';
    }
    if (titleEl) titleEl.textContent = title;
    if (authorEl) authorEl.textContent = authorName;
    if (gameEl) gameEl.textContent = gameName;
    updateLikedState(side, creation);
    updateFollowedState(side, creation);
    updateVoteState(side, creation);

    // Apply creation's background color to the image-box container
    const imageBox = imageEl ? imageEl.closest('.image-box') : null;
    if (imageBox) imageBox.style.background = creation.bgColor || '';

    if (!imageEl) return;

    const hasVisual = !!(creation.image || creation.imageAssetId || creation.imageRef?.id);
    const expectedCreationId = creation.id || '';
    imageEl.dataset.creationId = expectedCreationId;
    if (!hasVisual) {
      setSideImageLoading(side, false);
      showCreationFallback(side, imageEl, textEl, creation, gameName, hostGame);
      return;
    }

    imageEl.onload = null;
    imageEl.onerror = null;
    imageEl.removeAttribute('src');
    imageEl.style.display = 'none';
    setSideImageLoading(side, true);
    if (textEl) {
      textEl.classList.remove('fallback-active');
      textEl.style.display = 'none';
    }

    const onImageReady = (src) => {
      if (imageEl.dataset.creationId !== expectedCreationId || !src) return;
      bindCreationImageLoad(
        side,
        imageEl,
        expectedCreationId,
        () => showCreationImage(side, imageEl, textEl, src),
        () => {
          if (creation.image) {
            showCreationImage(side, imageEl, textEl, creation.image);
          } else {
            showCreationFallback(side, imageEl, textEl, creation, gameName, hostGame);
          }
        },
      );
      imageEl.src = src;
      if (imageEl.complete && imageEl.naturalWidth > 0) {
        imageEl.onload = null;
        imageEl.onerror = null;
        setSideImageLoading(side, false);
        showCreationImage(side, imageEl, textEl, src);
      }
    };

    const resolveAndShow = () => {
      if (!window.ESHU_MEDIA?.resolveCreationImageSrc) {
        if (creation.image) {
          onImageReady(creation.image);
        } else {
          setSideImageLoading(side, false);
          showCreationFallback(side, imageEl, textEl, creation, gameName, hostGame);
        }
        return;
      }
      window.ESHU_MEDIA.resolveCreationImageSrc(creation)
        .then((src) => {
          if (imageEl.dataset.creationId !== expectedCreationId) return;
          if (src) {
            onImageReady(src);
            return;
          }
          if (creation.image) {
            onImageReady(creation.image);
          } else {
            setSideImageLoading(side, false);
            showCreationFallback(side, imageEl, textEl, creation, gameName, hostGame);
          }
        })
        .catch(() => {
          if (imageEl.dataset.creationId !== expectedCreationId) return;
          if (creation.image) {
            onImageReady(creation.image);
          } else {
            setSideImageLoading(side, false);
            showCreationFallback(side, imageEl, textEl, creation, gameName, hostGame);
          }
        });
    };

    resolveAndShow();
  }

  function openCreationDetailsFromSide(side) {
    const creationId = side === 'left' ? leftCreationId : rightCreationId;
    if (!creationId) return;

    const currentParams = new URLSearchParams(window.location.search);
    if (currentGameId) currentParams.set('gameId', currentGameId);
    if (currentGameMode) currentParams.set('mode', currentGameMode);
    if (leftCreationId) currentParams.set('leftCreationId', leftCreationId);
    if (rightCreationId) currentParams.set('rightCreationId', rightCreationId);
    const stateUrl = `eshu.html${currentParams.toString() ? `?${currentParams.toString()}` : ''}`;
    if (window.history?.replaceState) {
      window.history.replaceState(window.history.state, '', stateUrl);
    }

    const query = new URLSearchParams();
    query.set('id', creationId);
    query.set('returnTo', 'eshu.html');
    if (currentGameId) query.set('returnGameId', currentGameId);
    if (currentGameMode) query.set('returnMode', currentGameMode);
    const sourceGroupId = getSourceGroupIdFromUrl();
    if (sourceGroupId) query.set('returnSourceGroupId', sourceGroupId);
    if (leftCreationId) query.set('returnLeftCreationId', leftCreationId);
    if (rightCreationId) query.set('returnRightCreationId', rightCreationId);
    // Navigate to creation-focus.html instead of creation-details.html
    window.location.href = `creation-focus.html?${query.toString()}`;
  }

  function updateLikedState(side, creation) {
    const indicator = document.getElementById(`${side}LikedIndicator`);
    const likeBtn = document.getElementById(`${side}LikeBtn`);
    const profileId = getActiveProfileId();
    const isLiked = creation && profileId && (creation.likedBy || []).includes(profileId);
    if (indicator) indicator.classList.toggle('active', !!isLiked);
    if (likeBtn) {
      likeBtn.classList.toggle('liked', !!isLiked);
      likeBtn.innerHTML = HEART_SVG;
      likeBtn.title = isLiked ? 'Unlike' : 'Like';
    }
  }

  function updateFollowedState(side, creation) {
    const indicator = document.getElementById(`${side}FollowedIndicator`);
    const followBtn = document.getElementById(`${side}FollowBtn`);
    const profileId = getActiveProfileId();
    const isFollowed = creation && profileId && (creation.followedBy || []).includes(profileId);
    if (indicator) indicator.classList.toggle('active', !!isFollowed);
    if (followBtn) {
      followBtn.classList.toggle('followed', !!isFollowed);
      followBtn.title = isFollowed ? 'Unfollow' : 'Follow';
    }
  }

  function updateVoteState(side, creation) {
    const indicator = document.getElementById(`${side}VotesIndicator`);
    if (!indicator) return;
    if (!creation) {
      indicator.textContent = '0';
      indicator.classList.remove('active');
      return;
    }
    const parsedVotes = Number(creation.votes);
    const votes = Number.isFinite(parsedVotes) ? parsedVotes : 0;
    indicator.textContent = String(votes);
    indicator.classList.add('active');
  }

  function toggleCreationLike(side) {
    const creationId = side === 'left' ? leftCreationId : rightCreationId;
    if (!creationId) return;
    const profileId = getActiveProfileId();
    if (!profileId) return;
    const creations = ESHU_DB.getTable('creations') || [];
    const creation = creations.find(c => c.id === creationId);
    if (!creation) return;
    creation.likedBy = Array.isArray(creation.likedBy) ? creation.likedBy : [];
    const idx = creation.likedBy.indexOf(profileId);
    if (idx >= 0) creation.likedBy.splice(idx, 1);
    else creation.likedBy.push(profileId);
    ESHU_DB.setTable('creations', creations);
    updateLikedState(side, creation);
  }

  function toggleCreationFollow(side) {
    const creationId = side === 'left' ? leftCreationId : rightCreationId;
    if (!creationId) return;
    const profileId = getActiveProfileId();
    if (!profileId) return;
    const creations = ESHU_DB.getTable('creations') || [];
    const creation = creations.find(c => c.id === creationId);
    if (!creation) return;
    creation.followedBy = Array.isArray(creation.followedBy) ? creation.followedBy : [];
    const idx = creation.followedBy.indexOf(profileId);
    if (idx >= 0) creation.followedBy.splice(idx, 1);
    else creation.followedBy.push(profileId);
    ESHU_DB.setTable('creations', creations);
    updateFollowedState(side, creation);
  }

  function setupCreationOverlayActions() {
    document.querySelectorAll('.eshu-overlay-note').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const side = btn.dataset.side;
        if (!side) return;
        openCreationDetailsFromSide(side);
      });
    });

    document.querySelectorAll('.eshu-overlay-action-btn').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const side = btn.dataset.side;
        const action = btn.dataset.action;
        if (!side || !action) return;

        if (action === 'like') {
          toggleCreationLike(side);
          return;
        }

        if (action === 'follow') {
          toggleCreationFollow(side);
          return;
        }

        if (action === 'comment') {
          const input = document.getElementById(`${side}Input`);
          if (input) {
            input.focus();
            input.select();
          }
          return;
        }

        if (action === 'draw') {
          openEshuAnimationDraw(side);
        }
      });
    });
  }

  leftSide.addEventListener('dblclick', () => {
    if (!leftCreationId) return;
    const sourceGroupId = getSourceGroupIdFromUrl();
    const sourceGroupPart = sourceGroupId
      ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
      : '';
    window.location.href = `creation-focus.html?id=${leftCreationId}&from=eshu.html&gameId=${currentGameId || ''}${sourceGroupPart}`;
  });
  rightSide.addEventListener('dblclick', () => {
    if (!rightCreationId) return;
    const sourceGroupId = getSourceGroupIdFromUrl();
    const sourceGroupPart = sourceGroupId
      ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
      : '';
    window.location.href = `creation-focus.html?id=${rightCreationId}&from=eshu.html&gameId=${currentGameId || ''}${sourceGroupPart}`;
  });

  /* LocalStorage helpers */
  function getGames() { return ESHU_DB.getTable('games').filter((g) => ESHU_DB.isEntityActive(g)); }
  function getGroups() { return ESHU_DB.getActiveGroups(); }
  function getCreations() { return ESHU_DB.getTable('creations').filter((c) => ESHU_DB.isEntityActive(c)); }

  // Get creations visible to the current player for a game (private only visible to owner)
  function getVisibleGameCreations(gameId) {
    const profileId = getActiveProfileId();
    return getCreations().filter(c => {
      if ((c.hostGameId || c.gameId) !== gameId) return false;
      if (c.privacy === 'private') {
        const ownerId = c.ownerProfileId || c.createdByProfileId || c.authorProfileId || c.authorId || null;
        return ownerId === profileId;
      }
      return true;
    });
  }

  /* Sample games + groups */
  if (getGroups().length === 0) {
    const sampleGroups = [{ id: 'art', name: 'Art' }, { id: 'arcade', name: 'Arcade' }];
    ESHU_DB.setTable('groups', sampleGroups);
  }
  if (getGames().length === 0) {
    const sampleGames = [{ id: 'g1', name: "Color Tone Challenge", hostGroupId: 'art' },
    { id: 'g2', name: "Pixel Battle", hostGroupId: 'arcade' },
    { id: 'g3', name: "Shape Wars", hostGroupId: 'arcade' }];
    ESHU_DB.setTable('games', sampleGames);
  }

  /* Comment maximize reset helpers (defined early for use in nextPair) */
  function resetCommentMaximize(wrapperId, toggleId, sideId) {
    const wrapper = document.getElementById(wrapperId);
    const toggle = document.getElementById(toggleId);
    const sideEl = document.getElementById(sideId);
    if (!wrapper || !sideEl) return;
    const imageBox = sideEl.querySelector('.image-box');
    wrapper.classList.remove('maximized');
    sideEl.classList.remove('comments-maximized');
    if (toggle) toggle.classList.remove('is-exit');
    if (imageBox) imageBox.classList.remove('collapsed');
  }
  function resetAllCommentMaximize() {
    resetCommentMaximize('leftCommentWrapper', 'leftCommentsToggle', 'leftSide');
    resetCommentMaximize('rightCommentWrapper', 'rightCommentsToggle', 'rightSide');
  }

  /* Cross animation */
  function animateCross(cross) {
    if (!cross) return;
    cross.style.opacity = '1';
    cross.classList.remove('animate-cross');
    void cross.offsetWidth;
    cross.classList.add('animate-cross');
    setTimeout(() => {
      cross.style.opacity = '0';
      cross.classList.remove('animate-cross');
    }, 1200);
  }

  function findCreationIndex(creations, creationId, fallbackCreation) {
    if (!Array.isArray(creations)) return -1;
    if (creationId) {
      const byId = creations.findIndex(c => c && c.id === creationId);
      if (byId >= 0) return byId;
    }
    if (!fallbackCreation) return -1;
    const fallbackTitle = fallbackCreation.title || fallbackCreation.name || '';
    const fallbackHostGameId = fallbackCreation.hostGameId || fallbackCreation.gameId || '';
    const fallbackTimestamp = fallbackCreation.timestamp || fallbackCreation.createdAt || null;
    return creations.findIndex(c => {
      if (!c) return false;
      const cTitle = c.title || c.name || '';
      const cHostGameId = c.hostGameId || c.gameId || '';
      const cTimestamp = c.timestamp || c.createdAt || null;
      return cTitle === fallbackTitle && cHostGameId === fallbackHostGameId && cTimestamp === fallbackTimestamp;
    });
  }

  function ensureCreationIdAtIndex(creations, index, side) {
    if (!Array.isArray(creations) || index < 0 || index >= creations.length) return null;
    const creation = creations[index];
    if (!creation) return null;
    if (!creation.id) {
      creation.id = ESHU_DB.newId ? ESHU_DB.newId('creation') : `creation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (side === 'left') leftCreationId = creation.id;
      if (side === 'right') rightCreationId = creation.id;
    }
    return creation.id;
  }

  function getCreationVotes(creation) {
    const parsedVotes = Number(creation?.votes);
    return Number.isFinite(parsedVotes) ? parsedVotes : 0;
  }

  function readVoteUsageStore() {
    const usage = ESHU_DB.getValue(GAME_VOTE_USAGE_KEY);
    return usage && typeof usage === 'object' ? usage : {};
  }

  function getUsedVotesForGame(profileId, gameId) {
    if (!profileId || !gameId) return 0;
    const store = readVoteUsageStore();
    const byProfile = store[profileId];
    if (!byProfile || typeof byProfile !== 'object') return 0;
    const used = Number(byProfile[gameId]);
    return Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
  }

  function getGameVoteCap(gameId) {
    if (!gameId) return 0;
    return getVisibleGameCreations(gameId).length;
  }

  function getRemainingVotes(gameId) {
    if (!gameId) return 0;
    // Check for infinite votes (developer mode)
    const infiniteVotes = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('infiniteVotes')
      : false;
    if (infiniteVotes) return Infinity;
    const game = getGames().find(g => g.id === gameId) || ESHU_DB.getEntityById('games', gameId);
    if (game && game.gameType === 'book') return Infinity;
    const cap = getGameVoteCap(gameId);
    const used = getUsedVotesForGame(getActiveProfileId(), gameId);
    return Math.max(0, cap - used);
  }

  function incrementUsedVotesForGame(profileId, gameId) {
    if (!profileId || !gameId) return;
    const store = readVoteUsageStore();
    const byProfile = store[profileId] && typeof store[profileId] === 'object'
      ? { ...store[profileId] }
      : {};
    const current = getUsedVotesForGame(profileId, gameId);
    byProfile[gameId] = current + 1;
    store[profileId] = byProfile;
    ESHU_DB.setValue(GAME_VOTE_USAGE_KEY, store);
  }

  function resetTrendIndicators() {
    const leftTrend = document.getElementById('leftTrendIndicator');
    const rightTrend = document.getElementById('rightTrendIndicator');
    [leftTrend, rightTrend].forEach(el => {
      if (!el) return;
      el.classList.remove('up', 'down');
      el.style.display = 'none';
    });
  }

  function animateTrendIndicator(side, direction) {
    const trend = document.getElementById(`${side}TrendIndicator`);
    if (!trend) return;
    trend.classList.remove('up', 'down');
    trend.style.display = 'none';
    void trend.offsetWidth;
    trend.style.display = 'inline-flex';
    trend.classList.add(direction);
    setTimeout(() => {
      trend.classList.remove('up', 'down');
      trend.style.display = 'none';
    }, 820);
  }

  function recordVoteForSide(side) {
    const votedCreationId = side === 'left' ? leftCreationId : rightCreationId;
    const votedCreationRef = side === 'left' ? leftCreationRef : rightCreationRef;
    const opponentSide = side === 'left' ? 'right' : 'left';
    const opponentCreationId = opponentSide === 'left' ? leftCreationId : rightCreationId;
    const opponentCreationRef = opponentSide === 'left' ? leftCreationRef : rightCreationRef;
    if (!votedCreationId && !votedCreationRef) return;

    // Block votes if game has ended
    const game = getCurrentGame();
    if (game && game.endTime && Date.now() >= game.endTime) {
      if (typeof TOAST !== 'undefined') {
        TOAST.error('This game has ended. Voting is no longer available.');
      }
      return { blocked: true };
    }

    const creations = ESHU_DB.getTable('creations') || [];
    const creationIndex = findCreationIndex(creations, votedCreationId, votedCreationRef);
    if (creationIndex < 0) return;

    const opponentIndex = findCreationIndex(creations, opponentCreationId, opponentCreationRef);

    ensureCreationIdAtIndex(creations, creationIndex, side);
    const creation = creations[creationIndex];
    if (!creation || !ESHU_DB.isEntityActive(creation)) return;

    const opponent = opponentIndex >= 0 ? creations[opponentIndex] : null;
    const chosenVotesBefore = getCreationVotes(creation);
    const opponentVotesBefore = getCreationVotes(opponent);

    const activeProfileId = getActiveProfileId();
    const gameId = creation.hostGameId || creation.gameId || currentGameId || null;
    const isBook = game && game.gameType === 'book';
    
    // Check for infinite votes (developer mode) - bypasses all vote limits
    const infiniteVotes = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('infiniteVotes')
      : false;
    
    if (!isBook && !infiniteVotes) {
      const voteCap = getGameVoteCap(gameId);
      const usedVotes = getUsedVotesForGame(activeProfileId, gameId);
      if (usedVotes >= voteCap) {
        if (typeof TOAST !== 'undefined') {
          TOAST.error(`Vote limit reached for this game (${voteCap}/${voteCap}). Upload more creations to unlock more votes.`);
        }
        return { blocked: true };
      }
    }

    const currentVotes = Number(creation.votes);
    creation.votes = Number.isFinite(currentVotes) ? currentVotes + 1 : 1;
    ESHU_DB.setTable('creations', creations);
    incrementUsedVotesForGame(activeProfileId, gameId);

    if (side === 'left') leftCreationRef = creation;
    if (side === 'right') rightCreationRef = creation;
    updateVoteState(side, creation);

    if (opponent) {
      updateVoteState(opponentSide, opponent);
      if (chosenVotesBefore < opponentVotesBefore) {
        return { side, direction: 'up' };
      }
      if (chosenVotesBefore > opponentVotesBefore) {
        return { side: opponentSide, direction: 'down' };
      }
    }
    return null;
  }

  function chooseSide(side) {
    if (nextReady) return;

    // Book mode: just turn pages, no voting
    if (currentGameMode === 'book') {
      nextReady = true;
      leftSide.classList.toggle('chosen', side === 'left');
      rightSide.classList.toggle('chosen', side === 'right');
      if (side === 'left') {
        leftSide.style.borderColor = '#111111';
        rightSide.style.borderColor = 'transparent';
        animateCross(leftCross);
      } else {
        rightSide.style.borderColor = '#ffffff';
        leftSide.style.borderColor = 'transparent';
        animateCross(rightCross);
      }
      setTimeout(() => {
        leftSide.classList.remove('chosen');
        rightSide.classList.remove('chosen');
        leftSide.style.borderColor = 'transparent';
        rightSide.style.borderColor = 'transparent';
        resetTrendIndicators();
        nextReady = false;
        resetAllCommentMaximize();
        loadBookPair(side === 'right' ? 1 : -1);
      }, 400);
      return;
    }

    const selectedCreationRef = side === 'left' ? leftCreationRef : rightCreationRef;
    const voteGameId = selectedCreationRef?.hostGameId || selectedCreationRef?.gameId || currentGameId || null;
    if (voteGameId) {
      const remaining = getRemainingVotes(voteGameId);
      if (remaining <= 0) {
        if (typeof TOAST !== 'undefined') {
          TOAST.info('Upload more creations to get votes');
        }
        return;
      }
    }

    // Arena mode: record vote
    const trend = recordVoteForSide(side);
    if (trend && trend.blocked) return;
    nextReady = true;

    // Update vote count display immediately after voting
    updateCurrentGameContext();

    // Check if no votes remain after this vote
    if (currentGameId) {
      const remaining = getRemainingVotes(currentGameId);
      if (remaining <= 0 && typeof TOAST !== 'undefined') {
        TOAST.info('No votes left! Upload more creations to this game to unlock more votes.');
      }
    }

    if (trend) {
      animateTrendIndicator(trend.side, trend.direction);
    }
    leftSide.classList.toggle('chosen', side === 'left');
    rightSide.classList.toggle('chosen', side === 'right');
    if (side === 'left') {
      leftSide.style.borderColor = '#111111';
      rightSide.style.borderColor = 'transparent';
      animateCross(leftCross);
    } else {
      rightSide.style.borderColor = '#ffffff';
      leftSide.style.borderColor = 'transparent';
      animateCross(rightCross);
    }
    setTimeout(() => {
      nextPair();
    }, 650);
  }
  function nextPair() {
    leftSide.classList.remove('chosen');
    rightSide.classList.remove('chosen');
    leftSide.style.borderColor = 'transparent';
    rightSide.style.borderColor = 'transparent';
    resetTrendIndicators();
    nextReady = false;
    resetAllCommentMaximize();
    loadPairForMode();
  }

  function renderPair(left, right) {
    if (!left.id) left.id = `creation_${left.timestamp}`;
    if (!right.id) right.id = `creation_${right.timestamp}`;
    leftCreationId = left.id;
    rightCreationId = right.id;
    leftCreationRef = left;
    rightCreationRef = right;
    const leftHasVisual = !!(left.image || left.imageAssetId || left.imageRef?.id);
    const rightHasVisual = !!(right.image || right.imageAssetId || right.imageRef?.id);
    if (leftHasVisual) setSideImageLoading('left', true);
    if (rightHasVisual) setSideImageLoading('right', true);
    updateCreationVisual('left', left);
    updateCreationVisual('right', right);
    document.getElementById('leftDrawIframe').src = `color-tone.html?creationId=${left.id}`;
    document.getElementById('rightDrawIframe').src = `color-tone.html?creationId=${right.id}`;
    setupComments('leftForm', 'leftInput', 'leftComments', left.id, 'leftCommentsCount');
    setupComments('rightForm', 'rightInput', 'rightComments', right.id, 'rightCommentsCount');
  }

  function getActiveGameMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const forcedMode = urlParams.get('mode');
    if (forcedMode === 'book' || forcedMode === 'arena') return forcedMode;
    const game = currentGameId ? ESHU_DB.getEntityById('games', currentGameId) : null;
    return game && game.gameType === 'book' ? 'book' : 'arena';
  }

  function loadPairForMode() {
    currentGameMode = getActiveGameMode();
    if (currentGameMode === 'book') {
      loadBookPair();
      return;
    }
    loadRandomPair();
  }

  /* Load random creations */
  function loadRandomPair() {
    if (!currentGameId) {
      document.getElementById('leftCreation').textContent = "Select a game first!";
      document.getElementById('rightCreation').textContent = "";
      return;
    }
    const allCreations = getVisibleGameCreations(currentGameId);
    if (allCreations.length < 2) {
      document.getElementById('leftCreation').textContent = "Not enough creations!";
      document.getElementById('rightCreation').textContent = "Create more!";
      return;
    }
    let leftIndex = Math.floor(Math.random() * allCreations.length);
    let rightIndex; do { rightIndex = Math.floor(Math.random() * allCreations.length); } while (rightIndex === leftIndex);
    const left = allCreations[leftIndex]; const right = allCreations[rightIndex];
    renderPair(left, right);
  }

  function loadBookPair(direction) {
    if (!currentGameId) {
      document.getElementById('leftCreation').textContent = 'Select a game first!';
      document.getElementById('rightCreation').textContent = '';
      return;
    }

    const allCreations = getVisibleGameCreations(currentGameId)
      .sort((a, b) => (a.createdAt || a.timestamp || 0) - (b.createdAt || b.timestamp || 0));

    const len = allCreations.length;
    if (len === 0) {
      document.getElementById('leftCreation').textContent = 'No pages yet!';
      document.getElementById('rightCreation').textContent = 'Create more!';
      return;
    }

    if (len === 1) {
      renderPair(allCreations[0], allCreations[0]);
      return;
    }

    let cursor = bookCursorByGame[currentGameId] || 0;

    // direction: +1 = turn forward (right chosen), -1 = turn backward (left chosen)
    if (typeof direction === 'number') {
      cursor = ((cursor + direction) % len + len) % len;
    }

    bookCursorByGame[currentGameId] = cursor;
    const left = allCreations[cursor % len];
    const right = allCreations[(cursor + 1) % len];
    renderPair(left, right);
  }

  function refreshActivePairFromStore() {
    if (!currentGameId) return;
    const currentGame = ESHU_DB.getEntityById('games', currentGameId);
    if (!currentGame) {
      updateCurrentGameContext();
      return;
    }
    if (!ESHU_DB.isEntityActive(currentGame)) {
      currentGameId = null;
      leftCreationId = null;
      rightCreationId = null;
      document.getElementById('leftCreation').textContent = 'Select a game first!';
      document.getElementById('rightCreation').textContent = '';
      return;
    }

    const left = leftCreationId ? ESHU_DB.getEntityById('creations', leftCreationId) : null;
    const right = rightCreationId ? ESHU_DB.getEntityById('creations', rightCreationId) : null;
    const leftValid = left && ESHU_DB.isEntityActive(left) && creationBelongsToGame(left, currentGameId);
    const rightValid = right && ESHU_DB.isEntityActive(right) && creationBelongsToGame(right, currentGameId);

    if (!leftValid || !rightValid) {
      loadPairForMode();
      return;
    }

    updateCreationVisual('left', left);
    updateCreationVisual('right', right);
  }

  /* Comments setup - Game Front style model */
  const FOLLOW_ARROW_SVG = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
  const PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

  function getCreationCommentsStorageKey(creationId) {
    return `comments_${creationId}`;
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
            animation: (window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(c) : c?.animation) || null,
            animationImageUrl: c?.animationImageUrl || c?.imageUrl || ''
          };
        })
        .filter(c => c && ((typeof c.text === 'string' && c.text.trim()) || (window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(c) : c.animation)))
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

  function bindEshuCommentCardActions(section, creationId, target, rerender) {
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
      makeTarget: () => target,
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

    const target = { kind: 'creation', id: creationId };
    section.dataset.creationId = creationId;

    function render() {
      if (section.dataset.creationId !== creationId) return;
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
        const hasAnim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(comment) : !!comment.animation;
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
              <div class="u-card-desc">${escapeCommentHtml(text || (hasAnim ? '(drawing)' : ''))}${hasAnim ? ' <button type="button" class="comment-animation-badge" data-anim-idx="' + idx + '"></button>' : ''}</div>
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
            saveBtn.addEventListener('click', async () => {
              const newText = textarea.value.trim().slice(0, 1000);
              // Server-backed update via ESHU_COMMENTS
              if (window.ESHU_COMMENTS) {
                await window.ESHU_COMMENTS.update(comment.id, { text: newText }, target);
              } else {
                comment.text = newText;
                saveCreationComments(creationId, allComments);
              }
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

      bindEshuCommentCardActions(section, creationId, target, render);

      // Edit button (server-authoritative).
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
          const saveEdit = async () => {
            const newText = textarea.value.trim().slice(0, 1000);
            if (newText && window.ESHU_COMMENTS) {
              await window.ESHU_COMMENTS.update(comment.id, { text: newText }, target);
            }
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

    // Fire-and-forget hydrate so the SU / versus thread shows the canonical
    // server-side conversation (including comments from other players) on
    // this device's first visit.
    if (window.ESHU_COMMENTS) {
      window.ESHU_COMMENTS.hydrate(target)
        .then(() => render())
        .catch((err) => console.warn('[eshu] creation comments hydrate failed:', err));
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
      const side = formId === 'leftForm' ? 'left' : (formId === 'rightForm' ? 'right' : null);
      const pending = side ? pendingAnimations[side] : null;
      if (!text && !pending) return;

      const activeProfile = getActiveProfile();
      const activeProfileId = getActiveProfileId();
      const nextComment = {
        id: `creation_comment_${creationId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: text || (pending ? '(animation)' : ''),
        authorProfileId: activeProfileId,
        authorName: activeProfile?.name || ESHU_DB.getValue('profileName') || 'Player',
        timestamp: Date.now(),
        status: 'active'
      };
      if (pending) {
        nextComment.animation = pending;
        nextComment.animationImageUrl = pendingAnimationImageUrls[side] || await resolveSideCreationImageUrl(side);
        pendingAnimations[side] = null;
        pendingAnimationImageUrls[side] = '';
      }

      // Server-backed post via ESHU_COMMENTS. The synthetic local id is
      // replaced by the canonical server id; legacy author/animation fields
      // are decorated on the cached row so render code is unchanged.
      let created = null;
      if (window.ESHU_COMMENTS) {
        const postFields = {
          text: nextComment.text,
          authorName: nextComment.authorName,
        };
        if (nextComment.animation) postFields.animation = nextComment.animation;
        if (nextComment.animationImageUrl) postFields.animationImageUrl = nextComment.animationImageUrl;
        created = await window.ESHU_COMMENTS.post(target, postFields);
      }
      input.value = '';
      // Clear the drawing attached indicator
      input.placeholder = 'Add a comment...';
      input.classList.remove('has-pending-animation');
      render();

      const persistedId = created ? created.id : nextComment.id;
      const kind = nextComment.animation ? 'comment_animated' : 'comment_posted';
      const { delta } = ESHU_API.xp.awardBackground(kind, persistedId);
      xpPoints = parseInt(xpPoints || 0, 10) + delta;
      updateXPDisplay();
      if (window.XP_ANIM && delta > 0) XP_ANIM.show(delta);
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

    // Expose render so animation-save callback can refresh
    const side = formId === 'leftForm' ? 'left' : (formId === 'rightForm' ? 'right' : null);
    if (side) commentsRerenderers[side] = render;

    // Animation play badge handler
    section.onclick = async (e) => {
      const badge = e.target.closest('.comment-animation-badge');
      if (!badge) return;
      e.stopPropagation();
      if (section.dataset.creationId !== creationId) return;
      const idx = parseInt(badge.dataset.animIdx, 10);
      const all = loadCreationComments(creationId);
      const c = all[idx];
      const anim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(c) : (c && c.animation);
      if (anim) {
        let img = (c && c.animationImageUrl) || '';
        if (!img || img.startsWith('blob:')) {
          img = side ? await resolveSideCreationImageUrl(side) : '';
        }
        if (!img && side) {
          img = getSideCreationImageUrl(side);
        }
        const creationRef = side === 'left' ? leftCreationRef : rightCreationRef;
        openAnimationPlayerEshu(anim, img, creationRef?.bgColor || '');
      }
    };

    render();
  }

  /* Comment section maximize/minimize toggle */
  function setupCommentsToggle(toggleId, wrapperId, sideId) {
    const toggle = document.getElementById(toggleId);
    const wrapper = document.getElementById(wrapperId);
    const sideEl = document.getElementById(sideId);
    if (!toggle || !wrapper || !sideEl) return;
    const imageBox = sideEl.querySelector('.image-box');
    if (!imageBox) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isMax = wrapper.classList.toggle('maximized');
      imageBox.classList.toggle('collapsed', isMax);
      toggle.classList.toggle('is-exit', isMax);
      sideEl.classList.toggle('comments-maximized', isMax);
    });
  }

  setupCommentsToggle('leftCommentsToggle', 'leftCommentWrapper', 'leftSide');
  setupCommentsToggle('rightCommentsToggle', 'rightCommentWrapper', 'rightSide');

  /* Fullscreen */
  const fullscreenButtons = Array.from(document.querySelectorAll('.fullscreen-btn'));
  const imageBoxes = Array.from(document.querySelectorAll('.image-box'));
  const fullscreenUiTimers = new Map();

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  function revealBoxUi(box) {
    if (getFullscreenElement() !== box) return;
    box.classList.add('fullscreen-ui-visible');
    const previousTimer = fullscreenUiTimers.get(box);
    if (previousTimer) clearTimeout(previousTimer);
    const nextTimer = setTimeout(() => {
      box.classList.remove('fullscreen-ui-visible');
      fullscreenUiTimers.delete(box);
    }, 1600);
    fullscreenUiTimers.set(box, nextTimer);
  }

  const FS_SVG_ENTER = '<path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4h-4v2h6v-6h-2v4z"/>';
  const FS_SVG_EXIT  = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';

  function syncFullscreenUiState() {
    const activeFullscreen = getFullscreenElement();
    fullscreenButtons.forEach(btn => {
      const box = btn.closest('.image-box');
      if (!box) return;
      const isActive = activeFullscreen === box;
      btn.classList.toggle('is-exit', isActive);
      const svg = btn.querySelector('svg');
      if (svg) svg.innerHTML = isActive ? FS_SVG_EXIT : FS_SVG_ENTER;
      if (!isActive) {
        box.classList.remove('fullscreen-ui-visible');
        const timer = fullscreenUiTimers.get(box);
        if (timer) {
          clearTimeout(timer);
          fullscreenUiTimers.delete(box);
        }
      }
    });

    if (activeFullscreen && activeFullscreen.classList?.contains('image-box')) {
      revealBoxUi(activeFullscreen);
    }
  }

  fullscreenButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Fullscreen the image-box (the button's parent), NOT the whole side column
      const imageBox = btn.closest('.image-box');
      if (!imageBox) return;

      // If a draw overlay is active, fullscreen the iframe instead
      const overlay = document.getElementById(btn.dataset.target);
      if (overlay && overlay.style.display === 'flex') {
        const iframe = overlay.querySelector('iframe');
        if (iframe?.requestFullscreen) iframe.requestFullscreen();
        else if (iframe?.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
        else if (iframe?.msRequestFullscreen) iframe.msRequestFullscreen();
        return;
      }

      // Toggle fullscreen on the image-box
      if (getFullscreenElement() === imageBox) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
        return;
      }

      if (imageBox.requestFullscreen) imageBox.requestFullscreen();
      else if (imageBox.webkitRequestFullscreen) imageBox.webkitRequestFullscreen();
      else if (imageBox.msRequestFullscreen) imageBox.msRequestFullscreen();
    });
  });

  ['mousemove', 'click', 'touchstart'].forEach(eventName => {
    imageBoxes.forEach(box => {
      box.addEventListener(eventName, () => {
        if (getFullscreenElement() === box) {
          revealBoxUi(box);
        }
      });
    });
  });

  document.addEventListener('fullscreenchange', syncFullscreenUiState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenUiState);
  document.addEventListener('MSFullscreenChange', syncFullscreenUiState);
  syncFullscreenUiState();

  /* Double-click on image box to open creation focus */
  document.querySelectorAll('.image-box').forEach(box => {
    box.addEventListener('dblclick', (e) => {
      // Don't trigger if clicking on buttons inside the overlay
      if (e.target.closest('.eshu-overlay-action-btn') || 
          e.target.closest('.eshu-overlay-note') ||
          e.target.closest('.fullscreen-btn')) {
        return;
      }
      const drawOverlay = box.parentElement?.querySelector('.draw-overlay');
      if (drawOverlay && drawOverlay.style.display === 'flex') {
        return;
      }
      const side = box.closest('.side')?.classList.contains('left') ? 'left' : 'right';
      openCreationDetailsFromSide(side);
    });
  });

  /* Side selection */
  const leftChamferBtn = document.querySelector('.chamfer-button.left');
  const rightChamferBtn = document.querySelector('.chamfer-button.right');

  function setChoiceHoverPreview(side, active) {
    if (side === 'left') {
      if (leftSide) leftSide.classList.toggle('hover-preview', !!active);
      if (!active && rightSide) rightSide.classList.remove('hover-preview');
      return;
    }
    if (side === 'right') {
      if (rightSide) rightSide.classList.toggle('hover-preview', !!active);
      if (!active && leftSide) leftSide.classList.remove('hover-preview');
    }
  }

  if (leftChoiceBtn) {
    leftChoiceBtn.addEventListener('mouseenter', () => setChoiceHoverPreview('left', true));
    leftChoiceBtn.addEventListener('mouseleave', () => setChoiceHoverPreview('left', false));
    leftChoiceBtn.addEventListener('focus', () => setChoiceHoverPreview('left', true));
    leftChoiceBtn.addEventListener('blur', () => setChoiceHoverPreview('left', false));
  }

  if (rightChoiceBtn) {
    rightChoiceBtn.addEventListener('mouseenter', () => setChoiceHoverPreview('right', true));
    rightChoiceBtn.addEventListener('mouseleave', () => setChoiceHoverPreview('right', false));
    rightChoiceBtn.addEventListener('focus', () => setChoiceHoverPreview('right', true));
    rightChoiceBtn.addEventListener('blur', () => setChoiceHoverPreview('right', false));
  }

  if (leftChamferBtn) leftChamferBtn.addEventListener('click', () => chooseSide('left'));
  if (rightChamferBtn) rightChamferBtn.addEventListener('click', () => chooseSide('right'));
  if (leftChoiceBtn) leftChoiceBtn.addEventListener('click', () => chooseSide('left'));
  if (rightChoiceBtn) rightChoiceBtn.addEventListener('click', () => chooseSide('right'));
  if (currentGameThumbBtn) currentGameThumbBtn.addEventListener('click', openCurrentGameInfoModal);
  if (currentGameInfoClose) currentGameInfoClose.addEventListener('click', closeCurrentGameInfoModal);
  if (currentGameInfoImageBtn) currentGameInfoImageBtn.addEventListener('click', openCurrentGameFrontPage);
  const currentGameFrontBtn = document.getElementById('currentGameFrontBtn');
  if (currentGameFrontBtn) currentGameFrontBtn.addEventListener('click', openCurrentGameFrontPage);
  if (currentGameResumeBtn) currentGameResumeBtn.addEventListener('click', closeCurrentGameInfoModal);
  if (currentGameInfoModal) {
    currentGameInfoModal.addEventListener('click', (event) => {
      if (event.target === currentGameInfoModal) closeCurrentGameInfoModal();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentGameInfoModal?.classList.contains('open')) {
      closeCurrentGameInfoModal();
    }
  });

  /* Animation draw integration */
  const pendingAnimations = { left: null, right: null };
  const pendingAnimationImageUrls = { left: '', right: '' };
  const commentsRerenderers = { left: null, right: null };

  function getSideCreationImageUrl(side) {
    const ref = side === 'left' ? leftCreationRef : rightCreationRef;
    if (ref && ref.image) return ref.image;
    const img = document.querySelector(`#${side}Side .creation-image`) || document.querySelector(`#${side}Side img`);
    return (img && img.src) ? img.src : '';
  }

  function getSideCreationId(side) {
    return side === 'left' ? leftCreationId : rightCreationId;
  }

  async function resolveSideCreationImageUrl(side) {
    const creationId = getSideCreationId(side);
    const creation = creationId ? ESHU_DB.getEntityById('creations', creationId) : null;
    if (!creation) return getSideCreationImageUrl(side);

    if (window.ESHU_MEDIA?.resolveCreationImageSrc) {
      try {
        const resolved = await window.ESHU_MEDIA.resolveCreationImageSrc(creation);
        if (resolved) return resolved;
      } catch (err) {
        console.warn('[eshu] Failed to resolve side creation image:', err);
      }
    }

    return creation.image || getSideCreationImageUrl(side);
  }

  // Delegates to shared Eshu engine component
  function openAnimationPlayerEshu(data, img, bgColor) { if (window.ANIMATION_PLAYER) window.ANIMATION_PLAYER.open(data, img, { bgColor: bgColor || '' }); }

  async function openEshuAnimationDraw(side) {
    if (typeof window.ANIMATION_DRAW === 'undefined') return;
    // Exit fullscreen if active so the draw tool can appear properly
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    if (fsElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      else if (document.msExitFullscreen) await document.msExitFullscreen();
    }
    const creationId = getSideCreationId(side);
    if (!creationId) { if (typeof TOAST !== 'undefined') TOAST.error('No creation loaded'); return; }
    const creationRef = side === 'left' ? leftCreationRef : rightCreationRef;
    const imageMeta = window.DRAWING_COMPOSITOR
      ? window.DRAWING_COMPOSITOR.extractImageMeta(creationRef)
      : {};
    const imageUrl = await resolveSideCreationImageUrl(side);
    window.ANIMATION_DRAW.open({
      imageUrl,
      imageMeta,
      bgColor: creationRef?.bgColor || '',
      initialData: pendingAnimations[side],
      onSave: (data) => {
        pendingAnimations[side] = data;
        pendingAnimationImageUrls[side] = imageUrl;
        // Show indicator in comment input that drawing is ready
        const input = document.getElementById(`${side}Input`);
        if (input) {
          input.placeholder = '🎨 Drawing attached - type message and send...';
          input.classList.add('has-pending-animation');
        }
        if (typeof TOAST !== 'undefined') TOAST.success('Drawing saved! Add a message and send.');
      }
    });
  }

  function setupDraw(drawBtnId, side) {
    const btn = document.getElementById(drawBtnId);
    if (!btn) return;
    btn.addEventListener('click', async () => { await openEshuAnimationDraw(side); });
  }
  setupDraw('leftDrawBtn', 'left');
  setupDraw('rightDrawBtn', 'right');
  setupCreationOverlayActions();

  /* Games modal */
  const gamesButton = document.getElementById('gamesButton');
  const playGameTopBtn = document.getElementById('playGameTopBtn');
  const gamesModal = document.getElementById('gamesModal');
  const closeModal = document.getElementById('closeModal');
  const eshuModalCancelBtn = document.getElementById('eshuModalCancelBtn');
  const modalList = document.getElementById('modalGamesList');
  const gameSearch = document.getElementById('gameSearchModal');
  const gameVotesFilter = document.getElementById('gameVotesFilterModal');

  function runHype(message, onComplete, duration = 1500) {
    if (!document.getElementById('eshu-play-hype-styles')) {
      const style = document.createElement('style');
      style.id = 'eshu-play-hype-styles';
      style.textContent = `
        .eshu-play-hype-overlay {
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
        .eshu-play-hype-text {
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
          animation: eshuPlayHypeInOut 1500ms cubic-bezier(.22,1,.36,1) forwards;
        }
        @keyframes eshuPlayHypeInOut {
          0% { opacity: 0; transform: translateY(18px) scale(.86); filter: blur(2px); }
          18% { opacity: 1; transform: translateY(0) scale(1.02); filter: blur(0); }
          72% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-10px) scale(1.06); }
        }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.className = 'eshu-play-hype-overlay';
    overlay.innerHTML = `<div class="eshu-play-hype-text">${message}</div>`;
    document.body.appendChild(overlay);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof onComplete === 'function') onComplete();
    };

    const textEl = overlay.querySelector('.eshu-play-hype-text');
    if (textEl) {
      textEl.style.animationDuration = `${Math.max(1000, Number(duration) || 1500)}ms`;
      textEl.addEventListener('animationend', cleanup, { once: true });
    }
    setTimeout(cleanup, Math.max(1100, Number(duration) || 1500) + 120);
  }

  function buildRandomGameQueue(games, excludeGameId) {
    const ids = (games || [])
      .map((game) => game && game.id)
      .filter(Boolean)
      .filter((id) => id !== excludeGameId);

    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = ids[i];
      ids[i] = ids[j];
      ids[j] = temp;
    }
    return ids;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
  function renderGames() {
    const searchText = gameSearch ? gameSearch.value.toLowerCase() : '';
    const votesFilter = (gameVotesFilter ? gameVotesFilter.value : 'all').toLowerCase();
    if (!modalList) return;

    let visibleGames = getGames().filter(g => g.name.toLowerCase().includes(searchText));

    if (votesFilter === 'votes_available') {
      visibleGames = visibleGames.filter((g) => {
        const remaining = getRemainingVotes(g.id);
        return remaining === Infinity || remaining > 0;
      });
    }

    if (visibleGames.length === 0) {
      modalList.innerHTML = searchText
        ? '<div style="padding:20px;text-align:center;color:#888;">No games match your search.</div>'
        : '<div style="padding:20px;text-align:center;color:#888;">No games available to play.</div>';
      return;
    }

    modalList.innerHTML = visibleGames.map(g => {
      const groupName = getGroups().find(gr => gr.id === g.hostGroupId)?.name || 'No Group';
      const modeLabel = g.gameType === 'book' ? 'Book' : 'Arena';
      const remaining = getRemainingVotes(g.id);
      const remainingLabel = remaining === Infinity ? '∞' : remaining;
      return `
        <div class="group-list-item" data-game-id="${g.id}">
          <div class="group-icon"></div>
          <div class="play-game-item-main">
            <div class="play-game-item-title">${escapeHtml(g.name)}</div>
            <div class="play-game-item-meta">${escapeHtml(groupName)} · ${modeLabel}</div>
          </div>
          <span class="play-game-item-votes">Votes <span class="play-game-item-votes-value">${remainingLabel}</span></span>
          <button type="button" class="play-game-item-action">Play</button>
        </div>
      `;
    }).join('');

    modalList.querySelectorAll('.group-list-item').forEach(item => {
      const selectGame = () => {
        const gameId = item.dataset.gameId;
        if (!gameId) return;
        closeGamesModal();
        runHype('RIGHT ON!', () => {
          randomGameQueue = [];
          currentGameId = gameId;
          const game = getGames().find(g => g.id === gameId);
          currentGameMode = game && game.gameType === 'book' ? 'book' : 'arena';
          updateCurrentGameContext();
          nextPair();
        });
      };
      item.addEventListener('click', selectGame);
      const playBtn = item.querySelector('.play-game-item-action');
      if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); selectGame(); });
    });
  }

  function openGamesModal() {
    if (!gamesModal || !modalList) return;
    if (gameSearch) gameSearch.value = '';
    if (gameVotesFilter) gameVotesFilter.value = 'all';
    renderGames();
    gamesModal.classList.add('active');
    if (gameSearch) gameSearch.focus();
  }

  function loadRandomGame() {
    const allGames = getGames();
    if (!allGames.length) {
      if (typeof TOAST !== 'undefined') TOAST.info('There is nothing here now, but there will be soon...');
      return;
    }

    const activeIds = new Set(allGames.map((game) => game && game.id).filter(Boolean));
    randomGameQueue = randomGameQueue.filter((id) => activeIds.has(id) && id !== currentGameId);
    if (!randomGameQueue.length) {
      randomGameQueue = buildRandomGameQueue(allGames, currentGameId);
    }

    if (!randomGameQueue.length) {
      if (typeof TOAST !== 'undefined') TOAST.info('There is nothing here now, but there will be soon...');
      return;
    }

    const selectedGameId = randomGameQueue.shift();
    const selectedGame = allGames.find((game) => game && game.id === selectedGameId);
    if (!selectedGame?.id) return;

    runHype('RIGHT ON!', () => {
      currentGameId = selectedGame.id;
      currentGameMode = selectedGame.gameType === 'book' ? 'book' : 'arena';
      updateCurrentGameContext();
      nextPair();
    });
  }

  function closeGamesModal() {
    if (!gamesModal) return;
    gamesModal.classList.remove('active');
  }

  if (gamesButton) {
    gamesButton.addEventListener('click', loadRandomGame);
  }
  if (playGameTopBtn) {
    playGameTopBtn.addEventListener('click', openGamesModal);
  }
  if (closeModal) closeModal.addEventListener('click', closeGamesModal);
  if (eshuModalCancelBtn) eshuModalCancelBtn.addEventListener('click', closeGamesModal);
  if (gamesModal) {
    window.addEventListener('click', e => { if (e.target === gamesModal) closeGamesModal(); });
  }
  if (gameSearch) gameSearch.addEventListener('input', renderGames);
  if (gameVotesFilter) gameVotesFilter.addEventListener('change', renderGames);

  // Auto-select game if gameId is in URL (e.g. returning from creation-focus)
  (function () {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const mode = urlParams.get('mode');
    const restoreLeftCreationId = urlParams.get('leftCreationId');
    const restoreRightCreationId = urlParams.get('rightCreationId');
    if (gameId) {
      randomGameQueue = [];
      currentGameId = gameId;
      if (mode === 'book' || mode === 'arena') {
        currentGameMode = mode;
      }
      updateCurrentGameContext();

      if (restoreLeftCreationId && restoreRightCreationId) {
        const left = ESHU_DB.getEntityById('creations', restoreLeftCreationId);
        const right = ESHU_DB.getEntityById('creations', restoreRightCreationId);
        const leftValid = left && ESHU_DB.isEntityActive(left) && creationBelongsToGame(left, currentGameId);
        const rightValid = right && ESHU_DB.isEntityActive(right) && creationBelongsToGame(right, currentGameId);
        if (leftValid && rightValid) {
          renderPair(left, right);
          return;
        }
      }

      nextPair();
    }
  })();

  updateCurrentGameContext();

  // Listen for infinite votes toggle changes
  window.addEventListener('eshu:infinite-votes-changed', () => {
    // Refresh vote display immediately when infinite votes is toggled
    updateCurrentGameContext();
  });

  ESHU_DB.subscribe(() => {
    // Update nav elements
    loadProfileDisplay();
    updateXPDisplay();
    
    // Update games modal if open
    if (gamesModal && gamesModal.classList.contains('active')) {
      renderGames();
    }
    refreshActivePairFromStore();
    updateCurrentGameContext();
  });
})();
