/**
 * Auth Overlay - sign-in / register modal for the remote backend.
 *
 * Design: matches the flat brutalist palette of eshu-styles.css
 * (no radius, no shadows, 1px borders, monochrome + red accent, dark-mode
 * aware via CSS variables).
 *
 * Behaviour:
 *   - Auto-shows on `eshu:sync-unauthenticated` (dispatched by the remote
 *     storage driver when a remote-enabled page detects no session).
 *   - On success, dispatches `eshu:auth-success` and reloads so the remote
 *     driver picks up the fresh session cookie cleanly.
 *
 * Public API (window.ESHU_AUTH_UI):
 *   - open({ tab: 'signin' | 'register' })
 *   - close()
 *   - logout()
 *
 * Depends on: window.ESHU_API (assets/core/api.js)
 */
(function () {
  'use strict';

  if (window.ESHU_AUTH_UI) return; // idempotent

  const STYLE_ID = 'eshu-auth-overlay-styles';
  const ROOT_ID = 'eshu-auth-overlay';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 9999;
  display: none; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.60);
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}
#${ROOT_ID}[data-open="true"] { display: flex; }
#${ROOT_ID} .eshu-auth-card {
  width: min(400px, calc(100vw - 24px));
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #111111);
  border: 1.5px solid var(--border-color, #d0d0d0);
  border-radius: 0;
  box-shadow: none;
}
#${ROOT_ID} .eshu-auth-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1.5px solid var(--border-color, #d0d0d0);
}
#${ROOT_ID} .eshu-auth-title {
  margin: 0; font-weight: 800; font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--text-primary, #111111);
}
#${ROOT_ID} .eshu-auth-close {
  appearance: none; background: transparent; border: 0;
  width: 28px; height: 28px; padding: 0; cursor: pointer;
  color: var(--text-muted, #999999);
  font-size: 18px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
#${ROOT_ID} .eshu-auth-close:hover { color: var(--text-primary, #111111); }
#${ROOT_ID} .eshu-auth-tabs {
  display: grid; grid-template-columns: 1fr 1fr;
  border-bottom: 1.5px solid var(--border-color, #d0d0d0);
}
#${ROOT_ID} .eshu-auth-tab {
  appearance: none; background: transparent; border: 0;
  padding: 13px 0 11px; cursor: pointer;
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--text-muted, #999999);
  border-bottom: 3px solid transparent;
  transition: color 0.1s, border-color 0.1s;
}
#${ROOT_ID} .eshu-auth-tab[data-active="true"] {
  color: var(--text-primary, #111111);
  border-bottom-color: var(--text-primary, #111111);
}
#${ROOT_ID} .eshu-auth-body { padding: 20px; }
#${ROOT_ID} .eshu-auth-body label {
  display: block;
  margin: 14px 0 5px;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--text-muted, #999999);
}
#${ROOT_ID} .eshu-auth-body label:first-child { margin-top: 0; }
#${ROOT_ID} .eshu-auth-body input {
  width: 100%; box-sizing: border-box;
  height: 38px; padding: 0 11px;
  background: var(--bg-body, #ffffff);
  color: var(--text-primary, #111111);
  border: 1.5px solid var(--border-color, #d0d0d0);
  border-radius: 0;
  font-size: 13px; line-height: 1.4;
  font-family: inherit;
  transition: border-color 0.1s;
}
#${ROOT_ID} .eshu-auth-body input:focus {
  outline: none;
  border-color: var(--text-primary, #111111);
}
#${ROOT_ID} .eshu-auth-password-wrap {
  position: relative;
}
#${ROOT_ID} .eshu-auth-password-wrap input {
  padding-right: 62px;
}
#${ROOT_ID} .eshu-auth-reveal {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: var(--text-muted, #999999);
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
#${ROOT_ID} .eshu-auth-reveal:hover {
  color: var(--text-primary, #111111);
}

#${ROOT_ID} .eshu-auth-error {
  display: none;
  margin: 14px 0 0;
  padding: 9px 11px;
  font-size: 12px; line-height: 1.45;
  background: transparent;
  color: var(--text-primary, #111111);
  border: 1.5px solid var(--text-primary, #111111);
}
#${ROOT_ID} .eshu-auth-error[data-visible="true"] { display: block; }
#${ROOT_ID} .eshu-auth-error[data-kind="status"] {
  color: var(--text-secondary, #555555);
  border-color: var(--border-color, #d0d0d0);
}
#${ROOT_ID} .eshu-auth-actions {
  margin-top: 18px;
}
#${ROOT_ID} .eshu-auth-submit {
  width: 100%; height: 40px;
  appearance: none; cursor: pointer;
  background: var(--text-primary, #111111);
  color: #ffffff;
  border: 0; border-radius: 0;
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase;
  transition: opacity 0.1s;
}
#${ROOT_ID} .eshu-auth-submit:hover:not([disabled]) { opacity: 0.82; }
#${ROOT_ID} .eshu-auth-submit[disabled] {
  opacity: 0.35;
  cursor: not-allowed;
}
html[data-theme="dark"] #${ROOT_ID} .eshu-auth-submit {
  background: #ffffff;
  color: #000000;
  border: 1px solid #ffffff;
}
html[data-theme="dark"] #${ROOT_ID} .eshu-auth-submit:hover:not([disabled]) {
  background: #e8e8e8;
  opacity: 1;
}
#${ROOT_ID} .eshu-auth-footer {
  padding: 12px 20px 14px;
  border-top: 1.5px solid var(--border-color, #d0d0d0);
}
#${ROOT_ID} .eshu-auth-footer-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted, #999999);
}
#${ROOT_ID} .eshu-auth-footer-link {
  appearance: none; background: transparent; border: 0; padding: 0; margin: 0;
  cursor: pointer;
  color: var(--text-secondary, #555555);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
#${ROOT_ID} .eshu-auth-footer-link:hover { color: var(--text-primary, #111111); }
#${ROOT_ID} .eshu-auth-forgot-link {
  appearance: none; background: transparent; border: 0; padding: 0; margin: 8px 0 0;
  display: block; text-align: right;
  cursor: pointer;
  font: inherit; font-size: 11px;
  color: var(--text-muted, #999999);
  text-decoration: underline;
  text-underline-offset: 2px;
}
#${ROOT_ID} .eshu-auth-forgot-link:hover { color: var(--text-primary, #111111); }
#${ROOT_ID} .eshu-auth-back-link {
  appearance: none; background: transparent; border: 0; padding: 0 0 0 9px; margin: 0 0 18px;
  display: inline-flex; align-items: center;
  border-left: 2px solid var(--border-color, #d0d0d0);
  cursor: pointer;
  font: inherit; font-size: 10px; font-weight: 800;
  letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--text-muted, #999999);
}
#${ROOT_ID} .eshu-auth-back-link:hover {
  color: var(--text-primary, #111111);
  border-left-color: var(--text-primary, #111111);
}
#${ROOT_ID} .eshu-auth-reset-hint {
  margin: 0 0 16px;
  font-size: 12.5px; line-height: 1.5;
  color: var(--text-secondary, #555555);
}
/* === Secondary popup: full terms / privacy / security === */
#${ROOT_ID} .eshu-auth-details {
  position: absolute; inset: 0; z-index: 3;
  display: none; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
#${ROOT_ID}[data-details="true"] .eshu-auth-details { display: flex; }
#${ROOT_ID} .eshu-auth-details-card {
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  display: flex; flex-direction: column;
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #111111);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 0;
}
#${ROOT_ID} .eshu-auth-details-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
#${ROOT_ID} .eshu-auth-details-title {
  margin: 0; font-weight: 700; font-size: 12px;
  letter-spacing: 0.08em; text-transform: uppercase;
}
#${ROOT_ID} .eshu-auth-details-tabs {
  display: grid; grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}
