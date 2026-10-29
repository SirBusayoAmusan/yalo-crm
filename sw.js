const CACHE = 'yalo-crm-shell-v2';
const SHELL = ['index.html', 'card.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Only the static shell pages are served from cache when offline.
// Everything else (Firestore, fonts, Chart.js, QR images) goes straight to the network.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isShellPage = url.origin === self.location.origin && SHELL.some(f => url.pathname.endsWith(f));
  if (!isShellPage) return;

  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
