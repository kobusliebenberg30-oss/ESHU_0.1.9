/**
 * Toast Notification System
 * Provides user feedback for actions with auto-dismiss
 */
(function() {
  'use strict';

  class ToastManager {
    constructor() {
      this.container = null;
      this.interactionLockOverlay = null;
      this.interactionLockTimer = null;
      this.toasts = new Map();
      this.defaultDuration = 3000;
      this.maxToasts = 5;
      this.rapidHitWindowMs = 2200;
      this.rapidHitThreshold = 5;
      this.rapidCooldownMs = 8000;
      this.rapidHitTimestamps = [];
      this.rapidCooldownUntil = 0;
      this.cooldownToastId = null;
      this.cooldownTicker = null;
      this.history = [];
      this.maxHistory = 200;
      this.init();
    }

    init() {
      if (this.container) return;

      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-atomic', 'true');
      document.body.appendChild(this.container);

      this.injectStyles();
      this.initRapidHitGuard();
    }

    injectStyles() {
      if (document.getElementById('toast-styles')) return;

      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        .toast-container {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10000;
          display: flex;
          flex-direction: column-reverse;
          gap: 8px;
          pointer-events: none;
        }

        .toast {
          width: 360px;
          min-width: 360px;
          max-width: 360px;
          min-height: 66px;
          padding: 14px 16px;
          background: var(--bg-panel, #fff);
          border-radius: 0;
          box-shadow: none;
          display: block;
          pointer-events: auto;
          border: none;
          position: relative;
          overflow: hidden;
          opacity: 1;
          transition: opacity 0.12s linear;
        }

        .toast.toast-exit {
          opacity: 0;
        }

        .toast-content {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
        }

        .toast-message {
          font-size: 12px;
          line-height: 1.25;
          letter-spacing: 0.01em;
          color: var(--text-primary, #111);
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          word-break: break-word;
          text-align: center;
        }

        .toast-progress {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: var(--accent-black, #111111);
        }

        /* Dark theme */
        html[data-theme="dark"] .toast {
          background: var(--bg-panel, #111111);
        }

        .toast-interaction-lock {
          position: fixed;
          inset: 0;
          z-index: 10010;
          pointer-events: auto;
          background: transparent;
          cursor: not-allowed;
        }

        html[data-theme="dark"] .toast-message {
          color: var(--text-primary, #f5f5f5);
        }

        /* Mobile responsive */
        @media (max-width: 640px) {
          .toast-container {
            bottom: 12px;
            left: 12px;
            right: 12px;
            transform: none;
          }

          .toast {
            width: 100%;
            min-width: 0;
            max-width: none;
          }

          .hype-modal-text {
            width: min(92vw, 460px);
            text-align: center;
          }
        }

        .hype-modal {
          position: fixed;
          inset: 0;
          z-index: 10020;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          background: rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(1px);
          touch-action: none;
        }

        .hype-modal-text {
          background: #050607;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: var(--radius-xl, 8px);
          padding: 20px 34px;
          min-width: min(88vw, 400px);
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-align: center;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
          animation: hypePopInOut 1500ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes hypePopInOut {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.86);
            filter: blur(2px);
          }
          18% {
            opacity: 1;
            transform: translateY(0) scale(1.02);
            filter: blur(0);
          }
          72% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-10px) scale(1.06);
          }
        }
      `;
      document.head.appendChild(style);
    }

    initRapidHitGuard() {
      document.addEventListener('pointerdown', () => {
        this.trackRapidHit();
      }, { passive: true });
    }

    trackRapidHit() {
      const now = Date.now();
      if (now < this.rapidCooldownUntil) {
        this.showCooldownWarning(this.rapidCooldownUntil - now);
        return;
      }

      this.rapidHitTimestamps.push(now);
      this.rapidHitTimestamps = this.rapidHitTimestamps.filter(ts => (now - ts) <= this.rapidHitWindowMs);

      if (this.rapidHitTimestamps.length < this.rapidHitThreshold) return;

      this.rapidHitTimestamps = [];
      this.rapidCooldownUntil = now + this.rapidCooldownMs;
      this.lockInteractions(this.rapidCooldownMs);
      this.showCooldownWarning(this.rapidCooldownMs);
    }

    showCooldownWarning(remainingMs) {
      const seconds = Math.max(1, Math.ceil((Number(remainingMs) || 0) / 1000));
      const message = `Hey, slow down tiger! ${seconds} seconds remaining...`;

      if (this.cooldownToastId && this.updateToastMessage(this.cooldownToastId, message)) {
        return this.cooldownToastId;
      }

      const id = this.warning(message, '', {
        duration: 0,
        dismissible: false,
        forceStack: true
      });

      if (id) {
        this.cooldownToastId = id;
      }

      this.startCooldownTicker();
      return id;
    }

    startCooldownTicker() {
      if (this.cooldownTicker) return;

      this.cooldownTicker = setInterval(() => {
        const remainingMs = this.rapidCooldownUntil - Date.now();
        if (remainingMs <= 0) {
          this.clearCooldownWarning();
          return;
        }
        this.showCooldownWarning(remainingMs);
      }, 250);
    }

    clearCooldownWarning() {
      if (this.cooldownTicker) {
        clearInterval(this.cooldownTicker);
        this.cooldownTicker = null;
      }

      if (this.cooldownToastId && this.toasts.has(this.cooldownToastId)) {
        this.dismiss(this.cooldownToastId);
      }
      this.cooldownToastId = null;
    }

    updateToastMessage(id, message) {
      const toastData = this.toasts.get(id);
      if (!toastData || !toastData.element) return false;

      const messageNode = toastData.element.querySelector('.toast-message');
      if (!messageNode) return false;

      messageNode.textContent = message;
      return true;
    }

    lockInteractions(durationMs = 8000) {
      if (!this.interactionLockOverlay) {
        const overlay = document.createElement('div');
        overlay.className = 'toast-interaction-lock';
        overlay.setAttribute('aria-hidden', 'true');
        this.interactionLockOverlay = overlay;
      }

      if (!this.interactionLockOverlay.parentNode) {
        document.body.appendChild(this.interactionLockOverlay);
      }

      if (this.interactionLockTimer) {
        clearTimeout(this.interactionLockTimer);
      }

      this.interactionLockTimer = setTimeout(() => {
        if (this.interactionLockOverlay && this.interactionLockOverlay.parentNode) {
          this.interactionLockOverlay.parentNode.removeChild(this.interactionLockOverlay);
        }
        this.clearCooldownWarning();
        this.interactionLockTimer = null;
      }, Math.max(0, Number(durationMs) || 0));
    }

    /**
     * Show a toast notification
     * @param {Object} options - Toast options
     * @returns {string} Toast ID
     */
    show(options = {}) {
      const {
        type = 'info',
        title = '',
        message = '',
        duration = this.defaultDuration,
        dismissible = true,
        action = null,
        forceStack = false
      } = options;

      // Limit number of toasts (keep first 5 visible as a stable stack)
      if (this.toasts.size >= this.maxToasts) {
        if (forceStack) {
          const firstToast = this.toasts.keys().next().value;
          if (firstToast) this.dismiss(firstToast);
        } else {
          return null;
        }
      }

      if (this.toasts.size >= this.maxToasts) {
        return null;
      }

      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const toast = this.createToast(id, type, title, message, dismissible, action, duration);
      
      this.container.appendChild(toast);
      this.toasts.set(id, { element: toast, timer: null });

      // Auto dismiss
      if (duration > 0) {
        const timer = setTimeout(() => this.dismiss(id), duration);
        this.toasts.get(id).timer = timer;
      }

      return id;
    }

    showHype(message = 'RIGHT ON!', options = {}) {
      const { duration = 1500, onComplete = null } = options;
      const hype = document.createElement('div');
      hype.className = 'hype-modal';
      hype.innerHTML = `<div class="hype-modal-text">${this.escapeHtml(message)}</div>`;

      const text = hype.querySelector('.hype-modal-text');
      if (text) {
        text.style.animationDuration = `${Math.max(1000, Number(duration) || 1500)}ms`;
      }

      document.body.appendChild(hype);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (hype.parentNode) {
          hype.parentNode.removeChild(hype);
        }
        if (typeof onComplete === 'function') {
          onComplete();
        }
      };

      if (text) {
        text.addEventListener('animationend', cleanup, { once: true });
      }

      setTimeout(cleanup, Math.max(1100, Number(duration) || 1500) + 120);
      return hype;
    }

    createToast(id, type, title, message, dismissible, action, duration) {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.setAttribute('role', 'alert');
      toast.dataset.toastId = id;

      const text = [title, message].filter(Boolean).join(' ').trim();
      const resolvedText = text || 'Notification';

      this.pushHistory(type, resolvedText);
      this.emitHistoryUpdate();

      toast.innerHTML = `
        <div class="toast-content">
          <p class="toast-message">${this.escapeHtml(resolvedText)}</p>
        </div>
        ${duration > 0 ? '<div class="toast-progress"></div>' : ''}
      `;

      if (action && typeof action.onClick === 'function') {
        toast.style.cursor = 'pointer';
        toast.addEventListener('click', () => {
          action.onClick();
          this.dismiss(id);
        });
      } else if (dismissible) {
        toast.addEventListener('click', () => this.dismiss(id));
      }

      return toast;
    }

    /**
     * Dismiss a toast
     * @param {string} id - Toast ID
     */
    dismiss(id) {
      const toastData = this.toasts.get(id);
      if (!toastData) return;

      const { element, timer } = toastData;

      if (timer) clearTimeout(timer);

      element.classList.add('toast-exit');
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        this.toasts.delete(id);
      }, 140);
    }

    /**
     * Dismiss all toasts
     */
    dismissAll() {
      Array.from(this.toasts.keys()).forEach(id => this.dismiss(id));
    }

    pushHistory(type, message) {
      this.history.push({
        id: `toast-history-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        type: type || 'info',
        message: message || 'Notification',
        createdAt: Date.now()
      });

      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(this.history.length - this.maxHistory);
      }
    }

    getHistory() {
      return this.history.slice().reverse();
    }

    emitHistoryUpdate() {
      if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
      document.dispatchEvent(new CustomEvent('eshu:toast-history-updated'));
    }

    /**
     * Convenience methods
     */
    success(message, title = '', options = {}) {
      return this.show({ type: 'success', title, message, ...options });
    }

    error(message, title = '', options = {}) {
      return this.show({ type: 'error', title, message, duration: 5000, ...options });
    }

    warning(message, title = '', options = {}) {
      return this.show({ type: 'warning', title, message, ...options });
    }

    info(message, title = '', options = {}) {
      return this.show({ type: 'info', title, message, ...options });
    }

    hype(message = 'RIGHT ON!', options = {}) {
      return this.showHype(message, options);
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Create singleton instance
  const toast = new ToastManager();

  // Expose globally
  window.TOAST = toast;
})();
