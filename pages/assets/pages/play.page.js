(function () {
  'use strict';

  const playButton = document.getElementById('playButton');

  function enterApplication() {
    window.location.href = 'home.html';
  }

  // After a successful sign-in on this page, go straight to home.
  window.addEventListener('eshu:auth-success', enterApplication);
  // After the remote driver activates (session already exists), go straight to home.
  window.addEventListener('eshu:remote-activated', enterApplication);

  async function handlePlayClick(event) {
    if (!playButton) return;
    event.preventDefault();

    if (playButton.dataset.authChecking === 'true') return;
    playButton.dataset.authChecking = 'true';

    try {
      // Already signed in — just enter.
      if (window.ESHU_AUTH) {
        enterApplication();
        return;
      }

      // Check the server session in case ESHU_AUTH hasn't been set yet.
      if (window.ESHU_API && typeof window.ESHU_API.auth.me === 'function') {
        try {
          const me = await window.ESHU_API.auth.me();
          if (me) { enterApplication(); return; }
        } catch {}
      }

      // Not signed in — open the auth overlay.
      if (window.ESHU_AUTH_UI && typeof window.ESHU_AUTH_UI.open === 'function') {
        window.ESHU_AUTH_UI.open({ tab: 'signin', reloadOnSuccess: false });
        return;
      }

      enterApplication();
    } finally {
      playButton.dataset.authChecking = 'false';
    }
  }

  if (playButton) {
    playButton.addEventListener('click', handlePlayClick);
  }
})();
