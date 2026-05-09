// ============== OmnixOS · landing scripts ==============

// 1. Wheel of balance ----------------------------------------------------
const SPHERES = [
  { name: 'Здоровье',     score: 5, color: '#EF4444', tip: 'Низкий сон 2 недели. Запланировать отбой в 23:00?' },
  { name: 'Работа',       score: 9, color: '#22D3EE', tip: 'Перевыполнение. Не выгори — добавь 1 день отдыха.' },
  { name: 'Деньги',       score: 7, color: '#10B981', tip: 'Подушка на 4 месяца. Цель: 6.' },
  { name: 'Отношения',    score: 8, color: '#EC4899', tip: 'Стабильно. Запланируй вечер на этой неделе.' },
  { name: 'Развитие',     score: 7, color: '#7C5CFF', tip: 'Курс на 60%. Доделай главу 7 на выходных.' },
  { name: 'Отдых',        score: 6, color: '#F59E0B', tip: '12 дней без выходного. Поставить субботу?' },
  { name: 'Творчество',   score: 7, color: '#06B6D4', tip: 'Хороший темп. Покажи проект публично.' },
  { name: 'Дух',          score: 8, color: '#8B5CF6', tip: 'Медитация — серия 21 день. Так держать.' },
];

(function renderWheel() {
  const segG = document.getElementById('wheel-segments');
  const labelG = document.getElementById('wheel-labels');
  const list = document.getElementById('wheel-list');
  if (!segG || !labelG || !list) return;

  const N = SPHERES.length;
  const sectorAngle = (Math.PI * 2) / N;
  const maxR = 100;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let weakest = SPHERES[0];
  let sum = 0;

  SPHERES.forEach((s, i) => {
    sum += s.score;
    if (s.score < weakest.score) weakest = s;

    const startA = -Math.PI / 2 + i * sectorAngle;
    const endA = startA + sectorAngle;
    const r = (s.score / 10) * maxR;

    const x1 = Math.cos(startA) * r;
    const y1 = Math.sin(startA) * r;
    const x2 = Math.cos(endA) * r;
    const y2 = Math.sin(endA) * r;
    const largeArc = sectorAngle > Math.PI ? 1 : 0;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill', s.color);
    path.setAttribute('fill-opacity', '0.55');
    path.setAttribute('stroke', s.color);
    path.setAttribute('stroke-width', '1');
    path.setAttribute('class', 'seg');
    path.dataset.idx = i;

    path.addEventListener('mouseenter', () => highlightSphere(i));
    path.addEventListener('click', () => highlightSphere(i));

    segG.appendChild(path);

    // Label
    const labelA = startA + sectorAngle / 2;
    const lr = 112;
    const lx = Math.cos(labelA) * lr;
    const ly = Math.sin(labelA) * lr;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', lx);
    text.setAttribute('y', ly);
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = s.name;
    labelG.appendChild(text);

    // Sidebar list
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="wl-name"><span class="wl-dot" style="--c:${s.color}"></span>${s.name}</span>
      <span class="wl-score"><b>${s.score}</b>/10</span>
    `;
    li.addEventListener('mouseenter', () => highlightSphere(i));
    list.appendChild(li);
  });

  // Average + weakest
  const avg = (sum / N).toFixed(1);
  const avgEl = document.getElementById('wheel-avg');
  const weakestEl = document.getElementById('wheel-weakest');
  if (avgEl) avgEl.textContent = avg;
  if (weakestEl) weakestEl.textContent = weakest.name.toLowerCase();

  function highlightSphere(idx) {
    const s = SPHERES[idx];
    const stat = document.querySelector('.wheel-stat p');
    if (stat) stat.innerHTML = `<b>${s.name}:</b> ${s.tip}`;
    // segment emphasis
    document.querySelectorAll('.wheel .seg').forEach((el, i) => {
      el.setAttribute('fill-opacity', i === idx ? '0.85' : '0.4');
    });
  }
})();

// 2. Particle background ------------------------------------------------
(function particles() {
  const c = document.getElementById('bg-canvas');
  if (!c) return;
  const ctx = c.getContext('2d', { alpha: true });

  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // На мобилках и при reduced-motion — рисуем один статичный кадр и выходим.
  // Это убирает основной источник нагрузки при скролле на слабых устройствах.
  let w, h, dpr, particles;
  const COUNT = isMobile ? 24 : 40;

  function resize() {
    // DPR=1 — для фоновых частиц визуально неотличимо, но в 2-4 раза дешевле.
    dpr = 1;
    w = c.width = Math.floor(window.innerWidth * dpr);
    h = c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = window.innerWidth + 'px';
    c.style.height = window.innerHeight + 'px';
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.4 + 0.4,
      hue: Math.random() < 0.5 ? '124, 92, 255' : '34, 211, 238',
    }));
  }

  const MAX_DIST = 140;
  const MAX_DIST_SQ = MAX_DIST * MAX_DIST;

  function drawFrame() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MAX_DIST_SQ) {
          const a = 1 - Math.sqrt(d2) / MAX_DIST;
          ctx.strokeStyle = `rgba(${p.hue}, ${a * 0.18})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = `rgba(${p.hue}, 0.55)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Один статичный кадр для случаев, когда анимация не нужна.
  if (reduceMotion || isMobile) {
    init();
    drawFrame();
    window.addEventListener('resize', () => { init(); drawFrame(); }, { passive: true });
    return;
  }

  // Throttle до ~30 fps — для фоновых частиц визуально достаточно,
  // в 2 раза меньше работы на главном потоке.
  const FRAME_MS = 33;
  let last = 0;
  let rafId = 0;
  let running = false;

  function loop(t) {
    if (!running) return;
    if (t - last >= FRAME_MS) {
      last = t;
      drawFrame();
    }
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  init();
  start();

  // Пауза, когда вкладка свёрнута или canvas скроллом ушёл из вида.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some(e => e.isIntersecting);
      if (visible) start(); else stop();
    });
    io.observe(c);
  }

  // Debounce resize, чтобы не пересоздавать массив частиц на каждый пиксель.
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => init(), 150);
  }, { passive: true });
})();

// 3. Reveal on scroll ---------------------------------------------------
(function reveal() {
  const targets = document.querySelectorAll('.section, .hero-copy, .hero-visual, .mod, .principle');
  targets.forEach(t => t.classList.add('reveal'));

  if (!('IntersectionObserver' in window)) {
    targets.forEach(t => t.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('is-visible'), i * 50);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  targets.forEach(t => io.observe(t));
})();
