// =====================================================================
// OmnixOS · ai-assistant.js
// Плавающая кнопка AI-ассистента (FAB) + панель чата. Чат — Groq через /api/ai-chat.
// Зависимости: supabase.js (window.sb), i18n.js (window.t / getLang), auth.js (window.esc).
// Подключается на dashboard.html и tool.html.
// =====================================================================
(function () {
  'use strict';

  const ENDPOINT = '/api/ai-chat';
  const CHAT_LS = 'omx-ai-chat';
  const RATE_LS = 'omx-ai-rate';
  const DAILY_LIMIT = 60;
  const MAX_HISTORY = 30;
  const SEND_TAIL = 16;

  const esc = window.esc || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  // ---------- i18n с фолбэком на русский ----------
  const FB = {
    'ai.panel_title': 'AI-ассистент', 'ai.fab_label': 'AI-ассистент', 'common.close': 'Закрыть',
    'ai.chat_clear': 'Очистить', 'ai.chat_placeholder': 'Напиши сообщение… (Ctrl+Enter)', 'ai.chat_send': 'Отправить',
    'ai.chat_hello': 'Привет! Я ассистент в OmnixOS. Чем помочь — спланировать день, разбить цель на шаги, подсказать по привычкам?',
    'ai.chat_thinking': 'Думаю…',
    'ai.chat_rate': 'Использовано сегодня: {used} / {limit}', 'ai.chat_limit_day': 'Дневной лимит сообщений исчерпан. Попробуй завтра.',
    'ai.err_not_configured': 'AI пока не подключён (нужен GROQ_API_KEY в настройках Vercel).',
    'ai.err_rate_limited': 'AI перегружен (лимит бесплатного тарифа Groq). Попробуй через минуту.',
    'ai.err_bad_key': 'Ключ Groq неверный — проверь GROQ_API_KEY в Vercel.',
    'ai.err_unauthorized': 'Сессия истекла — перезайди в аккаунт.',
    'ai.err_network': 'Не удалось связаться с AI. Проверь интернет и попробуй ещё раз.',
    'ai.err_empty': 'AI вернул пустой ответ — попробуй переформулировать.',
    'ai.err_generic': 'Что-то пошло не так с AI. Попробуй ещё раз.',
    'ai.qp_plan_day': 'Спланируй мой день', 'ai.qp_priorities': 'Что сейчас в приоритете?',
    'ai.qp_break_goal': 'Разбей цель на шаги', 'ai.qp_motivate': 'Подбодри меня',
  };
  function tr(key, vars) {
    if (typeof window.t === 'function') { const v = window.t(key, vars); if (v && v !== key) return v; }
    let s = FB[key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  const QP_KEYS = ['ai.qp_plan_day', 'ai.qp_priorities', 'ai.qp_break_goal', 'ai.qp_motivate'];

  // ---------- localStorage ----------
  const loadHistory = () => { try { const a = JSON.parse(localStorage.getItem(CHAT_LS) || '[]'); return Array.isArray(a) ? a.slice(-MAX_HISTORY) : []; } catch { return []; } };
  const saveHistory = (h) => { try { localStorage.setItem(CHAT_LS, JSON.stringify(h.slice(-MAX_HISTORY))); } catch {} };
  function rateState() {
    let s; try { s = JSON.parse(localStorage.getItem(RATE_LS) || '{}'); } catch { s = {}; }
    const d = new Date().toISOString().slice(0, 10);
    if (!s || s.day !== d) s = { day: d, count: 0 };
    return s;
  }
  function rateBump() { const s = rateState(); s.count = (s.count || 0) + 1; try { localStorage.setItem(RATE_LS, JSON.stringify(s)); } catch {} return s.count; }

  // ---------- лёгкий контекст пользователя (кэш на минуту) ----------
  let _ctx = null, _ctxAt = 0;
  async function getContext() {
    if (_ctx && Date.now() - _ctxAt < 60000) return _ctx;
    if (typeof window.sb === 'undefined') return null;
    let user; try { user = (await window.sb.auth.getUser()).data.user; } catch {}
    if (!user) return null;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [tasksRes, goalsRes, habitsRes] = await Promise.all([
        window.sb.from('tasks').select('title, quadrant').eq('user_id', user.id).eq('status', 'open').order('quadrant').limit(8),
        window.sb.from('goals').select('title, progress').eq('user_id', user.id).eq('status', 'active').lt('progress', 100).limit(8),
        window.sb.from('habits').select('id, name').eq('user_id', user.id).eq('archived', false),
      ]);
      const habits = habitsRes.data || [];
      let done = 0;
      if (habits.length) {
        const { data: logs } = await window.sb.from('habit_logs').select('habit_id').in('habit_id', habits.map((h) => h.id)).eq('date', today);
        done = (logs || []).length;
      }
      _ctx = {
        tasks: (tasksRes.data || []).map((t) => t.title),
        goals: (goalsRes.data || []).map((g) => `${g.title} (${g.progress || 0}%)`),
        habitsTotal: habits.length, habitsDone: done,
      };
      _ctxAt = Date.now();
      return _ctx;
    } catch { return null; }
  }
  function systemPrompt(ctx) {
    const lang = (typeof window.getLang === 'function') ? window.getLang() : 'ru';
    const langName = { ru: 'русском', ro: 'румынском', en: 'английском' }[lang] || 'русском';
    const bits = [];
    if (ctx) {
      if (ctx.tasks && ctx.tasks.length) bits.push('Открытые задачи: ' + ctx.tasks.join('; '));
      if (ctx.goals && ctx.goals.length) bits.push('Активные цели: ' + ctx.goals.join('; '));
      if (ctx.habitsTotal) bits.push('Привычки сегодня: ' + ctx.habitsDone + '/' + ctx.habitsTotal);
    }
    const c = bits.length ? ('\n\nКонтекст пользователя (используй, если уместно):\n' + bits.join('\n')) : '';
    return 'Ты — AI-ассистент внутри OmnixOS, личной системы управления жизнью (цели, задачи, привычки, финансы, здоровье, дневник, колесо баланса). '
      + 'Помогай конкретно и по делу: план дня, приоритеты, разбивка целей на шаги, короткие практичные советы, мотивация. '
      + 'Отвечай на ' + langName + ' языке, без воды и длинных вступлений.' + c;
  }
  const ERR_KEY = {
    not_configured: 'ai.err_not_configured', rate_limited: 'ai.err_rate_limited', bad_key: 'ai.err_bad_key',
    unauthorized: 'ai.err_unauthorized', network: 'ai.err_network', upstream_unreachable: 'ai.err_network', upstream_error: 'ai.err_generic',
  };
  async function complete(uiMessages) {
    let token = null;
    try { const { data } = await window.sb.auth.getSession(); token = data && data.session && data.session.access_token; } catch {}
    if (!token) return { error: 'unauthorized' };
    const ctx = await getContext();
    const messages = [{ role: 'system', content: systemPrompt(ctx) }]
      .concat(uiMessages.slice(-SEND_TAIL).map((m) => ({ role: m.role, content: m.content })));
    let r, data;
    try {
      r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ messages }) });
      data = await r.json().catch(() => ({}));
    } catch { return { error: 'network' }; }
    if (r.status === 404) return { error: 'not_configured' };
    if (!r.ok) return { error: (data && data.error) || 'generic' };
    return { reply: String((data && data.reply) || '').trim() };
  }

  // ---------- рендер чата в произвольный контейнер ----------
  function renderChat(container) {
    if (!container) return null;
    container.innerHTML =
      '<div class="ai-chat">'
      + '<div class="ai-chat-log"></div>'
      + '<div class="ai-qp">' + QP_KEYS.map((k) => '<button class="ai-qp-chip" type="button" data-k="' + esc(k) + '">' + esc(tr(k)) + '</button>').join('') + '</div>'
      + '<div class="ai-chat-input-row">'
      + '<textarea class="ai-chat-input input" rows="1" placeholder="' + esc(tr('ai.chat_placeholder')) + '"></textarea>'
      + '<button class="btn btn-primary ai-chat-send" type="button">' + esc(tr('ai.chat_send')) + '</button>'
      + '</div>'
      + '<div class="ai-chat-foot"><span class="ai-chat-rate"></span><button class="ai-chat-clear" type="button">' + esc(tr('ai.chat_clear')) + '</button></div>'
      + '</div>';
    const logEl = container.querySelector('.ai-chat-log');
    const qpEl = container.querySelector('.ai-qp');
    const inputEl = container.querySelector('.ai-chat-input');
    const sendEl = container.querySelector('.ai-chat-send');
    const clearEl = container.querySelector('.ai-chat-clear');
    const rateEl = container.querySelector('.ai-chat-rate');

    let history = loadHistory();
    let busy = false;

    function bubble(role, content, muted) {
      const me = role === 'user';
      const el = document.createElement('div');
      el.className = 'ai-bubble ' + (me ? 'ai-bubble-me' : 'ai-bubble-ai') + (muted ? ' ai-bubble-muted' : '');
      el.textContent = content;
      logEl.appendChild(el);
      logEl.scrollTop = logEl.scrollHeight;
      return el;
    }
    function renderLog() { logEl.innerHTML = ''; if (!history.length) bubble('assistant', tr('ai.chat_hello')); else history.forEach((m) => bubble(m.role, m.content)); }
    function renderRate() { const s = rateState(); rateEl.textContent = tr('ai.chat_rate', { used: s.count || 0, limit: DAILY_LIMIT }); }
    function autoGrow() { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; }
    renderLog(); renderRate();

    async function send(text) {
      text = (text || '').trim();
      if (!text || busy) return;
      if ((rateState().count || 0) >= DAILY_LIMIT) { bubble('assistant', tr('ai.chat_limit_day'), true); return; }
      busy = true; sendEl.disabled = true; inputEl.disabled = true;
      history.push({ role: 'user', content: text }); saveHistory(history); bubble('user', text);
      const think = bubble('assistant', tr('ai.chat_thinking'), true);
      const res = await complete(history);
      rateBump(); renderRate();
      think.remove();
      if (res.error) bubble('assistant', tr(ERR_KEY[res.error] || 'ai.err_generic'), true);
      else if (!res.reply) bubble('assistant', tr('ai.err_empty'), true);
      else { history.push({ role: 'assistant', content: res.reply }); saveHistory(history); bubble('assistant', res.reply); }
      busy = false; sendEl.disabled = false; inputEl.disabled = false; try { inputEl.focus(); } catch {}
    }
    function sendFromInput() { const v = inputEl.value; inputEl.value = ''; autoGrow(); send(v); }

    sendEl.addEventListener('click', sendFromInput);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendFromInput(); } });
    inputEl.addEventListener('input', autoGrow);
    qpEl.addEventListener('click', (e) => { const b = e.target.closest('.ai-qp-chip'); if (b && !busy) send(tr(b.dataset.k)); });
    clearEl.addEventListener('click', () => { history = []; saveHistory(history); renderLog(); });

    return { reload() { history = loadHistory(); renderLog(); renderRate(); } };
  }

  // ---------- FAB + панель ----------
  let fabEl = null, panelEl = null, panelChat = null, panelOpen = false;

  function buildFab() {
    if (fabEl || !document.body) return;
    fabEl = document.createElement('button');
    fabEl.id = 'omx-ai-fab';
    fabEl.type = 'button';
    fabEl.title = tr('ai.fab_label');
    fabEl.setAttribute('aria-label', tr('ai.fab_label'));
    fabEl.innerHTML = '<span class="omx-ai-fab-icon" aria-hidden="true">✦</span>';
    fabEl.addEventListener('click', () => toggle());
    document.body.appendChild(fabEl);
  }
  function buildPanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'omx-ai-panel';
    panelEl.hidden = true;
    panelEl.innerHTML =
      '<div class="omx-ai-panel-head"><span class="omx-ai-panel-title">✦ ' + esc(tr('ai.panel_title')) + '</span>'
      + '<button class="omx-ai-panel-close" type="button" aria-label="' + esc(tr('common.close')) + '">✕</button></div>'
      + '<div class="omx-ai-panel-body"></div>';
    document.body.appendChild(panelEl);
    panelEl.querySelector('.omx-ai-panel-close').addEventListener('click', () => close());
    panelChat = renderChat(panelEl.querySelector('.omx-ai-panel-body'));
  }
  function open() {
    buildPanel();
    panelEl.hidden = false;
    document.body.classList.add('omx-ai-open');
    panelOpen = true;
    if (panelChat) panelChat.reload();
    requestAnimationFrame(() => panelEl.classList.add('open'));
    setTimeout(() => { const i = panelEl.querySelector('.ai-chat-input'); if (i) try { i.focus(); } catch {} }, 280);
  }
  function close() {
    if (!panelEl) return;
    panelOpen = false;
    panelEl.classList.remove('open');
    document.body.classList.remove('omx-ai-open');
    setTimeout(() => { if (!panelOpen) panelEl.hidden = true; }, 280);
  }
  function toggle() { panelOpen ? close() : open(); }

  window.omxAI = {
    open, close, toggle,
    isOpen: () => panelOpen,
    renderChat,
    hideFab() { if (fabEl) fabEl.style.display = 'none'; if (panelOpen) close(); },
    showFab() { if (fabEl) fabEl.style.display = ''; },
  };

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen) close(); });
  document.addEventListener('langchange', () => {
    if (fabEl) { fabEl.title = tr('ai.fab_label'); fabEl.setAttribute('aria-label', tr('ai.fab_label')); }
    if (panelEl) {
      const tEl = panelEl.querySelector('.omx-ai-panel-title'); if (tEl) tEl.textContent = '✦ ' + tr('ai.panel_title');
      const cEl = panelEl.querySelector('.omx-ai-panel-close'); if (cEl) cEl.setAttribute('aria-label', tr('common.close'));
      panelChat = renderChat(panelEl.querySelector('.omx-ai-panel-body'));
    }
  });

  function init() { buildFab(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
