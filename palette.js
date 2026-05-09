// =====================================================================
// OmnixOS · Command Palette (Ctrl/Cmd + K)
// Глобальный поиск по задачам, целям, привычкам, дневнику + быстрое создание задач.
// Подключается на страницы кабинета и инструментов; sb (supabase) и t (i18n) уже доступны.
// =====================================================================

(function () {
  let isOpen = false;
  let cachedUid = null;
  let activeIndex = 0;
  let lastResults = [];

  async function uid() {
    if (cachedUid) return cachedUid;
    const u = await omxGetUser();
    cachedUid = u?.id || null;
    return cachedUid;
  }

  function ensureRoot() {
    let r = document.getElementById('cp-root');
    if (!r) {
      r = document.createElement('div');
      r.id = 'cp-root';
      document.body.appendChild(r);
    }
    return r;
  }

  function escHtml(s) {
    return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    const root = ensureRoot();
    root.innerHTML = `
      <div class="cp-bg" id="cp-bg">
        <div class="cp-modal" role="dialog" aria-label="${escHtml(t('common.search'))}">
          <input class="cp-input" id="cp-input" type="text"
            placeholder="${escHtml(t('common.search_placeholder'))}" autocomplete="off"/>
          <div class="cp-results" id="cp-results"></div>
          <div class="cp-foot">
            <span><span class="cp-kbd">↑</span> <span class="cp-kbd">↓</span> навигация</span>
            <span><span class="cp-kbd">Enter</span> открыть</span>
            <span><span class="cp-kbd">Esc</span> закрыть</span>
          </div>
        </div>
      </div>
    `;
    document.getElementById('cp-bg').addEventListener('click', (e) => {
      if (e.target.id === 'cp-bg') close();
    });
    const input = document.getElementById('cp-input');
    input.focus();
    input.addEventListener('input', () => doSearch(input.value));
    input.addEventListener('keydown', onKey);
    // initial — список действий
    doSearch('');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    const root = document.getElementById('cp-root');
    if (root) root.innerHTML = '';
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); pickActive(); return; }
  }

  function move(d) {
    if (!lastResults.length) return;
    activeIndex = (activeIndex + d + lastResults.length) % lastResults.length;
    highlight();
  }

  function highlight() {
    const items = document.querySelectorAll('#cp-results .cp-item');
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    const active = items[activeIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function pickActive() {
    const item = lastResults[activeIndex];
    if (!item) return;
    if (item.action) item.action();
    else if (item.href) location.href = item.href;
  }

  let searchTimer = null;
  function doSearch(q) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(q), 130);
  }

  async function runSearch(q) {
    const uId = await uid();
    if (!uId) return;
    q = (q || '').trim();
    const results = [];

    // Quick action: create task с префикса "+"
    if (q.startsWith('+') && q.length > 1) {
      const title = q.slice(1).trim();
      results.push({
        section: 'cp.cp_section_actions',
        icon: '＋',
        title: t('common.search_quick_create', { title }),
        meta: 'Enter',
        action: async () => {
          await sb.from('tasks').insert({
            user_id: uId, title, quadrant: 2,
            due_date: new Date().toISOString().slice(0, 10),
          });
          if (typeof toast === 'function') toast(t('common.created'), 'success');
          close();
          // Перезагружаем дашборд если на нём
          if (typeof window.loadOverviewData === 'function') window.loadOverviewData();
        },
      });
    }

    // Static actions
    const navItems = [
      { slug: 'dashboard', icon: '◎' },
      { slug: 'goals', icon: '◇' },
      { slug: 'tasks', icon: '▦' },
      { slug: 'planner', icon: '⊞' },
      { slug: 'habits', icon: '∞' },
      { slug: 'finances', icon: '$' },
      { slug: 'health', icon: '♡' },
      { slug: 'reviews', icon: '↻' },
      { slug: 'journal', icon: '✎' },
      { slug: 'ai', icon: '✦' },
      { slug: 'gamification', icon: '★' },
    ];
    for (const n of navItems) {
      const name = t(`tools.${n.slug}.name`);
      if (!q || name.toLowerCase().includes(q.toLowerCase())) {
        results.push({
          section: 'cp.cp_section_actions', icon: n.icon, title: name,
          href: `tool.html?slug=${n.slug}`,
        });
      }
    }
    if (!q || 'личный кабинет cabinet personal'.includes(q.toLowerCase())) {
      results.push({
        section: 'cp.cp_section_actions', icon: '◐',
        title: t('nav.personal_cabinet'), href: 'dashboard.html',
      });
    }

    // DB queries — only if user typed something
    if (q.length >= 2 && !q.startsWith('+')) {
      const like = `%${q}%`;
      const [tRes, gRes, hRes, jRes] = await Promise.all([
        sb.from('tasks').select('id, title, quadrant, due_date, status').eq('user_id', uId).ilike('title', like).limit(8),
        sb.from('goals').select('id, title, progress').eq('user_id', uId).ilike('title', like).limit(5),
        sb.from('habits').select('id, name, icon').eq('user_id', uId).eq('archived', false).ilike('name', like).limit(5),
        sb.from('journal').select('id, title, body, created_at').eq('user_id', uId).or(`title.ilike.${like},body.ilike.${like}`).limit(5),
      ]);
      for (const r of tRes.data || []) {
        results.push({
          section: 'cp.cp_section_tasks', icon: '◇',
          title: r.title,
          meta: r.due_date ? r.due_date : (r.status === 'done' ? '✓' : ''),
          href: `tool.html?slug=tasks`,
        });
      }
      for (const r of gRes.data || []) {
        results.push({
          section: 'cp.cp_section_goals', icon: '◆',
          title: r.title, meta: `${r.progress}%`,
          href: `tool.html?slug=goals`,
        });
      }
      for (const r of hRes.data || []) {
        results.push({
          section: 'cp.cp_section_habits', icon: r.icon || '∞',
          title: r.name,
          href: `tool.html?slug=habits`,
        });
      }
      for (const r of jRes.data || []) {
        results.push({
          section: 'cp.cp_section_journal', icon: '✎',
          title: r.title || (r.body || '').slice(0, 60),
          meta: new Date(r.created_at).toLocaleDateString(localeOf?.() || 'ru-RU', { day: 'numeric', month: 'short' }),
          href: `tool.html?slug=journal`,
        });
      }
    }

    lastResults = results;
    activeIndex = 0;
    renderResults();
  }

  function renderResults() {
    const wrap = document.getElementById('cp-results');
    if (!wrap) return;
    if (!lastResults.length) {
      wrap.innerHTML = `<div class="cp-empty">${escHtml(t('common.search_no_results'))}</div>`;
      return;
    }
    let html = '';
    let lastSection = '';
    lastResults.forEach((r, i) => {
      if (r.section !== lastSection) {
        html += `<div class="cp-section">${escHtml(t(r.section.replace('cp.', '')))}</div>`;
        lastSection = r.section;
      }
      html += `<div class="cp-item" data-i="${i}">
        <span class="cp-ic">${escHtml(r.icon || '·')}</span>
        <span class="cp-title">${escHtml(r.title)}</span>
        ${r.meta ? `<span class="cp-meta">${escHtml(r.meta)}</span>` : ''}
      </div>`;
    });
    wrap.innerHTML = html;
    highlight();
    wrap.querySelectorAll('.cp-item').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        activeIndex = +el.dataset.i;
        highlight();
      });
      el.addEventListener('click', () => {
        activeIndex = +el.dataset.i;
        pickActive();
      });
    });
  }

  // Globals
  window.openCommandPalette = open;
  window.closeCommandPalette = close;

  // Hotkey listener
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
      e.preventDefault();
      isOpen ? close() : open();
    }
  });
})();
