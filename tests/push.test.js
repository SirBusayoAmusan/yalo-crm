// Run: node --test tests/push.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const lib = require('../server/push-lib.js');

const T0 = Date.UTC(2026, 10, 10, 9, 0, 0), H = 3600000, MIN = 60000;
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123', APPLE = 'https://web.push.apple.com/QXYZ-iphone';
const subOf = (endpoint, tag = 'a') => ({ endpoint, keys: { p256dh: 'p'.repeat(87) + tag, auth: 'auth' + tag } });

// A store that behaves like Vercel Blob: ETags, create-only, "only if unchanged".
function memStore() {
  let data = null, ver = 0; const s = { writes: 0, reads: 0, failNext: 0 };
  s.read = async () => { s.reads++; return { state: data ? JSON.parse(data) : null, etag: data ? 'v' + ver : null }; };
  s.write = async (state, etag, allowOverwrite) => {
    if (s.failNext > 0) { s.failNext--; return false; }
    if (etag) { if (!data || etag !== 'v' + ver) return false; }
    else if (data && !allowOverwrite) return false;
    data = JSON.stringify(state); ver++; s.writes++; return true;
  };
  s.peek = () => JSON.parse(data); s.raw = () => data;
  return s;
}
function fakePush(opts = {}) {
  const calls = [];
  return { calls, generateVAPIDKeys: () => ({ publicKey: 'PUB-' + crypto.randomBytes(4).toString('hex'), privateKey: 'PRIV-' + crypto.randomBytes(4).toString('hex') }),
    sendNotification: async (sub, payload, o) => { calls.push({ sub, payload: JSON.parse(payload), o }); const f = opts.fail && opts.fail(sub); if (f) { const e = new Error('push failed'); e.statusCode = f; throw e; } } };
}
function setup(o = {}) {
  const store = memStore(), webpush = fakePush(o); let now = o.now || T0;
  const svc = lib.createPush({ store, webpush, now: () => now, verify: async t => { if (t === 'good') return { email: 'a@x.com', uid: '1' }; throw new Error('no'); } });
  return { svc, store, webpush, setNow: n => { now = n; }, getNow: () => now };
}
const AUTH = { authorization: 'Bearer good' };
const item = (id, atMs, extra = {}) => Object.assign({ id, at: new Date(atMs).toISOString(), title: 'T ' + id, body: 'B ' + id, url: '/?go=tasks' }, extra);
const reg = async (S, ep = FCM) => (await S.svc.subscribe({ headers: AUTH, body: { subscription: subOf(ep), label: 'Phone', ua: 'x' } }));

test('keys are created once by the server and only the public half is shown', async () => {
  const S = setup(); const [a, b] = await Promise.all([S.svc.config(), S.svc.config()]);
  assert.equal(a.json.publicKey, b.json.publicKey, 'two first calls at once must agree on one key');
  assert.match(a.json.publicKey, /^PUB-/); assert.ok(!JSON.stringify(a).includes('PRIV'), 'private key never leaves the server');
  assert.equal(S.store.peek().vapid.publicKey, a.json.publicKey);
  assert.equal((await S.svc.config()).json.publicKey, a.json.publicKey, 'stable on later calls');
});

test('only signed-in owners can register, sync, test or see status', async () => {
  const S = setup();
  for (const [fn, body] of [['subscribe', { subscription: subOf(FCM) }], ['unsubscribe', { endpoint: FCM }], ['sync', { items: [] }], ['test', {}], ['status', {}]]) {
    await assert.rejects(S.svc[fn]({ headers: {}, body }), e => e.status === 401, fn + ' without a token');
    await assert.rejects(S.svc[fn]({ headers: { authorization: 'Bearer bad' }, body }), e => e.status === 401, fn + ' with a bad token');
  }
  assert.equal(S.store.peek ? (S.store.raw() ? S.store.peek().subs.length : 0) : 0, 0);
});

