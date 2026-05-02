// =================== OmnixOS · Tools (10 modules) ===================
// Each tool: { title, render(container) }. Uses helpers from auth.js.

const SPHERES = ['Здоровье', 'Работа', 'Деньги', 'Отношения', 'Развитие', 'Отдых', 'Творчество', 'Дух'];
const SPHERE_COLORS = {
  'Здоровье': '#EF4444', 'Работа': '#22D3EE', 'Деньги': '#10B981', 'Отношения': '#EC4899',
  'Развитие': '#7C5CFF', 'Отдых': '#F59E0B', 'Творчество': '#06B6D4', 'Дух': '#8B5CF6',
};
const QUADRANTS = {
  1: { label: 'Срочно · Важно', color: '#EF4444' },
  2: { label: 'Не срочно · Важно', color: '#10B981' },
  3: { label: 'Срочно · Не важно', color: '#F59E0B' },
  4: { label: 'Не срочно · Не важно', color: '#6E6E80' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const ruDate = (s) => s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—';
const money = (cents) => (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';

function modalOpen(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  root.querySelector('.modal-bg').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-bg')) modalClose();
  });
}
function modalClose() { document.getElementById('modal-root').innerHTML = ''; }

window.OmnixTools = {

  // ========== 1. DASHBOARD ==========
  dashboard: {
    title: 'Дашборд — пульс жизни',
    async render(c) {
      const [w, t, g] = await Promise.all([
        api('GET', '/api/tools/wheel'),
        api('GET', '/api/tools/today'),
        api('GET', '/api/tools/gamification'),
      ]);
      const wheel = w.items, avg = w.avg;
      const day = t;

      c.innerHTML = `
        <div class="grid cols-3" style="margin-bottom:24px">
          <div class="card stat">
            <div class="label">Средний балл жизни</div>
            <div class="value" style="background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent">${avg}</div>
            <div class="delta">из 10</div>
          </div>
          <div class="card stat">
            <div class="label">Уровень</div>
            <div class="value">${g.level}</div>
            <div class="delta">${g.xp} XP · до следующего ${g.xpToNext}</div>
          </div>
          <div class="card stat">
            <div class="label">Лучшая серия</div>
            <div class="value">${g.bestStreak}<small style="font-size:14px; color:var(--text-mute); margin-left:6px">дн</small></div>
            <div class="delta">${g.bestHabit ? esc(g.bestHabit) : '—'}</div>
          </div>
        </div>

        <div class="grid cols-2">
          <div class="card">
            <h2>Колесо баланса</h2>
            <div id="wheel-mini" class="wheel-mini-grid">
              <div id="wheel-svg-wrap" style="overflow:visible"></div>
              <div id="wheel-controls"></div>
            </div>
          </div>
          <div class="card">
            <h2>Сегодня</h2>
            <h3 style="margin-top:16px">Привычки (${day.habits.filter(h => h.done).length}/${day.habits.length})</h3>
            <div class="habit-row">
              ${day.habits.map(h => `
                <button class="habit-chip ${h.done ? 'done' : ''}" data-h="${h.id}" title="${esc(h.name)}">
                  <span>${h.icon || '✓'}</span>
                  <em>${esc(h.name)}</em>
                </button>
              `).join('') || '<p class="muted">Нет привычек. Заведи в модуле «Привычки».</p>'}
            </div>
            <h3 style="margin-top:18px">Топ задач</h3>
            <ul class="mini-tasks">
              ${day.tasks.slice(0, 5).map(tk => `
                <li class="${tk.status === 'done' ? 'done' : ''}">
                  <i style="background:${QUADRANTS[tk.quadrant]?.color || '#6E6E80'}"></i>
                  ${esc(tk.title)}
                </li>
              `).join('') || '<li class="muted">Задач нет. Создай в «Задачах».</li>'}
            </ul>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <h2>Активные цели</h2>
          ${day.goals.length ? `
            <div class="grid cols-3">
              ${day.goals.map(gl => `
                <div class="goal-mini">
                  <strong>${esc(gl.title)}</strong>
                  <div class="bar"><i style="width:${gl.progress}%"></i></div>
                  <span class="muted">${gl.progress}%</span>
                </div>
              `).join('')}
            </div>
          ` : '<p class="muted">Целей пока нет. Создай в модуле «Цели».</p>'}
        </div>
      `;

      renderWheelSVG(wheel);

      c.querySelectorAll('.habit-chip').forEach(b => b.addEventListener('click', async () => {
        await api('POST', `/api/tools/habits/${b.dataset.h}/toggle`);
        b.classList.toggle('done');
      }));
    },
  },

  // ========== 2. GOALS ==========
  goals: {
    title: 'Цели — карта жизни',
    async render(c) {
      c.innerHTML = `
        <div class="toolbar" style="justify-content: space-between">
          <span class="muted" id="goals-count"></span>
          <button class="btn btn-primary" id="goal-add">+ Новая цель</button>
        </div>
        <div id="goals-list" class="grid cols-2"></div>
      `;
      load();
      document.getElementById('goal-add').onclick = () => formGoal();

      async function load() {
        const r = await api('GET', '/api/tools/goals');
        document.getElementById('goals-count').textContent = `Всего целей: ${r.items.length}`;
        const list = document.getElementById('goals-list');
        if (!r.items.length) {
          list.innerHTML = '<div class="tool-empty" style="grid-column:1/-1">Нет целей. Создай первую — большие цели лучше разбивать на проекты и шаги.</div>';
          return;
        }
        list.innerHTML = r.items.map(g => {
          const accent = SPHERE_COLORS[g.sphere] || '#7C5CFF';
          const due = g.target_date ? `до ${ruDate(g.target_date)}` : '';
          return `
            <div class="card goal-card" style="--accent:${accent}">
              <div class="goal-head">
                <span class="tag" style="background:${accent}30; color:${accent}">${esc(g.sphere || 'без сферы')}</span>
                <span class="muted" style="font-size:12px">${due}</span>
              </div>
              <h3 style="margin:10px 0 4px">${esc(g.title)}</h3>
              ${g.description ? `<p class="muted" style="font-size:13px; margin:0 0 12px">${esc(g.description)}</p>` : ''}
              <div class="bar"><i style="width:${g.progress}%; background:${accent}"></i></div>
              <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:12px">
                <span class="muted">${g.tasks_done}/${g.tasks_total} задач</span>
                <strong>${g.progress}%</strong>
              </div>
              <div style="display:flex; gap:6px; margin-top:14px">
                <button class="btn btn-sm" data-edit="${g.id}">Изменить</button>
                <button class="btn btn-sm btn-danger" data-del="${g.id}">×</button>
              </div>
            </div>
          `;
        }).join('');
        list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formGoal(r.items.find(x => x.id == b.dataset.edit)));
        list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить цель?')) return;
          await api('DELETE', `/api/tools/goals/${b.dataset.del}`); load();
        });
      }

      function formGoal(g) {
        modalOpen(`
          <h2>${g ? 'Изменить цель' : 'Новая цель'}</h2>
          <div class="field"><label>Название</label><input class="input" id="gf-title" value="${g ? esc(g.title) : ''}" /></div>
          <div class="field"><label>Сфера</label><select class="input" id="gf-sphere">
            <option value="">— без сферы —</option>
            ${SPHERES.map(s => `<option ${g?.sphere === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
          <div class="field"><label>Описание</label><textarea class="input" id="gf-desc" rows="3">${g ? esc(g.description || '') : ''}</textarea></div>
          <div class="field"><label>Дедлайн</label><input class="input" id="gf-date" type="date" value="${g?.target_date || ''}" /></div>
          <div class="field"><label>Прогресс: <span id="gf-pv">${g?.progress || 0}</span>%</label>
            <input id="gf-progress" type="range" min="0" max="100" value="${g?.progress || 0}" oninput="document.getElementById('gf-pv').textContent=this.value" /></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="(${modalClose.toString()})()">Отмена</button>
            <button class="btn btn-primary" id="gf-save">Сохранить</button>
          </div>
        `);
        document.getElementById('gf-save').onclick = async () => {
          const body = {
            title: document.getElementById('gf-title').value,
            sphere: document.getElementById('gf-sphere').value || null,
            description: document.getElementById('gf-desc').value,
            target_date: document.getElementById('gf-date').value || null,
            progress: +document.getElementById('gf-progress').value,
          };
          if (!body.title.trim()) return toast('Укажи название', 'error');
          const r = g
            ? await api('PATCH', `/api/tools/goals/${g.id}`, body)
            : await api('POST', '/api/tools/goals', body);
          if (r.ok) { modalClose(); load(); toast('Сохранено', 'success'); }
          else toast('Ошибка', 'error');
        };
      }
    },
  },

  // ========== 3. TASKS ==========
  tasks: {
    title: 'Задачи — умный планировщик',
    async render(c) {
      c.innerHTML = `
        <div class="toolbar">
          <button class="tab-btn active" data-view="matrix">Матрица</button>
          <button class="tab-btn" data-view="list">Список</button>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="task-add">+ Задача</button>
        </div>
        <div id="tasks-view"></div>
      `;
      let view = 'matrix';
      let goals = [];

      const reload = async () => {
        const [r, gr] = await Promise.all([
          api('GET', '/api/tools/tasks'),
          api('GET', '/api/tools/goals'),
        ]);
        goals = gr.items || [];
        const items = r.items || [];
        const root = document.getElementById('tasks-view');

        if (view === 'matrix') {
          root.innerHTML = `<div class="matrix-grid">
            ${[1, 2, 3, 4].map(q => {
              const list = items.filter(t => t.quadrant === q);
              return `
                <div class="matrix-cell" style="--q:${QUADRANTS[q].color}">
                  <h3>${QUADRANTS[q].label}</h3>
                  <div class="task-list-mini">
                    ${list.map(taskRow).join('') || '<p class="muted" style="font-size:12px">пусто</p>'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>`;
        } else {
          root.innerHTML = `<div class="card"><table class="table">
            <thead><tr><th></th><th>Задача</th><th>Сфера</th><th>Цель</th><th>Срок</th><th>Оценка</th><th></th></tr></thead>
            <tbody>${items.map(t => `
              <tr class="${t.status === 'done' ? 'task-done' : ''}">
                <td><input type="checkbox" ${t.status === 'done' ? 'checked' : ''} data-toggle="${t.id}"/></td>
                <td>${esc(t.title)}</td>
                <td>${t.sphere ? `<span class="tag" style="background:${SPHERE_COLORS[t.sphere]}30; color:${SPHERE_COLORS[t.sphere]}">${esc(t.sphere)}</span>` : '—'}</td>
                <td class="muted">${esc(t.goal_title || '—')}</td>
                <td class="muted">${ruDate(t.due_date)}</td>
                <td class="muted">${t.estimate_min ? t.estimate_min + 'м' : '—'}</td>
                <td class="row-actions">
                  <button class="btn btn-sm" data-edit="${t.id}">⋯</button>
                  <button class="btn btn-sm btn-danger" data-del="${t.id}">×</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7" class="muted">Задач пока нет.</td></tr>'}</tbody>
          </table></div>`;
        }

        root.querySelectorAll('[data-toggle]').forEach(el => el.onclick = async () => {
          const id = el.dataset.toggle;
          const item = items.find(x => x.id == id);
          await api('PATCH', `/api/tools/tasks/${id}`, { status: item.status === 'done' ? 'open' : 'done' });
          reload();
        });
        root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => taskForm(items.find(x => x.id == b.dataset.edit)));
        root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить?')) return;
          await api('DELETE', `/api/tools/tasks/${b.dataset.del}`); reload();
        });
        root.querySelectorAll('.matrix-task').forEach(el => {
          el.onclick = () => taskForm(items.find(x => x.id == el.dataset.id));
        });
        root.querySelectorAll('.matrix-task input').forEach(el => {
          el.onclick = async (e) => {
            e.stopPropagation();
            const id = el.dataset.toggle;
            const item = items.find(x => x.id == id);
            await api('PATCH', `/api/tools/tasks/${id}`, { status: item.status === 'done' ? 'open' : 'done' });
            reload();
          };
        });
      };

      function taskRow(t) {
        return `
          <div class="matrix-task ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}">
            <input type="checkbox" data-toggle="${t.id}" ${t.status === 'done' ? 'checked' : ''}/>
            <span>${esc(t.title)}</span>
            ${t.estimate_min ? `<em>${t.estimate_min}м</em>` : ''}
          </div>
        `;
      }

      function taskForm(t) {
        modalOpen(`
          <h2>${t ? 'Изменить задачу' : 'Новая задача'}</h2>
          <div class="field"><label>Что нужно сделать</label><input class="input" id="tf-title" value="${t ? esc(t.title) : ''}" /></div>
          <div class="grid cols-2" style="gap:14px">
            <div class="field"><label>Квадрант</label><select class="input" id="tf-q">
              ${[1, 2, 3, 4].map(q => `<option value="${q}" ${(t?.quadrant || 2) == q ? 'selected' : ''}>${QUADRANTS[q].label}</option>`).join('')}
            </select></div>
            <div class="field"><label>Сфера</label><select class="input" id="tf-sphere">
              <option value="">—</option>
              ${SPHERES.map(s => `<option ${t?.sphere === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select></div>
            <div class="field"><label>Цель</label><select class="input" id="tf-goal">
              <option value="">—</option>
              ${goals.map(g => `<option value="${g.id}" ${t?.goal_id == g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
            </select></div>
            <div class="field"><label>Срок</label><input class="input" type="date" id="tf-due" value="${t?.due_date || ''}"/></div>
            <div class="field"><label>Оценка (минут)</label><input class="input" type="number" id="tf-est" value="${t?.estimate_min || ''}"/></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="(${modalClose.toString()})()">Отмена</button>
            <button class="btn btn-primary" id="tf-save">Сохранить</button>
          </div>
        `);
        document.getElementById('tf-save').onclick = async () => {
          const body = {
            title: document.getElementById('tf-title').value,
            quadrant: +document.getElementById('tf-q').value,
            sphere: document.getElementById('tf-sphere').value || null,
            goal_id: document.getElementById('tf-goal').value || null,
            due_date: document.getElementById('tf-due').value || null,
            estimate_min: +document.getElementById('tf-est').value || null,
          };
          if (!body.title.trim()) return toast('Укажи название', 'error');
          const r = t
            ? await api('PATCH', `/api/tools/tasks/${t.id}`, body)
            : await api('POST', '/api/tools/tasks', body);
          if (r.ok) { modalClose(); reload(); toast('Сохранено', 'success'); }
        };
      }

      c.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => {
        c.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
        view = b.dataset.view; reload();
      });
      document.getElementById('task-add').onclick = () => taskForm();
      reload();
    },
  },

  // ========== 4. HABITS ==========
  habits: {
    title: 'Привычки — не разрывай цепь',
    async render(c) {
      c.innerHTML = `
        <div class="toolbar">
          <span class="muted">Утро · день · вечер. Нажми на день — отметишь выполнение.</span>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="h-add">+ Привычка</button>
        </div>
        <div id="habits-root"></div>
      `;
      const reload = async () => {
        const r = await api('GET', '/api/tools/habits');
        const items = r.items || [];
        const groups = { morning: [], day: [], evening: [] };
        items.forEach(h => groups[h.time_of_day]?.push(h));
        const labels = { morning: 'Утро', day: 'День', evening: 'Вечер' };

        const days = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          days.push(d.toISOString().slice(0, 10));
        }

        document.getElementById('habits-root').innerHTML = items.length ? `
          ${Object.entries(groups).map(([k, list]) => list.length ? `
            <div class="card" style="margin-bottom:18px">
              <h2>${labels[k]}</h2>
              <div class="habits-table">
                <div class="habit-row-head">
                  <div></div>
                  ${days.map(d => `<div class="day-h">${new Date(d).getDate()}</div>`).join('')}
                  <div class="muted" style="text-align:right; padding-right:8px">серия</div>
                </div>
                ${list.map(h => `
                  <div class="habit-row-data" data-id="${h.id}">
                    <div class="habit-name"><span>${h.icon || '✓'}</span> ${esc(h.name)}
                      <button class="btn btn-sm btn-ghost" data-archive="${h.id}" style="padding:2px 8px; margin-left:6px">×</button>
                    </div>
                    ${days.map(d => `
                      <button class="day-cell ${h.logs.includes(d) ? 'done' : ''} ${d === todayStr() ? 'today' : ''}" data-toggle="${h.id}" data-date="${d}"></button>
                    `).join('')}
                    <div class="streak-num">${h.streak}🔥</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : '').join('')}
        ` : '<div class="tool-empty">Нет привычек. Заведи первую — она сразу появится в дашборде.</div>';

        document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
          await api('POST', `/api/tools/habits/${b.dataset.toggle}/toggle`, { date: b.dataset.date });
          reload();
        });
        document.querySelectorAll('[data-archive]').forEach(b => b.onclick = async () => {
          if (!confirm('Архивировать привычку?')) return;
          await api('PATCH', `/api/tools/habits/${b.dataset.archive}`, { archived: 1 });
          reload();
        });
      };

      document.getElementById('h-add').onclick = () => {
        modalOpen(`
          <h2>Новая привычка</h2>
          <div class="field"><label>Название</label><input class="input" id="hf-name" placeholder="Например, бег 20 минут"/></div>
          <div class="field"><label>Иконка (emoji)</label><input class="input" id="hf-icon" maxlength="2" placeholder="🏃"/></div>
          <div class="field"><label>Время</label><select class="input" id="hf-time">
            <option value="morning">Утро</option><option value="day">День</option><option value="evening">Вечер</option>
          </select></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="(${modalClose.toString()})()">Отмена</button>
            <button class="btn btn-primary" id="hf-save">Создать</button>
          </div>
        `);
        document.getElementById('hf-save').onclick = async () => {
          const r = await api('POST', '/api/tools/habits', {
            name: document.getElementById('hf-name').value,
            icon: document.getElementById('hf-icon').value || '✓',
            time_of_day: document.getElementById('hf-time').value,
          });
          if (r.ok) { modalClose(); reload(); toast('Создано', 'success'); }
          else toast('Укажи название', 'error');
        };
      };

      reload();
    },
  },

  // ========== 5. FINANCES ==========
  finances: {
    title: 'Финансы — денежный контроль',
    async render(c) {
      c.innerHTML = `
        <div class="toolbar">
          <input type="month" class="input" id="fin-month" value="${todayStr().slice(0, 7)}" style="max-width:200px"/>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="fin-add">+ Транзакция</button>
        </div>
        <div id="fin-root"></div>
      `;
      document.getElementById('fin-month').onchange = reload;
      document.getElementById('fin-add').onclick = () => txForm();

      async function reload() {
        const month = document.getElementById('fin-month').value;
        const [r, s] = await Promise.all([
          api('GET', `/api/tools/transactions?month=${month}`),
          api('GET', '/api/tools/finances/summary'),
        ]);
        const balance = (r.totals.income || 0) - (r.totals.expense || 0);
        const cats = Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]);
        const totalExp = r.totals.expense || 1;

        document.getElementById('fin-root').innerHTML = `
          <div class="grid cols-4" style="margin-bottom:24px">
            <div class="card stat"><div class="label">Доход за месяц</div><div class="value" style="color:var(--green); font-size:24px">${money(r.totals.income)}</div></div>
            <div class="card stat"><div class="label">Расход за месяц</div><div class="value" style="color:var(--red); font-size:24px">${money(r.totals.expense)}</div></div>
            <div class="card stat"><div class="label">Итог</div><div class="value" style="font-size:24px; color:${balance >= 0 ? 'var(--green)' : 'var(--red)'}">${money(balance)}</div></div>
            <div class="card stat"><div class="label">Подушка (мес)</div><div class="value">${s.cushionMonths}</div></div>
          </div>
          <div class="grid cols-2">
            <div class="card">
              <h2>Категории расходов</h2>
              ${cats.length ? cats.map(([cat, amt]) => `
                <div class="cat-row">
                  <span>${esc(cat)}</span>
                  <div class="bar"><i style="width:${(amt / totalExp) * 100}%"></i></div>
                  <strong>${money(amt)}</strong>
                </div>
              `).join('') : '<p class="muted">Расходов в этом месяце нет.</p>'}
            </div>
            <div class="card">
              <h2>Транзакции</h2>
              <div class="tx-list">
                ${r.items.length ? r.items.map(t => `
                  <div class="tx-row">
                    <span class="tx-date">${ruDate(t.date)}</span>
                    <span>${esc(t.category || '—')}</span>
                    <span class="muted" style="font-size:12px">${esc(t.note || '')}</span>
                    <strong style="color:${t.kind === 'income' ? 'var(--green)' : 'var(--red)'}">${t.kind === 'income' ? '+' : '−'}${money(t.amount)}</strong>
                    <button class="btn btn-sm btn-danger" data-del="${t.id}">×</button>
                  </div>
                `).join('') : '<p class="muted">Нет транзакций за месяц.</p>'}
              </div>
            </div>
          </div>
        `;
        document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить?')) return;
          await api('DELETE', `/api/tools/transactions/${b.dataset.del}`); reload();
        });
      }

      function txForm() {
        modalOpen(`
          <h2>Новая транзакция</h2>
          <div class="grid cols-2" style="gap:14px">
            <div class="field"><label>Тип</label><select class="input" id="tx-kind">
              <option value="expense">Расход</option><option value="income">Доход</option>
            </select></div>
            <div class="field"><label>Сумма (₽)</label><input class="input" type="number" step="0.01" id="tx-amt"/></div>
            <div class="field"><label>Категория</label><input class="input" id="tx-cat" placeholder="еда / транспорт / зарплата"/></div>
            <div class="field"><label>Дата</label><input class="input" type="date" id="tx-date" value="${todayStr()}"/></div>
          </div>
          <div class="field"><label>Заметка</label><input class="input" id="tx-note"/></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="(${modalClose.toString()})()">Отмена</button>
            <button class="btn btn-primary" id="tx-save">Добавить</button>
          </div>
        `);
        document.getElementById('tx-save').onclick = async () => {
          const r = await api('POST', '/api/tools/transactions', {
            kind: document.getElementById('tx-kind').value,
            amount: +document.getElementById('tx-amt').value,
            category: document.getElementById('tx-cat').value,
            date: document.getElementById('tx-date').value,
            note: document.getElementById('tx-note').value,
          });
          if (r.ok) { modalClose(); reload(); toast('Добавлено', 'success'); }
          else toast('Сумма должна быть > 0', 'error');
        };
      }

      reload();
    },
  },

  // ========== 6. HEALTH ==========
  health: {
    title: 'Здоровье — тело и энергия',
    async render(c) {
      const [t, r] = await Promise.all([
        api('GET', '/api/tools/health/today'),
        api('GET', '/api/tools/health/range?days=14'),
      ]);
      const today = t.today || { date: todayStr() };

      c.innerHTML = `
        <div class="card">
          <h2>Сегодня · ${ruDate(today.date)}</h2>
          <div class="grid cols-3" style="margin-top:14px">
            <div class="field"><label>Сон (часов)</label><input class="input" type="number" step="0.5" id="h-sleep" value="${today.sleep_hours ?? ''}"/></div>
            <div class="field"><label>Вода (стаканы)</label><input class="input" type="number" id="h-water" value="${today.water_glasses ?? ''}"/></div>
            <div class="field"><label>Шаги</label><input class="input" type="number" id="h-steps" value="${today.steps ?? ''}"/></div>
            <div class="field"><label>Настроение (1–5)</label>
              <div class="mood-row" id="mood-row">
                ${[1, 2, 3, 4, 5].map(m => `<button class="mood-btn ${today.mood == m ? 'active' : ''}" data-mood="${m}">${['😞', '😕', '😐', '🙂', '😄'][m - 1]}</button>`).join('')}
              </div>
            </div>
            <div class="field"><label>Вес (кг)</label><input class="input" type="number" step="0.1" id="h-weight" value="${today.weight ?? ''}"/></div>
            <div class="field"><label>Давление</label><input class="input" id="h-bp" placeholder="120/80" value="${today.blood_pressure ?? ''}"/></div>
          </div>
          <button class="btn btn-primary" id="h-save" style="margin-top:8px">Сохранить день</button>
        </div>

        <div class="card" style="margin-top:20px">
          <h2>За последние 14 дней</h2>
          <div id="h-charts"></div>
        </div>
      `;

      let mood = today.mood || null;
      c.querySelectorAll('.mood-btn').forEach(b => b.onclick = () => {
        mood = +b.dataset.mood;
        c.querySelectorAll('.mood-btn').forEach(x => x.classList.toggle('active', x === b));
      });

      document.getElementById('h-save').onclick = async () => {
        const body = {
          sleep_hours: +document.getElementById('h-sleep').value || null,
          water_glasses: +document.getElementById('h-water').value || null,
          steps: +document.getElementById('h-steps').value || null,
          mood,
          weight: +document.getElementById('h-weight').value || null,
          blood_pressure: document.getElementById('h-bp').value || null,
        };
        const res = await api('PUT', `/api/tools/health/${todayStr()}`, body);
        if (res.ok) toast('Сохранено', 'success');
      };

      // Charts (mini bars)
      const items = r.items || [];
      const days14 = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days14.push(d.toISOString().slice(0, 10));
      }
      const charts = ['sleep_hours', 'water_glasses', 'steps', 'mood'];
      const labels = { sleep_hours: 'Сон, ч', water_glasses: 'Вода', steps: 'Шаги', mood: 'Настроение' };
      const maxes = { sleep_hours: 10, water_glasses: 10, steps: 12000, mood: 5 };

      document.getElementById('h-charts').innerHTML = charts.map(metric => `
        <div class="chart-row">
          <span class="chart-label">${labels[metric]}</span>
          <div class="chart-bars">
            ${days14.map(d => {
              const it = items.find(x => x.date === d);
              const v = it?.[metric] ?? null;
              const h = v ? (Math.min(v, maxes[metric]) / maxes[metric]) * 100 : 0;
              return `<div class="chart-bar" title="${d}: ${v ?? '—'}"><i style="height:${h}%"></i></div>`;
            }).join('')}
          </div>
        </div>
      `).join('');
    },
  },

  // ========== 7. REVIEWS ==========
  reviews: {
    title: 'Обзоры — еженедельный ритуал',
    async render(c) {
      c.innerHTML = `
        <div class="toolbar">
          <span class="muted">15 минут в воскресенье меняют всю следующую неделю.</span>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="r-new">+ Новый обзор</button>
        </div>
        <div id="r-root"></div>
      `;
      document.getElementById('r-new').onclick = () => form();

      async function reload() {
        const r = await api('GET', '/api/tools/reviews');
        const root = document.getElementById('r-root');
        if (!r.items.length) {
          root.innerHTML = '<div class="tool-empty">Обзоров пока нет. Первый — самый важный.</div>';
          return;
        }
        root.innerHTML = '<div class="grid cols-2">' + r.items.map(rv => `
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:start">
              <div>
                <span class="tag tag-${rv.period === 'week' ? 'user' : 'admin'}">${rv.period === 'week' ? 'неделя' : 'месяц'}</span>
                <h3 style="margin:8px 0 0">${ruDate(rv.date_from)} — ${ruDate(rv.date_to)}</h3>
              </div>
              <button class="btn btn-sm btn-danger" data-del="${rv.id}">×</button>
            </div>
            ${rv.did ? `<div class="rev-block"><h4>✓ Что сделано</h4><p>${esc(rv.did)}</p></div>` : ''}
            ${rv.didnt ? `<div class="rev-block"><h4>✗ Что не сделано</h4><p>${esc(rv.didnt)}</p></div>` : ''}
            ${rv.why ? `<div class="rev-block"><h4>? Почему</h4><p>${esc(rv.why)}</p></div>` : ''}
            ${rv.change ? `<div class="rev-block"><h4>→ Что менять</h4><p>${esc(rv.change)}</p></div>` : ''}
          </div>
        `).join('') + '</div>';
        root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить обзор?')) return;
          await api('DELETE', `/api/tools/reviews/${b.dataset.del}`); reload();
        });
      }

      function form() {
        const wAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        modalOpen(`
          <h2>Новый обзор</h2>
          <div class="grid cols-2" style="gap:14px">
            <div class="field"><label>Период</label><select class="input" id="rf-p">
              <option value="week">Неделя</option><option value="month">Месяц</option>
            </select></div>
            <div class="field"><label>От</label><input class="input" type="date" id="rf-from" value="${wAgo}"/></div>
            <div class="field"><label>До</label><input class="input" type="date" id="rf-to" value="${todayStr()}"/></div>
          </div>
          <div class="field"><label>✓ Что сделано</label><textarea class="input" id="rf-did" rows="3"></textarea></div>
          <div class="field"><label>✗ Что не сделано</label><textarea class="input" id="rf-didnt" rows="2"></textarea></div>
          <div class="field"><label>? Почему</label><textarea class="input" id="rf-why" rows="2"></textarea></div>
          <div class="field"><label>→ Что менять</label><textarea class="input" id="rf-ch" rows="2"></textarea></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="(${modalClose.toString()})()">Отмена</button>
            <button class="btn btn-primary" id="rf-save">Сохранить</button>
          </div>
        `);
        document.getElementById('rf-save').onclick = async () => {
          await api('POST', '/api/tools/reviews', {
            period: document.getElementById('rf-p').value,
            date_from: document.getElementById('rf-from').value,
            date_to: document.getElementById('rf-to').value,
            did: document.getElementById('rf-did').value,
            didnt: document.getElementById('rf-didnt').value,
            why: document.getElementById('rf-why').value,
            change: document.getElementById('rf-ch').value,
          });
          modalClose(); reload(); toast('Сохранено', 'success');
        };
      }

      reload();
    },
  },

  // ========== 8. JOURNAL ==========
  journal: {
    title: 'Дневник — мысли и идеи',
    async render(c) {
      c.innerHTML = `
        <div class="toolbar">
          <button class="tab-btn active" data-kind="">Все</button>
          <button class="tab-btn" data-kind="note">Заметки</button>
          <button class="tab-btn" data-kind="gratitude">Благодарности</button>
          <button class="tab-btn" data-kind="idea">Идеи</button>
          <span style="flex:1"></span>
          <button class="btn btn-primary" id="j-new">+ Запись</button>
        </div>
        <div id="j-root"></div>
      `;
      let kind = '';
      c.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => {
        c.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
        kind = b.dataset.kind; reload();
      });
      document.getElementById('j-new').onclick = () => form();

      async function reload() {
        const r = await api('GET', '/api/tools/journal' + (kind ? `?kind=${kind}` : ''));
        const root = document.getElementById('j-root');
        if (!r.items.length) {
          root.innerHTML = '<div class="tool-empty">Записей нет. Голова — не склад. Разгрузи мысли в систему.</div>';
          return;
        }
        const kindIcon = { note: '📝', gratitude: '🙏', idea: '💡' };
        root.innerHTML = '<div class="grid cols-2">' + r.items.map(j => `
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:start">
              <span class="tag tag-user">${kindIcon[j.kind]} ${j.kind}</span>
              <button class="btn btn-sm btn-danger" data-del="${j.id}">×</button>
            </div>
            ${j.title ? `<h3 style="margin:10px 0 4px">${esc(j.title)}</h3>` : ''}
            <p style="white-space:pre-wrap; margin:6px 0; font-size:14px">${esc(j.body)}</p>
            <div class="muted" style="font-size:11px; margin-top:10px">${fmtDate(j.created_at)}${j.tags ? ' · ' + esc(j.tags) : ''}</div>
          </div>
        `).join('') + '</div>';
        root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('Удалить?')) return;
          await api('DELETE', `/api/tools/journal/${b.dataset.del}`); reload();
        });
      }

      function form() {
        modalOpen(`
          <h2>Новая запись</h2>
          <div class="field"><label>Тип</label><select class="input" id="jf-k">
            <option value="note">📝 Заметка</option>
            <option value="gratitude">🙏 Благодарность</option>
            <option value="idea">💡 Идея</option>
          </select></div>
          <div class="field"><label>Заголовок (опционально)</label><input class="input" id="jf-title"/></div>
          <div class="field"><label>Текст</label><textarea class="input" id="jf-body" rows="6" placeholder="Что у тебя на уме?"></textarea></div>
          <div class="field"><label>Теги (через запятую)</label><input class="input" id="jf-tags"/></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="(${modalClose.toString()})()">Отмена</button>
            <button class="btn btn-primary" id="jf-save">Сохранить</button>
          </div>
        `);
        document.getElementById('jf-save').onclick = async () => {
          const r = await api('POST', '/api/tools/journal', {
            kind: document.getElementById('jf-k').value,
            title: document.getElementById('jf-title').value,
            body: document.getElementById('jf-body').value,
            tags: document.getElementById('jf-tags').value,
          });
          if (r.ok) { modalClose(); reload(); toast('Записано', 'success'); }
          else toast('Текст не может быть пустым', 'error');
        };
      }

      reload();
    },
  },

  // ========== 9. AI ==========
  ai: {
    title: 'AI-ассистент — твой проактивный слой',
    async render(c) {
      const r = await api('GET', '/api/tools/ai/insights');
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

      c.innerHTML = `
        <div class="card" style="background: linear-gradient(135deg, rgba(124,92,255,0.12), rgba(34,211,238,0.08)); border-color: rgba(124,92,255,0.3)">
          <h2>${greeting}!</h2>
          ${hour < 12 ? `
            <p class="muted">Утренний бриф. Топ задач на день:</p>
            <ol class="ai-brief">
              ${(r.brief.top || []).map(t => `<li>${esc(t.title)}</li>`).join('') || '<li class="muted">Открытых задач нет.</li>'}
            </ol>
          ` : ''}
          ${r.recap ? `
            <p class="muted">Вечерний рекап:</p>
            <ul class="ai-brief">
              <li>Закрыто задач сегодня: <b>${r.recap.todayDone}</b></li>
              <li>Привычек выполнено: <b>${r.recap.habitsDone} / ${r.recap.habitsTotal}</b></li>
            </ul>
          ` : ''}
        </div>

        <h2 style="margin-top:28px">Инсайты системы</h2>
        <p class="muted">Не push-спам, а контекстные подсказки на основе твоих данных.</p>
        <div class="grid cols-2" style="margin-top:14px">
          ${r.insights.length ? r.insights.map(i => `
            <div class="card insight" data-priority="${i.priority}">
              <div class="insight-kind">${insightKindLabel(i.kind)}</div>
              <p>${esc(i.text)}</p>
            </div>
          `).join('') : `<div class="tool-empty" style="grid-column:1/-1">Всё в порядке. Ни одного триггера не сработало.</div>`}
        </div>
      `;

      function insightKindLabel(k) {
        return ({
          habit_streak: '🔥 Привычка',
          goal_stall: '🎯 Цель',
          health_sleep: '💤 Здоровье',
          finance_over: '💸 Финансы',
          wheel_weak: '⚖ Баланс',
        })[k] || k;
      }
    },
  },

  // ========== 10. GAMIFICATION ==========
  gamification: {
    title: 'Геймификация — очки и уровни',
    async render(c) {
      const g = await api('GET', '/api/tools/gamification');
      c.innerHTML = `
        <div class="card" style="text-align:center; padding:40px">
          <div class="avatar-big">${g.level}</div>
          <h2 style="margin:18px 0 6px">Уровень ${g.level}</h2>
          <p class="muted">${g.xp} XP всего · ${g.xpToNext} до следующего уровня</p>
          <div class="bar" style="max-width:480px; margin:18px auto 0; height:10px"><i style="width:${(g.xpInLevel / 200) * 100}%; background:var(--grad)"></i></div>
        </div>

        <div class="grid cols-3" style="margin-top:24px">
          <div class="card stat"><div class="label">Задач закрыто</div><div class="value" style="color:var(--cyan)">${g.stats.tasksDone}</div></div>
          <div class="card stat"><div class="label">Целей выполнено</div><div class="value" style="color:var(--violet)">${g.stats.goalsDone}</div></div>
          <div class="card stat"><div class="label">Лучшая серия привычки</div><div class="value" style="color:#F59E0B">${g.bestStreak}🔥</div></div>
        </div>

        <div class="card" style="margin-top:20px">
          <h2>Значки</h2>
          ${g.badges.length ? `
            <div class="badges-grid">
              ${g.badges.map(b => `
                <div class="badge-card">
                  <div class="badge-icon">${b.icon}</div>
                  <strong>${esc(b.name)}</strong>
                </div>
              `).join('')}
            </div>
          ` : `<p class="muted">Пока нет значков. Закрой первую цель, выполни задачу или построй серию из 7 дней.</p>`}
        </div>
      `;
    },
  },
};

// =================== Helpers ===================
async function renderWheelSVG(items) {
  const wrap = document.getElementById('wheel-svg-wrap');
  const ctrl = document.getElementById('wheel-controls');
  const N = items.length;
  const sectorAngle = (Math.PI * 2) / N;
  const maxR = 100;

  wrap.innerHTML = `<svg viewBox="-130 -130 260 260" style="width:100%; max-width:340px; overflow:visible">
    <g class="wheel-grid" stroke="rgba(255,255,255,0.08)" fill="none">
      <circle r="100"/><circle r="80"/><circle r="60"/><circle r="40"/><circle r="20"/>
    </g>
    ${items.map((s, i) => {
      const a0 = -Math.PI / 2 + i * sectorAngle;
      const a1 = a0 + sectorAngle;
      const r = (s.score / 10) * maxR;
      const x1 = Math.cos(a0) * r, y1 = Math.sin(a0) * r;
      const x2 = Math.cos(a1) * r, y2 = Math.sin(a1) * r;
      const large = sectorAngle > Math.PI ? 1 : 0;
      const color = SPHERE_COLORS[s.sphere] || '#7C5CFF';
      return `<path d="M0 0 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${color}" fill-opacity="0.55" stroke="${color}"/>`;
    }).join('')}
    ${items.map((s, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * sectorAngle;
      const lr = 116;
      const x = Math.cos(a) * lr, y = Math.sin(a) * lr;
      return `<text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" font-family="Manrope" font-size="9" font-weight="700" fill="#ECECF1" paint-order="stroke" stroke="#0B0B14" stroke-width="2.5px" stroke-linejoin="round" style="text-transform:uppercase; letter-spacing:0.04em">${s.sphere}</text>`;
    }).join('')}
    <circle r="3" fill="#fff"/>
  </svg>`;

  ctrl.innerHTML = items.map(s => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px">
      <span style="width:8px; height:8px; border-radius:50%; background:${SPHERE_COLORS[s.sphere]}"></span>
      <span style="flex:1">${s.sphere}</span>
      <input type="number" min="1" max="10" value="${s.score}" data-s="${s.sphere}" style="width:54px; padding:4px 8px; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:var(--text); border-radius:6px; font:inherit"/>
    </div>
  `).join('');

  ctrl.querySelectorAll('input').forEach(inp => inp.onchange = async () => {
    const score = Math.max(1, Math.min(10, +inp.value));
    inp.value = score;
    await api('PUT', `/api/tools/wheel/${encodeURIComponent(inp.dataset.s)}`, { score });
    // re-render the SVG
    const r = await api('GET', '/api/tools/wheel');
    renderWheelSVG(r.items);
  });
}
