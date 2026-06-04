/**
 * Auth Chip — a small unobtrusive account indicator.
 *
 * Auto-mounts a fixed bottom-right chip ONLY when the remote backend is enabled
 * (`ESHU_REMOTE.isEnabled() === true`). Shows the current username with a
 * Logout action, or a "Sign in" trigger if no session exists.
 *
 * Pages can opt out by setting `<html data-eshu-auth-chip="off">`, or
 * mount it explicitly into a custom container with
 * `ESHU_AUTH_CHIP.mount(el)`.
 *
 * Depends on: assets/core/api.js, assets/components/auth-overlay.js
 */
(function () {
  'use strict';

  if (window.ESHU_AUTH_CHIP) return;

  const STYLE_ID = 'eshu-auth-chip-styles';
  const CHIP_CLASS = 'eshu-auth-chip';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
.${CHIP_CLASS} {
  position: fixed; right: 12px; bottom: 12px; z-index: 9000;
  display: inline-flex; align-items: center; gap: 8px;
  height: 28px; padding: 0 10px;
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #111111);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0;
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
}
/* Inline mount: sits within the top-nav .nav-right cluster, next to the
   messages button. Match the 38px icon-button height so the row stays
   visually aligned, and tighten the action gap. */
.${CHIP_CLASS}[data-mounted-inline="true"] {
  position: static;
  height: 38px;
  padding: 0 12px;
  gap: 8px;
  flex: 0 0 auto;
}
.${CHIP_CLASS}[data-mounted-inline="true"] .eshu-auth-chip-name {
  max-width: 120px;
}
@media (max-width: 640px) {
  .${CHIP_CLASS}[data-mounted-inline="true"] {
    padding: 0 8px;
  }
  .${CHIP_CLASS}[data-mounted-inline="true"] .eshu-auth-chip-name {
    max-width: 72px;
  }
}
@media (max-width: 420px) {
  /* On very narrow screens collapse to the dot + action only. */
  .${CHIP_CLASS}[data-mounted-inline="true"] .eshu-auth-chip-name,
  .${CHIP_CLASS}[data-mounted-inline="true"] .eshu-auth-chip-sep {
    display: none;
  }
}
.${CHIP_CLASS} .eshu-auth-chip-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-muted, #999);
}
.${CHIP_CLASS} {
  /* All boxes inside the chip use border-box so heights/paddings are predictable. */
  box-sizing: border-box;
}
.${CHIP_CLASS} *, .${CHIP_CLASS} *::before, .${CHIP_CLASS} *::after { box-sizing: border-box; }
/* The dot is the only thing that changes between online / offline / unknown.
   No pulse, no border colour change — the chip stays calm and uniform. */
.${CHIP_CLASS}[data-state="online"]  .eshu-auth-chip-dot { background: var(--accent-green, #2e7d32); }
.${CHIP_CLASS}[data-state="offline"] .eshu-auth-chip-dot { background: var(--accent-blue,  #1565c0); }
.${CHIP_CLASS} .eshu-auth-chip-name {
  max-width: 140px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--text-primary, #111);
}
/* Action buttons (Sign in / Logout) share one quiet text-button style. No
   filled pills, no destructive-red. They sit flush inside the 28px chip
   thanks to inline-flex centring + line-height: 1 + border-box. */
.${CHIP_CLASS} .eshu-auth-chip-action {
  appearance: none; background: transparent; border: 0; padding: 0; margin: 0;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--text-secondary, #555);
  font: inherit; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  line-height: 1;
}
.${CHIP_CLASS} .eshu-auth-chip-action:hover { color: var(--text-primary, #111); }
.${CHIP_CLASS} .eshu-auth-chip-sep {
  display: inline-block; width: 1px; height: 12px;
  background: var(--border-color, #e0e0e0);
}
`;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null) node.setAttribute(k, v);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  let chipEl = null;
  let chipUser = null;

  function render(state, user) {
    if (!chipEl) return;
    chipEl.dataset.state = state; // 'online' | 'offline' | 'unknown'
    while (chipEl.firstChild) chipEl.removeChild(chipEl.firstChild);

    chipEl.appendChild(el('span', { class: 'eshu-auth-chip-dot' }));

    if (state === 'online' && user) {
      const name = user.username || user.displayName || 'account';
      chipEl.appendChild(el('span', { class: 'eshu-auth-chip-name', text: name }));
      chipEl.appendChild(el('span', { class: 'eshu-auth-chip-sep' }));
      chipEl.appendChild(el('button', {
        class: 'eshu-auth-chip-action', type: 'button', text: 'Logout',
        onclick: () => window.ESHU_AUTH_UI && window.ESHU_AUTH_UI.logout()
      }));
    } else {
      chipEl.appendChild(el('span', {
        class: 'eshu-auth-chip-name',
        text: 'Local only',
        title: 'Your data lives in this browser. Sign in to sync across devices.'
      }));
      chipEl.appendChild(el('span', { class: 'eshu-auth-chip-sep' }));
      chipEl.appendChild(el('button', {
        class: 'eshu-auth-chip-action', type: 'button', text: 'Sign in',
        onclick: () => window.ESHU_AUTH_UI && window.ESHU_AUTH_UI.open({ tab: 'signin' })
      }));
    }
  }

  async function refresh() {
    if (!chipEl || !window.ESHU_API) return;
    try {
      const me = await window.ESHU_API.auth.me();
      chipUser = me && me.user ? me.user : null;
      render(chipUser ? 'online' : 'offline', chipUser);
    } catch {
      render('offline', null);
    }
  }

  function ensureChip(parent) {
    injectStyles();
    if (!chipEl) {
      chipEl = el('div', { class: CHIP_CLASS, 'data-state': 'unknown' });
    }
    if (parent) {
      chipEl.dataset.mountedInline = 'true';
      parent.appendChild(chipEl);
    } else if (!chipEl.isConnected) {
      document.body.appendChild(chipEl);
    }
    refresh();
    return chipEl;
  }

  // Find the preferred inline mount target: the top-nav .nav-right cluster.
  // We insert the chip just before the messages wrapper so it visually sits
  // next to the messages icon, as requested by product. Falls back to null
  // (fixed-position bottom-right) when the slot isn't present (e.g. minimal
  // pages without the full top-nav).
  function findInlineSlot() {
    const navRight = document.querySelector('.top-nav .nav-right') || document.querySelector('.nav-right');
    if (!navRight) return null;
    return navRight;
  }

  function mountInto(navRight) {
    // Place the chip immediately before the messages-wrapper so it reads
    // left-of-messages. If that anchor isn't there, prepend so the chip
    // still lands in the cluster rather than at the end.
    const anchor = navRight.querySelector('.messages-wrapper');
    if (anchor && anchor.parentNode === navRight) {
      navRight.insertBefore(chipEl, anchor);
    } else if (navRight.firstChild) {
      navRight.insertBefore(chipEl, navRight.firstChild);
    } else {
      navRight.appendChild(chipEl);
    }
  }

  function autoMount() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', autoMount, { once: true });
      return;
    }
    try {
      if (document.documentElement && document.documentElement.dataset.eshuAuthChip === 'off') return;
    } catch {}
    // Always mount: the chip is the only discoverable affordance for
    // signing into the remote backend on a fresh visit. When remote is
    // not yet opted-in, the chip shows "Offline → Sign in"; clicking it
    // opens the overlay (which opts the user in on success).
    // Pages can still opt out via <html data-eshu-auth-chip="off">.
    if (!window.ESHU_API) return;
    const slot = findInlineSlot();
    if (slot) {
      injectStyles();
      if (!chipEl) {
        chipEl = el('div', { class: CHIP_CLASS, 'data-state': 'unknown' });
      }
      chipEl.dataset.mountedInline = 'true';
      mountInto(slot);
      refresh();
    } else {
      ensureChip(null);
    }
  }

  // Refresh on auth-related events.
  ['eshu:auth-success', 'eshu:auth-logout', 'eshu:remote-activated', 'eshu:sync-success']
    .forEach((evt) => window.addEventListener(evt, refresh));

  window.ESHU_AUTH_CHIP = { mount: ensureChip, refresh };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    autoMount();
  }
})();
