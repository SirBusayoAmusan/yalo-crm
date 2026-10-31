// ---- Firebase Cloud Messaging (background push) ----
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyD_0WnGjD1YKlrT86RXL79OvqfIoAm3ccc",
    authDomain: "yalo-crm.firebaseapp.com",
    projectId: "yalo-crm",
    storageBucket: "yalo-crm.firebasestorage.app",
    messagingSenderId: "1003166589543",
    appId: "1:1003166589543:web:c2e22341675f1cf053eac2"
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const d = payload.data || {};
    self.registration.showNotification(d.title || 'YALO CRM', {
      body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
      tag: d.remId ? 'yalo-rem-' + d.remId : undefined, data: d
    });
  });
} catch (e) { /* messaging optional; app shell still works */ }

const CACHE = 'yalo-crm-shell-v3';
const LIBS = 'yalo-crm-libs-v1';
const SHELL = ['index.html', 'card.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'icon.svg'];
const LIB_HOSTS = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== LIBS).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // App shell: network first, cached copy when offline.
  if (url.origin === self.location.origin && (url.pathname.endsWith('/') || SHELL.some(f => url.pathname.endsWith(f)))) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Versioned CDN libraries (Firebase SDK, Chart.js, QR, fonts): cache first so the app can boot offline.
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(LIBS).then(cache =>
        cache.match(e.request).then(hit => hit || fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }))
      )
    );
  }
  // Firestore / Auth API calls are never intercepted.
});
