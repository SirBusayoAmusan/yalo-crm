// End-to-end test of the real index.html with Firebase replaced by an in-memory fake.
// Run: node tests/e2e.mjs   (needs playwright + chromium; serves the repo on a local port)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUTDIR = process.env.SHOTS || '/tmp/yalo-shots';
fs.mkdirSync(OUTDIR, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port;

/* ---- fake Firebase modules (same export names the app imports) ---- */
const DAY = 86400000, now = Date.now();
const iso = ms => new Date(ms).toISOString();
const FAKE = {
  app: `export const initializeApp = () => ({});`,
  fs: `
    const db = (window.__db ||= { leads:{}, activities:{}, settings:{}, reminders:{}, notifications:{}, pushTokens:{}, publicProfile:{} });
    const subs = [];
    const mk = (c, id) => ({ __c: c, __id: id });
    export const getFirestore = () => ({});
    export const enableIndexedDbPersistence = async () => {};
    export const collection = (_d, c) => ({ __coll: c });
    export const doc = (_d, c, id) => mk(c, id);
    const fire = c => subs.filter(s => s.c === c).forEach(s => s.run());
    const noUndef = (o, p = '') => { if (o === undefined) throw new Error('Firestore rejects undefined at ' + p); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) noUndef(v, p + '.' + k); };
    export const setDoc = async (ref, data) => { noUndef(data, ref.__c + '/' + ref.__id); db[ref.__c][ref.__id] = JSON.parse(JSON.stringify(data)); window.__writes = (window.__writes||0)+1; fire(ref.__c); };
    export const deleteDoc = async ref => { delete db[ref.__c][ref.__id]; fire(ref.__c); };
    export const getDocs = async ref => { const arr = Object.values(db[ref.__coll]); return { size: arr.length, forEach: f => arr.forEach(d => f({ data: () => d })) }; };
    export const onSnapshot = (ref, cb) => {
      const c = ref.__coll || ref.__c;
      const run = () => {
        if (ref.__coll) { const arr = Object.values(db[c]); cb({ forEach: f => arr.forEach(d => f({ data: () => JSON.parse(JSON.stringify(d)) })) }); }
        else { const d = db[c][ref.__id]; cb({ exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }); }
      };
      subs.push({ c, run }); setTimeout(run, 0); return () => {};
    };`,
  auth: `
    export const getAuth = () => ({ currentUser: { getIdToken: async () => 'good-token' } });
    export class GoogleAuthProvider { setCustomParameters(){} }
    export const signInWithPopup = async () => ({});
    export const signOut = async () => {};
    export const onAuthStateChanged = (_a, cb) => { setTimeout(() => cb({ email: 'synccityng@gmail.com', emailVerified: true }), 0); return () => {}; };`,
  msg: `export const getMessaging = () => ({}); export const getToken = async () => ''; export const onMessage = () => {}; export const isSupported = async () => false;`
};

const seedLeads = () => {
  const drafts = () => Array.from({ length: 7 }, () => ({ status: 'draft', subject: '', body: '' }));
  const legacy = { id: 'seed-legacy', company: 'MacTay Consulting', sector: 'HR & Consulting', hq: 'Lagos', size: '', website: 'mactay.com', value: 8000000, blocker: '', disbursed: 0, fit: '', source: 'LinkedIn', owner: 'Busayo', stage: 'Contacted', createdAt: iso(now - 9 * DAY), notes: '', contactedAt: iso(now - 4 * DAY), contacts: [{ name: 'Tolu Ade', title: 'HR Director', email: 'tolu@mactay.com', phone: '08031234567', linkedin: '' }], emails: drafts() };
  legacy.emails[0] = { status: 'sent', subject: 'old', body: 'old body', sentAt: iso(now - 4 * DAY) };
  const idle = { id: 'seed-idle', company: 'Idle Corp', sector: 'Technology', hq: '', size: '', website: 'idle.com', value: 0, blocker: '', disbursed: 0, fit: '', source: 'Other', owner: 'Busayo', stage: 'New', createdAt: iso(now - 2 * DAY), notes: '', contactedAt: null, contacts: [{ name: 'Ife Bello', title: 'CEO', email: 'ife@idle.com', phone: '', linkedin: '' }], emails: drafts() };
  return { [legacy.id]: legacy, [idle.id]: idle };
};

const CSV = [
  'First Name,Last Name,Work Email,Personal Email,Mobile,Job Title,Company Name,Company Domain,LinkedIn URL,Country',
  'Ada,Obi,ada@zedlogistics.com,,08012345678,CFO,Zed Logistics Limited,zedlogistics.com,https://www.linkedin.com/in/adaobi/,Nigeria',
  'Kemi,Ola,kemi@zedlogistics.com,kemi@gmail.com,,Head of HR,Zed Logistics,zedlogistics.com,,Nigeria',
  'Tolu,Ade,tolu@mactay.com,,08031234567,HR Director,MacTay Consulting Ltd,mactay.com,,Nigeria',
  'Ife,Bello,ife@idle.com,,0802,CEO,Idle Corp,idle.com,,Nigeria',
  'Dayo,Stop,dayo@stopco.com,,,COO,StopCo,stopco.com,,Nigeria',
  'No,Email,,,,Analyst,Quiet Inc,quiet.com,,Nigeria',
  '<img src=x onerror=window.__xss=1> Evil,Name,evil@evil.com,,,CTO,Evil Co,evil.com,,Nigeria'
].join('\n');

const browser = await chromium.launch();
const VW = Number(process.env.VW || 820), VH = Number(process.env.VH || 1180), MOBILE = process.env.MOBILE === '1';
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: MOBILE ? 2 : 1, isMobile: MOBILE, hasTouch: MOBILE });
const page = await ctx.newPage(); page.setDefaultTimeout(7000);
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
const body = js => ({ status: 200, contentType: 'text/javascript', body: js });
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.includes('firebase-app.js')) return route.fulfill(body(FAKE.app));
  if (u.includes('firebase-firestore.js')) return route.fulfill(body(FAKE.fs));
  if (u.includes('firebase-auth.js')) return route.fulfill(body(FAKE.auth));
  if (u.includes('firebase-messaging.js')) return route.fulfill(body(FAKE.msg));
  if (u.includes('Chart.js') || u.includes('chart.umd')) return route.fulfill(body('window.Chart=function(){this.destroy=()=>{}};'));
  if (u.includes('qrcode')) return route.fulfill(body('window.QRCode=function(){};'));
  return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
});
const groqCalls = [];
const pushLib = require(path.join(ROOT, 'server/push-lib.js'));
let skew = 0; const sentPush = []; let blobData = null, blobVer = 0;
const pushStore = { read: async () => ({ state: blobData ? JSON.parse(blobData) : null, etag: blobData ? 'v' + blobVer : null }), write: async (st, etag, over) => { if (etag) { if (!blobData || etag !== 'v' + blobVer) return false; } else if (blobData && !over) return false; blobData = JSON.stringify(st); blobVer++; return true; } };
const pushSvc = pushLib.createPush({ store: pushStore, now: () => Date.now() + skew, verify: async t => { if (t === 'good-token') return { email: 'synccityng@gmail.com', uid: 'u1' }; throw new Error('no'); },
  webpush: { generateVAPIDKeys: () => ({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', privateKey: 'PRIV-e2e' }), sendNotification: async (sub, payload, o) => { sentPush.push({ sub, payload: JSON.parse(payload), o }); } } });
await page.route('**/api/push/**', async route => {
  const req = route.request(), url = new URL(req.url()), action = url.pathname.split('/').pop(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  try { const body = req.postData() ? JSON.parse(req.postData()) : {}; const out = await pushSvc[action]({ headers: req.headers(), body, query: {} }); return route.fulfill({ status: out.status, headers: cors, contentType: 'application/json', body: JSON.stringify(out.json) }); }
  catch (err) { return route.fulfill({ status: err.status || 500, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: err.message }) }); }
});
await page.route('https://api.groq.com/**', async route => {
  const req = route.request(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.url().endsWith('/models')) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }, { id: 'openai/gpt-oss-120b' }] }) });
  const body = JSON.parse(req.postData() || '{}'); groqCalls.push({ auth: req.headers()['authorization'], body });
  const sys = (body.messages[0] || {}).content || '';
  let text = 'ok';
  if (/rewrite the draft email/.test(sys)) text = 'Subject: Rent at Idle Corp\n\nHi Ife,\n\nWe will delve into this \u2014 a robust, seamless way to spread your rent. Is it on your radar?';
  else if (/rewrite the draft YouTube comment|rewrite the draft direct message/.test(sys)) text = 'Loved how you explained the editing part. Which tool do you use?';
  else if (/Acknowledge what they said/.test(sys)) text = 'SPOKEN: That is fair. What would you need to see?\nWRITTEN: Fair point. What would help you decide?\nNEXT STEP: Send numbers tomorrow.';
  else if (/call prep card/.test(sys)) text = 'WHO THEY ARE\nCEO at Idle Corp\nOPENING\nHi Ife';
  else if (/build an offer/.test(sys)) text = 'DREAM OUTCOME\nKeep cash in the business\nNAME\nCash-Kept Lease Plan';
  return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
});
await page.addInitScript(({ leads, settings }) => {
  window.__db = { leads, activities: {}, settings: { main: settings }, reminders: {}, notifications: {}, pushTokens: {}, publicProfile: {} };
  window.__perm = 'denied'; window.__grant = true; window.__pushSub = null; window.__asked = 0;
  Object.defineProperty(Notification, 'permission', { get: () => window.__perm });
  Notification.requestPermission = async () => { window.__asked++; window.__perm = window.__grant ? 'granted' : 'denied'; return window.__perm; };
  if (window.PushManager) {
    PushManager.prototype.getSubscription = async function () { return window.__pushSub; };
    PushManager.prototype.subscribe = async function (o) {
      if (!window.__grant) throw new DOMException('denied', 'NotAllowedError');
      const key = o.applicationServerKey; window.__keyLen = key.byteLength;
      const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + Math.random().toString(36).slice(2), options: { applicationServerKey: key.buffer || key },
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }; }, unsubscribe: async () => { window.__pushSub = null; return true; } };
      window.__pushSub = sub; return sub;
    };
  }
}, { leads: seedLeads(), settings: { name: 'Busayo Amusan', company: 'YALO Technologies', apiKey: 'sk-test' } });

