/* YALO CRM push server (runs as Vercel functions). Pure logic with everything external injected, so it is fully testable.
 *
 * State lives in ONE private Vercel Blob file: the push keys (created by the server itself, never shown to anyone),
 * the registered devices, the schedule the app uploaded, and a short "already sent" ledger.
 * Every write is "only if nobody changed it since I read it" (ETag), so two devices cannot overwrite each other.
 */
'use strict';
const crypto = require('crypto');

const PROJECT_ID = 'yalo-crm';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_ALLOWED = ['synccityng@gmail.com', 'bishopbusayo8@gmail.com', 'busayogrowth@gmail.com'];
const SUBJECT = 'https://yalotechnologies-crm.vercel.app';
const STATE_PATH = 'push/state.json';
const HOUR = 3600000, DAY = 86400000;
const MAX_DEVICES = 10, MAX_ITEMS = 400, MAX_PER_TICK = 12;
// Push services a browser can hand us. The server calls these URLs, so anything else is refused.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|[a-z0-9-]+\.push\.apple\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$/i;

const emptyState = () => ({ v: 1, vapid: null, subs: [], items: [], sent: {}, lastTick: null, lastSend: null });
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const b64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const itemKey = it => it.id + '|' + it.at;

/* ---------------------------------------------------------------- who is calling (Firebase sign-in token) */
let jwksCache = { at: 0, keys: null };
async function getJwks(fetchImpl, nowMs) {
  if (jwksCache.keys && nowMs - jwksCache.at < HOUR) return jwksCache.keys;
  const r = await fetchImpl(JWKS_URL); if (!r.ok) throw new Error('Could not load sign-in keys');
  const j = await r.json(); jwksCache = { at: nowMs, keys: j.keys || [] }; return jwksCache.keys;
}
const resetJwksCache = () => { jwksCache = { at: 0, keys: null }; };
async function verifyIdToken(token, o) {
  o = o || {}; const fetchImpl = o.fetchImpl || fetch, nowMs = o.now || Date.now(), allowed = (o.allowed || DEFAULT_ALLOWED).map(x => x.toLowerCase());
  const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('bad token');
  let header, p; try { header = JSON.parse(b64u(parts[0]).toString()); p = JSON.parse(b64u(parts[1]).toString()); } catch (e) { throw new Error('bad token'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad token');
  const jwk = (await getJwks(fetchImpl, nowMs)).find(k => k.kid === header.kid); if (!jwk) throw new Error('unknown key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), b64u(parts[2]));
  if (!ok) throw new Error('bad signature');
  const pid = o.projectId || PROJECT_ID, sec = nowMs / 1000;
  if (p.aud !== pid || p.iss !== 'https://securetoken.google.com/' + pid) throw new Error('wrong project');
  if (!(p.exp > sec) || !(p.iat <= sec + 120) || !p.sub) throw new Error('expired');
  const email = String(p.email || '').toLowerCase();
  if (p.email_verified !== true || !allowed.includes(email)) throw new Error('not allowed');
  return { email, uid: p.sub };
}

/* ---------------------------------------------------------------- input cleaning */
function cleanSubscription(s) {
  if (!s || typeof s !== 'object') return null;
  let u; try { u = new URL(String(s.endpoint)); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.test(u.hostname) || String(s.endpoint).length > 700) return null;
  const k = s.keys || {}; if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) return null;
  return { endpoint: String(s.endpoint), keys: { p256dh: k.p256dh, auth: k.auth } };
}
function cleanItems(items, now) {
  const out = []; const seen = new Set();
  (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS * 2).forEach(it => {
    if (!it || typeof it !== 'object') return;
    const id = String(it.id || ''); const at = new Date(it.at); if (!/^[A-Za-z0-9:_.\-|@]{1,100}$/.test(id) || isNaN(at)) return;
    if (at < now - 12 * HOUR || at > now + 60 * DAY) return;
    const url = String(it.url || '/'); const row = { id, at: at.toISOString(), title: clip(it.title, 90), body: clip(it.body, 200), url: /^\/[A-Za-z0-9_\-./?=&%#]{0,180}$/.test(url) ? url : '/' };
    if (!row.title || seen.has(row.id + '|' + row.at)) return; seen.add(row.id + '|' + row.at); out.push(row);
  });
  return out.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, MAX_ITEMS);
}
const deviceLabel = (l, ua) => clip(l, 60) || (/iPhone|iPad/.test(ua || '') ? 'iPhone / iPad' : /Android/.test(ua || '') ? 'Android phone' : 'Computer');

/* ---------------------------------------------------------------- the service */
function createPush(deps) {
  const { store, webpush, now: nowFn } = deps; const clock = () => (nowFn ? nowFn() : Date.now());
  const verify = deps.verify || (t => verifyIdToken(t, {}));

  // Read the state; create the push keys the first time (only one request can win the creation).
  async function load() {
    for (let i = 0; i < 3; i++) {
      const { state, etag } = await store.read();
      if (state && state.vapid) return { state, etag };
      const st = state || emptyState(); st.vapid = webpush.generateVAPIDKeys();
      if (await store.write(st, etag)) return { state: st, etag: null, fresh: true };
    }
    throw new Error('Could not start the push store');
  }
  async function mutate(fn) {              // read, change, write only if unchanged; retry a few times
    for (let i = 0; i < 4; i++) {
      const { state, etag } = await load(); const res = await fn(state);
      if (res && res.skipWrite) return res.value;
      if (await store.write(state, etag === null ? undefined : etag, true)) return res ? res.value : undefined;
    }
    throw new Error('Busy, try again');
  }
  const sendOne = async (sub, payload, vapid) => {
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 12 * 3600, urgency: 'high', vapidDetails: { subject: deps.subject || SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey } }); return { ok: true }; }
    catch (e) { return { ok: false, status: e && e.statusCode, gone: !!(e && (e.statusCode === 404 || e.statusCode === 410)), message: clip(e && e.message, 120) }; }
  };
  const auth = async headers => {
    const h = headers.authorization || headers.Authorization || ''; const m = /^Bearer (.+)$/.exec(h); if (!m) return null;
    try { return await verify(m[1]); } catch (e) { return null; }
  };
  const need = async headers => { const u = await auth(headers); if (!u) { const e = new Error('Sign in again'); e.status = 401; throw e; } return u; };

  return {
    // The public push key. The private half never leaves the server.
    async config() { const { state } = await load(); return { status: 200, json: { publicKey: state.vapid.publicKey } }; },

    async subscribe({ headers, body }) {
      await need(headers); const sub = cleanSubscription(body && body.subscription); if (!sub) return { status: 400, json: { error: 'That device cannot receive push' } };
      const label = deviceLabel(body.label, body.ua); const nowIso = new Date(clock()).toISOString();
      const count = await mutate(st => {
        const i = st.subs.findIndex(s => s.endpoint === sub.endpoint);
        if (i >= 0) st.subs[i] = Object.assign(st.subs[i], sub, { label, last: nowIso });
        else { st.subs.push(Object.assign(sub, { label, added: nowIso, last: nowIso })); if (st.subs.length > MAX_DEVICES) st.subs.shift(); }
        return { value: st.subs.length };
      });
      return { status: 200, json: { ok: true, devices: count } };
    },

    async unsubscribe({ headers, body }) {
      await need(headers); const ep = String(body && body.endpoint || '');
      const left = await mutate(st => { st.subs = st.subs.filter(s => s.endpoint !== ep); return { value: st.subs.length }; });
      return { status: 200, json: { ok: true, devices: left } };
    },

    // The app uploads everything that should buzz in the next weeks. Replaces the old list; keeps the "already sent" memory.
    async sync({ headers, body }) {
      await need(headers); const t = clock(); const items = cleanItems(body && body.items, t);
      const res = await mutate(st => {
        const same = JSON.stringify(st.items) === JSON.stringify(items);
        if (same) return { skipWrite: true, value: { count: items.length, changed: false } };
        st.items = items; return { value: { count: items.length, changed: true } };
      });
      return { status: 200, json: { ok: true, count: res.count, changed: res.changed } };
    },

    // Sends a real notification right now, to prove the whole chain works.
    async test({ headers, body }) {
      await need(headers); const { state } = await load(); const ep = body && body.endpoint;
      const targets = state.subs.filter(s => !ep || s.endpoint === ep);
      if (!targets.length) return { status: 404, json: { error: 'No device is registered yet. Turn notifications on first.' } };
      const payload = { title: '🔔 YALO CRM test', body: 'If you can read this, notifications work even with the app closed.', url: '/?go=tasks', tag: 'test-' + clock() };
      const results = await Promise.all(targets.map(async s => Object.assign({ label: s.label }, await sendOne(s, payload, state.vapid))));
      const gone = results.map((r, i) => r.gone ? targets[i].endpoint : null).filter(Boolean);
      if (gone.length) await mutate(st => { st.subs = st.subs.filter(s => !gone.includes(s.endpoint)); return { value: 0 }; });
      return { status: 200, json: { ok: results.some(r => r.ok), results } };
    },

    async status({ headers }) {
      await need(headers); const { state } = await load(); const t = clock();
      const upcoming = state.items.filter(i => new Date(i.at) > t && !state.sent[itemKey(i)]).slice(0, 5).map(i => ({ at: i.at, title: i.title }));
      return { status: 200, json: { devices: state.subs.map(s => ({ label: s.label, added: s.added, last: s.last, endpoint: s.endpoint })), items: state.items.length, upcoming, lastTick: state.lastTick, lastSend: state.lastSend, serverTime: new Date(t).toISOString() } };
    },

    // Called every few minutes by a scheduler. Sends whatever is due and has not been sent. Safe to call any time.
    async tick() {
      const t = clock(); const out = { sent: 0, due: 0, devices: 0, skipped: 0 };
      const { state, etag } = await load(); const ledger = state.sent || {};
      const due = state.items.filter(i => new Date(i.at) <= t && !ledger[itemKey(i)]);
      out.due = due.length; out.devices = state.subs.length;
      let changed = false;
      const heartbeat = !state.lastTick || t - new Date(state.lastTick) > 55 * 60000;
      if (due.length && state.subs.length) {
        const fresh = due.filter(i => t - new Date(i.at) <= 36 * HOUR), stale = due.filter(i => t - new Date(i.at) > 36 * HOUR);
        stale.forEach(i => { ledger[itemKey(i)] = new Date(t).toISOString(); out.skipped++; });
        const now = fresh.slice(0, MAX_PER_TICK), extra = fresh.slice(MAX_PER_TICK);
        const sends = now.map(i => ({ item: i, payload: { title: i.title, body: i.body, url: i.url, tag: i.id } }));
        if (extra.length) sends.push({ item: null, payload: { title: `${extra.length} more things need you`, body: 'Open YALO CRM to see them.', url: '/?go=tasks', tag: 'more-' + t }, extra });
        const dead = new Set();
        for (const s of sends) {
          const results = await Promise.all(state.subs.map(async sub => ({ sub, r: await sendOne(sub, s.payload, state.vapid) })));
          results.forEach(x => { if (x.r.gone) dead.add(x.sub.endpoint); });
          if (results.some(x => x.r.ok)) { (s.item ? [s.item] : s.extra).forEach(i => { ledger[itemKey(i)] = new Date(t).toISOString(); }); out.sent++; state.lastSend = new Date(t).toISOString(); }
        }
        if (dead.size) state.subs = state.subs.filter(s => !dead.has(s.endpoint));
        changed = true;
      }
      Object.keys(ledger).forEach(k => { const at = new Date(k.split('|')[1]); if (t - at > 4 * DAY) { delete ledger[k]; changed = true; } });
      state.sent = ledger;
      if (changed || heartbeat) { state.lastTick = new Date(t).toISOString(); await store.write(state, etag === null ? undefined : etag, true).catch(() => false); }
      return { status: 200, json: Object.assign({ ok: true, at: new Date(t).toISOString() }, out) };
    }
  };
}

/* ---------------------------------------------------------------- cross-origin rules (the app may be served from another address) */
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.vercel\.app|sirbusayoamusan\.github\.io)$/i;
function corsHeaders(origin) {
  const h = { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
  if (origin && ALLOWED_ORIGIN.test(origin)) h['Access-Control-Allow-Origin'] = origin; return h;
}

module.exports = { createPush, verifyIdToken, resetJwksCache, cleanSubscription, cleanItems, corsHeaders, itemKey, emptyState, DEFAULT_ALLOWED, STATE_PATH, PUSH_HOSTS };