#${ROOT_ID} .eshu-auth-details-tab {
  appearance: none; background: transparent; border: 0;
  padding: 10px 0; cursor: pointer;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-secondary, #555555);
  border-bottom: 2px solid transparent;
}
#${ROOT_ID} .eshu-auth-details-tab[data-active="true"] {
  color: var(--text-primary, #111111);
  border-bottom-color: var(--accent-blue, #1565c0);
}
#${ROOT_ID} .eshu-auth-details-body {
  padding: 16px; overflow-y: auto;
  font-size: 12.5px; line-height: 1.6;
  color: var(--text-secondary, #555555);
}
#${ROOT_ID} .eshu-auth-details-body h4 {
  margin: 14px 0 6px;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-primary, #111111);
}
#${ROOT_ID} .eshu-auth-details-body h4:first-child { margin-top: 0; }
#${ROOT_ID} .eshu-auth-details-body p { margin: 0 0 8px; }
#${ROOT_ID} .eshu-auth-details-body ul {
  margin: 0 0 8px;
  padding-left: 18px;
}
#${ROOT_ID} .eshu-auth-details-body li { margin: 0 0 3px; }
#${ROOT_ID} .eshu-auth-details-body strong { color: var(--text-primary, #111111); font-weight: 700; }
#${ROOT_ID} .eshu-auth-details-body em {
  font-style: normal;
  display: block;
  margin: -2px 0 12px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--text-muted, #999999);
}
#${ROOT_ID} .eshu-auth-details-body a {
  color: var(--accent-blue, #1565c0);
  text-decoration: underline;
}
#${ROOT_ID} .eshu-auth-details-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  padding: 0 4px;
  background: var(--bg-tertiary, #f4f4f4);
  color: var(--text-primary, #111111);
}
/* === Confirm popup (T&Cs gate before account creation) ===
   z-index: details (3) > confirm (2) > form (0), so the details popup
   always overlays the confirm popup when opened from inside it. */
#${ROOT_ID} .eshu-auth-confirm {
  position: absolute; inset: 0; z-index: 2;
  display: none; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.50);
}
#${ROOT_ID}[data-confirm="true"] .eshu-auth-confirm { display: flex; }
#${ROOT_ID} .eshu-auth-confirm-card {
  position: relative;
  width: min(320px, calc(100vw - 40px));
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #111111);
  border: 1.5px solid var(--border-color, #d0d0d0);
  border-radius: 0;
  padding: 36px 20px 20px;
}
#${ROOT_ID} .eshu-auth-confirm-close {
  position: absolute; top: 14px; right: 14px;
  appearance: none; background: transparent; border: 0;
  width: 24px; height: 24px; padding: 0; cursor: pointer;
  color: var(--text-muted, #999999);
  font-size: 16px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
#${ROOT_ID} .eshu-auth-confirm-close:hover { color: var(--text-primary, #111111); }
#${ROOT_ID} .eshu-auth-confirm-terms {
  margin: 0 0 14px;
  font-size: 12px; line-height: 1.5;
  color: var(--text-muted, #999999);
  text-align: center;
}
#${ROOT_ID} .eshu-auth-confirm-terms button.eshu-auth-footer-link {
  font-size: 12px;
  color: var(--text-secondary, #555555);
}
#${ROOT_ID} .eshu-auth-confirm-rule {
  margin: 0 0 16px;
  border: 0; border-top: 1.5px solid var(--border-color, #d0d0d0);
}
#${ROOT_ID} .eshu-auth-confirm-actions {
  display: flex; justify-content: center;
}
#${ROOT_ID} .eshu-auth-confirm-ok {
  appearance: none; cursor: pointer;
  width: 100%; height: 40px; padding: 0;
  background: var(--text-primary, #111111);
  color: #ffffff;
  border: 0; border-radius: 0 !important; outline: none;
  font: inherit; font-size: 11px; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.1s;
  -webkit-appearance: none;
}
#${ROOT_ID} .eshu-auth-confirm-ok:hover { opacity: 0.80; }
html[data-theme="dark"] #${ROOT_ID} .eshu-auth-confirm-ok {
  background: #ffffff;
  color: #000000;
  border: 1px solid #ffffff;
}
html[data-theme="dark"] #${ROOT_ID} .eshu-auth-confirm-ok:hover {
  background: #e8e8e8;
  opacity: 1;
}
.eshu-signout-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.58);
}
.eshu-signout-confirm-card {
  width: min(340px, calc(100vw - 40px));
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #111111);
  border: 1.5px solid var(--border-color, #d0d0d0);
  border-radius: 0;
}
.eshu-signout-confirm-title {
  margin: 0;
  padding: 18px 20px 14px;
  border-bottom: 1.5px solid var(--border-color, #d0d0d0);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: center;
}
.eshu-signout-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 18px 20px 20px;
}
.eshu-signout-confirm-actions button {
  appearance: none;
  min-height: 40px;
  border-radius: 0;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.eshu-signout-negative {
  background: transparent;
  color: var(--text-primary, #111111);
  border: 1.5px solid var(--border-color, #d0d0d0);
}
.eshu-signout-affirm {
  background: var(--text-primary, #111111);
  color: #ffffff;
  border: 1.5px solid var(--text-primary, #111111);
}
html[data-theme="dark"] .eshu-signout-confirm-card {
  background: var(--dark-surface-1, #0b0b0b);
  color: #ffffff;
  border-color: var(--dark-border-strong, #3a3a3a);
}
html[data-theme="dark"] .eshu-signout-confirm-title {
  border-bottom-color: var(--dark-border-strong, #3a3a3a);
}
html[data-theme="dark"] .eshu-signout-negative {
  background: var(--dark-surface-2, #121212);
  color: #ffffff;
  border-color: var(--dark-border-strong, #3a3a3a);
}
html[data-theme="dark"] .eshu-signout-affirm {
  background: #ffffff;
  color: #000000;
  border-color: #ffffff;
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

  let state = {
    root: null,
    tab: 'signin',
    view: 'main',
    errorEl: null,
    submitBtn: null,
    inputs: {},
    supabaseEnabled: false,
    statusEl: null
  };

  async function getSupabaseClient() {
    if (!window.ESHU_SUPABASE || typeof window.ESHU_SUPABASE.init !== 'function') return null;
    const result = await window.ESHU_SUPABASE.init();
    state.supabaseEnabled = !!(result && result.enabled && result.client);
    return result && result.client ? result.client : null;
  }

  async function shouldUseSupabaseAuth() {
    if (window.ESHU_USE_SUPABASE_AUTH === true) return true;
    try {
      if (localStorage.getItem('eshu_use_supabase_auth') === 'true') return true;
    } catch {
    }
    if (state.supabaseEnabled) return true;
    const supabase = await getSupabaseClient();
    return !!supabase;
  }

  function showStatus(msg) {
    if (!state.errorEl) return;
    state.errorEl.textContent = msg || '';
    state.errorEl.dataset.visible = msg ? 'true' : 'false';
    state.errorEl.dataset.kind = 'status';
  }

  function persistRemoteAuthSuccess() {
    try { localStorage.setItem('eshu_backend', 'remote'); } catch {}
    try { window.dispatchEvent(new CustomEvent('eshu:auth-success')); } catch {}
  }

  function isPlayPage() {
    try { return /(?:^|\/)play\.html?$/i.test(location.pathname) || location.pathname === '/'; } catch { return false; }
  }

  async function finalizeSuccess() {
    persistRemoteAuthSuccess();
    if (state.reloadOnSuccess !== false) {
      // On play.html a plain reload loops back here and can re-trigger the
      // login overlay before the session cookie is recognised. Navigate to
      // home instead so the authenticated app boots cleanly.
      if (isPlayPage()) {
        const base = location.pathname.replace(/[^/]+$/, '');
        location.href = base + 'home.html';
        return;
      }
      location.reload();
      return;
    }
    close();
  }

  async function signInWithSupabase(email, password, rememberMe) {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error('Supabase auth is not available.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const accessToken = data && data.session && data.session.access_token;
    if (!accessToken) throw new Error('Supabase sign-in did not return a session.');
    await window.ESHU_API.auth.supabaseSession({ accessToken, rememberMe });
  }

  function buildEmailConfirmationRedirect() {
    const productionOrigin = 'https://eshu-0-1-9.vercel.app';
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    const origin = localHosts.has(location.hostname) ? productionOrigin : location.origin;
    const path = location.pathname && location.pathname !== '/' ? location.pathname : '/play.html';
    return origin + path + '?auth=confirmed';
  }

  async function signUpWithSupabase(email, password, username) {
    const supabase = await getSupabaseClient();
    if (!supabase) throw new Error('Supabase auth is not available.');
    const redirectTo = buildEmailConfirmationRedirect();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { username }
      }
    });
    if (error) throw error;
    if (data && data.session && data.session.access_token) {
      try { await supabase.auth.signOut(); } catch {}
      throw new Error('Supabase email confirmations are currently disabled, so no confirmation email was sent. Enable email confirmation in Supabase Auth settings and try creating the account again.');
    }
    return data;
  }

  function isEmailLike(value) {
    return /@/.test(String(value || ''));
  }

  function wrapPasswordReveal(input) {
    const button = el('button', {
      class: 'eshu-auth-reveal',
      type: 'button',
      text: 'Show',
      'aria-label': 'Show password',
      onclick: (event) => {
        event.preventDefault();
        const isRevealed = input.type === 'text';
        input.type = isRevealed ? 'password' : 'text';
        button.textContent = isRevealed ? 'Show' : 'Hide';
        button.setAttribute('aria-label', isRevealed ? 'Show password' : 'Hide password');
        try { input.focus(); } catch {}
      },
    });
    return el('div', { class: 'eshu-auth-password-wrap' }, [input, button]);
  }

  function handleConfirmationHint() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const hint = params.get('auth');
      if (hint === 'confirmed') {
        showStatus('Email confirmed. You can now sign in with your email and password.');
        state.tab = 'signin';
      } else if (hint === 'reset') {
        showStatus('Your password has been reset. Sign in with your new password below.');
        state.tab = 'signin';
      }
    } catch {}
  }
  /**
   * Build the minimal one-line footer notice. The link opens a secondary
   * popup containing the full terms / privacy / security explanation.
   *
   * Wording is intentionally generic so it fits both the Sign-in tab and
   * the Create-account tab without needing to be rebuilt on tab change.
   */
  function buildFooterNote() {
    const p = document.createElement('p');
    p.className = 'eshu-auth-footer-note';
    p.appendChild(document.createTextNode('By continuing, you agree to our '));
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'eshu-auth-footer-link';
    link.textContent = 'terms & privacy policy';
    link.addEventListener('click', openDetails);
    p.appendChild(link);
    p.appendChild(document.createTextNode('.'));
    return p;
  }

  // ----- Legal copy -----------------------------------------------------
  // Bumping either of these requires bumping LEGAL_LAST_UPDATED below.
  const LEGAL_LAST_UPDATED = '9 May 2026';

  function buildPrivacyHtml() {
    return [
      '<p>This Privacy Policy explains how <strong>Working Title</strong> ("Service"), operated by <strong>Kobus Liebenberg</strong> ("we", "us", "our"), collects, uses, and protects your information when you use our Service.</p>',
      '<p>By using the Service, you agree to the practices described in this Privacy Policy.</p>',

      '<h4>1. Information We Collect</h4>',
      '<p>We may collect the following types of information:</p>',
      '<p><strong>Account Information.</strong> When you create an account, we may collect:</p>',
      '<ul>',
        '<li>Name or username</li>',
        '<li>Email address</li>',
        '<li>Password (securely hashed and never stored in plain text)</li>',
      '</ul>',
      '<p>We do not have access to your actual password at any time.</p>',
      '<p><strong>Usage Information.</strong> We may collect limited information about how you use the Service, such as:</p>',
      '<ul>',
        '<li>Log data (e.g. access times, pages viewed)</li>',
        '<li>Device and browser information</li>',
        '<li>Basic analytics data to improve performance and reliability</li>',
      '</ul>',
      '<p><strong>Cookies & Session Data.</strong> We use cookies and similar technologies to:</p>',
      '<ul>',
        '<li>Keep you signed in</li>',
        '<li>Maintain secure sessions</li>',
        '<li>Improve security and user experience</li>',
      '</ul>',
      '<p>These session cookies are:</p>',
      '<ul>',
        '<li>Sent only over secure HTTPS connections</li>',
        '<li>Not accessible by third-party scripts in your browser</li>',
        '<li>Used only for authentication and session management</li>',
      '</ul>',

      '<h4>2. How We Use Your Information</h4>',
      '<p>We use collected information to:</p>',
      '<ul>',
        '<li>Provide and maintain the Service</li>',
        '<li>Authenticate users and manage accounts</li>',
        '<li>Improve performance and functionality</li>',
        '<li>Prevent abuse, fraud, and security issues</li>',
        '<li>Communicate important updates related to the Service</li>',
      '</ul>',

      '<h4>3. How We Protect Your Information</h4>',
      '<p>We take reasonable technical and organizational measures to protect your data, including:</p>',
      '<ul>',
        '<li>Passwords are securely hashed and never stored in plain text</li>',
        '<li>Secure session handling using protected cookies</li>',
        '<li>HTTPS encryption for data transmission where applicable</li>',
      '</ul>',
      '<p>However, no system is 100% secure, and we cannot guarantee absolute security.</p>',

      '<h4>4. Sharing of Information</h4>',
      '<p><strong>We do not sell your personal information.</strong></p>',
      '<p>We may share information only in the following cases:</p>',
      '<ul>',
        '<li>To comply with legal obligations</li>',
        '<li>To protect the security or integrity of the Service</li>',
        '<li>With trusted service providers who help operate the Service (e.g. hosting), under strict confidentiality</li>',
      '</ul>',

      '<h4>5. Data Retention</h4>',
      '<p>We retain your information only as long as necessary to:</p>',
      '<ul>',
        '<li>Provide the Service</li>',
        '<li>Comply with legal requirements</li>',
        '<li>Resolve disputes and enforce agreements</li>',
      '</ul>',
      '<p>You may request deletion of your account at any time.</p>',

      '<h4>6. Your Rights</h4>',
      '<p>Depending on your location, you may have rights to:</p>',
      '<ul>',
        '<li>Access your personal data</li>',
        '<li>Request correction of inaccurate data</li>',
        '<li>Request deletion of your data</li>',
        '<li>Withdraw consent where applicable</li>',
      '</ul>',
      '<p>To make a request, contact us at: <a href="mailto:kobus.email@gmail.com">kobus.email@gmail.com</a></p>',

      '<h4>7. Third-Party Services</h4>',
      '<p>We may use third-party services (such as hosting or analytics providers). These services may process limited data on our behalf but are not allowed to use it for their own purposes.</p>',

      '<h4>8. Children\'s Privacy</h4>',
      '<p>The Service is not intended for children under the age of majority without parental or guardian consent. We do not knowingly collect personal data from children without appropriate consent.</p>',

      '<h4>9. Security Limitations</h4>',
      '<p>While we implement strong security measures, no method of transmission or storage is completely secure. You use the Service at your own risk.</p>',

      '<h4>10. Changes to This Policy</h4>',
      '<p>We may update this Privacy Policy from time to time. When changes are made, we will update the "Last updated" date. Continued use of the Service means you accept the updated policy.</p>',

      '<h4>11. Contact</h4>',
      '<p>If you have any questions about this Privacy Policy, you can contact us at:</p>',
      '<p><a href="mailto:kobus.email@gmail.com">kobus.email@gmail.com</a></p>'
    ].join('');
  }

  function buildTermsHtml() {
    return [
      '<p>These Terms & Conditions ("Terms") govern your access to and use of <strong>Working Title</strong> ("Service"), operated by <strong>Kobus Liebenberg</strong> ("we", "us", "our").</p>',
      '<p>By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, you may not use the Service.</p>',

      '<h4>1. Eligibility</h4>',
      '<p>You must be at least the age of majority in your jurisdiction or have legal parental or guardian consent to use this Service.</p>',

      '<h4>2. Accounts</h4>',
      '<p>To access certain features, you may be required to create an account. You agree to:</p>',
      '<ul>',
        '<li>Provide accurate and complete information</li>',
        '<li>Maintain the security of your login credentials</li>',
        '<li>Be responsible for all activity under your account</li>',
      '</ul>',
      '<p>We reserve the right to suspend or terminate accounts that violate these Terms.</p>',

      '<h4>3. Account Security</h4>',
      '<p>We take reasonable measures to protect your account and data.</p>',
      '<ul>',
        '<li>Passwords are securely stored using hashing methods and are never stored in plain text.</li>',
        '<li>We do not have access to your password at any time.</li>',
        '<li>When you sign in, we may use secure session technology (such as cookies) to maintain your login session. These are designed to protect your account and cannot be accessed by third-party scripts in your browser.</li>',
        '<li>Session cookies are only transmitted over secure (HTTPS) connections.</li>',
      '</ul>',
      '<p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.</p>',

      '<h4>4. Acceptable Use</h4>',
      '<p>You agree not to:</p>',
      '<ul>',
        '<li>Use the Service for any illegal or unauthorized purpose</li>',
        '<li>Attempt to gain unauthorized access to the Service or other accounts</li>',
        '<li>Interfere with or disrupt the Service or servers</li>',
        '<li>Reverse engineer, copy, or modify the Service</li>',
        '<li>Use the Service to distribute spam, malware, or harmful content</li>',
      '</ul>',
      '<p>We reserve the right to investigate and take appropriate action, including account termination, for violations.</p>',

      '<h4>5. Intellectual Property</h4>',
      '<p>All content, features, design, software, and branding within the Service are owned by or licensed to <strong>Kobus Liebenberg</strong> and are protected by applicable intellectual property laws.</p>',
      '<p>You may not copy, distribute, modify, or create derivative works without prior written consent.</p>',

      '<h4>6. User Content</h4>',
      '<p>If you submit or upload content to the Service:</p>',
      '<ul>',
        '<li>You retain ownership of your content</li>',
        '<li>You grant us a worldwide, non-exclusive, royalty-free license to store, display, and operate your content as necessary to provide the Service</li>',
        '<li>You are solely responsible for your content and ensure it does not violate any laws or rights of others</li>',
      '</ul>',
      '<p>We are not responsible for user-generated content.</p>',

      '<h4>7. Privacy</h4>',
      '<p>Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, and protect your information.</p>',

      '<h4>8. Service Availability</h4>',
      '<p>We do not guarantee that the Service will be uninterrupted, error-free, or permanently available.</p>',
      '<p>We may modify, suspend, or discontinue any part of the Service at any time without liability.</p>',

      '<h4>9. Disclaimer</h4>',
      '<p>The Service is provided on an "as is" and "as available" basis.</p>',
      '<p>We make no warranties or guarantees regarding:</p>',
      '<ul>',
        '<li>Reliability</li>',
        '<li>Availability</li>',
        '<li>Accuracy</li>',
        '<li>Fitness for a particular purpose</li>',
      '</ul>',
      '<p>Your use of the Service is at your own risk.</p>',

      '<h4>10. Limitation of Liability</h4>',
      '<p>To the maximum extent permitted by law:</p>',
      '<p><strong>Kobus Liebenberg</strong> shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, profits, or business opportunities, arising from your use of the Service.</p>',
      '<p>Our total liability for any claim related to the Service shall not exceed the amount you paid (if any) for using the Service.</p>',

      '<h4>11. Indemnification</h4>',
      '<p>You agree to indemnify and hold harmless <strong>Kobus Liebenberg</strong> from any claims, damages, losses, or expenses arising from:</p>',
      '<ul>',
        '<li>Your use of the Service</li>',
        '<li>Your violation of these Terms</li>',
        '<li>Your violation of any rights of another party</li>',
      '</ul>',

      '<h4>12. Termination</h4>',
      '<p>We may suspend or terminate your access to the Service at any time, with or without notice, if you violate these Terms or for any other reason deemed necessary.</p>',
      '<p>You may stop using the Service at any time and request account deletion.</p>',

      '<h4>13. Changes to Terms</h4>',
      '<p>We may update these Terms from time to time. If changes are made, we will update the "Last updated" date. Continued use of the Service after changes means you accept the updated Terms.</p>',

      '<h4>14. Governing Law</h4>',
      '<p>These Terms shall be governed and interpreted in accordance with the laws of your applicable jurisdiction.</p>',

      '<h4>15. Contact</h4>',
      '<p>If you have any questions about these Terms, you can contact us at:</p>',
      '<p><a href="mailto:kobus.email@gmail.com">kobus.email@gmail.com</a></p>'
    ].join('');
  }

  /**
   * Build (lazily) the secondary popup with the full terms / privacy /
   * security explanation. The popup overlays the auth card; its visibility
   * is toggled via the [data-details] attribute on the root.
   */
  let detailsEl = null;
  let detailsBody = null;
  let detailsTabs = null;
  let detailsTab = 'terms';

  function setDetailsTab(tab) {
    detailsTab = tab;
    if (detailsTabs) {
      detailsTabs.terms.dataset.active    = String(tab === 'terms');
      detailsTabs.privacy.dataset.active  = String(tab === 'privacy');
    }
    if (detailsBody) {
      const updated = '<em>Last updated: ' + LEGAL_LAST_UPDATED + '</em>';
      detailsBody.innerHTML = updated +
        (tab === 'terms' ? buildTermsHtml() : buildPrivacyHtml());
      detailsBody.scrollTop = 0;
    }
  }

  function buildDetailsPopup() {
    if (detailsEl) return detailsEl;

    const closeBtn = el('button', {
      class: 'eshu-auth-close',
      type: 'button',
      'aria-label': 'Close details',
      text: '\u2715',
      onclick: closeDetails
    });

    detailsBody = document.createElement('div');
    detailsBody.className = 'eshu-auth-details-body';

    const tabTerms = el('button', {
      class: 'eshu-auth-details-tab',
      type: 'button',
      'data-active': 'true',
      text: 'Terms',
      onclick: () => setDetailsTab('terms')
    });
    const tabPrivacy = el('button', {
      class: 'eshu-auth-details-tab',
      type: 'button',
      text: 'Privacy',
      onclick: () => setDetailsTab('privacy')
    });
    detailsTabs = { terms: tabTerms, privacy: tabPrivacy };

    // Initial body content (Terms tab is the default).
    setDetailsTab('terms');

    const card = el('div', {
      class: 'eshu-auth-details-card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'eshu-auth-details-title'
    }, [
      el('div', { class: 'eshu-auth-details-header' }, [
        el('h3', {
          class: 'eshu-auth-details-title',
          id: 'eshu-auth-details-title',
          text: 'Terms & Privacy'
        }),
        closeBtn
      ]),
      el('div', { class: 'eshu-auth-details-tabs' }, [tabTerms, tabPrivacy]),
      detailsBody
    ]);

    detailsEl = el('div', {
      class: 'eshu-auth-details',
      onclick: (e) => { if (e.target === detailsEl) closeDetails(); }
    }, card);

    return detailsEl;
  }

  function openDetails(opts) {
    if (!state.root) return;
    const popup = buildDetailsPopup();
    if (!popup.isConnected) state.root.appendChild(popup);
    if (opts && (opts.tab === 'terms' || opts.tab === 'privacy')) {
      setDetailsTab(opts.tab);
    }
    state.root.dataset.details = 'true';
  }

  function closeDetails() {
    if (!state.root) return;
    state.root.dataset.details = 'false';
  }

  // ----- T&Cs confirmation (Create-account only) -----------------------
  // Tracks whether the user has clicked "OK, cool" in this overlay session.
  // Reset on close() and on every fresh open() so a returning user must
  // re-acknowledge each time they create an account.
  let termsConfirmed = false;
  let confirmEl = null;

  function buildConfirmPopup() {
    if (confirmEl) return confirmEl;

    const termsLine = document.createElement('p');
    termsLine.className = 'eshu-auth-confirm-terms';
    const termsLink = document.createElement('button');
    termsLink.type = 'button';
    termsLink.className = 'eshu-auth-footer-link';
    termsLink.textContent = 'Terms & Privacy Policy';
    termsLink.addEventListener('click', () => openDetails({ tab: 'terms' }));
    termsLine.appendChild(termsLink);

    const okBtn = el('button', {
      class: 'eshu-auth-confirm-ok', type: 'button', text: 'OK, cool',
      onclick: () => {
        termsConfirmed = true;
        closeConfirm();
        submit();
      }
    });

    const card = el('div', {
      class: 'eshu-auth-confirm-card', role: 'dialog', 'aria-modal': 'true'
    }, [
      el('button', {
        class: 'eshu-auth-confirm-close', type: 'button', 'aria-label': 'Close',
        text: '\u2715', onclick: closeConfirm
      }),
      termsLine,
      el('hr', { class: 'eshu-auth-confirm-rule' }),
      el('div', { class: 'eshu-auth-confirm-actions' }, [okBtn])
    ]);

    confirmEl = el('div', {
      class: 'eshu-auth-confirm',
      onclick: (e) => { if (e.target === confirmEl) closeConfirm(); }
    }, card);

    return confirmEl;
  }

  function openConfirm() {
    if (!state.root) return;
    const popup = buildConfirmPopup();
    if (!popup.isConnected) state.root.appendChild(popup);
    state.root.dataset.confirm = 'true';
    // Auto-focus the green OK button so Enter/Space confirms.
    const ok = popup.querySelector('.eshu-auth-confirm-ok');
    if (ok) setTimeout(() => { try { ok.focus(); } catch {} }, 30);
  }

  function closeConfirm() {
    if (!state.root) return;
    state.root.dataset.confirm = 'false';
    // Restore the submit button if the user cancelled mid-flight.
    if (!termsConfirmed && state.submitBtn) {
      state.submitBtn.disabled = false;
      state.submitBtn.textContent = state.tab === 'signin' ? 'Sign in' : 'Create account';
    }
  }

  function build() {
    if (state.root) return state.root;

    const errorEl = el('div', { class: 'eshu-auth-error', role: 'alert' });

    // Sign-in fields
    const signinUser = el('input', {
      type: 'text', name: 'emailOrUsername', autocomplete: 'username',
      placeholder: 'you@example.com or alice', spellcheck: 'false'
    });
    const signinPass = el('input', {
      type: 'password', name: 'password', autocomplete: 'current-password',
      placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
    });
    // Register fields
    const regEmail = el('input', { type: 'email', name: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    const regUser  = el('input', { type: 'text',  name: 'username', autocomplete: 'username', placeholder: 'alice', spellcheck: 'false' });
    const regPass  = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', placeholder: 'min 8 characters' });

    state.inputs = { signinUser, signinPass, regEmail, regUser, regPass };

    const submitBtn = el('button', { class: 'eshu-auth-submit', type: 'submit' });
    state.submitBtn = submitBtn;
    state.errorEl = errorEl;

    const form = el('form', {
      class: 'eshu-auth-form', novalidate: 'true',
      onsubmit: (e) => { e.preventDefault(); submit(); }
    });

    const fields = el('div', { class: 'eshu-auth-fields' });
    form.appendChild(fields);
    form.appendChild(errorEl);
    form.appendChild(el('div', { class: 'eshu-auth-actions' }, submitBtn));

    function setTab(tab) {
      state.tab = tab;
      tabSignin.dataset.active = String(tab === 'signin');
      tabRegister.dataset.active = String(tab === 'register');
      submitBtn.textContent = tab === 'signin' ? 'Sign in' : 'Create account';
      // Switching tabs invalidates a previous T&Cs confirmation.
      termsConfirmed = false;
      hideError();
      // rebuild fields
      while (fields.firstChild) fields.removeChild(fields.firstChild);
      if (tab === 'signin') {
        fields.appendChild(el('label', { for: 'eshu-auth-su-user', text: 'Email or username' }));
        signinUser.id = 'eshu-auth-su-user';
        fields.appendChild(signinUser);
        fields.appendChild(el('label', { for: 'eshu-auth-su-pass', text: 'Password' }));
        signinPass.id = 'eshu-auth-su-pass';
        fields.appendChild(wrapPasswordReveal(signinPass));
        const forgotLink = el('button', {
          class: 'eshu-auth-forgot-link', type: 'button', text: 'Forgot password?',
          onclick: () => showForgotView()
        });
        fields.appendChild(forgotLink);
        setTimeout(() => signinUser.focus(), 30);
      } else {
        fields.appendChild(el('label', { for: 'eshu-auth-rg-email', text: 'Email' }));
        regEmail.id = 'eshu-auth-rg-email';
        fields.appendChild(regEmail);
        fields.appendChild(el('label', { for: 'eshu-auth-rg-user', text: 'Username' }));
        regUser.id = 'eshu-auth-rg-user';
        fields.appendChild(regUser);
        fields.appendChild(el('label', { for: 'eshu-auth-rg-pass', text: 'Password' }));
        regPass.id = 'eshu-auth-rg-pass';
        fields.appendChild(wrapPasswordReveal(regPass));
        setTimeout(() => regEmail.focus(), 30);
      }
    }

    const forgotEmail = el('input', { type: 'email', name: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
    state.inputs.forgotEmail = forgotEmail;

    function showForgotView() {
      state.view = 'forgot';
      hideError();
      tabsEl.style.display = 'none';
      while (fields.firstChild) fields.removeChild(fields.firstChild);
      submitBtn.textContent = 'Send reset link';
      fields.appendChild(el('button', {
        class: 'eshu-auth-back-link', type: 'button',
        text: 'Back to sign in',
        onclick: () => { state.view = 'main'; tabsEl.style.display = ''; setTab('signin'); }
      }));
      fields.appendChild(el('p', { class: 'eshu-auth-reset-hint',
        text: 'Enter your email and we\'ll send you a link to reset your password.'
      }));
      fields.appendChild(el('label', { for: 'eshu-auth-fe-email', text: 'Email' }));
      forgotEmail.id = 'eshu-auth-fe-email';
      forgotEmail.value = isEmailLike(state.inputs.signinUser.value.trim())
        ? state.inputs.signinUser.value.trim() : '';
      fields.appendChild(forgotEmail);
      setTimeout(() => forgotEmail.focus(), 30);
    }

    const tabSignin = el('button', {
      class: 'eshu-auth-tab', type: 'button', 'data-active': 'true', text: 'Sign in',
      onclick: () => setTab('signin')
    });
    const tabRegister = el('button', {
      class: 'eshu-auth-tab', type: 'button', text: 'Create account',
      onclick: () => setTab('register')
    });

    const tabsEl = el('div', { class: 'eshu-auth-tabs' }, [tabSignin, tabRegister]);

    const card = el('div', { class: 'eshu-auth-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'eshu-auth-title' }, [
      el('div', { class: 'eshu-auth-header' }, [
        el('h2', { class: 'eshu-auth-title', id: 'eshu-auth-title', text: 'ESHU Account' }),
        el('button', { class: 'eshu-auth-close', type: 'button', 'aria-label': 'Close', text: '\u2715', onclick: close })
      ]),
      tabsEl,
      el('div', { class: 'eshu-auth-body' }, form),
      el('div', { class: 'eshu-auth-footer' }, [
        buildFooterNote()
      ])
    ]);

    const root = el('div', {
      id: ROOT_ID,
      'aria-hidden': 'true',
      onclick: (e) => { if (e.target === root) close(); }
    }, card);

    document.body.appendChild(root);
    state.root = root;

    setTab('signin');
    state.showForgotView = showForgotView;
    return root;
  }

  function showError(msg) {
    if (!state.errorEl) return;
    state.errorEl.textContent = msg || 'Something went wrong.';
    state.errorEl.dataset.visible = 'true';
    state.errorEl.dataset.kind = 'error';
  }
  function hideError() {
    if (!state.errorEl) return;
    state.errorEl.dataset.visible = 'false';
    state.errorEl.textContent = '';
    state.errorEl.dataset.kind = 'error';
  }

  async function submit() {
    if (!window.ESHU_API) {
      showError('API not loaded.');
      return;
    }
    hideError();

    // T&Cs gate for Create-account: validate inputs first, then prompt.
    // Pre-validating means the user isn't bothered with the prompt only to
    // immediately hit a "password too short" error.
    if (state.tab === 'register' && !termsConfirmed) {
      const email = state.inputs.regEmail.value.trim();
      const username = state.inputs.regUser.value.trim();
      const password = state.inputs.regPass.value;
      if (!email || !username || !password) {
        showError('All fields are required.');
        return;
      }
      if (password.length < 8) {
        showError('Password must be at least 8 characters.');
        return;
      }
      openConfirm();
      return;
    }

    state.submitBtn.disabled = true;
    const original = state.submitBtn.textContent;
    if (state.view === 'forgot') {
      state.submitBtn.textContent = 'Sending\u2026';
    } else {
      state.submitBtn.textContent = state.tab === 'signin' ? 'Signing in\u2026' : 'Creating\u2026';
    }

    try {
      if (state.view === 'forgot') {
        const email = state.inputs.forgotEmail.value.trim();
        if (!email) throw new Error('Please enter your email address.');
        await window.ESHU_API.auth.forgotPassword({ email });
        state.submitBtn.disabled = false;
        state.submitBtn.textContent = original;
        showStatus('If that email has an account, a reset link is on its way.');
        return;
      }
      const useSupabaseAuth = await shouldUseSupabaseAuth();
      if (state.tab === 'signin') {
        const emailOrUsername = state.inputs.signinUser.value.trim();
        const password = state.inputs.signinPass.value;
        if (!emailOrUsername || !password) throw new Error('Both fields are required.');
        if (useSupabaseAuth && isEmailLike(emailOrUsername)) {
          await signInWithSupabase(emailOrUsername, password);
        } else {
          await window.ESHU_API.auth.login({ emailOrUsername, password });
        }
      } else {
        const email = state.inputs.regEmail.value.trim();
        const username = state.inputs.regUser.value.trim();
        const password = state.inputs.regPass.value;
        if (!email || !username || !password) throw new Error('All fields are required.');
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (useSupabaseAuth) {
          await signUpWithSupabase(email, password, username);
          state.submitBtn.disabled = false;
          state.submitBtn.textContent = original;
          state.inputs.regPass.value = '';
          state.inputs.signinUser.value = email;
          showStatus('Check your email for a confirmation link, then come back here and sign in.');
          return;
        }
        await window.ESHU_API.auth.register({ email, username, password });
      }

      await finalizeSuccess();
    } catch (err) {
      // On forgot-password view: show confirmation regardless (no enumeration).
      if (state.view === 'forgot') {
        state.submitBtn.disabled = false;
        state.submitBtn.textContent = 'Send reset link';
        showStatus('If that email has an account, a reset link is on its way.');
        return;
      }
      // On register: if account already exists, switch to sign-in tab and nudge.
      if (state.tab === 'register' && err && err.status === 409) {
        state.submitBtn.disabled = false;
        state.submitBtn.textContent = original;
        const email = state.inputs.regEmail.value.trim();
        state.inputs.signinUser.value = email;
        const tabs = state.root && state.root.querySelectorAll('.eshu-auth-tab');
        if (tabs) tabs.forEach((b) => { if (b.textContent === 'Sign in') b.click(); });
        showStatus('Looks like you already have an account. Sign in below.');
        return;
      }
      // On sign-in: if credentials not recognised, switch to register tab and nudge.
      if (state.tab === 'signin' && err && (err.status === 401 || err.message === 'Invalid login credentials')) {
        state.submitBtn.disabled = false;
        state.submitBtn.textContent = original;
        const typed = state.inputs.signinUser.value.trim();
        if (isEmailLike(typed)) state.inputs.regEmail.value = typed;
        const tabs = state.root && state.root.querySelectorAll('.eshu-auth-tab');
        if (tabs) tabs.forEach((b) => { if (b.textContent === 'Create account') b.click(); });
        showStatus("Don't have an account yet? Create one below.");
        return;
      }
      showError(humanizeError(err));
      state.submitBtn.disabled = false;
      state.submitBtn.textContent = original;
    }
  }

  function humanizeError(err) {
    if (!err) return 'Unknown error.';
    if (err.code === 'NetworkError') return 'Cannot reach the server. Is the backend running?';
    if (err.code === 'ApiNotConfigured') return 'This deployed site is missing its backend API. Point the frontend at your server before signing in or creating an account.';
    if (err.status === 401) return 'Invalid credentials.';
    if (err.status === 403) return err.message || 'Please confirm your email before signing in.';
    if (err.status === 409) return 'Email or username already in use.';
    if (err.message === 'Email not confirmed') return 'Please confirm your email before signing in.';
    if (err.message === 'Invalid login credentials') return 'Invalid credentials.';
    if (err.status === 400 && err.details && err.details.fieldErrors) {
      const fe = err.details.fieldErrors;
      const first = Object.entries(fe).find(([, v]) => Array.isArray(v) && v.length);
      if (first) return `${first[0]}: ${first[1][0]}`;
    }
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    if (typeof err.error === 'string' && err.error.trim()) return err.error;
    if (err.details && typeof err.details === 'object') {
      try {
        return JSON.stringify(err.details);
      } catch {}
    }
    if (typeof err === 'string' && err.trim()) return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Request failed.';
    }
  }

  let lastFocus = null;

  function open(opts) {
    injectStyles();
    build();
    state.reloadOnSuccess = !(opts && opts.reloadOnSuccess === false);
    // Each fresh open requires a fresh T&Cs acknowledgement.
    termsConfirmed = false;
    // If overlay was left on the forgot-password view, snap back to sign-in.
    if (state.view === 'forgot' && state.root) {
      const tabsElRef = state.root.querySelector('.eshu-auth-tabs');
      if (tabsElRef) tabsElRef.style.display = '';
      state.view = 'main';
    }
    if (opts && (opts.tab === 'signin' || opts.tab === 'register')) {
      // Find the tab button and click it
      const tabs = state.root.querySelectorAll('.eshu-auth-tab');
      tabs.forEach((b) => {
        if ((opts.tab === 'signin' && b.textContent === 'Sign in') ||
            (opts.tab === 'register' && b.textContent === 'Create account')) {
          b.click();
        }
      });
    }
    lastFocus = document.activeElement;
    state.root.dataset.open = 'true';
    state.root.setAttribute('aria-hidden', 'false');
    handleConfirmationHint();
    document.addEventListener('keydown', onKey);
  }

  function close() {
    if (!state.root) return;
    state.root.dataset.open = 'false';
    state.root.dataset.confirm = 'false';
    state.root.dataset.details = 'false';
    state.root.setAttribute('aria-hidden', 'true');
    termsConfirmed = false;
    if (state.view === 'forgot' && typeof state.showForgotView === 'function') {
      state.view = 'main';
    }
    document.removeEventListener('keydown', onKey);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch {}
    }
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    // Nested popups close from the top of the stack down: details sits
    // above confirm, which sits above the auth modal itself.
    if (state.root && state.root.dataset.details === 'true') {
      closeDetails();
      return;
    }
    if (state.root && state.root.dataset.confirm === 'true') {
      closeConfirm();
      return;
    }
    close();
  }

  // Resolve the path to play.html (the landing surface) regardless of which
  // page the user signed out from. We replace the last path segment so this
  // works whether served from `/pages/home.html`, `/home.html`, or a flat
  // deployment root.
  function landingHref() {
    try {
      const base = location.pathname.replace(/[^/]+$/, '');
      return base + 'play.html';
    } catch {
      return 'play.html';
    }
  }

  function confirmSignOut() {
    injectStyles();
    return new Promise((resolve) => {
      const previousActiveElement = document.activeElement;
      const backdrop = document.createElement('div');
      backdrop.className = 'eshu-signout-confirm-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'eshuSignoutConfirmTitle');
      backdrop.innerHTML = `
        <div class="eshu-signout-confirm-card">
          <h2 class="eshu-signout-confirm-title" id="eshuSignoutConfirmTitle">SIGN OUT</h2>
          <div class="eshu-signout-confirm-actions">
            <button type="button" class="eshu-signout-negative">Negative</button>
            <button type="button" class="eshu-signout-affirm">Affirm</button>
          </div>
        </div>
      `;

      const close = (confirmed) => {
        backdrop.remove();
        document.removeEventListener('keydown', onConfirmKey);
        try {
          if (!confirmed && previousActiveElement && typeof previousActiveElement.focus === 'function') {
            previousActiveElement.focus();
          }
        } catch {}
        resolve(!!confirmed);
      };

      const onConfirmKey = (event) => {
        if (event.key === 'Escape') close(false);
        if (event.key === 'Enter') close(true);
      };

      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close(false);
      });
      backdrop.querySelector('.eshu-signout-negative')?.addEventListener('click', () => close(false));
      backdrop.querySelector('.eshu-signout-affirm')?.addEventListener('click', () => close(true));
      document.addEventListener('keydown', onConfirmKey);
      document.body.appendChild(backdrop);
      setTimeout(() => {
        try { backdrop.querySelector('.eshu-signout-negative')?.focus(); } catch {}
      }, 0);
    });
  }

  async function performLogout() {
    if (!window.ESHU_API) {
      try { location.replace(landingHref()); }
      catch { location.href = 'play.html'; }
      return;
    }

    // CRITICAL ORDERING: flush any unsynced changes to the server BEFORE we
    // destroy the session below. Writes are debounced (~600ms) and may also be
    // mid-flight; if we log out (which deletes the server session and then
    // wipes the local cache) without flushing, those last edits are lost for
    // good — the keepalive flush can't save them either because the session
    // cookie is already gone. This was the "made changes, logged out and back
    // in, everything reverted to the old version" bug. Cap the wait so a dead
    // network never traps the user on a page they're trying to leave.
    try {
      if (window.ESHU_REMOTE && typeof window.ESHU_REMOTE.flushPending === 'function') {
        await Promise.race([
          window.ESHU_REMOTE.flushPending({ retries: 2 }),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
    } catch {}

    // Best-effort server logout (clears the session cookie). Never block
    // the local cleanup on a network failure: the user expects the app to
    // forget them either way.
    try { await window.ESHU_API.auth.logout(); } catch {}

    // Also end the persisted Supabase session. Without this, the app-session
    // re-bridge (which exists so an expired cookie auto-recovers from a live
    // Supabase session) would immediately sign the user BACK IN on the very
    // next page load — making "Sign out" do nothing. Explicit logout must
    // clear both layers.
    try {
      if (window.ESHU_SUPABASE && typeof window.ESHU_SUPABASE.getClient === 'function') {
        const sb = await window.ESHU_SUPABASE.getClient();
        if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
          await sb.auth.signOut();
        }
      }
    } catch {}

    // Defensive: any code path that reads window.ESHU_AUTH between this
    // function body and the location.replace below should see "signed out".
    // The remote driver re-populates ESHU_AUTH on its next activation.
    try { window.ESHU_AUTH = null; } catch {}

    // Purge the previous account's local snapshot so the next user (or an
    // anonymous browse) does NOT inherit ghost groups / games / profile
    // data. Without this, "Create Game" and similar gating reads stale ids
    // from the prior session and breaks.
    try {
      if (window.ESHU_REMOTE && typeof window.ESHU_REMOTE.clearLocalCache === 'function') {
        window.ESHU_REMOTE.clearLocalCache();
      } else {
        // Fallback: remote driver helper isn't loaded on this page. Do the
        // minimum cleanup ourselves so logout still feels clean.
        const keys = ['eshu_db_v2', 'eshu_db_v1', 'groups', 'games', 'creationsList',
          'xpPoints', 'profileName', 'profileDesc', 'primaryGroupId', 'userProfile'];
        keys.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
        try { sessionStorage.clear(); } catch {}
      }
      // Reset the in-memory ESHU_DB if available so the current page tears
      // down cleanly before we navigate away.
      if (window.ESHU_DB && typeof window.ESHU_DB.resetStorage === 'function') {
        try { window.ESHU_DB.resetStorage({ dropLegacy: true }); } catch {}
      }
    } catch {}

    try { window.dispatchEvent(new CustomEvent('eshu:auth-logout')); } catch {}

    // Land on play.html (the marketing/entry surface) rather than reloading
    // whatever protected page the user was on. `replace` so Back doesn't
    // return to the now-empty authenticated view.
    try { location.replace(landingHref()); }
    catch { location.reload(); }
  }

  async function logout() {
    const confirmed = await confirmSignOut();
    if (!confirmed) return;
    await performLogout();
  }

  function maybeAutoOpen() {
    // Defer one tick so concurrently-loading scripts (e.g. ESHU_API) finish
    // booting and the overlay can render its styles cleanly.
    setTimeout(() => {
      try { open({ tab: 'signin' }); } catch {}
    }, 0);
  }

  window.addEventListener('eshu:sync-unauthenticated', maybeAutoOpen);
  // After a successful logout the storage driver doesn't re-emit
  // `sync-unauthenticated` (the page is already navigating to play.html),
  // so no extra wiring is needed for that path.

  window.ESHU_AUTH_UI = { open, close, logout };
})();