test('Firebase sign-in tokens: signature, project, expiry, email and verification are all checked', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
  const fetchImpl = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const mk = (claims, key = privateKey, kid = 'k1') => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'); const h = b({ alg: 'RS256', kid, typ: 'JWT' }), p = b(Object.assign({ aud: 'yalo-crm', iss: 'https://securetoken.google.com/yalo-crm', sub: 'u1', iat: Math.floor(T0 / 1000) - 10, exp: Math.floor(T0 / 1000) + 3000, email: 'synccityng@gmail.com', email_verified: true }, claims)); const sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key).toString('base64url'); return h + '.' + p + '.' + sig; };
  const v = t => lib.verifyIdToken(t, { fetchImpl, now: T0 });
  lib.resetJwksCache();
  assert.deepEqual(await v(mk({})), { email: 'synccityng@gmail.com', uid: 'u1' });
  await assert.rejects(v(mk({ email: 'stranger@gmail.com' })), /not allowed/);
  await assert.rejects(v(mk({ email_verified: false })), /not allowed/);
  await assert.rejects(v(mk({ aud: 'other-project' })), /wrong project/);
  await assert.rejects(v(mk({ exp: Math.floor(T0 / 1000) - 5 })), /expired/);
  await assert.rejects(v(mk({}, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)), /bad signature/);
  await assert.rejects(v(mk({}, privateKey, 'nope')), /unknown key/);
  await assert.rejects(v('abc.def'), /bad token/); await assert.rejects(v(''), /bad token/);
});

test('devices: only real push services are accepted, duplicates merge, there is a limit', async () => {
  const S = setup();
  assert.equal((await S.svc.subscribe({ headers: AUTH, body: { subscription: subOf('https://evil.example.com/x') } })).status, 400, 'the server calls these URLs, so unknown hosts are refused');
  assert.equal((await S.svc.subscribe({ headers: AUTH, body: { subscription: subOf('http://fcm.googleapis.com/x') } })).status, 400);
  assert.equal((await S.svc.subscribe({ headers: AUTH, body: { subscription: { endpoint: FCM, keys: {} } } })).status, 400);
  assert.equal((await reg(S, FCM)).json.devices, 1); assert.equal((await reg(S, APPLE)).json.devices, 2);
  assert.equal((await reg(S, FCM)).json.devices, 2, 'same device again does not duplicate');
  for (let i = 0; i < 12; i++) await reg(S, `https://fcm.googleapis.com/fcm/send/d${i}`);
  assert.ok(S.store.peek().subs.length <= 10);
  const left = (await S.svc.unsubscribe({ headers: AUTH, body: { endpoint: APPLE } })).json.devices; assert.ok(left <= 10);
  for (const ok of ['https://web.push.apple.com/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=1'.replace('?token=1', '')]) assert.ok(lib.cleanSubscription(subOf(ok)), ok);
});

test('sync: cleans what the app uploads and does not rewrite when nothing changed', async () => {
  const S = setup(); await S.svc.config();
  const items = [item('r:1', T0 + H), item('r:1', T0 + H), { id: 'bad id!', at: new Date(T0 + H).toISOString(), title: 'x' }, item('old', T0 - 20 * H), item('far', T0 + 90 * 24 * H), { id: 'n', at: 'garbage', title: 'x' }, item('r:2', T0 + 2 * H, { title: '<b>Hi</b>\n\nthere', url: 'https://evil.com' })];
  const r = await S.svc.sync({ headers: AUTH, body: { items } });
  assert.equal(r.json.count, 2); const st = S.store.peek().items; assert.deepEqual(st.map(i => i.id), ['r:1', 'r:2']); assert.equal(st[1].url, '/', 'only paths inside the app'); assert.equal(st[1].title, '<b>Hi</b> there');
  const w = S.store.writes; const again = await S.svc.sync({ headers: AUTH, body: { items } }); assert.equal(again.json.changed, false); assert.equal(S.store.writes, w, 'no write when unchanged');
  assert.equal((await S.svc.sync({ headers: AUTH, body: { items: 'nope' } })).json.count, 0);
});