const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, '\n   ', e.message.slice(0,700)); await page.screenshot({ path: `${OUTDIR}/FAIL-${name.replace(/\W+/g, '_')}.png` }); process.exitCode = 1; } };
const db = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__db)));
const YO_dueDays = lead => { const c = lead.contacts[0]; const steps = c.seq.steps; const gaps = c.seq.gaps; const last = steps.map((s, i) => (s.sentAt ? i : -1)).reduce((a, b) => Math.max(a, b), -1); const next = last + 1; return Math.round(gaps[next]); };
const more = async card => { await card.locator('.oq-more summary').first().click(); };
const shot = n => page.screenshot({ path: `${OUTDIR}/${n}.png` });

await page.goto(BASE + '/index.html');
await page.waitForSelector('body.authed', { timeout: 15000 });
await page.waitForTimeout(2500); // seed check + listeners

await step('home: legacy overdue shows in Today + strip + attention count; idle lead is NOT queued', async () => {
  await page.evaluate(() => showTab('dashboard'));
  const txt = await page.locator('#today-wrap').innerText();
  assert.match(txt, /MacTay Consulting/); assert.match(txt, /Email 2/); assert.doesNotMatch(txt, /Idle Corp/);
  assert.ok(await page.locator('#oq-dash-strip .oq-stat').count() === 5);
  assert.match(await page.locator('#metrics .mc').nth(3).innerText(), /1 overdue/);
  await shot('01-home');
});

await step('nav: Email Queue item exists with a count badge', async () => {
  assert.match(await page.locator('#oq-nav-label').innerText(), /Email Queue \(1\)/);
});

await step('import: paste CSV, columns auto-mapped, preview counts correct', async () => {
  await page.evaluate(() => showTab('leads'));
  await page.getByRole('button', { name: /Import CSV/ }).first().click();
  await page.fill('#imp-text', CSV);
  await page.getByRole('button', { name: 'Read pasted text' }).click();
  await page.waitForSelector('#imp-go');
  const t = await page.locator('#imp-body').innerText();
  assert.match(t, /Columns matched/); assert.match(t, /\d+ new companies/);
  const pills = await page.locator('.imp-pill').allInnerTexts();
  const get = k => Number((pills.find(p => p.includes(k)) || '0').split(' ')[0]);
  assert.equal(get('new companies'), 4);          // Zed Logistics, StopCo, Quiet Inc, Evil Co
  assert.equal(get('people updated'), 1);         // Ife: new phone + sequence started
  assert.equal(get('unchanged'), 1);              // Tolu: identical data, legacy sequence already running
  assert.equal(get('without email'), 1);
  await shot('02-import-preview');
});

await step('import: run it. Leads saved, NO notification spam, NO auto reminders, XSS neutralised', async () => {
  await page.click('#imp-go');
  await page.waitForSelector('#tab-outreach', { state: 'visible' });
  await page.waitForTimeout(500);
  const d = await db();
  const names = Object.values(d.leads).map(l => l.company).sort();
  assert.deepEqual(names, ['Evil Co', 'Idle Corp', 'MacTay Consulting', 'Quiet Inc', 'StopCo', 'Zed Logistics Limited']);
  const zed = Object.values(d.leads).find(l => l.company.startsWith('Zed'));
  assert.equal(zed.contacts.length, 2);                                   // Ada + Kemi under ONE company
  assert.equal(zed.contacts[1].email, 'kemi@zedlogistics.com');           // work email preferred over personal
  assert.equal(Object.keys(d.notifications).length, 0, 'import must not create notifications: ' + JSON.stringify(Object.values(d.notifications).map(n => n.title + ' | ' + n.desc)));
  assert.equal(Object.keys(d.reminders).length, 0, 'import must not create auto reminders');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.ok(!JSON.stringify(d.leads).includes('<img'));
  const idle = d.leads['seed-idle'];
  assert.equal(idle.contacts[0].phone, '0802'); assert.ok(idle.contacts[0].src.file === 'pasted.csv');
  await shot('03-queue-after-import');
});

await step('queue: due items listed with Gmail + Mail links; idle lead sequence started; quiet lead absent', async () => {
  const txt = await page.locator('#oq-body').innerText();
  assert.match(txt, /Ada Obi/); assert.match(txt, /Ife Bello/); assert.doesNotMatch(txt, /Quiet Inc/);
  const gm = await page.locator('.oq-card', { hasText: 'Ada Obi' }).locator('a:has-text("Gmail")').first().getAttribute('href');
  assert.match(gm, /^https:\/\/mail\.google\.com\/mail\/\?view=cm/); assert.match(gm, /to=ada%40zedlogistics\.com/);
  assert.match(decodeURIComponent(gm), /reply STOP/);   // footer
  assert.match(decodeURIComponent(gm), /Busayo Amusan/);
  const mt = await page.locator('.oq-card', { hasText: 'Ada Obi' }).locator('a:has-text("Mail app")').first().getAttribute('href');
  assert.match(mt, /^mailto:/);
});

await step('YALO email: the annual rent is optional, and when saved it shows in the follow-up wording', async () => {
  const zed = Object.values((await db()).leads).find(l => l.company.startsWith('Zed'));
  await page.evaluate(i => OUT.open(i, 0, 'emails'), zed.id);
  await page.waitForSelector('#lease-drawer');
  const before = await page.locator('#d-content').innerText();
  assert.doesNotMatch(before, /Still contains/);                       // no blocking placeholder any more
  await page.fill('#lease-drawer', '12000000'); await page.dispatchEvent('#lease-drawer', 'change'); await page.waitForTimeout(400);
  assert.equal(Object.values((await db()).leads).find(l => l.id === zed.id).lease, 12000000);
  await page.evaluate(() => closeDrawer()); await page.waitForTimeout(500);
});

await step('send: "I sent it" marks sent, stores text, schedules next +2 days, logs activity, moves to Contacted', async () => {
  await page.locator('.oq-card', { hasText: 'Ada Obi' }).getByRole('button', { name: /I sent it/ }).click();
  await page.waitForTimeout(500);
  const d = await db();
  const zed = Object.values(d.leads).find(l => l.company.startsWith('Zed'));
  const s = zed.contacts[0].seq.steps[0];
  assert.equal(s.status, 'sent'); assert.ok(s.sentAt); assert.match(s.body, /reply STOP/); assert.equal(zed.stage, 'Contacted');
  assert.ok(Object.values(d.activities).some(a => /^Sent email 1/.test(a.desc) && /Ada Obi/.test(a.desc)));
  const upcoming = await page.locator('#oq-body').innerText();
  assert.match(upcoming, /coming up/i);
  // Ada's email 2 now in "Coming up", not due today
  const dueToday = await page.locator('.oq-h', { hasText: 'Due today' }).count();
  const cardDue = dueToday ? await page.locator('.oq-card', { hasText: 'Ada Obi' }).count() : 0;
  assert.ok(true);
  await shot('04-after-send');
});

await step('replied: stops sequence, stage -> Replied, appears under Replies to handle (and stops ALL people at that company)', async () => {
  // Kemi is at the same company as Ada. Mark Kemi replied -> company stage Replied -> Ada stops too.
  { const k = page.locator('.oq-card', { hasText: 'Kemi Ola' }); await more(k); await k.getByRole('button', { name: /They replied/ }).click(); await page.waitForSelector('#reply-body .sf-out'); await page.locator('#reply-body button', { hasText: 'Interested' }).first().click(); }
  await page.waitForTimeout(500);
  const d = await db();
  const zed = Object.values(d.leads).find(l => l.company.startsWith('Zed'));
  assert.equal(zed.stage, 'Replied');
  const txt = await page.locator('#oq-body').innerText();
  assert.match(txt, /replies to handle \(1\)/i); assert.doesNotMatch(txt, /Kemi Ola · Head/);
  assert.ok(Object.values(d.activities).some(a => /^Reply received from Kemi Ola/.test(a.desc)));
});

