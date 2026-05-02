// API base URL — для cross-origin (фронт на Vercel, бэк на Render).
// На localhost / собственном домене бэкенда — пусто, идут относительные запросы.
window.API_BASE = (() => {
  const h = location.hostname;
  if (h.endsWith('.vercel.app') || h.endsWith('.netlify.app')) {
    return 'https://omnix-backend-wig1.onrender.com';
  }
  return '';
})();

// Lightweight client helpers — used by all auth/dashboard/admin pages
window.api = async function api(method, url, body) {
  const init = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (body && method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const finalUrl = url.startsWith('/') ? (window.API_BASE + url) : url;
  let res;
  try {
    res = await fetch(finalUrl, init);
  } catch {
    return { ok: false, error: 'network' };
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) return { ok: false, error: data.error || `http_${res.status}`, status: res.status, ...data };
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
