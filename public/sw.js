/* PrimeVest service worker — installable app shell.
   Strategy: network-first for pages & API (fresh data always wins),
   stale-while-revalidate for same-origin static assets (css/js/icons). */
const VERSION = 'pv-v1';
const SHELL = [
  '/', '/index.html', '/login.html', '/register.html', '/dashboard.html',
  '/css/app.css', '/css/landing.css', '/css/auth.css', '/css/dashboard.css',
  '/js/config.js', '/js/api.js', '/js/icons.js', '/js/landing.js', '/js/auth.js',
  '/js/dashboard.js', '/js/countries.js', '/js/alerts-data.js', '/js/alerts.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // API: network only (never serve stale money data); fall through on failure.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first with cached fallback (offline shell).
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then(m => m || caches.match('/index.html')))
    );
    return;
  }

  // Same-origin static: stale-while-revalidate.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request)
          .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
          .catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