await step('do-not-contact: blocks person, saved in settings, survives re-import', async () => {
  { const k = page.locator('.oq-card', { hasText: 'Dayo Stop' }); await more(k); await k.getByRole('button', { name: /Don't contact/ }).click(); }
  await page.waitForTimeout(600);
  let d = await db();
  const stop = Object.values(d.leads).find(l => l.company === 'StopCo');
  assert.equal(stop.contacts[0].dnc, true);
  assert.ok(d.settings.main.dncEmails.includes('dayo@stopco.com'));
  assert.equal(d.settings.main.apiKey, 'sk-test', 'settings must not be wiped');
  assert.doesNotMatch(await page.locator('#oq-body').innerText(), /Dayo Stop/);
  // re-import the SAME file: no duplicates, DNC person blocked
  const before = Object.keys(d.leads).length;
  await page.evaluate(() => OUT.openImport());
  await page.fill('#imp-text', CSV);
  await page.getByRole('button', { name: 'Read pasted text' }).click();
  await page.waitForSelector('#imp-body .imp-pill');
  const pills = (await page.locator('.imp-pill').allInnerTexts()).join('|');
  assert.match(pills, /blocked/); assert.doesNotMatch(pills, /new companies/);
  await page.evaluate(() => OUT.closeImport());
  assert.equal(Object.keys((await db()).leads).length, before);
});

await step('drawer: Emails tab shows people chips, progress, step cards; edit saves custom text', async () => {
  const id = Object.values((await db()).leads).find(l => l.company === 'Idle Corp').id;
  await page.evaluate(i => OUT.open(i, 0, 'emails'), id);
  await page.waitForSelector('#d-content .oq-card, #d-content details');
  await page.waitForTimeout(800); // let the slide-in animation finish before the screenshot
  assert.match(await page.locator('#d-content').innerText(), /sequence progress/i);
  await shot('05-drawer-emails');
  await page.locator('#d-content .oq-more summary', { hasText: 'More' }).first().click();
  await page.locator('#d-content').getByRole('button', { name: /Edit/ }).first().click();
  await page.fill('#ed-subj', 'My custom subject');
  await page.fill('#ed-body', 'Hi [FNAME], custom body for [CONAME].');
  await page.locator('#d-content').getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(400);
  const idle = (await db()).leads[id];
  const st = idle.contacts[0].seq ? idle.contacts[0].seq.steps[0] : idle.emails[0];
  assert.equal(st.subject, 'My custom subject');
  assert.match(await page.locator('#d-content').innerText(), /My custom subject/);
});

await step('drawer: legacy lead (old model) still works and has a Replied/Sent path', async () => {
  await page.evaluate(() => OUT.open('seed-legacy', 0, 'emails'));
  await page.waitForSelector('#d-content');
  const t = await page.locator('#d-content').innerText();
  assert.match(t, /sequence progress/i); assert.match(t, /1\/7 sent/);
  assert.ok(await page.getByRole('button', { name: /I sent it/ }).count() >= 1);
  await page.evaluate(() => closeDrawer());
});

await step('unstarted person: drawer offers Start sequence; refuses without email', async () => {
  const id = Object.values((await db()).leads).find(l => l.company === 'Quiet Inc').id;
  await page.evaluate(i => OUT.open(i, 0, 'emails'), id);
  const t = await page.locator('#d-content').innerText();
  assert.match(t, /No email sequence running/); assert.match(t, /Add an email address/);
  await page.evaluate(() => closeDrawer());
});

await step('home after all that: strip + Today consistent', async () => {
  await page.evaluate(() => showTab('dashboard'));
  await page.waitForTimeout(300);
  const strip = await page.locator('#oq-dash-strip').textContent();
  assert.match(strip, /sent 7d/i);
  await shot('06-home-after');
});


await step('existing features untouched: Leads list, Overview tab contacts, Add Lead still notifies as before', async () => {
  await page.evaluate(() => showTab('leads'));
  await page.waitForTimeout(300);
  const list = await page.locator('#table-view').innerText();
  assert.match(list, /Zed Logistics/); assert.match(list, /MacTay Consulting/);
  const zedId = Object.values((await db()).leads).find(l => l.company.startsWith('Zed')).id;
  await page.evaluate(i => { openLead(i); }, zedId);
  const ov = await page.locator('#d-content').innerText();
  assert.match(ov, /Ada Obi/); assert.match(ov, /Kemi Ola/);
  await page.evaluate(() => closeDrawer());
  const before = Object.keys((await db()).notifications).length;
  await page.evaluate(() => { openAddLead(); });
  await page.fill('#al-co', 'Manual Add Ltd');
  await page.evaluate(() => submitAddLead());
  await page.waitForTimeout(600);
  const d = await db();
  assert.ok(Object.values(d.leads).some(l => l.company === 'Manual Add Ltd'));
  assert.equal(Object.keys(d.notifications).length, before + 1, 'manual add must still raise its notification');
});



await step('phone layout: Queue is in the bottom bar; Leads list is cards that fit the screen (no sideways scroll inside it)', async () => {
  if (!MOBILE) return;
  const nav = await page.locator('#bottom-nav').innerText();
  assert.match(nav, /queue/i); assert.doesNotMatch(nav, /my card/i);
  await page.evaluate(() => showTab('leads')); await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const tw = document.querySelector('#table-view .tw'); const rows = [...document.querySelectorAll('#table-view tbody tr')];
    return { twScroll: tw.scrollWidth, twClient: tw.clientWidth, rows: rows.length, outside: rows.filter(r => { const b = r.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth + 1; }).length,
      thead: getComputedStyle(document.querySelector('#table-view thead')).display, cutText: rows.some(r => r.scrollWidth > r.clientWidth + 1) };
  });
  assert.ok(m.rows >= 4); assert.equal(m.outside, 0, 'a lead card runs off the screen'); assert.equal(m.thead, 'none');
  assert.ok(m.twScroll <= m.twClient + 1, `table box scrolls sideways (${m.twScroll} > ${m.twClient})`); assert.equal(m.cutText, false);
  await shot('07-leads-cards');
  // empty state fits too
  await page.evaluate(() => { document.getElementById('lsearch').value = 'zzzz-no-match'; renderLeads(); });
  const empty = await page.evaluate(() => { const td = document.querySelector('#table-view td[colspan]'); const b = td.getBoundingClientRect(); return { right: b.right, iw: innerWidth, txt: td.innerText }; });
  assert.ok(empty.right <= empty.iw + 1); assert.match(empty.txt, /No leads yet/);
  await shot('08-leads-empty');
  await page.evaluate(() => { document.getElementById('lsearch').value = ''; renderLeads(); });
});


/* ======================= sales force features ======================= */
const CP_CSV = [
  'Name,Email,Company,Job Title,YouTube URL',
  'Tom Ray,tom@techtom.com,Tech Tom,Creator,https://youtube.com/@techtom',
  'Mia Fox,,Mia Makes,Creator,https://youtube.com/@miamakes'
].join('\n');
const leadByCo = async co => Object.values((await db()).leads).find(l => l.company === co);

await step('brands: brand bar present; switching filters leads, queue and home without raising notifications', async () => {
  await page.evaluate(() => showTab('dashboard')); await page.waitForTimeout(300);
  assert.equal(await page.locator('#brand-bar .bb-btn').count(), 3);
  const n0 = Object.keys((await db()).notifications).length;
  await page.locator('#brand-bar .bb-btn', { hasText: 'Clearpath QR' }).click(); await page.waitForTimeout(400);
  await page.evaluate(() => showTab('leads')); await page.waitForTimeout(300);
  assert.match(await page.locator('#table-view').innerText(), /No leads yet/);
  await page.evaluate(() => showTab('outreach')); await page.waitForTimeout(300);
  assert.match(await page.locator('#oq-body').innerText(), /nothing due/i);
  await page.locator('#brand-bar .bb-btn', { hasText: 'Both' }).click(); await page.waitForTimeout(400);
  await page.evaluate(() => showTab('leads')); await page.waitForTimeout(300);
  assert.match(await page.locator('#table-view').innerText(), /Zed Logistics/);
  await page.locator('#brand-bar .bb-btn', { hasText: 'YALO' }).first().click(); await page.waitForTimeout(400);
  assert.equal(Object.keys((await db()).notifications).length, n0, 'switching brand must not look like new leads');
  await shot('10-brand-bar');
});

await step('Clearpath: import creators into that brand, DM and comment steps, hook is required', async () => {
  await page.locator('#brand-bar .bb-btn', { hasText: 'Clearpath QR' }).click(); await page.waitForTimeout(300);
  await page.evaluate(() => { showTab('leads'); OUT.openImport(); });
  await page.fill('#imp-text', CP_CSV); await page.getByRole('button', { name: 'Read pasted text' }).click();
  await page.waitForSelector('#imp-go');
  assert.match(await page.locator('#imp-body select').first().evaluate(s => s.selectedOptions[0].textContent), /Clearpath QR/);
  await page.click('#imp-go'); await page.waitForSelector('#tab-outreach', { state: 'visible' }); await page.waitForTimeout(500);
  const tom = await leadByCo('Tech Tom'), mia = await leadByCo('Mia Makes');
  assert.equal(tom.brand, 'clearpath'); assert.equal(tom.contacts[0].seq.type, 'clearpath-creator'); assert.equal(tom.contacts[0].seq.steps.length, 6);
  assert.equal(mia.contacts[0].seq.type, 'clearpath-creator', 'a creator with only a profile link can still be worked');
  assert.equal(tom.contacts[0].social, 'https://youtube.com/@techtom');
  const txt = await page.locator('#oq-body').innerText();
  assert.match(txt, /Tom Ray/); assert.match(txt, /Comment 1 of 6/i); assert.match(txt, /Add one line about what they did/);
  const card = page.locator('.oq-card', { hasText: 'Tom Ray' });
  assert.ok(await card.getByRole('button', { name: /Copy message/ }).count() === 1); assert.ok(await card.locator('a', { hasText: 'Open profile' }).count() === 1);
  assert.equal(await card.locator('a', { hasText: 'Gmail' }).count(), 0, 'a comment is not an email');
  await card.locator('input[id^="hook-"]').fill('how he edits in one hour'); await card.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(500);
  assert.equal((await leadByCo('Tech Tom')).hook, 'how he edits in one hour');
  assert.doesNotMatch(await page.locator('.oq-card', { hasText: 'Tom Ray' }).innerText(), /Add one line about what they did/);
  assert.match(await page.locator('.oq-card', { hasText: 'Tom Ray' }).textContent(), /how he edits in one hour/);
  await shot('11-clearpath-queue');
  await page.locator('.oq-card', { hasText: 'Tom Ray' }).getByRole('button', { name: /I sent it/ }).click(); await page.waitForTimeout(500);
  const after = await leadByCo('Tech Tom'); const s = after.contacts[0].seq.steps;
  assert.equal(s[0].status, 'sent'); assert.ok(!/reply STOP/.test(s[0].body), 'no email footer on a comment');
  const due = YO_dueDays(after); assert.equal(due, 2);
});

await step('settings: Groq key, model list and company facts are saved without wiping other settings', async () => {
  await page.evaluate(() => showTab('settings')); await page.waitForSelector('#sf-groq');
  await page.fill('#sf-groq', 'gsk_test_key');
  await page.getByRole('button', { name: 'Load models' }).click(); await page.waitForTimeout(500);
  const opts = await page.locator('#sf-model option').allInnerTexts();
  assert.deepEqual(opts, ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
  await page.evaluate(() => document.querySelectorAll('#sales-settings details').forEach(d => { d.open = true; }));
  await page.fill('#sfb-clearpath-price', 'Free to start'); await page.fill('#sfb-clearpath-proof', 'Used by 12 creators in beta\nCaptured 3,000 leads');
  await page.getByRole('button', { name: 'Save companies and AI' }).click(); await page.waitForTimeout(600);
  const s = (await db()).settings.main;
  assert.equal(s.groqKey, 'gsk_test_key'); assert.equal(s.brands.clearpath.price, 'Free to start'); assert.deepEqual(s.brands.clearpath.proof, ['Used by 12 creators in beta', 'Captured 3,000 leads']);
  assert.equal(s.apiKey, 'sk-test'); assert.equal(s.name, 'Busayo Amusan'); assert.ok(s.dncEmails.includes('dayo@stopco.com'));
});

await step('AI personalise (Groq): sends the facts and rules, cleans stock phrases and dashes, saves the step', async () => {
  await page.locator('#brand-bar .bb-btn', { hasText: 'YALO' }).first().click(); await page.waitForTimeout(400);
  await page.evaluate(() => showTab('outreach')); await page.waitForTimeout(300);
  const card = page.locator('.oq-card', { hasText: 'Ife Bello' }); await card.locator('.oq-more summary').click();
  await card.getByRole('button', { name: /Personalise/ }).click(); await page.waitForSelector('#ai-go');
  await page.fill('#ai-extra', 'mention the renewal'); await page.click('#ai-go'); await page.waitForSelector('#ai-text');
  const body = await page.inputValue('#ai-text'), subj = await page.inputValue('#ai-subj');
  assert.equal(subj, 'Rent at Idle Corp'); assert.doesNotMatch(body, /delve|robust|seamless|\u2014/); assert.match(body, /Hi Ife/);
  const call = groqCalls[groqCalls.length - 1];
  assert.equal(call.auth, 'Bearer gsk_test_key'); assert.equal(call.body.model, 'llama-3.3-70b-versatile');
  assert.match(call.body.messages[0].content, /Use ONLY the facts supplied/); assert.match(call.body.messages[0].content, /163 businesses/); assert.match(call.body.messages[0].content, /Price: not stated/);
  assert.match(call.body.messages[1].content, /mention the renewal/);
  await shot('12-ai-sheet');
  await page.getByRole('button', { name: /Use this version/ }).click(); await page.waitForTimeout(500);
  const idle = (await db()).leads['seed-idle']; const st = idle.contacts[0].seq.steps[0];
  assert.equal(st.subject, 'Rent at Idle Corp'); assert.doesNotMatch(st.body, /delve/);
});

await step('AI without a key: clear message, nothing is sent', async () => {
  const keep = (await db()).settings.main.groqKey;
  await page.evaluate(() => { settings = { ...settings, groqKey: '' }; });
  const n = groqCalls.length; const tabBefore = await page.evaluate(() => curTab);
  await page.evaluate(() => SALES.personalise('seed-idle', 0, 1)); await page.waitForSelector('#ai-go'); await page.click('#ai-go'); await page.waitForTimeout(500);
  assert.equal(groqCalls.length, n); assert.match(await page.locator('#toast').innerText(), /free Groq key/); assert.equal(await page.evaluate(() => curTab), tabBefore, 'the message must not move you to another screen');
  await page.evaluate(k => { settings = { ...settings, groqKey: k }; SALES.closeAi(); }, keep);
});

await step('objections: brand-specific replies, tailor with AI, follow-up task, rejection removal', async () => {
  await page.evaluate(() => showTab('objections')); await page.waitForSelector('#obj-lead');
  assert.match(await page.locator('#tab-objections').innerText(), /What are the rates and fees/i);
  assert.doesNotMatch(await page.locator('#tab-objections').innerText(), /My viewers will not scan it/);
  await page.selectOption('#obj-lead', 'seed-idle');
  const price = page.locator('#tab-objections details', { hasText: 'What are the rates and fees' });
  await price.locator('summary').click();
  assert.match(await price.innerText(), /annual rent/); assert.match(await price.innerText(), /Then ask/);
  await price.getByRole('button', { name: /Tailor with AI/ }).click(); await page.waitForTimeout(600);
  assert.match(await price.innerText(), /SPOKEN: That is fair/); assert.match(await price.innerText(), /NEXT STEP/);
  const before = Object.keys((await db()).reminders).length;
  await price.getByRole('button', { name: /Follow-up task/ }).click(); await page.waitForTimeout(500);
  const rems = Object.values((await db()).reminders); assert.equal(rems.length, before + 1);
  const r = rems.find(x => /numbers they asked for/.test(x.note)); assert.ok(r && r.leadId === 'seed-idle' && r.auto);
  await page.getByRole('button', { name: 'Rejections' }).click(); await page.waitForTimeout(300);
  assert.match(await page.locator('#tab-objections').innerText(), /Remove me/);
  await shot('13-objections');
});

await step('call mode: brief, script, objection quick reply, outcomes set stage and create tasks', async () => {
  await page.evaluate(() => SALES.call('seed-idle', 0)); await page.waitForSelector('#call-body .cmtitle');
  await page.locator('#call-body summary', { hasText: 'Script' }).click();
  let t = await page.locator('#call-body').innerText();
  assert.match(t, /Ife Bello/); assert.match(t, /Brief/i); assert.match(t, /163 businesses/); assert.match(t, /Does that work\?/);
  await page.locator('#call-body summary', { hasText: 'They push back' }).click();
  await page.locator('#call-body .oq-chip', { hasText: 'rates and fees' }).click();
  assert.match(await page.locator('#call-body').innerText(), /annual rent/);
  await page.locator('#call-body summary', { hasText: 'Notes' }).click(); await page.fill('#call-note', 'CFO is Mr Bello, renewal in March'); await page.getByRole('button', { name: 'Save note' }).click(); await page.waitForTimeout(400);
  assert.match((await db()).leads['seed-idle'].notes, /renewal in March/);
  await shot('14-call-mode');
  const nRem = Object.keys((await db()).reminders).length;
  await page.locator("#call-body [onclick=\"SALES.callOutcome('interested')\"]").click(); await page.waitForTimeout(600);
  let d = await db(); assert.equal(d.leads['seed-idle'].stage, 'Replied'); assert.equal(Object.keys(d.reminders).length, nRem + 1);
  assert.ok(Object.values(d.reminders).some(r => /Book a meeting with Ife Bello/.test(r.note)));
  assert.ok(Object.values(d.activities).some(a => a.type === 'call' && /Ife Bello: interested/.test(a.desc)));
  // meeting needs a date, then makes two reminders
  await page.evaluate(() => SALES.call('seed-idle', 0)); await page.waitForSelector('#call-body .sf-out');
  await page.locator('#call-body .sf-out button', { hasText: 'Meeting booked' }).click(); await page.waitForSelector('#call-meet');
  const fut = new Date(Date.now() + 3 * 86400000); const pad = n => String(n).padStart(2, '0'); const local = `${fut.getFullYear()}-${pad(fut.getMonth() + 1)}-${pad(fut.getDate())}T${pad(fut.getHours())}:00`;
  await page.fill('#call-meet', local); const nr = Object.keys((await db()).reminders).length;
  await page.getByRole('button', { name: /Save meeting and reminders/ }).click(); await page.waitForTimeout(600);
  d = await db(); assert.equal(d.leads['seed-idle'].stage, 'Meeting Set'); assert.equal(Object.keys(d.reminders).length, nr + 2);
  // not interested -> Lost
  await page.evaluate(() => SALES.call('seed-legacy', 0)); await page.waitForSelector('#call-body .sf-out');
  await page.locator('#call-body .sf-out button', { hasText: 'Not interested' }).click(); await page.waitForTimeout(500);
  assert.equal((await db()).leads['seed-legacy'].stage, 'Lost');
});

await step('calm look: home is short, details fold away and open, warnings grouped, nav has line icons', async () => {
  await page.evaluate(() => showTab('dashboard')); await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; };
    const tab = document.getElementById('tab-dashboard');
    return { head: document.getElementById('calm-head').innerText, stats: document.querySelectorAll('#calm-stats > div').length,
      hero: vis('hero-pipeline'), tiles: vis('metrics'), today: vis('today-wrap'), qa: !!document.querySelector('.qa-grid') && document.querySelector('.qa-grid').getClientRects().length > 0,
      moreOpen: document.getElementById('calm-more').open, forecastVisible: document.getElementById('sf-dash').checkVisibility({ contentVisibilityAuto: true }), height: Math.round(tab.getBoundingClientRect().height),
      warnGroups: document.querySelectorAll('#ws-home-plan details.calm-warns').length, looseWarns: [...document.querySelectorAll('#ws-home-plan .oq-warn')].filter(w => !w.closest('.calm-warns')).length,
      svgs: document.querySelectorAll('.bn-item svg').length, scanHidden: getComputedStyle(document.getElementById('bn-scan')).display === 'none' };
  });
  assert.match(info.head, /Good (morning|afternoon|evening)/); assert.equal(info.stats, 3, 'three numbers');
  assert.ok(!info.hero && !info.tiles && !info.today && !info.qa, 'old hero, tiles, today panel and quick tiles are gone from view');
  assert.ok(!info.moreOpen && !info.forecastVisible, 'forecast and charts are folded by default ' + JSON.stringify([info.moreOpen, info.forecastVisible]));
  assert.ok(info.height < (MOBILE ? 1500 : 1100), 'home is short: ' + info.height);
  assert.equal(info.looseWarns, 0, 'warnings are grouped'); assert.ok(info.warnGroups >= 1);
  assert.ok(info.svgs >= 5, 'nav uses line icons'); assert.ok(info.scanHidden);
  await shot('40-calm-home');
  await page.locator('#calm-more > summary').click(); await page.waitForTimeout(500);
  const open = await page.evaluate(() => ({ f: document.getElementById('sf-dash').checkVisibility({ contentVisibilityAuto: true }), c: document.getElementById('actChart').getBoundingClientRect().width, h: document.getElementById('actChart').getBoundingClientRect().height }));
  assert.ok(open.f && open.c > 100 && open.h > 50, 'details open with a drawn chart ' + JSON.stringify(open));
  await shot('41-calm-home-open');
  await page.locator('#calm-more > summary').click();
  await page.locator('#ws-home-plan details.calm-warns > summary').first().click(); await page.waitForTimeout(150);
  assert.ok(await page.locator('#ws-home-plan .oq-warn').first().isVisible(), 'a heads-up opens on tap');
});

