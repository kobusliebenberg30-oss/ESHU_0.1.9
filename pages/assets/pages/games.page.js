(function () {
  'use strict';

  // ===== GAMES PAGE =====
  // Behavior:
  // - Single tap on game = highlight + show preview on right (list stays visible)
  // - Double tap on game OR click preview image OR click Edit = enter edit mode
  // - Edit mode: image on left, edit form on right with Save button at bottom

  const FOLLOW_ARROW_SVG = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  const CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
  const PALETTE_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c.55 0 1-.45 1-1 0-.28-.11-.53-.29-.71a.986.986 0 01-.29-.71c0-.55.45-1 1-1h1.17C17.73 18.58 20 16.31 20 13.5 20 7.36 16.42 2 12 2zM6.5 12c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5S18.33 12 17.5 12z"/></svg>';

  // Builds diamond-framed game image markup (img clipped to diamond, cap+outline overlaid)
  function buildDiamondImageSvg(imageUrl) {
    if (window.ESHU_UI_MARKUP && typeof window.ESHU_UI_MARKUP.diamondImage === 'function') {
      return window.ESHU_UI_MARKUP.diamondImage(imageUrl);
    }
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

  function bindGameCommentCardActions(listEl, game, onStatusChanged, opts) {
    if (!listEl || !game?.id || !window.ESHU_COMMENT_ACTIONS?.bindThreadCardActions) return;
    opts = opts || {};
    const loadComments = typeof opts.loadComments === 'function'
      ? opts.loadComments
      : (threadId) => loadGameComments(threadId);
    const makeTarget = typeof opts.makeTarget === 'function'
      ? opts.makeTarget
      : (threadId) => ({ kind: 'game', id: threadId });
    const bindingKey = `game:${game.id}`;
    if (listEl.dataset.commentActionsBoundFor === bindingKey) return;
    if (typeof listEl._unbindCommentActions === 'function') {
      listEl._unbindCommentActions();
    }
    listEl._unbindCommentActions = window.ESHU_COMMENT_ACTIONS.bindThreadCardActions({
      containerEl: listEl,
      getThreadIdFromCard: (card) => card?.dataset?.gameId || null,
      loadThreadComments: loadComments,
      makeTarget,
      onStatusChanged: (action) => {
        // Only call the original callback for status changes that affect visibility (burn/boot/clear)
        // Like/Follow don't need re-render as button states are updated by bindThreadCardActions
        if ((action === 'burn' || action === 'boot' || action === 'clear') && typeof onStatusChanged === 'function') {
          onStatusChanged(action);
        }
      },
    });
    listEl.dataset.commentActionsBoundFor = bindingKey;
  }
  const CREATION_UPLOAD_UNLOCK_XP = 2;
  const GAME_VOTE_USAGE_KEY = 'gameVoteUsageByProfile';
  const runtime = window.ESHU_RUNTIME;

  // State
  let selectedGameId = null;
  let editReturnContext = null;
  let isEditMode = false;
  let isCreateMode = false; // New: for create game flow
  // Timing model (new semantics):
  //   startAt  : absolute ms timestamp; any moment, past OR future.
  //   duration : total runtime of the game (offset from start to end).
  //   submission: when subs close (offset from start, must be <= duration).
  // End time is derived as startAt + duration and rendered read-only.
  let timingState = {
    mode: 'deadline',
    startAt: Date.now(),
    duration: { weeks: 0, days: 1, hours: 0, mins: 0 },
    submission: { weeks: 0, days: 0, hours: 23, mins: 0 }
  };
  let gameModeState = 'arena';
  let lastClickTime = 0;
  let lastClickedId = null;
  let hostGroupLockedForEdit = false;
  let pendingImageData = null; // For image upload
  let diamondEditorState = null;
  let pendingCommentAnimation = null;
  let pendingCommentAnimationImageUrl = '';
  let createGameData = { groupId: null, groupName: null }; // For create game flow
  let gameFrontSelectedPlayerId = null;
  let gameFrontSelectedCreationId = null;
  let sourceGroupContextId = null;

  // DOM Elements
  let pageContainer, gamesListWrapper, gameImagePanel, emptyState;
  let gamePreviewPanel, gameEditPanel, gamesList, searchBox, groupFilter, scopeFilter, loadingOverlay;
  let gamesContextTag;
  let backBtn, imagePanelTitle, gameImageLarge;
  let previewTitle, previewImage;
  let previewLikeBtn, previewFollowBtn, previewSettingsBtn;
  let previewPrivacyBadge, previewModeBadge;
  let detailTitle, detailGroup, detailOwner, detailTime, detailVotesAvailable;
  let previewPlayBtn, previewImageHint;
  let editTitle, editDescription, editRules, editTags;
  let editPanelTitle;
  let cancelBtn, saveBtn;
  let groupDropdown, groupDropdownTrigger, groupDropdownValue, groupDropdownMenu, groupDropdownList, groupSearchInput;
  let imageUploadInput;
  let selectedGroupId = null;

  function renderGameImageLarge(imageUrl) {
    if (!gameImageLarge) return;
    if (imageUrl) {
      gameImageLarge.innerHTML = buildDiamondImageSvg(imageUrl);
    } else {
      gameImageLarge.innerHTML = `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
    }
  }

  let gamesGlobalListenersBound = false;

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function applyHostGroupLockUi() {
    if (groupDropdownTrigger) {
      groupDropdownTrigger.classList.toggle('locked', !!hostGroupLockedForEdit);
      groupDropdownTrigger.title = hostGroupLockedForEdit
        ? 'Host group cannot be changed after game creation'
        : '';
    }
    if (groupSearchInput) {
      groupSearchInput.disabled = !!hostGroupLockedForEdit;
      groupSearchInput.placeholder = hostGroupLockedForEdit
        ? 'Host group is locked after game creation'
        : 'Search groups...';
      groupSearchInput.title = hostGroupLockedForEdit
        ? 'Host group cannot be changed after game creation'
        : '';
    }
    if (hostGroupLockedForEdit) closeGroupDropdown();
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
    if (group?.ownerProfileId && !members.includes(group.ownerProfileId)) {
      members.push(group.ownerProfileId);
    }
    return members;
  }

  function isGroupMember(group, profileId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.isMember === 'function') {
      return window.ESHU_FLOW.isMember(group, profileId);
    }
    if (!group || !profileId) return false;
    return getGroupMembers(group).includes(profileId);
  }

  function hasJoinedAnyGroup(profileId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.hasJoinedAnyGroup === 'function') {
      return window.ESHU_FLOW.hasJoinedAnyGroup(profileId);
    }
    if (!profileId) return false;
    const stateGroups = STATE.get('groups') || [];
    const storageGroups = ESHU_DB.getTable ? (ESHU_DB.getTable('groups') || []) : [];
    const groups = stateGroups.concat(storageGroups.filter(group => {
      return group && !stateGroups.some(stateGroup => stateGroup && stateGroup.id === group.id);
    }));
    return groups.some(group => {
      if (!group || group.status === 'deleted' || group.status === 'burned') return false;
      return isGroupMember(group, profileId);
    });
  }

  function isDefaultGroup(groupOrId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.isDefaultGroup === 'function') {
      return window.ESHU_FLOW.isDefaultGroup(groupOrId);
    }
    const id = typeof groupOrId === 'string' ? groupOrId : groupOrId?.id;
    return id === 'group_default';
  }

  function hasGameCreationUnlocked(profileId) {
    if (!profileId) return false;
    const xp = parseInt(ESHU_DB.getProfileXp(profileId) || 0, 10);
    if (xp >= CREATION_UPLOAD_UNLOCK_XP) return true;
    const defaultJoinKey = `defaultGroupJoinXpAwarded_${profileId}`;
    if (ESHU_DB.getValue && ESHU_DB.getValue(defaultJoinKey)) return true;
    const groups = ESHU_DB.getTable ? (ESHU_DB.getTable('groups') || []) : [];
    const defaultGroup = groups.find(group => group && group.id === 'group_default');
    if (defaultGroup && isGroupMember(defaultGroup, profileId)) return true;
    const games = ESHU_DB.getTable ? (ESHU_DB.getTable('games') || []) : [];
    return games.some(game => {
      if (!game || game.status === 'deleted' || game.status === 'burned') return false;
      return game.ownerProfileId === profileId || game.createdByProfileId === profileId;
    });
  }

  function redirectToGroupSetupForCreate(activeProfileId) {
    if (hasGameCreationUnlocked(activeProfileId)) {
      TOAST.info('Choose or create a group to host your next game.');
      window.location.href = 'groups.html?action=create&return=create-game';
      return;
    }
    TOAST.info('Start by joining the Default Group. That unlocks the Default Game and Create Game.');
    window.location.href = 'groups.html?onboarding=join-default';
  }

  function canUploadCreation(profileId) {
    if (window.ESHU_FLOW && typeof window.ESHU_FLOW.hasUploadUnlock === 'function') {
      return window.ESHU_FLOW.hasUploadUnlock(profileId);
    }
    const xp = parseInt(ESHU_DB.getProfileXp(profileId) || 0, 10);
    if (xp >= CREATION_UPLOAD_UNLOCK_XP) return true;
    const scopedUnlockKey = `creationUploadUnlocked_${profileId || 'global'}`;
    return !!ESHU_DB.getValue(scopedUnlockKey);
  }

  // Onboarding upload eligibility: default-group/default-game members may
  // upload to game_default before reaching the 2-XP upload unlock so they
  // can earn XP toward Comments (3 XP) and Upload (2 XP) unlocks.
  function canUploadToDefaultGame(profileId, game) {
    if (!profileId) return false;
    if (!game || game.id !== 'game_default') return false;
    const gameMembers = Array.isArray(game.memberProfileIds) ? game.memberProfileIds : [];
    if (gameMembers.includes(profileId) || game.ownerProfileId === profileId) return true;
    const groups = (ESHU_DB.getTable ? (ESHU_DB.getTable('groups') || []) : []).concat(STATE.get('groups') || []);
    const defaultGroup = groups.find(g => g && g.id === 'group_default');
    if (!defaultGroup) return false;
    const groupMembers = Array.isArray(defaultGroup.memberProfileIds) ? defaultGroup.memberProfileIds : [];
    return groupMembers.includes(profileId) || defaultGroup.ownerProfileId === profileId;
  }

  function refreshXpCounter() {
    const xpCounter = document.getElementById('xpCounter');
    if (!xpCounter) return;
    const activeProfileId = getActiveProfileId();
    const xpPoints = parseInt(ESHU_DB.getProfileXp(activeProfileId) || 0, 10);
    xpCounter.textContent = xpPoints + ' XP';
  }

  function canViewGroup(group, profileId) {
    if (!group) return false;
    if (group.privacy !== 'private') return true;
    return isGroupMember(group, profileId);
  }

  function getGameMembers(game) {
    const members = Array.isArray(game?.memberProfileIds) ? game.memberProfileIds.filter(Boolean) : [];
    if (game?.ownerProfileId && !members.includes(game.ownerProfileId)) {
      members.push(game.ownerProfileId);
    }
    return members;
  }

  function canAccessGame(game, profileId, groups) {
    if (!game) return false;
    if (game.privacy !== 'private') return true;
    if (!profileId) return false;
    if (game.ownerProfileId === profileId) return true;
    if (getGameMembers(game).includes(profileId)) return true;
    const hostGroup = (groups || []).find(g => g.id === game.hostGroupId);
    return isGroupMember(hostGroup, profileId);
  }

  function gameBelongsToProfile(game, profileId, groups, creations) {
    if (!game || !profileId) return false;
    if (game.ownerProfileId === profileId) return true;
    if (getGameMembers(game).includes(profileId)) return true;
    const hasProfileCreation = (creations || []).some(creation => {
      if (!creation || (creation.status === 'deleted' || creation.status === 'burned')) return false;
      const ownerId = getCreationOwnerProfileId(creation);
      if (!ownerId || ownerId !== profileId) return false;
      const hostGameId = creation.hostGameId || creation.gameId || null;
      return hostGameId === game.id;
    });
    if (hasProfileCreation) return true;
    if (!game.hostGroupId) return false;
    const hostGroup = (groups || []).find(g => g.id === game.hostGroupId);
    if (!hostGroup || !ESHU_DB.isEntityActive(hostGroup)) return false;
    return isGroupMember(hostGroup, profileId);
  }

  function getCreationOwnerProfileId(creation) {
    return creation?.ownerProfileId || creation?.authorProfileId || creation?.createdByProfileId || creation?.authorId || null;
  }

  function getCreationAuthorName(creation) {
    return creation?.authorName || creation?.author || 'Anonymous';
  }

  function getCreationVoteCount(creation) {
    if (!creation || typeof creation !== 'object') return 0;
    const parsedVotes = Number(creation.votes);
    if (Number.isFinite(parsedVotes)) return parsedVotes;
    const likedBy = Array.isArray(creation.likedBy) ? creation.likedBy : [];
    return likedBy.length;
  }

  function getCreationBurnCount(creation) {
    if (!creation || typeof creation !== 'object') return 0;
    const parsedBurns = Number(creation.burns);
    return Number.isFinite(parsedBurns) ? parsedBurns : 0;
  }

  function getGameVoteCount(game, gameCreations) {
    const parsedGameVotes = Number(game?.votes);
    if (Number.isFinite(parsedGameVotes)) return parsedGameVotes;
    return (gameCreations || []).reduce((sum, creation) => sum + getCreationVoteCount(creation), 0);
  }

  function getGameBurnCount(game, gameCreations) {
    const parsedGameBurns = Number(game?.burns);
    if (Number.isFinite(parsedGameBurns)) return parsedGameBurns;
    return (gameCreations || []).reduce((sum, creation) => sum + getCreationBurnCount(creation), 0);
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

  function getGameVoteCapForProfile(game) {
    if (!game?.id) return 0;
    return getGameCreationsForProfile(game, { limit: 5000 }).length;
  }

  function getRemainingVotesForProfile(game) {
    if (!game?.id) return 0;
    // Check for infinite votes (developer mode)
    const infiniteVotes = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getValue)
      ? !!ESHU_DB.getValue('infiniteVotes')
      : false;
    if (infiniteVotes) return Infinity;
    const cap = getGameVoteCapForProfile(game);
    const used = getUsedVotesForGame(getActiveProfileId(), game.id);
    return Math.max(0, cap - used);
  }

  function updateChamferVotesAvailable(game) {
    const votesEl = document.getElementById('gfPlayVotesAvailable');
    if (!votesEl) return;
    votesEl.textContent = String(getRemainingVotesForProfile(game));
  }

  function getGameOwnerName(game) {
    if (game?.ownerName) return game.ownerName;
    if (game?.ownerProfileId) {
      const profiles = getProfiles();
      const owner = profiles.find(p => p.id === game.ownerProfileId);
      if (owner) return owner.name || 'Player';
    }
    return 'Player';
  }

  function getGameCommentsStorageKey(gameId) {
    return `comments_game_${gameId}`;
  }

  function runHype(message, onComplete, duration = 900) {
    if (window.TOAST && typeof TOAST.hype === 'function') {
      TOAST.hype(message, { duration, onComplete });
      return;
    }
    if (typeof onComplete === 'function') {
      onComplete();
    }
  }

  function loadGameComments(gameId) {
    if (!gameId) return [];
    const target = { kind: 'game', id: gameId };
    if (window.ESHU_COMMENTS && typeof window.ESHU_COMMENTS.load === 'function') {
      return window.ESHU_COMMENTS.load(target);
    }
    const key = getGameCommentsStorageKey(gameId);
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(c => {
          if (!c || typeof c !== 'object') return false;
          const hasText = typeof c.text === 'string' && c.text.trim();
          return hasText || hasCommentAnimation(c);
        })
        .filter(c => c.status !== 'deleted' && c.status !== 'burned')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (err) {
      console.warn('Failed to load game comments:', err);
      return [];
    }
  }

  function saveGameComments(gameId, comments) {
    if (!gameId) return;
    const target = { kind: 'game', id: gameId };
    if (window.ESHU_COMMENTS && typeof window.ESHU_COMMENTS._writeCache === 'function') {
      window.ESHU_COMMENTS._writeCache(target, comments || []);
      return;
    }
    const key = getGameCommentsStorageKey(gameId);
    localStorage.setItem(key, JSON.stringify(comments || []));
  }

  function loadCreationCommentsForGameView(creationId) {
    if (!creationId) return [];
    const key = `comments_${creationId}`;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(c => {
          if (!c || typeof c !== 'object') return false;
          const hasText = typeof c.text === 'string' && c.text.trim();
          return hasText || hasCommentAnimation(c);
        })
        .filter(c => c.status !== 'deleted' && c.status !== 'burned')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (err) {
      console.warn('Failed to load creation comments:', err);
      return [];
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

  // Delegates to shared Eshu engine component
  function hasCommentAnimation(c) { return window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(c) : !!(c && c.animation); }

  function getGameCommentImageUrl(game) {
    if (game && game.image) return game.image;
    const img = document.querySelector('#gfGameImage img');
    return img ? (img.src || '') : '';
  }

  function getGameCommentImageMeta(game) {
    if (!window.DRAWING_COMPOSITOR?.extractImageMeta) return {};
    return window.DRAWING_COMPOSITOR.extractImageMeta(game || {});
  }

  function openGameCommentAnimationPlayer(data, img) { if (window.ANIMATION_PLAYER) window.ANIMATION_PLAYER.open(data, img); }

  function buildGameCommentCardHtml(comment, idx, gameId, activeProfileId) {
    const text = comment.text || '';
    const hasAnim = hasCommentAnimation(comment);
    const isOwner = comment.authorProfileId && comment.authorProfileId === activeProfileId;
    const isLiked = (comment.likedBy || []).includes(activeProfileId);
    const isFollowed = (comment.followedBy || []).includes(activeProfileId);
    const isBurned = comment.status === 'burned';
    const isDeleted = comment.status === 'deleted';

    let expandBtns = '';
    if (isOwner && !isBurned && !isDeleted) {
      expandBtns += '<button type="button" class="u-card-btn comment-edit-btn" data-comment-idx="' + idx + '" data-game-id="' + gameId + '">' + PENCIL_SVG + ' Edit</button>';
      expandBtns += '<button type="button" class="u-card-btn dark" data-action="clear" data-comment-idx="' + idx + '" data-game-id="' + gameId + '">Boot</button>';
    }
    if (isOwner && isDeleted) {
      expandBtns += '<button type="button" class="u-card-btn" data-action="boot" data-comment-idx="' + idx + '" data-game-id="' + gameId + '">Restore</button>';
      expandBtns += '<button type="button" class="u-card-btn danger" data-action="burn" data-comment-idx="' + idx + '" data-game-id="' + gameId + '">Delete</button>';
    }

    const creationIdAttr = comment._creationId ? ` data-creation-id="${escapeCommentHtml(String(comment._creationId))}"` : '';
    return `
      <div class="u-card${isBurned ? ' burned' : ''}${isDeleted ? ' deleted' : ''}" data-comment-idx="${idx}" data-game-id="${gameId}" data-comment-id="${escapeCommentHtml(String(comment.id || ''))}"${creationIdAttr}>
        <div class="u-card-body">
          <div class="u-card-thumb">${isBurned ? CLOSE_SVG : CHAT_SVG}</div>
          <div class="u-card-content">
            <div class="u-card-title">${escapeCommentHtml(comment.authorName || 'Player')}</div>
            <div class="u-card-subtitle">${formatCommentTimestamp(comment.timestamp)}</div>
            <div class="u-card-desc">${escapeCommentHtml(text || (hasAnim ? '(drawing)' : ''))}${hasAnim ? ' <button type="button" class="comment-animation-badge" data-anim-idx="' + idx + '" data-comment-id="' + escapeCommentHtml(comment.id || '') + '" title="View drawing"></button>' : ''}</div>
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
  }

  // Builds the SAME combined + sorted comment list that the Comments tab
  // renders (game comments + comments from every creation in the game).
  // Action handlers must use this so card indices line up with the data.
  function getCombinedGameComments(gameId, sortOrder) {
    if (!gameId) return [];
    let allComments = [...loadGameComments(gameId)];
    const gameCreations = (ESHU_DB.getTable('creations') || [])
      .filter(c => c && c.hostGameId === gameId);
    gameCreations.forEach(creation => {
      const creationComments = loadCreationCommentsForGameView(creation.id);
      creationComments.forEach(c => {
        c._creationId = creation.id;
        c._creationName = creation.name;
      });
      allComments = allComments.concat(creationComments);
    });
    return allComments.sort((a, b) => {
      if (sortOrder === 'oldest') return (a.timestamp || 0) - (b.timestamp || 0);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }

  // Resolves a comment + its store target from a rendered card, using the
  // stable comment id (with index fallback). Handles creation comments which
  // live in a different store/target than game comments.
  function resolveGameCommentFromCard(card, gameId) {
    if (!card) return { comment: null, target: { kind: 'game', id: gameId } };
    const creationId = card.dataset.creationId || '';
    const commentId = card.dataset.commentId || '';
    const list = creationId
      ? loadCreationCommentsForGameView(creationId)
      : loadGameComments(gameId);
    let comment = list.find(c => String(c.id || '') === String(commentId));
    if (!comment) {
      const idx = parseInt(card.dataset.commentIdx, 10);
      const combined = getCombinedGameComments(gameId, getGameCommentsSortOrder());
      comment = Number.isInteger(idx) ? combined[idx] : null;
    }
    const target = creationId
      ? { kind: 'creation', id: creationId }
      : { kind: 'game', id: gameId };
    return { comment, target, creationId };
  }

  function getGameCommentsSortOrder() {
    const sortEl = document.getElementById('gfCommentsSort');
    return sortEl ? sortEl.value : 'recent';
  }

  // Preserve which comment cards have an open cog menu (expanded) / selection
  // so a re-render (e.g. triggered by a like/follow toggle) doesn't collapse them.
  function captureCommentCardUiState(listEl) {
    if (!listEl) return null;
    const grab = (sel) => Array.from(listEl.querySelectorAll(sel))
      .map(c => c.dataset.commentId)
      .filter(Boolean);
    return {
      expanded: grab('.u-card.expanded'),
      selected: grab('.u-card.selected'),
    };
  }

  function restoreCommentCardUiState(listEl, state) {
    if (!listEl || !state) return;
    const apply = (ids, cls) => (ids || []).forEach(id => {
      const card = listEl.querySelector(`.u-card[data-comment-id="${CSS.escape(id)}"]`);
      if (card && !card.classList.contains('editing')) card.classList.add(cls);
    });
    apply(state.expanded, 'expanded');
    apply(state.selected, 'selected');
  }

  function renderGameComments(game, listEl, countEl, sortOrder) {
    if (!listEl || !game?.id) return;

    const sorted = getCombinedGameComments(game.id, sortOrder);

    if (countEl) {
      countEl.textContent = `${sorted.length} comment${sorted.length === 1 ? '' : 's'}`;
    }

    if (sorted.length === 0) {
      listEl.innerHTML = '<div class="u-card-empty">No comments yet.</div>';
      return;
    }

    const uiState = captureCommentCardUiState(listEl);
    const activeProfileId = getActiveProfileId();
    listEl.innerHTML = sorted
      .map((comment, idx) => buildGameCommentCardHtml(comment, idx, game.id, activeProfileId))
      .join('');
    restoreCommentCardUiState(listEl, uiState);

    // Cog button - edit own comments, or show expanded actions for others
    listEl.querySelectorAll('.u-card-options-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.u-card');
        if (card.classList.contains('burned') && typeof BURNED_MODAL !== 'undefined') {
          BURNED_MODAL.open({}, 'comments'); return;
        }
        const { comment, target } = resolveGameCommentFromCard(card, game.id);
        if (!comment) return;
        
        const commentAuthorId = comment.authorProfileId || comment.profileId;
        const isOwner = commentAuthorId === getActiveProfileId();
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
            if (window.ESHU_COMMENTS) {
              await window.ESHU_COMMENTS.update(comment.id, { text: newText }, target);
            }
            renderGameComments(game, listEl, countEl, sortOrder);
            if (typeof TOAST !== 'undefined') TOAST.success('Comment updated');
          });
          
          // Cancel handler
          const cancelBtn = descEl.querySelector('.comment-edit-cancel');
          cancelBtn.addEventListener('click', () => renderGameComments(game, listEl, countEl, sortOrder));
          return;
        }
        
        // Otherwise, just toggle expanded actions
        card.classList.toggle('expanded');
      });
    });

    bindGameCommentCardActions(listEl, game, () => refreshGameCommentsViews(game), {
      // The Comments tab renders a COMBINED list (game + creation comments),
      // so action handlers must resolve indices against the same combined,
      // live-sorted list and target the correct store (game vs creation).
      loadComments: (threadId) => getCombinedGameComments(threadId, getGameCommentsSortOrder()),
      makeTarget: (threadId, card) => {
        const cid = card?.dataset?.creationId;
        return cid ? { kind: 'creation', id: cid } : { kind: 'game', id: threadId };
      },
    });

    // Edit button
    listEl.querySelectorAll('.comment-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.u-card');
        const { comment, target } = resolveGameCommentFromCard(item, game.id);
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
          renderGameComments(game, listEl, countEl, sortOrder);
        };
        textarea.onkeydown = (ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); saveEdit(); }
          if (ev.key === 'Escape') renderGameComments(game, listEl, countEl, sortOrder);
        };
        descEl.querySelector('.comment-edit-cancel').onclick = () => renderGameComments(game, listEl, countEl, sortOrder);
        descEl.querySelector('.comment-edit-save').onclick = saveEdit;
      });
    });

    // Animation badge
    listEl.querySelectorAll('.comment-animation-badge').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.u-card');
        const { comment } = resolveGameCommentFromCard(card, game.id);
        if (!comment || !hasCommentAnimation(comment)) return;
        const anim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(comment) : comment.animation;
        let imageUrl = comment.animationImageUrl || '';
        if (!imageUrl || imageUrl.startsWith('blob:')) {
          imageUrl = getGameCommentImageUrl(game);
        }
        openGameCommentAnimationPlayer(anim, imageUrl);
      });
    });
  }

  function populateCommentsTab(game) {
    const listEl = document.getElementById('gfCommentsList');
    const countEl = document.getElementById('gfCommentsCount');
    const sortEl = document.getElementById('gfCommentsSort');
    const sortOrder = sortEl ? sortEl.value : 'recent';
    renderGameComments(game, listEl, countEl, sortOrder);
    if (listEl) {
      listEl.querySelectorAll('.u-card').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const isBurned = item.classList.contains('burned');
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open({}, 'comments'); return; }
          listEl.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          item.classList.add('selected');
        });
      });
    }
  }

  function populateInlineComments(game) {
    const listEl = document.getElementById('gfInlineCommentsList');
    const countEl = document.getElementById('gfInlineCommentsCount');
    if (!listEl || !game?.id) return;

    const comments = loadGameComments(game.id);
    if (countEl) {
      countEl.textContent = `${comments.length} comment${comments.length === 1 ? '' : 's'}`;
    }

    if (comments.length === 0) {
      listEl.innerHTML = '<div class="u-card-empty">No comments yet.</div>';
      return;
    }

    const activeProfileId = getActiveProfileId();
    listEl.innerHTML = comments
      .map((comment, idx) => buildGameCommentCardHtml(comment, idx, game.id, activeProfileId))
      .join('');

    // Cog button - edit own comments, or show expanded actions for others
    listEl.querySelectorAll('.u-card-options-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.u-card');
        if (card.classList.contains('burned') && typeof BURNED_MODAL !== 'undefined') {
          BURNED_MODAL.open({}, 'comments'); return;
        }
        const idx = parseInt(card.dataset.commentIdx, 10);
        const allComments = loadGameComments(game.id);
        const comment = allComments[idx];
        if (!comment) return;
        
        const commentAuthorId = comment.authorProfileId || comment.profileId;
        const isOwner = commentAuthorId === getActiveProfileId();
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
          const target = { kind: 'game', id: game.id };
          const saveBtn = descEl.querySelector('.comment-edit-save');
          saveBtn.addEventListener('click', async () => {
            const newText = textarea.value.trim().slice(0, 1000);
            if (window.ESHU_COMMENTS) {
              await window.ESHU_COMMENTS.update(comment.id, { text: newText }, target);
            } else {
              comment.text = newText;
              saveGameComments(game.id, allComments);
            }
            populateInlineComments(game);
            if (typeof TOAST !== 'undefined') TOAST.success('Comment updated');
          });
          
          // Cancel handler
          const cancelBtn = descEl.querySelector('.comment-edit-cancel');
          cancelBtn.addEventListener('click', () => populateInlineComments(game));
          return;
        }
        
        // Otherwise, just toggle expanded actions
        card.classList.toggle('expanded');
      });
    });

    bindGameCommentCardActions(listEl, game, () => populateInlineComments(game));

    // Edit button (server-authoritative).
    listEl.querySelectorAll('.comment-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.u-card');
        const idx = parseInt(item.dataset.commentIdx, 10);
        const gameId = item.dataset.gameId;
        const target = { kind: 'game', id: gameId };
        const allComments = loadGameComments(gameId);
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
          populateInlineComments(game);
        };
        textarea.onkeydown = (ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); saveEdit(); }
          if (ev.key === 'Escape') populateInlineComments(game);
        };
        descEl.querySelector('.comment-edit-cancel').onclick = () => populateInlineComments(game);
        descEl.querySelector('.comment-edit-save').onclick = saveEdit;
      });
    });

    // Animation badge
    listEl.querySelectorAll('.comment-animation-badge').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.dataset.commentId;
        const allComments = loadGameComments(game.id);
        const comment = allComments.find(c => String(c.id || '') === String(commentId || '')) || allComments[parseInt(btn.dataset.animIdx, 10)];
        if (!comment || !hasCommentAnimation(comment)) return;
        const anim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(comment) : comment.animation;
        let imageUrl = comment.animationImageUrl || '';
        if (!imageUrl || imageUrl.startsWith('blob:')) {
          imageUrl = getGameCommentImageUrl(game);
        }
        openGameCommentAnimationPlayer(anim, imageUrl);
      });
    });
  }

  function refreshGameCommentsViews(game) {
    populateCommentsTab(game);
    populateInlineComments(game);
    // Fire-and-forget server hydrate. First render uses the localStorage
    // cache (instant); when the canonical thread arrives, we re-render so
    // comments authored on other devices / by other players show up.
    if (game?.id && window.ESHU_COMMENTS) {
      window.ESHU_COMMENTS.hydrate({ kind: 'game', id: game.id })
        .then(() => {
          populateCommentsTab(game);
          populateInlineComments(game);
        })
        .catch((err) => console.warn('[games] comments hydrate failed:', err));
    }
  }

  let gameCommentsRefreshRaf = null;
  function scheduleGameCommentsRefresh(game) {
    if (!game?.id) return;
    if (gameCommentsRefreshRaf) cancelAnimationFrame(gameCommentsRefreshRaf);
    gameCommentsRefreshRaf = requestAnimationFrame(() => {
      gameCommentsRefreshRaf = null;
      populateCommentsTab(game);
      populateInlineComments(game);
    });
  }

  async function submitGameComment(game, inputEl) {
    if (!game?.id || !inputEl) return;

    if (window.MESSAGES_GATE && !window.MESSAGES_GATE.canComment()) {
      const needed = window.MESSAGES_GATE.COMMENTS_UNLOCK_XP || 3;
      if (typeof TOAST !== 'undefined') TOAST.error('You need at least ' + needed + ' XP to comment.');
      return;
    }

    const text = inputEl.value.trim().slice(0, 1000);
    const pending = pendingCommentAnimation;
    if (!text && !pending) return;

    const activeProfile = getActiveProfile();
    const activeProfileId = activeProfile?.id || getActiveProfileId();
    const nextComment = {
      id: `game_comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: text || (pending ? '(drawing)' : ''),
      authorProfileId: activeProfileId || null,
      authorName: activeProfile?.name || 'Player',
      timestamp: Date.now(),
      status: 'active'
    };
    if (pending) {
      nextComment.animation = pending;
      nextComment.animationImageUrl = pendingCommentAnimationImageUrl || getGameCommentImageUrl(game);
      pendingCommentAnimation = null;
      pendingCommentAnimationImageUrl = '';
    }

    // Server-backed post via ESHU_COMMENTS. The synthetic id above is
    // discarded for the canonical server id; we keep the legacy authorName
    // / animation fields decorated on the cached row so render code sees
    // exactly what it used to.
    const target = { kind: 'game', id: game.id };
    let created = null;
    if (window.ESHU_COMMENTS) {
      const postFields = { text: nextComment.text };
      if (nextComment.animation) postFields.animation = nextComment.animation;
      created = await window.ESHU_COMMENTS.post(target, postFields);
      if (created) {
        created.authorName = nextComment.authorName;
        if (nextComment.animationImageUrl) created.animationImageUrl = nextComment.animationImageUrl;
        const cached = window.ESHU_COMMENTS.load(target);
        const idx = cached.findIndex((c) => c && c.id === created.id);
        if (idx >= 0) { cached[idx] = created; window.ESHU_COMMENTS._writeCache(target, cached); }
      } else {
        const cached = loadGameComments(game.id);
        saveGameComments(game.id, [nextComment, ...cached.filter((c) => c && c.id !== nextComment.id)]);
        if (typeof TOAST !== 'undefined') {
          TOAST.warning('Comment saved locally. Sync to server failed.');
        }
      }
    }
    const persistedId = created ? created.id : nextComment.id;
    const kind = nextComment.animation ? 'comment_animated' : 'comment_posted';
    const awardResult = await ESHU_API.xp.awardSafe(kind, persistedId);
    STATE.set('xpPoints', awardResult.xpPoints);
    refreshXpCounter();
    if (window.XP_ANIM && awardResult.delta > 0) XP_ANIM.show(awardResult.delta);
    inputEl.value = '';
    refreshGameCommentsViews(game);
  }

  function initGameCommentComposer(submitButtonId, inputId) {
    const submitEl = document.getElementById(submitButtonId);
    const inputEl = document.getElementById(inputId);
    if (!submitEl || !inputEl) return;

    inputEl.maxLength = 1000;

    const submitCurrentGameComment = async () => {
      const modal = document.getElementById('gameFrontModal');
      const gameId = (modal && modal.dataset.gameId) || selectedGameId;
      const game = gameId ? getGameById(gameId) : null;
      if (!game) {
        if (typeof TOAST !== 'undefined') TOAST.error('No game selected for comments.');
        return;
      }
      try {
        await submitGameComment(game, inputEl);
      } catch (err) {
        console.error('[games] submit comment failed:', err);
        if (typeof TOAST !== 'undefined') TOAST.error('Failed to post comment. Please try again.');
      }
    };

    submitEl.addEventListener('click', submitCurrentGameComment);
    inputEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      submitCurrentGameComment();
    });
  }

  function canAccessCreation(creation, game, profileId, groups) {
    if (!creation) return false;
    const ownerId = getCreationOwnerProfileId(creation);
    if (creation.status === 'deleted' || creation.status === 'burned') {
      return !!(ownerId && ownerId === profileId);
    }
    if (creation.privacy !== 'private') return true;
    // Private creations are only visible to their owner
    return !!(ownerId && ownerId === profileId);
  }

  function getGameCreationsForProfile(game, options = {}) {
    const { search = '', limit = 50 } = options;
    const activeProfileId = getActiveProfileId();
    const groups = STATE.get('groups') || [];
    const query = search.trim().toLowerCase();
    const creations = STATE.get('creations') || [];

    let filtered = creations.filter(c => {
      if (!c) return false;
      if ((c.gameId || c.hostGameId) !== game.id) return false;
      return canAccessCreation(c, game, activeProfileId, groups);
    });

    if (query) {
      filtered = filtered.filter(c => {
        const title = (c.title || c.name || '').toLowerCase();
        const author = getCreationAuthorName(c).toLowerCase();
        const desc = (c.description || '').toLowerCase();
        return title.includes(query) || author.includes(query) || desc.includes(query);
      });
    }

    return filtered
      .sort((a, b) => (a.createdAt || a.timestamp || 0) - (b.createdAt || b.timestamp || 0))
      .slice(0, limit);
  }

  function buildGameFrontReturnUrl(gameId) {
    if (!gameId) return null;
    const sourceGroupPart = sourceGroupContextId
      ? `&sourceGroupId=${encodeURIComponent(sourceGroupContextId)}`
      : '';
    return `games.html?view=front&gameId=${encodeURIComponent(gameId)}${sourceGroupPart}`;
  }

  function openCreationFocusFromGame(gameId, creationId) {
    if (!creationId) return;
    const sourceGroupPart = sourceGroupContextId
      ? `&sourceGroupId=${encodeURIComponent(sourceGroupContextId)}`
      : '';
    const targetUrl = `creation-focus.html?id=${creationId}&from=games.html&gameId=${gameId}${sourceGroupPart}`;
    const returnUrl = buildGameFrontReturnUrl(gameId);
    if (window.NAV_BACK) window.NAV_BACK.goToWithReturn(targetUrl, returnUrl);
    else window.location.href = targetUrl;
  }

  function formatCreationDate(ts) {
    if (!ts) return 'No date';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'No date';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildGameImageFallbackMarkup(game) {
    const title = game?.name || game?.title || 'Untitled Game';
    const desc = game?.description || 'No description provided.';
    const rules = game?.rules || '';
    const privacy = game?.privacy === 'private' ? 'Private' : 'Public';
    const mode = game?.gameType === 'book' ? 'Book' : 'Arena';
    const timing = game?.endTime ? 'Deadline' : 'Infinite';

    return `
      <div class="gf-game-fallback-card">
        <div class="gf-game-fallback-title">${title}</div>
        <div class="gf-game-fallback-meta">${privacy} · ${timing} · ${mode}</div>
        <div class="gf-game-fallback-desc">${desc}</div>
        ${rules ? `<div class="gf-game-fallback-rules">Rules: ${rules}</div>` : ''}
      </div>
    `;
  }

  function renderCreationImageMarkup(creation, fallbackClass) {
    if (!creation) {
      return `<div class="${fallbackClass} gf-detail-fallback"><div class="gf-detail-title">No creation selected</div></div>`;
    }

    const hasVisual = !!(creation.image || creation.imageAssetId || creation.imageRef?.id);
    const title = creation.title || creation.name || 'Untitled';
    const author = getCreationAuthorName(creation);
    const desc = creation.description || 'No description';
    const votes = getCreationVoteCount(creation);
    const detailMarkup = `
      <div class="gf-detail-fallback-inner">
        <div class="gf-detail-title">${title}</div>
        <div class="gf-detail-meta">by ${author}</div>
        <div class="gf-detail-meta">${votes} vote${votes === 1 ? '' : 's'}</div>
        <div class="gf-detail-desc">${desc}</div>
      </div>
    `;
    const bgStyle = creation.bgColor ? `background:${creation.bgColor};` : '';
    if (!hasVisual) {
      return `<div class="${fallbackClass} gf-detail-fallback" style="${bgStyle}">${detailMarkup}</div>`;
    }

    return `
      <img
        data-creation-image-target
        data-creation-id="${creation.id}"
        src="${creation.image || ''}"
        alt="${creation.title || creation.name || 'Creation'}"
        style="display:${creation.image ? 'block' : 'none'};${bgStyle}"
      >
      <div class="${fallbackClass} gf-detail-fallback" data-image-fallback style="display:${creation.image ? 'none' : 'flex'};">${detailMarkup}</div>
    `;
  }

  function hydrateCreationImages(container, creations) {
    if (!container || !window.ESHU_MEDIA?.hydrateCreationImages) return;
    window.ESHU_MEDIA.hydrateCreationImages(container, creations);
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

  // ===== Initialize =====
  function init() {
    // Get DOM elements
    pageContainer = document.getElementById('pageContainer');
    gamesListWrapper = document.getElementById('gamesListWrapper');
    gameImagePanel = document.getElementById('gameImagePanel');
    emptyState = document.getElementById('emptyState');
    gamePreviewPanel = document.getElementById('gamePreviewPanel');
    gameEditPanel = document.getElementById('gameEditPanel');
    gamesList = document.getElementById('gamesList');
    searchBox = document.getElementById('searchBox');
    groupFilter = document.getElementById('groupFilter');
    scopeFilter = document.getElementById('scopeFilter');
    gamesContextTag = document.getElementById('gamesContextTag');
    loadingOverlay = document.getElementById('loadingOverlay');
    
    backBtn = document.getElementById('backBtn');
    imagePanelTitle = document.getElementById('imagePanelTitle');
    gameImageLarge = document.getElementById('gameImageLarge');
    
    previewTitle = document.getElementById('previewTitle');
    previewImage = document.getElementById('previewImage');
    previewLikeBtn = document.getElementById('previewLikeBtn');
    previewFollowBtn = document.getElementById('previewFollowBtn');
    previewSettingsBtn = document.getElementById('previewSettingsBtn');
    previewPrivacyBadge = document.getElementById('previewPrivacyBadge');
    previewModeBadge = document.getElementById('previewModeBadge');
    
    detailTitle = document.getElementById('detailTitle');
    detailGroup = document.getElementById('detailGroup');
    detailOwner = document.getElementById('detailOwner');
    detailTime = document.getElementById('detailTime');
    detailVotesAvailable = document.getElementById('detailVotesAvailable');
    previewPlayBtn = document.getElementById('previewPlayBtn');
    previewImageHint = document.getElementById('previewImageHint');
    
    editTitle = document.getElementById('editTitle');
    editDescription = document.getElementById('editDescription');
    editRules = document.getElementById('editRules');
    editTags = document.getElementById('editTags');
    
    editPanelTitle = document.getElementById('editPanelTitle');
    cancelBtn = document.getElementById('cancelBtn');
    saveBtn = document.getElementById('saveBtn');
    groupDropdown = document.getElementById('groupDropdown');
    groupDropdownTrigger = document.getElementById('groupDropdownTrigger');
    groupDropdownValue = document.getElementById('groupDropdownValue');
    groupDropdownMenu = document.getElementById('groupDropdownMenu');
    groupDropdownList = document.getElementById('groupDropdownList');
    groupSearchInput = document.getElementById('groupSearchInput');
    imageUploadInput = document.getElementById('imageUploadInput');

    applyHostGroupLockUi();

    // Initialize data
    initializeData();

    // Initialize nav profile identity
    initNavProfile();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup state subscriptions
    setupStateSubscriptions();
    
    // Initial render
    populateGroupFilter();
    renderGamesList();
    
    // XP Counter
    const xpCounter = document.getElementById('xpCounter');
    if (xpCounter) {
      const xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
      xpCounter.textContent = xpPoints + ' XP';
    }
  }

  function initializeData() {
    try {
      ESHU_DB.ensure();
      STATE.batch(() => {
        STATE.set('games', ESHU_DB.getTable('games') || []);
        STATE.set('groups', ESHU_DB.getTable('groups') || []);
        STATE.set('creations', ESHU_DB.getTable('creations') || []);
        STATE.set('xpPoints', ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0);
      });
      TOAST.success('Games loaded!');
    } catch (err) {
      console.error('Init error:', err);
      STATE.set('games', []);
      STATE.set('groups', []);
    }
  }

  function rehydrateFromStorage() {
    try {
      STATE.batch(() => {
        STATE.set('games', ESHU_DB.getTable('games') || []);
        STATE.set('groups', ESHU_DB.getTable('groups') || []);
        STATE.set('creations', ESHU_DB.getTable('creations') || []);
        STATE.set('xpPoints', ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0);
      });
      populateGroupFilter();
      renderGamesList();
      initNavProfile();
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

  function setupStateSubscriptions() {
    STATE.subscribe('games', () => {
      const expandedCard = gamesList ? gamesList.querySelector('.u-card.expanded') : null;
      const expandedId = expandedCard ? expandedCard.dataset.id : null;
      renderGamesList();
      if (expandedId && gamesList) {
        var el = gamesList.querySelector('.u-card[data-id="' + expandedId + '"]');
        if (el) el.classList.add('expanded');
      }
      saveToStorage();
      if (playModal && playModal.classList.contains('active')) {
        renderPlayGameList();
      }
      // Update preview if a game is selected
      if (selectedGameId && !isEditMode) {
        const game = getGameById(selectedGameId);
        if (game) {
          showGamePreview(game);
        }
      }
      const modal = document.getElementById('gameFrontModal');
      const modalGameId = modal ? modal.dataset.gameId : null;
      if (modalGameId) {
        const modalGame = getGameById(modalGameId);
        if (modalGame) updateChamferVotesAvailable(modalGame);
      }
    });

    STATE.subscribe('groups', () => {
      populateGroupFilter();
      saveToStorage();
    });

    STATE.subscribe('creations', () => {
      saveToStorage();
      if (playModal && playModal.classList.contains('active')) {
        renderPlayGameList();
      }
      const modal = document.getElementById('gameFrontModal');
      const modalGameId = modal ? modal.dataset.gameId : null;
      if (modalGameId) {
        const modalGame = getGameById(modalGameId);
        if (modalGame) updateChamferVotesAvailable(modalGame);
      }
    });
  }

  // ===== Timing Display Helpers =====
  function formatTimestamp(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatCountdown(ms) {
    if (ms <= 0) return 'now';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // Countdown used by the live chamfer ticker. Only surfaces seconds in the
  // final minute so the display stays stable during normal play.
  function formatCountdownWithSeconds(ms) {
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

  function getGameTimingStatus(game) {
    if (!game) return { label: '', cssClass: '' };
    const now = Date.now();
    const isInfinite = !game.endTime;
    const isFinished = !isInfinite && now >= game.endTime;
    const isStarted = game.startTime ? now >= game.startTime : true;
    const subsClosed = game.submissionCloseTime ? now >= game.submissionCloseTime : false;

    if (isFinished) return { label: 'Finished', cssClass: 'finished' };
    if (!isStarted) return { label: `Starts in ${formatCountdown(game.startTime - now)}`, cssClass: 'starting' };
    if (subsClosed) return { label: `Subs closed · ${formatCountdown(game.endTime - now)} left`, cssClass: 'subs-closed' };
    if (!isInfinite) {
      const endLeft = `${formatCountdown(game.endTime - now)} left`;
      if (game.submissionCloseTime && now < game.submissionCloseTime) {
        return { label: `Subs close in ${formatCountdown(game.submissionCloseTime - now)} · ${endLeft}`, cssClass: 'running' };
      }
      return { label: endLeft, cssClass: 'running' };
    }
    return { label: 'Infinite', cssClass: 'infinite' };
  }

  function buildTimingScheduleHtml(game) {
    if (!game) return '';
    const isInfinite = !game.endTime;
    if (isInfinite) return '<div class="gf-timing-row"><span class="gf-timing-label">Mode</span><span class="gf-timing-value">Infinite — no deadline</span></div>';

    const now = Date.now();
    const rows = [];

    const startClass = game.startTime && now >= game.startTime ? 'passed' : 'pending';
    rows.push(`<div class="gf-timing-row"><span class="gf-timing-label">Starts</span><span class="gf-timing-value ${startClass}">${formatTimestamp(game.startTime)}</span></div>`);

    if (game.submissionCloseTime) {
      const subClass = now >= game.submissionCloseTime ? 'passed' : 'pending';
      rows.push(`<div class="gf-timing-row"><span class="gf-timing-label">Subs Close</span><span class="gf-timing-value ${subClass}">${formatTimestamp(game.submissionCloseTime)}</span></div>`);
    }

    const endClass = now >= game.endTime ? 'passed' : 'pending';
    rows.push(`<div class="gf-timing-row"><span class="gf-timing-label">Ends</span><span class="gf-timing-value ${endClass}">${formatTimestamp(game.endTime)}</span></div>`);

    return rows.join('');
  }

  function timingOffsetToMs(offset) {
    return (
      (offset.weeks * 7 * 24 * 60 * 60 * 1000) +
      (offset.days * 24 * 60 * 60 * 1000) +
      (offset.hours * 60 * 60 * 1000) +
      (offset.mins * 60 * 1000)
    );
  }

  function msToOffset(ms) {
    let remaining = Math.max(0, ms || 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    const hourMs = 60 * 60 * 1000;
    const minMs = 60 * 1000;

    const weeks = Math.floor(remaining / weekMs);
    remaining -= weeks * weekMs;
    const days = Math.floor(remaining / dayMs);
    remaining -= days * dayMs;
    const hours = Math.floor(remaining / hourMs);
    remaining -= hours * hourMs;
    const mins = Math.floor(remaining / minMs);

    return { weeks, days, hours, mins };
  }

  // Format an ms timestamp for the <input type="datetime-local"> value
  // attribute ("YYYY-MM-DDTHH:mm" in the user's local timezone).
  function tsToDatetimeLocalValue(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setTimingWheelsFromState() {
    document.querySelectorAll('.timing-wheel-value').forEach((wheel) => {
      const timingKey = wheel.dataset.timing;
      const unit = wheel.dataset.unit;
      const bucket = timingState[timingKey];
      if (bucket && typeof bucket[unit] === 'number') {
        const v = String(bucket[unit]);
        if ('value' in wheel) wheel.value = v;
        else wheel.textContent = v;
      }
    });
    const startInput = document.getElementById('startDatetime');
    if (startInput) {
      const v = tsToDatetimeLocalValue(timingState.startAt || Date.now());
      if (v) startInput.value = v;
      // No `max` cap: start may be any moment, past or future.
      startInput.removeAttribute('max');
    }
  }

  // Compute absolute times from the current timing state. The `nowTs`
  // argument is preserved for callers that want to use a single "now" for
  // both validation and serialization.
  function buildTimesFromNow(nowTs) {
    const startTime = timingState.startAt || nowTs;
    const submissionCloseTime = startTime + timingOffsetToMs(timingState.submission);
    const endTime = startTime + timingOffsetToMs(timingState.duration);
    return { startTime, submissionCloseTime, endTime };
  }

  function saveToStorage() {
    try {
      ESHU_DB.setTable('games', STATE.get('games'));
      ESHU_DB.setTable('groups', STATE.get('groups'));
      ESHU_DB.setTable('creations', STATE.get('creations'));
      ESHU_DB.setProfileXp(ESHU_DB.getActiveProfileId(), STATE.get('xpPoints'));
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  function setupEventListeners() {
    // Back button (exit edit mode)
    if (backBtn) {
      backBtn.addEventListener('click', () => exitEditMode(true));
    }

    // Top-nav "UPLOAD CREATION" button: when a game-front modal is open, carry
    // its gameId so the creations form pre-selects that game. Otherwise leave
    // it alone so the user picks a game manually.
    const topNavUploadBtn = document.querySelector('.top-nav .upload-btn');
    if (topNavUploadBtn) {
      topNavUploadBtn.addEventListener('click', (e) => {
        const modal = document.getElementById('gameFrontModal');
        if (!modal || !modal.classList.contains('active')) return; // fall through to default href
        const gameId = modal.dataset.gameId;
        if (!gameId) return;
        e.preventDefault();
        const sourceGroupId = modal.dataset.sourceGroupId || '';
        const sourceGroupPart = sourceGroupId
          ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
          : '';
        window.location.href = `creations.html?gameId=${encodeURIComponent(gameId)}&action=upload${sourceGroupPart}`;
      });
    }

    if (previewLikeBtn) {
      previewLikeBtn.addEventListener('click', () => {
        if (!selectedGameId) return;
        window.toggleGameLike(selectedGameId, previewLikeBtn);
        const game = getGameById(selectedGameId);
        if (game) showGamePreview(game);
      });
    }

    if (previewFollowBtn) {
      previewFollowBtn.addEventListener('click', () => {
        if (!selectedGameId) return;
        window.toggleGameFollow(selectedGameId, previewFollowBtn);
        const game = getGameById(selectedGameId);
        if (game) showGamePreview(game);
      });
    }

    if (previewSettingsBtn) {
      previewSettingsBtn.addEventListener('click', () => {
        if (!selectedGameId) return;
        enterEditMode();
      });
    }

    // Preview image click - enter edit mode
    if (previewImage) {
      previewImage.addEventListener('click', enterEditMode);
    }

    // Cancel button
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => exitEditMode(true));
    }

    // Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', saveChanges);
    }

    // Search and filter
    if (searchBox) {
      searchBox.addEventListener('input', renderGamesList);
    }
    if (scopeFilter) {
      scopeFilter.addEventListener('change', () => {
        // Update search placeholder based on filter type
        if (searchBox) {
          if (scopeFilter.value === 'byGroup') {
            searchBox.placeholder = 'Search Groups...';
          } else {
            searchBox.placeholder = 'Search games...';
          }
        }
        renderGamesList();
      });
    }

    // Timing wheel controls
    attachTimingWheelListeners();

    // Image upload - click on large image in edit mode
    if (gameImageLarge) {
      gameImageLarge.addEventListener('click', () => {
        if (isEditMode && imageUploadInput && !diamondEditorState && !gameImageLarge.classList.contains('is-editing')) {
          imageUploadInput.click();
        }
      });
    }

    // Image file selected
    if (imageUploadInput) {
      imageUploadInput.addEventListener('change', handleImageUpload);
    }

    // Group dropdown trigger
    if (groupDropdownTrigger) {
      groupDropdownTrigger.addEventListener('click', toggleGroupDropdown);
    }

    // Group search input
    if (groupSearchInput) {
      groupSearchInput.addEventListener('input', filterGroups);
      // Prevent dropdown from closing when clicking search
      groupSearchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (groupDropdown && !groupDropdown.contains(e.target)) {
        closeGroupDropdown();
      }
    });

    // Timing mode toggle (Infinite / Deadline)
    document.querySelectorAll('input[name="timingMode"]').forEach(radio => {
      radio.addEventListener('change', handleTimingModeChange);
    });

    // Game mode toggle (Arena / Book)
    document.querySelectorAll('input[name="gameType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        gameModeState = e.target.value;
        // Live-update game if editing an existing one
        if (isEditMode && selectedGameId) {
          const games = STATE.get('games') || [];
          const game = games.find(g => g.id === selectedGameId);
          if (game) {
            game.gameType = gameModeState;
            STATE.set('games', games);
            saveToStorage();
            updateChamferVotesAvailable(game);
          }
        }
      });
    });

    if (!gamesGlobalListenersBound) {
      gamesGlobalListenersBound = true;

      window.addEventListener('eshu:remote-activated', rehydrateFromStorage);
      window.addEventListener('eshu:sync-success', rehydrateFromStorage);
      window.addEventListener('eshu:auth-logout', () => {
        try { window.location.replace('play.html'); } catch { window.location.href = 'play.html'; }
      });

      // Listen for infinite votes toggle changes
      window.addEventListener('eshu:infinite-votes-changed', () => {
        // Refresh vote display in game front modal if open
        const modal = document.getElementById('gameFrontModal');
        if (modal && modal.classList.contains('active')) {
          const modalGameId = modal.dataset.gameId;
          if (modalGameId) {
            const modalGame = getGameById(modalGameId);
            if (modalGame) updateChamferVotesAvailable(modalGame);
          }
        }
      });

      // Listen for comments updated from anywhere (eshu page, etc)
      window.addEventListener('eshu:comments-updated', (e) => {
        const modal = document.getElementById('gameFrontModal');
        if (!modal || !modal.classList.contains('active')) return;
        
        const modalGameId = modal.dataset.gameId;
        if (!modalGameId || !e.detail?.target) return;
        
        // Don't re-render for like/follow updates - they update UI directly
        const reason = e?.detail?.reason;
        if (reason === 'like' || reason === 'follow') return;
        
        const modalGame = getGameById(modalGameId);
        if (!modalGame) return;
        
        // Refresh if the comment update is for this game directly
        if (e.detail.target.kind === 'game' && e.detail.target.id === modalGameId) {
          scheduleGameCommentsRefresh(modalGame);
          return;
        }
        
        // Also refresh if a creation comment was updated for a creation in this game
        if (e.detail.target.kind === 'creation') {
          const gameCreations = (ESHU_DB.getTable('creations') || [])
            .filter(c => c && c.hostGameId === modalGameId);
          const creationIds = gameCreations.map(c => c.id);
          if (creationIds.includes(e.detail.target.id)) {
            scheduleGameCommentsRefresh(modalGame);
          }
        }
      });
    }
  }

  function initPlayModal() {
    const playGameBtn = document.getElementById('playGameBtn');
    playModal = document.getElementById('playGameModal');
    playModalClose = document.getElementById('playModalClose');
    playCancelBtn = document.getElementById('playCancelBtn');
    playGameList = document.getElementById('playGameList');
    playGameSearch = document.getElementById('playGameSearch');
    playGameVotesFilter = document.getElementById('playGameVotesFilter');

    if (playGameBtn) playGameBtn.addEventListener('click', openPlayModal);
    if (playModalClose) playModalClose.addEventListener('click', closePlayModal);
    if (playCancelBtn) playCancelBtn.addEventListener('click', closePlayModal);
    if (playGameSearch) playGameSearch.addEventListener('input', renderPlayGameList);
    if (playGameVotesFilter) playGameVotesFilter.addEventListener('change', renderPlayGameList);
    if (playModal) {
      playModal.addEventListener('click', (event) => {
        if (event.target === playModal) closePlayModal();
      });
    }
  }

  function openPlayModal() {
    if (!playModal) return;
    if (playGameSearch) playGameSearch.value = '';
    if (playGameVotesFilter) playGameVotesFilter.value = 'all';
    renderPlayGameList();
    playModal.classList.add('active');
    if (playGameSearch) playGameSearch.focus();
  }

  function closePlayModal() {
    if (!playModal) return;
    playModal.classList.remove('active');
  }

  function renderPlayGameList() {
    if (!playGameList) return;

    const games = STATE.get('games') || [];
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    const query = (playGameSearch?.value || '').trim().toLowerCase();
    const votesFilter = (playGameVotesFilter?.value || 'all').toLowerCase();

    let visibleGames = games.filter(game => {
      const active = game && game.status !== 'deleted' && game.status !== 'burned';
      return active && canAccessGame(game, activeProfileId, groups);
    });

    if (votesFilter === 'votes_available') {
      visibleGames = visibleGames.filter((game) => {
        const remainingVotes = getRemainingVotesForProfile(game);
        return remainingVotes === Infinity || remainingVotes > 0;
      });
    }

    if (query) {
      visibleGames = visibleGames.filter(game => {
        const name = (game.name || '').toLowerCase();
        const description = (game.description || '').toLowerCase();
        const hostGroupName = (getGroupById(game.hostGroupId)?.name || '').toLowerCase();
        return name.includes(query) || description.includes(query) || hostGroupName.includes(query);
      });
    }

    if (visibleGames.length === 0) {
      playGameList.innerHTML = query
        ? '<div style="padding:20px;text-align:center;color:#888;">No games match your search.</div>'
        : '<div style="padding:20px;text-align:center;color:#888;">No games available to play.</div>';
      return;
    }

    playGameList.innerHTML = visibleGames.map(game => {
      const group = getGroupById(game.hostGroupId);
      const groupName = group?.name || 'No Group';
      const modeLabel = game.gameType === 'book' ? 'Book' : 'Arena';
      const availableVotes = getRemainingVotesForProfile(game);
      return `
        <div class="group-list-item" data-game-id="${game.id}">
          <div class="group-icon"></div>
          <div class="play-game-item-main">
            <div class="play-game-item-title">${escapeCommentHtml(game.name || 'Untitled Game')}</div>
            <div class="play-game-item-meta">${escapeCommentHtml(groupName)} · ${modeLabel}</div>
          </div>
          <span class="play-game-item-votes">Votes <span class="play-game-item-votes-value">${availableVotes === Infinity ? '∞' : availableVotes}</span></span>
          <button type="button" class="play-game-item-action">Play</button>
        </div>
      `;
    }).join('');

    playGameList.querySelectorAll('.group-list-item').forEach((item) => {
      const goToGame = () => {
        const gameId = item.dataset.gameId;
        if (!gameId) return;
        closePlayModal();
        runHype('RIGHT ON!', () => {
          openGameFrontModal(gameId);
        });
      };

      item.addEventListener('click', goToGame);
      const playAction = item.querySelector('.play-game-item-action');
      if (playAction) {
        playAction.addEventListener('click', (event) => {
          event.stopPropagation();
          goToGame();
        });
      }
    });
  }

  // Caps per the new model: weeks up to 99, plus the natural overflow points
  // for days/hours/mins so the four wheels read like a stable duration.
  // Each wheel is an <input> so the user can: (a) scroll with the mousewheel,
  // (b) click and type a value directly, (c) use Up/Down keys.
  function attachTimingWheelListeners() {
    const maxValues = { weeks: 99, days: 6, hours: 23, mins: 59 };
    const clamp = (unit, n) => Math.max(0, Math.min(maxValues[unit], Math.floor(n || 0)));

    document.querySelectorAll('.timing-wheel-value').forEach((wheel) => {
      const timingKey = wheel.dataset.timing;
      const unit = wheel.dataset.unit;
      const isInput = 'value' in wheel;

      const writeValue = (v) => {
        if (!timingState[timingKey]) return;
        timingState[timingKey][unit] = v;
        if (isInput) wheel.value = String(v);
        else wheel.textContent = String(v);
        updateTimingPreview();
      };

      // Mousewheel: +/- 1 per notch. Direction matches macOS "natural" feel.
      wheel.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (!timingState[timingKey]) return;
        const current = timingState[timingKey][unit] || 0;
        const delta = e.deltaY < 0 ? 1 : -1;
        writeValue(clamp(unit, current + delta));
      }, { passive: false });

      if (isInput) {
        // Click selects all so typing replaces the value immediately.
        wheel.addEventListener('focus', () => {
          try { wheel.select(); } catch {}
        });
        // Live edit: accept digits only; preserve caret position best-effort.
        wheel.addEventListener('input', () => {
          const sanitized = (wheel.value || '').replace(/[^0-9]/g, '').slice(0, 2);
          if (sanitized !== wheel.value) wheel.value = sanitized;
          if (!timingState[timingKey]) return;
          const parsed = sanitized === '' ? 0 : parseInt(sanitized, 10);
          timingState[timingKey][unit] = clamp(unit, parsed);
          updateTimingPreview();
        });
        // Normalize on blur (empty -> 0, over-cap -> cap, leading zeros gone).
        wheel.addEventListener('blur', () => {
          const v = clamp(unit, parseInt(wheel.value || '0', 10));
          writeValue(v);
        });
        wheel.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); writeValue(clamp(unit, (timingState[timingKey]?.[unit] || 0) + 1)); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); writeValue(clamp(unit, (timingState[timingKey]?.[unit] || 0) - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); wheel.blur(); }
        });
      } else {
        // Legacy <div> fallback: tap to increment.
        wheel.addEventListener('click', () => {
          if (!timingState[timingKey]) return;
          const current = timingState[timingKey][unit] || 0;
          writeValue((current + 1) > maxValues[unit] ? 0 : (current + 1));
        });
      }
    });

    // START datetime input (absolute moment; may be in the past or future).
    const startInput = document.getElementById('startDatetime');
    if (startInput) {
      startInput.addEventListener('change', () => {
        if (!startInput.value) return;
        const parsed = new Date(startInput.value).getTime();
        if (!Number.isFinite(parsed)) return;
        // Start may be in the past OR future; no clamping.
        timingState.startAt = parsed;
        setTimingWheelsFromState();
        updateTimingPreview();
      });
    }
    const nowBtn = document.getElementById('startNowBtn');
    if (nowBtn) {
      nowBtn.addEventListener('click', () => {
        timingState.startAt = Date.now();
        setTimingWheelsFromState();
        updateTimingPreview();
      });
    }
  }

  // ===== Timing Mode =====
  function handleTimingModeChange(e) {
    const mode = e.target.value;
    timingState.mode = mode;
    
    const durationPicker = document.getElementById('durationPicker');
    const infiniteMessage = document.getElementById('infiniteMessage');
    
    if (mode === 'infinite') {
      if (durationPicker) durationPicker.style.display = 'none';
      if (infiniteMessage) infiniteMessage.style.display = 'block';
    } else {
      if (durationPicker) durationPicker.style.display = 'block';
      if (infiniteMessage) infiniteMessage.style.display = 'none';
      updateTimingPreview();
    }
  }

  function setTimingMode(mode) {
    timingState.mode = mode;
    const radio = document.querySelector(`input[name="timingMode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    
    const durationPicker = document.getElementById('durationPicker');
    const infiniteMessage = document.getElementById('infiniteMessage');
    
    if (mode === 'infinite') {
      if (durationPicker) durationPicker.style.display = 'none';
      if (infiniteMessage) infiniteMessage.style.display = 'block';
    } else {
      if (durationPicker) durationPicker.style.display = 'block';
      if (infiniteMessage) infiniteMessage.style.display = 'none';
    }
  }

  // ===== Image Upload =====
  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      TOAST.error('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      startDiamondImageEditor(event.target.result);
    };
    reader.readAsDataURL(file);
  }

  function startDiamondImageEditor(dataUrl) {
    endDiamondImageEditor();
    if (!gameImageLarge) return;

    const game = selectedGameId ? getGameById(selectedGameId) : null;
    const previousDisplayImage = pendingImageData || game?.image || null;
    const previousPendingImage = pendingImageData;

    gameImageLarge.classList.add('is-editing');
    gameImageLarge.innerHTML = `
      <div class="diamond-image-frame diamond-image-editor">
        <div class="diamond-editor-wrap">
          <img class="diamond-editor-img" src="${String(dataUrl).replace(/"/g, '&quot;')}" draggable="false" alt="" />
        </div>
        <svg class="diamond-image-overlay" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="#000" stroke-linejoin="miter" stroke-linecap="butt">
            <polyline points="215,470 512,174 809,470" stroke-width="78" />
            <polygon points="512,312 790,590 512,868 234,590" stroke-width="44" />
          </g>
        </svg>
      </div>
    `;

    let controls = gameImageLarge.parentElement?.querySelector('.diamond-editor-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'diamond-editor-controls';
      gameImageLarge.insertAdjacentElement('afterend', controls);
    }

    controls.innerHTML = `
      <label class="diamond-editor-zoom-label">
        <span>Zoom</span>
        <input type="range" class="diamond-editor-zoom" min="0.5" max="4" step="0.01" value="1" />
      </label>
      <div class="diamond-editor-actions">
        <button type="button" class="diamond-editor-btn diamond-editor-cancel">Cancel</button>
        <button type="button" class="diamond-editor-btn diamond-editor-apply">Apply</button>
      </div>
    `;
    controls.style.display = 'flex';

    const wrap = gameImageLarge.querySelector('.diamond-editor-wrap');
    const img = gameImageLarge.querySelector('.diamond-editor-img');
    const zoomSlider = controls.querySelector('.diamond-editor-zoom');
    const applyBtn = controls.querySelector('.diamond-editor-apply');
    const cancelBtn = controls.querySelector('.diamond-editor-cancel');

    const state = {
      scale: 1, tx: 0, ty: 0,
      natural: { w: 0, h: 0 },
      wrap: { w: 0, h: 0 },
      baseScale: 1,
      prevDisplayImage: previousDisplayImage,
      prevPendingImage: previousPendingImage
    };

    diamondEditorState = { controls };

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
      state.baseScale = Math.max(state.wrap.w / state.natural.w, state.wrap.h / state.natural.h);
      state.scale = 1;
      state.tx = 0;
      state.ty = 0;
      zoomSlider.value = '1';
      updateTransform();
    }

    if (img.complete && img.naturalWidth) initializeOnImgReady();
    else img.addEventListener('load', initializeOnImgReady, { once: true });

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startTx = 0;
    let startTy = 0;

    function onDown(ev) {
      dragging = true;
      const p = ev.touches?.[0] || ev;
      startX = p.clientX;
      startY = p.clientY;
      startTx = state.tx;
      startTy = state.ty;
      ev.preventDefault();
    }

    function onMove(ev) {
      if (!dragging) return;
      const p = ev.touches?.[0] || ev;
      state.tx = startTx + (p.clientX - startX);
      state.ty = startTy + (p.clientY - startY);
      updateTransform();
      ev.preventDefault();
    }

    function onUp() {
      dragging = false;
    }

    wrap.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    wrap.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    zoomSlider.addEventListener('input', () => {
      state.scale = parseFloat(zoomSlider.value);
      updateTransform();
    });

    function onWheel(ev) {
      ev.preventDefault();
      const delta = -ev.deltaY * 0.0015;
      state.scale = Math.max(0.5, Math.min(4, state.scale + delta));
      zoomSlider.value = String(state.scale);
      updateTransform();
    }

    wrap.addEventListener('wheel', onWheel, { passive: false });

    applyBtn.addEventListener('click', () => {
      const baked = bakeDiamondCrop(img, state);
      pendingImageData = baked;
      endDiamondImageEditor();
      renderGameImageLarge(baked);
      if (imageUploadInput) imageUploadInput.value = '';
      TOAST.success('Image updated!');
    });

    cancelBtn.addEventListener('click', () => {
      pendingImageData = state.prevPendingImage;
      endDiamondImageEditor();
      renderGameImageLarge(state.prevDisplayImage);
      if (imageUploadInput) imageUploadInput.value = '';
    });

    diamondEditorState.cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }

  function endDiamondImageEditor() {
    if (diamondEditorState) {
      try { diamondEditorState.cleanup && diamondEditorState.cleanup(); } catch {}
      diamondEditorState.controls?.remove();
      diamondEditorState = null;
    }
    if (gameImageLarge) {
      gameImageLarge.classList.remove('is-editing');
    }
  }

  function bakeDiamondCrop(img, state) {
    const CW = 1112;
    const CH = 1112;
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
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

  // ===== Group Dropdown =====
  function toggleGroupDropdown() {
    if (groupDropdownMenu.classList.contains('open')) {
      closeGroupDropdown();
    } else {
      openGroupDropdown();
    }
  }

  function openGroupDropdown() {
    if (hostGroupLockedForEdit) return;
    groupDropdownTrigger.classList.add('open');
    groupDropdownMenu.classList.add('open');
    if (groupSearchInput) {
      groupSearchInput.value = '';
      groupSearchInput.focus();
    }
    renderGroupList();
  }

  function closeGroupDropdown() {
    if (groupDropdownTrigger) groupDropdownTrigger.classList.remove('open');
    if (groupDropdownMenu) groupDropdownMenu.classList.remove('open');
  }

  function filterGroups() {
    if (hostGroupLockedForEdit) return;
    renderGroupList(groupSearchInput ? groupSearchInput.value : '');
  }

  function renderGroupList(searchQuery = '') {
    if (!groupDropdownList) return;
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    const query = searchQuery.toLowerCase();

    let filtered = groups.filter(g => isGroupMember(g, activeProfileId));
    if (query) {
      filtered = filtered.filter(g => g.name.toLowerCase().includes(query));
    }
    
    if (filtered.length === 0) {
      groupDropdownList.innerHTML = '<div class="group-dropdown-empty">No groups found</div>';
      return;
    }

    groupDropdownList.innerHTML = filtered.map(g => `
      <div class="group-dropdown-item ${g.id === selectedGroupId ? 'selected' : ''}" data-id="${g.id}" data-name="${g.name}">
        <div class="group-dropdown-icon"></div>
        <div class="group-dropdown-name">${g.name}</div>
        <div class="group-dropdown-check">✓</div>
      </div>
    `).join('');

    // Add click handlers
    groupDropdownList.querySelectorAll('.group-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectGroup(item.dataset.id, item.dataset.name);
      });
    });
  }

  function selectGroup(groupId, groupName) {
    if (hostGroupLockedForEdit) {
      TOAST.error('Host group cannot be changed after game creation.');
      return;
    }
    selectedGroupId = groupId;
    
    // Update trigger display
    if (groupDropdownValue) {
      groupDropdownValue.textContent = groupName;
      groupDropdownValue.classList.remove('placeholder');
    }
    
    // Update selected state in list
    if (groupDropdownList) {
      groupDropdownList.querySelectorAll('.group-dropdown-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.id === groupId);
      });
    }
    
    closeGroupDropdown();
  }

  function setGroupDropdownValue(groupId, groupName) {
    selectedGroupId = groupId;
    if (groupDropdownValue) {
      if (groupName) {
        groupDropdownValue.textContent = groupName;
        groupDropdownValue.classList.remove('placeholder');
      } else {
        groupDropdownValue.textContent = 'Select a group...';
        groupDropdownValue.classList.add('placeholder');
      }
    }
  }

  // ===== Helpers =====
  function getGameById(id) {
    const games = STATE.get('games') || [];
    return games.find(g => g.id === id);
  }

  function getGroupById(id) {
    if (!id) return null;
    const groups = STATE.get('groups') || [];
    return groups.find(g => g.id === id) || null;
  }

  function applySourceGroupContext() {
    const group = getGroupById(sourceGroupContextId);
    if (groupFilter && group) {
      groupFilter.value = group.id;
    }
    if (gamesContextTag) {
      if (group) {
        gamesContextTag.style.display = 'inline-flex';
        gamesContextTag.textContent = `from ${group.name || 'Group'}`;
        gamesContextTag.style.cursor = 'pointer';
        gamesContextTag.title = 'Back to Group Front';
        gamesContextTag.onclick = () => {
          window.location.href = `group-front.html?groupId=${encodeURIComponent(group.id)}`;
        };
      } else {
        gamesContextTag.style.display = 'none';
        gamesContextTag.textContent = '';
        gamesContextTag.style.cursor = '';
        gamesContextTag.title = '';
        gamesContextTag.onclick = null;
      }
    }
  }

  function showLoading() { 
    if (loadingOverlay) loadingOverlay.classList.add('active'); 
  }
  
  function hideLoading() { 
    if (loadingOverlay) loadingOverlay.classList.remove('active'); 
  }

  // ===== Populate Filters =====
  function populateGroupFilter() {
    if (!groupFilter) return;
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    const previousValue = groupFilter.value;
    groupFilter.innerHTML = '<option value="">All Groups</option>';
    groups
      .filter(g => isGroupMember(g, activeProfileId))
      .forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      groupFilter.appendChild(opt);
      });

    if (sourceGroupContextId && groups.some(g => g.id === sourceGroupContextId)) {
      groupFilter.value = sourceGroupContextId;
    } else if (previousValue && groups.some(g => g.id === previousValue)) {
      groupFilter.value = previousValue;
    }
  }

  // ===== Render Games List =====
  function renderGamesList() {
    if (!gamesList) return;
    
    const games = STATE.get('games') || [];
    const groups = STATE.get('groups') || [];
    const creations = STATE.get('creations') || [];
    const activeProfileId = getActiveProfileId();
    const searchQuery = searchBox ? searchBox.value.toLowerCase() : '';
    const now = Date.now();

    let filtered;
    const scope = scopeFilter ? scopeFilter.value : 'mine';

    if (scope === 'all') {
      // All Games: every active game in the database (public, or private if accessible)
      filtered = games.filter(g => {
        if (!g || typeof g !== 'object') return false;
        if (!ESHU_DB.isEntityActive(g)) return false;
        if (g.privacy !== 'private') return true;
        return canAccessGame(g, activeProfileId, groups);
      });
    } else if (scope === 'byGroup') {
      // By Group: filter games by group name
      filtered = games.filter(g => {
        if (!g || typeof g !== 'object') return false;
        if (!ESHU_DB.isEntityActive(g)) return false;
        return canAccessGame(g, activeProfileId, groups);
      });
      
      // If search query provided, filter by group name match
      if (searchQuery) {
        const matchingGroupIds = new Set();
        groups.forEach(gr => {
          if (gr && gr.name && gr.name.toLowerCase().includes(searchQuery)) {
            matchingGroupIds.add(gr.id);
          }
        });
        filtered = filtered.filter(g => {
          // Match by game's hostGroupId or game's name containing the query
          const gameNameMatch = (g.name || '').toLowerCase().includes(searchQuery);
          const gameGroupMatch = g.hostGroupId && matchingGroupIds.has(g.hostGroupId);
          return gameNameMatch || gameGroupMatch;
        });
      }
    } else if (scope === 'public') {
      // Your Public Games: games you own or are member of that are public
      filtered = games.filter(g => {
        if (!g || typeof g !== 'object') return false;
        if (g.privacy === 'private') return false;
        const canManage = !g.ownerProfileId || g.ownerProfileId === activeProfileId;
        if (canManage) return true;
        if (!ESHU_DB.isEntityActive(g)) return false;
        return getGameMembers(g).includes(activeProfileId);
      });
    } else if (scope === 'private') {
      // Your Private Games: games you own or are member of that are private
      filtered = games.filter(g => {
        if (!g || typeof g !== 'object') return false;
        if (g.privacy !== 'private') return false;
        const canManage = !g.ownerProfileId || g.ownerProfileId === activeProfileId;
        if (canManage) return true;
        if (!ESHU_DB.isEntityActive(g)) return false;
        return getGameMembers(g).includes(activeProfileId);
      });
    } else {
      // Your Games: any game the active profile owns OR is a member of.
      // - Owner branch keeps deleted/burned visible so restore/delete actions
      //   stay available to the owner.
      // - Member branch shows only active games (members shouldn't see other
      //   owners' tombstones). This is what surfaces game_default after the
      //   player joins group_default — its ownerProfileId is null and the
      //   profile is attached via memberProfileIds.
      filtered = games.filter(g => {
        if (!g || typeof g !== 'object') return false;
        const canManage = !g.ownerProfileId || g.ownerProfileId === activeProfileId;
        if (canManage) return true;
        if (!ESHU_DB.isEntityActive(g)) return false;
        return getGameMembers(g).includes(activeProfileId);
      });
    }

    if (scope !== 'byGroup' && searchQuery) {
      filtered = filtered.filter(g => {
        if (!g || typeof g !== 'object') return false;
        const name = (g.name || '').toLowerCase();
        const description = (g.description || '').toLowerCase();
        return name.includes(searchQuery) || description.includes(searchQuery);
      });
    }

    filtered = filtered.filter(game => !!game && typeof game === 'object');

    const countLabel = document.getElementById('gamesCountLabel');
    if (countLabel) countLabel.textContent = `${filtered.length} game${filtered.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      if (scope === 'byGroup' && !searchQuery) {
        gamesList.innerHTML = '<div class="u-card-empty">Type a group name to filter games by group.</div>';
      } else if (searchQuery) {
        gamesList.innerHTML = '<div class="u-card-empty">No games match your search.</div>';
      } else if (scope === 'all') {
        gamesList.innerHTML = '<div class="u-card-empty">No games exist yet. Be the first to create one!</div>';
      } else {
        gamesList.innerHTML = '<div class="u-card-empty">No games yet. Join the Default Group to unlock the Default Game and Create Game.</div>';
      }
      completeListLoadingWhenReady();
      return;
    }

    gamesList.innerHTML = filtered.map(game => {
      const isSelected = game.id === selectedGameId;
      const isDeleted = game.status === 'deleted' || game.status === 'booted';
      const isBurned = game.status === 'burned';
      const isBooted = game.status === 'booted';
      
      let stateClass = '';
      let displayName = game.name || 'Untitled';
      let iconContent = game.image
        ? buildDiamondImageSvg(game.image)
        : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
      
      if (isBurned) {
        stateClass = 'burned';
        displayName = 'BURNED';
        iconContent = '<span class="x-mark">' + CLOSE_SVG + '</span>';
      } else if (isDeleted) {
        stateClass = 'deleted';
        if (isBooted) displayName = 'BOOTED';
      } else if (isBooted) {
        stateClass = 'booted';
        displayName = 'BOOTED';
      }

      const isOwner = !game.ownerProfileId || game.ownerProfileId === activeProfileId;
      const isMember = getGameMembers(game).includes(activeProfileId);
      const showJoin = !isOwner && !isMember && game.privacy !== 'private' && !isDeleted && !isBurned;
      const DEFAULT_GAME_ID = 'game_default';
      const showEditClear = isOwner && !isDeleted && !isBurned && game.id !== DEFAULT_GAME_ID;
      const showBootBurn = isOwner && isDeleted && !isBurned;

      const extensionTag = game.timingExtensions && game.timingExtensions.length > 0
        ? '<span class="u-card-tag warn">Extended</span>'
        : '';

      const ownerName = getGameOwnerName(game);
      const timingStatus = getGameTimingStatus(game);
      const gameLiked = (game.likedBy || []).includes(activeProfileId);
      const gameFollowed = (game.followedBy || []).includes(activeProfileId);

      let expandBtns = '';
      if (showEditClear) expandBtns += `<button class="u-card-btn" onclick="event.stopPropagation(); window.editGameFromList('${game.id}')">Edit</button><button class="u-card-btn dark" onclick="event.stopPropagation(); window.clearGame('${game.id}')">Boot</button>`;
      if (showBootBurn) expandBtns += `<button class="u-card-btn" onclick="event.stopPropagation(); window.bootGame('${game.id}')">Restore</button><button class="u-card-btn danger" onclick="event.stopPropagation(); window.burnGame('${game.id}')">Delete</button>`;
      if (showJoin) expandBtns += `<button class="u-card-btn accent" onclick="event.stopPropagation(); window.joinGame('${game.id}')">Join</button>`;

      return `
        <div class="u-card ${isSelected ? 'selected' : ''} ${stateClass}" data-id="${game.id}">
          <div class="u-card-body">
            <div class="u-card-thumb">${iconContent}</div>
            <div class="u-card-content">
              <div class="u-card-title">${displayName}</div>
              <div class="u-card-subtitle">${isBurned ? '' : 'Game · by ' + ownerName}</div>
              ${(!isBurned && !isDeleted) ? `<div class="u-card-timing ${timingStatus.cssClass}">${timingStatus.label}${extensionTag}</div>` : ''}
              ${game.description ? '<div class="u-card-desc">' + game.description + '</div>' : ''}
            </div>
            <div class="u-card-indicators">
              <span class="u-card-ind liked${gameLiked ? ' active' : ''}" title="Liked">${HEART_SVG}</span>
              <span class="u-card-ind followed${gameFollowed ? ' active' : ''}" title="Followed">${FOLLOW_ARROW_SVG}</span>
            </div>
            <button class="u-card-options-btn" title="Options" onclick="event.stopPropagation(); this.closest('.u-card').classList.toggle('expanded')">${COG_SVG}</button>
          </div>
          <div class="u-card-expand">
            <div class="u-card-actions">
              <button type="button" class="u-card-like-btn${gameLiked ? ' active' : ''}" title="${gameLiked ? 'Unlike' : 'Like'}" onclick="event.stopPropagation(); window.toggleGameLike('${game.id}', this)">${HEART_SVG}</button>
              <button type="button" class="u-card-follow-btn${gameFollowed ? ' active' : ''}" title="${gameFollowed ? 'Unfollow' : 'Follow'}" onclick="event.stopPropagation(); window.toggleGameFollow('${game.id}', this)">${FOLLOW_ARROW_SVG}</button>
              ${expandBtns}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Burned card cog → open BURNED_MODAL
    gamesList.querySelectorAll('.u-card.burned .u-card-options-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const gameId = btn.closest('.u-card').dataset.id;
        const game = getGameById(gameId);
        if (game && typeof BURNED_MODAL !== 'undefined') BURNED_MODAL.open(game, 'games');
      };
    });

    // Add click handlers with double-tap detection
    gamesList.querySelectorAll('.u-card').forEach(item => {
      item.addEventListener('click', (e) => {
        // Ignore clicks on buttons
        if (e.target.closest('button')) return;
        
        const gameId = item.dataset.id;
        const game = getGameById(gameId);
        if (!game) return;
        
        // If burned, open burned modal
        if (game.status === 'burned') {
          if (typeof BURNED_MODAL !== 'undefined') {
            BURNED_MODAL.open(game, 'games');
          }
          return;
        }
        
        // If deleted/booted, don't allow selection
        if (game.status === 'deleted' || game.status === 'booted') return;
        
        const now = Date.now();
        
        // Check for double-tap (within 300ms on same item)
        if (lastClickedId === gameId && (now - lastClickTime) < 300) {
          // Double tap - open game front modal
          openGameFrontModal(gameId);
          return;
        } else {
          // Single tap - select and show preview
          selectGame(gameId);
        }
        
        lastClickTime = now;
        lastClickedId = gameId;
      });
    });
    completeListLoadingWhenReady();
  }

  // ===== Select Game (Single Tap) =====
  function selectGame(gameId) {
    const game = getGameById(gameId);
    if (!game) return;

    selectedGameId = gameId;

    // Update selection in list
    gamesList.querySelectorAll('.u-card').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === gameId);
    });

    // Show preview panel, hide empty state
    emptyState.style.display = 'none';
    gamePreviewPanel.classList.add('active');
    
    // Update preview panel state classes
    gamePreviewPanel.classList.remove('burned-preview', 'booted-preview');
    if (game.status === 'burned') {
      gamePreviewPanel.classList.add('burned-preview');
    } else if (game.status === 'booted') {
      gamePreviewPanel.classList.add('booted-preview');
    }

    // Populate preview
    showGamePreview(game);
  }

  function showGamePreview(game) {
    const isBurned = game.status === 'burned';
    const isBooted = game.status === 'booted';
    const activeProfileId = getActiveProfileId();
    const canManage = !game.ownerProfileId || game.ownerProfileId === activeProfileId;
    const isLiked = !!activeProfileId && (game.likedBy || []).includes(activeProfileId);
    const isFollowed = !!activeProfileId && (game.followedBy || []).includes(activeProfileId);
    
    // Set title based on state
    if (previewTitle) previewTitle.textContent = isBurned ? 'BURNED' : (isBooted ? 'BOOTED' : (game.name || 'Game Details'));
    if (detailTitle) detailTitle.textContent = isBurned ? 'BURNED' : (isBooted ? 'BOOTED' : (game.name || '--'));
    if (previewPrivacyBadge) {
      const isPrivate = game.privacy === 'private';
      previewPrivacyBadge.textContent = isPrivate ? 'Private' : 'Public';
      previewPrivacyBadge.classList.toggle('public', !isPrivate);
      previewPrivacyBadge.classList.toggle('private', isPrivate);
    }
    if (previewModeBadge) {
      previewModeBadge.textContent = game.gameType === 'book' ? 'Book' : 'Arena';
    }
    if (detailGroup) detailGroup.textContent = isBurned ? '--' : (game.hostGroupName || '--');

    // Owner name
    const ownerName = getGameOwnerName(game);
    if (detailOwner) detailOwner.textContent = isBurned ? '--' : ownerName;

    // Time summary
    const timingStatus = isBurned ? { label: '--', cssClass: '' } : getGameTimingStatus(game);
    if (detailTime) detailTime.textContent = timingStatus.label || '--';
    if (detailVotesAvailable) {
      detailVotesAvailable.textContent = isBurned ? '--' : String(getRemainingVotesForProfile(game));
    }

    // Preview image
    if (previewImage) {
      if (isBurned) {
        previewImage.innerHTML = '<span class="preview-x-mark">' + CLOSE_SVG + '</span>';
      } else if (game.image) {
        previewImage.innerHTML = buildDiamondImageSvg(game.image);
      } else {
        previewImage.innerHTML = `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
      }
    }

    // Image click → navigate to game-details page
    if (previewImage) {
      previewImage.onclick = () => {
        if (!isBurned && !isBooted) {
          window.location.href = `game-details.html?id=${game.id}&returnTo=games.html`;
        }
      };
    }

    // Hint text
    if (previewImageHint) {
      previewImageHint.textContent = isBurned ? '' : 'Tap image for more details';
    }

    // Play button → open game in eshu engine
    if (previewPlayBtn) {
      previewPlayBtn.style.display = (isBurned || isBooted) ? 'none' : '';
      previewPlayBtn.onclick = () => {
        const groups = STATE.get('groups') || [];
        if (!canAccessGame(game, activeProfileId, groups)) {
          TOAST.error('You do not have access to this private game');
          return;
        }
        runHype('RIGHT ON!', () => {
          openGameFrontModal(game.id);
        });
      };
    }

    if (previewLikeBtn) {
      previewLikeBtn.style.display = (isBurned || isBooted) ? 'none' : 'inline-flex';
      previewLikeBtn.classList.toggle('active', isLiked);
      previewLikeBtn.title = isLiked ? 'Unlike' : 'Like';
    }
    if (previewFollowBtn) {
      previewFollowBtn.style.display = (isBurned || isBooted) ? 'none' : 'inline-flex';
      previewFollowBtn.classList.toggle('active', isFollowed);
      previewFollowBtn.title = isFollowed ? 'Unfollow' : 'Follow';
    }
    if (previewSettingsBtn) {
      previewSettingsBtn.style.display = (isBurned || isBooted || !canManage) ? 'none' : 'inline-flex';
    }
  }

  // ===== Open Game Front Modal (Double Tap) =====
  function openGameFrontModal(gameId) {
    const game = getGameById(gameId);
    if (!game) return;
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    if (!canAccessGame(game, activeProfileId, groups)) {
      TOAST.error('You do not have access to this private game');
      return;
    }

    const modal = document.getElementById('gameFrontModal');
    if (!modal) return;

    // Store current game ID for modal
    modal.dataset.gameId = gameId;
    const resolvedSourceGroupId = sourceGroupContextId || game.hostGroupId || '';
    modal.dataset.sourceGroupId = resolvedSourceGroupId;
    gameFrontSelectedPlayerId = null;
    gameFrontSelectedCreationId = null;

    const creationsSearch = document.getElementById('gfCreationsSearch');
    if (creationsSearch) creationsSearch.value = '';
    const commentsInput = document.getElementById('gfCommentsInput');
    if (commentsInput) commentsInput.value = '';

    // Populate modal header
    const modalIcon = document.getElementById('gfModalIcon');
    const modalTitle = document.getElementById('gfModalTitle');
    
    if (modalIcon) {
      if (game.image) {
        modalIcon.innerHTML = buildDiamondImageSvg(game.image);
      } else {
        modalIcon.innerHTML = `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
      }
    }
    if (modalTitle) modalTitle.textContent = game.name || 'Untitled Game';

    const settingsBtn = document.getElementById('gfSettingsBtn');
    if (settingsBtn) {
      const isOwner = !game.ownerProfileId || game.ownerProfileId === activeProfileId;
      settingsBtn.style.display = isOwner ? 'inline-flex' : 'none';
    }

    const followBtnIcon = document.getElementById('gfFollowBtn');
    if (followBtnIcon) followBtnIcon.innerHTML = FOLLOW_ARROW_SVG;

    // Populate Game tab content
    populateGameTab(game);
    updateChamferVotesAvailable(game);

    // Sync like/follow button state
    const likeBtn = document.getElementById('gfLikeBtn');
    if (likeBtn) {
      const activeProfileId = getActiveProfileId();
      const isLiked = activeProfileId && (game.likedBy || []).includes(activeProfileId);
      likeBtn.classList.toggle('active', !!isLiked);
    }
    const followBtn = document.getElementById('gfFollowBtn');
    if (followBtn) {
      const activeProfileId = getActiveProfileId();
      const isFollowed = activeProfileId && (game.followedBy || []).includes(activeProfileId);
      followBtn.classList.toggle('active', !!isFollowed);
    }

    // Show Game tab by default
    switchGameFrontTab('game');

    // Show modal
    modal.classList.add('active');
    startGameFrontChamferTicker();
  }

  function closeGameFrontModal() {
    const modal = document.getElementById('gameFrontModal');
    if (modal) modal.classList.remove('active');
    stopGameFrontChamferTicker();
  }

  function populateGameTab(game) {
    // Left side - Game info
    const gfGameImage = document.getElementById('gfGameImage');
    const gfGameTitle = document.getElementById('gfGameTitle');
    const gfGameStats = document.getElementById('gfGameStats');
    const gfGameBadges = document.getElementById('gfGameBadges');
    const gfVotesCount = document.getElementById('gfVotesCount');
    const gfBurnsCount = document.getElementById('gfBurnsCount');
    const gfGroupDetails = document.getElementById('gfGroupDetails');
    const gfDescription = document.getElementById('gfDescription');
    const gfRules = document.getElementById('gfRules');
    const gfLeaderboard = document.getElementById('gfLeaderboard');
    const gfGameStatus = document.getElementById('gfGameStatus');

    // Game image
    if (gfGameImage) {
      if (game.image) {
        gfGameImage.innerHTML = buildDiamondImageSvg(game.image);
      } else {
        gfGameImage.innerHTML = `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
      }
    }

    // Title and stats
    if (gfGameTitle) gfGameTitle.textContent = game.name || 'Untitled Game';
    
    const gameCreations = getGameCreationsForProfile(game, { limit: 5000 });
    const activeCreations = gameCreations.filter(c => c.status !== 'deleted' && c.status !== 'burned');
    const remainingVotes = getRemainingVotesForProfile(game);
    const playersSet = new Set(activeCreations.map(c => getCreationOwnerProfileId(c) || getCreationAuthorName(c)));
    
    if (gfGameStats) {
      const votesLabel = remainingVotes === Infinity ? '∞ Votes' : `${remainingVotes} Available Vote${remainingVotes === 1 ? '' : 's'}`;
      gfGameStats.textContent = `${activeCreations.length} Creations · ${playersSet.size} Players · ${votesLabel}`;
    }

    updateChamferVotesAvailable(game);

    // Badges
    if (gfGameBadges) {
      const isPublic = game.privacy !== 'private';
      const isInfinite = !game.endTime;
      const modeLabel = game.gameType === 'book' ? 'Book' : 'Arena';
      gfGameBadges.innerHTML = `
        <span class="gf-badge ${isPublic ? 'badge-public' : 'badge-private'}">${isPublic ? 'Public' : 'Private'}</span>
        <span class="gf-badge ${isInfinite ? 'badge-infinite' : 'badge-deadline'}">${isInfinite ? 'Infinite' : 'Deadline'}</span>
        <span class="gf-badge badge-public">${modeLabel}</span>
      `;
    }

    // Votes and burns
    if (gfVotesCount) gfVotesCount.textContent = getGameVoteCount(game, gameCreations);
    if (gfBurnsCount) gfBurnsCount.textContent = getGameBurnCount(game, gameCreations);

    if (gfGroupDetails) {
      const hostGroup = getGroupById(game.hostGroupId);
      if (hostGroup) {
        const privacy = hostGroup.privacy === 'private' ? 'Private' : 'Public';
        const memberCount = getGroupMembers(hostGroup).length;
        gfGroupDetails.textContent = `${hostGroup.name || 'Group'} · ${privacy} · ${memberCount} member${memberCount === 1 ? '' : 's'}`;
      } else {
        gfGroupDetails.textContent = 'No group linked.';
      }
    }

    // Description
    if (gfDescription) {
      let description = game.description || 'No description provided.';
      const DEFAULT_GAME_ID = 'game_default';
      if (game.id === DEFAULT_GAME_ID) {
        const xpAwards = [
          '• Uploaded creation: +1 XP',
          '• Comment posted: +1 XP',
          '• Animated comment: +2 XP',
          '• Created a game: +2 XP',
          '• 1st place in competition: +5 XP',
          '• 2nd place in competition: +4 XP',
          '• 3rd place in competition: +3 XP'
        ];
        description += '\n\n🏆 XP AWARDS:\n' + xpAwards.join('\n');
      }
      gfDescription.textContent = description;
    }

    // Rules
    if (gfRules) {
      const rules = game.rules || '';
      const rulesList = rules.split('\n').filter(r => r.trim());
      if (rulesList.length > 0) {
        gfRules.innerHTML = rulesList.map((rule, i) => `<li>${i + 1}. ${rule}</li>`).join('');
      } else {
        gfRules.innerHTML = '<li>No rules specified.</li>';
      }
    }

    // Ensure awards are granted before rendering the leaderboard
    const gameEnded = isGameEnded(game);
    if (gameEnded) awardGameWinners(game);

    // Leaderboard
    if (gfLeaderboard) {
      const topCreations = gameCreations
        .filter(c => c.status !== 'deleted' && c.status !== 'burned')
        .sort((a, b) => getCreationVoteCount(b) - getCreationVoteCount(a))
        .slice(0, 10);
      if (topCreations.length === 0) {
        gfLeaderboard.innerHTML = Array(10).fill(0).map((_, i) => `
          <div class="gf-lb-item">
            <div class="gf-lb-placeholder">?</div>
            <div class="gf-lb-num">${i + 1}</div>
          </div>
        `).join('');
      } else {
        gfLeaderboard.innerHTML = topCreations.map((c, i) => {
          const rank = c.awardRank;
          const showAward = gameEnded && rank && rank >= 1 && rank <= 3;
          return `
          <div class="gf-lb-item" data-id="${c.id}" style="${c.bgColor ? `background:${c.bgColor};` : ''}">
            ${renderCreationImageMarkup(c, 'gf-lb-placeholder')}
            <div class="gf-lb-num">${i + 1}</div>
            ${showAward ? `<div class="award-diamond ${rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze'} gf-lb-award"><span>${rank}</span></div>` : ''}
          </div>
        `;
        }).join('');
        
        // Fill remaining slots
        const remaining = 10 - topCreations.length;
        if (remaining > 0) {
          gfLeaderboard.innerHTML += Array(remaining).fill(0).map(() => `
            <div class="gf-lb-item"><div class="gf-lb-placeholder">?</div></div>
          `).join('');
        }

        hydrateCreationImages(gfLeaderboard, topCreations);

        gfLeaderboard.querySelectorAll('.gf-lb-item[data-id]').forEach(item => {
          item.addEventListener('click', () => {
            const cId = item.dataset.id;
            if (cId) openCreationFocusFromGame(game.id, cId);
          });
        });
      }
    }

    // Timing schedule
    const gfTimingSchedule = document.getElementById('gfTimingSchedule');
    if (gfTimingSchedule) {
      gfTimingSchedule.innerHTML = buildTimingScheduleHtml(game);
    }

    updateGameFrontChamfer(game);

    populateInlineComments(game);
  }

  // ===== Award top 3 when game ends =====
  async function awardGameWinners(game) {
    if (!game || !game.id) return;
    // Guard: in-memory flag
    if (game._awardsGranted) return;
    // Guard: persistent localStorage flag (survives page reloads & object replacements)
    const awardKey = `_awards_granted_${game.id}`;
    if (localStorage.getItem(awardKey)) { game._awardsGranted = true; return; }

    // Lock IMMEDIATELY to prevent re-entry from ticker or subscriber chains.
    // This runs BEFORE any async work below so re-entry is still impossible
    // even across the await boundary.
    game._awardsGranted = true;
    localStorage.setItem(awardKey, '1');

    const allCreations = STATE.get('creations') || [];
    const gameCreations = allCreations
      .filter(c => (c.hostGameId === game.id || c.gameId === game.id) && c.status !== 'deleted' && c.status !== 'burned');
    if (gameCreations.length === 0) return;

    const sorted = [...gameCreations].sort((a, b) => getCreationVoteCount(b) - getCreationVoteCount(a));
    const top3 = sorted.slice(0, 3);
    const gameName = game.name || game.title || 'Competition';
    const awardXpMap = { 1: 5, 2: 4, 3: 3 };

    // Prefer server-authoritative finalization. Server picks top-3 from
    // submitted vote counts, awards placement XP to creation owners
    // atomically (idempotent), and returns the canonical placements. We
    // then mirror those onto local state.
    const remoteMode = !!(window.ESHU_API && window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());
    if (remoteMode) {
      try {
        const rankings = top3.map(c => ({ creationId: c.id, voteCount: getCreationVoteCount(c) }));
        const result = await ESHU_API.games.finalize(game.id, rankings);
        for (const p of result.placements || []) {
          const c = allCreations.find(x => x.id === p.creationId);
          if (c) {
            c.awardRank = p.rank;
            c.awardCompetition = gameName;
            c.awardedAt = result.finalizedAt;
            c.awardGameId = game.id;
          }
        }
        STATE.set('creations', allCreations);
        saveToStorage();
        return;
      } catch (err) {
        console.warn('[awardGameWinners] server finalize unavailable, falling back to local:', err);
      }
    }

    // Local fallback: existing logic preserved verbatim for offline mode.
    let changed = false;
    top3.forEach((c, i) => {
      if (!c.awardRank) {
        c.awardRank = i + 1;
        c.awardCompetition = gameName;
        c.awardedAt = Date.now();
        c.awardGameId = game.id;
        changed = true;
      }
    });
    if (changed) {
      top3.forEach((c, i) => {
        if (c.awardedAt) {
          const ownerId = c.ownerProfileId || c.createdByProfileId || c.authorProfileId || c.authorId || null;
          if (ownerId) ESHU_DB.addProfileXp(awardXpMap[i + 1], ownerId, `${['1st','2nd','3rd'][i]} place — ${gameName}`);
        }
      });
      STATE.set('creations', allCreations);
      saveToStorage();
    }
  }

  // ===== Live-updating chamfer status + button gating =====
  function isGameEnded(game) {
    return !!(game && game.endTime && Date.now() >= game.endTime);
  }
  function areSubmissionsClosed(game) {
    return !!(game && game.submissionCloseTime && Date.now() >= game.submissionCloseTime);
  }

  function updateGameFrontChamfer(game) {
    if (!game) return;
    const gfGameStatus = document.getElementById('gfGameStatus');
    const uploadBtn = document.getElementById('gfUploadBtn');
    const playBtn = document.getElementById('gfPlayBtn');

    // --- Status text ---
    if (gfGameStatus) {
      if (game.status === 'burned') {
        gfGameStatus.textContent = 'Game is burned';
        gfGameStatus.className = 'gf-chamfer-status burned';
      } else if (game.status === 'booted') {
        gfGameStatus.textContent = 'Game is booted';
        gfGameStatus.className = 'gf-chamfer-status booted';
      } else {
        const now = Date.now();
        const notStarted = game.startTime && now < game.startTime;
        const hasEnded = isGameEnded(game);

        let primary = 'Game is Live';
        let phaseClass = 'live';
        if (hasEnded) { primary = 'Game Over'; phaseClass = 'ended'; awardGameWinners(game); }
        else if (notStarted) { primary = `Starts in ${formatCountdownWithSeconds(game.startTime - now)}`; phaseClass = 'starting'; }

        const parts = [`<span class="gf-chamfer-line primary">${primary}</span>`];

        if (!hasEnded && game.submissionCloseTime) {
          const subsLabel = now < game.submissionCloseTime
            ? `Subs close in ${formatCountdownWithSeconds(game.submissionCloseTime - now)}`
            : `Subs closed`;
          parts.push(`<span class="gf-chamfer-line subs">${subsLabel}</span>`);
        }

        if (!hasEnded) {
          if (game.endTime) {
            parts.push(`<span class="gf-chamfer-line left">Game ends in ${formatCountdownWithSeconds(game.endTime - now)}</span>`);
          } else if (!notStarted) {
            parts.push(`<span class="gf-chamfer-line left">Infinite</span>`);
          }
        }

        gfGameStatus.innerHTML = parts.join('');
        gfGameStatus.className = 'gf-chamfer-status multi ' + phaseClass;
      }
    }

    // --- Button gating ---
    const subsClosed = areSubmissionsClosed(game);
    const ended = isGameEnded(game);
    const burnedOrBooted = game.status === 'burned' || game.status === 'booted';
    const notStartedYet = game.startTime && Date.now() < game.startTime;

    if (uploadBtn) {
      const disableUpload = burnedOrBooted || ended || subsClosed || notStartedYet;
      uploadBtn.classList.toggle('disabled', !!disableUpload);
      uploadBtn.disabled = !!disableUpload;
      uploadBtn.title = ended ? 'Game has ended'
        : subsClosed ? 'Submissions are closed'
        : notStartedYet ? 'Game has not started yet'
        : burnedOrBooted ? 'Game unavailable'
        : '';
    }
    if (playBtn) {
      const disablePlay = burnedOrBooted || ended || notStartedYet;
      playBtn.classList.toggle('disabled', !!disablePlay);
      playBtn.disabled = !!disablePlay;
      playBtn.title = ended ? 'Game is over — voting closed'
        : notStartedYet ? 'Game has not started yet'
        : burnedOrBooted ? 'Game unavailable'
        : '';
    }
  }

  let gfChamferTickId = null;
  function startGameFrontChamferTicker() {
    stopGameFrontChamferTicker();
    gfChamferTickId = setInterval(() => {
      const modal = document.getElementById('gameFrontModal');
      if (!modal || !modal.classList.contains('active')) {
        stopGameFrontChamferTicker();
        return;
      }
      const gameId = modal.dataset.gameId;
      const game = gameId ? getGameById(gameId) : null;
      if (game) updateGameFrontChamfer(game);
    }, 1000);
  }
  function stopGameFrontChamferTicker() {
    if (gfChamferTickId) { clearInterval(gfChamferTickId); gfChamferTickId = null; }
  }

  function switchGameFrontTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.gf-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.gf-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `gfTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    });

    // Populate Players/Creations/Comments tabs on demand
    const modal = document.getElementById('gameFrontModal');
    const gameId = modal ? modal.dataset.gameId : null;
    const game = gameId ? getGameById(gameId) : null;

    if (tabName === 'creations' && game) {
      populateCreationsTab(game);
    } else if (tabName === 'comments' && game) {
      populateCommentsTab(game);
    }
  }

  function populateCreationsTab(game) {
    const gfCreations = document.getElementById('gfCreations');
    const filterInput = document.getElementById('gfCreationsFilter');
    const sortInput = document.getElementById('gfCreationsSort');
    const searchInput = document.getElementById('gfCreationsSearch');
    const countEl = document.getElementById('gfCreationsCount');
    if (!gfCreations) return;

    const searchQuery = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const filterVal = filterInput ? filterInput.value : 'all';
    const sortVal = sortInput ? sortInput.value : 'recent';
    const activeProfileId = getActiveProfileId();
    let gameCreations = getGameCreationsForProfile(game, { limit: 50 });

    // Filter
    if (filterVal === 'liked') {
      gameCreations = gameCreations.filter(c => c.liked);
    } else if (filterVal === 'public') {
      gameCreations = gameCreations.filter(c => (c.privacy || '').toLowerCase() !== 'private');
    } else if (filterVal === 'private') {
      gameCreations = gameCreations.filter(c => (c.privacy || '').toLowerCase() === 'private');
    }

    // Search
    if (searchQuery) {
      gameCreations = gameCreations.filter(c => {
        const tags = Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || '');
        return (
          (c.name || c.title || '').toLowerCase().includes(searchQuery) ||
          (c.description || '').toLowerCase().includes(searchQuery) ||
          (c.authorName || c.author || '').toLowerCase().includes(searchQuery) ||
          tags.toLowerCase().includes(searchQuery)
        );
      });
    }

    // Sort
    if (sortVal === 'votes') {
      gameCreations.sort((a, b) => getCreationVoteCount(b) - getCreationVoteCount(a));
    } else if (sortVal === 'name') {
      gameCreations.sort((a, b) => String(a.name || a.title || '').localeCompare(String(b.name || b.title || '')));
    } else {
      gameCreations.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
    }

    if (countEl) {
      countEl.textContent = `${gameCreations.length} / 50`;
    }

    if (gameCreations.length === 0) {
      gfCreations.innerHTML = '<div class="u-card-empty">No creations found</div>';
      gameFrontSelectedCreationId = null;
      return;
    }

    const ids = new Set(gameCreations.map(c => c.id));
    if (!gameFrontSelectedCreationId || !ids.has(gameFrontSelectedCreationId)) {
      gameFrontSelectedCreationId = gameCreations[0].id;
    }

    gfCreations.innerHTML = gameCreations.map(c => {
      const ownerId = getCreationOwnerProfileId(c);
      const isOwner = !ownerId || ownerId === activeProfileId;
      const isDeleted = c.status === 'deleted';
      const isBurned = c.status === 'burned';
      const showEditClear = isOwner && !isDeleted && !isBurned;
      const showBootBurn = isOwner && isDeleted && !isBurned;
      const stateClass = isBurned ? 'burned' : isDeleted ? 'deleted' : '';
      const selectedClass = c.id === gameFrontSelectedCreationId ? 'selected' : '';
      const title = isBurned ? 'BURNED' : (c.title || c.name || 'Untitled');
      const author = getCreationAuthorName(c);
      const desc = c.description || '';
      const crLiked = (c.likedBy || []).includes(activeProfileId);
      const crFollowed = (c.followedBy || []).includes(activeProfileId);

      let expandBtns = '';
      if (showEditClear) expandBtns += '<button class="u-card-btn" data-gf-action="edit">Edit</button><button class="u-card-btn dark" data-gf-action="clear">Boot</button>';
      if (showBootBurn) expandBtns += '<button class="u-card-btn" data-gf-action="boot">Restore</button><button class="u-card-btn danger" data-gf-action="burn">Delete</button>';

      // Render thumbnail or fallback
      const hasVisual = !!(c.image || c.imageAssetId || c.imageRef?.id);
      const thumbContent = isBurned ? CLOSE_SVG : (hasVisual ? `<img src="${c.image || ''}" alt="${title}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='${PALETTE_SVG.replace(/'/g, "\\'")}';">` : PALETTE_SVG);
      
      return `
      <div class="u-card ${stateClass} ${selectedClass}" data-id="${c.id}">
        <div class="u-card-body">
          <div class="u-card-thumb">${thumbContent}</div>
          <div class="u-card-content">
            <div class="u-card-title">${title}</div>
            <div class="u-card-subtitle">by ${author} · ${game.name || 'Untitled Game'}</div>
            ${desc ? '<div class="u-card-desc">' + desc + '</div>' : ''}
          </div>
          <div class="u-card-indicators">
            <span class="u-card-ind liked${crLiked ? ' active' : ''}" title="Liked">${HEART_SVG}</span>
            <span class="u-card-ind followed${crFollowed ? ' active' : ''}" title="Followed">${FOLLOW_ARROW_SVG}</span>
          </div>
          <button type="button" class="u-card-options-btn" title="Options" onclick="event.stopPropagation(); this.closest('.u-card').classList.toggle('expanded')">${COG_SVG}</button>
        </div>
        <div class="u-card-expand">
          <div class="u-card-actions">
            <button type="button" class="u-card-like-btn${crLiked ? ' active' : ''}" title="${crLiked ? 'Unlike' : 'Like'}" data-gf-action="like">${HEART_SVG}</button>
            <button type="button" class="u-card-follow-btn${crFollowed ? ' active' : ''}" title="${crFollowed ? 'Unfollow' : 'Follow'}" data-gf-action="follow">${FOLLOW_ARROW_SVG}</button>
            ${expandBtns}
          </div>
        </div>
      </div>
    `;
    }).join('');

    const selectCreation = (creationId) => {
      gameFrontSelectedCreationId = creationId;
      gfCreations.querySelectorAll('.u-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === creationId);
      });
    };

    gfCreations.querySelectorAll('.u-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (!id) return;
        const target = gameCreations.find(c => c.id === id);
        if (target && target.status === 'burned' && typeof BURNED_MODAL !== 'undefined') {
          BURNED_MODAL.open(target, 'creations');
          return;
        }
        selectCreation(id);
      });
      card.addEventListener('dblclick', () => {
        const id = card.dataset.id;
        if (!id) return;
        openCreationFocusFromGame(game.id, id);
      });

      const creationId = card.dataset.id;
      const editBtn = card.querySelector('[data-gf-action="edit"]');
      if (editBtn) editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!creationId) return;
        openCreationFocusFromGame(game.id, creationId);
      });

      const clearBtn = card.querySelector('[data-gf-action="clear"]');
      if (clearBtn) clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!creationId) return;
        window.clearGameCreation(creationId, game.id);
      });

      const bootBtn = card.querySelector('[data-gf-action="boot"]');
      if (bootBtn) bootBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!creationId) return;
        window.bootGameCreation(creationId, game.id);
      });

      const burnBtn = card.querySelector('[data-gf-action="burn"]');
      if (burnBtn) burnBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!creationId) return;
        window.burnGameCreation(creationId, game.id);
      });

      const likeBtn = card.querySelector('[data-gf-action="like"]');
      if (likeBtn) likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!creationId) return;
        const creation = gameCreations.find(c => c.id === creationId);
        if (!creation) return;
        creation.likedBy = Array.isArray(creation.likedBy) ? creation.likedBy : [];
        const li = creation.likedBy.indexOf(activeProfileId);
        if (li >= 0) { creation.likedBy.splice(li, 1); likeBtn.classList.remove('active'); likeBtn.title = 'Like'; }
        else { creation.likedBy.push(activeProfileId); likeBtn.classList.add('active'); likeBtn.title = 'Unlike'; }
        const ind = card.querySelector('.u-card-ind.liked'); if (ind) ind.classList.toggle('active', likeBtn.classList.contains('active'));
        STATE.set('creations', STATE.get('creations') || []);
      });

      const followBtn = card.querySelector('[data-gf-action="follow"]');
      if (followBtn) followBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!creationId) return;
        const creation = gameCreations.find(c => c.id === creationId);
        if (!creation) return;
        creation.followedBy = Array.isArray(creation.followedBy) ? creation.followedBy : [];
        const fi = creation.followedBy.indexOf(activeProfileId);
        if (fi >= 0) { creation.followedBy.splice(fi, 1); followBtn.classList.remove('active'); followBtn.title = 'Follow'; }
        else { creation.followedBy.push(activeProfileId); followBtn.classList.add('active'); followBtn.title = 'Unfollow'; }
        const ind = card.querySelector('.u-card-ind.followed'); if (ind) ind.classList.toggle('active', followBtn.classList.contains('active'));
        STATE.set('creations', STATE.get('creations') || []);
      });
    });

  }

  window.clearGameCreation = function(creationId, gameId) {
    const creations = STATE.get('creations') || [];
    const idx = creations.findIndex(c => c.id === creationId);
    if (idx === -1) return;
    const activeProfileId = getActiveProfileId();
    const ownerId = getCreationOwnerProfileId(creations[idx]);
    if (ownerId && ownerId !== activeProfileId) {
      TOAST.error('Only the creation owner can boot this creation');
      return;
    }
    const next = [...creations];
    next[idx] = { ...next[idx], status: 'deleted' };
    STATE.set('creations', next);
    TOAST.info('Creation booted - Boot to restore or Delete permanently');
    const game = gameId ? getGameById(gameId) : null;
    if (game) { populateCreationsTab(game); populateGameTab(game); }
  };

  window.bootGameCreation = function(creationId, gameId) {
    const creations = STATE.get('creations') || [];
    const idx = creations.findIndex(c => c.id === creationId);
    if (idx === -1) return;
    const activeProfileId = getActiveProfileId();
    const ownerId = getCreationOwnerProfileId(creations[idx]);
    if (ownerId && ownerId !== activeProfileId) {
      TOAST.error('Only the creation owner can restore this creation');
      return;
    }
    const next = [...creations];
    next[idx] = { ...next[idx], status: 'active' };
    STATE.set('creations', next);
    TOAST.success('Creation restored!');
    const game = gameId ? getGameById(gameId) : null;
    if (game) { populateCreationsTab(game); populateGameTab(game); }
  };

  window.burnGameCreation = async function(creationId, gameId) {
    const creations = STATE.get('creations') || [];
    const idx = creations.findIndex(c => c.id === creationId);
    if (idx === -1) return;
    const activeProfileId = getActiveProfileId();
    const ownerId = getCreationOwnerProfileId(creations[idx]);
    if (ownerId && ownerId !== activeProfileId) {
      TOAST.error('Only the creation owner can burn this creation');
      return;
    }
    const yes = await MODAL.confirm({ title: 'Burn Creation', message: 'Delete (burn) this creation permanently?', danger: true, confirmLabel: 'Burn' });
    if (!yes) return;
    const next = [...creations];
    next[idx] = { ...next[idx], status: 'burned' };
    STATE.set('creations', next);
    TOAST.error('Creation burned!');
    const game = gameId ? getGameById(gameId) : null;
    if (game) { populateCreationsTab(game); populateGameTab(game); }
  };

  function toggleChamferOverlay(forceState) {
    const overlay = document.getElementById('gfChamferOverlay');
    if (!overlay) return;
    if (typeof forceState === 'boolean') {
      overlay.classList.toggle('minimized', !forceState);
    } else {
      overlay.classList.toggle('minimized');
    }
  }

  function initGameFrontModal() {
    // Tab switching
    document.querySelectorAll('.gf-tab').forEach(tab => {
      tab.addEventListener('click', () => switchGameFrontTab(tab.dataset.tab));
    });

    const getGameForModal = () => {
      const modal = document.getElementById('gameFrontModal');
      const gameId = modal ? modal.dataset.gameId : null;
      return gameId ? getGameById(gameId) : null;
    };

    const creationsSearch = document.getElementById('gfCreationsSearch');
    if (creationsSearch) {
      creationsSearch.addEventListener('input', () => {
        const game = getGameForModal();
        if (game) populateCreationsTab(game);
      });
    }
    const creationsFilter = document.getElementById('gfCreationsFilter');
    if (creationsFilter) {
      creationsFilter.addEventListener('change', () => {
        const game = getGameForModal();
        if (game) populateCreationsTab(game);
      });
    }
    const creationsSort = document.getElementById('gfCreationsSort');
    if (creationsSort) {
      creationsSort.addEventListener('change', () => {
        const game = getGameForModal();
        if (game) populateCreationsTab(game);
      });
    }

    initGameCommentComposer('gfInlineCommentsSubmit', 'gfInlineCommentsInput');

    const commentsSort = document.getElementById('gfCommentsSort');
    if (commentsSort) {
      commentsSort.addEventListener('change', () => {
        const game = getGameForModal();
        if (game) populateCommentsTab(game);
      });
    }

    // Close button
    const closeBtn = document.getElementById('gfCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeGameFrontModal);

    // Comments toggle (maximize / minimize)
    const gfCommentsToggle = document.getElementById('gfCommentsToggle');
    const gfCommentsUnit = document.getElementById('gfGameCommentsUnit');
    if (gfCommentsToggle && gfCommentsUnit) {
      const gfLeftScroll = document.querySelector('.gf-game-left-scroll');
      gfCommentsToggle.addEventListener('click', () => {
        const isMax = gfCommentsUnit.classList.toggle('maximized');
        if (gfLeftScroll) gfLeftScroll.classList.toggle('collapsed', isMax);
        gfCommentsToggle.classList.toggle('is-exit', isMax);
        gfCommentsToggle.title = isMax ? 'Minimize comments' : 'Maximize comments';
      });
    }

    // Chamfer overlay unified toggle — one button in the bottom-right
    const chamferToggle = document.getElementById('gfChamferToggle');
    if (chamferToggle) {
      chamferToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const overlay = document.getElementById('gfChamferOverlay');
        const nowMinimized = overlay && overlay.classList.contains('minimized');
        toggleChamferOverlay();
        chamferToggle.title = nowMinimized ? 'Minimize' : 'Expand';
        chamferToggle.setAttribute('aria-label', nowMinimized ? 'Minimize actions' : 'Expand actions');
      });
    }

    // Play button - navigate to ESHU engine
    const playBtn = document.getElementById('gfPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        const modal = document.getElementById('gameFrontModal');
        const gameId = modal ? modal.dataset.gameId : null;
        const sourceGroupId = modal ? (modal.dataset.sourceGroupId || '') : '';
        const game = gameId ? getGameById(gameId) : null;
        if (isGameEnded(game)) { TOAST.error('Game is over — voting closed'); return; }
        if (game && game.startTime && Date.now() < game.startTime) { TOAST.error('Game has not started yet'); return; }
        if (game && (game.status === 'burned' || game.status === 'booted')) { TOAST.error('Game unavailable'); return; }
        const mode = game && game.gameType === 'book' ? 'book' : 'arena';
        if (gameId) {
          const sourceGroupPart = sourceGroupId
            ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
            : '';
          const returnUrl = buildGameFrontReturnUrl(gameId);
          runHype('RIGHT ON!', () => {
            const targetUrl = `eshu.html?gameId=${gameId}&mode=${mode}${sourceGroupPart}`;
            if (window.NAV_BACK) window.NAV_BACK.goToWithReturn(targetUrl, returnUrl);
            else window.location.href = targetUrl;
          });
        } else {
          runHype('RIGHT ON!', () => {
            window.location.href = 'eshu.html';
          });
        }
      });
    }

    // Upload button - navigate to creations page with game ID
    const uploadBtn = document.getElementById('gfUploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        const activeProfileId = getActiveProfileId();
        const modal = document.getElementById('gameFrontModal');
        const gameId = modal ? modal.dataset.gameId : null;
        const sourceGroupId = modal ? (modal.dataset.sourceGroupId || '') : '';
        const game = gameId ? getGameById(gameId) : null;
        // Onboarding bypass: members of the default group/game can upload
        // to game_default before reaching the 2-XP upload unlock so they
        // can earn the XP that unlocks Comments (3 XP) and Upload (2 XP).
        const isDefaultGameUpload = gameId === 'game_default' && canUploadToDefaultGame(activeProfileId, game);
        if (!isDefaultGameUpload && !canUploadCreation(activeProfileId)) {
          TOAST.error('You need more XP to unlock this feature. You need at least 2 XP to Upload a Creation.');
          return;
        }
        if (isGameEnded(game)) { TOAST.error('Game has ended'); return; }
        if (areSubmissionsClosed(game)) { TOAST.error('Submissions are closed for this game'); return; }
        if (game && game.startTime && Date.now() < game.startTime) { TOAST.error('Game has not started yet'); return; }
        if (game && (game.status === 'burned' || game.status === 'booted')) { TOAST.error('Game unavailable'); return; }
        const groups = STATE.get('groups') || [];
        if (game && !canAccessGame(game, activeProfileId, groups)) {
          TOAST.error('You cannot upload to this private game');
          return;
        }
        if (gameId) {
          const sourceGroupPart = sourceGroupId
            ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
            : '';
          const targetUrl = `creations.html?gameId=${gameId}&action=upload${sourceGroupPart}`;
          const returnUrl = buildGameFrontReturnUrl(gameId);
          if (window.NAV_BACK) window.NAV_BACK.goToWithReturn(targetUrl, returnUrl);
          else window.location.href = targetUrl;
        } else {
          window.location.href = 'creations.html?action=upload';
        }
      });
    }
    
    // Also wire up the upload badge in footer
    const uploadBadge = document.querySelector('.gf-upload-badge');
    if (uploadBadge) {
      uploadBadge.style.cursor = 'pointer';
      uploadBadge.addEventListener('click', () => {
        const activeProfileId = getActiveProfileId();
        const modal = document.getElementById('gameFrontModal');
        const gameId = modal ? modal.dataset.gameId : null;
        const sourceGroupId = modal ? (modal.dataset.sourceGroupId || '') : '';
        const game = gameId ? getGameById(gameId) : null;
        const isDefaultGameUpload = gameId === 'game_default' && canUploadToDefaultGame(activeProfileId, game);
        if (!isDefaultGameUpload && !canUploadCreation(activeProfileId)) {
          TOAST.error('You need more XP to unlock this feature. You need at least 2 XP to Upload a Creation.');
          return;
        }
        const groups = STATE.get('groups') || [];
        if (game && !canAccessGame(game, activeProfileId, groups)) {
          TOAST.error('You cannot upload to this private game');
          return;
        }
        if (gameId) {
          const sourceGroupPart = sourceGroupId
            ? `&sourceGroupId=${encodeURIComponent(sourceGroupId)}`
            : '';
          const targetUrl = `creations.html?gameId=${gameId}&action=upload${sourceGroupPart}`;
          const returnUrl = buildGameFrontReturnUrl(gameId);
          if (window.NAV_BACK) window.NAV_BACK.goToWithReturn(targetUrl, returnUrl);
          else window.location.href = targetUrl;
        } else {
          window.location.href = 'creations.html?action=upload';
        }
      });
    }

    // Like button — real likedBy toggle
    const likeBtn = document.getElementById('gfLikeBtn');
    if (likeBtn) likeBtn.addEventListener('click', () => {
      const game = getGameForModal();
      const activeProfileId = getActiveProfileId();
      if (!game || !activeProfileId) return;
      game.likedBy = Array.isArray(game.likedBy) ? game.likedBy : [];
      const idx = game.likedBy.indexOf(activeProfileId);
      if (idx >= 0) {
        game.likedBy.splice(idx, 1);
        likeBtn.classList.remove('active');
        TOAST.success('Unliked');
      } else {
        game.likedBy.push(activeProfileId);
        likeBtn.classList.add('active');
        TOAST.success('Liked!');
      }
      saveToStorage();
    });

    const followBtn = document.getElementById('gfFollowBtn');
    if (followBtn) followBtn.addEventListener('click', () => {
      const game = getGameForModal();
      const activeProfileId = getActiveProfileId();
      if (!game || !activeProfileId) return;
      game.followedBy = Array.isArray(game.followedBy) ? game.followedBy : [];
      const idx = game.followedBy.indexOf(activeProfileId);
      if (idx >= 0) {
        game.followedBy.splice(idx, 1);
        followBtn.classList.remove('active');
        TOAST.success('Unfollowed');
      } else {
        game.followedBy.push(activeProfileId);
        followBtn.classList.add('active');
        TOAST.success('Followed!');
      }
      saveToStorage();
    });

    // Settings button
    const settingsBtn = document.getElementById('gfSettingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => {
      const game = getGameForModal();
      const activeProfileId = getActiveProfileId();
      if (!game) return;
      if (game.ownerProfileId && game.ownerProfileId !== activeProfileId) {
        TOAST.error('Only the game owner can edit this game');
        return;
      }
      editReturnContext = { type: 'game-front', gameId: game.id };
      selectGame(game.id);
      enterEditMode();
      closeGameFrontModal();
    });

    // Click outside to close
    const modal = document.getElementById('gameFrontModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeGameFrontModal();
      });
    }


  }

  // ===== Enter Edit Mode =====
  function enterEditMode() {
    if (!selectedGameId) return;
    endDiamondImageEditor();
    
    const game = getGameById(selectedGameId);
    if (!game) return;
    const activeProfileId = getActiveProfileId();
    if (game.ownerProfileId && game.ownerProfileId !== activeProfileId) {
      TOAST.error('Only the game owner can edit this game');
      return;
    }

    // Block editing if game has ended (deadline mode only)
    if (game.endTime && Date.now() >= game.endTime) {
      TOAST.error('This game has ended. Settings can no longer be changed.');
      return;
    }

    isEditMode = true;
    isCreateMode = false;
    hostGroupLockedForEdit = true;
    pendingImageData = null; // Reset pending image
    pageContainer.classList.add('edit-mode');
    applyHostGroupLockUi();

    // Update UI for edit mode
    if (editPanelTitle) editPanelTitle.textContent = 'Edit Game';
    if (imagePanelTitle) imagePanelTitle.textContent = game.name || 'Untitled Game';
    if (saveBtn) saveBtn.textContent = 'Save';

    // Populate image panel (left side)
    if (gameImageLarge) {
      renderGameImageLarge(game.image || null);
    }

    // Populate edit form
    if (editTitle) editTitle.value = game.name || '';
    if (editDescription) editDescription.value = game.description || '';
    if (editRules) editRules.value = game.rules || '';
    if (editTags) editTags.value = game.tags || '';

    // Set group dropdown value
    setGroupDropdownValue(game.hostGroupId, game.hostGroupName);

    // Set timing mode (infinite if no endTime)
    const timingMode = game.endTime ? 'deadline' : 'infinite';
    setTimingMode(timingMode);

    // Map existing absolute times into the new state shape:
    //   startAt    = game.startTime (kept absolute; may be past)
    //   duration   = endTime - startTime  (total runtime)
    //   submission = submissionCloseTime - startTime  (offset within run)
    const now = Date.now();
    const existingStart = game.startTime || now;
    const existingEnd = game.endTime || (existingStart + 24 * 60 * 60 * 1000);
    const existingSubs = game.submissionCloseTime || existingEnd;
    timingState.startAt = existingStart;
    timingState.duration = msToOffset(Math.max(0, existingEnd - existingStart));
    timingState.submission = msToOffset(Math.max(0, existingSubs - existingStart));
    setTimingWheelsFromState();

    // Set game mode
    gameModeState = game.gameType === 'book' ? 'book' : 'arena';
    const modeRadio = document.querySelector(`input[name="gameType"][value="${gameModeState}"]`);
    if (modeRadio) modeRadio.checked = true;

    // Set privacy radio
    const privacyRadio = document.querySelector(`input[name="editPrivacy"][value="${game.privacy || 'public'}"]`);
    if (privacyRadio) privacyRadio.checked = true;

    // Update timing preview
    updateTimingPreview();
  }

  // ===== Enter Create Mode =====
  function enterCreateMode() {
    endDiamondImageEditor();
    isEditMode = true;
    isCreateMode = true;
    hostGroupLockedForEdit = false;
    selectedGameId = null;
    pendingImageData = null;
    pageContainer.classList.add('edit-mode');
    applyHostGroupLockUi();

    // Update UI for create mode
    if (editPanelTitle) editPanelTitle.textContent = 'Create Game';
    if (imagePanelTitle) imagePanelTitle.textContent = 'Game Image';
    if (saveBtn) saveBtn.textContent = 'Create';

    // Clear image panel
    if (gameImageLarge) {
      renderGameImageLarge(null);
    }

    // Clear edit form
    if (editTitle) editTitle.value = '';
    if (editDescription) editDescription.value = '';
    if (editRules) editRules.value = '';
    if (editTags) editTags.value = '';

    // Set group dropdown to selected group from modal
    setGroupDropdownValue(createGameData.groupId, createGameData.groupName);
    selectedGroupId = createGameData.groupId;

    // Reset timing to defaults: starts right now, runs 1 day, subs close 1h
    // before end. The user can drag the start backwards via the datetime
    // picker if they want to model a game that's already underway.
    timingState = {
      mode: 'deadline',
      startAt: Date.now(),
      duration: { weeks: 0, days: 1, hours: 0, mins: 0 },
      submission: { weeks: 0, days: 0, hours: 23, mins: 0 }
    };
    setTimingMode('deadline');
    setTimingWheelsFromState();

    gameModeState = 'arena';
    const arenaModeRadio = document.querySelector('input[name="gameType"][value="arena"]');
    if (arenaModeRadio) arenaModeRadio.checked = true;

    // Reset privacy to public
    const publicRadio = document.querySelector('input[name="editPrivacy"][value="public"]');
    if (publicRadio) publicRadio.checked = true;

    // Update timing preview
    updateTimingPreview();
  }

  // ===== Exit Edit Mode =====
  function exitEditMode(restoreEditContext = false) {
    endDiamondImageEditor();
    const context = restoreEditContext ? editReturnContext : null;
    const shouldReturnToGameFront = !!(context && context.type === 'game-front' && context.gameId);

    if (shouldReturnToGameFront) {
      if (pageContainer) pageContainer.classList.add('gf-transition-guard');
      const game = getGameById(context.gameId);
      if (game) {
        openGameFrontModal(context.gameId);
      }
      isEditMode = false;
      pageContainer.classList.remove('edit-mode');
      requestAnimationFrame(() => {
        if (pageContainer) pageContainer.classList.remove('gf-transition-guard');
      });
      editReturnContext = null;
      return;
    }

    isEditMode = false;
    hostGroupLockedForEdit = false;
    pageContainer.classList.remove('edit-mode');
    applyHostGroupLockUi();

    // If we have a selected game, show its preview
    if (selectedGameId && !shouldReturnToGameFront) {
      const game = getGameById(selectedGameId);
      if (game) {
        showGamePreview(game);
      }
    }

    editReturnContext = null;
  }

  // ===== Save Changes (handles both Edit and Create) =====
  async function saveChanges() {
    const title = editTitle ? editTitle.value.trim() : '';
    if (!title) {
      TOAST.error('Please enter a title');
      return;
    }

    const now = Date.now();
    const computedTimes = buildTimesFromNow(now);
    const gamesForValidation = isCreateMode ? [] : (STATE.get('games') || []);
    const originalForValidation = !isCreateMode && selectedGameId
      ? gamesForValidation.find((g) => g && g.id === selectedGameId)
      : null;
    const gameAlreadyStarted = !!(originalForValidation && originalForValidation.startTime && now >= originalForValidation.startTime);
    const submissionsAlreadyClosed = !!(
      originalForValidation &&
      originalForValidation.submissionCloseTime &&
      now >= originalForValidation.submissionCloseTime
    );
    const gameAlreadyEnded = !!(originalForValidation && originalForValidation.endTime && now >= originalForValidation.endTime);

    // Timing validation for deadline mode.
    //
    // New semantics: the user may explicitly set START to any moment in the
    // past (e.g. to model a game that's already underway), so we no longer
    // reject `startTime < now`. The remaining invariants still hold:
    //   start <= subs-close <= end
    // and the END must be in the future when creating a new game (otherwise
    // it would be created already-finished).
    if (timingState.mode === 'deadline') {
      const effectiveStartTime = gameAlreadyStarted
        ? (originalForValidation.startTime || computedTimes.startTime)
        : computedTimes.startTime;
      const effectiveSubmissionCloseTime = submissionsAlreadyClosed
        ? (originalForValidation.submissionCloseTime || computedTimes.submissionCloseTime)
        : computedTimes.submissionCloseTime;
      const effectiveEndTime = gameAlreadyEnded
        ? (originalForValidation.endTime || computedTimes.endTime)
        : computedTimes.endTime;

      if (effectiveStartTime > effectiveSubmissionCloseTime) {
        TOAST.error('Submissions must close at or after the game starts.');
        return;
      }
      if (effectiveSubmissionCloseTime > effectiveEndTime) {
        TOAST.error('Submissions must close at or before the game ends.');
        return;
      }
      if (isCreateMode && effectiveEndTime <= now) {
        TOAST.error('Game end time must be in the future. Increase "How Long".');
        return;
      }
    }

    showLoading();

    const activeProfile = getActiveProfile();
    const activeProfileId = activeProfile?.id || ESHU_DB.getValue('currentProfileId') || null;

    const privacyRadio = document.querySelector('input[name="editPrivacy"]:checked');

    if (isCreateMode) {
      // CREATE NEW GAME
      const newGame = {
        id: 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: title,
        description: editDescription ? editDescription.value.trim() : '',
        rules: editRules ? editRules.value.trim() : '',
        tags: editTags ? editTags.value.trim() : '',
        hostGroupId: createGameData.groupId,
        hostGroupName: createGameData.groupName,
        image: pendingImageData || null,
        privacy: privacyRadio ? privacyRadio.value : 'public',
        gameType: gameModeState,
        startTime: timingState.mode === 'infinite' ? now : computedTimes.startTime,
        submissionCloseTime: timingState.mode === 'infinite' ? null : computedTimes.submissionCloseTime,
        endTime: timingState.mode === 'infinite' ? null : computedTimes.endTime,
        // Wire-format compatibility shim: the server schema stores three
        // offset triples (start/submission/end) that used to be "offset from
        // now". With the new model, START is absolute (a timestamp) and END
        // is derived from start+duration, so we map: start=0, submission and
        // end equal to their durations-from-start. The canonical times are
        // already on startTime/submissionCloseTime/endTime above.
        timingOffsets: {
          start: { weeks: 0, days: 0, hours: 0, mins: 0 },
          submission: { ...timingState.submission },
          end: { ...timingState.duration }
        },
        timingMode: timingState.mode,
        status: 'active',
        createdAt: now,
        timingExtensions: [],
        memberProfileIds: activeProfileId ? [activeProfileId] : [],
        ownerProfileId: activeProfileId,
        ownerName: activeProfile?.name || 'Player',
        createdByProfileId: activeProfileId
      };

      // Server-authoritative create when remote mode is active: the response
      // is canonical, and refresh: true reconciles any side-effects (e.g.
      // GameMember rows for the owner). Falls back to local-only mutation
      // through the same helper so STATE and ESHU_DB never drift.
      let persistedGame = null;
      if (ESHU_SYNC.isRemote() && ESHU_API.games && typeof ESHU_API.games.create === 'function') {
        try {
          persistedGame = await ESHU_SYNC.mutate({
            entity: 'games',
            call: () => ESHU_API.games.create(newGame),
            pick: (resp) => {
              const serverGame = resp && resp.game ? resp.game : resp;
              // Server-issued id wins; merge in client fields the server may
              // not echo back (e.g. local-only flags). Update id on newGame so
              // downstream navigation uses the canonical id.
              return { ...newGame, ...serverGame };
            },
            refresh: true,
          });
          if (persistedGame && persistedGame.id) newGame.id = persistedGame.id;
        } catch (err) {
          console.warn('[createGame] server unavailable, falling back to local:', err);
        }
      }
      if (!persistedGame) {
        ESHU_SYNC.applyEntityResponse('games', newGame);
      }
      const awardResult = await ESHU_API.xp.awardSafe('game_created', newGame.id);
      STATE.set('xpPoints', awardResult.xpPoints);
      if (window.XP_ANIM && awardResult.delta > 0) XP_ANIM.show(awardResult.delta);

      hideLoading();
      TOAST.success('Game created!');
      runHype('GAME ON!');
      
      isCreateMode = false;
      const createdGameFrontUrl = buildGameFrontReturnUrl(newGame.id);
      if (createdGameFrontUrl) {
        window.location.href = createdGameFrontUrl;
        return;
      }

      exitEditMode();
    } else {
      // UPDATE EXISTING GAME
      if (!selectedGameId) {
        hideLoading();
        return;
      }

      const games = STATE.get('games') || [];
      const gameIndex = games.findIndex(g => g.id === selectedGameId);
      
      if (gameIndex === -1) {
        hideLoading();
        TOAST.error('Game not found');
        return;
      }

      const originalGame = games[gameIndex];
      if (originalGame.ownerProfileId && originalGame.ownerProfileId !== activeProfileId) {
        hideLoading();
        TOAST.error('Only the game owner can edit this game');
        return;
      }

      // Prevent editing the default game
      const DEFAULT_GAME_ID = 'game_default';
      if (selectedGameId === DEFAULT_GAME_ID) {
        hideLoading();
        TOAST.error('The default game cannot be edited');
        return;
      }

      const updatedGame = {
        ...originalGame,
        name: title,
        description: editDescription ? editDescription.value.trim() : '',
        rules: editRules ? editRules.value.trim() : '',
        tags: editTags ? editTags.value.trim() : '',
        privacy: privacyRadio ? privacyRadio.value : 'public',
        gameType: gameModeState,
        timingMode: timingState.mode,
        // Wire-format compatibility shim: the server schema stores three
        // offset triples (start/submission/end) that used to be "offset from
        // now". With the new model, START is absolute (a timestamp) and END
        // is derived from start+duration, so we map: start=0, submission and
        // end equal to their durations-from-start. The canonical times are
        // already on startTime/submissionCloseTime/endTime above.
        timingOffsets: {
          start: { weeks: 0, days: 0, hours: 0, mins: 0 },
          submission: { ...timingState.submission },
          end: { ...timingState.duration }
        },
        ownerProfileId: originalGame.ownerProfileId || activeProfileId,
        updatedByProfileId: activeProfileId
      };

      // Initialize timing extensions array if not present
      if (!updatedGame.timingExtensions) {
        updatedGame.timingExtensions = [];
      }

      // Set times based on timing mode and track extensions
      if (timingState.mode === 'infinite') {
        updatedGame.startTime = originalGame.startTime || now;
        updatedGame.submissionCloseTime = null;
        updatedGame.endTime = null;
      } else {
        const startedAtSave = !!(originalGame.startTime && now >= originalGame.startTime);
        const submissionsClosedAtSave = !!(
          originalGame.submissionCloseTime &&
          now >= originalGame.submissionCloseTime
        );

        updatedGame.startTime = startedAtSave
          ? (originalGame.startTime || computedTimes.startTime)
          : computedTimes.startTime;
        updatedGame.submissionCloseTime = submissionsClosedAtSave
          ? (originalGame.submissionCloseTime || computedTimes.submissionCloseTime)
          : computedTimes.submissionCloseTime;
        updatedGame.endTime = computedTimes.endTime;

        const trackedKeys = [
          { key: 'startTime', type: 'start_extended' },
          { key: 'submissionCloseTime', type: 'submission_extended' },
          { key: 'endTime', type: 'end_extended' }
        ];

        trackedKeys.forEach((item) => {
          const oldVal = originalGame[item.key];
          const newVal = updatedGame[item.key];
          if (oldVal && newVal && newVal > oldVal) {
            updatedGame.timingExtensions.push({
              type: item.type,
              originalTime: oldVal,
              newTime: newVal,
              extendedAt: now
            });
          }
        });
      }

      // Track if start time is in the future (scheduled game)
      if (updatedGame.startTime > now && !originalGame.startTime) {
        updatedGame.timingExtensions.push({
          type: 'future_start',
          scheduledFor: updatedGame.startTime,
          setAt: now
        });
      }

      // Host group is immutable after game creation
      if (!hostGroupLockedForEdit && selectedGroupId) {
        const groups = STATE.get('groups') || [];
        const selectedGroup = groups.find(g => g.id === selectedGroupId);
        if (selectedGroup) {
          updatedGame.hostGroupId = selectedGroup.id;
          updatedGame.hostGroupName = selectedGroup.name;
        }
      }

      // Update image if changed
      if (pendingImageData) {
        updatedGame.image = pendingImageData;
      }

      let persistedUpdate = null;
      if (ESHU_SYNC.isRemote() && ESHU_API.games && typeof ESHU_API.games.update === 'function') {
        try {
          persistedUpdate = await ESHU_SYNC.mutate({
            entity: 'games',
            call: () => ESHU_API.games.update(updatedGame.id, updatedGame),
            pick: (resp) => {
              const serverGame = resp && resp.game ? resp.game : resp;
              return { ...updatedGame, ...serverGame };
            },
            refresh: true,
          });
        } catch (err) {
          console.warn('[updateGame] server unavailable, falling back to local:', err);
        }
      }
      if (!persistedUpdate) {
        ESHU_SYNC.applyEntityResponse('games', updatedGame);
      }

      hideLoading();
      TOAST.success('Game saved!');
      
      exitEditMode();
    }
  }

  // ===== Delete Game =====
  async function deleteGame() {
    if (!selectedGameId) return;
    const activeProfileId = getActiveProfileId();
    const target = getGameById(selectedGameId);
    if (target?.ownerProfileId && target.ownerProfileId !== activeProfileId) {
      TOAST.error('Only the game owner can delete this game');
      return;
    }
    const yes = await MODAL.confirm({ title: 'Delete Game', message: 'Delete this game?', danger: true, confirmLabel: 'Delete' });
    if (!yes) return;

    const gameIdToDelete = selectedGameId;
    let serverHandled = false;
    if (ESHU_SYNC.isRemote() && ESHU_API.games && typeof ESHU_API.games.remove === 'function') {
      try {
        await ESHU_SYNC.mutate({
          entity: 'games',
          call: () => ESHU_API.games.remove(gameIdToDelete),
          removeIds: () => gameIdToDelete,
          refresh: true,
        });
        serverHandled = true;
      } catch (err) {
        console.warn('[deleteGame] server unavailable, falling back to local:', err);
      }
    }
    if (!serverHandled) {
      ESHU_SYNC.removeEntity('games', gameIdToDelete);
    }

    // Reset state
    selectedGameId = null;
    isEditMode = false;
    pageContainer.classList.remove('edit-mode');
    
    // Show empty state
    emptyState.style.display = 'flex';
    gamePreviewPanel.classList.remove('active');
    
    TOAST.success('Game deleted!');
  }

  // ===== Edit Game from List =====
  window.openGameCardOptions = function(gameId) {
    const games = STATE.get('games') || [];
    const game = games.find(g => g.id === gameId);
    if (!game) return;
    CARD_OPTIONS.open(game, 'game', getActiveProfileId(), () => {
      STATE.set('games', games);
    }, renderGamesList);
  };

  window.toggleGameLike = function(gameId, btnEl) {
    const games = STATE.get('games') || [];
    const game = games.find(g => g.id === gameId);
    if (!game) return;
    const activeProfileId = getActiveProfileId();
    game.likedBy = Array.isArray(game.likedBy) ? game.likedBy : [];
    const idx = game.likedBy.indexOf(activeProfileId);
    if (idx >= 0) { game.likedBy.splice(idx, 1); } else { game.likedBy.push(activeProfileId); }
    STATE.set('games', games);
    if (btnEl) {
      btnEl.classList.toggle('active', game.likedBy.includes(activeProfileId));
      const card = btnEl.closest('.u-card');
      if (card) { const ind = card.querySelector('.u-card-ind.liked'); if (ind) ind.classList.toggle('active', game.likedBy.includes(activeProfileId)); }
    }
  };

  window.toggleGameFollow = function(gameId, btnEl) {
    const games = STATE.get('games') || [];
    const game = games.find(g => g.id === gameId);
    if (!game) return;
    const activeProfileId = getActiveProfileId();
    game.followedBy = Array.isArray(game.followedBy) ? game.followedBy : [];
    const idx = game.followedBy.indexOf(activeProfileId);
    if (idx >= 0) { game.followedBy.splice(idx, 1); } else { game.followedBy.push(activeProfileId); }
    STATE.set('games', games);
    if (btnEl) {
      btnEl.classList.toggle('active', game.followedBy.includes(activeProfileId));
      const card = btnEl.closest('.u-card');
      if (card) { const ind = card.querySelector('.u-card-ind.followed'); if (ind) ind.classList.toggle('active', game.followedBy.includes(activeProfileId)); }
    }
  };

  window.joinGame = function(gameId) {
    const games = STATE.get('games') || [];
    const idx = games.findIndex(g => g.id === gameId);
    const activeProfileId = getActiveProfileId();
    if (idx === -1) {
      TOAST.error('Game not found');
      return;
    }
    if (!activeProfileId) {
      TOAST.error('Select a player profile first');
      return;
    }

    const game = games[idx];
    if (game.privacy === 'private') {
      TOAST.error('This is a private game. You need an invite.');
      return;
    }

    const memberProfileIds = getGameMembers(game);
    if (!memberProfileIds.includes(activeProfileId)) {
      memberProfileIds.push(activeProfileId);
    }

    const updatedGame = {
      ...game,
      memberProfileIds,
      updatedByProfileId: activeProfileId
    };

    const next = [...games];
    next[idx] = updatedGame;
    STATE.set('games', next);
    TOAST.success('Joined game');
  };

  window.editGameFromList = function(gameId) {
    const game = getGameById(gameId);
    const activeProfileId = getActiveProfileId();
    if (game?.ownerProfileId && game.ownerProfileId !== activeProfileId) {
      TOAST.error('Only the game owner can edit this game');
      return;
    }
    selectGame(gameId);
    setTimeout(() => enterEditMode(), 100);
  };

  // ===== Clear Game (set to deleted - shows Boot/Delete buttons) =====
  window.clearGame = function(gameId) {
    const games = STATE.get('games') || [];
    const gameIndex = games.findIndex(g => g.id === gameId);
    if (gameIndex === -1) return;
    const activeProfileId = getActiveProfileId();
    if (games[gameIndex].ownerProfileId && games[gameIndex].ownerProfileId !== activeProfileId) {
      TOAST.error('Only the game owner can clear this game');
      return;
    }

    const game = games[gameIndex];
    const updatedGame = { ...game, status: 'deleted' };
    const newGames = [...games];
    newGames[gameIndex] = updatedGame;
    STATE.set('games', newGames);

    // Cascade: also boot active creations in this game
    const creations = STATE.get('creations') || [];
    const newCreations = creations.map(c => {
      if ((c.gameId || c.hostGameId) === gameId && c.status !== 'burned' && c.status !== 'deleted') {
        return { ...c, status: 'deleted' };
      }
      return c;
    });
    STATE.set('creations', newCreations);

    TOAST.info('Game cleared - Boot to restore or Delete permanently');
  };

  // ===== Boot Game (restore from deleted) =====
  window.bootGame = function(gameId) {
    const games = STATE.get('games') || [];
    const gameIndex = games.findIndex(g => g.id === gameId);
    if (gameIndex === -1) return;
    const activeProfileId = getActiveProfileId();
    if (games[gameIndex].ownerProfileId && games[gameIndex].ownerProfileId !== activeProfileId) {
      TOAST.error('Only the game owner can boot this game');
      return;
    }

    const game = games[gameIndex];
    const updatedGame = { ...game, status: 'active' };
    const newGames = [...games];
    newGames[gameIndex] = updatedGame;
    STATE.set('games', newGames);

    // Cascade: also restore deleted creations in this game
    const creations = STATE.get('creations') || [];
    const newCreations = creations.map(c => {
      if ((c.gameId || c.hostGameId) === gameId && c.status === 'deleted') {
        return { ...c, status: 'active' };
      }
      return c;
    });
    STATE.set('creations', newCreations);

    TOAST.success('Game restored!');
  };

  // ===== Burn Game (permanent delete state) =====
  window.burnGame = function(gameId) {
    const games = STATE.get('games') || [];
    const gameIndex = games.findIndex(g => g.id === gameId);
    if (gameIndex === -1) return;
    const activeProfileId = getActiveProfileId();
    if (games[gameIndex].ownerProfileId && games[gameIndex].ownerProfileId !== activeProfileId) {
      TOAST.error('Only the game owner can burn this game');
      return;
    }

    const game = games[gameIndex];
    const updatedGame = { ...game, status: 'burned' };
    const newGames = [...games];
    newGames[gameIndex] = updatedGame;
    STATE.set('games', newGames);

    // Cascade: also burn creations in this game
    const creations = STATE.get('creations') || [];
    const newCreations = creations.map(c => {
      if ((c.gameId || c.hostGameId) === gameId && c.status !== 'burned') {
        return { ...c, status: 'burned' };
      }
      return c;
    });
    STATE.set('creations', newCreations);

    // If this was the selected game, clear selection
    if (selectedGameId === gameId) {
      selectedGameId = null;
      emptyState.style.display = 'flex';
      gamePreviewPanel.classList.remove('active');
    }

    TOAST.error('Game burned!');
  };

  // ===== Timing Preview =====
  // Format a duration triple {weeks,days,hours,mins} into a compact label.
  // Empty units collapse so '0 wks 0 days 3 hrs 0 mins' renders as '3h'.
  function formatDurationOffset(offset) {
    if (!offset) return '\u2014';
    const parts = [];
    if (offset.weeks) parts.push(`${offset.weeks}w`);
    if (offset.days) parts.push(`${offset.days}d`);
    if (offset.hours) parts.push(`${offset.hours}h`);
    if (offset.mins) parts.push(`${offset.mins}m`);
    return parts.length ? parts.join(' ') : '0m';
  }

  function updateTimingPreview() {
    const now = Date.now();
    const { startTime, submissionCloseTime, endTime } = buildTimesFromNow(now);

    const formatTime = (ts) => {
      const d = new Date(ts);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    const previewStartTime = document.getElementById('previewStartTime');
    const previewDurationTime = document.getElementById('previewDurationTime');
    const previewSubTime = document.getElementById('previewSubTime');
    const previewEndTime = document.getElementById('previewEndTime');
    const endReadout = document.getElementById('endDatetimeReadout');
    const endCountdown = document.getElementById('endCountdownReadout');
    const extensionNote = document.getElementById('timingExtensionNote');

    if (previewStartTime) previewStartTime.textContent = formatTime(startTime);
    if (previewDurationTime) previewDurationTime.textContent = formatDurationOffset(timingState.duration);
    if (previewSubTime) previewSubTime.textContent = formatTime(submissionCloseTime);
    if (previewEndTime) previewEndTime.textContent = formatTime(endTime);

    // End row read-only readout: absolute datetime + countdown from now.
    if (endReadout) endReadout.textContent = formatTime(endTime);
    if (endCountdown) {
      const delta = endTime - now;
      endCountdown.textContent = delta > 0
        ? `ends in ${formatCountdown(delta)}`
        : `ended ${formatCountdown(-delta)} ago`;
    }

    if (extensionNote) {
      if (isEditMode && !isCreateMode) {
        extensionNote.style.display = 'block';
        extensionNote.textContent = 'If any time is moved later and saved, this game is marked as extended.';
      } else {
        extensionNote.style.display = 'none';
      }
    }
  }

  // ===== CREATE GAME MODAL (Group Selection Only) =====
  let createModal, createModalClose, createCancelBtn, createNextBtn;
  let createGroupList;
  let createGroupSearch;
  let createGroupSearchQuery = '';
  let playModal, playModalClose, playCancelBtn, playGameList, playGameSearch, playGameVotesFilter;
  let tempSelectedGroup = { id: null, name: null };

  function initCreateModal() {
    createModal = document.getElementById('createGameModal');
    createModalClose = document.getElementById('createModalClose');
    createCancelBtn = document.getElementById('createCancelBtn');
    createNextBtn = document.getElementById('createNextBtn');
    createGroupList = document.getElementById('createGroupList');
    createGroupSearch = document.getElementById('createGroupSearch');

    // Create Game button click
    const createGameBtn = document.getElementById('createGameBtn');
    if (createGameBtn) {
      createGameBtn.addEventListener('click', openCreateModal);
    }

    // Modal close buttons
    if (createModalClose) createModalClose.addEventListener('click', closeCreateModal);
    if (createCancelBtn) createCancelBtn.addEventListener('click', closeCreateModal);
    if (createNextBtn) createNextBtn.addEventListener('click', handleGroupSelected);
    if (createGroupSearch) {
      createGroupSearch.addEventListener('input', () => {
        createGroupSearchQuery = createGroupSearch.value.trim().toLowerCase();
        renderCreateGroupList();
      });
    }
    if (createModal) {
      createModal.addEventListener('click', (event) => {
        if (event.target === createModal) closeCreateModal();
      });
    }
  }

  // Resolve the "best guess" host group without letting the onboarding group
  // trap later game creation. Explicit context wins, then a non-default
  // primary group, then the only available non-default group.
  function resolveDefaultHostGroup(activeProfileId) {
    if (!activeProfileId) return null;
    const groups = (STATE.get('groups') || []).filter((g) => {
      if (!g || typeof g !== 'object') return false;
      if (g.status === 'deleted' || g.status === 'burned') return false;
      return isGroupMember(g, activeProfileId);
    });
    if (!groups.length) return null;
    const nonDefaultGroups = groups.filter((g) => !isDefaultGroup(g));

    const pickById = (id) => groups.find((g) => g && g.id === id) || null;

    if (sourceGroupContextId) {
      const ctx = pickById(sourceGroupContextId);
      if (ctx) return { id: ctx.id, name: ctx.name };
    }

    let primaryMap = null;
    try {
      primaryMap = ESHU_DB.getValue ? ESHU_DB.getValue('primaryGroupByProfileId') : null;
    } catch (_) { /* ignore */ }
    const primaryId = primaryMap && typeof primaryMap === 'object' ? primaryMap[activeProfileId] : null;
    if (primaryId) {
      const primary = pickById(primaryId);
      if (primary && (!isDefaultGroup(primary) || nonDefaultGroups.length === 0)) {
        return { id: primary.id, name: primary.name };
      }
    }

    if (nonDefaultGroups.length === 1) {
      return { id: nonDefaultGroups[0].id, name: nonDefaultGroups[0].name };
    }
    if (groups.length === 1) {
      return { id: groups[0].id, name: groups[0].name };
    }
    return null;
  }

  function openCreateModal() {
    rehydrateFromStorage();
    const activeProfileId = getActiveProfileId();
    if (!hasJoinedAnyGroup(activeProfileId)) {
      redirectToGroupSetupForCreate(activeProfileId);
      return;
    }

    // Auto-populate the host group based on active context. The user can
    // still change it via the modal's group list before confirming.
    const preselected = resolveDefaultHostGroup(activeProfileId);
    tempSelectedGroup = preselected
      ? { id: preselected.id, name: preselected.name }
      : { id: null, name: null };
    createGroupSearchQuery = '';
    if (createGroupSearch) createGroupSearch.value = '';

    // Populate groups
    renderCreateGroupList();

    // Show modal
    createModal.classList.add('active');
  }

  function closeCreateModal() {
    createModal.classList.remove('active');
  }

  function handleGroupSelected() {
    if (!tempSelectedGroup.id) {
      TOAST.error('Please select a group to host your game');
      return;
    }

    // Store selected group for create mode
    createGameData.groupId = tempSelectedGroup.id;
    createGameData.groupName = tempSelectedGroup.name;

    // Close modal and enter create mode (uses same edit panel)
    closeCreateModal();
    // Also close Game Front modal if open, so the create form is visible
    closeGameFrontModal();
    enterCreateMode();
  }

  function renderCreateGroupList() {
    const groups = STATE.get('groups') || [];
    const activeProfileId = getActiveProfileId();
    let activeGroups = groups.filter(g => {
      const active = g.status !== 'deleted' && g.status !== 'burned';
      return active && isGroupMember(g, activeProfileId);
    });

    if (createGroupSearchQuery) {
      activeGroups = activeGroups.filter(group => (group.name || '').toLowerCase().includes(createGroupSearchQuery));
    }
    activeGroups.sort((a, b) => {
      if (isDefaultGroup(a) && !isDefaultGroup(b)) return 1;
      if (!isDefaultGroup(a) && isDefaultGroup(b)) return -1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    if (activeGroups.length === 0) {
      createGroupList.innerHTML = createGroupSearchQuery
        ? '<div style="padding:20px;text-align:center;color:#888;">No groups match your search.</div>'
        : '<div style="padding:20px;text-align:center;color:#888;">No groups available. Create a group first.</div>';
      return;
    }

    createGroupList.innerHTML = activeGroups.map(group => `
      <div class="group-list-item ${tempSelectedGroup.id === group.id ? 'selected' : ''}" data-id="${group.id}" data-name="${group.name}">
        <div class="group-icon"></div>
        <span class="group-name">${group.name}</span>
        <span class="check-mark">✓</span>
      </div>
    `).join('');

    // Add click handlers
    createGroupList.querySelectorAll('.group-list-item').forEach(item => {
      item.addEventListener('click', () => {
        tempSelectedGroup.id = item.dataset.id;
        tempSelectedGroup.name = item.dataset.name;
        
        // Update selection UI
        createGroupList.querySelectorAll('.group-list-item').forEach(i => {
          i.classList.toggle('selected', i.dataset.id === tempSelectedGroup.id);
        });
      });
    });
  }

  // ===== Check URL for auto-open actions =====
  function checkUrlActions() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const groupId = urlParams.get('groupId');
    const view = urlParams.get('view');
    const gameId = urlParams.get('gameId');
    const sourceGroupId = urlParams.get('sourceGroupId');

    sourceGroupContextId = sourceGroupId || groupId || null;
    applySourceGroupContext();
    
    if (action === 'create') {
      const groups = STATE.get('groups') || [];
      const activeProfileId = getActiveProfileId();

      if (!hasJoinedAnyGroup(activeProfileId)) {
        redirectToGroupSetupForCreate(activeProfileId);
        return;
      }

      const targetGroup = groupId
        ? groups.find(g => g.id === groupId && g.status !== 'deleted' && g.status !== 'burned' && isGroupMember(g, activeProfileId))
        : null;

      if (targetGroup) {
        createGameData.groupId = targetGroup.id;
        createGameData.groupName = targetGroup.name;
        tempSelectedGroup = { id: targetGroup.id, name: targetGroup.name };
        enterCreateMode();
      } else {
        // Auto-open the Create Game modal
        openCreateModal();
      }

      // Clean up URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (action === 'play') {
      openPlayModal();
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if ((view === 'front' || action === 'view-front') && gameId) {
      const game = getGameById(gameId);
      if (game) {
        openGameFrontModal(gameId);
        if (urlParams.get('onboarding') === 'joined' && gameId === 'game_default' && typeof TOAST !== 'undefined') {
          TOAST.success('Default Game unlocked. Upload here, or use Create Game to make your own. After one upload, Comments unlock.');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        return true;
      }
      return false;
    }
    return true;
  }

  // ===== Start =====
  function retryOpenGameFrontFromUrl(gameId, attemptsLeft = 12) {
    if (!gameId) return;
    try { rehydrateFromStorage(); } catch {}
    const game = getGameById(gameId);
    if (game) {
      openGameFrontModal(gameId);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (attemptsLeft <= 0) return;
    setTimeout(() => retryOpenGameFrontFromUrl(gameId, attemptsLeft - 1), 250);
  }

  function runUrlActionsWhenReady() {
    const remoteEnabled = !!(window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());
    const remoteReady = !remoteEnabled || !!window.ESHU_AUTH;
    if (remoteReady) {
      try {
        const opened = checkUrlActions();
        const params = new URLSearchParams(window.location.search);
        const isFront = params.get('view') === 'front' || params.get('action') === 'view-front';
        if (opened === false && isFront) retryOpenGameFrontFromUrl(params.get('gameId'));
      } catch(e) { console.error('checkUrlActions error:', e); }
      return;
    }
    // Remote mode active but driver hasn't pulled /api/sync yet. Wait for
    // activation so gates (e.g. ?action=create) see the canonical snapshot
    // and don't fire spurious "join a group first" toasts on fresh accounts.
    const onActivated = () => {
      window.removeEventListener('eshu:remote-activated', onActivated);
      try { rehydrateFromStorage(); } catch {}
      try {
        const opened = checkUrlActions();
        const params = new URLSearchParams(window.location.search);
        const isFront = params.get('view') === 'front' || params.get('action') === 'view-front';
        if (opened === false && isFront) retryOpenGameFrontFromUrl(params.get('gameId'));
      } catch(e) { console.error('checkUrlActions error:', e); }
    };
    window.addEventListener('eshu:remote-activated', onActivated, { once: true });
    // Safety net: if activation never fires (offline / unauthenticated), still
    // run the URL action after a short delay so navigation flows don't hang.
    setTimeout(() => {
      if (!window.ESHU_AUTH) {
        window.removeEventListener('eshu:remote-activated', onActivated);
        try {
          const opened = checkUrlActions();
          const params = new URLSearchParams(window.location.search);
          const isFront = params.get('view') === 'front' || params.get('action') === 'view-front';
          if (opened === false && isFront) retryOpenGameFrontFromUrl(params.get('gameId'));
        } catch(e) { console.error('checkUrlActions error:', e); }
      }
    }, 5000);
  }

  function boot() {
    try { init(); } catch(e) { console.error('games init error:', e); }
    try { initCreateModal(); } catch(e) { console.error('initCreateModal error:', e); }
    try { initPlayModal(); } catch(e) { console.error('initPlayModal error:', e); }
    try { initGameFrontModal(); } catch(e) { console.error('initGameFrontModal error:', e); }
    runUrlActionsWhenReady();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