test('tick: sends what is due once, to every device, and never twice', async () => {
  const S = setup(); await reg(S, FCM); await reg(S, APPLE);
  await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 - 5 * MIN), item('r:2', T0 + 2 * H)] } });
  let r = (await S.svc.tick()).json; assert.equal(r.sent, 1); assert.equal(r.due, 1);
  assert.equal(S.webpush.calls.length, 2, 'one send per device'); assert.deepEqual(S.webpush.calls.map(c => c.payload.title), ['T r:1', 'T r:1']);
  const c = S.webpush.calls[0]; assert.equal(c.payload.url, '/?go=tasks'); assert.equal(c.payload.tag, 'r:1'); assert.equal(c.o.urgency, 'high'); assert.equal(c.o.vapidDetails.subject, 'https://yalotechnologies-crm.vercel.app'); assert.match(c.o.vapidDetails.privateKey, /^PRIV-/);
  r = (await S.svc.tick()).json; assert.equal(r.sent, 0); assert.equal(S.webpush.calls.length, 2, 'second tick sends nothing new');
  await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 - 5 * MIN), item('r:2', T0 + 2 * H)] } });
  assert.equal((await S.svc.tick()).json.sent, 0, 'uploading the same list again does not resend');
  S.setNow(T0 + 2 * H + MIN); r = (await S.svc.tick()).json; assert.equal(r.sent, 1); assert.equal(S.webpush.calls.at(-1).payload.title, 'T r:2');
});

test('tick: a task moved to later is sent at its new time, a deleted one is not sent', async () => {
  const S = setup(); await reg(S);
  await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 - MIN), item('r:9', T0 + H)] } }); await S.svc.tick(); assert.equal(S.webpush.calls.length, 1);
  await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 + 3 * H)] } });                 // r:1 snoozed, r:9 deleted
  S.setNow(T0 + 2 * H); assert.equal((await S.svc.tick()).json.sent, 0);
  S.setNow(T0 + 3 * H + MIN); assert.equal((await S.svc.tick()).json.sent, 1); assert.equal(S.webpush.calls.length, 2);
});

test('tick: old items are skipped, no devices keeps them waiting, many due are summarised', async () => {
  const S = setup();
  await S.svc.sync({ headers: AUTH, body: { items: [item('late', T0 - 10 * H)] } });
  assert.equal((await S.svc.tick()).json.sent, 0, 'no device registered: nothing lost, nothing sent'); assert.equal(S.store.peek().sent['late|' + new Date(T0 - 10 * H).toISOString()], undefined);
  await reg(S); assert.equal((await S.svc.tick()).json.sent, 1, 'now there is a device, the item goes out');
  const S2 = setup(); await reg(S2);
  await S2.svc.sync({ headers: AUTH, body: { items: Array.from({ length: 20 }, (_, i) => item('m' + i, T0 - (20 - i) * MIN)) } });
  const r = (await S2.svc.tick()).json; assert.equal(r.sent, 13, '12 individual + 1 summary'); assert.match(S2.webpush.calls.at(-1).payload.title, /8 more things/);
  assert.equal((await S2.svc.tick()).json.sent, 0, 'summarised items are not sent again');
  const S3 = setup(); await reg(S3); S3.store.peek();
  await S3.svc.sync({ headers: AUTH, body: { items: [item('x', T0 - 11 * H)] } }); S3.setNow(T0 + 30 * H); assert.equal((await S3.svc.tick()).json.sent, 0, 'items older than 36 hours are never sent late'); assert.equal((await S3.svc.tick()).json.skipped, 0);
});

test('tick: a device that is gone (410/404) is removed; a failing one does not block the others', async () => {
  const S = setup({ fail: sub => sub.endpoint === APPLE ? 410 : 0 }); await reg(S, FCM); await reg(S, APPLE);
  await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 - MIN)] } });
  const r = (await S.svc.tick()).json; assert.equal(r.sent, 1); assert.deepEqual(S.store.peek().subs.map(s => s.endpoint), [FCM], 'dead device removed');
  const S2 = setup({ fail: () => 500 }); await reg(S2); await S2.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 - MIN)] } });
  assert.equal((await S2.svc.tick()).json.sent, 0, 'a send that failed everywhere is retried on the next tick'); assert.equal(S2.store.peek().subs.length, 1, 'a temporary error does not delete the device');
});