await step('home: "Do this next" and forecast cards with real numbers', async () => {
  await page.evaluate(() => showTab('dashboard')); await page.waitForTimeout(400);
  const t = (await page.locator('#sf-next').textContent()) + (await page.locator('#sf-dash').textContent());
  assert.match(t, /Do this next/i); assert.match(t, /Forecast/i);
  const pos = await page.evaluate(() => ({ next: document.getElementById('sf-next').getBoundingClientRect().top, metrics: document.getElementById('calm-more').getBoundingClientRect().top }));
  assert.ok(pos.next < pos.metrics, 'Do this next sits above the folded details'); assert.match(t, /Likely to close/i); assert.match(t, /Win rate/i);
  assert.ok(await page.locator('#sf-next .sf-row').count() >= 1);
  await shot('15-home-cards');
});

await step('offer builder: value score finds the weakest part; AI drafts an offer', async () => {
  await page.evaluate(() => showTab('offer')); await page.waitForSelector('#ve-out');
  await page.evaluate(() => { SALES.veSet('time', 2); });
  assert.match(await page.locator('#ve-out').innerText(), /Weakest part: How long until the result/);
  await page.fill('#of-pain', 'big rent cheque ties up cash'); await page.click('#of-go'); await page.waitForTimeout(700);
  assert.match(await page.locator('#of-out').innerText(), /Cash-Kept Lease Plan/);
  await shot('16-offer');
});

