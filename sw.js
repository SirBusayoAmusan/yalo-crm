// ---- Web Push: the phone wakes this up when the server sends a notification, even with the app closed ----
// (Standard Web Push with the server's own keys. It works on Android browsers and on iPhone for the app added to the Home Screen.)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = (d.title || 'YALO CRM').toString().slice(0, 100);
  // Every push must show something (iPhone cancels subscriptions that stay silent).
  e.waitUntil(self.registration.showNotification(title, {
    body: (d.body || '').toString().slice(0, 240),
    icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || undefined,
    data: { url: typeof d.url === 'string' && d.url.charAt(0) === '/' ? d.url : '/' }
  }));
});

const CACHE = 'yalo-crm-shell-v10';
const LIBS = 'yalo-crm-libs-v1';
const SHELL = ['index.html', 'outreach-core.js', 'outreach.js', 'sales-lexicon.js', 'sales-core.js', 'sales.js', 'workspace.js', 'push-core.js', 'push.js', 'wins-core.js', 'wins.js', 'calm.js', 'card.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'icon.svg'];
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
  const rel = (e.notification.data && e.notification.data.url) || '/';
  const target = new URL(rel.replace(/^\//, ''), self.registration.scope).href;       // e.g. https://app/?go=tasks
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      try { await c.focus(); c.postMessage({ type: 'yalo-open', search: new URL(target).search }); return; } catch (err) { /* try the next window */ }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // App shell: network first, cached copy when offline.
  if (url.origin === self.location.origin && (url.pathname.endsWith('/') || SHELL.some(f => url.pathname.endsWith(f)))) {
    e.respondWith(
      // cache:'no-cache' = always revalidate with the server. GitHub Pages tells browsers to keep files for
      // 10 minutes, which made fresh deploys look like they had not happened.
      fetch(e.request, { cache: 'no-cache' }).then(res => {
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
