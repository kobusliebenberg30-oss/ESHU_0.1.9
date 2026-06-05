(function () {
  'use strict';

  const DEFAULT_GROUP_ID = 'group_default';
  const DEFAULT_GAME_ID = 'game_default';
  const CREATION_UPLOAD_UNLOCK_XP = 2;
  const COMMENTS_UNLOCK_XP = 3;

  function getActiveProfile() {
    if (window.ESHU_RUNTIME && typeof window.ESHU_RUNTIME.getActiveProfile === 'function') {
      return window.ESHU_RUNTIME.getActiveProfile() || null;
    }
    if (window.ESHU_DB && typeof window.ESHU_DB.getTable === 'function') {
      const id = getActiveProfileId();
      return (window.ESHU_DB.getTable('profiles') || []).find((p) => p && p.id === id) || null;
    }
    return null;
  }

  function getActiveProfileId() {
    if (window.ESHU_DB) {
      if (typeof window.ESHU_DB.getActiveProfileId === 'function') {
        const id = window.ESHU_DB.getActiveProfileId();
        if (id) return id;
      }
      if (typeof window.ESHU_DB.getValue === 'function') {
        return window.ESHU_DB.getValue('currentProfileId') || null;
      }
    }
    return null;
  }

  function getOwnerProfileId(entity) {
    return entity?.ownerProfileId || entity?.createdByProfileId || entity?.authorProfileId || entity?.authorId || null;
  }

  function getMembers(entity) {
    const members = Array.isArray(entity?.memberProfileIds) ? entity.memberProfileIds.filter(Boolean) : [];
    const ownerId = getOwnerProfileId(entity);
    if (ownerId && !entity?.ownerHasLeft && !members.includes(ownerId)) members.push(ownerId);
    return members;
  }

  function isMember(entity, profileId) {
    return !!entity && !!profileId && getMembers(entity).includes(profileId);
  }

  function isActive(entity) {
    if (!entity) return false;
    if (window.ESHU_DB && typeof window.ESHU_DB.isEntityActive === 'function') {
      return window.ESHU_DB.isEntityActive(entity);
    }
    return entity.status !== 'deleted' && entity.status !== 'burned';
  }

  function canViewGroup(group, profileId) {
    if (!group) return false;
    if (group.privacy !== 'private') return true;
    return isMember(group, profileId);
  }

  function canAccessGame(game, profileId, groups) {
    if (!game) return false;
    if (game.privacy !== 'private') return true;
    if (!profileId) return false;
    if (getOwnerProfileId(game) === profileId || isMember(game, profileId)) return true;
    const list = groups || (window.ESHU_DB && window.ESHU_DB.getTable ? window.ESHU_DB.getTable('groups') : []);
    const hostGroup = (list || []).find((g) => g && g.id === game.hostGroupId);
    return isMember(hostGroup, profileId);
  }

  function getProfileXp(profileId) {
    if (!window.ESHU_DB || typeof window.ESHU_DB.getProfileXp !== 'function') return 0;
    return parseInt(window.ESHU_DB.getProfileXp(profileId || getActiveProfileId()) || 0, 10);
  }

  function hasUploadUnlock(profileId) {
    const id = profileId || getActiveProfileId();
    if (getProfileXp(id) >= CREATION_UPLOAD_UNLOCK_XP) return true;
    const key = `creationUploadUnlocked_${id || 'global'}`;
    return !!(window.ESHU_DB && window.ESHU_DB.getValue && window.ESHU_DB.getValue(key));
  }

  function canComment(profileId) {
    return getProfileXp(profileId) >= COMMENTS_UNLOCK_XP;
  }

  function hasJoinedAnyGroup(profileId) {
    const id = profileId || getActiveProfileId();
    if (!id) return false;
    const stateGroups = window.STATE && window.STATE.get ? (window.STATE.get('groups') || []) : [];
    const storageGroups = window.ESHU_DB && window.ESHU_DB.getTable ? (window.ESHU_DB.getTable('groups') || []) : [];
    const byId = new Map();
    stateGroups.concat(storageGroups).forEach((group) => {
      if (group && group.id) byId.set(group.id, group);
    });
    return Array.from(byId.values()).some((group) => isActive(group) && isMember(group, id));
  }

  function isDefaultGroup(groupOrId) {
    const id = typeof groupOrId === 'string' ? groupOrId : groupOrId?.id;
    return id === DEFAULT_GROUP_ID;
  }

  function isDefaultGame(gameOrId) {
    const id = typeof gameOrId === 'string' ? gameOrId : gameOrId?.id;
    return id === DEFAULT_GAME_ID;
  }

  window.ESHU_FLOW = {
    DEFAULT_GROUP_ID,
    DEFAULT_GAME_ID,
    CREATION_UPLOAD_UNLOCK_XP,
    COMMENTS_UNLOCK_XP,
    getActiveProfile,
    getActiveProfileId,
    getOwnerProfileId,
    getMembers,
    isMember,
    isActive,
    canViewGroup,
    canAccessGame,
    getProfileXp,
    hasUploadUnlock,
    canComment,
    hasJoinedAnyGroup,
    isDefaultGroup,
    isDefaultGame,
  };
})();