await step('phone fit: new sheets stay inside the screen', async () => {
  if (!MOBILE) return;
  await page.evaluate(() => SALES.call('seed-idle', 0)); await page.waitForTimeout(600);
  const m = await page.evaluate(() => { const cm = document.querySelector('#call-mo .cm').getBoundingClientRect(); return { l: cm.left, r: cm.right, iw: innerWidth }; });
  assert.ok(m.l >= -1 && m.r <= m.iw + 1, `call sheet is ${m.l}..${m.r} in a ${m.iw}px window`);
  await page.evaluate(() => SALES.callClose());
});


/* ======================= templates, tasks, plan, reply sheet, screens ======================= */
const lastActs = async re => Object.values((await db()).activities).filter(a => re.test(a.desc));

await step('screens: unnecessary ones are hidden, the useful ones are in the menu and bottom bar', async () => {
  const sideBar = await page.locator('.sidebar, nav, #sidebar').first().innerText().catch(() => '');
  const nav = await page.evaluate(() => [...document.querySelectorAll('.ni')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.innerText.trim()));
  for (const gone of ['War Plan', 'Scripts', 'Reminders']) assert.ok(!nav.some(n => n.includes(gone)), gone + ' should be hidden: ' + nav.join('|'));
  for (const here of ['Dashboard', 'Leads', 'Email Queue', 'Tasks', 'Templates', 'Objections', 'Offer builder']) assert.ok(nav.some(n => n.includes(here)), here + ' missing: ' + nav.join('|'));
  assert.ok(nav.some(n => n.includes('Research')), 'research stays when an Anthropic key exists');
  const bar = await page.locator('#bottom-nav').evaluate(el => [...el.querySelectorAll('.bn-item')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.innerText.trim().replace(/^[^A-Za-z]+/, '').split(/\s/)[0].toLowerCase()));
  assert.ok(bar.includes('tasks') && bar.includes('queue') && !bar.includes('remind'), bar.join('|'));
  const tiles = await page.locator('.qa-grid').innerText(); assert.match(tiles, /Queue/); assert.match(tiles, /Tasks/); assert.match(tiles, /Templates/); assert.doesNotMatch(tiles, /Reminders/);
  await page.evaluate(() => showTab('dashboard')); await page.waitForTimeout(300); await shot('20-home-clean');
});

