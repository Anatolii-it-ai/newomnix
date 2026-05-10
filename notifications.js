// =====================================================================
// OmnixOS · notifications.js
// Браузерные напоминания о невыполненных привычках + тихие часы.
// Требует загруженными ранее: supabase.js (window.sb), auth.js, i18n.js (window.t).
//
// Это «локальные» напоминания: пока открыта любая вкладка приложения, раз в
// 30 сек проверяем время и показываем уведомление на «утро/день/вечер», если
// в этом блоке есть неотмеченные привычки. Полноценный server push не нужен.
// =====================================================================
(function () {
  'use strict';

  const KEYS = {
    enabled:   'omx-notif-enabled',
    morning:   'omx-notif-time-morning',
    day:       'omx-notif-time-day',
    evening:   'omx-notif-time-evening',
    quietFrom: 'omx-quiet-from',
    quietTo:   'omx-quiet-to',
    fired:     'omx-notif-fired',
  };
  const DEFAULTS = { morning: '09:00', day: '14:00', evening: '20:00', quietFrom: '22:00', quietTo: '07:00' };
  const BUCKETS = ['morning', 'day', 'evening'];

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return (v === null || v === '') ? d : v; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  const hasNotif = () => (typeof window !== 'undefined') && ('Notification' in window);
  const hasSW = () => ('serviceWorker' in navigator);
  const perm = () => (hasNotif() ? Notification.permission : 'denied');

  // i18n с фолбэком на русский (если i18n.js по какой-то причине не подгрузился)
  const FALLBACK = {
    'notif.bucket_morning': 'Утро', 'notif.bucket_day': 'День', 'notif.bucket_evening': 'Вечер',
    'notif.habit_title': 'Привычки · {bucket}',
    'notif.habit_body_one': 'Не отмечено: {names}',
    'notif.habit_body_many': 'Не отмечено привычек: {count} — {names}',
    'notif.test_title': 'OmnixOS', 'notif.test_body': 'Уведомления работают ✓',
    'notif.status_unsupported': 'Браузер не поддерживает уведомления',
    'notif.status_blocked': 'Уведомления заблокированы — разреши их для этого сайта в настройках браузера',
    'notif.status_need_permission': 'Нужно разрешить уведомления в браузере',
    'notif.status_off': 'Напоминания выключены',
    'notif.status_on': 'Напоминания включены',
    'notif.reminder_prefix': '⏰ Напоминание:',
  };
  function tr(key, vars) {
    let s;
    if (typeof window.t === 'function') { const v = window.t(key, vars); if (v && v !== key) return v; }
    s = FALLBACK[key] || key;
    if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }

  const normTime = (v, d) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : d);

  function getSettings() {
    return {
      enabled: lsGet(KEYS.enabled, '0') === '1',
      times: {
        morning: normTime(lsGet(KEYS.morning, DEFAULTS.morning), DEFAULTS.morning),
        day:     normTime(lsGet(KEYS.day,     DEFAULTS.day),     DEFAULTS.day),
        evening: normTime(lsGet(KEYS.evening, DEFAULTS.evening), DEFAULTS.evening),
      },
      quiet: {
        from: normTime(lsGet(KEYS.quietFrom, DEFAULTS.quietFrom), DEFAULTS.quietFrom),
        to:   normTime(lsGet(KEYS.quietTo,   DEFAULTS.quietTo),   DEFAULTS.quietTo),
      },
    };
  }
  function setSetting(name, value) {
    if (name === 'enabled') { lsSet(KEYS.enabled, value ? '1' : '0'); return; }
    const map = { morning: KEYS.morning, day: KEYS.day, evening: KEYS.evening, quietFrom: KEYS.quietFrom, quietTo: KEYS.quietTo };
    const defMap = { morning: DEFAULTS.morning, day: DEFAULTS.day, evening: DEFAULTS.evening, quietFrom: DEFAULTS.quietFrom, quietTo: DEFAULTS.quietTo };
    if (!map[name]) return;
    lsSet(map[name], normTime(value, defMap[name]));
  }

  // ---------- время ----------
  const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? ((+m[1]) * 60 + (+m[2])) : -1; };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  function inQuietHours() {
    const q = getSettings().quiet;
    const f = toMin(q.from), t = toMin(q.to), n = nowMin();
    if (f < 0 || t < 0 || f === t) return false;
    return f < t ? (n >= f && n < t) : (n >= f || n < t); // интервал может переходить через полночь
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- service worker ----------
  let swRegPromise = null;
  function ensureSW() {
    if (!hasSW()) return Promise.resolve(null);
    if (!swRegPromise) swRegPromise = navigator.serviceWorker.register('sw.js').catch(() => null);
    return swRegPromise;
  }

  // ---------- показ браузерного уведомления ----------
  async function notify(title, body, data) {
    const d = data || {};
    const opts = { body: body || '', icon: 'logo.svg', badge: 'logo.svg', tag: d.tag || 'omx-notif', renotify: true, data: d };
    try {
      const reg = await ensureSW();
      if (reg && typeof reg.showNotification === 'function') { await reg.showNotification(title, opts); return true; }
    } catch {}
    try { new Notification(title, opts); return true; } catch {}
    return false;
  }

  // ---------- in-app уведомление (строка в таблице notifications) ----------
  async function insertInApp(userId, title, body) {
    try { await window.sb.from('notifications').insert({ user_id: userId, title: title, body: body || null }); } catch {}
  }
  function notifyRefresh() { try { document.dispatchEvent(new CustomEvent('omx-notif-refresh')); } catch {} }

  // следующая дата повторяющегося напоминания (двигаем, пока не окажется в будущем)
  function nextOccurrence(date, repeat) {
    const d = new Date(date);
    const now = Date.now();
    let guard = 0;
    do {
      if (repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
      else break;
      guard++;
    } while (d.getTime() <= now && guard < 3650);
    return d;
  }

  // ---------- дедуп привычек: один раз в день на каждый блок ----------
  function firedState() {
    let m; try { m = JSON.parse(lsGet(KEYS.fired, '{}')) || {}; } catch { m = {}; }
    const today = todayIso();
    if (m.__day !== today) m = { __day: today };
    return m;
  }
  function saveFired(m) { lsSet(KEYS.fired, JSON.stringify(m)); }

  // ---------- напоминания о привычках (по блокам утро/день/вечер) ----------
  async function checkHabitBuckets(user) {
    if (!hasNotif() || perm() !== 'granted' || !getSettings().enabled) return;
    if (inQuietHours()) return;

    const s = getSettings();
    const n = nowMin();
    const due = BUCKETS.filter(b => toMin(s.times[b]) === n);
    if (!due.length) return;

    const fired = firedState();
    const pending = due.filter(b => !fired[b]);
    if (!pending.length) return;
    pending.forEach(b => { fired[b] = true; });
    saveFired(fired); // помечаем сразу — повторный тик в ту же минуту не задвоит

    const { data: habits } = await window.sb.from('habits')
      .select('id, name, time_of_day').eq('user_id', user.id).eq('archived', false);
    if (!habits || !habits.length) return;
    const ids = habits.map(h => h.id);
    const { data: logs } = await window.sb.from('habit_logs')
      .select('habit_id').in('habit_id', ids).eq('date', todayIso());
    const done = new Set((logs || []).map(l => l.habit_id));

    let any = false;
    for (const b of pending) {
      const list = habits.filter(h => h.time_of_day === b && !done.has(h.id));
      if (!list.length) continue;
      const names = list.slice(0, 3).map(h => h.name).join(', ') + (list.length > 3 ? '…' : '');
      const title = tr('notif.habit_title', { bucket: tr('notif.bucket_' + b) });
      const body = (list.length === 1)
        ? tr('notif.habit_body_one', { names })
        : tr('notif.habit_body_many', { count: list.length, names });
      await notify(title, body, { url: 'tool.html?slug=habits', tag: 'omx-habit-' + b });
      await insertInApp(user.id, title, body);
      any = true;
    }
    if (any) notifyRefresh();
  }

  // ---------- напоминания по дате/времени ----------
  async function checkReminders(user) {
    const nowIso = new Date().toISOString();
    const res = await window.sb.from('reminders').select('*')
      .eq('user_id', user.id)
      .lte('remind_at', nowIso)
      .or('repeat.neq.none,fired_at.is.null')   // одноразовые уже отработавшие не тянем
      .limit(50);
    if (res.error) return; // таблица ещё не создана / нет доступа — тихо
    const due = res.data || [];
    if (!due.length) return;

    let any = false;
    for (const r of due) {
      const remindTs = new Date(r.remind_at).getTime();
      const firedTs = r.fired_at ? new Date(r.fired_at).getTime() : 0;
      // уже отработало? для одноразовых — если есть fired_at; для повторяющихся — если fired_at не раньше текущего срока
      if (r.repeat === 'none' ? firedTs > 0 : firedTs >= remindTs) continue;

      const title = tr('notif.reminder_prefix') + ' ' + (r.title || '');
      await insertInApp(user.id, title, '');                              // in-app — всегда
      if (hasNotif() && perm() === 'granted' && !inQuietHours()) {        // браузер — если можно и не тихие часы
        await notify(title, '', { url: 'dashboard.html', tag: 'omx-reminder-' + r.id });
      }
      if (r.repeat === 'none') {
        await window.sb.from('reminders').update({ fired_at: nowIso }).eq('id', r.id).eq('user_id', user.id);
      } else {
        const next = nextOccurrence(new Date(r.remind_at), r.repeat);
        await window.sb.from('reminders').update({ remind_at: next.toISOString(), fired_at: nowIso }).eq('id', r.id).eq('user_id', user.id);
      }
      any = true;
    }
    if (any) notifyRefresh();
  }

  // ---------- основной тик ----------
  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      if (typeof window.sb === 'undefined') return;
      let user = null;
      try { user = (await window.sb.auth.getUser()).data.user; } catch {}
      if (!user) return;
      try { await checkReminders(user); } catch {}
      try { await checkHabitBuckets(user); } catch {}
    } catch (e) {
      // фоновый процесс — молча
    } finally {
      ticking = false;
    }
  }

  // ---------- публичный API ----------
  window.omxNotif = {
    isSupported: () => hasNotif(),
    permission: perm,
    isEnabled: () => getSettings().enabled && hasNotif() && perm() === 'granted',
    getSettings,
    setSetting,
    async requestPermission() {
      if (!hasNotif()) return 'denied';
      let p = perm();
      if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
      if (p === 'granted') { setSetting('enabled', true); ensureSW(); setTimeout(tick, 200); }
      return p;
    },
    async test() {
      if (!hasNotif() || perm() !== 'granted') return false;
      return notify(tr('notif.test_title'), tr('notif.test_body'), { url: 'dashboard.html', tag: 'omx-test' });
    },
    // ---------- напоминания по дате/времени (CRUD) ----------
    reminders: {
      async _uid() { try { return (await window.sb.auth.getUser()).data.user || null; } catch { return null; } },
      async list() {
        if (typeof window.sb === 'undefined') return [];
        const user = await this._uid(); if (!user) return [];
        const { data, error } = await window.sb.from('reminders').select('*').eq('user_id', user.id).order('remind_at');
        if (error) throw error;
        return data || [];
      },
      async save({ id, title, remind_at, repeat }) {
        if (typeof window.sb === 'undefined') return { ok: false, error: 'no-db' };
        const user = await this._uid(); if (!user) return { ok: false, error: 'no-auth' };
        const ttl = String(title || '').trim();
        const rep = ['none', 'daily', 'weekly', 'monthly'].includes(repeat) ? repeat : 'none';
        if (!ttl || !remind_at) return { ok: false, error: 'empty' };
        let res;
        if (id) {
          res = await window.sb.from('reminders').update({ title: ttl, remind_at, repeat: rep, fired_at: null }).eq('id', id).eq('user_id', user.id);
        } else {
          res = await window.sb.from('reminders').insert({ user_id: user.id, title: ttl, remind_at, repeat: rep, fired_at: null });
        }
        if (!res.error) setTimeout(tick, 300);
        return { ok: !res.error, error: res.error && res.error.message };
      },
      async remove(id) {
        if (typeof window.sb === 'undefined') return false;
        const user = await this._uid(); if (!user) return false;
        const { error } = await window.sb.from('reminders').delete().eq('id', id).eq('user_id', user.id);
        return !error;
      },
    },
    // Привязать UI настроек по фиксированным id (см. блок в dashboard.html)
    bindSettingsUI() {
      const $ = (id) => document.getElementById(id);
      const cb = $('notif-enabled');
      if (!cb) return; // блока нет на этой странице
      const statusEl = $('notif-status'), permBtn = $('notif-permission-btn'), testBtn = $('notif-test-btn');
      const tm = $('notif-time-morning'), td = $('notif-time-day'), te = $('notif-time-evening');
      const qf = $('notif-quiet-from'), qt = $('notif-quiet-to');

      const s = getSettings();
      if (tm) tm.value = s.times.morning;
      if (td) td.value = s.times.day;
      if (te) te.value = s.times.evening;
      if (qf) qf.value = s.quiet.from;
      if (qt) qt.value = s.quiet.to;
      cb.checked = s.enabled && perm() === 'granted';

      function refresh() {
        const p = perm();
        if (statusEl) {
          let msg;
          if (!hasNotif()) msg = tr('notif.status_unsupported');
          else if (p === 'denied') msg = tr('notif.status_blocked');
          else if (p !== 'granted') msg = tr('notif.status_need_permission');
          else if (!getSettings().enabled) msg = tr('notif.status_off');
          else msg = tr('notif.status_on');
          statusEl.textContent = msg;
        }
        if (permBtn) permBtn.style.display = (hasNotif() && p === 'default') ? '' : 'none';
        if (testBtn) testBtn.style.display = (hasNotif() && p === 'granted') ? '' : 'none';
        cb.disabled = !hasNotif() || p === 'denied';
      }
      refresh();

      cb.onchange = async () => {
        if (cb.checked && perm() !== 'granted') {
          const p = await window.omxNotif.requestPermission();
          if (p !== 'granted') { cb.checked = false; }
        }
        setSetting('enabled', cb.checked);
        refresh();
      };
      if (permBtn) permBtn.onclick = async () => {
        await window.omxNotif.requestPermission();
        cb.checked = perm() === 'granted';
        setSetting('enabled', cb.checked);
        refresh();
      };
      if (testBtn) testBtn.onclick = () => { window.omxNotif.test(); };
      const bindTime = (el, name) => { if (el) el.onchange = () => setSetting(name, el.value); };
      bindTime(tm, 'morning'); bindTime(td, 'day'); bindTime(te, 'evening');
      bindTime(qf, 'quietFrom'); bindTime(qt, 'quietTo');
    },
  };

  // ---------- запуск фонового тикера ----------
  function start() {
    if (window.__omxNotifStarted) return;
    window.__omxNotifStarted = true;
    if (window.omxNotif.isEnabled()) ensureSW();
    setTimeout(tick, 3500);            // первый прогон — после загрузки sb/auth
    setInterval(tick, 30 * 1000);     // далее каждые 30 сек
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
