// The service worker's push handler, run for real in a sandbox. Run: node --test tests/sw.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function load() {
  const listeners = {}, shown = [], opened = [], focused = [], posted = [];
  const client = { focus: async () => { focused.push(1); }, postMessage: m => posted.push(m) };
  const self = { addEventListener: (n, f) => { listeners[n] = f; }, registration: { scope: 'https://crm.example/app/', showNotification: async (t, o) => { shown.push({ t, o }); } },
    clients: { matchAll: async () => self.__clients, openWindow: async u => { opened.push(u); }, claim() {} }, __clients: [], skipWaiting() {}, location: { origin: 'https://crm.example' } };
  const ctx = vm.createContext({ self, caches: { open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => null }), keys: async () => [], delete: async () => {}, match: async () => null }, URL, Promise, fetch: async () => ({}), console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), ctx);
  const fire = async (name, ev) => { let p; ev.waitUntil = x => { p = x; }; listeners[name](ev); await p; };
  return { self, listeners, shown, opened, focused, posted, client, fire };
}

test('a push always shows a notification, with the title, text and a safe destination', async () => {
  const w = load();
  await w.fire('push', { data: { json: () => ({ title: '⏰ Call Ife', body: 'Idle Corp · Ife Bello', url: '/?lead=abc&tab=overview', tag: 'r:1' }) } });
  assert.equal(w.shown.length, 1); assert.equal(w.shown[0].t, '⏰ Call Ife'); assert.equal(w.shown[0].o.body, 'Idle Corp · Ife Bello'); assert.equal(w.shown[0].o.tag, 'r:1'); assert.equal(w.shown[0].o.data.url, '/?lead=abc&tab=overview'); assert.match(w.shown[0].o.icon, /icon-192/);
  await w.fire('push', { data: { json: () => ({ title: 'x', url: 'https://evil.com' }) } }); assert.equal(w.shown[1].o.data.url, '/', 'only paths inside the app');
  await w.fire('push', { data: { json: () => { throw new Error('not json'); }, text: () => 'plain words' } }); assert.equal(w.shown[2].t, 'YALO CRM'); assert.equal(w.shown[2].o.body, 'plain words');
  await w.fire('push', { data: null }); assert.equal(w.shown.length, 4, 'even an empty push shows something (iPhone cancels silent ones)');
  await w.fire('push', { data: { json: () => ({ title: 'T'.repeat(500), body: 'B'.repeat(900) }) } }); assert.ok(w.shown[4].t.length <= 100 && w.shown[4].o.body.length <= 240);
});

test('tapping a notification focuses the open app and sends it where to go, or opens it', async () => {
  const w = load(); let closed = 0; const n = { close: () => closed++, data: { url: '/?go=tasks' } };
  w.self.__clients = [w.client]; await w.fire('notificationclick', { notification: n });
  assert.equal(closed, 1); assert.equal(w.focused.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(w.posted)), [{ type: 'yalo-open', search: '?go=tasks' }]); assert.equal(w.opened.length, 0);
  const w2 = load(); await w2.fire('notificationclick', { notification: { close() {}, data: { url: '/?lead=abc&tab=emails' } } });
  assert.deepEqual(JSON.parse(JSON.stringify(w2.opened)), ['https://crm.example/app/?lead=abc&tab=emails'], 'a closed app is opened at the right place inside its folder');
  const w3 = load(); await w3.fire('notificationclick', { notification: { close() {}, data: null } }); assert.deepEqual(JSON.parse(JSON.stringify(w3.opened)), ['https://crm.example/app/']);
});

test('no Firebase code is left in the worker (it could clash with the new push handler)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(!/importScripts|firebase-messaging|onBackgroundMessage|initializeApp/i.test(src));
  assert.ok(/push-core\.js/.test(src) && /push\.js/.test(src), 'new files are cached for offline');
});