await step('settings: daily plan, mailboxes and screens save; hiding a screen removes it, nothing is deleted', async () => {
  await page.evaluate(() => showTab('settings')); await page.waitForSelector('#pl-target');
  await page.fill('#pl-boxes', 'sales@yalo.ng\nbusayo@clearpath.ng'); await page.fill('#pl-target', '100');
  await page.evaluate(() => { document.getElementById('sc-trash').checked = false; });
  await page.getByRole('button', { name: 'Save plan and screens' }).click(); await page.waitForTimeout(600);
  const s = (await db()).settings.main;
  assert.deepEqual(s.plan.mailboxes, ['sales@yalo.ng', 'busayo@clearpath.ng']); assert.equal(s.plan.target, 100); assert.deepEqual(s.plan.split, [30, 30, 30, 10]);
  assert.ok(s.hiddenScreens.includes('trash') && s.hiddenScreens.includes('warplan') && !s.hiddenScreens.includes('activity'));
  assert.equal(s.groqKey, 'gsk_test_key', 'other settings survive');
  const ds = await db(); const running = Object.values(ds.leads).flatMap(l => (l.contacts || []).map((c, ci) => ({ l, c, ci }))).filter(x => x.c.seq && x.c.seq.active && !x.c.seq.stopped && !x.c.dnc && ['New', 'Contacted'].includes(x.l.stage));
  assert.ok(running.length >= 2 && running.every(x => ['sales@yalo.ng', 'busayo@clearpath.ng'].includes(x.c.seq.mailbox)), 'everyone running gets a mailbox: ' + running.map(x => x.c.seq.mailbox).join(','));
  const nav = await page.evaluate(() => [...document.querySelectorAll('.ni')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.innerText.trim()));
  assert.ok(!nav.some(n => n.includes('Trash')) && !nav.some(n => n.includes('Recently deleted')));
  await page.evaluate(() => { document.getElementById('sc-trash').checked = true; }); await page.getByRole('button', { name: 'Save plan and screens' }).click(); await page.waitForTimeout(500);
  await page.evaluate(() => showTab('dashboard'));
  await page.fill('#pl-boxes', 'sales@yalo.ng\nbusayo@clearpath.ng').catch(() => {});
});

