// API base URL — для cross-origin (фронт на Vercel, бэк на Render).
// На localhost / собственном домене бэкенда — пусто, идут относительные запросы.
window.API_BASE = (() => {
  const h = location.hostname;
  if (h.endsWith('.vercel.app') || h.endsWith('.netlify.app')) {
    return 'https://omnix-backend-wig1.onrender.com';
  }
  return '';
})();

// JWT в localStorage + заголовок Authorization — работает в incognito/без third-party cookies.
const TOKEN_KEY = 'omx_token';
window.getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
window.setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

// Если на странице логина/регистрации уже есть валидный токен — сразу в дашборд.
window.requireGuest = async function requireGuest() {
  if (!window.getToken()) return;
  const r = await window.api('GET', '/api/auth/me');
  if (r.ok) {
    const next = new URLSearchParams(location.search).get('next') || 'dashboard.html';
    location.replace(next);
  }
};

// Помогает Chrome предложить сохранить пароль через Credential Management API.
window.savePasswordCredential = async function savePasswordCredential(email, password, name) {
  if (!window.PasswordCredential) return;
  try {
    const cred = new window.PasswordCredential({
      id: email, password, name: name || email,
    });
    await navigator.credentials.store(cred);
  } catch {}
};

// «Сервер просыпается» overlay — для cold start free-tier Render (15 мин idle = 30-60 сек ожидание).
let __wakeOverlay = null;
function showWakeOverlay() {
  if (__wakeOverlay) return;
  const el = document.createElement('div');
  el.id = 'omnix-wake';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(11, 11, 20, 0.92); backdrop-filter: blur(8px);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #fff; font: 600 16px/1.5 Manrope, system-ui, sans-serif;
    text-align: center; padding: 40px 20px;
  `;
  el.innerHTML = `
    <div style="width: 56px; height: 56px; border: 4px solid rgba(124,92,255,0.3); border-top-color: #7C5CFF; border-radius: 50%; animation: omnix-spin 0.8s linear infinite; margin-bottom: 24px;"></div>
    <div style="font-size: 18px; margin-bottom: 8px;">Сервер просыпается…</div>
    <div style="font-size: 13px; color: rgba(255,255,255,0.6); max-width: 360px;">Бесплатный план Render засыпает через 15 минут простоя. Первый запрос займёт ~30-60 секунд — потом будет шустро.</div>
    <style>@keyframes omnix-spin { to { transform: rotate(360deg); } }</style>
  `;
  document.body.appendChild(el);
  __wakeOverlay = el;
}
function hideWakeOverlay() {
  if (!__wakeOverlay) return;
  __wakeOverlay.style.transition = 'opacity .3s';
  __wakeOverlay.style.opacity = '0';
  setTimeout(() => { __wakeOverlay?.remove(); __wakeOverlay = null; }, 300);
}

// Прогрев бэкенда сразу при загрузке страницы — чтобы к моменту клика юзера он уже проснулся.
if (window.API_BASE) {
  fetch(window.API_BASE + '/healthz', { method: 'GET', mode: 'cors' }).catch(() => {});
}

// Lightweight client helpers — used by all auth/dashboard/admin pages
window.api = async function api(method, url, body) {
  const init = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  const tok = window.getToken();
  if (tok) init.headers['Authorization'] = `Bearer ${tok}`;
  if (body && method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const finalUrl = url.startsWith('/') ? (window.API_BASE + url) : url;

  // Если запрос идёт > 2 секунд — показываем «сервер просыпается»
  const slowTimer = setTimeout(showWakeOverlay, 2000);

  let res;
  try {
    res = await fetch(finalUrl, init);
  } catch {
    clearTimeout(slowTimer);
    hideWakeOverlay();
    return { ok: false, error: 'network' };
  }
  clearTimeout(slowTimer);
  hideWakeOverlay();

  let data = {};
  try { data = await res.json(); } catch {}

  // Авто-сохранение/очистка токена по auth-эндпоинтам
  if (data && typeof data.token === 'string') window.setToken(data.token);
  if (url === '/api/auth/logout' && res.ok) window.setToken(null);

  if (!res.ok) {
    // Если 401 — токен невалиден, чистим
    if (res.status === 401) window.setToken(null);
    return { ok: false, error: data.error || `http_${res.status}`, status: res.status, ...data };
  }
  return { ok: true, ...data };
};

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
  const d = new Date(Number(ts));
  return d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
};

// Banner: показывается если API_BASE не настроен (placeholder) или открыто через file://
(function envGuard() {
  const isFile = location.protocol === 'file:';
  const apiNotConfigured = (window.API_BASE || '').includes('REPLACE-WITH-RENDER-URL');
  if (!isFile && !apiNotConfigured) return;

  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: ${isFile ? '#EF4444' : 'linear-gradient(135deg, #7C5CFF, #22D3EE)'};
    color: ${isFile ? '#fff' : '#0B0B14'};
    padding: 12px 20px; text-align: center;
    font: 600 13px/1.4 Manrope, system-ui, sans-serif;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `;
  if (isFile) {
    banner.innerHTML = `
      Сайт открыт через <code style="background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px">file://</code> —
      API не работает. Открой <a href="http://localhost:3000" style="color:#fff; text-decoration:underline; font-weight:800">http://localhost:3000</a>
      (запусти <code style="background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px">npm start</code>)
    `;
  } else {
    banner.innerHTML = `
      <strong>SETUP</strong> · Бэкенд не подключён — пропиши URL Render-сервиса в <code style="background:rgba(0,0,0,0.15); padding:2px 6px; border-radius:4px">auth.js</code> (window.API_BASE).
    `;
  }
  document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner));
})();

// Mobile drawer (hamburger menu) — works for dashboard/admin/tool
(function mobileDrawer() {
  function init() {
    const toggle = document.getElementById('menu-toggle');
    if (!toggle) return;

    // Inject backdrop once
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

    // Close on nav click (event delegation)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.sidebar a, .sidebar .side-link');
      if (link) document.body.classList.remove('menu-open');
    });

    // Close on resize-to-desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 880) document.body.classList.remove('menu-open');
    });

    // Close on Escape
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

// Hide unconfigured OAuth providers
window.checkProviders = async function checkProviders() {
  if (location.protocol === 'file:') return;
  try {
    const r = await fetch('/api/auth/providers', { credentials: 'include' });
    if (!r.ok) return;
    const p = await r.json();
    if (!p.google) {
      document.querySelectorAll('[data-provider="google"]').forEach(el => el.remove());
    }
    if (!p.telegram) {
      document.querySelectorAll('[data-provider="telegram"]').forEach(el => el.remove());
    }
    // Hide divider + providers wrapper if nothing left
    const wrap = document.querySelector('.auth-providers');
    if (wrap && !wrap.children.length) {
      wrap.remove();
      document.querySelector('.auth-divider')?.remove();
    }
  } catch {}
};
