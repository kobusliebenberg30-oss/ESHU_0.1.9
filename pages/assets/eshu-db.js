(function () {
  const STORAGE_BASENAME = 'eshu_db_v2';
  const DB_KEY = resolveScopedDbKey();
  const SCHEMA_VERSION = 2;
  const DEFAULT_GROUP_ID = 'group_default';
  const PREBUILT_PRIVATE_SEED_VERSION = 4;
  const PREBUILT_PRIVATE_GROUP_ID = 'group_prebuilt_eshu_private';
  const PREBUILT_DUEL_GAME_ID = 'game_prebuilt_duel';
  const PREBUILT_NUMBERS_GAME_ID = 'game_prebuilt_dope_numbers';
  const PREBUILT_COLOURS_GAME_ID = 'game_prebuilt_colours';
  const PREBUILT_FREESTYLE_GAME_ID = 'game_prebuilt_freestyle_describtion';
  const LEGACY_STORAGE_KEYS = ['eshu_db_v1', 'groups', 'games', 'creationsList', 'xpPoints', 'profileName', 'profileDesc', 'primaryGroupId', 'userProfile'];
  const subscribers = new Set();
  const storageDrivers = new Map();
  let activeStorageDriverName = 'localstorage';
  let activeStorageDriver = null;
  let externalStorageUnsubscribe = null;
  let legacyStoragePurged = false;

  // --- Performance: in-memory DB cache ---
  let _cachedDb = null;
  let _notifyScheduled = false;
  let _pendingNotifySource = null;

  function invalidateCache() { _cachedDb = null; }

  function normalizeDriverName(name) {
    return String(name || 'localstorage').trim().toLowerCase();
  }

  function createLocalStorageDriver() {
    return {
      name: 'localstorage',
      getItem(key) {
        return localStorage.getItem(key);
      },
      setItem(key, value) {
        localStorage.setItem(key, value);
      },
      removeItem(key) {
        localStorage.removeItem(key);
      },
      listKeys() {
        const keys = [];
        try {
          for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key) keys.push(key);
          }
        } catch {
        }
        return keys;
      },
      subscribe(onExternalChange) {
        if (typeof onExternalChange !== 'function') {
          return function noop() {
          };
        }
        const handler = function (event) {
          onExternalChange(event || null);
        };
        window.addEventListener('storage', handler);
        return function unsubscribe() {
          window.removeEventListener('storage', handler);
        };
      }
    };
  }

  function createNotConfiguredPostgresDriver() {
    const message = 'PostgreSQL storage driver is not configured. Use localstorage now and export SQL via ESHU_DB.exportPostgresSnapshotSql().';
    return {
      name: 'postgresql',
      getItem() {
        throw new Error(message);
      },
      setItem() {
        throw new Error(message);
      },
      removeItem() {
        throw new Error(message);
      },
      listKeys() {
        return [];
      },
      subscribe() {
        return function noop() {
        };
      }
    };
  }

  function registerStorageDriver(name, factory) {
    const normalizedName = normalizeDriverName(name);
    if (!normalizedName || typeof factory !== 'function') return;
    storageDrivers.set(normalizedName, factory);
  }

  function safeDriverGetItem(key) {
    try {
      return activeStorageDriver.getItem(key);
    } catch {
      return null;
    }
  }

  function safeDriverSetItem(key, value) {
    activeStorageDriver.setItem(key, value);
  }

  function safeDriverRemoveItem(key) {
    try {
      activeStorageDriver.removeItem(key);
    } catch {
    }
  }

  function bindExternalStorageNotifications() {
    if (typeof externalStorageUnsubscribe === 'function') {
      try {
        externalStorageUnsubscribe();
      } catch {
      }
      externalStorageUnsubscribe = null;
    }

    if (!activeStorageDriver || typeof activeStorageDriver.subscribe !== 'function') return;
    externalStorageUnsubscribe = activeStorageDriver.subscribe(function (event) {
      const changedKey = event && event.key ? event.key : null;
      if (changedKey === DB_KEY || changedKey === 'eshu_db_v1' || changedKey === STORAGE_BASENAME) {
        invalidateCache();
        notifySubscribers('storage');
      }
    });
  }

  function configureStorageDriver(options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const name = normalizeDriverName(cfg.driver || cfg.name || 'localstorage');
    const factory = storageDrivers.get(name);
    if (!factory) {
      throw new Error(`Unknown storage driver: ${name}`);
    }
    const candidate = factory(cfg);
    if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function' || typeof candidate.removeItem !== 'function') {
      throw new Error(`Invalid storage driver: ${name}`);
    }
    activeStorageDriver = candidate;
    activeStorageDriverName = name;
    invalidateCache();
    bindExternalStorageNotifications();
    notifySubscribers('driver');
    return activeStorageDriverName;
  }

  function ensureStorageDriverReady() {
    if (activeStorageDriver) return;
    registerStorageDriver('localstorage', () => createLocalStorageDriver());
    registerStorageDriver('postgresql', () => createNotConfiguredPostgresDriver());
    configureStorageDriver({ driver: 'localstorage' });
  }

  function normalizeStorageScope(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/^file:\/\//, '')
      .replace(/%20/g, ' ')
      .replace(/\\/g, '/')
      .replace(/\/pages\/.*$/, '')
      .replace(/\/[^/]*$/, '')
      .replace(/[^a-z0-9/_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function ensureDefaultGroupExistsInDb(db) {
    if (!db || !db.tables) return db;
    const groups = ensureArray(db.tables.groups);
    const now = Date.now();
    const defaultIndex = groups.findIndex((group) => group && group.id === DEFAULT_GROUP_ID);

    if (defaultIndex === -1) {
      const defaultGroup = normalizeGroup({
        id: DEFAULT_GROUP_ID,
        name: 'GROUP',
        description: 'Default Group',
        type: 'arena',
        privacy: 'public',
        image: null,
        members: 0,
        memberProfileIds: [],
        createdAt: now,
        updatedAt: now,
        ownerProfileId: null,
        createdByProfileId: null,
        isSystemDefault: true,
        status: 'active'
      });
      db.tables.groups = [defaultGroup, ...groups];
      return db;
    }

    const existing = groups[defaultIndex] || {};
    const memberProfileIds = Array.isArray(existing.memberProfileIds) ? existing.memberProfileIds.filter(Boolean) : [];
    const healed = normalizeGroup({
      ...existing,
      id: DEFAULT_GROUP_ID,
      name: 'GROUP',
      description: 'Default Group',
      type: existing.type || 'arena',
      privacy: existing.privacy || 'public',
      image: existing.image || null,
      members: memberProfileIds.length,
      memberProfileIds,
      ownerProfileId: null,
      createdByProfileId: null,
      isSystemDefault: true,
      status: 'active',
      updatedAt: now
    });

    groups[defaultIndex] = healed;
    db.tables.groups = groups;
    return db;
  }

  function seedPrebuiltPrivateContentInDb(db) {
    if (!db || !db.tables || !db.values) return db;
    if ((Number(db.values.prebuiltPrivateSeedVersion) || 0) >= PREBUILT_PRIVATE_SEED_VERSION) {
      return db;
    }

    const now = Date.now();
    const groups = ensureArray(db.tables.groups);
    const games = ensureArray(db.tables.games);
    const creations = ensureArray(db.tables.creations);
    const profiles = ensureArray(db.tables.profiles);
    const activeProfileId = db.values.currentProfileId || (profiles[0] && profiles[0].id) || null;
    const privateMembers = activeProfileId ? [activeProfileId] : [];

    const desiredPrivateGroup = {
      id: PREBUILT_PRIVATE_GROUP_ID,
      name: 'ESHU PRIVATE',
      description: 'For my private eshu players.',
      type: 'social',
      privacy: 'private',
      image: null,
      members: privateMembers.length,
      memberProfileIds: privateMembers,
      createdAt: now,
      updatedAt: now,
      ownerProfileId: activeProfileId,
      createdByProfileId: activeProfileId,
      isSystemDefault: false,
      status: 'active'
    };

    const privateGroupIndex = groups.findIndex((group) => group && group.id === PREBUILT_PRIVATE_GROUP_ID);
    if (privateGroupIndex === -1) {
      groups.unshift(normalizeGroup(desiredPrivateGroup));
    } else {
      groups[privateGroupIndex] = normalizeGroup({
        ...groups[privateGroupIndex],
        ...desiredPrivateGroup,
        createdAt: groups[privateGroupIndex].createdAt || now,
        updatedAt: now
      });
    }

    const prebuiltGames = [
      {
        id: PREBUILT_DUEL_GAME_ID,
        name: 'DUEL',
        description: 'Classic black vs white matchup.',
        rules: 'Vote for the creation you prefer.',
        hostGroupId: PREBUILT_PRIVATE_GROUP_ID,
        hostGroupName: 'ESHU PRIVATE',
        privacy: 'private',
        gameType: 'book',
        timingMode: 'infinite',
        memberProfileIds: privateMembers,
        ownerProfileId: activeProfileId,
        createdByProfileId: activeProfileId,
        startTime: now,
        submissionCloseTime: null,
        endTime: null,
        timingOffsets: {
          start: { weeks: 0, days: 0, hours: 0, mins: 0 },
          submission: { weeks: 0, days: 0, hours: 0, mins: 0 },
          end: { weeks: 0, days: 0, hours: 0, mins: 0 }
        },
        timingExtensions: [],
        createdAt: now,
        status: 'active'
      },
      {
        id: PREBUILT_NUMBERS_GAME_ID,
        name: 'Dope Numbers',
        description: 'Number-themed showdown from 0 to 10.',
        rules: 'Pick the number style you like most.',
        hostGroupId: PREBUILT_PRIVATE_GROUP_ID,
        hostGroupName: 'ESHU PRIVATE',
        privacy: 'private',
        gameType: 'book',
        timingMode: 'infinite',
        memberProfileIds: privateMembers,
        ownerProfileId: activeProfileId,
        createdByProfileId: activeProfileId,
        startTime: now,
        submissionCloseTime: null,
        endTime: null,
        timingOffsets: {
          start: { weeks: 0, days: 0, hours: 0, mins: 0 },
          submission: { weeks: 0, days: 0, hours: 0, mins: 0 },
          end: { weeks: 0, days: 0, hours: 0, mins: 0 }
        },
        timingExtensions: [],
        createdAt: now,
        status: 'active'
      },
      {
        id: PREBUILT_COLOURS_GAME_ID,
        name: 'Colours',
        description: 'Rainbow palette battle featuring seven colours.',
        rules: 'Vote for the colour creation that stands out most.',
        hostGroupId: PREBUILT_PRIVATE_GROUP_ID,
        hostGroupName: 'ESHU PRIVATE',
        privacy: 'private',
        gameType: 'book',
        timingMode: 'infinite',
        memberProfileIds: privateMembers,
        ownerProfileId: activeProfileId,
        createdByProfileId: activeProfileId,
        startTime: now,
        submissionCloseTime: null,
        endTime: null,
        timingOffsets: {
          start: { weeks: 0, days: 0, hours: 0, mins: 0 },
          submission: { weeks: 0, days: 0, hours: 0, mins: 0 },
          end: { weeks: 0, days: 0, hours: 0, mins: 0 }
        },
        timingExtensions: [],
        createdAt: now,
        status: 'active'
      },
      {
        id: PREBUILT_FREESTYLE_GAME_ID,
        name: 'Freestyle',
        description: 'Anything goes.',
        rules: 'No Rules Arena',
        hostGroupId: PREBUILT_PRIVATE_GROUP_ID,
        hostGroupName: 'ESHU PRIVATE',
        privacy: 'private',
        gameType: 'arena',
        timingMode: 'infinite',
        memberProfileIds: privateMembers,
        ownerProfileId: activeProfileId,
        createdByProfileId: activeProfileId,
        startTime: now,
        submissionCloseTime: null,
        endTime: null,
        timingOffsets: {
          start: { weeks: 0, days: 0, hours: 0, mins: 0 },
          submission: { weeks: 0, days: 0, hours: 0, mins: 0 },
          end: { weeks: 0, days: 0, hours: 0, mins: 0 }
        },
        timingExtensions: [],
        createdAt: now,
        status: 'active'
      }
    ];

    prebuiltGames.forEach((game) => {
      const existingIndex = games.findIndex((existing) => existing && existing.id === game.id);
      if (existingIndex === -1) {
        games.unshift(normalizeGame(game));
        return;
      }

      games[existingIndex] = normalizeGame({
        ...games[existingIndex],
        ...game,
        createdAt: games[existingIndex].createdAt || now,
        startTime: games[existingIndex].startTime || now,
        updatedAt: now
      });
    });

    const dopeNumberNames = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const rainbowNames = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'];
    // Freestyle: 22 Hebrew alphabet letters, one image per letter, bundled
    // with the source at pages/assets/prebuilt/freestyle/. The leading index
    // in each filename preserves the canonical order (Aleph -> Tav).
    const freestyleLetters = [
      'Aleph', 'Beth', 'Gimel', 'Daleth', 'He', 'Vav', 'Zayin', 'Het',
      'Tet', 'Yod', 'Khaf', 'Lamed', 'Mem', 'Nun', 'Samekh', 'Ayin',
      'Pe', 'Tsade', 'Qof', 'Resh', 'Shin', 'Tav'
    ];

    function escapeSvgText(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function buildSeedImage(label, backgroundColor, textColor, options) {
      const cfg = options && typeof options === 'object' ? options : {};
      const showLabel = cfg.showLabel !== false;
      const safeLabel = escapeSvgText(label);
      const safeBg = String(backgroundColor || '#111111');
      const safeText = String(textColor || '#f5f5f5');
      const labelSvg = showLabel
        ? `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="220" font-weight="700" fill="${safeText}">${safeLabel}</text>`
        : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${safeBg}"/>${labelSvg}</svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    const rainbowPalette = {
      Red: { bg: '#e53935', fg: '#ffffff' },
      Orange: { bg: '#fb8c00', fg: '#111111' },
      Yellow: { bg: '#fdd835', fg: '#111111' },
      Green: { bg: '#43a047', fg: '#ffffff' },
      Blue: { bg: '#1e88e5', fg: '#ffffff' },
      Indigo: { bg: '#3949ab', fg: '#ffffff' },
      Violet: { bg: '#8e24aa', fg: '#ffffff' }
    };

    const prebuiltCreations = [
      {
        id: 'creation_prebuilt_duel_black',
        name: 'BLACK',
        description: 'Dark themed entry for DUEL.',
        hostGameId: PREBUILT_DUEL_GAME_ID,
        image: buildSeedImage('BLACK', '#111111', '#f5f5f5'),
        tags: 'duel,black',
        devices: '',
        dateMade: '',
        timestamp: now,
        status: 'active'
      },
      {
        id: 'creation_prebuilt_duel_white',
        name: 'WHITE',
        description: 'Light themed entry for DUEL.',
        hostGameId: PREBUILT_DUEL_GAME_ID,
        image: buildSeedImage('WHITE', '#f5f5f5', '#111111'),
        tags: 'duel,white',
        devices: '',
        dateMade: '',
        timestamp: now,
        status: 'active'
      },
      ...dopeNumberNames.map((numberName, index) => ({
        id: `creation_prebuilt_numbers_${index}`,
        name: numberName,
        description: `Creation for number ${numberName}.`,
        hostGameId: PREBUILT_NUMBERS_GAME_ID,
        image: buildSeedImage(numberName, '#808080', '#ffffff'),
        tags: 'numbers,dope-numbers',
        devices: '',
        dateMade: '',
        timestamp: now + index + 1,
        status: 'active'
      })),
      ...rainbowNames.map((colourName, index) => ({
        ...(rainbowPalette[colourName] || { bg: '#222222', fg: '#ffffff' }),
        id: `creation_prebuilt_colours_${colourName.toLowerCase()}`,
        name: colourName,
        description: `${colourName} creation from the rainbow set.`,
        hostGameId: PREBUILT_COLOURS_GAME_ID,
        image: buildSeedImage(colourName, (rainbowPalette[colourName] || { bg: '#222222' }).bg, (rainbowPalette[colourName] || { fg: '#ffffff' }).fg, { showLabel: false }),
        tags: 'colours,rainbow',
        devices: '',
        dateMade: '',
        timestamp: now + 100 + index,
        status: 'active'
      })),
      // Freestyle: one creation per Hebrew letter, image loaded from the
      // bundled `assets/prebuilt/freestyle/<NN>-<letter>.jpg` path. Pages are
      // served from `pages/` so this relative URL resolves on every surface
      // that renders creation imagery.
      ...freestyleLetters.map((letterName, index) => {
        const slug = letterName.toLowerCase();
        const ordinal = String(index + 1).padStart(2, '0');
        return {
          id: `creation_prebuilt_freestyle_${slug}`,
          name: letterName,
          description: `${letterName} - Hebrew letter ${index + 1} of 22.`,
          hostGameId: PREBUILT_FREESTYLE_GAME_ID,
          image: `assets/prebuilt/freestyle/${ordinal}-${slug}.jpg`,
          tags: 'freestyle,hebrew,alphabet',
          devices: '',
          dateMade: '',
          timestamp: now + 200 + index,
          status: 'active'
        };
      })
    ];

    prebuiltCreations.forEach((creation) => {
      const existingIndex = creations.findIndex((existing) => existing && existing.id === creation.id);
      if (existingIndex === -1) {
        creations.push(normalizeCreation(creation));
        return;
      }

      const existing = creations[existingIndex] || {};
      if (!existing.image) {
        creations[existingIndex] = normalizeCreation({
          ...existing,
          image: creation.image
        });
      }
    });

    db.tables.groups = groups;
    db.tables.games = games;
    db.tables.creations = creations;
    db.values.prebuiltPrivateSeedVersion = PREBUILT_PRIVATE_SEED_VERSION;
    return db;
  }

  function resolveScopedDbKey() {
    const href = (window.location && window.location.href) || '';
    const pathname = (window.location && window.location.pathname) || '';
    const rawScope = href.startsWith('file:///') ? href : pathname;
    const normalizedScope = normalizeStorageScope(rawScope);
    return normalizedScope ? `${STORAGE_BASENAME}__${normalizedScope}` : STORAGE_BASENAME;
  }

  function safeJsonParse(value, fallback) {
    try {
      if (value === null || value === undefined || value === '') return fallback;
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function newId(prefix) {
    return (
      prefix +
      '_' +
      Date.now().toString(36) +
      '_' +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function normalizeTableName(name) {
    if (name === 'creationsList') return 'creations';
    return name;
  }

  function createEmptyDb() {
    return {
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      tables: {
        groups: [],
        games: [],
        creations: [],
        profiles: []
      },
      values: {
        xpPoints: 0,
        profileName: '',
        profileDesc: '',
        uiTheme: 'light',
        primaryGroupId: null,
        primaryGroupByProfileId: {},
        currentProfileId: null,
        userProfile: null,
        xpHistoryByProfileId: {}
      }
    };
  }

  function resolveEntityStatus(entity, defaultStatus) {
    const normalizedDefault = defaultStatus === undefined ? 'active' : defaultStatus;
    if (!entity || typeof entity !== 'object') return normalizedDefault;

    const rawStatus = typeof entity.status === 'string' ? entity.status.toLowerCase() : '';
    if (rawStatus === 'deleted' || rawStatus === 'burned' || rawStatus === 'active' || rawStatus === 'finished') {
      return rawStatus;
    }

    if (entity.burned === true) return 'burned';
    if (entity.deleted === true) return 'deleted';

    return normalizedDefault;
  }

  function isEntityActive(entity) {
    if (!entity || typeof entity !== 'object') return false;
    return resolveEntityStatus(entity, 'active') === 'active';
  }

  function getActiveGroups(groups) {
    const source = Array.isArray(groups) ? groups : getTable('groups');
    return source.filter((group) => isEntityActive(group));
  }

  function applyHierarchyConsistency(db) {
    const groups = ensureArray(db.tables.groups);
    const games = ensureArray(db.tables.games);
    const creations = ensureArray(db.tables.creations);

    const groupsById = new Map(groups.map((g) => [g.id, g]));

    const normalizedGames = games.map((game) => {
      let next = { ...game };
      const hostGroup = next.hostGroupId ? groupsById.get(next.hostGroupId) : null;

      if (!hostGroup) {
        next.hostGroupId = null;
        next.hostGroupName = '';
      } else {
        next.hostGroupName = hostGroup.name || next.hostGroupName || '';
        if (!isEntityActive(hostGroup) && resolveEntityStatus(next, 'active') !== 'burned') {
          next.status = 'deleted';
        }
      }

      return normalizeGame(next);
    });

    const gamesById = new Map(normalizedGames.map((g) => [g.id, g]));

    const normalizedCreations = creations.map((creation) => {
      let next = { ...creation };
      const hostGame = next.hostGameId ? gamesById.get(next.hostGameId) : null;

      if (!hostGame) {
        next.hostGameId = null;
      } else if (!isEntityActive(hostGame) && resolveEntityStatus(next, null) !== 'burned') {
        next.status = 'deleted';
      }

      return normalizeCreation(next);
    });

    db.tables.games = normalizedGames;
    db.tables.creations = normalizedCreations;

    if (db.values.primaryGroupId) {
      const primaryGroup = groupsById.get(db.values.primaryGroupId);
      if (!primaryGroup || !isEntityActive(primaryGroup)) {
        db.values.primaryGroupId = null;
      }
    }

    const scopedPrimary = db.values && typeof db.values.primaryGroupByProfileId === 'object' && db.values.primaryGroupByProfileId
      ? { ...db.values.primaryGroupByProfileId }
      : {};
    let scopedChanged = false;
    Object.keys(scopedPrimary).forEach((profileId) => {
      const groupId = scopedPrimary[profileId];
      const group = groupId ? groupsById.get(groupId) : null;
      if (!group || !isEntityActive(group)) {
        delete scopedPrimary[profileId];
        scopedChanged = true;
      }
    });
    if (scopedChanged || !db.values.primaryGroupByProfileId || typeof db.values.primaryGroupByProfileId !== 'object') {
      db.values.primaryGroupByProfileId = scopedPrimary;
    }

    return db;
  }

  function loadDbRaw() {
    ensureStorageDriverReady();
    return safeJsonParse(safeDriverGetItem(DB_KEY), null);
  }

  function isLargeDataUrl(value, minLength) {
    if (typeof value !== 'string') return false;
    if (!value.startsWith('data:image/')) return false;
    return value.length >= minLength;
  }

  function compactDbForStorage(db) {
    if (!db || typeof db !== 'object' || !db.tables) return db;

    // Only strip the inline base64 image when the server has a canonical
    // copy of the bytes (`imageAssetId`). Previously we stripped on the mere
    // presence of an IndexedDB `imageRef`, which meant the inline preview
    // never reached `/api/sync` and the image silently vanished on the next
    // hydrate from a fresh device. Once the asset-upload pipeline fills in
    // `imageAssetId`, this strip becomes safe again — the asset endpoint
    // serves the real bytes.
    db.tables.creations = ensureArray(db.tables.creations).map((creation) => {
      if (!creation || typeof creation !== 'object') return creation;
      const hasCanonicalServerCopy = typeof creation.imageAssetId === 'string' && creation.imageAssetId.length > 0;
      if (hasCanonicalServerCopy && isLargeDataUrl(creation.image, 2000)) {
        return { ...creation, image: null };
      }
      return creation;
    });

    // Same logic for groups: don't strip `image` unless the server has a
    // canonical reference (`coverAssetId`) we can rehydrate from.
    db.tables.groups = ensureArray(db.tables.groups).map((group) => {
      if (!group || typeof group !== 'object') return group;
      const hasCanonicalServerCopy = typeof group.coverAssetId === 'string' && group.coverAssetId.length > 0;
      if (hasCanonicalServerCopy && isLargeDataUrl(group.image, 4000)) {
        return { ...group, image: null };
      }
      return group;
    });

    return db;
  }

  function restoreActiveProfileImageFromLegacyValue(db) {
    if (!db || typeof db !== 'object' || !db.tables || !db.values) return;
    const legacyImage = db.values.userProfile && typeof db.values.userProfile === 'object'
      ? db.values.userProfile.image
      : null;
    if (!legacyImage || typeof legacyImage !== 'string') return;

    const activeId = db.values.currentProfileId || null;
    if (!activeId) return;

    const profiles = ensureArray(db.tables.profiles);
    const idx = profiles.findIndex((p) => p && p.id === activeId);
    if (idx === -1) return;
    const active = profiles[idx];
    if (active.image) return;

    profiles[idx] = {
      ...active,
      image: legacyImage,
      updatedAt: Date.now()
    };
    db.tables.profiles = profiles;
  }

  function purgeLegacyStorage() {
    ensureStorageDriverReady();

    LEGACY_STORAGE_KEYS.forEach((key) => {
      safeDriverRemoveItem(key);
    });

    if (typeof activeStorageDriver.listKeys !== 'function') return;

    const keys = activeStorageDriver.listKeys() || [];
    keys.forEach((key) => {
      if (typeof key !== 'string') return;
      if (key.startsWith('xp_history_')) {
        safeDriverRemoveItem(key);
      }
    });
  }

  function saveDbRaw(db) {
    ensureStorageDriverReady();
    db.updatedAt = nowIso();
    try {
      safeDriverSetItem(DB_KEY, JSON.stringify(db));
      return;
    } catch (err) {
      if (!err || err.name !== 'QuotaExceededError') throw err;
    }

    purgeLegacyStorage();
    compactDbForStorage(db);
    db.updatedAt = nowIso();
    safeDriverSetItem(DB_KEY, JSON.stringify(db));
  }

  function ensureArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /**
   * Derive an `/api/assets/<id>/raw` URL for a row whose canonical bytes
   * live in the server-side Asset table. Falls back to the existing inline
   * `image` field whenever no asset id is present, so legacy rows render
   * exactly as before. Used by every normalize* helper to provide a
   * uniform `entity.image` for renderers that don't yet call into
   * ESHU_MEDIA/ESHU_ASSETS resolvers.
   *
   * The URL is just a string — it doesn't bloat localStorage meaningfully
   * (compared to a full base64 data URL) and the eshu-db compactor will
   * strip any large data URL companion once a canonical asset exists.
   */
  function deriveAssetImageUrl(entity, assetField) {
    if (!entity || typeof entity !== 'object') return null;
    const assetId = entity[assetField];
    if (typeof assetId !== 'string' || !assetId.length) return null;
    const client = typeof window !== 'undefined' ? window.ESHU_API : null;
    if (!client || !client.assets || typeof client.assets.rawUrl !== 'function') return null;
    return client.assets.rawUrl(assetId);
  }

  function normalizeGroup(g) {
    if (typeof g === 'string') {
      return {
        id: newId('group'),
        name: g,
        description: '',
        type: 'public',
        timestamp: nowIso(),
        status: 'active'
      };
    }
    if (!g || typeof g !== 'object') {
      return {
        id: newId('group'),
        name: 'Unnamed',
        description: '',
        type: 'public',
        timestamp: nowIso(),
        status: 'active'
      };
    }
    return {
      ...g,
      id: g.id || newId('group'),
      name: g.name || 'Unnamed',
      description: g.description || '',
      type: g.type || 'public',
      timestamp: g.timestamp || nowIso(),
      // When inline `image` is missing (e.g. fresh device after /api/sync
      // pull), derive a viewable URL from the canonical Asset reference.
      image: g.image || deriveAssetImageUrl(g, 'coverAssetId'),
      status: resolveEntityStatus(g, 'active')
    };
  }

  function normalizeGame(g) {
    if (!g || typeof g !== 'object') {
      return {
        id: newId('game'),
        name: 'Unnamed',
        description: '',
        hostGroupId: null,
        hostGroupName: '',
        startTime: Date.now(),
        endTime: null,
        createdAt: Date.now(),
        status: 'active'
      };
    }
    return {
      ...g,
      id: g.id || newId('game'),
      name: g.name || 'Unnamed',
      description: g.description || '',
      hostGroupId: g.hostGroupId || null,
      hostGroupName: g.hostGroupName || '',
      startTime: typeof g.startTime === 'number' ? g.startTime : Date.now(),
      endTime: g.endTime === null || typeof g.endTime === 'number' ? g.endTime : null,
      createdAt: typeof g.createdAt === 'number' ? g.createdAt : Date.now(),
      status: resolveEntityStatus(g, 'active')
    };
  }

  function normalizeCreation(c) {
    if (!c || typeof c !== 'object') {
      return {
        id: newId('creation'),
        name: 'Unnamed',
        description: '',
        devices: '',
        tags: '',
        dateMade: '',
        hostGameId: null,
        status: null,
        timestamp: Date.now()
      };
    }
    return {
      ...c,
      id: c.id || newId('creation'),
      name: c.name || 'Unnamed',
      description: c.description || '',
      devices: c.devices || '',
      tags: c.tags || '',
      dateMade: c.dateMade || '',
      hostGameId: c.hostGameId || null,
      // Asset-URL fallback so SU / versus + every "creation card"
      // renderer still has something to point an <img> at after a fresh
      // /api/sync pull when only the asset id survived.
      image: c.image || deriveAssetImageUrl(c, 'imageAssetId'),
      status: resolveEntityStatus(c, null),
      timestamp: typeof c.timestamp === 'number' ? c.timestamp : Date.now()
    };
  }

  function normalizeProfile(p) {
    if (!p || typeof p !== 'object') {
      const now = Date.now();
      return {
        id: newId('profile'),
        name: 'Player',
        description: '',
        image: null,
        xpPoints: 0,
        createdAt: now,
        updatedAt: now,
        isActive: true
      };
    }

    const now = Date.now();
    return {
      ...p,
      id: p.id || newId('profile'),
      name: p.name || 'Player',
      description: p.description || '',
      // Same asset-URL fallback as groups/creations — keeps the profile
      // chip in nav and every playerbase card rendering on fresh devices.
      image: p.image || deriveAssetImageUrl(p, 'avatarAssetId'),
      xpPoints: Number.isFinite(parseInt(p.xpPoints, 10)) ? Math.max(0, parseInt(p.xpPoints, 10)) : 0,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
      isActive: p.isActive !== false
    };
  }

  function migrateLegacyIntoDb(db) {
    if (!db || !db.tables || !db.values) return db;
    if (!Array.isArray(db.tables.profiles) || db.tables.profiles.length === 0) {
      const now = Date.now();
      const defaultProfile = normalizeProfile({
        id: 'profile_' + now,
        name: db.values.profileName || 'Player',
        description: db.values.profileDesc || '',
        image: null,
        xpPoints: Number.isFinite(parseInt(db.values.xpPoints, 10)) ? Math.max(0, parseInt(db.values.xpPoints, 10)) : 0,
        createdAt: now,
        updatedAt: now,
        isActive: true
      });

      db.tables.profiles = [defaultProfile];
      db.values.currentProfileId = defaultProfile.id;
      db.values.userProfile = {
        name: defaultProfile.name,
        image: defaultProfile.image || null
      };
    }

    if (!db.values.currentProfileId && Array.isArray(db.tables.profiles) && db.tables.profiles.length > 0) {
      db.values.currentProfileId = db.tables.profiles[0].id;
    }

    if (!db.values.primaryGroupByProfileId || typeof db.values.primaryGroupByProfileId !== 'object') {
      db.values.primaryGroupByProfileId = {};
    }

    if (!db.values.xpHistoryByProfileId || typeof db.values.xpHistoryByProfileId !== 'object') {
      db.values.xpHistoryByProfileId = {};
    }

    return db;
  }

  function ensureDb() {
    if (_cachedDb) return _cachedDb;
    ensureStorageDriverReady();
    if (!legacyStoragePurged) {
      purgeLegacyStorage();
      legacyStoragePurged = true;
    }
    let db = loadDbRaw();
    const before = safeJsonParse(JSON.stringify(db), null);
    if (!db || db.schemaVersion !== SCHEMA_VERSION || !db.tables || !db.values) {
      db = createEmptyDb();
    }
    db.tables.groups = ensureArray(db.tables.groups).map(normalizeGroup);
    db.tables.games = ensureArray(db.tables.games).map(normalizeGame);
    db.tables.creations = ensureArray(db.tables.creations).map(normalizeCreation);
    db.tables.profiles = ensureArray(db.tables.profiles).map(normalizeProfile);

    if (!db.values || typeof db.values !== 'object') {
      db.values = createEmptyDb().values;
    }
    if (typeof db.values.uiTheme !== 'string' || !db.values.uiTheme) {
      db.values.uiTheme = 'dark';
    }
    if (!db.values.currentProfileId) {
      db.values.currentProfileId = null;
    }
    if (!db.values.primaryGroupByProfileId || typeof db.values.primaryGroupByProfileId !== 'object') {
      db.values.primaryGroupByProfileId = {};
    }
    if (!Object.prototype.hasOwnProperty.call(db.values, 'userProfile')) {
      db.values.userProfile = null;
    }

    db = migrateLegacyIntoDb(db);
    restoreActiveProfileImageFromLegacyValue(db);
    db = ensureDefaultGroupExistsInDb(db);
    db = applyHierarchyConsistency(db);
    const after = safeJsonParse(JSON.stringify(db), null);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      saveDbRaw(db);
    }

    _cachedDb = db;
    return db;
  }

  function deepClone(value) {
    return safeJsonParse(JSON.stringify(value), value);
  }

  function getDb() {
    return ensureDb();
  }

  function setDb(db) {
    ensureStorageDriverReady();
    if (!db || typeof db !== 'object') return;
    if (!db.schemaVersion) db.schemaVersion = SCHEMA_VERSION;
    if (!db.tables) db.tables = { groups: [], games: [], creations: [], profiles: [] };
    if (!db.values) {
      db.values = {
        xpPoints: 0,
        profileName: '',
        profileDesc: '',
        uiTheme: 'light',
        primaryGroupId: null,
        primaryGroupByProfileId: {},
        currentProfileId: null,
        userProfile: null,
        xpHistoryByProfileId: {}
      };
    }
    db.tables.groups = ensureArray(db.tables.groups).map(normalizeGroup);
    db.tables.games = ensureArray(db.tables.games).map(normalizeGame);
    db.tables.creations = ensureArray(db.tables.creations).map(normalizeCreation);
    db.tables.profiles = ensureArray(db.tables.profiles).map(normalizeProfile);
    db = ensureDefaultGroupExistsInDb(db);
    db = applyHierarchyConsistency(db);
    _cachedDb = db;
    saveDbRaw(db);
    scheduleNotify('local');
  }

  function scheduleNotify(source) {
    _pendingNotifySource = source;
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    (typeof queueMicrotask === 'function' ? queueMicrotask : setTimeout)(flushNotify);
  }

  function flushNotify() {
    _notifyScheduled = false;
    const source = _pendingNotifySource;
    _pendingNotifySource = null;
    notifySubscribers(source);
  }

  function notifySubscribers(source) {
    const snapshot = getDb();
    const frozen = deepClone(snapshot);
    subscribers.forEach((listener) => {
      try {
        listener(frozen, source);
      } catch {
      }
    });
  }

  function subscribe(listener, options) {
    if (typeof listener !== 'function') {
      return function noop() {
      };
    }

    subscribers.add(listener);

    const shouldEmitImmediate = !options || options.immediate !== false;
    if (shouldEmitImmediate) {
      try {
        listener(deepClone(getDb()), 'immediate');
      } catch {
      }
    }

    return function unsubscribe() {
      subscribers.delete(listener);
    };
  }

  function getTable(name) {
    const db = getDb();
    const table = normalizeTableName(name);
    return deepClone(ensureArray(db.tables[table]));
  }

  function setTable(name, rows) {
    const table = normalizeTableName(name);
    const db = getDb();

    if (table === 'groups') db.tables.groups = ensureArray(rows).map(normalizeGroup);
    else if (table === 'games') db.tables.games = ensureArray(rows).map(normalizeGame);
    else if (table === 'creations') db.tables.creations = ensureArray(rows).map(normalizeCreation);
    else if (table === 'profiles') db.tables.profiles = ensureArray(rows).map(normalizeProfile);

    setDb(db);
  }

  function getValue(name) {
    const db = getDb();
    return db.values[name];
  }

  function setValue(name, value) {
    const db = getDb();
    db.values[name] = value;
    if (name === 'currentProfileId') {
      const active = ensureArray(db.tables.profiles).find((p) => p && p.id === value);
      if (active) {
        db.values.xpPoints = Number.isFinite(parseInt(active.xpPoints, 10)) ? Math.max(0, parseInt(active.xpPoints, 10)) : 0;
      }
    }
    setDb(db);
  }

  function getActiveProfileId() {
    const db = getDb();
    return db.values.currentProfileId || (ensureArray(db.tables.profiles)[0]?.id || null);
  }

  function getProfileXp(profileId) {
    const db = getDb();
    const targetId = profileId || getActiveProfileId();
    if (!targetId) return Number.isFinite(parseInt(db.values.xpPoints, 10)) ? Math.max(0, parseInt(db.values.xpPoints, 10)) : 0;
    const profile = ensureArray(db.tables.profiles).find((p) => p && p.id === targetId);
    if (!profile) return 0;
    return Number.isFinite(parseInt(profile.xpPoints, 10)) ? Math.max(0, parseInt(profile.xpPoints, 10)) : 0;
  }

  function setProfileXp(profileId, value) {
    const db = getDb();
    const targetId = profileId || getActiveProfileId();
    const nextXp = Number.isFinite(parseInt(value, 10)) ? Math.max(0, parseInt(value, 10)) : 0;
    if (!targetId) {
      db.values.xpPoints = nextXp;
      setDb(db);
      return nextXp;
    }
    const profiles = ensureArray(db.tables.profiles);
    const idx = profiles.findIndex((p) => p && p.id === targetId);
    if (idx === -1) {
      db.values.xpPoints = nextXp;
      setDb(db);
      return nextXp;
    }
    profiles[idx] = {
      ...profiles[idx],
      xpPoints: nextXp,
      updatedAt: Date.now()
    };
    db.tables.profiles = profiles;
    if (db.values.currentProfileId === targetId) {
      db.values.xpPoints = nextXp;
    }
    setDb(db);
    return nextXp;
  }

  function addProfileXp(amount, profileId, reason) {
    const delta = Number.isFinite(parseInt(amount, 10)) ? parseInt(amount, 10) : 0;
    if (!delta) return getProfileXp(profileId);
    const current = getProfileXp(profileId);
    const next = current + delta;
    const result = setProfileXp(profileId, next);
    logXpEvent(profileId || getActiveProfileId(), delta, reason || 'XP earned', next);
    return result;
  }

  function logXpEvent(profileId, amount, reason, totalAfter) {
    if (!profileId) return;

    const db = getDb();
    const historyByProfile =
      db.values && typeof db.values.xpHistoryByProfileId === 'object' && db.values.xpHistoryByProfileId
        ? { ...db.values.xpHistoryByProfileId }
        : {};
    const history = Array.isArray(historyByProfile[profileId]) ? [...historyByProfile[profileId]] : [];

    history.unshift({ amount, reason, totalAfter, timestamp: Date.now() });
    if (history.length > 200) history.length = 200;
    historyByProfile[profileId] = history;
    db.values.xpHistoryByProfileId = historyByProfile;
    setDb(db);
  }

  function getXpHistory(profileId) {
    const id = profileId || getActiveProfileId();
    if (!id) return [];

    const db = getDb();
    const historyByProfile =
      db.values && typeof db.values.xpHistoryByProfileId === 'object' && db.values.xpHistoryByProfileId
        ? db.values.xpHistoryByProfileId
        : {};
    return Array.isArray(historyByProfile[id]) ? deepClone(historyByProfile[id]) : [];
  }

  function exportSnapshot() {
    return deepClone(getDb());
  }

  function importSnapshot(snapshot, options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const replace = cfg.replace !== false;
    const incoming = typeof snapshot === 'string' ? safeJsonParse(snapshot, null) : deepClone(snapshot);
    if (!incoming || typeof incoming !== 'object') {
      throw new Error('Invalid snapshot payload');
    }

    if (replace) {
      setDb(incoming);
      return;
    }

    const current = getDb();
    const merged = {
      ...current,
      ...incoming,
      tables: {
        ...current.tables,
        ...(incoming.tables || {})
      },
      values: {
        ...current.values,
        ...(incoming.values || {})
      }
    };
    setDb(merged);
  }

  function sqlEscapeText(value) {
    return String(value == null ? '' : value).replace(/'/g, "''");
  }

  function exportPostgresSnapshotSql(options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const tableName = cfg.tableName || 'eshu_snapshots';
    const scopeKey = cfg.scopeKey || DB_KEY;
    const db = exportSnapshot();
    const payload = sqlEscapeText(JSON.stringify(db));
    const scope = sqlEscapeText(scopeKey);
    const safeTableName = String(tableName).replace(/[^a-zA-Z0-9_]/g, '_') || 'eshu_snapshots';

    return [
      'BEGIN;',
      `CREATE TABLE IF NOT EXISTS ${safeTableName} (`,
      '  scope_key TEXT PRIMARY KEY,',
      '  schema_version INTEGER NOT NULL,',
      '  payload JSONB NOT NULL,',
      '  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
      ');',
      `INSERT INTO ${safeTableName} (scope_key, schema_version, payload, updated_at)`,
      `VALUES ('${scope}', ${SCHEMA_VERSION}, '${payload}'::jsonb, NOW())`,
      'ON CONFLICT (scope_key) DO UPDATE SET',
      '  schema_version = EXCLUDED.schema_version,',
      '  payload = EXCLUDED.payload,',
      '  updated_at = EXCLUDED.updated_at;',
      'COMMIT;'
    ].join('\n');
  }

  function resetStorage(options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const dropLegacy = cfg.dropLegacy !== false;

    const next = createEmptyDb();
    invalidateCache();
    saveDbRaw(next);
    if (dropLegacy) purgeLegacyStorage();
    notifySubscribers('reset');
    return deepClone(ensureDb());
  }

  function updateTable(name, updater) {
    if (typeof updater !== 'function') return;
    const current = getTable(name);
    const next = updater(deepClone(current));
    if (!Array.isArray(next)) return;
    setTable(name, next);
  }

  function forceImportPrivatePrebuilt() {
    const db = getDb();
    if (!db.values || typeof db.values !== 'object') {
      db.values = createEmptyDb().values;
    }
    if (!db.tables || typeof db.tables !== 'object') {
      db.tables = createEmptyDb().tables;
    }

    // Remove any existing prebuilt rows so the re-seed starts completely fresh
    // (user edits like custom images are discarded, restoring factory defaults).
    const gameIds = [PREBUILT_DUEL_GAME_ID, PREBUILT_NUMBERS_GAME_ID, PREBUILT_COLOURS_GAME_ID, PREBUILT_FREESTYLE_GAME_ID];
    db.tables.groups = ensureArray(db.tables.groups).filter((g) => !(g && g.id === PREBUILT_PRIVATE_GROUP_ID));
    db.tables.games = ensureArray(db.tables.games).filter((g) => !(g && gameIds.includes(g.id)));
    db.tables.creations = ensureArray(db.tables.creations).filter((c) => !(c && gameIds.includes(c.hostGameId)));

    db.values.prebuiltPrivateSeedVersion = 0;
    db.values.prebuiltInstalled = true;
    const seeded = seedPrebuiltPrivateContentInDb(db);
    setDb(seeded);
    return deepClone(getDb());
  }

  function isPrivatePrebuiltInstalled() {
    const db = getDb();
    if (!db || !db.tables) return false;

    const groups = ensureArray(db.tables.groups);
    const games = ensureArray(db.tables.games);
    const creations = ensureArray(db.tables.creations);

    const gameIds = [PREBUILT_DUEL_GAME_ID, PREBUILT_NUMBERS_GAME_ID, PREBUILT_COLOURS_GAME_ID, PREBUILT_FREESTYLE_GAME_ID];
    const hasGroup = groups.some((group) => group && group.id === PREBUILT_PRIVATE_GROUP_ID);
    const hasAllGames = gameIds.every((gameId) => games.some((game) => game && game.id === gameId));
    const hasAnyCreations = creations.some((creation) => creation && gameIds.includes(creation.hostGameId));

    return hasGroup && hasAllGames && hasAnyCreations;
  }

  function uninstallPrivatePrebuilt() {
    const db = getDb();
    if (!db.tables || typeof db.tables !== 'object') {
      db.tables = createEmptyDb().tables;
    }
    if (!db.values || typeof db.values !== 'object') {
      db.values = createEmptyDb().values;
    }

    const gameIds = [PREBUILT_DUEL_GAME_ID, PREBUILT_NUMBERS_GAME_ID, PREBUILT_COLOURS_GAME_ID, PREBUILT_FREESTYLE_GAME_ID];

    db.tables.groups = ensureArray(db.tables.groups).filter((group) => !(group && group.id === PREBUILT_PRIVATE_GROUP_ID));
    db.tables.games = ensureArray(db.tables.games).filter((game) => !(game && gameIds.includes(game.id)));
    db.tables.creations = ensureArray(db.tables.creations).filter((creation) => !(creation && gameIds.includes(creation.hostGameId)));
    db.values.prebuiltPrivateSeedVersion = 0;
    db.values.prebuiltInstalled = false;

    setDb(db);
    return deepClone(getDb());
  }

  function getEntityById(entityType, id) {
    if (!id) return null;
    const table = normalizeTableName(entityType);
    const rows = getTable(table);
    return rows.find((row) => row && row.id === id) || null;
  }

  function getLinkedEntities(entityType, id) {
    const groups = getTable('groups');
    const games = getTable('games');
    const creations = getTable('creations');

    if (entityType === 'group') {
      const linkedGames = games.filter((g) => g.hostGroupId === id);
      const gameIds = new Set(linkedGames.map((g) => g.id));
      return {
        group: groups.find((g) => g.id === id) || null,
        games: linkedGames,
        creations: creations.filter((c) => gameIds.has(c.hostGameId))
      };
    }

    if (entityType === 'game') {
      const game = games.find((g) => g.id === id) || null;
      const group = game ? groups.find((g) => g.id === game.hostGroupId) || null : null;
      return {
        group,
        game,
        creations: creations.filter((c) => c.hostGameId === id)
      };
    }

    if (entityType === 'creation') {
      const creation = creations.find((c) => c.id === id) || null;
      const game = creation ? games.find((g) => g.id === creation.hostGameId) || null : null;
      const group = game ? groups.find((g) => g.id === game.hostGroupId) || null : null;
      return {
        group,
        game,
        creation
      };
    }

    return {
      groups,
      games,
      creations
    };
  }

  registerStorageDriver('localstorage', () => createLocalStorageDriver());
  registerStorageDriver('postgresql', () => createNotConfiguredPostgresDriver());
  ensureStorageDriverReady();

  async function exportDatabase() {
    const db = getDb();
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      activeProfileId: getActiveProfileId(),
      tables: {
        profiles: db.tables.profiles || [],
        creations: db.tables.creations || [],
        groups: db.tables.groups || [],
        games: db.tables.games || [],
        comments: db.tables.comments || [],
        xpHistory: db.tables.xpHistory || []
      },
      values: db.values || {}
    };
  }

  async function importDatabase(data) {
    if (!data || !data.tables) {
      throw new Error('Invalid database export format');
    }
    const db = getDb();
    // Merge or replace tables
    if (data.tables.profiles) db.tables.profiles = data.tables.profiles;
    if (data.tables.creations) db.tables.creations = data.tables.creations;
    if (data.tables.groups) db.tables.groups = data.tables.groups;
    if (data.tables.games) db.tables.games = data.tables.games;
    if (data.tables.comments) db.tables.comments = data.tables.comments;
    if (data.tables.xpHistory) db.tables.xpHistory = data.tables.xpHistory;
    // Restore values
    if (data.values) Object.assign(db.values, data.values);
    // Set active profile if provided
    if (data.activeProfileId) {
      setValue('currentProfileId', data.activeProfileId);
    }
    setDb(db);
    // Emit event to notify components of data change
    try {
      window.dispatchEvent(new CustomEvent('eshu:database-imported', { detail: { success: true } }));
    } catch {}
    return { success: true };
  }

  window.ESHU_DB = {
    key: DB_KEY,
    schemaVersion: SCHEMA_VERSION,
    newId,
    ensure: ensureDb,
    getDb,
    setDb,
    subscribe,
    getTable,
    setTable,
    updateTable,
    getValue,
    setValue,
    getActiveProfileId,
    getProfileXp,
    setProfileXp,
    addProfileXp,
    getEntityById,
    isEntityActive,
    getActiveGroups,
    getLinkedEntities,
    getXpHistory,
    exportSnapshot,
    importSnapshot,
    exportDatabase,
    importDatabase,
    exportPostgresSnapshotSql,
    resetStorage,
    forceImportPrivatePrebuilt,
    isPrivatePrebuiltInstalled,
    uninstallPrivatePrebuilt,
    registerStorageDriver,
    configureStorageDriver,
    getStorageDriverName: () => activeStorageDriverName,
    purgeLegacyStorage
  };
})();
