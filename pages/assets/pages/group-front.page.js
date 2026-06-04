(function () {
  'use strict';

  ESHU_DB.ensure();
  const FOLLOW_ARROW_SVG = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
  const PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  const runtime = window.ESHU_RUNTIME;

  function getGameTimingStatusGrf(game) {
    if (!game) return { label: '', cssClass: '' };
    const now = Date.now();
    const isInfinite = !game.endTime;
    const isFinished = !isInfinite && now >= game.endTime;
    const isStarted = game.startTime ? now >= game.startTime : true;
    const subsClosed = game.submissionCloseTime ? now >= game.submissionCloseTime : false;
    if (isFinished) return { label: 'Finished', cssClass: 'finished' };
    if (!isStarted) {
      const ms = game.startTime - now;
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
      const cd = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
      return { label: `Starts in ${cd}`, cssClass: 'starting' };
    }
    if (subsClosed) {
      const ms = game.endTime - now;
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
      const cd = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
      return { label: `Subs closed · ${cd} left`, cssClass: 'subs-closed' };
    }
    if (!isInfinite) {
      const ms = game.endTime - now;
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
      const endLeft = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
      if (game.submissionCloseTime && now < game.submissionCloseTime) {
        const sms = game.submissionCloseTime - now;
        const sd = Math.floor(sms / 86400000), sh = Math.floor((sms % 86400000) / 3600000), sm = Math.floor((sms % 3600000) / 60000);
        const subsIn = sd > 0 ? `${sd}d ${sh}h` : sh > 0 ? `${sh}h ${sm}m` : `${sm}m`;
        return { label: `Subs close in ${subsIn} · ${endLeft}`, cssClass: 'running' };
      }
      return { label: endLeft, cssClass: 'running' };
    }
    return { label: 'Infinite', cssClass: 'infinite' };
  }

  const xpCounter = document.getElementById('xpCounter');
  if (xpCounter) {
    const xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
    xpCounter.textContent = xpPoints + ' XP';
  }

  const params = new URLSearchParams(window.location.search);
  const groupId = params.get('groupId');

  const grfBackBtn = document.getElementById('grfBackBtn');
  const grfLikeBtn = document.getElementById('grfLikeBtn');
  const grfFollowBtn = document.getElementById('grfFollowBtn');
  const grfSettingsBtn = document.getElementById('grfSettingsBtn');
  const grfGroupIcon = document.getElementById('grfGroupIcon');
  const grfGroupTitle = document.getElementById('grfGroupTitle');
  const grfHeroImage = document.getElementById('grfHeroImage');
  const grfHeroTitle = document.getElementById('grfHeroTitle');
  const grfHeroMeta = document.getElementById('grfHeroMeta');
  const grfHeroBadges = document.getElementById('grfHeroBadges');
  const grfHeroDesc = document.getElementById('grfHeroDesc');
  const grfGamesGrid = document.getElementById('grfGamesGrid');
  const grfGamesSearch = document.getElementById('grfGamesSearch');
  const grfGamesCount = document.getElementById('grfGamesCount');
  const grfCommentsCount = document.getElementById('grfCommentsCount');
  const grfCommentsList = document.getElementById('grfCommentsList');
  const grfCommentsInput = document.getElementById('grfCommentsInput');
  const grfCommentsSubmit = document.getElementById('grfCommentsSubmit');
  const grfCommentsSection = document.getElementById('grfCommentsSection');
  const grfCommentsToggle = document.getElementById('grfCommentsToggle');

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function getActiveProfileId() {
    return getActiveProfile()?.id || ESHU_DB.getValue('currentProfileId') || null;
  }

  function getGroupMembers(group) {
    const members = Array.isArray(group?.memberProfileIds) ? group.memberProfileIds.filter(Boolean) : [];
    if (group?.ownerProfileId && !members.includes(group.ownerProfileId)) members.push(group.ownerProfileId);
    return members;
  }

  function canViewGroup(group, profileId) {
    if (!group) return false;
    if (group.privacy !== 'private') return true;
    return getGroupMembers(group).includes(profileId);
  }

  function getGroupOwnerProfileId(group) {
    return group?.ownerProfileId || group?.createdByProfileId || group?.authorProfileId || group?.authorId || null;
  }

  function getGroupCommentsStorageKey(targetGroupId) {
    return `comments_group_${targetGroupId}`;
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

  function loadGroupComments(targetGroupId) {
    if (!targetGroupId) return [];
    const key = getGroupCommentsStorageKey(targetGroupId);
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(c => c && typeof c === 'object' && ((typeof c.text === 'string' && c.text.trim()) || (window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(c) : !!c.animation)))
        .filter(c => c.status !== 'deleted' && c.status !== 'burned')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (err) {
      console.warn('Failed to load group comments:', err);
      return [];
    }
  }

  function saveGroupComments(targetGroupId, comments) {
    if (!targetGroupId) return;
    const key = getGroupCommentsStorageKey(targetGroupId);
    localStorage.setItem(key, JSON.stringify(comments || []));
  }

  function bindGroupCommentCardActions(listEl, group) {
    if (!listEl || !group?.id || !window.ESHU_COMMENT_ACTIONS?.bindThreadCardActions) return;
    const bindingKey = `group:${group.id}`;
    if (listEl.dataset.commentActionsBoundFor === bindingKey) return;
    if (typeof listEl._unbindCommentActions === 'function') {
      listEl._unbindCommentActions();
    }
    listEl._unbindCommentActions = window.ESHU_COMMENT_ACTIONS.bindThreadCardActions({
      containerEl: listEl,
      getThreadIdFromCard: (card) => card?.dataset?.groupId || null,
      loadThreadComments: (threadId) => loadGroupComments(threadId),
      makeTarget: (threadId) => ({ kind: 'group', id: threadId }),
      onStatusChanged: (action) => {
        // Only re-render for status changes that affect visibility (burn/boot/clear)
        // Like/Follow don't need re-render as button states are updated by bindThreadCardActions
        if (action === 'burn' || action === 'boot' || action === 'clear') {
          renderComments(group);
        }
      },
    });
    listEl.dataset.commentActionsBoundFor = bindingKey;
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

  function getGroup() {
    const groups = ESHU_DB.getTable('groups') || [];
    const activeProfileId = getActiveProfileId();
    const group = groups.find(g => g.id === groupId && ESHU_DB.isEntityActive(g));
    if (!group || !canViewGroup(group, activeProfileId)) return null;
    return group;
  }

  function updateNavProfile() {
    const profile = getActiveProfile();
    const profileNameNav = document.getElementById('profileNameNav');
    const profileBtn = document.getElementById('profileBtn');
    if (profileNameNav) profileNameNav.textContent = profile?.name || 'Player';
    if (profileBtn) {
      if (profile?.image) profileBtn.innerHTML = `<img src="${profile.image}" alt="${profile.name || 'Player'}">`;
      else profileBtn.innerHTML = '';
      if (!profileBtn.dataset.navInit) {
        profileBtn.dataset.navInit = '1';
        profileBtn.addEventListener('click', () => (window.location.href = 'profile.html'));
      }
    }
  }

  // Builds the hex-framed image (img clipped to hex, cap+outline overlaid)
  function buildHexImageSvg(imageUrl) {
    const safeUrl = String(imageUrl || '').replace(/"/g, '&quot;');
    return `
      <div class="hex-image-frame">
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

  // Builds the diamond-framed game image (img clipped to diamond, cap+outline overlaid)
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

  function renderHero(group, groupGames, memberProfiles) {
    if (grfGroupIcon) {
      if (group.image) grfGroupIcon.innerHTML = buildHexImageSvg(group.image);
      else grfGroupIcon.innerHTML = `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo">`;
    }

    const title = group.name || 'Untitled Group';
    if (grfGroupTitle) grfGroupTitle.textContent = title;
    if (grfHeroTitle) grfHeroTitle.textContent = title;

    if (grfHeroImage) {
      if (group.image) grfHeroImage.innerHTML = buildHexImageSvg(group.image);
      else grfHeroImage.innerHTML = `<div class="eshu-logo"></div>`;
    }

    if (grfHeroMeta) {
      grfHeroMeta.textContent = `${memberProfiles.length} player${memberProfiles.length === 1 ? '' : 's'} · ${groupGames.length} game${groupGames.length === 1 ? '' : 's'}`;
    }

    if (grfHeroDesc) {
      grfHeroDesc.textContent = group.description || 'No description provided.';
    }

    if (grfHeroBadges) {
      const type = (group.type || 'general').toString();
      const privacy = group.privacy === 'private' ? 'Private' : 'Public';
      grfHeroBadges.innerHTML = `
        <span class="grf-badge">${privacy}</span>
        <span class="grf-badge">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
      `;
    }
  }

  function syncHeaderActionButtons(group) {
    const activeProfileId = getActiveProfileId();
    if (grfFollowBtn) grfFollowBtn.innerHTML = FOLLOW_ARROW_SVG;

    if (grfLikeBtn) {
      const likedBy = Array.isArray(group?.likedBy) ? group.likedBy : [];
      grfLikeBtn.classList.toggle('active', !!activeProfileId && likedBy.includes(activeProfileId));
    }

    if (grfFollowBtn) {
      const followedBy = Array.isArray(group?.followedBy) ? group.followedBy : [];
      grfFollowBtn.classList.toggle('active', !!activeProfileId && followedBy.includes(activeProfileId));
    }

    if (grfSettingsBtn) {
      const ownerId = getGroupOwnerProfileId(group);
      const isOwner = !ownerId || ownerId === activeProfileId;
      grfSettingsBtn.style.display = isOwner ? 'inline-flex' : 'none';
    }
  }

  function renderGamesList(groupGames, searchQuery) {
    if (!grfGamesGrid) return;
    const query = (searchQuery || '').trim().toLowerCase();
    const filtered = query
      ? groupGames.filter(g => (g.name || '').toLowerCase().includes(query) || (g.description || '').toLowerCase().includes(query))
      : groupGames;

    if (grfGamesCount) {
      grfGamesCount.textContent = `${filtered.length} game${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      grfGamesGrid.innerHTML = '<div class="u-card-empty">No games found.</div>';
      return;
    }

    const profiles = (ESHU_DB.getTable('profiles') || []).filter(p => p && p.isActive !== false);
    const activeProfileId = ESHU_DB.getActiveProfileId();
    grfGamesGrid.innerHTML = filtered.map((game) => {
      const ownerProf = profiles.find(p => p.id === game.ownerProfileId);
      const ownerName = ownerProf?.name || game.ownerName || 'Unknown';
      const gmLiked = (game.likedBy || []).includes(activeProfileId);
      const gmFollowed = (game.followedBy || []).includes(activeProfileId);
      const iconContent = game.image
        ? buildDiamondImageSvg(game.image)
        : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
      const ts = getGameTimingStatusGrf(game);
      const timingLine = ts.label ? `<div class="u-card-timing ${ts.cssClass}">${ts.label}</div>` : '';
      return `
      <div class="u-card" data-id="${game.id}">
        <div class="u-card-body">
          <div class="u-card-thumb">${iconContent}</div>
          <div class="u-card-content">
            <div class="u-card-title">${game.name || 'Untitled Game'}</div>
            <div class="u-card-subtitle">Game · by ${ownerName}</div>
            ${timingLine}
            ${game.description ? '<div class="u-card-desc">' + game.description + '</div>' : ''}
          </div>
          <div class="u-card-indicators">
            <span class="u-card-ind liked${gmLiked ? ' active' : ''}" title="Liked">${HEART_SVG}</span>
            <span class="u-card-ind followed${gmFollowed ? ' active' : ''}" title="Followed">${FOLLOW_ARROW_SVG}</span>
          </div>
          <button type="button" class="u-card-options-btn" title="Options">${COG_SVG}</button>
        </div>
        <div class="u-card-expand">
          <div class="u-card-actions">
            <button type="button" class="u-card-like-btn${gmLiked ? ' active' : ''}" title="${gmLiked ? 'Unlike' : 'Like'}">${HEART_SVG}</button>
            <button type="button" class="u-card-follow-btn${gmFollowed ? ' active' : ''}" title="${gmFollowed ? 'Unfollow' : 'Follow'}">${FOLLOW_ARROW_SVG}</button>
          </div>
        </div>
      </div>
    `;
    }).join('');

    grfGamesGrid.querySelectorAll('.u-card').forEach((card) => {
      card.addEventListener('click', () => {
        grfGamesGrid.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      card.addEventListener('dblclick', () => {
        const gameId = card.dataset.id;
        if (!gameId) return;
        window.location.href = `games.html?view=front&gameId=${encodeURIComponent(gameId)}&sourceGroupId=${encodeURIComponent(groupId)}`;
      });
      const cogBtn = card.querySelector('.u-card-options-btn');
      if (cogBtn) cogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        card.classList.toggle('expanded');
      });
      const likeBtn = card.querySelector('.u-card-like-btn');
      if (likeBtn) likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gameId = card.dataset.id;
        const games = ESHU_DB.getTable('games') || [];
        const game = games.find(g => g.id === gameId);
        if (!game) return;
        const apId = ESHU_DB.getActiveProfileId();
        game.likedBy = Array.isArray(game.likedBy) ? game.likedBy : [];
        const li = game.likedBy.indexOf(apId);
        if (li >= 0) { game.likedBy.splice(li, 1); likeBtn.classList.remove('active'); } else { game.likedBy.push(apId); likeBtn.classList.add('active'); }
        const ind = card.querySelector('.u-card-ind.liked'); if (ind) ind.classList.toggle('active', likeBtn.classList.contains('active'));
        ESHU_DB.setTable('games', games);
      });
      const followBtn = card.querySelector('.u-card-follow-btn');
      if (followBtn) followBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gameId = card.dataset.id;
        const games = ESHU_DB.getTable('games') || [];
        const game = games.find(g => g.id === gameId);
        if (!game) return;
        const apId = ESHU_DB.getActiveProfileId();
        game.followedBy = Array.isArray(game.followedBy) ? game.followedBy : [];
        const fi = game.followedBy.indexOf(apId);
        if (fi >= 0) { game.followedBy.splice(fi, 1); followBtn.classList.remove('active'); } else { game.followedBy.push(apId); followBtn.classList.add('active'); }
        const ind = card.querySelector('.u-card-ind.followed'); if (ind) ind.classList.toggle('active', followBtn.classList.contains('active'));
        ESHU_DB.setTable('games', games);
      });
    });
  }

  function triggerGroupCommentInlineEdit(idx, card) {
    const allComments = loadGroupComments(currentGroup.id);
    const comment = allComments[idx];
    if (!comment) return;
    
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
    
    const target = { kind: 'group', id: currentGroup.id };
    const saveBtn = descEl.querySelector('.comment-edit-save');
    saveBtn.addEventListener('click', async () => {
      const newText = textarea.value.trim().slice(0, 1000);
      if (window.ESHU_COMMENTS) {
        await window.ESHU_COMMENTS.update(comment.id, { text: newText }, target);
      } else {
        comment.text = newText;
        saveGroupComments(currentGroup.id, allComments);
      }
      renderComments(currentGroup);
      if (typeof TOAST !== 'undefined') TOAST.success('Comment updated');
    });
    
    const cancelBtn = descEl.querySelector('.comment-edit-cancel');
    cancelBtn.addEventListener('click', () => renderComments(currentGroup));
  }

  function renderComments(group) {
    if (!grfCommentsList || !group?.id) return;

    // Preserve expanded cog menus during re-render
    const grab = (sel) => Array.from(grfCommentsList.querySelectorAll(sel))
      .map(c => c.dataset.commentIdx)
      .filter(Boolean);
    const expandedIds = grab('.u-card.expanded');

    const comments = loadGroupComments(group.id);

    if (grfCommentsCount) {
      grfCommentsCount.textContent = `${comments.length} comment${comments.length === 1 ? '' : 's'}`;
    }

    if (comments.length === 0) {
      grfCommentsList.innerHTML = '<div class="comment-empty">No comments yet.</div>';
      return;
    }

    const activeProfileId = getActiveProfileId();
    grfCommentsList.innerHTML = comments.map((comment, idx) => {
      const text = comment.text || '';
      const hasAnim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(comment) : !!(comment.animation);
      const isOwner = comment.authorProfileId && comment.authorProfileId === activeProfileId;
      const isLiked = (comment.likedBy || []).includes(activeProfileId);
      const isFollowed = (comment.followedBy || []).includes(activeProfileId);
      const isBurned = comment.status === 'burned';
      const isDeleted = comment.status === 'deleted';

      let expandBtns = '';
      if (isOwner && !isBurned && !isDeleted) {
        expandBtns += '<button type="button" class="u-card-btn comment-edit-btn" data-comment-idx="' + idx + '" data-group-id="' + group.id + '">' + PENCIL_SVG + ' Edit</button>';
        expandBtns += '<button type="button" class="u-card-btn dark" data-action="clear" data-comment-idx="' + idx + '" data-group-id="' + group.id + '">Boot</button>';
      }
      if (isOwner && isDeleted) {
        expandBtns += '<button type="button" class="u-card-btn" data-action="boot" data-comment-idx="' + idx + '" data-group-id="' + group.id + '">Restore</button>';
        expandBtns += '<button type="button" class="u-card-btn danger" data-action="burn" data-comment-idx="' + idx + '" data-group-id="' + group.id + '">Delete</button>';
      }

      return `
      <div class="u-card${isBurned ? ' burned' : ''}${isDeleted ? ' deleted' : ''}" data-comment-idx="${idx}" data-group-id="${group.id}">
        <div class="u-card-body">
          <div class="u-card-thumb">${isBurned ? CLOSE_SVG : CHAT_SVG}</div>
          <div class="u-card-content">
            <div class="u-card-title">${escapeCommentHtml(comment.authorName || 'Player')}</div>
            <div class="u-card-subtitle">${formatCommentTimestamp(comment.timestamp)}</div>
            <div class="u-card-desc">${escapeCommentHtml(text || (hasAnim ? '(drawing)' : ''))}${hasAnim ? ' <button type="button" class="comment-animation-badge" data-anim-idx="' + idx + '" data-group-id="' + group.id + '"></button>' : ''}</div>
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

    // Cog toggle
    grfCommentsList.querySelectorAll('.u-card-options-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.u-card');
        if (card.classList.contains('burned') && typeof BURNED_MODAL !== 'undefined') {
          BURNED_MODAL.open({}, 'comments'); return;
        }
        card.classList.toggle('expanded');
      });
    });

    bindGroupCommentCardActions(grfCommentsList, group);

    // Edit
    grfCommentsList.querySelectorAll('.comment-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.u-card');
        const idx = parseInt(item.dataset.commentIdx, 10);
        const gId = item.dataset.groupId;
        const allComments = loadGroupComments(gId);
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
            await window.ESHU_COMMENTS.update(comment.id, { text: newText }, { kind: 'group', id: gId });
          }
          renderComments(group);
        };
        textarea.onkeydown = (ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); saveEdit(); }
          if (ev.key === 'Escape') renderComments(group);
        };
        descEl.querySelector('.comment-edit-cancel').onclick = () => renderComments(group);
        descEl.querySelector('.comment-edit-save').onclick = saveEdit;
      });
    });

    // Animation badge
    grfCommentsList.querySelectorAll('.comment-animation-badge').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.animIdx, 10);
        const gId = btn.dataset.groupId;
        const allComments = loadGroupComments(gId);
        const comment = allComments[idx];
        const anim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(comment) : (comment && comment.animation);
        if (anim) window.ANIMATION_PLAYER.open(anim, comment.animationImageUrl || '');
      });
    });
  }

  function openGroupCommentOptionsModal(groupId, idx, rerenderFn) {
    const allComments = loadGroupComments(groupId);
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
      optBtn.onclick = async () => {
        const action = optBtn.dataset.action;
        const target = { kind: 'group', id: groupId };
        if (action === 'edit') {
          modal.classList.remove('open');
          const card = document.querySelector(`.u-card[data-comment-idx="${idx}"]`);
          if (card) triggerGroupCommentInlineEdit(idx, card);
          return;
        }
        if (!window.ESHU_COMMENTS) return;
        if (action === 'like') {
          await window.ESHU_COMMENTS.toggleLike(comment.id, target);
        } else if (action === 'follow') {
          await window.ESHU_COMMENTS.toggleFollow(comment.id, target);
        } else if (action === 'burn') {
          await window.ESHU_COMMENTS.remove(comment.id, 'burned', target);
        } else if (action === 'restore') {
          await window.ESHU_COMMENTS.update(comment.id, { status: 'active' }, target);
        }
        modal.classList.remove('open');
        rerenderFn();
      };
    });
  }

  function render() {
    const group = getGroup();
    if (!group) {
      TOAST.error('Group not found or access denied');
      window.location.href = 'groups.html';
      return;
    }

    const games = (ESHU_DB.getTable('games') || []).filter(g => ESHU_DB.isEntityActive(g) && g.hostGroupId === group.id);
    const profiles = ESHU_DB.getTable('profiles') || [];
    const members = getGroupMembers(group);
    const memberProfiles = members
      .map((id) => profiles.find((p) => p.id === id))
      .filter(Boolean);

    syncHeaderActionButtons(group);
    renderHero(group, games, memberProfiles);
    renderGamesList(games, grfGamesSearch ? grfGamesSearch.value : '');
    renderComments(group);

    // Refresh comments from the server in the background. The first render
    // above uses whatever's in the localStorage cache so the UI is instant;
    // when the network call returns, the cache + a follow-up render show the
    // canonical thread (including comments from other players on this device's
    // first visit). Fire-and-forget by design.
    if (window.ESHU_COMMENTS) {
      window.ESHU_COMMENTS.hydrate({ kind: 'group', id: group.id })
        .then(() => renderComments(group))
        .catch((err) => console.warn('[group-front] comments hydrate failed:', err));
    }

    if (grfGamesSearch) {
      grfGamesSearch.oninput = () => renderGamesList(games, grfGamesSearch.value);
    }
  }

  function init() {
    updateNavProfile();
    if (grfCommentsToggle && grfCommentsSection) {
      const grfBody = document.querySelector('.grf-body');
      grfCommentsToggle.addEventListener('click', () => {
        const isMax = grfCommentsSection.classList.toggle('maximized');
        if (grfBody) grfBody.classList.toggle('collapsed', isMax);
        grfCommentsToggle.classList.toggle('is-exit', isMax);
        grfCommentsToggle.title = isMax ? 'Minimize comments' : 'Maximize comments';
      });
    }
    if (grfBackBtn) grfBackBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'groups.html';
      }
    });
    if (grfLikeBtn) grfLikeBtn.addEventListener('click', () => {
      const group = getGroup();
      const activeProfileId = getActiveProfileId();
      if (!group || !activeProfileId) return;
      const groups = ESHU_DB.getTable('groups') || [];
      const idx = groups.findIndex(g => g.id === group.id);
      if (idx === -1) return;
      const target = groups[idx];
      target.likedBy = Array.isArray(target.likedBy) ? target.likedBy : [];
      const likeIdx = target.likedBy.indexOf(activeProfileId);
      if (likeIdx >= 0) {
        target.likedBy.splice(likeIdx, 1);
        TOAST.success('Unliked');
      } else {
        target.likedBy.push(activeProfileId);
        TOAST.success('Liked!');
      }
      ESHU_DB.setTable('groups', groups);
      render();
    });
    if (grfFollowBtn) grfFollowBtn.addEventListener('click', () => {
      const group = getGroup();
      const activeProfileId = getActiveProfileId();
      if (!group || !activeProfileId) return;
      const groups = ESHU_DB.getTable('groups') || [];
      const idx = groups.findIndex(g => g.id === group.id);
      if (idx === -1) return;
      const target = groups[idx];
      target.followedBy = Array.isArray(target.followedBy) ? target.followedBy : [];
      const followIdx = target.followedBy.indexOf(activeProfileId);
      if (followIdx >= 0) {
        target.followedBy.splice(followIdx, 1);
        TOAST.success('Unfollowed');
      } else {
        target.followedBy.push(activeProfileId);
        TOAST.success('Followed!');
      }
      ESHU_DB.setTable('groups', groups);
      render();
    });
    if (grfSettingsBtn) grfSettingsBtn.addEventListener('click', () => {
      const group = getGroup();
      const activeProfileId = getActiveProfileId();
      if (!group) return;
      const ownerId = getGroupOwnerProfileId(group);
      if (ownerId && ownerId !== activeProfileId) {
        TOAST.error('Only the group owner can edit this group');
        return;
      }
      window.location.href = `groups.html?action=edit&groupId=${encodeURIComponent(group.id)}&from=group-front`;
    });
    if (grfCommentsSubmit && grfCommentsInput) {
      grfCommentsInput.maxLength = 1000;
      const submitGroupComment = async () => {
        const group = getGroup();
        if (!group) return;

        if (window.MESSAGES_GATE && !window.MESSAGES_GATE.canComment()) {
          const needed = window.MESSAGES_GATE.COMMENTS_UNLOCK_XP || 3;
          if (typeof TOAST !== 'undefined') TOAST.error('You need at least ' + needed + ' XP to comment.');
          return;
        }

        const text = grfCommentsInput.value.trim().slice(0, 1000);
        if (!text) return;

        // Server-backed post via ESHU_COMMENTS. Falls back to a local-only
        // optimistic row when remote mode is off or the network is down,
        // matching the rest of the platform's resilience model.
        const target = { kind: 'group', id: group.id };
        let created = null;
        if (window.ESHU_COMMENTS) {
          const activeProfile = getActiveProfile();
          created = await window.ESHU_COMMENTS.post(target, { text });
          // Decorate the cached row with the legacy `authorName` field so
          // existing render code doesn't have to look up the profile.
          if (created && !created.authorName) {
            created.authorName = activeProfile?.name || 'Player';
            const cached = window.ESHU_COMMENTS.load(target);
            const idx = cached.findIndex((c) => c && c.id === created.id);
            if (idx >= 0) {
              cached[idx] = created;
              window.ESHU_COMMENTS._writeCache(target, cached);
            }
          }
        }
        if (created) {
          const awardResult = await ESHU_API.xp.awardSafe('comment_posted', created.id);
          if (xpCounter) xpCounter.textContent = parseInt(awardResult.xpPoints || 0, 10) + ' XP';
          if (window.XP_ANIM && awardResult.delta > 0) XP_ANIM.show(awardResult.delta);
        }
        grfCommentsInput.value = '';
        renderComments(group);
      };

      grfCommentsSubmit.addEventListener('click', submitGroupComment);
      grfCommentsInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        submitGroupComment();
      });
    }
    render();
    ESHU_DB.subscribe(() => render(), { immediate: false });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
