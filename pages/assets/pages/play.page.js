(function () {
  'use strict';

  const playButton = document.getElementById('playButton');
  const COLOR_INTERVAL_MS = 20000;
  let colorTimer = null;

  function enterApplication() {
    window.location.href = 'home.html';
  }

  function randomRelaxedColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 48 + Math.floor(Math.random() * 18);
    const lightness = 78 + Math.floor(Math.random() * 12);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }

  function cycleLandingColor() {
    document.body.style.backgroundColor = randomRelaxedColor();
  }

  function startLandingColorCycle() {
    if (colorTimer) return;
    cycleLandingColor();
    colorTimer = window.setInterval(cycleLandingColor, COLOR_INTERVAL_MS);
  }

  function stopLandingColorCycle() {
    if (colorTimer) window.clearInterval(colorTimer);
    colorTimer = null;
    document.body.style.backgroundColor = '#ffffff';
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
    playButton.addEventListener('mouseenter', startLandingColorCycle);
    playButton.addEventListener('focus', startLandingColorCycle);
    playButton.addEventListener('mouseleave', stopLandingColorCycle);
    playButton.addEventListener('blur', stopLandingColorCycle);
  }
})();
