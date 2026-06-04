(function () {
  'use strict';

  function getProfiles() {
    if (!window.ESHU_DB || typeof window.ESHU_DB.getTable !== 'function') {
      return [];
    }

    const profiles = (window.ESHU_DB.getTable('profiles') || []).filter((profile) => profile && profile.isActive !== false);
    if (!profiles.length) {
      return [];
    }

    const activeId = window.ESHU_DB.getValue('currentProfileId');
    const active = profiles.find((profile) => profile.id === activeId) || profiles[0];
    return active ? [active] : [];
  }

  function getAccountDisplayName() {
    const user = window.ESHU_AUTH?.user || null;
    return user?.displayName || user?.username || null;
  }

  function getEffectiveProfileName(profile) {
    const profileName = profile?.name || window.ESHU_DB?.getValue('profileName') || null;
    const accountName = getAccountDisplayName();
    if (!profileName || profileName === 'Player') {
      return accountName || 'Player';
    }
    return profileName;
  }

  function getPlayerHeading(name) {
    return name && name !== 'Player' ? `Player ${name}` : 'Player';
  }

  function getActiveProfile() {
    const profiles = getProfiles();
    const activeId = window.ESHU_DB?.getValue('currentProfileId');
    const found = profiles.find((profile) => profile.id === activeId);
    if (found) {
      return found;
    }
    if (profiles.length > 0) {
      return profiles[0];
    }
    return null;
  }

  function getProfileXpValue(profileId) {
    if (!window.ESHU_DB || typeof window.ESHU_DB.getProfileXp !== 'function') {
      return 0;
    }

    return parseInt(window.ESHU_DB.getProfileXp(profileId) || 0, 10);
  }

  window.ESHU_RUNTIME = {
    getProfiles,
    getAccountDisplayName,
    getEffectiveProfileName,
    getPlayerHeading,
    getActiveProfile,
    getProfileXpValue,
  };
})();
