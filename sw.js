// =====================================================================
// OmnixOS · service worker
// Назначение — ТОЛЬКО показ/клики уведомлений. Никакого кэширования fetch,
// чтобы не ломать no-cache-стратегию приложения.
// =====================================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || 'dashboard.html';
  event.waitUntil((async () => {
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if ('focus' in w) { try { await w.focus(); return; } catch {} }
      }
      if (self.clients.openWindow) { await self.clients.openWindow(target); }
    } catch {}
  })());
});
