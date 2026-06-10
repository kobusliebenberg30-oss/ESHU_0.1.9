/**
 * XP History Panel & +XP Animation
 * Shared component — include after eshu-db.js on any page with #xpCounter.
 */
(function () {
  'use strict';

  const xpCounter = document.getElementById('xpCounter');
  if (!xpCounter) return;

  // ===== Inject panel HTML =====
  const panel = document.createElement('div');
  panel.className = 'xp-history-panel';
  panel.id = 'xpHistoryPanel';
  panel.innerHTML = `
    <div class="xp-history-panel-header">
      <h3>XP History</h3>
      <div class="xp-history-panel-actions">
        <button class="xp-history-panel-info" id="xpHistoryPanelInfo" title="XP Awards">i</button>
        <button class="xp-history-panel-close" id="xpHistoryPanelClose">&#10005;</button>
      </div>
    </div>
    <div class="xp-history-panel-content" id="xpHistoryPanelContent"></div>
    <div class="xp-history-awards" id="xpHistoryAwards" style="display:none;">
      <div class="xp-history-awards-header">
        <h4>🏆 XP AWARDS</h4>
        <button class="xp-history-awards-close" id="xpHistoryAwardsClose">&#10005;</button>
      </div>
      <div class="xp-history-awards-list">
        <div class="xp-award-item"><span class="xp-award-amount">+1</span> <span class="xp-award-reason">Uploaded creation</span></div>
        <div class="xp-award-item"><span class="xp-award-amount">+1</span> <span class="xp-award-reason">Comment posted</span></div>
        <div class="xp-award-item"><span class="xp-award-amount">+2</span> <span class="xp-award-reason">Animated comment</span></div>
        <div class="xp-award-item"><span class="xp-award-amount">+2</span> <span class="xp-award-reason">Created a game</span></div>
        <div class="xp-award-item"><span class="xp-award-amount">+5</span> <span class="xp-award-reason">1st place in competition</span></div>
        <div class="xp-award-item"><span class="xp-award-amount">+4</span> <span class="xp-award-reason">2nd place in competition</span></div>
        <div class="xp-award-item"><span class="xp-award-amount">+3</span> <span class="xp-award-reason">3rd place in competition</span></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const content = document.getElementById('xpHistoryPanelContent');
  const closeBtn = document.getElementById('xpHistoryPanelClose');
  const infoBtn = document.getElementById('xpHistoryPanelInfo');
  const awardsSection = document.getElementById('xpHistoryAwards');
  const awardsCloseBtn = document.getElementById('xpHistoryAwardsClose');

  // ===== Time formatting =====
  function formatTs(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ===== Render =====
  async function loadRemoteHistory() {
    if (!window.ESHU_API || !ESHU_API.xp || typeof ESHU_API.xp.history !== 'function') return null;
    const remoteMode = !!(
      window.ESHU_REMOTE &&
      typeof window.ESHU_REMOTE.isEnabled === 'function' &&
      window.ESHU_REMOTE.isEnabled()
    );
    if (!remoteMode) return null;
    try {
      const result = await ESHU_API.xp.history(50);
      const awards = Array.isArray(result && result.awards) ? result.awards : [];
      return awards.map(function (award) {
        return {
          amount: Number(award.amount) || 0,
          reason: award.reason || 'XP earned',
          timestamp: award.awardedAt ? Date.parse(award.awardedAt) : Date.now(),
          totalAfter: null
        };
      });
    } catch (err) {
      console.warn('[xp-history] remote history failed:', err);
      return null;
    }
  }

  async function render() {
    if (!content) return;
    var profileId = null;
    if (typeof ESHU_DB !== 'undefined') {
      profileId = ESHU_DB.getActiveProfileId();
    }
    content.innerHTML = '<p style="color:#888;text-align:center;margin-top:32px;">Loading XP history...</p>';
    var history = await loadRemoteHistory();
    if (!history) {
      history = (typeof ESHU_DB !== 'undefined' && ESHU_DB.getXpHistory)
      ? ESHU_DB.getXpHistory(profileId) : [];
    }

    if (history.length === 0) {
      content.innerHTML = '<p style="color:#888;text-align:center;margin-top:32px;">No XP history yet.</p>';
      return;
    }

    content.innerHTML = history.map(function (e) {
      var sign = e.amount >= 0 ? '+' : '';
      var cls = e.amount >= 0 ? 'positive' : 'negative';
      return '<div class="xp-history-item">' +
        '<div class="xp-history-amount ' + cls + '">' + sign + e.amount + '</div>' +
        '<div class="xp-history-info">' +
          '<div class="xp-history-reason" title="' + (e.reason || '') + '">' + (e.reason || 'XP earned') + '</div>' +
          '<div class="xp-history-meta">' + formatTs(e.timestamp) + '</div>' +
        '</div>' +
        '<div class="xp-history-total">' + (e.totalAfter == null ? '' : e.totalAfter + ' XP') + '</div>' +
      '</div>';
    }).join('');
  }

  // ===== Toggle panel =====
  xpCounter.addEventListener('click', function () {
    render().catch(function (err) { console.warn('[xp-history] render failed:', err); });
    panel.classList.toggle('open');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      panel.classList.remove('open');
    });
  }

  // Toggle awards section
  if (infoBtn && awardsSection) {
    infoBtn.addEventListener('click', function () {
      awardsSection.style.display = awardsSection.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (awardsCloseBtn && awardsSection) {
    awardsCloseBtn.addEventListener('click', function () {
      awardsSection.style.display = 'none';
    });
  }

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (panel.classList.contains('open') && !panel.contains(e.target) && !xpCounter.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // ===== +XP float animation =====
  window.XP_ANIM = {
    show: function (amount) {
      if (!xpCounter || !amount) return;
      var el = document.createElement('span');
      el.className = 'xp-float';
      el.textContent = '+' + amount;
      xpCounter.appendChild(el);
      el.addEventListener('animationend', function () { el.remove(); });
      // Safety fallback
      setTimeout(function () { if (el.parentNode) el.remove(); }, 1500);
    }
  };
})();