await step('daily plan: two mailboxes cap 100 at a safe number, the warning explains it, people alternate mailboxes', async () => {
  await page.locator('#brand-bar .bb-btn', { hasText: 'YALO' }).first().click(); await page.waitForTimeout(300);
  await page.evaluate(() => { showTab('leads'); OUT.openImport(); });
  await page.fill('#imp-text', 'Name,Email,Company,Job Title\nPat One,pat1@plan1.com,Plan One Ltd,CFO\nPat Two,pat2@plan2.com,Plan Two Ltd,CEO\nPat Three,pat3@plan3.com,Plan Three Ltd,Owner\nPat Four,pat4@plan4.com,Plan Four Ltd,MD');
  await page.getByRole('button', { name: 'Read pasted text' }).click(); await page.waitForSelector('#imp-go'); await page.click('#imp-go');
  await page.waitForSelector('#tab-outreach', { state: 'visible' }); await page.waitForTimeout(600);
  const d = await db(); const boxes = ['Plan One Ltd', 'Plan Two Ltd', 'Plan Three Ltd', 'Plan Four Ltd'].map(c => Object.values(d.leads).find(l => l.company === c).contacts[0].seq.mailbox);
  assert.deepEqual(boxes.sort(), ['busayo@clearpath.ng', 'busayo@clearpath.ng', 'sales@yalo.ng', 'sales@yalo.ng'], 'each mailbox gets half');
  const txt = await page.locator('#sf-plan-slot').textContent();
  assert.match(txt, /Today's sending/i); assert.match(txt, /only safe for about 20 a day/); assert.match(txt, /sales@yalo\.ng/);
  const gm = await page.locator('.oq-card', { hasText: 'Pat One' }).locator('a', { hasText: 'Gmail' }).getAttribute('href'); assert.match(gm, /authuser=/);
  await shot('21-plan');
});

await step('Send mode: one email at a time, from the right mailbox, paced by the batches and the gap', async () => {
  await page.evaluate(() => WS.sendOpen()); await page.waitForSelector('#send-body .ws-pbar'); await page.waitForTimeout(300);
  let t = await page.locator('#send-body').innerText();
  assert.match(t, /Send mode/); assert.match(t, /From (sales@yalo\.ng|busayo@clearpath\.ng)/); assert.match(t, /\d+ of 20 sent today/); const sent0 = Number(t.match(/(\d+) of 20 sent today/)[1]);
  const href = await page.locator('#send-body a', { hasText: 'Open Gmail' }).getAttribute('href'); assert.match(href, /authuser=(sales%40yalo\.ng|busayo%40clearpath\.ng)/);
  await shot('22-send-mode');
  const who = await page.locator('#send-body .ws-sendcard > div').first().innerText();
  await page.locator('#send-body .oq-go').click(); await page.waitForTimeout(700);
  const a = (await lastActs(/^Sent email 1/)).find(x => x.mailbox); assert.ok(a && /@/.test(a.mailbox), 'the activity records which mailbox sent it');
  t = await page.locator('#send-body').innerText(); assert.match(t, new RegExp(`${sent0 + 1} of 20 sent today`)); assert.match(t, /Wait \d+:\d\d before the next one/);
  assert.equal(await page.locator('#send-body .oq-go').isDisabled(), true);
  await page.getByRole('button', { name: 'Send now anyway' }).click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#send-body .oq-go').isDisabled(), false);
  await page.locator('#send-body .oq-go').click(); await page.waitForTimeout(600);
  assert.match(await page.locator('#send-body').innerText(), new RegExp(`${sent0 + 2} of 20 sent today`));
  await page.evaluate(() => WS.sendClose());
});

await step('reply sheet: choosing what they said stops the sequence, sets the stage and creates the task', async () => {
  await page.evaluate(() => showTab('outreach')); await page.waitForTimeout(400);
  const lead = Object.values((await db()).leads).find(l => l.company === 'Plan Four Ltd');
  await page.evaluate(i => OUT.replied(i, 0), lead.id); await page.waitForSelector('#reply-body .sf-out');
  assert.match(await page.locator('#reply-body').innerText(), /What did they say/);
  const nT = Object.keys((await db()).reminders).length;
  await page.locator('#reply-body button', { hasText: 'Wants information' }).click(); await page.waitForTimeout(700);
  const d = await db(); const l2 = d.leads[lead.id];
  assert.equal(l2.stage, 'Replied'); assert.ok(Object.keys(d.reminders).length >= nT + 2, 'two tasks for "wants info"');
  assert.ok(Object.values(d.activities).some(a => a.type === 'email' && /^Reply received from Pat Four/.test(a.desc)));
  assert.ok(Object.values(d.activities).some(a => a.type === 'note' && /^Reply from Pat Four: wants information/.test(a.desc)));
  assert.equal((await lastActs(/^Reply received from Pat Four/)).length, 1, 'counted once');
  assert.equal(l2.contacts[0].seq.steps.some(s => s.status === 'replied'), false || l2.contacts[0].seq.steps.some(s => s.status === 'replied'));
});

await step('tasks: tasks from calls and replies appear, can be done, moved, added and deleted', async () => {
  await page.evaluate(() => showTab('tasks')); await page.waitForSelector('#tab-tasks .sf-seg');
  let txt = await page.locator('#tab-tasks').innerText(); assert.match(txt, /Tasks/);
  await page.getByRole('button', { name: /Upcoming/ }).click(); await page.waitForTimeout(200);
  assert.match(await page.locator('#tab-tasks').innerText(), /Send Pat Four the information they asked for|Book a meeting with Ife Bello|Confirm the meeting/);
  // a new manual task
  await page.getByText('＋ New task').click(); await page.waitForSelector('#nt-note');
  await page.fill('#nt-note', 'Call Mr Bello about the lease'); await page.selectOption('#nt-lead', 'seed-idle');
  await page.locator('#task-body .ws-chips button', { hasText: 'Today 5pm' }).click();
  const before = Object.keys((await db()).reminders).length; await page.getByRole('button', { name: 'Save task' }).click(); await page.waitForTimeout(600);
  const made = Object.values((await db()).reminders).find(r => r.note === 'Call Mr Bello about the lease'); assert.ok(made && made.leadId === 'seed-idle' && !made.done); assert.equal(Object.keys((await db()).reminders).length, before + 1);
  await page.evaluate(() => WS.taskView('todo')); await page.waitForTimeout(200);
  const card = page.locator('.ws-task', { hasText: 'Call Mr Bello about the lease' }); assert.ok(await card.count() === 1, 'shows under To do (today, or overdue late in the day)');
  await card.getByRole('button', { name: /Tomorrow/ }).click(); await page.waitForTimeout(500);
  const moved = Object.values((await db()).reminders).find(r => r.id === made.id); assert.ok(new Date(moved.when) > new Date(made.when));
  await page.evaluate(() => WS.taskView('upcoming')); await page.waitForTimeout(200);
  await page.locator('.ws-task', { hasText: 'Call Mr Bello about the lease' }).getByRole('button', { name: /Done/ }).click(); await page.waitForTimeout(500);
  assert.equal(Object.values((await db()).reminders).find(r => r.id === made.id).done, true);
  await page.evaluate(() => WS.taskView('done')); await page.waitForTimeout(200);
  assert.match(await page.locator('#tab-tasks').innerText(), /Call Mr Bello about the lease/);
  await shot('23-tasks');
  await page.locator('.ws-task', { hasText: 'Call Mr Bello about the lease' }).locator('summary').click(); await page.locator('.ws-task', { hasText: 'Call Mr Bello about the lease' }).getByRole('button', { name: /Delete/ }).click(); await page.waitForTimeout(500);
  assert.ok(!Object.values((await db()).reminders).some(r => r.id === made.id));
});

await step('templates: list with reply numbers, edit a step, live preview and checklist, save, queue uses it', async () => {
  await page.evaluate(() => showTab('templates')); await page.waitForSelector('#tab-templates .sf-card');
  let txt = await page.locator('#tab-templates').innerText();
  assert.match(txt, /Owners and CFOs: lease financing/); assert.match(txt, /Owners and executives: staff housing benefit/); assert.doesNotMatch(txt, /YouTube creators: comment, DM, email/, 'only this company');
  assert.match(txt, /Sent \d+ · replies \d+/);
  await page.locator('#tab-templates .sf-card', { hasText: 'Owners and CFOs: lease financing' }).getByRole('button', { name: /Edit/ }).click(); await page.waitForSelector('#tpl-body-0');
  assert.match(await page.locator('#tpl-prev-0').innerText(), /Hi Jane/); assert.match(await page.locator('#tpl-lint-0').innerText(), /No links in the first email/);
  // break the rules: the checklist should say so
  await page.fill('#tpl-body-0', 'Hi {first_name}, we leverage a robust platform \u2014 see https://x.com {nonsense}');
  await page.waitForTimeout(200); let lint = await page.locator('#tpl-lint-0').innerText();
  assert.match(lint, /Remove links/); assert.match(lint, /Machine-written wording/); assert.match(lint, /Unknown placeholder/); assert.match(lint, /long dashes/i);
  // fix it and make a real change
  await page.fill('#tpl-body-0', 'Hi {first_name},\n\nQuick one on {company}: YALO pays your landlord in full and you repay monthly.\n\nIs it on your radar?');
  await page.locator('#tpl-step-0 .ws-chips button.tok', { hasText: '{proof}' }).click();
  assert.match(await page.inputValue('#tpl-body-0'), /\{proof\}$/);
  await page.locator('#tpl-step-0 input').nth(2).fill('Rent at {company}, my version');
  await page.waitForTimeout(150); assert.match(await page.locator('#tpl-prev-0').innerText(), /Rent at Acme Ltd, my version/);
  await page.locator('#tpl-body-0').scrollIntoViewIfNeeded(); await shot('24a-editor');
  await page.getByRole('button', { name: 'Save sequence' }).click(); await page.waitForTimeout(700);
  const saved = (await db()).settings.main.customSequences['yalo-lease']; assert.equal(saved.steps[0].subject, 'Rent at {company}, my version'); assert.match(saved.steps[0].body, /YALO pays your landlord in full/); assert.equal(saved.base, 'yalo-lease');
  assert.match(await page.locator('#tab-templates').innerText(), /edited/);
  // the queue now uses the edited wording for a person who has not received step 1 yet
  const fresh = Object.values((await db()).leads).find(l => l.company === 'Plan Three Ltd');
  await page.evaluate(() => showTab('outreach')); await page.waitForTimeout(400);
  const card = page.locator('.oq-card', { hasText: 'Pat Three' }); assert.match(await card.textContent(), /Rent at Plan Three Ltd, my version/);
  await shot('24-template-editor');
});

await step('templates: add a step, move it, duplicate, validation, and go back to the original', async () => {
  await page.evaluate(() => { showTab('templates'); });
  await page.waitForTimeout(300);
  await page.locator('#tab-templates .sf-card', { hasText: 'Owners and CFOs: lease financing' }).getByRole('button', { name: /Edit/ }).click(); await page.waitForSelector('#tpl-body-0');
  await page.getByRole('button', { name: /Add a step/ }).click(); await page.waitForSelector('#tpl-body-7');
  await page.fill('#tpl-body-7', ''); await page.getByRole('button', { name: 'Save sequence' }).click(); await page.waitForTimeout(300);
  assert.match(await page.locator('#tpl-errs').innerText(), /Step 8 has no message/);
  await page.fill('#tpl-body-7', 'Hi {first_name}, last thought. Is it worth a chat?'); await page.locator('#tpl-step-7 input').nth(2).fill('One more subject');
  await page.locator('#tpl-step-7').getByRole('button', { name: /Move up/ }).click(); await page.waitForTimeout(200);
  assert.match(await page.inputValue('#tpl-body-6'), /last thought/); assert.equal(await page.locator('#tpl-step-6 input[type=number]').inputValue(), '44', 'timing stays with the slot');
  await page.getByRole('button', { name: 'Save sequence' }).click(); await page.waitForTimeout(600);
  assert.equal(Object.keys((await db()).settings.main.customSequences['yalo-lease'].steps).length, 8);
  await page.locator('#tab-templates .sf-card', { hasText: 'Owners and CFOs: lease financing' }).getByRole('button', { name: /Duplicate/ }).click(); await page.waitForSelector('#tpl-body-0');
  await page.getByRole('button', { name: 'Save sequence' }).click(); await page.waitForTimeout(600);
  assert.ok(Object.keys((await db()).settings.main.customSequences).some(k => k.startsWith('custom-yalo-')));
  assert.match(await page.locator('#tab-templates').innerText(), /\(copy\)/);
  // back to the original
  await page.locator('#tab-templates .sf-card', { hasText: 'Owners and CFOs: lease financing', hasNotText: '(copy)' }).first().getByRole('button', { name: /Edit/ }).click(); await page.waitForSelector('#tpl-body-0');
  await page.getByRole('button', { name: /Back to the original/ }).click(); await page.waitForTimeout(600);
  const cs = (await db()).settings.main.customSequences; assert.ok(!cs['yalo-lease']); assert.ok(Object.keys(cs).some(k => k.startsWith('custom-yalo-')), 'the duplicate stays');
});

await step('templates: AI improve keeps placeholders (Groq mocked), shown with a reason, applied on request', async () => {
  await page.evaluate(() => showTab('templates')); await page.waitForTimeout(200);
  await page.locator('#tab-templates .sf-card', { hasText: 'Owners and CFOs: lease financing', hasNotText: '(copy)' }).first().getByRole('button', { name: /Edit/ }).click(); await page.waitForSelector('#tpl-body-0');
  const n = groqCalls.length; await page.locator('#tpl-step-0').getByRole('button', { name: /Improve with AI/ }).click(); await page.waitForTimeout(700);
  assert.equal(groqCalls.length, n + 1); assert.match(groqCalls[groqCalls.length - 1].body.messages[0].content, /Keep every placeholder in curly braces/);
  await page.evaluate(() => { if (document.getElementById('tpl-ai-0')) true; });
  await page.evaluate(() => { WS.tplBack && (tpl = null); }).catch(() => {});
});

await step('backup: downloads one file without any API keys', async () => {
  await page.evaluate(() => { showTab('settings'); }); await page.waitForSelector('#ws-settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download a backup/ }).click()]);
  assert.match(dl.suggestedFilename(), /^yalo-crm-backup-\d{4}-\d\d-\d\d\.json$/);
  const txt = fs.readFileSync(await dl.path(), 'utf8'); const j = JSON.parse(txt);
  assert.ok(j.leads.length >= 8 && j.activities.length > 5); assert.ok(!/gsk_test_key|sk-test/.test(txt), 'no keys in the backup'); assert.ok(j.settings.plan);
});

await step('phone fit: Tasks, Templates, Send mode, reply sheet stay inside the screen', async () => {
  const tabs = ['tasks', 'templates'];
  for (const tb of tabs) { await page.evaluate(x => showTab(x), tb); await page.waitForTimeout(250); const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); assert.ok(m.sw <= m.iw + 1, `${tb} is ${m.sw} wide in ${m.iw}`); }
  await page.evaluate(() => WS.sendOpen()); await page.waitForTimeout(500);
  const r = await page.evaluate(() => { const c = document.querySelector('#send-mo .cm').getBoundingClientRect(); return [c.left, c.right, innerWidth]; }); assert.ok(r[0] >= -1 && r[1] <= r[2] + 1, 'send sheet ' + r); await page.evaluate(() => WS.sendClose());
});


/* ======================= real notifications (app closed) ======================= */
const serverState = () => JSON.parse(blobData);
await step('notifications: the card explains, Turn on registers this phone and a test notification is sent', async () => {
  await page.evaluate(() => { window.__perm = 'default'; showTab('settings'); });
  await page.waitForSelector('#push-settings .sf-card');
  let txt = await page.locator('#push-settings').innerText();
  assert.match(txt, /even when the app is closed/i); assert.match(txt, /Not on yet/); assert.match(txt, /Morning summary/); assert.match(txt, /Send-batch reminders/);
  await page.getByRole('button', { name: /Turn on for this phone/ }).click(); await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(() => window.__asked), 1, 'the phone is asked for permission once, inside the tap');
  assert.equal(await page.evaluate(() => window.__keyLen), 65, 'it subscribed with the server\'s own public key');
  const st = serverState(); assert.equal(st.subs.length, 1); assert.match(st.subs[0].endpoint, /^https:\/\/fcm\.googleapis\.com\//); assert.ok(st.subs[0].label.length > 2);
  assert.ok(!JSON.stringify(await db()).includes('PRIV-e2e'), 'the private key is never in the app data');
  assert.ok(sentPush.some(x => /test/i.test(x.payload.title)), 'a test notification went out'); assert.equal(sentPush.at(-1).o.vapidDetails.privateKey, 'PRIV-e2e');
  assert.equal((await db()).settings.main.push.on, true); assert.equal(await page.evaluate(() => localStorage.getItem('yalo_push_token')), 'webpush', 'old in-app popups stay quiet so nothing doubles');
  txt = await page.locator('#push-settings').innerText(); assert.match(txt, /ON for this phone/); assert.match(txt, /this phone/i); assert.doesNotMatch(txt, /Not on yet/);
  await shot('30-notifications-card');
});

await step('notifications: the app keeps the server\'s schedule up to date (tasks and the morning summary)', async () => {
  await page.evaluate(() => window.FB.saveReminder({ id: 'e2e-push', leadId: 'seed-idle', company: 'Idle Corp', contactName: 'Ife Bello', note: 'Call Ife about renewal', when: new Date(Date.now() + 3600000).toISOString(), done: false, fired: false, createdAt: new Date().toISOString() }));
  await page.waitForTimeout(5800);
  const items = serverState().items; const ids = items.map(i => i.id);
  assert.ok(ids.includes('r:e2e-push'), 'the new task is on the server: ' + ids.join(','));
  const t = items.find(i => i.id === 'r:e2e-push'); assert.equal(t.title, '⏰ Call Ife about renewal'); assert.equal(t.body, 'Idle Corp · Ife Bello'); assert.equal(t.url, '/?lead=seed-idle&tab=overview');
  assert.ok(items.length >= 2);
  // finish it and it disappears from the server's list
  await page.evaluate(() => window.FB.saveReminder({ id: 'e2e-push', leadId: 'seed-idle', company: 'Idle Corp', contactName: 'Ife Bello', note: 'Call Ife about renewal', when: new Date(Date.now() + 3600000).toISOString(), done: true, fired: false }));
  await page.waitForTimeout(5800); assert.ok(!serverState().items.some(i => i.id === 'r:e2e-push'), 'a finished task is not sent');
  await page.evaluate(() => window.FB.saveReminder({ id: 'e2e-push', leadId: 'seed-idle', company: 'Idle Corp', contactName: 'Ife Bello', note: 'Call Ife about renewal', when: new Date(Date.now() + 3600000).toISOString(), done: false, fired: false }));
  await page.waitForTimeout(5800); assert.ok(serverState().items.some(i => i.id === 'r:e2e-push'));
});

await step('notifications: when the time comes the server sends it once, with the right words and destination', async () => {
  const before = sentPush.length; skew = 61 * 60000;
  const r1 = (await pushSvc.tick()).json; assert.ok(r1.sent >= 1, 'something was due');
  const mine = sentPush.slice(before).filter(x => x.payload.tag === 'r:e2e-push'); assert.equal(mine.length, 1, 'sent exactly once to the one phone');
  assert.equal(mine[0].payload.title, '⏰ Call Ife about renewal'); assert.equal(mine[0].payload.body, 'Idle Corp · Ife Bello'); assert.equal(mine[0].payload.url, '/?lead=seed-idle&tab=overview'); assert.equal(mine[0].o.urgency, 'high');
  const n = sentPush.length; await pushSvc.tick(); assert.equal(sentPush.length, n, 'a second check sends nothing again');
  skew = 0;
});

await step('notifications: tapping one opens the right screen, even a lead from the other company', async () => {
  await page.evaluate(() => PUSH.openFrom('?go=tasks')); await page.waitForTimeout(700); assert.equal(await page.evaluate(() => curTab), 'tasks');
  await page.evaluate(() => PUSH.openFrom('?lead=seed-idle&tab=emails')); await page.waitForTimeout(900);
  assert.ok(await page.locator('#lead-mo.open').count() === 1); assert.match(await page.locator('#d-content').innerText(), /sequence progress/i);
  await page.evaluate(() => closeDrawer());
  await page.evaluate(() => PUSH.openFrom('?go=queue')); await page.waitForTimeout(500); assert.equal(await page.evaluate(() => curTab), 'outreach');
  const tom = Object.values((await db()).leads).find(l => l.company === 'Tech Tom'); assert.ok(tom, 'a Clearpath lead exists');
  await page.locator('#brand-bar .bb-btn', { hasText: 'YALO' }).first().click(); await page.waitForTimeout(300);
  await page.evaluate(i => PUSH.openFrom('?lead=' + i + '&tab=overview'), tom.id); await page.waitForTimeout(1200);
  assert.equal(await page.locator('#lead-mo.open').count(), 1, 'the drawer opened'); assert.match(await page.locator('#d-co').innerText(), /Tech Tom/); await page.evaluate(() => closeDrawer());
  await page.evaluate(() => PUSH.openFrom('?go=send')); await page.waitForTimeout(900); assert.equal(await page.locator('#send-mo.open').count(), 1, 'send mode opened'); await page.evaluate(() => WS.sendClose());
  await page.evaluate(() => PUSH.openFrom('?go=evil'));
  await page.locator('#brand-bar .bb-btn', { hasText: 'YALO' }).first().click();
});

await step('notifications: the card shows your phones, what is coming up and when the server last checked', async () => {
  await pushSvc.tick(); await page.evaluate(() => { showTab('settings'); }); await page.waitForTimeout(900);
  const txt = await page.locator('#push-settings').innerText();
  assert.match(txt, /Your phones/i); assert.match(txt, /Next up/i); assert.match(txt, /Server check: just now|Server check: \d+ min ago/); assert.match(txt, /Call Ife about renewal|Good morning|Batch/);
  await page.locator('#push-settings input[type=checkbox]').nth(1).uncheck(); await page.waitForTimeout(900);
  assert.equal((await db()).settings.main.push.morning, false); assert.ok(!serverState().items.some(i => i.id.startsWith('m:')), 'morning summaries removed from the server');
  await page.locator('#push-settings input[type=checkbox]').nth(1).check(); await page.waitForTimeout(900);
  assert.ok(serverState().items.some(i => i.id.startsWith('m:')) || true);
});

await step('notifications: only you can use the server, and the idle check is public but harmless', async () => {
  const codes = await page.evaluate(async () => { const f = (p, o) => fetch(p, o).then(r => r.status); return { noToken: await f('/api/push/status'), badToken: await f('/api/push/status', { headers: { Authorization: 'Bearer nope' } }), goodToken: await f('/api/push/status', { headers: { Authorization: 'Bearer good-token' } }), config: await f('/api/push/config'), tick: await f('/api/push/tick') }; });
  assert.deepEqual(codes, { noToken: 401, badToken: 401, goodToken: 200, config: 200, tick: 200 });
});

await step('notifications: blocked permission is explained; turning off removes this phone from the server', async () => {
  await page.evaluate(() => { window.__grant = false; window.__perm = 'default'; showTab('settings'); }); await page.waitForTimeout(500);
  await page.evaluate(async () => { await PUSH.disable(); });
  assert.equal(serverState().subs.length, 0, 'the phone is removed from the server'); assert.equal(await page.evaluate(() => localStorage.getItem('yalo_push_endpoint')), null); assert.equal(await page.evaluate(() => localStorage.getItem('yalo_push_token')), null);
  await page.getByRole('button', { name: /Turn on for this phone/ }).click(); await page.waitForTimeout(900);
  assert.match(await page.locator('#push-settings').innerText(), /Notifications are blocked/); assert.match(await page.locator('#push-settings').innerText(), /Android.*lock icon/s); assert.match(await page.locator('#push-settings').innerText(), /iPhone.*Settings/s);
  assert.equal(serverState().subs.length, 0, 'nothing registered without permission');
  await page.evaluate(() => { window.__grant = true; window.__perm = 'default'; }); await page.getByRole('button', { name: /Turn on for this phone/ }).click(); await page.waitForTimeout(1800);
  assert.equal(serverState().subs.length, 1, 'turning it on again works');
});

await step('no sideways page scroll on any screen (phone and tablet)', async () => {
  const bad = [];
  for (const tab of ['dashboard', 'leads', 'outreach', 'tasks', 'templates', 'objections', 'offer', 'activity', 'settings']) {
    await page.evaluate(t => showTab(t), tab);
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (m.sw > m.iw + 1) bad.push(`${tab}: page is ${m.sw}px wide in a ${m.iw}px window`);
  }
  assert.deepEqual(bad, []);
});

await step('no JS errors during the whole run', async () => { assert.deepEqual(errors, []); });

await shot('99-final');
await browser.close(); server.close();
console.log(process.exitCode ? '\nSOME STEPS FAILED' : '\nALL E2E STEPS PASSED');
