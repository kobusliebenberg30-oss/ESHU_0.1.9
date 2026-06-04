(function () {
  'use strict';

  // ===== GAMES WIZARD PAGE =====

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

  // Initialize XP Counter
  const xpCounter = document.getElementById('xpCounter');
  const playWrapper = document.getElementById('playBtnWrapper');
  if (playWrapper) {
    playWrapper.innerHTML = '<a href="play.html" class="play-link" id="playLink">Play</a>';
  }
  if (xpCounter) {
    const xpPoints = parseInt(ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0, 10);
    xpCounter.textContent = xpPoints + ' XP';
  }

  // DOM Elements
  const gameListDiv = document.getElementById('gameList');
  const searchBox = document.getElementById('searchBox');
  const groupFilter = document.getElementById('groupFilter');
  const loadingOverlay = document.getElementById('loadingOverlay');

  // Wizard Elements
  const wizardOverlay = document.getElementById('wizardOverlay');
  const wizardClose = document.getElementById('wizardClose');
  const openWizardBtn = document.getElementById('openWizardBtn');
  const wizardGroupList = document.getElementById('wizardGroupList');

  // Wizard Steps
  const wizardStep1 = document.getElementById('wizardStep1');
  const wizardStep2 = document.getElementById('wizardStep2');
  const wizardStep3 = document.getElementById('wizardStep3');

  // Wizard Buttons
  const wizardCancel1 = document.getElementById('wizardCancel1');
  const wizardNext1 = document.getElementById('wizardNext1');
  const wizardBack2 = document.getElementById('wizardBack2');
  const wizardNext2 = document.getElementById('wizardNext2');
  const wizardBack3 = document.getElementById('wizardBack3');
  const wizardSubmit = document.getElementById('wizardSubmit');

  // Step 2 Elements
  const changeTimingBtn = document.getElementById('changeTimingBtn');
  const timingInline = document.getElementById('timingInline');
  const timingWarning = document.getElementById('timingWarning');
  const timingSetBtn = document.getElementById('timingSetBtn');
  const privacyInfo = document.getElementById('privacyInfo');
  const gameImagePreview = document.getElementById('gameImagePreview');
  const gameImageInput = document.getElementById('gameImageInput');
  const changeImageBtn = document.getElementById('changeImageBtn');

  // Step 3 Elements
  const gameTitle = document.getElementById('gameTitle');
  const gameDescription = document.getElementById('gameDescription');
  const gameRules = document.getElementById('gameRules');

  // Wizard State
  let wizardData = {
    step: 1,
    selectedGroupId: null,
    selectedGroupName: null,
    timingType: 'deadline',
    timingSet: false,
    privacy: 'public',
    gameType: 'arena', // 'arena' (random battle) or 'book' (chronological)
    // Independent timing controls
    start: { weeks: 0, days: 0, hours: 0, mins: 5 },
    submission: { weeks: 0, days: 0, hours: 23, mins: 15 },
    end: { weeks: 0, days: 1, hours: 0, mins: 0 },
    // Computed timestamps
    startTime: null,
    submissionCloseTime: null,
    endTime: null,
    gameImage: null,
    title: '',
    description: '',
    rules: ''
  };

  // ===== Initialize State from Storage =====
  function initializeApp() {
    try {
      ESHU_DB.ensure();

      STATE.batch(() => {
        STATE.set('games', ESHU_DB.getTable('games') || []);
        STATE.set('groups', ESHU_DB.getTable('groups') || []);
        STATE.set('xpPoints', ESHU_DB.getProfileXp(ESHU_DB.getActiveProfileId()) || 0);
        STATE.set('ui.loading', false);
        STATE.set('ui.searchQuery', '');
        STATE.set('ui.selectedGroup', '');
      });

      TOAST.success('Games loaded!');
    } catch (err) {
      console.error('Initialization error:', err);
      TOAST.error('Failed to load data.', 'Error');
      STATE.set('games', []);
      STATE.set('groups', []);
    }
  }

  // ===== Subscribe to State Changes =====
  STATE.subscribe('games', () => {
    renderGamesList();
    saveToStorage();
  });

  STATE.subscribe('groups', () => {
    populateGroupFilter();
    saveToStorage();
  });

  STATE.subscribe('ui.loading', (loading) => {
    loadingOverlay.classList.toggle('active', loading);
  });

  STATE.subscribe('ui.searchQuery', renderGamesList);
  STATE.subscribe('ui.selectedGroup', renderGamesList);

  // ===== Save to Storage =====
  function saveToStorage() {
    try {
      ESHU_DB.setTable('games', STATE.get('games'));
      ESHU_DB.setTable('groups', STATE.get('groups'));
      ESHU_DB.setProfileXp(ESHU_DB.getActiveProfileId(), STATE.get('xpPoints'));
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  // ===== Loading Helpers =====
  function showLoading() {
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }

  // ===== Populate Group Filter =====
  function populateGroupFilter() {
    const groups = STATE.get('groups') || [];
    groupFilter.innerHTML = '<option value="">All Groups</option>';
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      groupFilter.appendChild(opt);
    });
  }

  // ===== Render Games List =====
  function renderGamesList() {
    const games = STATE.get('games') || [];
    const groups = STATE.get('groups') || [];
    const searchQuery = STATE.get('ui.searchQuery') || '';
    const selectedGroup = STATE.get('ui.selectedGroup') || '';
    const now = Date.now();

    let filtered = games;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.name?.toLowerCase().includes(q) || 
        g.description?.toLowerCase().includes(q)
      );
    }

    if (selectedGroup) {
      filtered = filtered.filter(g => g.hostGroupId === selectedGroup);
    }

    if (filtered.length === 0) {
      gameListDiv.innerHTML = '<p style="color:#888;text-align:center;padding:40px;">No games found. Click CREATE GAME to add one!</p>';
      return;
    }

    gameListDiv.innerHTML = filtered.map(game => {
      const isFinished = game.status === 'finished' || (game.endTime && now > game.endTime);
      const isFutureStart = game.startTime > now;
      const hasTimingExtensions = game.timingExtensions && game.timingExtensions.length > 0;
      let timeInfo = '';
      let timeClass = '';
      let extensionTags = '';

      // Build timing extension tags
      if (hasTimingExtensions) {
        extensionTags = '<span class="timing-extension-tag extended">Extended</span>';
      }
      if (isFutureStart && !isFinished) {
        extensionTags += '<span class="timing-extension-tag future">Scheduled</span>';
      }

      // Game type badge
      const gameTypeBadge = game.gameType === 'book' 
        ? '<span style="font-size:10px;margin-left:4px;">📖</span>' 
        : '<span style="font-size:10px;margin-left:4px;">⚔️</span>';

      if (isFinished) {
        timeInfo = 'This game has finished';
        timeClass = 'finished';
      } else if (isFutureStart) {
        const diff = game.startTime - now;
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        if (d > 0) {
          timeInfo = `Starts in ${d}d ${h}h`;
        } else {
          timeInfo = `Starts in ${h}h ${m}m`;
        }
        timeClass = 'starting';
      } else if (game.endTime) {
        const diff = game.endTime - now;
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        timeInfo = `${d}d ${h}h remaining`;
        timeClass = 'running';
      } else {
        timeInfo = 'Infinite';
        timeClass = 'running';
      }

      return `
        <div class="game-card ${isFinished ? 'finished' : ''}" data-id="${game.id}">
          <div class="game-card-header">
            <div class="game-card-icon">
              ${game.image
                ? buildDiamondImageSvg(game.image)
                : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`}
            </div>
            <div class="game-card-info">
              <h3 class="game-card-title">${game.name || 'Untitled Game'}${gameTypeBadge}</h3>
              <div class="game-card-group">${game.hostGroupName || 'No group'}${extensionTags}</div>
            </div>
          </div>
          <div class="game-card-time ${timeClass}">${timeInfo}</div>
          ${!isFinished ? `
            <div class="game-card-actions">
              <button class="edit-btn" onclick="editGame('${game.id}')">Edit</button>
              <button class="delete-btn" onclick="deleteGame('${game.id}')">Delete</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // ===== Delete Game =====
  window.deleteGame = async function(gameId) {
    const yes = await MODAL.confirm({ title: 'Delete Game', message: 'Delete this game?', danger: true, confirmLabel: 'Delete' });
    if (!yes) return;
    const games = STATE.get('games').filter(g => g.id !== gameId);
    STATE.set('games', games);
    TOAST.success('Game deleted!');
  };

  // ===== Edit Game (placeholder) =====
  window.editGame = function(gameId) {
    TOAST.info('Edit functionality coming soon!');
  };

  // ===== Search & Filter =====
  searchBox.addEventListener('input', (e) => {
    STATE.set('ui.searchQuery', e.target.value);
  });

  groupFilter.addEventListener('change', (e) => {
    STATE.set('ui.selectedGroup', e.target.value);
  });

  // ===== WIZARD FUNCTIONS =====

  function openWizard() {
    resetWizard();
    wizardOverlay.classList.add('open');
    populateWizardGroups();
  }

  function closeWizard() {
    wizardOverlay.classList.remove('open');
  }

  function resetWizard() {
    wizardData = {
      step: 1,
      selectedGroupId: null,
      selectedGroupName: null,
      timingType: 'deadline',
      timingSet: false,
      privacy: 'public',
      gameType: 'arena',
      start: { weeks: 0, days: 0, hours: 0, mins: 0 },
      submission: { weeks: 2, days: 3, hours: 12, mins: 0 },
      end: { weeks: 2, days: 5, hours: 23, mins: 45 },
      startTime: null,
      submissionCloseTime: null,
      endTime: null,
      gameImage: null,
      title: '',
      description: '',
      rules: ''
    };

    // Reset UI
    showStep(1);
    timingInline.classList.remove('open');
    timingWarning.textContent = 'Some timing needs to be set';
    timingWarning.classList.remove('set');
    gameTitle.value = '';
    gameDescription.value = '';
    gameRules.value = '';

    // Reset radio buttons
    document.querySelector('input[name="timingType"][value="deadline"]').checked = true;
    document.querySelector('input[name="privacy"][value="public"]').checked = true;
    document.querySelector('input[name="gameType"][value="arena"]').checked = true;

    // Reset game type UI
    document.querySelectorAll('.game-type-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.type === 'arena');
    });

    // Reset timing wheel values
    resetTimingWheelValues();

    // Reset image
    gameImagePreview.innerHTML = '<div class="eshu-logo"></div>';

    updatePrivacyInfo();
    updateSchedulePreview();
  }

  function resetTimingWheelValues() {
    // Reset start timing wheels
    document.querySelectorAll('.timing-wheel-value[data-timing="start"]').forEach(el => {
      const unit = el.dataset.unit;
      el.textContent = wizardData.start[unit];
    });
    // Reset submission timing wheels
    document.querySelectorAll('.timing-wheel-value[data-timing="submission"]').forEach(el => {
      const unit = el.dataset.unit;
      el.textContent = wizardData.submission[unit];
    });
    // Reset end timing wheels
    document.querySelectorAll('.timing-wheel-value[data-timing="end"]').forEach(el => {
      const unit = el.dataset.unit;
      el.textContent = wizardData.end[unit];
    });
  }

  function showStep(step) {
    wizardData.step = step;
    wizardStep1.classList.toggle('active', step === 1);
    wizardStep2.classList.toggle('active', step === 2);
    wizardStep3.classList.toggle('active', step === 3);
  }

  function populateWizardGroups() {
    const groups = STATE.get('groups') || [];
    const activeProfileId = ESHU_DB.getActiveProfileId && ESHU_DB.getActiveProfileId();
    const visibleGroups = activeProfileId
      ? groups.filter(g => !g || g.ownerProfileId === activeProfileId || (Array.isArray(g.memberProfileIds) && g.memberProfileIds.includes(activeProfileId)))
      : groups;
    
    if (visibleGroups.length === 0) {
      wizardGroupList.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No groups available. Create a group first!</div>';
      return;
    }

    wizardGroupList.innerHTML = visibleGroups.map(g => `
      <div class="group-list-item" data-id="${g.id}" data-name="${g.name}">
        <div class="group-list-item-icon"></div>
        <div class="group-list-item-name">${g.name}</div>
        <div class="group-list-item-check">✓</div>
      </div>
    `).join('');

    // Add click handlers
    wizardGroupList.querySelectorAll('.group-list-item').forEach(item => {
      item.addEventListener('click', () => {
        wizardGroupList.querySelectorAll('.group-list-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        wizardData.selectedGroupId = item.dataset.id;
        wizardData.selectedGroupName = item.dataset.name;
      });
    });
  }

  function updateSchedulePreview() {
    const now = new Date();

    // Calculate start time offset
    const startOffsetMs = (
      (wizardData.start.weeks * 7 * 24 * 60 * 60 * 1000) +
      (wizardData.start.days * 24 * 60 * 60 * 1000) +
      (wizardData.start.hours * 60 * 60 * 1000) +
      (wizardData.start.mins * 60 * 1000)
    );

    // Calculate submission close time offset
    const submissionOffsetMs = (
      (wizardData.submission.weeks * 7 * 24 * 60 * 60 * 1000) +
      (wizardData.submission.days * 24 * 60 * 60 * 1000) +
      (wizardData.submission.hours * 60 * 60 * 1000) +
      (wizardData.submission.mins * 60 * 1000)
    );

    // Calculate end time offset
    const endOffsetMs = (
      (wizardData.end.weeks * 7 * 24 * 60 * 60 * 1000) +
      (wizardData.end.days * 24 * 60 * 60 * 1000) +
      (wizardData.end.hours * 60 * 60 * 1000) +
      (wizardData.end.mins * 60 * 1000)
    );

    const startDate = new Date(now.getTime() + startOffsetMs);
    const submissionsDate = new Date(now.getTime() + submissionOffsetMs);
    const endDate = new Date(now.getTime() + endOffsetMs);

    const formatTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const formatDate = (d) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    const formatShortDate = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

    // Update main schedule preview cards
    const scheduleStart = document.getElementById('scheduleStart');
    const scheduleStartDate = document.getElementById('scheduleStartDate');
    const scheduleSubmissions = document.getElementById('scheduleSubmissions');
    const scheduleSubmissionsDate = document.getElementById('scheduleSubmissionsDate');
    const scheduleEnd = document.getElementById('scheduleEnd');
    const scheduleEndDate = document.getElementById('scheduleEndDate');

    if (scheduleStart) scheduleStart.textContent = formatTime(startDate);
    if (scheduleStartDate) scheduleStartDate.textContent = formatShortDate(startDate);
    if (scheduleSubmissions) scheduleSubmissions.textContent = formatTime(submissionsDate);
    if (scheduleSubmissionsDate) scheduleSubmissionsDate.textContent = formatShortDate(submissionsDate);
    if (scheduleEnd) scheduleEnd.textContent = formatTime(endDate);
    if (scheduleEndDate) scheduleEndDate.textContent = formatShortDate(endDate);

    // Update inline preview times
    const startPreviewTime = document.getElementById('startPreviewTime');
    const startPreviewDate = document.getElementById('startPreviewDate');
    const submissionPreviewTime = document.getElementById('submissionPreviewTime');
    const submissionPreviewDate = document.getElementById('submissionPreviewDate');
    const endPreviewTime = document.getElementById('endPreviewTime');
    const endPreviewDate = document.getElementById('endPreviewDate');

    if (startPreviewTime) startPreviewTime.textContent = startOffsetMs === 0 ? 'Now' : formatTime(startDate);
    if (startPreviewDate) startPreviewDate.textContent = startOffsetMs === 0 ? 'Today' : formatDate(startDate);
    if (submissionPreviewTime) submissionPreviewTime.textContent = formatTime(submissionsDate);
    if (submissionPreviewDate) submissionPreviewDate.textContent = formatDate(submissionsDate);
    if (endPreviewTime) endPreviewTime.textContent = formatTime(endDate);
    if (endPreviewDate) endPreviewDate.textContent = formatDate(endDate);
  }

  function updatePrivacyInfo() {
    const privacy = wizardData.privacy;
    if (privacy === 'public') {
      privacyInfo.innerHTML = `
        <div class="privacy-info-label">In a Public game:</div>
        <div class="privacy-info-tags">
          <div class="privacy-tag green">Anyone can vote</div>
          <div class="privacy-tag coral">Anyone can submit creations</div>
        </div>
      `;
    } else {
      privacyInfo.innerHTML = `
        <div class="privacy-info-label">In a Private game:</div>
        <div class="privacy-info-tags">
          <div class="privacy-tag dark">Only invited members can participate</div>
        </div>
      `;
    }
  }

  async function submitGame() {
    // Validate
    if (!wizardData.selectedGroupId) {
      TOAST.error('Please select a group');
      showStep(1);
      return;
    }

    if (wizardData.timingType === 'deadline' && !wizardData.timingSet) {
      TOAST.error('Please set the timing');
      showStep(2);
      return;
    }

    if (!gameTitle.value.trim()) {
      TOAST.error('Please enter a title');
      return;
    }

    const now = Date.now();
    let startTime = now;
    let submissionCloseTime = null;
    let endTime = null;

    if (wizardData.timingType === 'deadline' && wizardData.timingSet) {
      startTime = wizardData.startTime;
      submissionCloseTime = wizardData.submissionCloseTime;
      endTime = wizardData.endTime;
      const isImmediateStart = getOffsetMs(wizardData.start) === 0;

      if (isImmediateStart) {
        startTime = now;
      } else if (startTime < now) {
        TOAST.error('Game start time cannot be in the past.');
        return;
      }
      if (startTime >= submissionCloseTime) {
        TOAST.error('Game must start before submissions close.');
        return;
      }
      if (submissionCloseTime >= endTime) {
        TOAST.error('Submissions must close before the game ends.');
        return;
      }
    }

    showLoading();

    try {

      const newGame = {
        id: 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: gameTitle.value.trim(),
        description: gameDescription.value.trim(),
        rules: gameRules.value.trim(),
        hostGroupId: wizardData.selectedGroupId,
        hostGroupName: wizardData.selectedGroupName,
        startTime: startTime,
        submissionCloseTime: submissionCloseTime,
        endTime: endTime,
        privacy: wizardData.privacy,
        gameType: wizardData.gameType, // 'arena' or 'book'
        image: wizardData.gameImage,
        createdAt: now,
        status: 'active',
        timingExtensions: []
      };

      const games = STATE.get('games');
      STATE.set('games', [newGame, ...games]);

      let awardResult = null;
      try {
        awardResult = await ESHU_API.xp.awardSafe('game_created', newGame.id);
      } catch (xpErr) {
        console.warn('[games-wizard] XP award failed after game creation:', xpErr);
      }
      if (awardResult) {
        STATE.set('xpPoints', awardResult.xpPoints);
        if (window.XP_ANIM && awardResult.delta > 0) XP_ANIM.show(awardResult.delta);
      }

      TOAST.success(`Game "${newGame.name}" created!`);
      closeWizard();

    } catch (err) {
      console.error('Submit error:', err);
      TOAST.error('Failed to create game');
    } finally {
      hideLoading();
    }
  }

  // ===== Wizard Event Listeners =====

  openWizardBtn.addEventListener('click', openWizard);
  wizardClose.addEventListener('click', closeWizard);
  wizardOverlay.addEventListener('click', (e) => {
    if (e.target === wizardOverlay) closeWizard();
  });

  // Step navigation
  wizardCancel1.addEventListener('click', closeWizard);
  wizardNext1.addEventListener('click', () => {
    if (!wizardData.selectedGroupId) {
      TOAST.error('Please select a group');
      return;
    }
    showStep(2);
  });

  wizardBack2.addEventListener('click', () => showStep(1));
  wizardNext2.addEventListener('click', () => {
    if (wizardData.timingType === 'deadline' && !wizardData.timingSet) {
      TOAST.error('Please set the timing first');
      return;
    }
    showStep(3);
  });

  wizardBack3.addEventListener('click', () => showStep(2));
  wizardSubmit.addEventListener('click', submitGame);

  // Timing type toggle
  document.querySelectorAll('input[name="timingType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      wizardData.timingType = e.target.value;
      if (e.target.value === 'infinite') {
        timingWarning.textContent = 'Game will run indefinitely';
        timingWarning.classList.add('set');
        wizardData.timingSet = true;
      } else {
        if (!wizardData.timingSet) {
          timingWarning.textContent = 'Some timing needs to be set';
          timingWarning.classList.remove('set');
        }
      }
    });
  });

  // Privacy toggle
  document.querySelectorAll('input[name="privacy"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      wizardData.privacy = e.target.value;
      updatePrivacyInfo();
    });
  });

  // Game type toggle
  document.querySelectorAll('.game-type-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const type = opt.dataset.type;
      wizardData.gameType = type;
      
      // Update UI
      document.querySelectorAll('.game-type-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.type === type);
      });
      
      // Update radio button
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  // Change timing button
  changeTimingBtn.addEventListener('click', () => {
    timingInline.classList.toggle('open');
    updateSchedulePreview();
  });

  // Timing wheel mouse wheel interaction
  document.querySelectorAll('.timing-wheel-value').forEach(wheel => {
    // Define max values for each unit
    const maxValues = { weeks: 52, days: 6, hours: 23, mins: 59 };
    
    // Mouse wheel handler
    wheel.addEventListener('wheel', (e) => {
      e.preventDefault();
      const timing = wheel.dataset.timing; // 'start', 'submission', or 'end'
      const unit = wheel.dataset.unit; // 'weeks', 'days', 'hours', 'mins'
      
      // Get current value
      let currentValue = wizardData[timing][unit];
      
      // Adjust value based on scroll direction
      if (e.deltaY < 0) {
        // Scroll up - increase
        currentValue = Math.min(currentValue + 1, maxValues[unit]);
      } else {
        // Scroll down - decrease
        currentValue = Math.max(currentValue - 1, 0);
      }
      
      // Update state
      wizardData[timing][unit] = currentValue;
      
      // Update display
      wheel.textContent = currentValue;
      
      // Update preview
      updateSchedulePreview();
    }, { passive: false });
    
    // Click to increment (alternative interaction)
    wheel.addEventListener('click', (e) => {
      const timing = wheel.dataset.timing;
      const unit = wheel.dataset.unit;
      
      let currentValue = wizardData[timing][unit];
      currentValue = (currentValue + 1) % (maxValues[unit] + 1);
      
      wizardData[timing][unit] = currentValue;
      wheel.textContent = currentValue;
      updateSchedulePreview();
    });
  });

  // Set timing button
  function getOffsetMs(parts) {
    return (
      (parts.weeks * 7 * 24 * 60 * 60 * 1000) +
      (parts.days * 24 * 60 * 60 * 1000) +
      (parts.hours * 60 * 60 * 1000) +
      (parts.mins * 60 * 1000)
    );
  }

  timingSetBtn.addEventListener('click', () => {
    const now = Date.now();
    
    const startOffsetMs = getOffsetMs(wizardData.start);
    
    const submissionOffsetMs = getOffsetMs(wizardData.submission);
    
    const endOffsetMs = getOffsetMs(wizardData.end);

    wizardData.startTime = now + startOffsetMs;
    wizardData.submissionCloseTime = now + submissionOffsetMs;
    wizardData.endTime = now + endOffsetMs;
    wizardData.timingSet = true;

    // Build timing summary text
    const formatOffset = (obj) => {
      const parts = [];
      if (obj.weeks > 0) parts.push(`${obj.weeks}w`);
      if (obj.days > 0) parts.push(`${obj.days}d`);
      if (obj.hours > 0) parts.push(`${obj.hours}h`);
      if (obj.mins > 0) parts.push(`${obj.mins}m`);
      return parts.length > 0 ? parts.join(' ') : 'Now';
    };

    const startText = startOffsetMs === 0 ? 'Starts now' : `Starts in ${formatOffset(wizardData.start)}`;
    const endText = `Ends in ${formatOffset(wizardData.end)}`;
    
    timingWarning.textContent = `${startText} · ${endText}`;
    timingWarning.classList.add('set');
    timingInline.classList.remove('open');

    TOAST.success('Timing set!');
  });

  // Image upload
  changeImageBtn.addEventListener('click', () => {
    gameImageInput.click();
  });

  gameImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        wizardData.gameImage = ev.target.result;
        gameImagePreview.innerHTML = `<img src="${ev.target.result}" alt="Game image">`;
      };
      reader.readAsDataURL(file);
    }
  });

  // ===== Initialize =====
  window.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    populateGroupFilter();
    renderGamesList();
  });
})();
