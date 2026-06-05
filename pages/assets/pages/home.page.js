(function () {
  'use strict';

  // ===== Initialize DB =====
  ESHU_DB.ensure();

  // ===== Data =====
  const DEFAULT_GROUP_ID = 'group_default';
  let groups = [];
  let games = [];
  let creations = [];
  let globalComments = JSON.parse(localStorage.getItem('comments')) || [];
  let comments = [];
  let likedItems = [];
  let followedItems = [];
  let playerbaseProfiles = [];
  const playerbaseProfilesById = new Map();
  const publicProfileContentById = new Map();
  const publicProfileContentLoading = new Set();

  // ===== DOM Elements =====
  const xpCounter = document.getElementById('xpCounter');
  const mainContainer = document.getElementById('mainContainer');
  const profileNameNav = document.getElementById('profileNameNav');
  const profileBtn = document.getElementById('profileBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const profileDisplayName = document.getElementById('profileDisplayName');
  const profileNameLarge = document.getElementById('profileNameLarge');
  const profileViewMode = document.getElementById('profileViewMode');
  const runtime = window.ESHU_RUNTIME;

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  let ownPlayerbaseProfileId = null;

  function getOwnedActiveProfileId() {
    const active = getActiveProfile();
    return active?.id || ESHU_DB.getValue('currentProfileId') || null;
  }

  function isOwnProfileId(id) {
    if (!id) return false;
    if (id === getOwnedActiveProfileId()) return true;
    if (ownPlayerbaseProfileId && id === ownPlayerbaseProfileId) return true;
    return false;
  }

  function isReadOnlyProfileView() {
    if (!selectedProfileId) return false;
    return !isOwnProfileId(selectedProfileId);
  }

  function getEquivalentProfileIds(profileId) {
    const ids = new Set();
    if (profileId) ids.add(profileId);
    if (profileId && isOwnProfileId(profileId)) {
      const ownActiveId = getOwnedActiveProfileId();
      if (ownActiveId) ids.add(ownActiveId);
      if (ownPlayerbaseProfileId) ids.add(ownPlayerbaseProfileId);
    }
    return Array.from(ids);
  }

  function idsMatchProfile(candidateId, profileId) {
    if (!candidateId || !profileId) return false;
    const eq = getEquivalentProfileIds(profileId);
    return eq.includes(candidateId);
  }

  function listIncludesProfile(list, profileId) {
    if (!Array.isArray(list) || !profileId) return false;
    const eq = getEquivalentProfileIds(profileId);
    return eq.some((id) => list.includes(id));
  }

  function resetToOwnProfile() {
    const ownId = getOwnedActiveProfileId();
    if (!ownId) return;
    selectedProfileId = ownId;
    currentTab = 'player';
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === currentTab));
    updateSidebarActiveState();
    renderProfilePanel();
    renderCurrentTab();
    if (typeof TOAST !== 'undefined') {
      TOAST.success('Returned to your profile');
    }
  }

  function getSelectedProfileView() {
    const ownProfiles = getProfiles();
    const ownProfile = ownProfiles.find((p) => p.id === selectedProfileId);
    const playerbaseProfile = playerbaseProfilesById.get(selectedProfileId) || null;
    if (ownProfile) {
      // Merge playerbase fields when local profile is missing display data
      // (e.g. image hasn't roundtripped through sync yet). Local takes
      // precedence when populated so unsaved edits aren't clobbered.
      if (playerbaseProfile) {
        return {
          ...playerbaseProfile,
          ...ownProfile,
          image: playerbaseProfile.image || ownProfile.image || null,
          name: ownProfile.name || playerbaseProfile.name,
          description: ownProfile.description || playerbaseProfile.description,
        };
      }
      return ownProfile;
    }
    return playerbaseProfile;
  }

  function normalizePlayerbaseProfile(profile) {
    if (!profile || !profile.id) return null;
    return {
      id: profile.id,
      userId: profile.userId || null,
      name: profile.name || 'Player',
      description: profile.description || '',
      image: profile.image || null,
      xpPoints: Number.isFinite(Number(profile.xpPoints)) ? Number(profile.xpPoints) : 0,
      stats: {
        groups: Number(profile?.stats?.groups) || 0,
        games: Number(profile?.stats?.games) || 0,
        creations: Number(profile?.stats?.creations) || 0,
      },
      updatedAt: profile.updatedAt || null,
    };
  }

  function upsertPlayerbaseProfiles(rows) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const profile = normalizePlayerbaseProfile(row);
      if (!profile || seen.has(profile.id)) return;
      seen.add(profile.id);
      normalized.push(profile);
    });

    const own = getActiveProfile();
    const ownUserId = window.ESHU_AUTH?.user?.id || null;
    if (own) {
      const existingIdx = normalized.findIndex((p) =>
        (ownUserId && p.userId === ownUserId) || p.id === own.id
      );
      if (existingIdx >= 0) {
        const [existing] = normalized.splice(existingIdx, 1);
        const mergedOwn = {
          ...existing,
          ...own,
          id: existing.id,
          userId: existing.userId || ownUserId,
          name: runtime?.getEffectiveProfileName?.(own) || existing.name || 'Player',
          description: own.description || existing.description || '',
          image: existing.image || own.image || null,
          xpPoints: Number.isFinite(Number(existing.xpPoints)) ? Number(existing.xpPoints) : Number(own.xpPoints) || 0,
          stats: existing.stats || { groups: 0, games: 0, creations: 0 },
          updatedAt: existing.updatedAt || own.updatedAt || null,
        };
        normalized.unshift(mergedOwn);
        ownPlayerbaseProfileId = existing.id;
        if (!selectedProfileId || selectedProfileId === own.id) {
          selectedProfileId = existing.id;
        }
      } else {
        normalized.unshift({
          id: own.id,
          userId: ownUserId,
          name: runtime?.getEffectiveProfileName?.(own) || 'Player',
          description: own.description || '',
          image: own.image || null,
          xpPoints: Number(ESHU_DB.getProfileXp(own.id) || 0),
          stats: { groups: 0, games: 0, creations: 0 },
          updatedAt: null,
        });
      }
    }

    playerbaseProfiles = normalized;
    playerbaseProfilesById.clear();
    normalized.forEach((profile) => {
      playerbaseProfilesById.set(profile.id, profile);
    });
  }

  async function loadPlayerbaseProfiles() {
    if (!window.ESHU_API?.profiles?.playerbase) return;
    try {
      const response = await window.ESHU_API.profiles.playerbase(120);
      upsertPlayerbaseProfiles(response?.profiles || []);
      if (!selectedProfileId && playerbaseProfiles.length > 0) {
        selectedProfileId = playerbaseProfiles[0].id;
      }
      renderAvatarSidebar();
      renderProfilePanel();
      renderCurrentTab();
    } catch (err) {
      console.warn('[home] playerbase fetch failed:', err?.message || err);
    }
  }

  async function loadPublicProfileContent(profileId) {
    if (!profileId || isOwnProfileId(profileId)) return;
    if (publicProfileContentById.has(profileId) || publicProfileContentLoading.has(profileId)) return;
    if (!window.ESHU_API?.profiles?.publicContent) return;
    publicProfileContentLoading.add(profileId);
    try {
      const response = await window.ESHU_API.profiles.publicContent(profileId);
      publicProfileContentById.set(profileId, {
        profile: response?.profile || null,
        groups: Array.isArray(response?.groups) ? response.groups : [],
        games: Array.isArray(response?.games) ? response.games : [],
        creations: Array.isArray(response?.creations) ? response.creations : [],
      });
      renderProfilePanel();
      renderCurrentTab();
    } catch (err) {
      console.warn('[home] public profile content fetch failed:', err?.message || err);
    } finally {
      publicProfileContentLoading.delete(profileId);
    }
  }

  function canManageEntity(entity) {
    if (!entity || typeof entity !== 'object') return false;
    const activeProfileId = getOwnedActiveProfileId();
    const ownerId = entity.ownerProfileId || entity.createdByProfileId || entity.authorProfileId || entity.authorId || null;
    return !ownerId || ownerId === activeProfileId;
  }

  function getCreationVoteCount(creation) {
    if (!creation || typeof creation !== 'object') return 0;
    const parsedVotes = Number(creation.votes);
    if (Number.isFinite(parsedVotes)) return parsedVotes;
    const likedBy = Array.isArray(creation.likedBy) ? creation.likedBy : [];
    return likedBy.length;
  }

  function toggleCreationLike(creation, badgeElement) {
    if (!creation || !creation.id) return;
    const profileId = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;
    if (!profileId) return;

    const creations = ESHU_DB.getTable('creations') || [];
    const idx = creations.findIndex(c => c && c.id === creation.id);
    if (idx === -1) return;

    const current = creations[idx];
    const likedBy = Array.isArray(current.likedBy) ? [...current.likedBy] : [];
    const likeIdx = likedBy.indexOf(profileId);

    if (likeIdx === -1) {
      likedBy.push(profileId);
      badgeElement.classList.add('active');
      badgeElement.title = 'Liked';
      if (typeof TOAST !== 'undefined') TOAST.success('Creation liked');
    } else {
      likedBy.splice(likeIdx, 1);
      badgeElement.classList.remove('active');
      badgeElement.title = 'Not liked';
      if (typeof TOAST !== 'undefined') TOAST.info('Creation unliked');
    }

    creations[idx] = { ...current, likedBy };
    ESHU_DB.setTable('creations', creations);
  }

  function toggleCreationFollow(creation, badgeElement) {
    if (!creation || !creation.id) return;
    const profileId = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;
    if (!profileId) return;

    const creations = ESHU_DB.getTable('creations') || [];
    const idx = creations.findIndex(c => c && c.id === creation.id);
    if (idx === -1) return;

    const current = creations[idx];
    const followedBy = Array.isArray(current.followedBy) ? [...current.followedBy] : [];
    const followIdx = followedBy.indexOf(profileId);

    if (followIdx === -1) {
      followedBy.push(profileId);
      badgeElement.classList.add('active');
      badgeElement.title = 'Followed';
      if (typeof TOAST !== 'undefined') TOAST.success('Now following creation');
    } else {
      followedBy.splice(followIdx, 1);
      badgeElement.classList.remove('active');
      badgeElement.title = 'Not followed';
      if (typeof TOAST !== 'undefined') TOAST.info('Unfollowed creation');
    }

    creations[idx] = { ...current, followedBy };
    ESHU_DB.setTable('creations', creations);
  }

  function updateEntityStatus(tableName, entityId, nextStatus) {
    const list = ESHU_DB.getTable(tableName) || [];
    const idx = list.findIndex(item => item && item.id === entityId);
    if (idx === -1) return false;
    if (!canManageEntity(list[idx])) return false;
    const next = [...list];
    next[idx] = { ...next[idx], status: nextStatus };
    ESHU_DB.setTable(tableName, next);
    return true;
  }

  function updateCommentStatus(comment, nextStatus) {
    if (!comment || !canManageEntity(comment)) return false;
    if (comment._source === 'global') {
      const arr = JSON.parse(localStorage.getItem('comments') || '[]');
      const idx = comment._index;
      if (!Array.isArray(arr) || idx == null || idx < 0 || idx >= arr.length) return false;
      const current = arr[idx];
      const nextObj = (current && typeof current === 'object')
        ? { ...current, status: nextStatus }
        : { text: String(current || ''), status: nextStatus, authorProfileId: selectedProfileId || null, timestamp: Date.now() };
      arr[idx] = nextObj;
      localStorage.setItem('comments', JSON.stringify(arr));
      return true;
    }
    if (comment._source === 'thread' && comment._threadKey) {
      const arr = JSON.parse(localStorage.getItem(comment._threadKey) || '[]');
      const idx = comment._index;
      if (!Array.isArray(arr) || idx == null || idx < 0 || idx >= arr.length) return false;
      const current = arr[idx];
      const nextObj = (current && typeof current === 'object')
        ? { ...current, status: nextStatus }
        : { text: String(current || ''), status: nextStatus, authorProfileId: selectedProfileId || null, timestamp: Date.now() };
      arr[idx] = nextObj;
      localStorage.setItem(comment._threadKey, JSON.stringify(arr));
      return true;
    }
    return false;
  }

  function rerenderHomePanels() {
    refreshState();
    upsertPlayerbaseProfiles(playerbaseProfiles);
    sidebarBuiltIds = [];
    renderAvatarSidebar();
    renderProfilePanel();
    renderCurrentTab();
    renderFollowedPanel();
  }

  window.homeClearCreation = function (creationId) {
    if (!updateEntityStatus('creations', creationId, 'deleted')) return;
    rerenderHomePanels();
  };

  window.homeBootCreation = function (creationId) {
    if (!updateEntityStatus('creations', creationId, 'active')) return;
    rerenderHomePanels();
  };

  window.homeBurnCreation = async function (creationId) {
    const yes = await MODAL.confirm({ title: 'Burn Creation', message: 'Delete (burn) this creation permanently?', danger: true, confirmLabel: 'Burn' });
    if (!yes) return;
    if (!updateEntityStatus('creations', creationId, 'burned')) return;
    rerenderHomePanels();
  };

  window.homeClearGroup = function (groupId) {
    if (!updateEntityStatus('groups', groupId, 'deleted')) return;
    rerenderHomePanels();
  };

  window.homeBootGroup = function (groupId) {
    if (!updateEntityStatus('groups', groupId, 'active')) return;
    rerenderHomePanels();
  };

  window.homeBurnGroup = async function (groupId) {
    const yes = await MODAL.confirm({ title: 'Burn Group', message: 'Delete (burn) this group permanently?', danger: true, confirmLabel: 'Burn' });
    if (!yes) return;
    if (!updateEntityStatus('groups', groupId, 'burned')) return;
    rerenderHomePanels();
  };

  window.homeClearGame = function (gameId) {
    if (!updateEntityStatus('games', gameId, 'deleted')) return;
    rerenderHomePanels();
  };

  window.homeBootGame = function (gameId) {
    if (!updateEntityStatus('games', gameId, 'active')) return;
    rerenderHomePanels();
  };

  window.homeBurnGame = async function (gameId) {
    const yes = await MODAL.confirm({ title: 'Burn Game', message: 'Delete (burn) this game permanently?', danger: true, confirmLabel: 'Burn' });
    if (!yes) return;
    if (!updateEntityStatus('games', gameId, 'burned')) return;
    rerenderHomePanels();
  };

  window.homeClearComment = function (commentId) {
    const scoped = comments.find(c => c.id === commentId);
    if (!scoped) return;
    if (!updateCommentStatus(scoped, 'deleted')) return;
    rerenderHomePanels();
  };

  window.homeBootComment = function (commentId) {
    const scoped = comments.find(c => c.id === commentId);
    if (!scoped) return;
    if (!updateCommentStatus(scoped, 'active')) return;
    rerenderHomePanels();
  };

  window.homeBurnComment = async function (commentId) {
    const scoped = comments.find(c => c.id === commentId);
    if (!scoped) return;
    const yes = await MODAL.confirm({ title: 'Burn Comment', message: 'Delete (burn) this comment permanently?', danger: true, confirmLabel: 'Burn' });
    if (!yes) return;
    if (!updateCommentStatus(scoped, 'burned')) return;
    rerenderHomePanels();
  };

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function syncLegacyProfileValues(profile) {
    const effective = profile || { name: 'Player', description: '', image: null };
    const name = runtime?.getEffectiveProfileName?.(effective) || 'Player';
    ESHU_DB.setValue('profileName', name);
    ESHU_DB.setValue('profileDesc', effective.description || '');
    ESHU_DB.setValue('userProfile', {
      name,
      image: effective.image || null
    });
  }

  // Nav profile display
  function updateNavProfile() {
    const active = getActiveProfile();
    const name = runtime?.getEffectiveProfileName?.(active) || 'Player';
    if (profileNameNav) profileNameNav.textContent = name;
    if (profileBtn) {
      if (active?.image) {
        profileBtn.innerHTML = `<img src="${active.image}" alt="${name}">`;
      } else {
        profileBtn.innerHTML = '';
      }
    }
  }
  updateNavProfile();

  // Profile button
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
  }

  const profileXP = document.getElementById('profileXP');
  const profileStats = document.querySelector('.profile-stats');
  const creationCountEl = document.getElementById('creationCount');
  const commentCountEl = document.getElementById('commentCount');
  const profileBioText = document.getElementById('profileBioText');
  const profileBadges = document.getElementById('profileBadges');
  const primaryGroupCard = document.getElementById('primaryGroupCard');
  const primaryGroupName = document.getElementById('primaryGroupName');
  const primaryGroupMeta = document.getElementById('primaryGroupMeta');
  const noGroupText = document.getElementById('noGroupText');

  const playerGrid = document.getElementById('playerGrid');
  const groupsGrid = document.getElementById('groupsGrid');
  const gamesGrid = document.getElementById('gamesGrid');
  const creationsGrid = document.getElementById('creationsGrid');
  const commentsList = document.getElementById('commentsList');
  const likesGrid = document.getElementById('likesGrid');
  const followsGrid = document.getElementById('followsGrid');

  const tabButtons = document.querySelectorAll('.tab-btn');
  let currentTab = 'player';

  // Award top 3 creations for any ended game that hasn't been awarded yet.
  // Prefer server-authoritative finalization; fall back to local logic when
  // running offline / local-only. Re-entry is locked SYNCHRONOUSLY (via
  // game._awardsGranted + localStorage flag) before any async work, so
  // overlapping ticker calls still cannot double-award.
  async function scanAndAwardEndedGames() {
    const allGames = ESHU_DB.getTable('games') || [];
    const allCreations = ESHU_DB.getTable('creations') || [];
    const now = Date.now();
    const remoteMode = !!(window.ESHU_API && window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());
    const awardXpMap = { 1: 5, 2: 4, 3: 3 };

    // Snapshot the candidates synchronously and lock them all before
    // releasing control to the event loop.
    const candidates = [];
    for (const game of allGames) {
      if (!game || !game.id || !game.endTime) continue;
      if (now < game.endTime) continue;
      if (game._awardsGranted) continue;
      const awardKey = `_awards_granted_${game.id}`;
      if (localStorage.getItem(awardKey)) { game._awardsGranted = true; continue; }
      game._awardsGranted = true;
      localStorage.setItem(awardKey, '1');
      candidates.push(game);
    }
    if (candidates.length === 0) return;

    let changed = false;
    for (const game of candidates) {
      const gameCreations = allCreations
        .filter(c => (c.hostGameId === game.id || c.gameId === game.id) && c.status !== 'deleted' && c.status !== 'burned');
      if (gameCreations.length === 0) continue;

      const sorted = [...gameCreations].sort((a, b) => getCreationVoteCount(b) - getCreationVoteCount(a));
      const top3 = sorted.slice(0, 3);
      const gameName = game.name || game.title || 'Competition';

      let finalizedRemotely = false;
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
              changed = true;
            }
          }
          finalizedRemotely = true;
        } catch (err) {
          console.warn('[scanAndAwardEndedGames] server finalize unavailable, falling back to local:', err);
        }
      }

      if (!finalizedRemotely) {
        top3.forEach((c, i) => {
          if (!c.awardRank) {
            c.awardRank = i + 1;
            c.awardCompetition = gameName;
            c.awardedAt = now;
            c.awardGameId = game.id;
            changed = true;
          }
        });
        top3.forEach((c, i) => {
          if (c.awardedAt === now) {
            const ownerId = c.ownerProfileId || c.createdByProfileId || c.authorProfileId || c.authorId || null;
            if (ownerId) ESHU_DB.addProfileXp(awardXpMap[i + 1], ownerId, `${['1st','2nd','3rd'][i]} place — ${gameName}`);
          }
        });
      }
    }

    if (changed) {
      ESHU_DB.setTable('creations', allCreations);
      ESHU_DB.setTable('games', allGames);
    }
  }

  function refreshState() {
    scanAndAwardEndedGames();
    groups = ESHU_DB.getTable('groups') || [];
    games = ESHU_DB.getTable('games') || [];
    creations = ESHU_DB.getTable('creations') || [];
    rebuildComments();
    rebuildLikedItems();
    rebuildFollowedItems();
  }

  function rebuildComments() {
    globalComments = JSON.parse(localStorage.getItem('comments')) || [];
    const next = [];
    const currentProfileId = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;

    function isLikedByMe(c) {
      if (c.liked) return true;
      if (Array.isArray(c.likedBy) && currentProfileId) return listIncludesProfile(c.likedBy, currentProfileId);
      return false;
    }
    function isFollowedByMe(c) {
      if (c.followed) return true;
      if (Array.isArray(c.followedBy) && currentProfileId) return listIncludesProfile(c.followedBy, currentProfileId);
      return false;
    }

    (Array.isArray(globalComments) ? globalComments : []).forEach((c, idx) => {
      if (typeof c === 'string') {
        next.push({ id: `comment_${idx}`, text: c, status: 'active', _source: 'global', _index: idx, authorName: 'Unknown', timestamp: null, liked: false, followed: false });
        return;
      }
      if (c && typeof c === 'object') {
        next.push({
          id: c.id || `comment_${idx}`,
          text: (typeof c.text === 'string') ? c.text : (typeof c.comment === 'string' ? c.comment : ''),
          liked: isLikedByMe(c),
          followed: isFollowedByMe(c),
          likedBy: Array.isArray(c.likedBy) ? [...c.likedBy] : [],
          followedBy: Array.isArray(c.followedBy) ? [...c.followedBy] : [],
          status: c.status || 'active',
          _source: 'global',
          _index: idx,
          authorName: c.authorName || c.author || 'Unknown',
          authorProfileId: c.authorProfileId || c.ownerProfileId || null,
          timestamp: c.timestamp || c.createdAt || null
        });
      }
    });

    // Get comments from creation threads
    const allCreations = ESHU_DB.getTable('creations');
    (Array.isArray(allCreations) ? allCreations : []).forEach(cr => {
      if (!cr || !cr.id) return;
      const key = `comments_${cr.id}`;
      const thread = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(thread)) return;
      thread.forEach((t, idx) => {
        if (typeof t === 'string') {
          next.push({ id: `comment_${cr.id}_${idx}`, text: t, liked: false, followed: false, status: 'active', _source: 'thread', _threadKey: key, _index: idx, creationId: cr.id, creationName: cr.name, authorName: 'Unknown', timestamp: null, entityType: 'creation' });
        } else if (t && typeof t === 'object') {
          next.push({
            id: t.id || `comment_${cr.id}_${idx}`,
            text: t.text || '',
            liked: isLikedByMe(t),
            followed: isFollowedByMe(t),
            likedBy: Array.isArray(t.likedBy) ? [...t.likedBy] : [],
            followedBy: Array.isArray(t.followedBy) ? [...t.followedBy] : [],
            status: t.status || 'active',
            _source: 'thread',
            _threadKey: key,
            _index: idx,
            creationId: cr.id,
            creationName: cr.name,
            authorName: t.authorName || t.author || 'Unknown',
            authorProfileId: t.authorProfileId || t.ownerProfileId || null,
            timestamp: t.timestamp || t.createdAt || null,
            entityType: 'creation',
            animation: (window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(t) : t.animation) || null,
            animationImageUrl: t.animationImageUrl || t.imageUrl || ''
          });
        }
      });
    });

    // Get comments from game threads
    const allGames = ESHU_DB.getTable('games');
    (Array.isArray(allGames) ? allGames : []).forEach(gm => {
      if (!gm || !gm.id) return;
      const key = `comments_game_${gm.id}`;
      const thread = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(thread)) return;
      thread.forEach((t, idx) => {
        if (typeof t === 'string') {
          next.push({ id: `comment_game_${gm.id}_${idx}`, text: t, liked: false, followed: false, status: 'active', _source: 'thread', _threadKey: key, _index: idx, gameId: gm.id, gameName: gm.name, authorName: 'Unknown', timestamp: null, entityType: 'game' });
        } else if (t && typeof t === 'object') {
          next.push({
            id: t.id || `comment_game_${gm.id}_${idx}`,
            text: t.text || '',
            liked: isLikedByMe(t),
            followed: isFollowedByMe(t),
            likedBy: Array.isArray(t.likedBy) ? [...t.likedBy] : [],
            followedBy: Array.isArray(t.followedBy) ? [...t.followedBy] : [],
            status: t.status || 'active',
            _source: 'thread',
            _threadKey: key,
            _index: idx,
            gameId: gm.id,
            gameName: gm.name,
            authorName: t.authorName || t.author || 'Unknown',
            authorProfileId: t.authorProfileId || t.ownerProfileId || null,
            timestamp: t.timestamp || t.createdAt || null,
            entityType: 'game',
            animation: (window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(t) : t.animation) || null,
            animationImageUrl: t.animationImageUrl || t.imageUrl || ''
          });
        }
      });
    });

    // Get comments from group threads
    const allGroups = ESHU_DB.getTable('groups');
    (Array.isArray(allGroups) ? allGroups : []).forEach(gr => {
      if (!gr || !gr.id) return;
      const key = `comments_group_${gr.id}`;
      const thread = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(thread)) return;
      thread.forEach((t, idx) => {
        if (typeof t === 'string') {
          next.push({ id: `comment_group_${gr.id}_${idx}`, text: t, liked: false, followed: false, status: 'active', _source: 'thread', _threadKey: key, _index: idx, groupId: gr.id, groupName: gr.name, authorName: 'Unknown', timestamp: null, entityType: 'group' });
        } else if (t && typeof t === 'object') {
          next.push({
            id: t.id || `comment_group_${gr.id}_${idx}`,
            text: t.text || '',
            liked: isLikedByMe(t),
            followed: isFollowedByMe(t),
            likedBy: Array.isArray(t.likedBy) ? [...t.likedBy] : [],
            followedBy: Array.isArray(t.followedBy) ? [...t.followedBy] : [],
            status: t.status || 'active',
            _source: 'thread',
            _threadKey: key,
            _index: idx,
            groupId: gr.id,
            groupName: gr.name,
            authorName: t.authorName || t.author || 'Unknown',
            authorProfileId: t.authorProfileId || t.ownerProfileId || null,
            timestamp: t.timestamp || t.createdAt || null,
            entityType: 'group',
            animation: (window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.extractAnimation(t) : t.animation) || null,
            animationImageUrl: t.animationImageUrl || t.imageUrl || ''
          });
        }
      });
    });

    comments = next;
  }

  function isItemActive(item) {
    if (!item) return false;
    const status = item.status;
    return status !== 'burned' && status !== 'deleted' && status !== 'booted';
  }

  function rebuildLikedItems() {
    likedItems = [];
    const pid = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;
    if (!pid) return;
    // Liked creations (exclude burned/deleted/booted)
    creations.filter(c => isItemActive(c) && listIncludesProfile(c.likedBy || [], pid)).forEach(c => {
      likedItems.push({ type: 'creation', ...c });
    });
    // Liked groups (exclude burned/deleted/booted)
    groups.filter(g => isItemActive(g) && listIncludesProfile(g.likedBy || [], pid)).forEach(g => {
      likedItems.push({ type: 'group', ...g });
    });
    // Liked games (exclude burned/deleted/booted)
    games.filter(g => isItemActive(g) && listIncludesProfile(g.likedBy || [], pid)).forEach(g => {
      likedItems.push({ type: 'game', ...g });
    });
    // Liked comments — spread the full comment so likedBy/followedBy,
    // _threadKey and _index survive for toggle + save on the Likes tab.
    comments.filter(c => isItemActive(c) && (c.liked || listIncludesProfile(c.likedBy || [], pid))).forEach(c => {
      const creation = creations.find(cr => cr.id === c.creationId);
      likedItems.push({
        ...c,
        type: 'comment',
        name: c.text ? `"${c.text.slice(0, 30)}${c.text.length > 30 ? '...' : ''}"` : 'Comment',
        creationName: creation?.name || c.creationName || 'Comment'
      });
    });
  }

  function rebuildFollowedItems() {
    followedItems = [];
    const pid = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;
    if (!pid) return;
    // Followed creations (exclude burned/deleted/booted)
    creations.filter(c => isItemActive(c) && listIncludesProfile(c.followedBy || [], pid)).forEach(c => {
      followedItems.push({ type: 'creation', ...c });
    });
    // Followed groups (exclude burned/deleted/booted)
    groups.filter(g => isItemActive(g) && listIncludesProfile(g.followedBy || [], pid)).forEach(g => {
      followedItems.push({ type: 'group', ...g });
    });
    // Followed games (exclude burned/deleted/booted)
    games.filter(g => isItemActive(g) && listIncludesProfile(g.followedBy || [], pid)).forEach(g => {
      followedItems.push({ type: 'game', ...g });
    });
    // Followed comments — spread the full comment so likedBy/followedBy,
    // _threadKey and _index survive for toggle + save on the Follows tab.
    comments.filter(c => isItemActive(c) && (c.followed || listIncludesProfile(c.followedBy || [], pid))).forEach(c => {
      const creation = creations.find(cr => cr.id === c.creationId);
      followedItems.push({
        ...c,
        type: 'comment',
        name: c.text ? `"${c.text.slice(0, 30)}${c.text.length > 30 ? '...' : ''}"` : 'Comment',
        creationName: creation?.name || c.creationName || 'Comment'
      });
    });
  }

  function itemBelongsToProfile(item, profileId) {
    if (!profileId || !item || typeof item !== 'object') return false;
    const ownerId = item.ownerProfileId || item.createdByProfileId || item.authorProfileId || item.authorId || null;
    if (!ownerId) return false;
    return idsMatchProfile(ownerId, profileId);
  }

  function groupBelongsToProfile(group, profileId) {
    if (!group || typeof group !== 'object') return false;
    if (!profileId) return false;
    if (itemBelongsToProfile(group, profileId)) return true;
    const members = Array.isArray(group.memberProfileIds) ? group.memberProfileIds : [];
    if (group.ownerProfileId && !members.includes(group.ownerProfileId)) {
      members.push(group.ownerProfileId);
    }
    return members.includes(profileId);
  }

  function gameBelongsToProfile(game, profileId) {
    if (!profileId || !game || typeof game !== 'object') return false;
    if (itemBelongsToProfile(game, profileId)) return true;
    const gameMembers = Array.isArray(game.memberProfileIds) ? game.memberProfileIds : [];
    if (game.ownerProfileId && !gameMembers.includes(game.ownerProfileId)) {
      gameMembers.push(game.ownerProfileId);
    }
    if (gameMembers.includes(profileId)) return true;
    const hasProfileCreation = creations.some(c => {
      if (!itemBelongsToProfile(c, profileId)) return false;
      const hostGameId = c?.hostGameId || c?.gameId || null;
      return hostGameId === game.id;
    });
    if (hasProfileCreation) return true;
    if (!game.hostGroupId) return false;
    const hostGroup = groups.find(g => g.id === game.hostGroupId);
    return groupBelongsToProfile(hostGroup, profileId);
  }

  function getScopedData(profileId) {
    const publicContent = !isOwnProfileId(profileId) ? publicProfileContentById.get(profileId) : null;
    if (publicContent) {
      return {
        scopedGroups: publicContent.groups || [],
        scopedGames: publicContent.games || [],
        scopedCreations: publicContent.creations || [],
        scopedComments: comments.filter(c => itemBelongsToProfile(c, profileId)),
        scopedLikedItems: likedItems,
        scopedFollowedItems: followedItems
      };
    }
    const scopedGroups = groups.filter(g => groupBelongsToProfile(g, profileId));
    const scopedGames = games.filter(g => gameBelongsToProfile(g, profileId));
    const scopedCreations = creations.filter(c => itemBelongsToProfile(c, profileId));
    const scopedComments = comments.filter(c => itemBelongsToProfile(c, profileId));
    const scopedLikedItems = likedItems;
    const scopedFollowedItems = followedItems;
    return { scopedGroups, scopedGames, scopedCreations, scopedComments, scopedLikedItems, scopedFollowedItems };
  }

  function resolvePrimaryGroup(scopedGroups) {
    if (!Array.isArray(scopedGroups) || scopedGroups.length === 0) return null;
    const scoped = ESHU_DB.getValue('primaryGroupByProfileId');
    const scopedPrimaryGroupId = selectedProfileId && scoped && typeof scoped === 'object'
      ? scoped[selectedProfileId]
      : null;
    const primaryGroupId = scopedPrimaryGroupId || ESHU_DB.getValue('primaryGroupId');
    if (!primaryGroupId) return scopedGroups[0];
    return scopedGroups.find(g => g.id === primaryGroupId) || scopedGroups[0];
  }

  // ===== Avatar Sidebar =====
  const avatarSidebar = document.getElementById('avatarSidebar');
  let selectedProfileId = ESHU_DB.getValue('currentProfileId') || null;
  let sidebarBuiltIds = [];
  let playerSearchTerm = '';

  // profileId query switching is intentionally disabled in single-profile mode.

  function setupAvatarWheelScroll() {
    if (!avatarSidebar) return;
    avatarSidebar.addEventListener('wheel', (e) => {
      const canScroll = avatarSidebar.scrollHeight > avatarSidebar.clientHeight;
      if (!canScroll) return;
      e.preventDefault();
      avatarSidebar.scrollTop += e.deltaY;
    }, { passive: false });
  }
  setupAvatarWheelScroll();

  // Initialize default profile once (not in render function to avoid loops)
  function initializeDefaultProfile() {
    const remoteMode = !!(window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());
    if (remoteMode) return;
    const profiles = getProfiles();
    if (profiles.length === 0) {
      const defaultProfile = {
        id: 'profile_default',
        name: ESHU_DB.getValue('profileName') || 'Player',
        description: ESHU_DB.getValue('profileDesc') || '',
        image: null,
        createdAt: Date.now(),
        isActive: true
      };
      profiles.push(defaultProfile);
      ESHU_DB.setTable('profiles', profiles);
      if (!selectedProfileId) {
        selectedProfileId = defaultProfile.id;
        ESHU_DB.setValue('currentProfileId', defaultProfile.id);
      }
    }
  }

  function updateSidebarActiveState() {
    if (!avatarSidebar) return;
    const readOnly = isReadOnlyProfileView();
    avatarSidebar.querySelectorAll('.avatar-item').forEach((el) => {
      const isSelected = el.dataset.profileId === selectedProfileId;
      el.classList.toggle('active', isSelected);
      el.classList.toggle('readonly-focus', isSelected && readOnly);
    });
  }

  function renderAvatarSidebar() {
    if (!avatarSidebar) return;

    const remoteMode = !!(window.ESHU_REMOTE && window.ESHU_REMOTE.isEnabled && window.ESHU_REMOTE.isEnabled());
    let profiles = playerbaseProfiles.length > 0
      ? playerbaseProfiles
      : (remoteMode ? [] : getProfiles());

    const seen = new Set();
    profiles = profiles.filter((p) => {
      if (!p || !p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Hide "empty" accounts (no XP, no creations, no games, no groups) so the
    // sidebar reads as a directory of actual players. Always keep the active
    // user (and any explicitly-selected profile) so they don't drop out of
    // their own view. Order is preserved as XP-desc per /profiles/playerbase.
    const ownActiveId = getOwnedActiveProfileId();
    const hasActivity = (p) => {
      if (!p) return false;
      const xp = Number(p.xpPoints) || 0;
      const stats = p.stats || {};
      return xp > 0
        || (Number(stats.creations) || 0) > 0
        || (Number(stats.games) || 0) > 0
        || (Number(stats.groups) || 0) > 0;
    };
    profiles = profiles.filter((p) => {
      if (!p) return false;
      if (p.id === ownActiveId || p.id === selectedProfileId) return true;
      if (ownPlayerbaseProfileId && p.id === ownPlayerbaseProfileId) return true;
      return hasActivity(p);
    });

    if (currentTab === 'player' && !isReadOnlyProfileView()) {
      const playerSearch = document.getElementById('playerSearch');
      const searchTerm = (playerSearchTerm || playerSearch?.value || '').trim().toLowerCase();
      if (searchTerm) {
        profiles = profiles.filter((p) => String(p?.name || 'Player').toLowerCase().includes(searchTerm));
      }
      profiles = profiles.slice().sort((a, b) => String(a?.name || 'Player').localeCompare(String(b?.name || 'Player')));
      const playerCountEl = document.getElementById('playerCount');
      if (playerCountEl) playerCountEl.textContent = `${profiles.length} player${profiles.length === 1 ? '' : 's'}`;
    }

    if (profiles.length === 0 && !remoteMode) {
      profiles = [{
        id: 'profile_temp',
        name: ESHU_DB.getValue('profileName') || 'Player',
        description: ESHU_DB.getValue('profileDesc') || '',
        image: null,
        isActive: true
      }];
    }

    if (!selectedProfileId && profiles.length > 0) {
      selectedProfileId = profiles[0].id;
    }

    const newIds = profiles.map((p) => p.id).join(',');
    const oldIds = sidebarBuiltIds.join(',');
    if (newIds === oldIds) {
      updateSidebarActiveState();
      return;
    }

    sidebarBuiltIds = profiles.map((p) => p.id);
    avatarSidebar.innerHTML = '';

    profiles.forEach(profile => {
      const avatar = document.createElement('div');
      avatar.className = 'avatar-item' + (profile.id === selectedProfileId ? ' active' : '');
      if (profile.id === selectedProfileId && isReadOnlyProfileView()) {
        avatar.classList.add('readonly-focus');
      }
      avatar.title = profile.name || 'Player';
      avatar.dataset.profileId = profile.id;
      
      if (profile.image) {
        const img = document.createElement('img');
        img.src = profile.image;
        img.alt = profile.name || 'Player';
        avatar.appendChild(img);
      } else {
        // No uploaded avatar: render the user's initials over a name-derived
        // hue so the sidebar reads as a directory of people instead of a
        // row of identical generic circles.
        const name = (profile.name || 'Player').trim();
        const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
        avatar.style.background = `hsl(${hue}, 55%, 45%)`;
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'P';
        const span = document.createElement('span');
        span.className = 'avatar-initials';
        span.textContent = initials;
        avatar.appendChild(span);
      }
      
      avatar.addEventListener('click', () => {
        selectedProfileId = profile.id;
        updateSidebarActiveState();
        loadPublicProfileContent(selectedProfileId);
        renderProfilePanel();
        renderCurrentTab();
      });

      if (isOwnProfileId(profile.id)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'avatar-own-wrapper';
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'avatar-own-arch');
        svg.setAttribute('viewBox', '0 0 100 30');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M 11.6,26 A 49,49 0 0,1 88.4,26');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '8');
        path.setAttribute('stroke-linecap', 'square');
        svg.appendChild(path);
        wrapper.appendChild(svg);
        wrapper.appendChild(avatar);
        avatarSidebar.appendChild(wrapper);
      } else {
        avatarSidebar.appendChild(avatar);
      }
    });
  }

  // ===== Profile Action Buttons (Like, Follow, Close) =====
  function renderProfileActionButtons(currentProfile, readOnlyView) {
    const profilePanel = document.querySelector('.profile-panel');
    if (!profilePanel) return;

    let actionsContainer = document.getElementById('profileActionButtons');
    if (actionsContainer) actionsContainer.remove();

    // Other-player profiles are intentionally read-only and quiet.
    // The subtle back link below is the only profile-level action.
  }

  function toggleProfileLike(profileId, btnElement) {
    if (!profileId) return;
    const likedProfiles = JSON.parse(localStorage.getItem('eshu_liked_profiles') || '[]');
    const idx = likedProfiles.indexOf(profileId);
    if (idx === -1) {
      likedProfiles.push(profileId);
      btnElement.classList.add('active');
      if (typeof TOAST !== 'undefined') TOAST.success('Profile liked');
    } else {
      likedProfiles.splice(idx, 1);
      btnElement.classList.remove('active');
      if (typeof TOAST !== 'undefined') TOAST.info('Profile unliked');
    }
    localStorage.setItem('eshu_liked_profiles', JSON.stringify(likedProfiles));
    // TODO: Sync with backend API when available
  }

  function toggleProfileFollow(profileId, btnElement) {
    if (!profileId) return;
    const followedProfiles = JSON.parse(localStorage.getItem('eshu_followed_profiles') || '[]');
    const idx = followedProfiles.indexOf(profileId);
    if (idx === -1) {
      followedProfiles.push(profileId);
      btnElement.classList.add('active');
      if (typeof TOAST !== 'undefined') TOAST.success('Now following player');
    } else {
      followedProfiles.splice(idx, 1);
      btnElement.classList.remove('active');
      if (typeof TOAST !== 'undefined') TOAST.info('Unfollowed player');
    }
    localStorage.setItem('eshu_followed_profiles', JSON.stringify(followedProfiles));
    // TODO: Sync with backend API when available
  }

  function updateProfileActionStates(profileId) {
    if (!profileId) return;
    const likedProfiles = JSON.parse(localStorage.getItem('eshu_liked_profiles') || '[]');
    const followedProfiles = JSON.parse(localStorage.getItem('eshu_followed_profiles') || '[]');

    const likeBtn = document.querySelector('.profile-like-btn');
    const followBtn = document.querySelector('.profile-follow-btn');

    if (likeBtn) {
      likeBtn.classList.toggle('active', likedProfiles.includes(profileId));
    }
    if (followBtn) {
      followBtn.classList.toggle('active', followedProfiles.includes(profileId));
    }
  }

  // ===== Profile Panel =====
  function renderProfilePanel() {
    const currentProfile = getSelectedProfileView() || {};
    const readOnlyView = isReadOnlyProfileView();
    const name = runtime?.getEffectiveProfileName?.(currentProfile) || 'Player';
    const headingName = runtime?.getPlayerHeading?.(name) || 'Player';
    const description = currentProfile.description || ESHU_DB.getValue('profileDesc') || 'No bio yet.';
    
    if (profileDisplayName) profileDisplayName.textContent = headingName.toLowerCase();
    if (profileNameLarge) profileNameLarge.textContent = headingName;
    const { scopedCreations, scopedComments, scopedGroups, scopedGames } = getScopedData(selectedProfileId);
    const activeCreations = scopedCreations.filter(c => ESHU_DB.isEntityActive(c));
    const activeComments = scopedComments.filter(c => c.status !== 'deleted' && c.status !== 'burned');
    const activeGroups = scopedGroups.filter(g => ESHU_DB.isEntityActive(g));
    const xpPoints = readOnlyView
      ? (Number(currentProfile.xpPoints) || 0)
      : (runtime?.getProfileXpValue?.(selectedProfileId) || 0);
    const creationCount = readOnlyView
      ? (Number(currentProfile?.stats?.creations) || 0)
      : activeCreations.length;
    const profileGroupCount = readOnlyView
      ? (Number(currentProfile?.stats?.groups) || 0)
      : activeGroups.length;
    const profileGameCount = readOnlyView
      ? (Number(currentProfile?.stats?.games) || 0)
      : scopedGames.length;
    if (profileXP) profileXP.textContent = `${xpPoints} XP`;
    if (profileStats) {
      profileStats.innerHTML = readOnlyView
        ? `<span id="creationCount">${creationCount}</span> Creations · <span id="commentCount">${profileGameCount}</span> Games`
        : `<span id="creationCount">${creationCount}</span> Creations · <span id="commentCount">${activeComments.length}</span> Comments`;
    }
    if (creationCountEl) creationCountEl.textContent = creationCount;
    if (commentCountEl) commentCountEl.textContent = readOnlyView ? profileGameCount : activeComments.length;
    if (profileBioText) profileBioText.textContent = description;
    if (xpCounter) xpCounter.textContent = `${xpPoints} XP${readOnlyView ? '' : ' +'}`;
    if (profileDisplayName) {
      profileDisplayName.textContent = readOnlyView
        ? headingName.toLowerCase()
        : headingName.toLowerCase();
    }
    if (mainContainer) {
      mainContainer.classList.toggle('readonly-profile-view', readOnlyView);
    }
    if (profileViewMode) {
      if (readOnlyView) {
        profileViewMode.textContent = 'viewing profile';
        profileViewMode.classList.remove('my-profile-badge');
      } else {
        profileViewMode.textContent = 'MY PROFILE';
        profileViewMode.classList.add('my-profile-badge');
      }
    }

    // Close/Back button when viewing another profile
    let closeProfileBtn = document.getElementById('closeProfileBtn');
    if (readOnlyView) {
      currentTab = 'player';
      tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === currentTab));
      if (!closeProfileBtn) {
        closeProfileBtn = document.createElement('button');
        closeProfileBtn.id = 'closeProfileBtn';
        closeProfileBtn.className = 'profile-back-link';
        closeProfileBtn.textContent = 'back to my profile';
        closeProfileBtn.addEventListener('click', resetToOwnProfile);
        // Insert after the view mode element
        if (profileViewMode && profileViewMode.parentNode) {
          profileViewMode.parentNode.insertBefore(closeProfileBtn, profileViewMode.nextSibling);
        }
      }
    } else if (closeProfileBtn) {
      closeProfileBtn.remove();
    }

    // Profile image
    const profileImage = document.getElementById('profileImage');
    if (profileImage && currentProfile.image) {
      profileImage.src = currentProfile.image;
      profileImage.style.display = 'block';
    } else if (profileImage) {
      profileImage.removeAttribute('src');
      profileImage.style.display = 'none';
    }

    // Profile action buttons (Like, Follow, Close) - shown when viewing another profile
    renderProfileActionButtons(currentProfile, readOnlyView);

    // Awards history — horizontal scrollable line of diamonds
    const awardsList = document.getElementById('awardsList');
    if (awardsList && !awardsList._dragInit) {
      awardsList._dragInit = true;
      let isDown = false, startX, scrollLeft;
      awardsList.addEventListener('mousedown', e => { e.preventDefault(); isDown = true; awardsList.style.cursor = 'grabbing'; startX = e.pageX - awardsList.offsetLeft; scrollLeft = awardsList.scrollLeft; });
      awardsList.addEventListener('mouseleave', () => { isDown = false; awardsList.style.cursor = 'grab'; });
      awardsList.addEventListener('mouseup', () => { isDown = false; awardsList.style.cursor = 'grab'; });
      awardsList.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); awardsList.scrollLeft = scrollLeft - (e.pageX - awardsList.offsetLeft - startX); });
      awardsList.addEventListener('wheel', e => { if (e.deltaY !== 0 || e.deltaX !== 0) { e.preventDefault(); awardsList.scrollLeft += (e.deltaY || e.deltaX); } }, { passive: false });
    }
    const awardsExpanded = document.getElementById('awardsExpanded');
    const awardsToggle = document.getElementById('awardsToggle');
    if (awardsList) {
      const allCreations = ESHU_DB.getTable('creations') || [];
      const profileAwards = allCreations
        .filter(c => {
          if (!c || !c.awardRank) return false;
          const ownerId = c.ownerProfileId || c.createdByProfileId || c.authorProfileId || c.authorId || null;
          return ownerId === selectedProfileId;
        })
        .sort((a, b) => (b.awardedAt || b.updatedAt || 0) - (a.awardedAt || a.updatedAt || 0));

      if (profileAwards.length === 0) {
        awardsList.innerHTML = '';
        if (awardsExpanded) awardsExpanded.innerHTML = '';
        if (awardsToggle) awardsToggle.style.display = 'none';
      } else {
        // Compact horizontal diamonds
        awardsList.innerHTML = profileAwards.map(creation => {
          const rank = creation.awardRank;
          const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
          const label = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';
          const competition = creation.awardCompetition || 'Competition';
          const creationName = creation.name || creation.title || 'Untitled';
          return `<div class="award-diamond ${cls}" title="${label} Place — ${competition} (${creationName})"></div>`;
        }).join('');

        // Expanded detail rows
        if (awardsExpanded) {
          awardsExpanded.innerHTML = profileAwards.map(creation => {
            const rank = creation.awardRank;
            const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
            const rankLabel = rank === 1 ? '1st Place' : rank === 2 ? '2nd Place' : '3rd Place';
            const competition = creation.awardCompetition || 'Competition';
            const creationName = creation.name || creation.title || 'Untitled';
            return `<div class="award-detail-row" data-creation-id="${creation.id}" data-game-id="${creation.awardGameId || ''}">
              <div class="award-diamond ${cls}" style="width:22px;height:22px;font-size:10px;"></div>
              <div class="award-detail-info">
                <span class="award-detail-title">${rankLabel} — ${competition}</span>
                <span class="award-detail-sub">${creationName}</span>
              </div>
              <span class="award-detail-go">›</span>
            </div>`;
          }).join('');

          awardsExpanded.querySelectorAll('.award-detail-row').forEach(row => {
            row.addEventListener('click', () => {
              const cId = row.dataset.creationId;
              if (cId) {
                const focusUrl = 'creation-focus.html?id=' + encodeURIComponent(cId);
                window.location.href = focusUrl;
              }
            });
          });
        }

        if (awardsToggle) {
          awardsToggle.style.display = '';
          if (!awardsToggle._initDone) {
            awardsToggle._initDone = true;
            awardsToggle.addEventListener('click', () => {
              awardsToggle.classList.toggle('open');
              if (awardsExpanded) awardsExpanded.classList.toggle('open');
            });
          }
        }
      }
    }

    // Primary group
    if (readOnlyView) {
      if (primaryGroupCard) primaryGroupCard.style.display = 'none';
      if (noGroupText) {
        noGroupText.style.display = 'block';
        noGroupText.textContent = `${profileGroupCount} groups · ${profileGameCount} games`;
      }
    } else if (activeGroups.length > 0) {
      const primaryGroup = resolvePrimaryGroup(activeGroups);
      if (primaryGroupCard) {
        primaryGroupCard.style.display = 'flex';
        const iconEl = primaryGroupCard.querySelector('.group-icon');
        if (iconEl) {
          iconEl.innerHTML = primaryGroup.image
            ? buildHexImageSvg(primaryGroup.image)
            : `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo">`;
        }
      }
      if (noGroupText) noGroupText.style.display = 'none';
      if (primaryGroupName) primaryGroupName.textContent = primaryGroup.name || 'Unnamed Group';
      if (primaryGroupMeta) primaryGroupMeta.textContent = `${scopedGames.filter(g => g.hostGroupId === primaryGroup.id).length} games`;
    } else {
      if (primaryGroupCard) primaryGroupCard.style.display = 'none';
      if (noGroupText) noGroupText.style.display = 'block';
    }
  }

  // ===== Creation Card =====
  function createCreationCard(creation, index) {
    const card = document.createElement('div');
    card.className = 'creation-card';
    card.dataset.id = creation.id;

    const profileId = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;
    const likedBy = Array.isArray(creation.likedBy) ? creation.likedBy : [];
    const followedBy = Array.isArray(creation.followedBy) ? creation.followedBy : [];
    const isLiked = !!(profileId && likedBy.includes(profileId));
    const isFollowed = !!(profileId && followedBy.includes(profileId));
    const voteCount = getCreationVoteCount(creation);
    const hasVisual = !!(creation.image || creation.imageAssetId || creation.imageRef?.id);
    // Derive stable gradient colors from the creation id so they don't flicker on re-render.
    function hashToColor(str, seed) {
      let h = seed;
      for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
      return (h % 16777215).toString(16).padStart(6, '0');
    }
    const cid = creation.id || String(index);
    const fallbackA = hashToColor(cid, 5381);
    const fallbackB = hashToColor(cid, 65599);
    const title = creation.title || creation.name || 'Untitled';
    const author = creation.authorName || creation.author || 'Player';
    const desc = creation.description || 'No description';
    const detailMarkup = `
      <div style="display:flex;flex-direction:column;gap:4px;width:100%;max-height:100%;overflow:hidden;">
        <div style="font-weight:700;font-size:12px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
        <div style="font-size:10px;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">by ${author}</div>
        <div style="font-size:10px;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${voteCount} vote${voteCount === 1 ? '' : 's'}</div>
        <div style="font-size:10px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">${desc}</div>
      </div>
    `;
    
    // Award badge
    const awardRank = creation.awardRank || null;
    const awardBadgeHtml = awardRank
      ? `<span class="award-diamond ${awardRank === 1 ? 'gold' : awardRank === 2 ? 'silver' : 'bronze'}" title="${awardRank === 1 ? '1st Place' : awardRank === 2 ? '2nd Place' : '3rd Place'}"><span>${awardRank}</span></span>`
      : '';

    card.innerHTML = `
      ${hasVisual ? `
        <img
          data-creation-image-target
          data-creation-id="${creation.id}"
          src="${creation.image || ''}"
          alt="${creation.name || 'Creation'}"
          style="width:100%;height:100%;object-fit:cover;display:${creation.image ? 'block' : 'none'};"
        >
      ` : ''}
      <div
        data-image-fallback
        style="width:100%;height:100%;background:linear-gradient(135deg, #${fallbackA} 0%, #${fallbackB} 100%);display:${hasVisual ? 'none' : 'flex'};align-items:flex-start;justify-content:flex-start;color:#fff;text-align:left;padding:10px;"
      >
        ${detailMarkup}
      </div>
      ${awardBadgeHtml}
      <span class="vote-badge">${voteCount}</span>
      <span class="creation-badges">
        <span class="creation-badge like${isLiked ? ' active' : ''}" data-action="like" title="${isLiked ? 'Liked' : 'Not liked'}">${HEART_SVG}</span>
        <span class="creation-badge follow${isFollowed ? ' active' : ''}" data-action="follow" title="${isFollowed ? 'Followed' : 'Not followed'}">${FOLLOW_ARROW_SVG}</span>
      </span>
    `;

    if (hasVisual && window.ESHU_MEDIA?.hydrateCreationImages) {
      window.ESHU_MEDIA.hydrateCreationImages(card, [creation]);
    }

    // Wire up like/follow badge clicks
    const likeBadge = card.querySelector('.creation-badge[data-action="like"]');
    const followBadge = card.querySelector('.creation-badge[data-action="follow"]');

    if (likeBadge) {
      likeBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCreationLike(creation, likeBadge);
      });
    }

    if (followBadge) {
      followBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCreationFollow(creation, followBadge);
      });
    }

    // Card click navigates to creation focus (only if not clicking badges)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.creation-badge')) return;
      window.location.href = `creation-focus.html?id=${creation.id}&from=home.html`;
    });

    return card;
  }

  // ===== List Item =====
  function createListItem(item, type) {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.dataset.id = item.id;

    let meta = '';
    if (type === 'group') {
      const gameCount = games.filter(g => g.hostGroupId === item.id && itemBelongsToProfile(g, selectedProfileId)).length;
      meta = `${item.type || 'public'} · ${gameCount} games`;
    } else if (type === 'comment') {
      meta = item.creationName ? `On: ${item.creationName}` : 'Global comment';
    } else if (type === 'liked') {
      meta = `${item.type} · ${item.liked ? 'Liked' : ''}`;
    }

    div.innerHTML = `
      <div class="list-item-icon"></div>
      <div class="list-item-info">
        <div class="item-name">${item.name || item.text || 'Unnamed'}</div>
        <div class="item-meta">${meta}</div>
      </div>
    `;

    if (!isReadOnlyProfileView()) {
      div.addEventListener('click', () => {
        if (type === 'group') {
          window.location.href = `groups.html`;
        } else if (type === 'comment' && item.creationId) {
          window.location.href = `creation-focus.html?id=${item.creationId}&from=home.html`;
        }
      });
    }

    return div;
  }

  // ===== Render Tabs =====
  function renderCurrentTab() {
    const { scopedGroups, scopedGames, scopedCreations, scopedComments, scopedLikedItems, scopedFollowedItems } = getScopedData(selectedProfileId);
    if (mainContainer) {
      mainContainer.classList.toggle('profile-non-player-tab', currentTab !== 'player');
    }
    if (currentTab === 'player') {
      renderAvatarSidebar();
    }

    // Hide all content areas
    playerGrid.style.display = 'none';
    playerGrid.classList.remove('active');
    groupsGrid.style.display = 'none';
    groupsGrid.classList.remove('active');
    gamesGrid.style.display = 'none';
    gamesGrid.classList.remove('active');
    creationsGrid.style.display = 'none';
    creationsGrid.classList.remove('active');
    commentsList.style.display = 'none';
    commentsList.classList.remove('active');
    if (likesGrid) { likesGrid.style.display = 'none'; likesGrid.classList.remove('active'); }
    if (followsGrid) { followsGrid.style.display = 'none'; followsGrid.classList.remove('active'); }

    if (currentTab === 'player') {
      playerGrid.style.display = 'block';
      playerGrid.classList.add('active');
      renderPlayerTab(scopedCreations);
    } else if (currentTab === 'groups') {
      groupsGrid.style.display = 'block';
      groupsGrid.classList.add('active');
      renderGroupsTab(scopedGroups);
    } else if (currentTab === 'games') {
      gamesGrid.style.display = 'block';
      gamesGrid.classList.add('active');
      renderGamesTab(scopedGames);
    } else if (currentTab === 'creations') {
      creationsGrid.style.display = 'block';
      creationsGrid.classList.add('active');
      renderCreationsTab(scopedCreations);
    } else if (currentTab === 'comments') {
      commentsList.style.display = 'block';
      commentsList.classList.add('active');
      renderCommentsTab(scopedComments);
    } else if (currentTab === 'likes') {
      if (likesGrid) { likesGrid.style.display = 'block'; likesGrid.classList.add('active'); }
      renderLikesTab(scopedLikedItems);
    } else if (currentTab === 'follows') {
      if (followsGrid) { followsGrid.style.display = 'block'; followsGrid.classList.add('active'); }
      renderFollowsTab(scopedFollowedItems);
    }
  }

  function escapeHomeCommentHtml(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const FOLLOW_ARROW_SVG = '<svg viewBox="0 0 24 24"><polygon points="1,6 9,1 9,4 23,4 23,8 9,8 9,11"/><polygon points="23,18 15,13 15,16 1,16 1,20 15,20 15,23"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const COG_SVG = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54A.48.48 0 0013.92 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.71 8.47a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const PENCIL_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
  const CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg>';
  const PALETTE_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c.55 0 1-.45 1-1 0-.28-.11-.53-.29-.71a.986.986 0 01-.29-.71c0-.55.45-1 1-1h1.17C17.73 18.58 20 16.31 20 13.5 20 7.36 16.42 2 12 2zM6.5 12c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5S18.33 12 17.5 12z"/></svg>';
  const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
  const STAR_OUTLINE_SVG = '<svg viewBox="0 0 24 24"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';

  function getGameTimingStatusHome(game) {
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

  // Builds hex-framed image markup (img clipped to hex, cap+outline overlaid)
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

  // Builds diamond-framed image markup (img clipped to diamond, cap+outline overlaid)
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

  function buildCardHTML(opts) {
    const { icon, title, subtitle, desc, timingHtml, isLiked, isFollowed, isBurned, isDeleted, canManage, expandBtns, awardRank } = opts;
    const thumbContent = isBurned ? CLOSE_SVG : (icon || '');
    const thumbAward = awardRank
      ? `<span class="thumb-award award-diamond ${awardRank === 1 ? 'gold' : awardRank === 2 ? 'silver' : 'bronze'}" title="${awardRank === 1 ? '1st' : awardRank === 2 ? '2nd' : '3rd'} Place"><span>${awardRank}</span></span>`
      : '';
    return `
      <div class="u-card-body">
        <div class="u-card-thumb">${thumbContent}${thumbAward}</div>
        <div class="u-card-content">
          <div class="u-card-title">${isBurned ? 'BURNED' : (title || 'Untitled')}</div>
          <div class="u-card-subtitle">${subtitle || ''}</div>
          ${timingHtml || ''}
          ${desc ? '<div class="u-card-desc">' + desc + '</div>' : ''}
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
          ${expandBtns || ''}
        </div>
      </div>
    `;
  }

  function wireCardControls(item, entity, entityType, tableName, saveFn, rerenderFn) {
    if (isReadOnlyProfileView()) {
      return;
    }
    const likedInd = item.querySelector('.u-card-ind.liked');
    const followedInd = item.querySelector('.u-card-ind.followed');
    // Like toggle
    const likeBtn = item.querySelector('.u-card-like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        entity.likedBy = Array.isArray(entity.likedBy) ? entity.likedBy : [];
        const idx = entity.likedBy.indexOf(selectedProfileId);
        if (idx >= 0) { entity.likedBy.splice(idx, 1); likeBtn.classList.remove('active'); likeBtn.title = 'Like'; if (likedInd) likedInd.classList.remove('active'); }
        else { entity.likedBy.push(selectedProfileId); likeBtn.classList.add('active'); likeBtn.title = 'Unlike'; if (likedInd) likedInd.classList.add('active'); }
        // Keep boolean in sync so Likes tab rebuilds accurately.
        entity.liked = entity.likedBy.includes(selectedProfileId);
        if (saveFn) saveFn();
      });
    }
    // Follow toggle
    const followBtn = item.querySelector('.u-card-follow-btn');
    if (followBtn) {
      followBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        entity.followedBy = Array.isArray(entity.followedBy) ? entity.followedBy : [];
        const idx = entity.followedBy.indexOf(selectedProfileId);
        if (idx >= 0) { entity.followedBy.splice(idx, 1); followBtn.classList.remove('active'); followBtn.title = 'Follow'; if (followedInd) followedInd.classList.remove('active'); }
        else { entity.followedBy.push(selectedProfileId); followBtn.classList.add('active'); followBtn.title = 'Unfollow'; if (followedInd) followedInd.classList.add('active'); }
        // Keep boolean in sync so Follows tab rebuilds accurately.
        entity.followed = entity.followedBy.includes(selectedProfileId);
        if (saveFn) saveFn();
      });
    }
    // Cog: burned cards open burned modal, others toggle expand panel
    const cogBtn = item.querySelector('.u-card-options-btn');
    if (cogBtn) {
      cogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (entity.status === 'burned' && typeof BURNED_MODAL !== 'undefined') {
          BURNED_MODAL.open(entity, tableName || entityType + 's');
        } else {
          item.classList.toggle('expanded');
        }
      });
    }
  }

  let activeEditCard = null;

  function cancelActiveEdit() {
    if (!activeEditCard) return;
    activeEditCard.classList.remove('editing');
    activeEditCard = null;
    rerenderHomePanels();
  }

  function triggerCommentInlineEdit(comment, cardEl) {
    if (!cardEl) return;
    // Close any existing edit first
    if (activeEditCard && activeEditCard !== cardEl) cancelActiveEdit();
    // Already editing this card — do nothing
    if (activeEditCard === cardEl) return;

    activeEditCard = cardEl;
    cardEl.classList.add('editing');

    const descEl = cardEl.querySelector('.u-card-desc');
    if (!descEl) return;
    const origText = comment.text || '';
    descEl.innerHTML = `
      <textarea class="comment-edit-input" maxlength="1000">${escapeHomeCommentHtml(origText)}</textarea>
      <div class="comment-edit-actions">
        <button type="button" class="u-card-btn comment-edit-cancel">Cancel</button>
        <button type="button" class="u-card-btn dark comment-edit-save">Save</button>
      </div>
    `;
    descEl.style.display = 'flex';
    descEl.style.flexDirection = 'column';
    descEl.style.gap = '8px';
    descEl.style.overflow = 'visible';
    descEl.style.webkitLineClamp = 'unset';
    // Expand the card so the textarea is fully visible
    cardEl.classList.add('expanded');

    const textarea = descEl.querySelector('.comment-edit-input');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const saveEdit = () => {
      const newText = textarea.value.trim().slice(0, 1000);
      if (newText && comment._threadKey != null && comment._index != null) {
        const arr = JSON.parse(localStorage.getItem(comment._threadKey) || '[]');
        if (Array.isArray(arr) && arr[comment._index]) {
          arr[comment._index].text = newText;
          arr[comment._index].editedAt = Date.now();
          localStorage.setItem(comment._threadKey, JSON.stringify(arr));
        }
      }
      activeEditCard = null;
      rerenderHomePanels();
    };
    textarea.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
      if (e.key === 'Escape') cancelActiveEdit();
    };
    descEl.querySelector('.comment-edit-cancel').onclick = () => cancelActiveEdit();
    descEl.querySelector('.comment-edit-save').onclick = saveEdit;
  }

  function openHomeCommentOptionsModal(comment, rerenderFn) {
    const activeProfileId = selectedProfileId || ESHU_DB.getValue('currentProfileId') || null;
    const isLiked = comment.liked;
    const isFollowed = comment.followed;
    const isOwner = canManageEntity(comment);
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
            <span class="opt-icon">${isFollowed ? STAR_SVG : STAR_OUTLINE_SVG}</span> ${isFollowed ? 'Unfollow' : 'Follow'}
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
        if (comment._threadKey != null && comment._index != null) {
          const arr = JSON.parse(localStorage.getItem(comment._threadKey) || '[]');
          if (Array.isArray(arr) && arr[comment._index] && typeof arr[comment._index] === 'object') {
            const raw = arr[comment._index];
            if (action === 'like') {
              raw.likedBy = Array.isArray(raw.likedBy) ? raw.likedBy : [];
              if (isLiked) raw.likedBy = raw.likedBy.filter(id => id !== activeProfileId);
              else raw.likedBy.push(activeProfileId);
            } else if (action === 'follow') {
              raw.followedBy = Array.isArray(raw.followedBy) ? raw.followedBy : [];
              if (isFollowed) raw.followedBy = raw.followedBy.filter(id => id !== activeProfileId);
              else raw.followedBy.push(activeProfileId);
            } else if (action === 'edit') {
              modal.classList.remove('open');
              triggerCommentInlineEdit(comment);
              return;
            } else if (action === 'burn') {
              raw.status = 'burned';
            } else if (action === 'restore') {
              raw.status = 'active';
            }
            localStorage.setItem(comment._threadKey, JSON.stringify(arr));
          }
        }
        modal.classList.remove('open');
        rerenderHomePanels();
      };
    });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function renderPlayerTab(scopedCreations) {
    const playerContent = document.getElementById('playerContent');
    const playerFilter = document.getElementById('playerFilter');
    const playerSort = document.getElementById('playerSort');
    const playerSearch = document.getElementById('playerSearch');
    const playerCountEl = document.getElementById('playerCount');

    function renderPlayerList() {
      if (!playerContent) return;
      playerContent.innerHTML = '';

      let filtered = scopedCreations.filter(c => ESHU_DB.isEntityActive(c));
      filtered.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

      if (filtered.length === 0) {
        playerContent.innerHTML = '<div class="u-card-empty">No creations yet. Upload your first creation!</div>';
        return;
      }

      filtered.slice(0, 50).forEach((creation, index) => {
        const card = createCreationCard(creation, index);
        playerContent.appendChild(card);
      });
    }

    renderPlayerList();

    if (playerFilter) {
      playerFilter.onchange = () => {
        sidebarBuiltIds = [];
        renderAvatarSidebar();
      };
    }
    if (playerSort) {
      playerSort.onchange = () => {
        sidebarBuiltIds = [];
        renderAvatarSidebar();
      };
    }
    if (playerSearch) {
      playerSearch.oninput = () => {
        playerSearchTerm = playerSearch.value || '';
        sidebarBuiltIds = [];
        renderAvatarSidebar();
      };
    }
  }

  function renderGamesTab(scopedGames) {
    const gamesContent = document.getElementById('gamesContent');
    const gamesFilterEl = document.getElementById('gamesFilter');
    const gamesSortEl = document.getElementById('gamesSort');
    const gamesSearchEl = document.getElementById('gamesSearch');
    const gamesCountEl = document.getElementById('gamesCount');

    function renderGamesList() {
      if (!gamesContent) return;
      gamesContent.innerHTML = '';

      const filterVal = gamesFilterEl?.value || 'mine';
      const sortVal = gamesSortEl?.value || 'recent';
      const searchVal = (gamesSearchEl?.value || '').toLowerCase().trim();

      let filtered;
      if (filterVal === 'byGroup') {
        // By Group: get all accessible games
        filtered = [...games].filter(g => {
          if (!g || g.status === 'deleted' || g.status === 'burned') return false;
          if ((g.privacy || '').toLowerCase() !== 'private') return true;
          return gameBelongsToProfile(g, selectedProfileId);
        });
        
        // If search query provided, filter by group name
        if (searchVal) {
          const groups = ESHU_DB.getTable('groups');
          const matchingGroupIds = new Set();
          groups.forEach(gr => {
            if (gr && gr.name && gr.name.toLowerCase().includes(searchVal)) {
              matchingGroupIds.add(gr.id);
            }
          });
          filtered = filtered.filter(g => {
            // Match by game's hostGroupId or game's name containing the query
            const gameNameMatch = (g.name || '').toLowerCase().includes(searchVal);
            const gameGroupMatch = g.hostGroupId && matchingGroupIds.has(g.hostGroupId);
            return gameNameMatch || gameGroupMatch;
          });
        }
      } else if (filterVal === 'all' && !isReadOnlyProfileView()) {
        filtered = [...games].filter(g => {
          if (!g || g.status === 'deleted' || g.status === 'burned') return false;
          if ((g.privacy || '').toLowerCase() !== 'private') return true;
          return gameBelongsToProfile(g, selectedProfileId);
        });
      } else {
        filtered = [...scopedGames];
      }

      if (filterVal !== 'byGroup' && searchVal) {
        filtered = filtered.filter(g => (g.name || '').toLowerCase().includes(searchVal));
      }

      if (sortVal === 'name') {
        filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      } else {
        filtered.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
      }

      if (filtered.length === 0) {
        if (filterVal === 'byGroup' && !searchVal) {
          gamesContent.innerHTML = '<div class="u-card-empty">Type a group name to filter games by group.</div>';
        } else {
          gamesContent.innerHTML = '<div class="u-card-empty">No games found.</div>';
        }
        if (gamesCountEl) gamesCountEl.textContent = `0 / ${scopedGames.length}`;
        return;
      }

      if (gamesCountEl) gamesCountEl.textContent = `${Math.min(filtered.length, 50)} / ${scopedGames.length}`;

      filtered.slice(0, 50).forEach(game => {
        const hostGroup = getScopedData(selectedProfileId).scopedGroups.find(g => g.id === game.hostGroupId);
        const isDeleted = game.status === 'deleted' || game.status === 'booted';
        const isBurned = game.status === 'burned';
        const canManage = canManageEntity(game);
        const gameLiked = (game.likedBy || []).includes(selectedProfileId);
        const gameFollowed = (game.followedBy || []).includes(selectedProfileId);
        const gameType = game.gameType || 'arena';

        const item = document.createElement('div');
        item.className = `u-card ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}`;
        item.dataset.entityId = game.id;

        let expandBtns = '';
        if (canManage && !isDeleted && !isBurned) expandBtns += '<button class="u-card-btn" data-home-action="edit-game">Edit</button><button class="u-card-btn dark" data-home-action="clear-game">Boot</button>';
        if (canManage && isDeleted) expandBtns += '<button class="u-card-btn" data-home-action="boot-game">Restore</button><button class="u-card-btn danger" data-home-action="burn-game">Delete</button>';

        const ts = (!isBurned && !isDeleted) ? getGameTimingStatusHome(game) : null;
        const timingLine = ts ? `<div class="u-card-timing ${ts.cssClass}">${ts.label}</div>` : '';

        const gameIcon = game.image
          ? buildDiamondImageSvg(game.image)
          : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
        item.innerHTML = buildCardHTML({
          icon: gameIcon, title: game.name || 'Untitled Game',
          subtitle: gameType + (hostGroup ? ' · ' + (hostGroup.name || 'Group') : ''),
          desc: game.description || '',
          timingHtml: timingLine,
          isLiked: gameLiked, isFollowed: gameFollowed, isBurned, isDeleted, canManage, expandBtns
        });

        wireCardControls(item, game, 'game', 'games', () => ESHU_DB.setTable('games', games), renderGamesList);

        item.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open(game, 'games'); return; }
          gamesContent.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          item.classList.add('selected');
        });
        item.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || isBurned) return;
          window.location.href = `games.html?view=front&gameId=${game.id}`;
        });
        const editBtn = item.querySelector('[data-home-action="edit-game"]');
        if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = `games.html?view=front&gameId=${game.id}`; });
        const clearBtn = item.querySelector('[data-home-action="clear-game"]');
        if (clearBtn) clearBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeClearGame(game.id); });
        const bootBtn = item.querySelector('[data-home-action="boot-game"]');
        if (bootBtn) bootBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBootGame(game.id); });
        const burnBtn = item.querySelector('[data-home-action="burn-game"]');
        if (burnBtn) burnBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBurnGame(game.id); });
        gamesContent.appendChild(item);
      });
    }

    renderGamesList();

    if (gamesFilterEl) gamesFilterEl.onchange = renderGamesList;
    if (gamesSortEl) gamesSortEl.onchange = renderGamesList;
    if (gamesSearchEl) gamesSearchEl.oninput = renderGamesList;
  }

  function renderCreationsTab(scopedCreations) {
    const creationsContent = document.getElementById('creationsContent');
    const creationsFilter = document.getElementById('creationsFilter');
    const creationsSort = document.getElementById('creationsSort');
    const creationsSearch = document.getElementById('creationsSearch');
    const creationsCountEl = document.getElementById('creationsCount');

    function renderCreationsList() {
      if (!creationsContent) return;
      creationsContent.innerHTML = '';

      const filterVal = creationsFilter?.value || 'all';
      const sortVal = creationsSort?.value || 'recent';
      const searchVal = (creationsSearch?.value || '').toLowerCase().trim();

      let filtered = [...scopedCreations];

      if (filterVal === 'liked') {
        filtered = filtered.filter(c => (c.likedBy || []).includes(selectedProfileId));
      } else if (filterVal === 'public') {
        filtered = filtered.filter(c => (c.privacy || '').toLowerCase() !== 'private');
      } else if (filterVal === 'private') {
        filtered = filtered.filter(c => (c.privacy || '').toLowerCase() === 'private');
      }

      if (searchVal) {
        filtered = filtered.filter(c => {
          const tags = Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || '');
          return (
            (c.name || c.title || '').toLowerCase().includes(searchVal) ||
            (c.description || '').toLowerCase().includes(searchVal) ||
            (c.authorName || c.author || '').toLowerCase().includes(searchVal) ||
            (tags || '').toLowerCase().includes(searchVal)
          );
        });
      }

      if (sortVal === 'votes') {
        filtered.sort((a, b) => getCreationVoteCount(b) - getCreationVoteCount(a));
      } else if (sortVal === 'name') {
        filtered.sort((a, b) => String(a.name || a.title || '').localeCompare(String(b.name || b.title || '')));
      } else {
        filtered.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
      }

      if (filtered.length === 0) {
        creationsContent.innerHTML = '<div class="u-card-empty">No creations found.</div>';
        if (creationsCountEl) creationsCountEl.textContent = `0 / ${scopedCreations.length}`;
        return;
      }

      const shown = Math.min(filtered.length, 50);
      if (creationsCountEl) creationsCountEl.textContent = `${shown} / ${scopedCreations.length}`;

      filtered.slice(0, 50).forEach(creation => {
        const game = games.find(g => g.id === creation.hostGameId);
        const title = creation.name || creation.title || 'Untitled';
        const author = creation.authorName || creation.author || 'Unknown';
        const isDeleted = creation.status === 'deleted';
        const isBurned = creation.status === 'burned';
        const canManage = canManageEntity(creation);
        const cLiked = (creation.likedBy || []).includes(selectedProfileId);
        const cFollowed = (creation.followedBy || []).includes(selectedProfileId);

        const item = document.createElement('div');
        item.className = `u-card ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}`;
        item.dataset.entityId = creation.id;

        let expandBtns = '';
        if (canManage && !isDeleted && !isBurned) expandBtns += '<button class="u-card-btn" data-home-action="edit-creation">Edit</button><button class="u-card-btn dark" data-home-action="clear-creation">Boot</button>';
        if (canManage && isDeleted) expandBtns += '<button class="u-card-btn" data-home-action="boot-creation">Restore</button><button class="u-card-btn danger" data-home-action="burn-creation">Delete</button>';

        const creationIcon = creation.image
          ? `<img src="${String(creation.image).replace(/"/g, '&quot;')}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`
          : PALETTE_SVG;
        item.innerHTML = buildCardHTML({
          icon: creationIcon, title: title,
          subtitle: 'by ' + author + (game ? ' · ' + (game.name || 'Untitled Game') : ''),
          desc: creation.description || '',
          isLiked: cLiked, isFollowed: cFollowed, isBurned, isDeleted, canManage, expandBtns,
          awardRank: creation.awardRank || null
        });

        wireCardControls(item, creation, 'creation', 'creations', () => ESHU_DB.setTable('creations', creations), renderCreationsList);

        item.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open(creation, 'creations'); return; }
          creationsContent.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          item.classList.add('selected');
        });
        item.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || isBurned) return;
          window.location.href = `creation-focus.html?id=${creation.id}&from=home.html`;
        });
        const editBtn = item.querySelector('[data-home-action="edit-creation"]');
        if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = `creation-focus.html?id=${creation.id}&from=home.html`; });
        const clearBtn = item.querySelector('[data-home-action="clear-creation"]');
        if (clearBtn) clearBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeClearCreation(creation.id); });
        const bootBtn = item.querySelector('[data-home-action="boot-creation"]');
        if (bootBtn) bootBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBootCreation(creation.id); });
        const burnBtn = item.querySelector('[data-home-action="burn-creation"]');
        if (burnBtn) burnBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBurnCreation(creation.id); });
        creationsContent.appendChild(item);
      });
    }

    renderCreationsList();

    if (creationsFilter) creationsFilter.onchange = renderCreationsList;
    if (creationsSort) creationsSort.onchange = renderCreationsList;
    if (creationsSearch) creationsSearch.oninput = renderCreationsList;
  }

  function renderGroupsTab(scopedGroups) {
    const groupsContent = document.getElementById('groupsList');
    const groupsFilterEl = document.getElementById('groupsFilter');
    const groupsSortEl = document.getElementById('groupsSort');
    const groupsSearchEl = document.getElementById('groupsSearch');
    const groupsCountEl = document.getElementById('groupsCount');

    function renderGroupsList() {
      if (!groupsContent) return;
      groupsContent.innerHTML = '';

      const filterVal = groupsFilterEl?.value || 'mine';
      const sortVal = groupsSortEl?.value || 'recent';
      const searchVal = (groupsSearchEl?.value || '').toLowerCase().trim();

      let filtered = filterVal === 'all' && !isReadOnlyProfileView()
        ? [...groups].filter(g => {
            if (!g || g.status === 'deleted' || g.status === 'burned') return false;
            if ((g.privacy || '').toLowerCase() !== 'private') return true;
            return groupBelongsToProfile(g, selectedProfileId);
          })
        : [...scopedGroups];

      if (searchVal) {
        filtered = filtered.filter(g => {
          return (g.name || '').toLowerCase().includes(searchVal);
        });
      }

      if (sortVal === 'name') {
        filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      } else if (sortVal === 'games') {
        filtered.sort((a, b) => {
          const aCount = Array.isArray(a.games) ? a.games.length : 0;
          const bCount = Array.isArray(b.games) ? b.games.length : 0;
          return bCount - aCount;
        });
      } else {
        filtered.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
      }

      if (filtered.length === 0) {
        groupsContent.innerHTML = '<div class="u-card-empty">No groups found.</div>';
        if (groupsCountEl) groupsCountEl.textContent = `0 / ${scopedGroups.length}`;
        return;
      }

      if (groupsCountEl) groupsCountEl.textContent = `${filtered.length} / ${scopedGroups.length}`;

      const primaryGroup = resolvePrimaryGroup(scopedGroups);
      const primaryGroupId = primaryGroup?.id || null;
      const profiles = getProfiles();

      filtered.forEach(group => {
        const gameCount = getScopedData(selectedProfileId).scopedGames.filter(g => g.hostGroupId === group.id).length;
        const memberIds = Array.isArray(group.memberProfileIds) ? group.memberProfileIds.filter(Boolean) : [];
        if (group.ownerProfileId && !memberIds.includes(group.ownerProfileId)) memberIds.push(group.ownerProfileId);
        const memberCount = memberIds.length || 1;
        const isDeleted = group.status === 'deleted' || group.status === 'booted';
        const isBurned = group.status === 'burned';
        const canManage = canManageEntity(group);
        const isPrimary = group.id === primaryGroupId;

        // Resolve creator name
        const ownerProfile = group.ownerProfileId ? profiles.find(p => p.id === group.ownerProfileId) : null;
        const creatorName = ownerProfile?.name || group.creatorName || 'Unknown';

        const gLiked = (group.likedBy || []).includes(selectedProfileId);
        const gFollowed = (group.followedBy || []).includes(selectedProfileId);
        const item = document.createElement('div');
        item.className = `u-card ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}`;
        item.dataset.entityId = group.id;

        let expandBtns = '';
        if (canManage && !isDeleted && !isBurned) expandBtns += '<button class="u-card-btn" data-home-action="edit-group">Edit</button><button class="u-card-btn dark" data-home-action="clear-group">Boot</button>';
        if (canManage && isDeleted) expandBtns += '<button class="u-card-btn" data-home-action="boot-group">Restore</button><button class="u-card-btn danger" data-home-action="burn-group">Delete</button>';

        const groupIcon = group.image
          ? buildHexImageSvg(group.image)
          : `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo">`;
        item.innerHTML = buildCardHTML({
          icon: groupIcon, title: group.name || 'Unnamed Group',
          subtitle: 'Group · by ' + creatorName,
          desc: group.description || '',
          isLiked: gLiked, isFollowed: gFollowed, isBurned, isDeleted, canManage, expandBtns
        });

        wireCardControls(item, group, 'group', 'groups', () => ESHU_DB.setTable('groups', groups), renderGroupsList);

        item.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open(group, 'groups'); return; }
          groupsContent.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          item.classList.add('selected');
        });
        item.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || isBurned) return;
          window.location.href = `group-front.html?id=${group.id}&from=home.html`;
        });
        const editBtn = item.querySelector('[data-home-action="edit-group"]');
        if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = `groups.html?id=${group.id}&from=home.html`; });
        const clearBtn = item.querySelector('[data-home-action="clear-group"]');
        if (clearBtn) clearBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeClearGroup(group.id); });
        const bootBtn = item.querySelector('[data-home-action="boot-group"]');
        if (bootBtn) bootBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBootGroup(group.id); });
        const burnBtn = item.querySelector('[data-home-action="burn-group"]');
        if (burnBtn) burnBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBurnGroup(group.id); });
        groupsContent.appendChild(item);
      });

    }

    renderGroupsList();

    if (groupsFilterEl) {
      groupsFilterEl.onchange = renderGroupsList;
    }
    if (groupsSortEl) {
      groupsSortEl.onchange = renderGroupsList;
    }
    if (groupsSearchEl) {
      groupsSearchEl.oninput = renderGroupsList;
    }
  }

  function renderCommentsTab(scopedComments) {
    const contentArea = document.getElementById('commentsContent');
    const filterEl = document.getElementById('commentsFilter');
    const sortEl = document.getElementById('commentsSort');
    const searchEl = document.getElementById('commentsSearch');
    const countEl = document.getElementById('commentsCount');

    async function resolveCommentAnimationImageUrl(comment) {
      if (!comment || typeof comment !== 'object') return '';

      const rawImageUrl = String(comment.animationImageUrl || comment.imageUrl || '').trim();
      if (rawImageUrl && !rawImageUrl.startsWith('blob:')) return rawImageUrl;

      if (comment.creationId) {
        const creation = creations.find(c => c && c.id === comment.creationId)
          || (ESHU_DB.getEntityById ? ESHU_DB.getEntityById('creations', comment.creationId) : null);
        if (creation) {
          if (window.ESHU_MEDIA?.resolveCreationImageSrc) {
            try {
              const resolved = await window.ESHU_MEDIA.resolveCreationImageSrc(creation);
              if (resolved) return resolved;
            } catch (err) {
              console.warn('[home] Failed to resolve creation image for animation playback:', err);
            }
          }
          return creation.image || '';
        }
      }

      if (comment.gameId) {
        const game = games.find(g => g && g.id === comment.gameId)
          || (ESHU_DB.getEntityById ? ESHU_DB.getEntityById('games', comment.gameId) : null);
        if (game) return game.image || game.thumbnail || game.coverImage || '';
      }

      if (comment.groupId) {
        const group = groups.find(g => g && g.id === comment.groupId)
          || (ESHU_DB.getEntityById ? ESHU_DB.getEntityById('groups', comment.groupId) : null);
        if (group) return group.image || group.thumbnail || group.coverImage || '';
      }

      return '';
    }

    function renderList() {
      if (!contentArea) return;
      contentArea.innerHTML = '';

      const filterVal = filterEl?.value || 'all';
      const sortVal = sortEl?.value || 'recent';
      const searchVal = (searchEl?.value || '').toLowerCase().trim();

      let filtered = [...scopedComments];

      if (filterVal === 'liked') {
        filtered = filtered.filter(c => c.liked);
      } else if (filterVal === 'followed') {
        filtered = filtered.filter(c => c.followed);
      } else if (filterVal === 'animations') {
        filtered = filtered.filter(c => {
          if (!c || typeof c !== 'object') return false;
          if (window.ANIMATION_PLAYER && typeof window.ANIMATION_PLAYER.hasAnimation === 'function') {
            return !!window.ANIMATION_PLAYER.hasAnimation(c);
          }
          return !!c.animation;
        });
      }

      if (searchVal) {
        filtered = filtered.filter(c =>
          (c.text || '').toLowerCase().includes(searchVal) ||
          (c.authorName || '').toLowerCase().includes(searchVal) ||
          (c.creationName || '').toLowerCase().includes(searchVal)
        );
      }

      if (sortVal === 'name') {
        filtered.sort((a, b) => String(a.text || '').localeCompare(String(b.text || '')));
      } else {
        filtered.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
      }

      if (filtered.length === 0) {
        contentArea.innerHTML = '<div class="u-card-empty">No comments found.</div>';
        if (countEl) countEl.textContent = `0 / ${scopedComments.length}`;
        return;
      }

      const shown = Math.min(filtered.length, 50);
      if (countEl) countEl.textContent = `${shown} / ${scopedComments.length}`;

      filtered.slice(0, 50).forEach(comment => {
        const isDeleted = comment.status === 'deleted';
        const isBurned = comment.status === 'burned';
        const canManage = canManageEntity(comment);
        const text = comment.text || '';
        const hasAnim = window.ANIMATION_PLAYER ? window.ANIMATION_PLAYER.hasAnimation(comment) : !!(comment.animation);
        const isOwner = canManage;
        const isLiked = comment.liked;
        const isFollowed = comment.followed;

        let entityLabel = '';
        if (comment.creationName) entityLabel = `on "${comment.creationName}"`;
        else if (comment.gameName) entityLabel = `on "${comment.gameName}"`;
        else if (comment.groupName) entityLabel = `on "${comment.groupName}"`;

        const item = document.createElement('div');
        item.className = `u-card ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}`;
        item.dataset.entityId = comment.id;

        let expandBtns = '';
        if (isOwner && !isBurned && !isDeleted) {
          expandBtns += '<button class="u-card-btn" data-home-action="edit-comment">' + PENCIL_SVG + ' Edit</button>';
          expandBtns += '<button class="u-card-btn dark" data-home-action="clear-comment">Boot</button>';
        }
        if (isOwner && isDeleted) {
          expandBtns += '<button class="u-card-btn" data-home-action="boot-comment">Restore</button>';
          expandBtns += '<button class="u-card-btn danger" data-home-action="burn-comment">Delete</button>';
        }

        item.innerHTML = buildCardHTML({
          icon: CHAT_SVG,
          title: escapeHomeCommentHtml(comment.authorName || 'Unknown'),
          subtitle: formatTimeAgo(comment.timestamp || comment.createdAt) + (entityLabel ? ' · ' + escapeHomeCommentHtml(entityLabel) : ''),
          desc: escapeHomeCommentHtml(text || (hasAnim ? '(drawing)' : '')) + (hasAnim ? ' <button type="button" class="comment-animation-badge" title="View drawing"></button>' : ''),
          isLiked, isFollowed, isBurned, isDeleted, canManage: isOwner, expandBtns
        });

        // Wire like/follow/cog/show-more — comments save to localStorage per-thread
        const commentSave = () => {
          if (comment._threadKey != null && comment._index != null) {
            const arr = JSON.parse(localStorage.getItem(comment._threadKey) || '[]');
            if (Array.isArray(arr) && arr[comment._index] && typeof arr[comment._index] === 'object') {
              const raw = arr[comment._index];
              raw.likedBy = Array.isArray(comment.likedBy) ? comment.likedBy : [];
              raw.followedBy = Array.isArray(comment.followedBy) ? comment.followedBy : [];
              localStorage.setItem(comment._threadKey, JSON.stringify(arr));
            }
          }
        };
        wireCardControls(item, comment, 'comment', null, commentSave, renderList);

        // Navigate on click
        item.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open(comment, 'comments'); return; }
          contentArea.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          item.classList.add('selected');
        });
        item.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || isBurned) return;
          if (comment.creationId) window.location.href = `creation-focus.html?id=${comment.creationId}&from=home.html`;
          else if (comment.gameId) window.location.href = `games.html?gameId=${comment.gameId}&view=front&from=home.html`;
          else if (comment.groupId) window.location.href = `group-front.html?id=${comment.groupId}&from=home.html`;
        });

        // Edit button in expand panel triggers inline edit
        const editBtn = item.querySelector('[data-home-action="edit-comment"]');
        if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); triggerCommentInlineEdit(comment, item); });

        // Boot (clear) / Restore (boot) / Delete (burn) — mirror other entities
        const clearBtn = item.querySelector('[data-home-action="clear-comment"]');
        if (clearBtn) clearBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeClearComment(comment.id); });
        const bootBtn = item.querySelector('[data-home-action="boot-comment"]');
        if (bootBtn) bootBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBootComment(comment.id); });
        const burnBtn = item.querySelector('[data-home-action="burn-comment"]');
        if (burnBtn) burnBtn.addEventListener('click', (e) => { e.stopPropagation(); window.homeBurnComment(comment.id); });

        // Animation badge
        const animBadge = item.querySelector('.comment-animation-badge');
        if (animBadge && hasAnim && window.ANIMATION_PLAYER) {
          animBadge.addEventListener('click', async (e) => {
            e.stopPropagation();
            const anim = window.ANIMATION_PLAYER.extractAnimation(comment) || comment.animation;
            if (!anim) return;
            const imageUrl = await resolveCommentAnimationImageUrl(comment);
            window.ANIMATION_PLAYER.open(anim, imageUrl);
          });
        }

        contentArea.appendChild(item);
      });
    }

    renderList();

    if (filterEl) filterEl.onchange = renderList;
    if (sortEl) sortEl.onchange = renderList;
    if (searchEl) searchEl.oninput = renderList;
  }

  // ===== Likes Tab =====
  function renderLikesTab(items) {
    const contentArea = document.getElementById('likesContent');
    const filterEl = document.getElementById('likesFilter');
    const sortEl = document.getElementById('likesSort');
    const searchEl = document.getElementById('likesSearch');
    const countEl = document.getElementById('likesCount');

    function renderList() {
      if (!contentArea) return;
      contentArea.innerHTML = '';

      const filterVal = filterEl?.value || 'all';
      const sortVal = sortEl?.value || 'recent';
      const searchVal = (searchEl?.value || '').toLowerCase().trim();

      let filtered = [...items];

      if (filterVal !== 'all') {
        filtered = filtered.filter(item => item.type === filterVal.replace(/s$/, ''));
      }

      if (searchVal) {
        filtered = filtered.filter(item =>
          (item.name || '').toLowerCase().includes(searchVal) ||
          (item.text || '').toLowerCase().includes(searchVal) ||
          (item.description || '').toLowerCase().includes(searchVal)
        );
      }

      if (sortVal === 'name') {
        filtered.sort((a, b) => String(a.name || a.text || '').localeCompare(String(b.name || b.text || '')));
      } else {
        filtered.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
      }

      if (filtered.length === 0) {
        contentArea.innerHTML = '<div class="u-card-empty">No liked items found.</div>';
        if (countEl) countEl.textContent = `0 / ${items.length}`;
        return;
      }

      const shown = Math.min(filtered.length, 50);
      if (countEl) countEl.textContent = `${shown} / ${items.length}`;

      filtered.slice(0, 50).forEach(item => {
        const isBurned = item.status === 'burned';
        const isDeleted = item.status === 'deleted';
        const type = item.type || 'unknown';
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
        const safeImg = (src) => `<img src="${String(src).replace(/"/g, '&quot;')}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
        let typeIcon;
        if (isBurned) { typeIcon = CLOSE_SVG; }
        else if (type === 'creation') { typeIcon = item.image ? safeImg(item.image) : PALETTE_SVG; }
        else if (type === 'game') { typeIcon = item.image ? buildDiamondImageSvg(item.image) : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`; }
        else if (type === 'group') { typeIcon = item.image ? buildHexImageSvg(item.image) : `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo">`; }
        else { typeIcon = CHAT_SVG; }

        const card = document.createElement('div');
        card.className = `u-card ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}`;

        card.innerHTML = buildCardHTML({
          icon: typeIcon,
          title: isBurned ? 'BURNED' : (item.name || item.text?.slice(0, 40) || 'Untitled'),
          subtitle: typeLabel + (item.authorName ? ' · by ' + item.authorName : ''),
          desc: item.description || item.text || '',
          isLiked: true,
          isFollowed: (item.followedBy || []).includes(selectedProfileId),
          isBurned, isDeleted, canManage: false, expandBtns: ''
        });

        wireCardControls(card, item, type, type + 's', () => {
          if (type === 'group') ESHU_DB.setTable('groups', groups);
          else if (type === 'game') ESHU_DB.setTable('games', games);
          else if (type === 'creation') ESHU_DB.setTable('creations', creations);
          else if (type === 'comment' && item._threadKey != null && item._index != null) {
            const arr = JSON.parse(localStorage.getItem(item._threadKey) || '[]');
            if (Array.isArray(arr) && arr[item._index] && typeof arr[item._index] === 'object') {
              const raw = arr[item._index];
              raw.likedBy = Array.isArray(item.likedBy) ? [...item.likedBy] : [];
              raw.followedBy = Array.isArray(item.followedBy) ? [...item.followedBy] : [];
              localStorage.setItem(item._threadKey, JSON.stringify(arr));
            }
          }
          // NOTE: intentionally no rerender here. wireCardControls already
          // updates the button/indicator classes locally, and the persisted
          // change is picked up by other pages via storage. Rebuilding the
          // tab mid-click destroys the DOM that the in-flight click is still
          // bound to and causes spurious toggles on subsequent clicks.
          refreshState();
        }, renderList);

        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open(item, type + 's'); return; }
          contentArea.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
        card.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || isBurned) return;
          if (type === 'group') window.location.href = `group-front.html?id=${item.id}&from=home.html`;
          else if (type === 'game') window.location.href = `games.html?gameId=${item.id}&view=front&from=home.html`;
          else if (type === 'creation') window.location.href = `creation-focus.html?id=${item.id}&from=home.html`;
          else if (type === 'comment' && item.creationId) window.location.href = `creation-focus.html?id=${item.creationId}&from=home.html`;
        });

        contentArea.appendChild(card);
      });
    }

    renderList();
    if (filterEl) filterEl.onchange = renderList;
    if (sortEl) sortEl.onchange = renderList;
    if (searchEl) searchEl.oninput = renderList;
  }

  // ===== Follows Tab =====
  function renderFollowsTab(items) {
    const contentArea = document.getElementById('followsContent');
    const filterEl = document.getElementById('followsFilter');
    const sortEl = document.getElementById('followsSort');
    const searchEl = document.getElementById('followsSearch');
    const countEl = document.getElementById('followsCount');

    function renderList() {
      if (!contentArea) return;
      contentArea.innerHTML = '';

      const filterVal = filterEl?.value || 'all';
      const sortVal = sortEl?.value || 'recent';
      const searchVal = (searchEl?.value || '').toLowerCase().trim();

      let filtered = [...items];

      if (filterVal !== 'all') {
        filtered = filtered.filter(item => item.type === filterVal.replace(/s$/, ''));
      }

      if (searchVal) {
        filtered = filtered.filter(item =>
          (item.name || '').toLowerCase().includes(searchVal) ||
          (item.text || '').toLowerCase().includes(searchVal) ||
          (item.description || '').toLowerCase().includes(searchVal)
        );
      }

      if (sortVal === 'name') {
        filtered.sort((a, b) => String(a.name || a.text || '').localeCompare(String(b.name || b.text || '')));
      } else {
        filtered.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
      }

      if (filtered.length === 0) {
        contentArea.innerHTML = '<div class="u-card-empty">No followed items found.</div>';
        if (countEl) countEl.textContent = `0 / ${items.length}`;
        return;
      }

      const shown = Math.min(filtered.length, 50);
      if (countEl) countEl.textContent = `${shown} / ${items.length}`;

      filtered.slice(0, 50).forEach(item => {
        const isBurned = item.status === 'burned';
        const isDeleted = item.status === 'deleted';
        const type = item.type || 'unknown';
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
        const safeImg2 = (src) => `<img src="${String(src).replace(/"/g, '&quot;')}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
        let typeIcon2;
        if (isBurned) { typeIcon2 = CLOSE_SVG; }
        else if (type === 'creation') { typeIcon2 = item.image ? safeImg2(item.image) : PALETTE_SVG; }
        else if (type === 'game') { typeIcon2 = item.image ? buildDiamondImageSvg(item.image) : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`; }
        else if (type === 'group') { typeIcon2 = item.image ? buildHexImageSvg(item.image) : `<img src="assets/images/hex-logo-v2.svg" alt="" class="group-placeholder-logo">`; }
        else { typeIcon2 = CHAT_SVG; }

        const card = document.createElement('div');
        card.className = `u-card ${isBurned ? 'burned' : (isDeleted ? 'deleted' : '')}`;

        card.innerHTML = buildCardHTML({
          icon: typeIcon2,
          title: isBurned ? 'BURNED' : (item.name || item.text?.slice(0, 40) || 'Untitled'),
          subtitle: typeLabel + (item.authorName ? ' · by ' + item.authorName : ''),
          desc: item.description || item.text || '',
          isLiked: (item.likedBy || []).includes(selectedProfileId),
          isFollowed: true,
          isBurned, isDeleted, canManage: false, expandBtns: ''
        });

        wireCardControls(card, item, type, type + 's', () => {
          if (type === 'group') ESHU_DB.setTable('groups', groups);
          else if (type === 'game') ESHU_DB.setTable('games', games);
          else if (type === 'creation') ESHU_DB.setTable('creations', creations);
          else if (type === 'comment' && item._threadKey != null && item._index != null) {
            const arr = JSON.parse(localStorage.getItem(item._threadKey) || '[]');
            if (Array.isArray(arr) && arr[item._index] && typeof arr[item._index] === 'object') {
              const raw = arr[item._index];
              raw.likedBy = Array.isArray(item.likedBy) ? [...item.likedBy] : [];
              raw.followedBy = Array.isArray(item.followedBy) ? [...item.followedBy] : [];
              localStorage.setItem(item._threadKey, JSON.stringify(arr));
            }
          }
          // NOTE: intentionally no rerender here. wireCardControls already
          // updates the button/indicator classes locally, and the persisted
          // change is picked up by other pages via storage. Rebuilding the
          // tab mid-click destroys the DOM that the in-flight click is still
          // bound to and causes spurious toggles on subsequent clicks.
          refreshState();
        }, renderList);

        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          if (isBurned && typeof BURNED_MODAL !== 'undefined') { BURNED_MODAL.open(item, type + 's'); return; }
          contentArea.querySelectorAll('.u-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
        card.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || isBurned) return;
          if (type === 'group') window.location.href = `group-front.html?id=${item.id}&from=home.html`;
          else if (type === 'game') window.location.href = `games.html?gameId=${item.id}&view=front&from=home.html`;
          else if (type === 'creation') window.location.href = `creation-focus.html?id=${item.id}&from=home.html`;
          else if (type === 'comment' && item.creationId) window.location.href = `creation-focus.html?id=${item.creationId}&from=home.html`;
        });

        contentArea.appendChild(card);
      });
    }

    renderList();
    if (filterEl) filterEl.onchange = renderList;
    if (sortEl) sortEl.onchange = renderList;
    if (searchEl) searchEl.oninput = renderList;
  }

  // ===== Tab Switching =====
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderCurrentTab();
    });
  });

  // ===== Live sync =====
  function getExpandedCardId() {
    const el = document.querySelector('.u-card.expanded');
    return el ? el.dataset.entityId || '' : '';
  }
  function restoreExpandedCard(id) {
    if (!id) return;
    const el = document.querySelector(`.u-card[data-entity-id="${id}"]`);
    if (el) el.classList.add('expanded');
  }
  ESHU_DB.subscribe(() => {
    const expandedId = getExpandedCardId();
    refreshState();
    upsertPlayerbaseProfiles(playerbaseProfiles);
    const ownProfileId = ESHU_DB.getValue('currentProfileId') || null;
    if (!selectedProfileId || selectedProfileId === ownProfileId) {
      selectedProfileId = ownProfileId || selectedProfileId;
    } else if (!playerbaseProfilesById.has(selectedProfileId)) {
      selectedProfileId = ownProfileId || selectedProfileId;
    }
    updateNavProfile();
    sidebarBuiltIds = [];
    renderAvatarSidebar();
    renderProfilePanel();
    renderCurrentTab();
    restoreExpandedCard(expandedId);
  });

  window.addEventListener('eshu:profile-updated', () => {
    sidebarBuiltIds = [];
    rerenderHomePanels();
    loadPlayerbaseProfiles();
  });

  window.addEventListener('eshu:remote-activated', (event) => {
    if (event?.detail?.user) {
      try { window.ESHU_AUTH = { user: event.detail.user }; } catch {}
    }
    sidebarBuiltIds = [];
    refreshState();
    upsertPlayerbaseProfiles(playerbaseProfiles);
    loadPlayerbaseProfiles();
    renderAvatarSidebar();
    renderProfilePanel();
    renderCurrentTab();
  });

  window.addEventListener('eshu:auth-logout', () => {
    try { window.location.replace('play.html'); } catch { window.location.href = 'play.html'; }
  });

  window.addEventListener('storage', e => {
    if (e.key === 'comments' || (e.key && e.key.startsWith('comments_')) || e.key === 'profile') {
      refreshState();
      renderProfilePanel();
      renderCurrentTab();
    }
  });

  // ===== Home Button - Reset to Own Profile =====
  const navHomeBtn = document.querySelector('.nav-home');
  if (navHomeBtn) {
    navHomeBtn.addEventListener('click', (e) => {
      // If currently viewing another profile, reset to own profile
      if (isReadOnlyProfileView()) {
        e.preventDefault();
        resetToOwnProfile();
        // Still navigate to home after reset
        window.location.href = 'home.html';
      }
    });
  }

  // ===== Theme Toggle =====
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem('eshu_theme', next); } catch {}
      if (typeof ESHU_DB !== 'undefined' && ESHU_DB.setValue) {
        ESHU_DB.setValue('uiTheme', next);
      }
    });
  }

  // ===== Messages Dropdown =====
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

  // ===== Followed Panel =====
  const followedBtn = document.getElementById('followedBtn');
  const followedPanel = document.getElementById('followedPanel');
  const followedPanelClose = document.getElementById('followedPanelClose');
  const followedPanelContent = document.getElementById('followedPanelContent');

  function renderFollowedPanel() {
    const { scopedLikedItems } = getScopedData(selectedProfileId);
    if (!followedPanelContent) return;
    followedPanelContent.innerHTML = '';

    if (scopedLikedItems.length === 0) {
      followedPanelContent.innerHTML = '<p style="color:#888;text-align:center;">No followed items yet.</p>';
      return;
    }

    scopedLikedItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'followed-item';
      div.innerHTML = `
        <div class="followed-item-icon"></div>
        <div class="followed-item-info">
          <div class="followed-item-name">${item.name || 'Unnamed'}</div>
          <div class="followed-item-type">${item.type || 'Item'}</div>
        </div>
      `;
      div.addEventListener('click', () => {
        if (item.type === 'creation') {
          window.location.href = `creation-focus.html?id=${item.id}&from=home.html`;
        } else if (item.type === 'group') {
          window.location.href = `groups.html`;
        } else if (item.type === 'game') {
          window.location.href = `games.html`;
        }
      });
      followedPanelContent.appendChild(div);
    });
  }

  if (followedBtn && followedPanel) {
    followedBtn.addEventListener('click', () => {
      renderFollowedPanel();
      followedPanel.classList.toggle('open');
      const xpPanel = document.getElementById('xpHistoryPanel');
      if (xpPanel) xpPanel.classList.remove('open');
    });
  }

  if (followedPanelClose && followedPanel) {
    followedPanelClose.addEventListener('click', () => {
      followedPanel.classList.remove('open');
    });
  }

  // ===== Initial render =====
  refreshState();
  initializeDefaultProfile();
  loadPlayerbaseProfiles();
  renderAvatarSidebar();
  renderProfilePanel();
  renderCurrentTab();
})();