test('tick: cheap when idle (one read, a write only about once an hour)', async () => {
  const S = setup(); await reg(S); await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 + 5 * H)] } });
  await S.svc.tick(); const w = S.store.writes, r0 = S.store.reads;
  S.setNow(T0 + 10 * MIN); await S.svc.tick(); S.setNow(T0 + 20 * MIN); await S.svc.tick();
  assert.equal(S.store.writes, w, 'idle ticks do not write'); assert.equal(S.store.reads - r0, 2, 'one read per tick');
  S.setNow(T0 + 70 * MIN); await S.svc.tick(); assert.equal(S.store.writes, w + 1, 'an hourly heartbeat proves the scheduler is alive');
  assert.ok(S.store.peek().lastTick);
});

test('two devices writing at once cannot overwrite each other', async () => {
  const S = setup(); await S.svc.config(); S.store.failNext = 2;           // pretend someone else changed the file twice
  const r = await reg(S, FCM); assert.equal(r.json.devices, 1); assert.equal(S.store.peek().subs.length, 1);
  S.store.failNext = 99; await assert.rejects(reg(S, APPLE), /Busy/); S.store.failNext = 0;
});

test('test notification goes to every device or one, and reports each result', async () => {
  const S = setup({ fail: sub => sub.endpoint === APPLE ? 410 : 0 });
  assert.equal((await S.svc.test({ headers: AUTH, body: {} })).status, 404, 'nothing registered yet');
  await reg(S, FCM); await reg(S, APPLE);
  const r = (await S.svc.test({ headers: AUTH, body: {} })).json; assert.equal(r.ok, true); assert.equal(r.results.length, 2); assert.equal(r.results.find(x => x.label === 'Phone' && x.gone).gone, true);
  assert.equal(S.store.peek().subs.length, 1, 'the dead device is cleaned up');
  const one = (await S.svc.test({ headers: AUTH, body: { endpoint: FCM } })).json; assert.equal(one.results.length, 1); assert.match(S.webpush.calls.at(-1).payload.title, /test/i);
});

test('status shows devices, what is coming up and when the scheduler last ran', async () => {
  const S = setup(); await reg(S); await S.svc.sync({ headers: AUTH, body: { items: [item('r:1', T0 + H), item('r:2', T0 + 2 * H), item('past', T0 - H)] } }); await S.svc.tick();
  const j = (await S.svc.status({ headers: AUTH })).json; assert.equal(j.devices.length, 1); assert.equal(j.devices[0].label, 'Phone'); assert.equal(j.items, 3);
  assert.deepEqual(j.upcoming.map(u => u.title), ['T r:1', 'T r:2']); assert.ok(j.lastTick); assert.ok(j.lastSend); assert.ok(!JSON.stringify(j).includes('PRIV'));
});

test('cross-origin rules: the CRM addresses are allowed, others are not', () => {
  assert.equal(lib.corsHeaders('https://yalotechnologies-crm.vercel.app')['Access-Control-Allow-Origin'], 'https://yalotechnologies-crm.vercel.app');
  assert.equal(lib.corsHeaders('https://sirbusayoamusan.github.io')['Access-Control-Allow-Origin'], 'https://sirbusayoamusan.github.io');
  assert.equal(lib.corsHeaders('https://evil.com')['Access-Control-Allow-Origin'], undefined); assert.equal(lib.corsHeaders('https://evil.com.vercel.app.evil.com')['Access-Control-Allow-Origin'], undefined);
  assert.equal(lib.corsHeaders(undefined)['Access-Control-Allow-Origin'], undefined);
});

/* ===================== what the app asks the server to send ===================== */
const YO = require('../outreach-core.js'), YS = require('../sales-core.js'), PC = require('../push-core.js');
const L = (y, m, d, h = 0, mi = 0) => new Date(y, m, d, h, mi);
const DAYMS = 86400000;
function lead(o = {}) { return Object.assign({ id: 'L' + Math.random().toString(36).slice(2, 6), company: 'Acme Ltd', brand: 'yalo', stage: 'New', value: 0, contactedAt: null, createdAt: L(2026, 10, 1).toISOString(), notes: '', contacts: [{ name: 'Jane Doe', title: 'CFO', email: 'jane@acme.com' }], emails: Array.from({ length: 7 }, () => ({ status: 'draft' })) }, o); }
function running(o, sentDaysAgo, now) { const l = lead(o); const meta = YS.sequenceMeta(l, l.contacts[0]); YO.startSequence(l, 0, new Date(now - 20 * DAYMS), meta.type, meta); if (sentDaysAgo != null) YO.markSent(l, 0, 0, new Date(now - sentDaysAgo * DAYMS)); return l; }
const NOW = L(2026, 10, 10, 7, 0);               // 07:00, before the morning time

