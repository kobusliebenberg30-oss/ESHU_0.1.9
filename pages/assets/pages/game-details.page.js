(function () {
  'use strict';

  ESHU_DB.ensure();

  const pageParams = new URLSearchParams(window.location.search);
  const gameId = pageParams.get('id');
  const returnTo = pageParams.get('returnTo') || 'games.html';

  const backBtn = document.getElementById('backBtn');
  const gameImageFrame = document.getElementById('gameImageFrame');
  const runtime = window.ESHU_RUNTIME;

  // Builds diamond-framed game image markup
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
  const detailsGrid = document.getElementById('detailsGrid');
  const playBtn = document.getElementById('playBtn');
  const profileBtn = document.getElementById('profileBtn');
  const profileNameNav = document.getElementById('profileNameNav');
  const xpCounter = document.getElementById('xpCounter');

  function getProfiles() {
    return runtime?.getProfiles?.() || [];
  }

  function getActiveProfile() {
    return runtime?.getActiveProfile?.() || null;
  }

  function formatDate(value) {
    if (!value) return '—';
    const parsed = Number.isFinite(Number(value)) ? new Date(Number(value)) : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
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

  function renderTimingRow(game) {
    const subTime = game.submissionCloseTime || (game.startTime && game.endTime
      ? game.startTime + (game.endTime - game.startTime) * 0.8
      : null);

    const el = document.createElement('div');
    el.className = 'detail-item';
    el.innerHTML = `
      <div class="detail-label">Timing</div>
      <div class="timing-row">
        <div class="timing-item green">
          <div class="timing-item-label">Starts</div>
          <div class="timing-item-value">${formatDate(game.startTime)}</div>
        </div>
        <div class="timing-item yellow">
          <div class="timing-item-label">Subs Close</div>
          <div class="timing-item-value">${formatDate(subTime)}</div>
        </div>
        <div class="timing-item red">
          <div class="timing-item-label">Ends</div>
          <div class="timing-item-value">${formatDate(game.endTime)}</div>
        </div>
      </div>
    `;
    return el;
  }

  function getOwnerName(game) {
    if (!game.ownerProfileId) return 'Unknown';
    const profiles = getProfiles();
    const owner = profiles.find(p => p.id === game.ownerProfileId);
    return owner ? (owner.name || 'Unnamed') : 'Unknown';
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

  function render() {
    if (!gameId) {
      detailsGrid.innerHTML = '<div class="detail-item"><div class="detail-value">No game specified.</div></div>';
      return;
    }

    const games = ESHU_DB.getTable('games') || [];
    const game = games.find(g => g.id === gameId);

    if (!game) {
      detailsGrid.innerHTML = '<div class="detail-item"><div class="detail-value">Game not found.</div></div>';
      return;
    }

    // Image
    if (gameImageFrame) {
      gameImageFrame.innerHTML = game.image
        ? buildDiamondImageSvg(game.image)
        : `<img src="assets/images/diamond-logo.svg" alt="" class="game-placeholder-logo">`;
    }

    // Details grid
    detailsGrid.innerHTML = '';
    detailsGrid.appendChild(renderDetailItem('Title', game.name || 'Untitled'));
    detailsGrid.appendChild(renderDetailItem('Owner', getOwnerName(game)));
    detailsGrid.appendChild(renderDetailItem('Host Group', game.hostGroupName || '—'));

    // Build description with XP awards for default game
    let description = game.description || 'No description';
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
    detailsGrid.appendChild(renderDetailItem('Description', description));
    detailsGrid.appendChild(renderDetailItem('Rules', game.rules || 'No rules specified'));
    detailsGrid.appendChild(renderTimingRow(game));
    detailsGrid.appendChild(renderDetailItem('Privacy', game.privacy === 'private' ? 'Private' : 'Public'));
    detailsGrid.appendChild(renderDetailItem('Mode', game.gameType === 'book' ? 'Book' : 'Arena'));

    // Play button
    if (playBtn) {
      playBtn.onclick = () => {
        window.location.href = `eshu.html?gameId=${game.id}`;
      };
    }
  }

  // Back button
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = returnTo;
    });
  }

  renderNavProfile();
  renderXP();
  render();

  // Settings dropdown
  if (typeof SETTINGS_DROPDOWN !== 'undefined') {
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      SETTINGS_DROPDOWN.init(settingsBtn, () => renderNavProfile());
    }
  }

  // Messages dropdown
  if (typeof MESSAGES_DROPDOWN !== 'undefined') {
    const messagesBtn = document.getElementById('messagesBtn');
    const messagesDropdown = document.getElementById('messagesDropdown');
    if (messagesBtn && messagesDropdown) {
      MESSAGES_DROPDOWN.init(messagesBtn, messagesDropdown);
    }
  }
})();
