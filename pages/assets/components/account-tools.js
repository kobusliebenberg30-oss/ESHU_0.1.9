/**
 * Account tools — UI surface for the F4/F5 endpoints:
 *   - POST /api/auth/change-password
 *   - DELETE /api/auth/account
 *   - POST  /api/assets/gc
 *
 * This component contributes a third section ("Account") to the existing
 * settings dropdown when the user is signed into the remote backend, and
 * provides three small confirmation modals styled to match the brutalist
 * palette of eshu-styles.css (no radius, no shadows, monochrome + red).
 *
 * Wiring:
 *   - Loaded as a regular <script> after auth-overlay.js + settings-dropdown.js.
 *   - settings-dropdown.js calls window.ESHU_ACCOUNT_TOOLS.mount(dropdownEl)
 *     after rendering its dropdown shell.
 *   - On any of: eshu:auth-success, eshu:remote-activated, page load with
 *     a live session — the section is shown. On logout / 401 it's hidden.
 *
 * Depends on: window.ESHU_API (assets/core/api.js)
 */
(function () {
  'use strict';

  if (window.ESHU_ACCOUNT_TOOLS) return; // idempotent

  const STYLE_ID = 'eshu-account-tools-styles';
  const SECTION_CLASS = 'eshu-account-section';

  // ---------- Styles ----------

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
.${SECTION_CLASS} {
  border-top: 1px solid var(--border-color, #e0e0e0);
  margin-top: 8px;
  padding-top: 8px;
  display: none;
}
.${SECTION_CLASS}[data-authed="true"] { display: block; }
.${SECTION_CLASS} .eshu-account-heading {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted, #999);
  padding: 4px 12px 6px;
}
.${SECTION_CLASS} .eshu-account-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
}
.${SECTION_CLASS} .eshu-account-label {
  font-size: 12px;
  color: var(--text-primary, #111);
}
.${SECTION_CLASS} .eshu-account-btn {
  appearance: none; cursor: pointer;
  background: transparent;
  color: var(--text-primary, #111);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0;
  padding: 4px 10px;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  font-family: inherit;
}
.${SECTION_CLASS} .eshu-account-btn:hover {
  border-color: var(--accent-black, #111);
}
.${SECTION_CLASS} .eshu-account-btn.danger {
  color: var(--accent-coral-dark, #c62828);
  border-color: rgba(229, 57, 53, 0.4);
}
.${SECTION_CLASS} .eshu-account-btn.danger:hover {
  border-color: var(--accent-coral, #e53935);
  background: rgba(229, 57, 53, 0.06);
}

/* ---------- Modal shell (shared by change-password + delete-account) ---------- */
.eshu-account-modal {
  position: fixed; inset: 0; z-index: 10000;
  display: none; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}
.eshu-account-modal[data-open="true"] { display: flex; }
.eshu-account-modal .eshu-account-card {
  width: min(420px, calc(100vw - 32px));
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #111111);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0;
}
.eshu-account-modal .eshu-account-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
.eshu-account-modal .eshu-account-title {
  margin: 0; font-weight: 700; font-size: 12px;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.eshu-account-modal .eshu-account-close {
  appearance: none; background: transparent; border: 0;
  width: 26px; height: 26px; padding: 0; cursor: pointer;
  color: var(--text-secondary, #555); font-size: 16px;
}
.eshu-account-modal .eshu-account-body { padding: 16px; }
.eshu-account-modal .eshu-account-body p {
  margin: 0 0 12px; font-size: 12px; color: var(--text-secondary, #555);
  line-height: 1.5;
}
.eshu-account-modal .eshu-account-body label {
  display: block;
  margin: 10px 0 4px;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--text-secondary, #555);
}
.eshu-account-modal .eshu-account-body input {
  width: 100%; box-sizing: border-box;
  height: 36px; padding: 0 10px;
  background: var(--bg-input, #ffffff);
  color: var(--text-primary, #111);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0;
  font-size: 13px; line-height: 1.4;
  font-family: inherit;
}
.eshu-account-modal .eshu-account-body input:focus {
  outline: none;
  border-color: var(--accent-black, #111);
  box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.06);
}
.eshu-account-modal .eshu-account-error {
  display: none;
  margin: 12px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  background: rgba(229, 57, 53, 0.08);
  color: var(--accent-coral-dark, #c62828);
  border: 1px solid rgba(229, 57, 53, 0.4);
}
.eshu-account-modal .eshu-account-error[data-visible="true"] { display: block; }
.eshu-account-modal .eshu-account-actions {
  display: flex; gap: 8px; margin-top: 14px;
}
.eshu-account-modal .eshu-account-submit {
  flex: 1; height: 36px;
  appearance: none; cursor: pointer;
  background: var(--accent-black, #111);
  color: var(--text-light, #fff);
  border: 1px solid transparent; border-radius: 0;
  font-size: 12px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.eshu-account-modal .eshu-account-submit.danger {
  background: var(--accent-coral, #e53935);
}
.eshu-account-modal .eshu-account-submit[disabled] {
  background: var(--bg-tertiary, #eee);
  color: var(--text-muted, #aaa);
  cursor: not-allowed;
}
.eshu-account-modal .eshu-account-cancel {
  height: 36px; padding: 0 14px;
  appearance: none; cursor: pointer;
  background: transparent;
  color: var(--text-primary, #111);
  border: 1px solid var(--border-color, #e0e0e0); border-radius: 0;
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
}
`;
    const tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ---------- Tiny element helper ----------

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

  function toast(message, kind) {
    if (typeof window.TOAST !== 'undefined' && window.TOAST) {
      const fn = (kind && window.TOAST[kind]) || window.TOAST.info || window.TOAST.success;
      if (typeof fn === 'function') { fn(message); return; }
    }
    // Fallback — no toast component on this page.
    try { console[kind === 'error' ? 'error' : 'log']('[ESHU]', message); } catch {}
    if (kind === 'error') alert(message);
  }

  function humanizeError(err) {
    if (!err) return 'Unknown error.';
    if (err.code === 'NetworkError') return 'Cannot reach the server.';
    if (err.status === 401) return 'Invalid credentials.';
    if (err.status === 400 && err.details && err.details.fieldErrors) {
      const fe = err.details.fieldErrors;
      const first = Object.entries(fe).find(([, v]) => Array.isArray(v) && v.length);
      if (first) return `${first[0]}: ${first[1][0]}`;
    }
    if (err.status === 400 && err.message) return err.message;
    return err.message || 'Request failed.';
  }

  // ---------- Authentication state ----------
  // We track `authed` so the section auto-hides on logout. Refreshed on
  // mount() and on the relevant lifecycle events.

  let authed = false;
  const sectionsBySettingsRoot = new WeakMap();

  function setAuthed(next) {
    authed = !!next;
    document.querySelectorAll('.' + SECTION_CLASS).forEach((sec) => {
      sec.dataset.authed = String(authed);
    });
  }

  async function refreshAuthed() {
    if (!window.ESHU_API) return;
    try {
      const res = await window.ESHU_API.auth.me();
      setAuthed(!!(res && res.user));
    } catch {
      setAuthed(false);
    }
  }

  // ---------- Section markup ----------

  function buildSection() {
    const section = el('div', { class: SECTION_CLASS, 'data-authed': String(authed) });
    section.appendChild(el('div', { class: 'eshu-account-heading', text: 'Account' }));

    const signOutBtn = el('button', {
      class: 'eshu-account-btn', type: 'button', text: 'Sign out',
      onclick: (e) => { e.stopPropagation(); signOut(); }
    });
    section.appendChild(el('div', { class: 'eshu-account-row' }, [
      el('span', { class: 'eshu-account-label', text: 'Session' }),
      signOutBtn,
    ]));

    const changeBtn = el('button', {
      class: 'eshu-account-btn', type: 'button', text: 'Change',
      onclick: (e) => { e.stopPropagation(); openChangePasswordModal(); }
    });
    section.appendChild(el('div', { class: 'eshu-account-row' }, [
      el('span', { class: 'eshu-account-label', text: 'Password' }),
      changeBtn,
    ]));

    const gcBtn = el('button', {
      class: 'eshu-account-btn', type: 'button', text: 'Reclaim',
      onclick: (e) => { e.stopPropagation(); runAssetGc(gcBtn); }
    });
    section.appendChild(el('div', { class: 'eshu-account-row' }, [
      el('span', { class: 'eshu-account-label', text: 'Unused uploads' }),
      gcBtn,
    ]));

    const deleteBtn = el('button', {
      class: 'eshu-account-btn danger', type: 'button', text: 'Delete\u2026',
      onclick: (e) => { e.stopPropagation(); openDeleteAccountModal(); }
    });
    section.appendChild(el('div', { class: 'eshu-account-row' }, [
      el('span', { class: 'eshu-account-label', text: 'Account' }),
      deleteBtn,
    ]));

    return section;
  }

  function signOut() {
    if (window.ESHU_AUTH_UI && typeof window.ESHU_AUTH_UI.logout === 'function') {
      window.ESHU_AUTH_UI.logout();
      return;
    }
    if (!window.ESHU_API || !window.ESHU_API.auth) return;
    window.ESHU_API.auth.logout()
      .catch(() => {})
      .finally(() => {
        try { window.dispatchEvent(new CustomEvent('eshu:auth-logout')); } catch {}
        try { window.location.replace('play.html'); } catch { window.location.href = 'play.html'; }
      });
  }

  // ---------- Asset GC ----------

  async function runAssetGc(btn) {
    if (!window.ESHU_API) { toast('API not loaded.', 'error'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Working\u2026'; }
    try {
      const res = await window.ESHU_API.assets.gc();
      const n = (res && res.rowsDeleted) || 0;
      const bytes = (res && res.bytesReclaimed) || 0;
      if (n === 0) {
        toast('No unused uploads to reclaim.', 'info');
      } else {
        toast(`Reclaimed ${n} upload${n === 1 ? '' : 's'} (${formatBytes(bytes)}).`, 'success');
      }
    } catch (err) {
      toast(humanizeError(err), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reclaim'; }
    }
  }

  function formatBytes(n) {
    if (!n || n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  // ---------- Modal infrastructure ----------

  function buildModal({ title, body, submitLabel, submitClass, onSubmit }) {
    injectStyles();

    const errorEl = el('div', { class: 'eshu-account-error', role: 'alert' });
    const submitBtn = el('button', {
      class: 'eshu-account-submit' + (submitClass ? ' ' + submitClass : ''),
      type: 'submit', text: submitLabel,
    });
    const cancelBtn = el('button', { class: 'eshu-account-cancel', type: 'button', text: 'Cancel' });

    const form = el('form', {
      class: 'eshu-account-form', novalidate: 'true',
      onsubmit: async (e) => {
        e.preventDefault();
        errorEl.dataset.visible = 'false'; errorEl.textContent = '';
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Working\u2026';
        try {
          await onSubmit();
          close();
        } catch (err) {
          errorEl.textContent = humanizeError(err);
          errorEl.dataset.visible = 'true';
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });

    const card = el('div', { class: 'eshu-account-card', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'eshu-account-header' }, [
        el('h2', { class: 'eshu-account-title', text: title }),
        el('button', { class: 'eshu-account-close', type: 'button', 'aria-label': 'Close', text: '\u2715', onclick: () => close() })
      ]),
      el('div', { class: 'eshu-account-body' }, [
        body,
        errorEl,
        el('div', { class: 'eshu-account-actions' }, [submitBtn, cancelBtn])
      ])
    ]);

    const root = el('div', { class: 'eshu-account-modal' }, card);
    cancelBtn.addEventListener('click', () => close());
    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    document.body.appendChild(root);

    function close() {
      try { document.body.removeChild(root); } catch {}
    }

    form.appendChild(card.querySelector('.eshu-account-body'));
    // ^ form must wrap the body so submit-on-enter works; rebuild card to nest.
    card.appendChild(form);

    requestAnimationFrame(() => { root.dataset.open = 'true'; });
    return { root, close };
  }

  // ---------- Change password modal ----------

  function openChangePasswordModal() {
    const currentInput = el('input', { type: 'password', autocomplete: 'current-password' });
    const newInput = el('input', { type: 'password', autocomplete: 'new-password' });
    const confirmInput = el('input', { type: 'password', autocomplete: 'new-password' });

    const body = el('div', null, [
      el('p', { text: 'Enter your current password and choose a new one. Other devices stay signed in.' }),
      el('label', { text: 'Current password' }), currentInput,
      el('label', { text: 'New password (min 8 characters)' }), newInput,
      el('label', { text: 'Confirm new password' }), confirmInput,
    ]);

    buildModal({
      title: 'Change password',
      body,
      submitLabel: 'Update password',
      onSubmit: async () => {
        const current = currentInput.value;
        const next = newInput.value;
        const confirm = confirmInput.value;
        if (!current || !next) throw new Error('All fields are required.');
        if (next.length < 8) throw new Error('New password must be at least 8 characters.');
        if (next !== confirm) throw new Error('New password and confirmation do not match.');
        await window.ESHU_API.auth.changePassword({ currentPassword: current, newPassword: next });
        toast('Password updated.', 'success');
      }
    });
    setTimeout(() => currentInput.focus(), 30);
  }

  // ---------- Delete account modal ----------

  function openDeleteAccountModal() {
    const passwordInput = el('input', { type: 'password', autocomplete: 'current-password' });
    const confirmText = el('input', { type: 'text', placeholder: 'DELETE', spellcheck: 'false' });

    const body = el('div', null, [
      el('p', { text: 'This permanently deletes your account, profiles, settings, and uploaded files. Groups, games and creations you own will be unowned but retained for other players.' }),
      el('label', { text: 'Password' }), passwordInput,
      el('label', { text: 'Type DELETE to confirm' }), confirmText,
    ]);

    buildModal({
      title: 'Delete account',
      body,
      submitLabel: 'Delete forever',
      submitClass: 'danger',
      onSubmit: async () => {
        if (!passwordInput.value) throw new Error('Password is required.');
        if ((confirmText.value || '').trim() !== 'DELETE') {
          throw new Error('Type DELETE to confirm.');
        }
        await window.ESHU_API.auth.deleteAccount({ password: passwordInput.value });
        toast('Account deleted.', 'success');
        // Drop the user back to the legacy localStorage experience.
        setTimeout(() => { try { location.reload(); } catch {} }, 300);
      }
    });
    setTimeout(() => passwordInput.focus(), 30);
  }

  // ---------- Mount point ----------

  function mount(dropdownEl) {
    if (!dropdownEl) return;
    if (sectionsBySettingsRoot.has(dropdownEl)) return;
    injectStyles();

    const content = dropdownEl.querySelector('.settings-dropdown-content');
    if (!content) return;
    const section = buildSection();
    content.appendChild(section);
    sectionsBySettingsRoot.set(dropdownEl, section);

    refreshAuthed();
  }

  // ---------- Lifecycle wiring ----------

  window.addEventListener('eshu:remote-activated', () => setAuthed(true));
  window.addEventListener('eshu:auth-success', () => setAuthed(true));
  window.addEventListener('eshu:sync-unauthenticated', () => setAuthed(false));

  // First check after the API client is on the page.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshAuthed, { once: true });
  } else {
    refreshAuthed();
  }

  window.ESHU_ACCOUNT_TOOLS = {
    mount,
    refresh: refreshAuthed,
    openChangePasswordModal,
    openDeleteAccountModal,
    runAssetGc,
  };
})();