test('schedule: tasks buzz at their time; done, ancient and far-away ones do not', () => {
  const rem = [{ id: 'a', note: 'Call Jane about the lease', company: 'Acme Ltd', contactName: 'Jane Doe', leadId: 'L1', when: L(2026, 10, 10, 15).toISOString() }, { id: 'b', note: 'done', done: true, when: L(2026, 10, 10, 16).toISOString() }, { id: 'c', note: 'ancient', when: L(2026, 10, 1).toISOString() }, { id: 'd', note: 'No lead', when: L(2026, 10, 11, 9).toISOString() }, { id: 'e', note: 'too far', when: L(2027, 3, 1).toISOString() }];
  const s = PC.buildSchedule({ now: NOW, leads: [], reminders: rem, settings: { push: { morning: false, batches: false } } });
  assert.deepEqual(s.map(i => i.id), ['r:a', 'r:d']); assert.equal(s[0].title, '⏰ Call Jane about the lease'); assert.equal(s[0].body, 'Acme Ltd · Jane Doe'); assert.equal(s[0].url, '/?lead=L1&tab=overview'); assert.equal(s[1].url, '/?go=tasks'); assert.equal(s[1].body, 'Follow-up due');
  assert.equal(PC.buildSchedule({ now: NOW, leads: [], reminders: rem, settings: { push: { tasks: false, morning: false, batches: false } } }).length, 0);
});

test('schedule: a morning summary for each day with work, counting emails, messages, tasks and replies', () => {
  const due = running({ company: 'Overdue Co' }, null, NOW);                           // first email due now (today)
  const tomorrow = running({ company: 'Tomorrow Co' }, 1, NOW);                        // sent yesterday, next one due tomorrow (2 day gap)
  const dm = lead({ brand: 'clearpath', company: 'Tom', contacts: [{ name: 'Tom', title: 'creator', social: 'https://youtube.com/@t' }] }); const meta = YS.sequenceMeta(dm, dm.contacts[0]); YO.startSequence(dm, 0, NOW, meta.type, meta);   // first step is a comment, due today
  const replied = lead({ stage: 'Replied' });
  const rem = [{ id: 't', note: 'Call', when: L(2026, 10, 10, 15).toISOString() }, { id: 'u', note: 'Later', when: L(2026, 10, 12, 10).toISOString() }];
  const s = PC.buildSchedule({ now: NOW, leads: [due, tomorrow, dm, replied], reminders: rem, settings: { push: { tasks: false, batches: false } } });
  const m = Object.fromEntries(s.map(i => [i.id, i]));
  assert.equal(m['m:2026-11-10'].title, 'Good morning. 4 to do today'); assert.equal(m['m:2026-11-10'].body, '📬 1 email · 💬 1 message · ✅ 1 task · ↩ 1 reply waiting'); assert.equal(m['m:2026-11-10'].url, '/?go=queue');
  assert.equal(new Date(m['m:2026-11-10'].at).getHours(), 8); assert.equal(new Date(m['m:2026-11-10'].at).getMinutes(), 30);
  assert.equal(m['m:2026-11-11'].body, '📬 1 email'); assert.equal(m['m:2026-11-12'].body, '✅ 1 task'); assert.equal(m['m:2026-11-13'], undefined, 'nothing is due that day');
  const late = PC.buildSchedule({ now: L(2026, 10, 10, 9, 0), leads: [due], reminders: [], settings: { push: { tasks: false, batches: false } } });
  assert.equal(late.find(i => i.id === 'm:2026-11-10'), undefined, 'today\'s summary is skipped once 08:30 has passed'); assert.ok(late.length === 0 || late.every(i => i.id !== 'm:2026-11-10'));
  assert.equal(PC.buildSchedule({ now: NOW, leads: [due], reminders: [], settings: { push: { tasks: false, morning: false, batches: false } } }).length, 0);
  const custom = PC.buildSchedule({ now: NOW, leads: [due], reminders: [], settings: { push: { tasks: false, batches: false, morningTime: '07:15' } } }); assert.equal(new Date(custom[0].at).getMinutes(), 15);
});

