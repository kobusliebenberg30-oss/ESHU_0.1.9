/**
 * Animation Player — Eshu Engine Component
 * Fullscreen modal for playing back saved animation drawings.
 * Reusable across all pages (creation-focus, games, eshu).
 *
 * Usage:
 *   ANIMATION_PLAYER.open(animationData, imageUrl);
 *   ANIMATION_PLAYER.close();
 */
(function () {
  'use strict';

  let modal = null;
  let player = null;

  function showHostMessage(message) {
    ensureModal();
    var host = modal.querySelector('.adraw-player-host');
    if (!host) return;
    host.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#fff;background:#111;">' +
        '<div style="max-width:520px;line-height:1.45;font-size:14px;opacity:.9;">' +
          String(message || 'Unable to load animation.') +
        '</div>' +
      '</div>';
    modal.classList.add('open');
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'adrawPlayerModal';
    modal.className = 'adraw-player-modal';
    modal.innerHTML =
      '<div class="adraw-player-inner">' +
        '<div class="adraw-player-host"></div>' +
        '<button class="adraw-player-close-btn" title="Close">&times;</button>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('.adraw-player-close-btn').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('adraw-player-inner')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });

    return modal;
  }

  function open(animationData, imageUrl, options) {
    if (!animationData) {
      console.warn('[AnimationPlayer] No animation data provided');
      showHostMessage('No animation data found for this item.');
      return;
    }
    
    if (typeof window.ANIMATION_DRAW === 'undefined' || typeof window.ANIMATION_DRAW.createPlayer !== 'function') {
      console.warn('[AnimationPlayer] ANIMATION_DRAW.createPlayer not available');
      showHostMessage('Animation player is not loaded yet. Please refresh and try again.');
      if (typeof window.TOAST !== 'undefined') {
        window.TOAST.error('Animation player not loaded. Please refresh.');
      }
      return;
    }
    
    if (!window.DRAWING_COMPOSITOR) {
      console.warn('[AnimationPlayer] DRAWING_COMPOSITOR not available');
      showHostMessage('Drawing compositor is unavailable. Please refresh and try again.');
      if (typeof window.TOAST !== 'undefined') {
        window.TOAST.error('Drawing compositor not loaded. Please refresh.');
      }
      return;
    }
    
    ensureModal();
    var host = modal.querySelector('.adraw-player-host');
    if (player) player.stop();
    
    // Clear previous content
    host.innerHTML = '';
    
    modal.style.background = (options && options.bgColor) ? options.bgColor : '';
    
    try {
      player = window.ANIMATION_DRAW.createPlayer(host, imageUrl || '', animationData, options || {});
      modal.classList.add('open');
    } catch (err) {
      console.error('[AnimationPlayer] Error starting playback:', err);
      showHostMessage('Failed to play this animation. Please try again.');
      if (typeof window.TOAST !== 'undefined') {
        window.TOAST.error('Failed to play animation. See console for details.');
      }
    }
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('open');
    if (player) { player.stop(); player = null; }
  }

  function isOpen() {
    return modal ? modal.classList.contains('open') : false;
  }

  // --- Animation data extraction helpers ---
  function extractAnimation(comment) {
    if (!comment || typeof comment !== 'object') return null;
    var candidates = [
      comment.animation,
      comment.animationData,
      comment.anim,
      comment.drawing,
      comment.drawingData
    ];
    for (var i = 0; i < candidates.length; i++) {
      var a = candidates[i];
      if (a && Array.isArray(a.layers) && a.layers.length) return a;
    }
    return null;
  }

  function hasAnimation(comment) {
    return !!extractAnimation(comment);
  }

  // Public API
  window.ANIMATION_PLAYER = {
    open: open,
    close: close,
    isOpen: isOpen,
    extractAnimation: extractAnimation,
    hasAnimation: hasAnimation
  };
})();
