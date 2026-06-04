/**
 * XP Decay System
 * 
 * When the user presses Play, their current XP is "locked in" as xpAtPlay.
 * The XP then decays linearly from xpAtPlay down to 0 by the next sunrise (UTC).
 * 
 * Sunrise is approximated as 06:00 UTC the next day.
 * If current time is before 06:00 UTC today, sunrise = today 06:00 UTC.
 * If current time is after 06:00 UTC today, sunrise = tomorrow 06:00 UTC.
 * 
 * Values stored in ESHU_DB:
 *   xpPoints      - the "earned" XP total (only goes up when creating things)
 *   xpAtPlay      - the XP snapshot when Play was last pressed
 *   xpPlayTime    - timestamp (ms) when Play was pressed
 */
(function () {
  const SUNRISE_HOUR_UTC = 6;
  const R = 20;                    // ring radius for 46×46 viewBox
  const CIRC = 2 * Math.PI * R;    // circumference
  let legacyDecayMigrated = false;

  function migrateLegacyDecayKeys() {
    if (legacyDecayMigrated || typeof ESHU_DB === 'undefined') return;

    const activeProfileId = ESHU_DB.getActiveProfileId ? ESHU_DB.getActiveProfileId() : null;
    if (!activeProfileId) {
      legacyDecayMigrated = true;
      return;
    }

    const scopedAtPlayKey = `xpAtPlay_${activeProfileId}`;
    const scopedPlayTimeKey = `xpPlayTime_${activeProfileId}`;

    const scopedAtPlay = parseInt(ESHU_DB.getValue(scopedAtPlayKey) || 0, 10);
    const scopedPlayTime = parseInt(ESHU_DB.getValue(scopedPlayTimeKey) || 0, 10);
    const legacyAtPlay = parseInt(ESHU_DB.getValue('xpAtPlay') || 0, 10);
    const legacyPlayTime = parseInt(ESHU_DB.getValue('xpPlayTime') || 0, 10);

    if (!scopedAtPlay && legacyAtPlay > 0) {
      ESHU_DB.setValue(scopedAtPlayKey, legacyAtPlay);
    }
    if (!scopedPlayTime && legacyPlayTime > 0) {
      ESHU_DB.setValue(scopedPlayTimeKey, legacyPlayTime);
    }

    ESHU_DB.setValue('xpAtPlay', 0);
    ESHU_DB.setValue('xpPlayTime', 0);
    legacyDecayMigrated = true;
  }

  function getNextSunrise(fromMs) {
    const d = new Date(fromMs);
    const todaySunrise = new Date(Date.UTC(
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
      SUNRISE_HOUR_UTC, 0, 0, 0
    ));
    if (fromMs < todaySunrise.getTime()) return todaySunrise.getTime();
    const tomorrow = new Date(todaySunrise);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.getTime();
  }

  /**
   * Returns { displayXp, progress (0..1), active, totalXp }
   *   progress = 1 means just pressed Play (ring full / green)
   *   progress = 0 means sunrise reached (ring empty)
   *   active   = true when a decay session is running
   */
  function formatTimeLeft(ms) {
    if (ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  function getDecayState() {
    if (typeof ESHU_DB === 'undefined') return { displayXp: 0, progress: 0, active: false, totalXp: 0, timeLeft: '' };
    migrateLegacyDecayKeys();
    const activeProfileId = ESHU_DB.getActiveProfileId ? ESHU_DB.getActiveProfileId() : null;
    const totalXp = ESHU_DB.getProfileXp
      ? parseInt(ESHU_DB.getProfileXp(activeProfileId) || 0, 10)
      : parseInt(ESHU_DB.getValue('xpPoints') || 0, 10);
    const scopedAtPlayKey = activeProfileId ? `xpAtPlay_${activeProfileId}` : 'xpAtPlay';
    const scopedPlayTimeKey = activeProfileId ? `xpPlayTime_${activeProfileId}` : 'xpPlayTime';
    const xpAtPlay = parseInt(ESHU_DB.getValue(scopedAtPlayKey) || 0, 10);
    const xpPlayTime = parseInt(ESHU_DB.getValue(scopedPlayTimeKey) || 0, 10);

    if (xpPlayTime === 0) {
      return { displayXp: totalXp, progress: 0, active: false, totalXp: totalXp, timeLeft: '' };
    }

    const now = Date.now();
    const sunrise = getNextSunrise(xpPlayTime);

    if (now >= sunrise) {
      return { displayXp: 0, progress: 0, active: true, totalXp: totalXp, timeLeft: '0s' };
    }

    const totalDuration = sunrise - xpPlayTime;
    const elapsed = now - xpPlayTime;
    const remaining = Math.max(0, 1 - elapsed / totalDuration);
    const msLeft = sunrise - now;

    const xpEarnedAfter = Math.max(0, totalXp - xpAtPlay);
    const decayingXp = Math.round(xpAtPlay * remaining);
    const displayXp = decayingXp + xpEarnedAfter;

    return {
      displayXp: Math.max(0, displayXp),
      progress: remaining,
      active: true,
      totalXp: totalXp,
      timeLeft: formatTimeLeft(msLeft)
    };
  }

  function onPlay() {
    if (typeof ESHU_DB === 'undefined') return;
    const activeProfileId = ESHU_DB.getActiveProfileId ? ESHU_DB.getActiveProfileId() : null;
    const totalXp = ESHU_DB.getProfileXp
      ? parseInt(ESHU_DB.getProfileXp(activeProfileId) || 0, 10)
      : parseInt(ESHU_DB.getValue('xpPoints') || 0, 10);
    const scopedAtPlayKey = activeProfileId ? `xpAtPlay_${activeProfileId}` : 'xpAtPlay';
    const scopedPlayTimeKey = activeProfileId ? `xpPlayTime_${activeProfileId}` : 'xpPlayTime';
    ESHU_DB.setValue(scopedAtPlayKey, totalXp);
    ESHU_DB.setValue(scopedPlayTimeKey, Date.now());
  }

  function renderPlayButton(container) {
    if (!container) return;
    // Start with ring empty (fully offset)
    container.innerHTML = `
      <svg class="progress-ring" viewBox="0 0 46 46">
        <circle class="progress-ring-bg" cx="23" cy="23" r="${R}"/>
        <circle class="progress-ring-fill" cx="23" cy="23" r="${R}"
          stroke-dasharray="${CIRC}"
          stroke-dashoffset="${CIRC}"/>
      </svg>
      <a href="play.html" class="play-link" id="playLink">Play</a>
    `;
    // Intercept click: snapshot XP *before* navigating
    const link = container.querySelector('#playLink');
    if (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        onPlay();
        // Navigate after localStorage write is guaranteed
        window.location.href = 'play.html';
      });
    }
  }

  function updatePlayButton(container) {
    if (!container) return;
    const fill = container.querySelector('.progress-ring-fill');
    if (!fill) return;
    const state = getDecayState();
    // progress 1 = full ring (just pressed), 0 = empty ring (sunrise)
    const offset = CIRC * (1 - state.progress);
    fill.style.strokeDashoffset = offset;

    // Change ring color based on state
    if (state.active && state.progress > 0) {
      // Active decay — green ring draining
      fill.style.stroke = 'var(--accent-black)';
    } else if (state.active && state.progress <= 0) {
      // Sunrise reached — red ring
      fill.style.stroke = 'var(--accent-coral-dark)';
    }
  }

  function updateXpDisplay(xpEl) {
    if (!xpEl) return;
    const state = getDecayState();
    if (state.active && state.timeLeft) {
      xpEl.textContent = `XP: ${state.displayXp} \u00b7 ${state.timeLeft}`;
      xpEl.classList.add('xp-decaying');
    } else {
      xpEl.textContent = `XP: ${state.displayXp}`;
      xpEl.classList.remove('xp-decaying');
    }
  }

  function startDecayTimer(xpEl, playContainer) {
    function tick() {
      updateXpDisplay(xpEl);
      updatePlayButton(playContainer);
    }
    tick();
    return setInterval(tick, 1000);
  }

  window.XP_DECAY = {
    getNextSunrise,
    getDecayState,
    onPlay,
    renderPlayButton,
    updatePlayButton,
    updateXpDisplay,
    startDecayTimer
  };
})();