test('schedule: batch reminders follow the daily plan, only where there are emails to send', () => {
  const people = Array.from({ length: 30 }, (_, i) => { const l = running({ company: 'Co' + i, contacts: [{ name: 'P' + i, title: 'CFO', email: `p${i}@co${i}.com` }] }, null, NOW); return l; });
  const settings = { plan: { mailboxes: ['a@x.com', 'b@y.com'], skipRamp: true }, push: { tasks: false, morning: false } };
  const s = PC.buildSchedule({ now: NOW, leads: people, reminders: [], activities: [], settings });
  const today = s.filter(i => i.id.startsWith('b:2026-11-10')); assert.equal(today.length, 2, '30 ready emails fill two batches of 15, so only two reminders');
  assert.deepEqual(today.map(i => i.title), ['📬 Batch 1 of 4: send 15', '📬 Batch 2 of 4: send 15']);
  assert.equal(today[0].url, '/?go=send'); assert.equal(new Date(today[1].at).getHours(), 11); assert.equal(new Date(today[1].at).getMinutes(), 30);
  const few = PC.buildSchedule({ now: NOW, leads: people.slice(0, 5), reminders: [], activities: [], settings });
  assert.deepEqual(few.filter(i => i.id.startsWith('b:2026-11-10')).map(i => i.title), ['📬 Batch 1 of 4: send 5'], 'never promise more than is ready');
  assert.equal(PC.buildSchedule({ now: NOW, leads: [], reminders: [], settings }).length, 0, 'no work, no reminders');
  const mid = PC.buildSchedule({ now: L(2026, 10, 10, 12, 0), leads: people, reminders: [], activities: [], settings });
  assert.ok(mid.filter(i => i.id.startsWith('b:2026-11-10')).every(i => new Date(i.at) > L(2026, 10, 10, 12, 0)), 'times that have passed are not scheduled');
  assert.equal(PC.buildSchedule({ now: NOW, leads: people, reminders: [], activities: [], settings: Object.assign({}, settings, { push: { tasks: false, morning: false, batches: false } }) }).length, 0);
});

