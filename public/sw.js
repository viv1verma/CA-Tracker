// G A R P & Associates — service worker
// Bump CACHE_VERSION on every release, otherwise phones keep serving the old app.
const CACHE_VERSION = 'garp-v51';
const CACHE_NAME = CACHE_VERSION;
const STATIC_FILES = [
  '/', '/index.html', '/manifest.json',
  '/icon.svg', '/icon-192.png', '/icon-512.png',
  '/icon-maskable-192.png', '/icon-maskable-512.png', '/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_FILES).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache the API or auth — always hit the network. A cached /api response
  // could show stale tasks or, worse, survive a logout.
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;   // let cross-origin go straight through

  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.ok) {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return r;
    }).catch(() =>
      caches.match(e.request).then(c =>
        c || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)
      )
    )
  );
});

// Let the page tell a waiting worker to take over immediately
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', e => {
  try {
    const d = e.data.json();
    e.waitUntil(self.registration.showNotification(d.title || 'G A R P', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || 'garp',
      renotify: true,
      data: { url: d.url || '/' }
    }));
  } catch (err) {}
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  // Focus an open window if we already have one, rather than opening a second copy
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) { c.navigate(target); return c.focus(); }
      }
      return clients.openWindow(target);
    })
  );
});
