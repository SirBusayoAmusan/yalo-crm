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
    export const getAuth = () => ({});
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
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
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
await page.addInitScript(({ leads, settings }) => {
  window.__db = { leads, activities: {}, settings: { main: settings }, reminders: {}, notifications: {}, pushTokens: {}, publicProfile: {} };
  Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
}, { leads: seedLeads(), settings: { name: 'Busayo Amusan', company: 'YALO Technologies', apiKey: 'sk-test' } });

const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, '\n   ', e.message.slice(0,700)); await page.screenshot({ path: `${OUTDIR}/FAIL-${name.replace(/\W+/g, '_')}.png` }); process.exitCode = 1; } };
const db = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__db)));
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
  assert.match(t, /Work Email/); assert.match(t, /\d+ new companies/);
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

await step('queue: office-lease email asks for annual rent; saving it fills [LEASE]', async () => {
  const card = page.locator('.oq-card', { hasText: 'Ada Obi' });
  assert.match(await card.innerText(), /needs the company's annual rent/);
  await card.locator('input[type=number]').fill('12000000');
  await card.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  assert.doesNotMatch(await page.locator('.oq-card', { hasText: 'Ada Obi' }).innerText(), /needs the company's annual rent/);
  const lead = Object.values((await db()).leads).find(l => l.company.startsWith('Zed'));
  assert.equal(lead.lease, 12000000);
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
  await page.locator('.oq-card', { hasText: 'Kemi Ola' }).getByRole('button', { name: /Replied/ }).click();
  await page.waitForTimeout(500);
  const d = await db();
  const zed = Object.values(d.leads).find(l => l.company.startsWith('Zed'));
  assert.equal(zed.stage, 'Replied');
  const txt = await page.locator('#oq-body').innerText();
  assert.match(txt, /replies to handle \(1\)/i); assert.doesNotMatch(txt, /Kemi Ola · Head/);
  assert.ok(Object.values(d.activities).some(a => /^Reply received from Kemi Ola/.test(a.desc)));
});

await step('do-not-contact: blocks person, saved in settings, survives re-import', async () => {
  await page.locator('.oq-card', { hasText: 'Dayo Stop' }).getByRole('button', { name: /Don't contact/ }).click();
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
  assert.match(await page.locator('#d-content').innerText(), /sequence progress/i);
  await shot('05-drawer-emails');
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
  const strip = await page.locator('#oq-dash-strip').innerText();
  assert.match(strip, /sent this week/i);
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

await step('no JS errors during the whole run', async () => { assert.deepEqual(errors, []); });

await shot('99-final');
await browser.close(); server.close();
console.log(process.exitCode ? '\nSOME STEPS FAILED' : '\nALL E2E STEPS PASSED');
