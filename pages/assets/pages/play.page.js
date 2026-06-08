(function () {
  'use strict';
  let pendingPlayNavigation = false;

  const playButton = document.getElementById('playButton');

  function getPlayTargetHref() {
    if (!playButton) return 'home.html';
    const href = playButton.getAttribute('href') || 'home.html';
    try {
      return new URL(href, window.location.href).href;
    } catch {
      return href;
    }
  }

  function enterApplication() {
    window.location.href = getPlayTargetHref();
  }

  window.addEventListener('eshu:auth-success', () => {
    if (!pendingPlayNavigation) return;
    pendingPlayNavigation = false;
    enterApplication();
  });

  async function handlePlayClick(event) {
    if (!playButton) return;
    event.preventDefault();

    if (playButton.dataset.authChecking === 'true') return;
    playButton.dataset.authChecking = 'true';

    try {
      pendingPlayNavigation = true;
      if (window.TOAST && typeof window.TOAST.info === 'function') {
        window.TOAST.info('Please sign in to continue.');
      }
      if (window.ESHU_AUTH_UI && typeof window.ESHU_AUTH_UI.open === 'function') {
        window.ESHU_AUTH_UI.open({ tab: 'signin', reloadOnSuccess: false });
        return;
      }

      pendingPlayNavigation = false;
      enterApplication();
    } finally {
      playButton.dataset.authChecking = 'false';
    }
  }

  if (playButton) {
    playButton.addEventListener('click', handlePlayClick);
  }
})();
