const CACHE_VERSION = 'garp-v4';
const CACHE_NAME = CACHE_VERSION;
const STATIC_FILES = [
  '/', '/index.html', '/icon.svg', '/manifest.json',
  '/js/app.js',
  '/css/main.css', '/css/components.css', '/css/pages.css'
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
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && e.request.method === 'GET') {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
  );
});

self.addEventListener('push', e => {
  try {
    const d = e.data.json();
    e.waitUntil(self.registration.showNotification(d.title||'G A R P', {body:d.body||'',icon:'/icon.svg',badge:'/icon.svg',tag:d.tag||'garp',data:{url:d.url||'/'}}));
  } catch(err) {}
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url||'/'));
});
