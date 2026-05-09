// =====================================================================
// OmnixOS · auth.js — Supabase Auth integration
// supabase.js (window.sb) должен быть подгружен ДО этого файла.
// =====================================================================

// ---------- Auth API (новые функции, использует supabase.auth) ----------

window.omxLogin = async (email, password) => {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user, session: data.session };
};

window.omxRegister = async (email, password, name) => {
  const redirectTo = `${location.origin}/verify.html`;
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: redirectTo },
  });
  if (error) return { ok: false, error: error.message };
  // Если у проекта включён email confirmation — session не возвращается до verify.
  return { ok: true, user: data.user, needsVerify: !data.session };
};

window.omxLogout = async () => {
  await sb.auth.signOut();
};

window.omxResetPassword = async (email) => {
  const redirectTo = `${location.origin}/reset.html`;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  return { ok: !error, error: error?.message };
};

window.omxUpdatePassword = async (newPassword) => {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  return { ok: !error, error: error?.message };
};

window.omxOAuthGoogle = async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}/dashboard.html` },
  });
  return { ok: !error, error: error?.message };
};

// ---------- Session helpers ----------

window.omxGetSession = async () => {
  const { data } = await sb.auth.getSession();
  return data.session;
};

window.omxGetUser = async () => {
  const { data } = await sb.auth.getUser();
  return data.user;
};

window.omxGetProfile = async () => {
  const session = await omxGetSession();
  if (!session) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return data;
};

// ---------- Guards (для auth/dashboard страниц) ----------

window.requireAuth = async () => {
  const session = await omxGetSession();
  if (!session) {
    const next = location.pathname + location.search;
    location.replace('login.html?next=' + encodeURIComponent(next));
    return null;
  }
  return session;
};

window.requireGuest = async () => {
  const session = await omxGetSession();
  if (session) {
    const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
    location.replace(next);
  }
};

// Совместимость с предыдущим кодом
window.getToken = () => null;
window.setToken = () => {};

// Chrome PasswordCredential — для запоминания пароля браузером
window.savePasswordCredential = async function savePasswordCredential(email, password, name) {
  if (!window.PasswordCredential) return;
  try {
    const cred = new window.PasswordCredential({ id: email, password, name: name || email });
    await navigator.credentials.store(cred);
  } catch {}
};

// ---------- Утилиты UI ----------

window.toast = function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3500);
  setTimeout(() => el.remove(), 3900);
};

window.esc = function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

window.fmtDate = function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
};

// Hide unconfigured OAuth providers (Telegram скрываем — Supabase его не поддерживает нативно)
window.checkProviders = async function checkProviders() {
  document.querySelectorAll('[data-provider="telegram"]').forEach(el => el.remove());
  const wrap = document.querySelector('.auth-providers');
  if (wrap && !wrap.children.length) {
    wrap.remove();
    document.querySelector('.auth-divider')?.remove();
  }
};

// ---------- Mobile drawer (без изменений) ----------
(function mobileDrawer() {
  function init() {
    const toggle = document.getElementById('menu-toggle');
    if (!toggle) return;

    if (!document.querySelector('.menu-backdrop')) {
      const bd = document.createElement('div');
      bd.className = 'menu-backdrop';
      document.body.appendChild(bd);
      bd.addEventListener('click', () => document.body.classList.remove('menu-open'));
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      document.body.classList.toggle('menu-open');
    });

    document.addEventListener('click', (e) => {
      const link = e.target.closest('.sidebar a, .sidebar .side-link');
      if (link) document.body.classList.remove('menu-open');
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 880) document.body.classList.remove('menu-open');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.body.classList.remove('menu-open');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
