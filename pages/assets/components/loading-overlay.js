(function () {
  'use strict';

  class InlineLoading {
    constructor() {
      this.activeByKey = new Map();
      this.hostByKey = new Map();
      this.visibleSinceByKey = new Map();
      this.hideTimer = null;
      this.minVisibleMs = 260;
      this.defaultSelector = '.image-box';
    }

    ensure() {
      if (!document || !document.body) return false;
      this.injectStyles();
      return true;
    }

    injectStyles() {
      if (document.getElementById('global-inline-loading-styles')) return;

      const style = document.createElement('style');
      style.id = 'global-inline-loading-styles';
      style.textContent = `
        .inline-loading-host {
          position: relative;
        }

        .inline-loading-spinner {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          margin-left: -10px;
          margin-top: -10px;
          background: var(--accent-black, #111);
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          animation: inlineDiamondSpin 0.82s linear infinite;
        }

        @keyframes inlineDiamondSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        html[data-theme="dark"] .inline-loading-spinner {
          background: var(--text-primary, #f5f5f5);
        }
      `;
      document.head.appendChild(style);
    }

    normalizeTargets(input) {
      if (Array.isArray(input)) return input.filter(Boolean);
      if (input && input.nodeType === 1) return [input];
      if (typeof input === 'string' && input.trim()) {
        return Array.from(document.querySelectorAll(input));
      }
      return Array.from(document.querySelectorAll(this.defaultSelector));
    }

    getHostKey(target) {
      if (!target) return '';
      if (target.id) return `id:${target.id}`;
      if (!target.dataset.loadingHostKey) {
        target.dataset.loadingHostKey = `host-${Math.random().toString(36).slice(2, 10)}`;
      }
      return target.dataset.loadingHostKey;
    }

    ensureSpinner(target, key) {
      if (!target) return;
      if (!target.classList.contains('inline-loading-host')) {
        target.classList.add('inline-loading-host');
      }
      let spinner = target.querySelector(':scope > .inline-loading-spinner');
      if (!spinner) {
        spinner = document.createElement('span');
        spinner.className = 'inline-loading-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        target.appendChild(spinner);
      }
      this.hostByKey.set(key, target);
      this.visibleSinceByKey.set(key, Date.now());
    }

    removeSpinnerByKey(key) {
      const host = this.hostByKey.get(key);
      if (host) {
        const spinner = host.querySelector(':scope > .inline-loading-spinner');
        if (spinner) spinner.remove();
      }
      this.hostByKey.delete(key);
      this.visibleSinceByKey.delete(key);
      this.activeByKey.delete(key);
    }

    show(options = {}) {
      if (!this.ensure()) return;

      const targets = this.normalizeTargets(options.targets || options.selector || options);
      if (!targets.length) return;

      targets.forEach((target) => {
        const key = this.getHostKey(target);
        const nextCount = (this.activeByKey.get(key) || 0) + 1;
        this.activeByKey.set(key, nextCount);
        this.ensureSpinner(target, key);
      });
    }

    hide(options = {}) {
      if (!this.ensure()) return;

      const force = !!(options && options.force);
      const targets = this.normalizeTargets(options.targets || options.selector || options);
      if (!targets.length) return;

      targets.forEach((target) => {
        const key = this.getHostKey(target);
        const currentCount = this.activeByKey.get(key) || 0;
        if (force) {
          this.activeByKey.set(key, 0);
        } else if (currentCount > 0) {
          this.activeByKey.set(key, currentCount - 1);
        }

        const remaining = this.activeByKey.get(key) || 0;
        if (remaining > 0) return;

        const since = this.visibleSinceByKey.get(key) || Date.now();
        const elapsed = Date.now() - since;
        const waitMs = Math.max(0, this.minVisibleMs - elapsed);

        if (this.hideTimer) clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
          this.removeSpinnerByKey(key);
          this.hideTimer = null;
        }, waitMs);
      });
    }

    setMessage() {
      // Intentionally kept as no-op for compatibility.
    }

    clear(force = true) {
      if (!this.ensure()) return;
      const keys = Array.from(this.hostByKey.keys());
      keys.forEach((key) => {
        if (force) {
          this.removeSpinnerByKey(key);
        }
      });
    }
  }

  window.LOADING = new InlineLoading();
})();
