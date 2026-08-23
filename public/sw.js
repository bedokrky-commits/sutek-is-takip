const CACHE_NAME = 'sutek-pwa-v242';
const STATIC_ASSETS = [
  '/offline.html',
  '/icons/sutek-app-192-v242.png',
  '/icons/sutek-app-512-v242.png',
  '/icons/sutek-maskable-512-v242.png',
  '/icons/sutek-apple-180-v242.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Manifest must always prefer the network so installed-app icon updates are not stuck.
  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  const isStatic =
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname === '/favicon.ico';

  if (isStatic) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