test('schedule: everything it makes passes the server\'s own checks', () => {
  const people = Array.from({ length: 12 }, (_, i) => running({ company: 'Co' + i }, i % 2 ? 1 : null, NOW));
  const rem = Array.from({ length: 30 }, (_, i) => ({ id: 'id' + i, note: 'Do thing ' + i, company: 'C', leadId: 'L' + i, when: new Date(NOW.getTime() + (i + 1) * 3600000).toISOString() }));
  const items = PC.buildSchedule({ now: NOW, leads: people, reminders: rem, activities: [], settings: { plan: { skipRamp: true, mailboxes: ['a@x.com', 'b@y.com'] }, push: { on: true } } });
  assert.ok(items.length > 30 && items.length <= 380);
  const cleaned = lib.cleanItems(items, NOW.getTime()); assert.equal(cleaned.length, items.length, 'the server accepts every item the app builds');
  assert.equal(new Set(items.map(i => i.id)).size, items.length, 'ids are unique');
  for (const i of items) { assert.ok(i.title.length <= 90 && i.body.length <= 200); assert.match(i.url, /^\//); }
});

test('opening from a notification goes to the right place', () => {
  assert.deepEqual(PC.route('?lead=abc&tab=emails'), { type: 'lead', id: 'abc', tab: 'emails' }); assert.deepEqual(PC.route('?lead=abc&tab=hack'), { type: 'lead', id: 'abc', tab: 'overview' });
  assert.deepEqual(PC.route('?go=tasks'), { type: 'tab', tab: 'tasks' }); assert.deepEqual(PC.route('?go=queue'), { type: 'tab', tab: 'outreach' }); assert.deepEqual(PC.route('?go=send'), { type: 'send' });
  assert.equal(PC.route(''), null); assert.equal(PC.route('?go=evil'), null);
});

test('device check: iPhone needs the Home Screen app, blocked and unsupported are explained', () => {
  const iph = { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', hasSW: true, hasPush: false, hasNotification: false, standalone: false };
  assert.equal(PC.platform(iph).need, 'install'); assert.equal(PC.platform(iph).label, 'iPhone / iPad');
  assert.equal(PC.platform(Object.assign({}, iph, { standalone: true, hasPush: true, hasNotification: true, permission: 'default' })).need, null);
  assert.equal(PC.platform(Object.assign({}, iph, { standalone: true, hasPush: true, hasNotification: true, permission: 'denied' })).need, 'blocked');
  assert.equal(PC.platform({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/120', hasSW: true, hasPush: true, hasNotification: true, permission: 'default' }).need, null);
  assert.equal(PC.platform({ ua: 'Mozilla/5.0 (Linux; Android 14)', hasSW: false, hasPush: false, hasNotification: false }).need, 'unsupported');
  assert.equal(PC.platform({ ua: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5, hasSW: true, hasPush: false, hasNotification: false, standalone: false }).ios, true, 'iPad pretending to be a Mac');
  assert.deepEqual([...PC.urlBase64ToBytes('AQID')], [1, 2, 3]);
});

test('schedule: a follow-up prompt fires the moment each next email is due, grouped by hour, and never doubles up a batch reminder', () => {
  const sentAt = L(2026, 10, 9, 14, 7);                                              // "I sent it" yesterday at 14:07
  const mk = (company, name) => { const l = lead({ company, contacts: [{ name, title: 'CFO', email: name.split(' ')[0].toLowerCase() + '@x.com' }] }); const meta = YS.sequenceMeta(l, l.contacts[0]); YO.startSequence(l, 0, new Date(sentAt - DAYMS), meta.type, meta); YO.markSent(l, 0, 0, sentAt); return l; };
  const a = mk('Zed Logistics', 'Ada Obi'), b = mk('Idle Corp', 'Ife Bello');
  const off = { push: { tasks: false, morning: false, batches: false } };
  const s = PC.buildSchedule({ now: NOW, leads: [a], reminders: [], settings: off }).filter(i => i.id[0] === 'f');
  assert.equal(s.length, 1); const due = YO.dueDate(YO.seqState(a, 0));
  assert.equal(s[0].at, due.toISOString(), 'at the exact day and time the next step is due'); assert.match(s[0].title, /Follow-up due: Ada Obi \(Zed Logistics\)/); assert.match(s[0].body, /^Email 2 · Ada Obi/);
  assert.equal(s[0].url, '/?lead=' + a.id + '&tab=emails');
  const two = PC.buildSchedule({ now: NOW, leads: [a, b], reminders: [], settings: off }).filter(i => i.id[0] === 'f');
  assert.equal(two.length, 1, 'same hour, one notification'); assert.match(two[0].title, /2 follow-ups due now/); assert.match(two[0].body, /Ada Obi.*Ife Bello/); assert.equal(two[0].url, '/?go=queue');
  assert.equal(PC.buildSchedule({ now: NOW, leads: [a], reminders: [], settings: { push: Object.assign({}, off.push, { followups: false }) } }).filter(i => i.id[0] === 'f').length, 0, 'can be switched off');
  const dueH = due.getHours(), nearBatch = { push: { tasks: false, morning: false, batches: true } };
  const withBatch = PC.buildSchedule({ now: NOW, leads: [a], reminders: [], settings: Object.assign({ plan: { times: [pad2(dueH) + ':' + pad2(due.getMinutes() + 10 > 59 ? 59 : due.getMinutes() + 10), '09:00', '11:00', '16:00'] } }, nearBatch) });
  assert.ok(withBatch.filter(i => i.id[0] === 'f').length <= 1);
});
const pad2 = n => String(n).padStart(2, '0');
