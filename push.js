/* YALO CRM: notifications that arrive with the app closed (Android and iPhone).
 * Turning it on registers this phone with the push server; the app keeps the server's schedule up to date; a tap on a
 * notification opens the right screen. Loads after workspace.js and shares its globals. */
(function () {
  'use strict';
  const YO = window.YO, YS = window.YS, PC = window.PC, S = window.SALES;
  if (!YO || !PC || !S) { console.warn('push.js needs the sales files'); return; }
  const $ = id => document.getElementById(id);
  const esc = YO.esc;
  const warn = m => toast(m, 'var(--red)');
  const settingsLoaded = () => settings && Object.keys(settings).length > 0;
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
  const API_BASE = () => /(\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://yalotechnologies-crm.vercel.app';
  const env = () => ({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints || 0, hasSW: 'serviceWorker' in navigator, hasPush: 'PushManager' in window, hasNotification: 'Notification' in window,
    standalone: navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches), permission: 'Notification' in window ? Notification.permission : 'denied' });
  const state = { server: null, serverErr: '', busy: false, lastHash: LS.get('yalo_push_hash') || '', lastSync: null };
  const prefs = () => PC.prefsOf(settings);

  /* ---------------------------------------------------------------- talking to the server */
  async function api(path, o) {
    o = o || {}; const method = o.method || 'POST';
    const call = async t => fetch(API_BASE() + '/api/push/' + path, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(o.body || {}) : undefined });
    let token = await window.FB.getIdToken(); if (!token) throw new Error('Sign in first');
    let r = await call(token); if (r.status === 401) { token = await window.FB.getIdToken(true); r = await call(token); }
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'The notification server said ' + r.status); e.status = r.status; throw e; } return j;
  }
  const savePrefs = async patch => {
    if (!settingsLoaded()) throw new Error('Settings are still loading. Try again in a moment.');
    const push = Object.assign({}, prefs(), patch); settings = Object.assign({}, settings, { push }); await window.FB.saveSettings(settings); return push;
  };

  /* ---------------------------------------------------------------- this phone */
  const sameKey = (sub, pub) => { try { const k = sub.options && sub.options.applicationServerKey; if (!k) return true; const a = new Uint8Array(k), b = PC.urlBase64ToBytes(pub); return a.length === b.length && a.every((x, i) => x === b[i]); } catch (e) { return true; } };
  async function subscribeHere() {
    const reg = await navigator.serviceWorker.ready;
    const r = await fetch(API_BASE() + '/api/push/config'); const cfg = await r.json(); if (!cfg.publicKey) throw new Error('The server has no push key yet');
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, cfg.publicKey)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: PC.urlBase64ToBytes(cfg.publicKey) });
    await api('subscribe', { body: { subscription: sub.toJSON(), label: PC.platform(env()).label, ua: navigator.userAgent } });
    LS.set('yalo_push_endpoint', sub.endpoint); LS.set('yalo_push_token', 'webpush');      // the old in-app reminder popups stay quiet: the server owns delivery now
    return sub;
  }
  async function enable() {
    const p = PC.platform(env());
    if (p.need === 'install') { render(); return { ok: false, need: 'install' }; }
    if (p.need === 'unsupported') { render(); return { ok: false, need: 'unsupported' }; }
    state.busy = true; render();
    try {
      let perm = Notification.permission; if (perm === 'default') perm = await Notification.requestPermission();   // must happen inside the tap
      if (perm !== 'granted') { state.busy = false; render(); return { ok: false, need: 'blocked' }; }
      await subscribeHere(); await savePrefs({ on: true }); await sync(true);
      state.busy = false; await refreshServer(); toast('Notifications are on ✓ Sending you a test…'); await test(true);
      return { ok: true };
    } catch (e) { state.busy = false; state.serverErr = e.message; render(); warn(e.message); return { ok: false, error: e.message }; }
  }
  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (sub) { const ep = sub.endpoint; await sub.unsubscribe(); await api('unsubscribe', { body: { endpoint: ep } }).catch(() => {}); }
    } catch (e) { /* nothing to remove */ }
    LS.del('yalo_push_endpoint'); LS.del('yalo_push_token'); await refreshServer(); toast('Notifications are off on this phone'); render();
  }
  async function removeDevice(endpoint) { await api('unsubscribe', { body: { endpoint } }); if (endpoint === LS.get('yalo_push_endpoint')) { LS.del('yalo_push_endpoint'); LS.del('yalo_push_token'); } await refreshServer(); render(); }
  async function test(quiet) {
    try {
      const ep = LS.get('yalo_push_endpoint'); const j = await api('test', { body: ep ? { endpoint: ep } : {} });
      const bad = (j.results || []).filter(r => !r.ok);
      if (j.ok && !bad.length) { if (!quiet) toast('Test sent. It should arrive in a few seconds.'); else toast('Test sent. It should arrive in a few seconds.'); }
      else warn(j.ok ? 'Sent, but some devices failed: ' + bad.map(b => b.label).join(', ') : 'The phone service refused it (' + ((bad[0] && (bad[0].status || bad[0].message)) || 'unknown') + '). Turn notifications off and on again.');
      await refreshServer(); render(); return j;
    } catch (e) { warn(e.message); return { ok: false, error: e.message }; }
  }

  /* ---------------------------------------------------------------- keeping the server's schedule up to date */
  function buildItems() {
    return PC.buildSchedule({ now: new Date(), leads: S.allLeads(), reminders, activities: S.allActs(), settings });
  }
  async function sync(force) {
    if (!prefs().on || !settingsLoaded()) return { skipped: true };
    const items = buildItems(), hash = JSON.stringify(items.map(i => [i.id, i.at, i.title, i.body]));
    const day = new Date().toDateString(); if (!force && hash === state.lastHash && LS.get('yalo_push_day') === day) return { skipped: true, count: items.length };
    try { const j = await api('sync', { body: { items } }); state.lastHash = hash; state.lastSync = new Date(); LS.set('yalo_push_hash', hash); LS.set('yalo_push_day', day); return j; }
    catch (e) { state.serverErr = e.message; return { ok: false, error: e.message }; }
  }
  let timer = null; const syncSoon = () => { if (!prefs().on) return; clearTimeout(timer); timer = setTimeout(() => sync(false).then(() => { if (curTab === 'settings') refreshServer().then(render); }), 4000); };
  async function refreshServer() { try { state.server = await api('status', { method: 'GET' }); state.serverErr = ''; } catch (e) { state.serverErr = e.message; } }

  // If the phone dropped our registration (it happens), quietly put it back. No new permission prompt is needed.
  async function keepFresh() {
    try {
      if (!prefs().on || Notification.permission !== 'granted' || !LS.get('yalo_push_endpoint')) return;
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (!sub || sub.endpoint !== LS.get('yalo_push_endpoint')) await subscribeHere();
    } catch (e) { /* try again next time the app opens */ }
  }

  /* ---------------------------------------------------------------- opening the right screen from a notification */
  function openFrom(search) {
    const r = PC.route(search); if (!r) return false;
    let tries = 0;
    const go = () => {
      const ready = document.body.classList.contains('authed') && (S.allLeads().length > 0 || tries > 12);
      if (!ready && tries++ < 30) return setTimeout(go, 300);
      if (r.type === 'tab') showTab(r.tab);
      else if (r.type === 'send') { showTab('outreach'); if (window.WS) WS.sendOpen(); }
      else if (r.type === 'lead') { const l = S.anyLead(r.id); if (l && window.OUT) { if (window.SALES && S.setBrandFor) S.setBrandFor(l); OUT.open(r.id, 0, r.tab); } else showTab('leads'); }
    };
    go(); return true;
  }

  /* ---------------------------------------------------------------- the Settings card */
  const ago = iso => { if (!iso) return null; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  const whenText = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function render() {
    const root = $('push-settings'); if (!root) return;
    const p = PC.platform(env()), pr = prefs(), mine = LS.get('yalo_push_endpoint'), srv = state.server;
    const here = !!mine && Notification.permission === 'granted';
    const chip = here ? '<span class="oq-tag" style="background:#dcfce7;color:#15803d">ON for this phone</span>' : p.need === 'blocked' ? '<span class="oq-tag r">Blocked</span>' : '<span class="oq-tag a">Not on yet</span>';
    const steps = {
      install: `<div class="oq-warn" style="display:block"><b>iPhone needs one extra step.</b> Apple only allows notifications for apps on the Home Screen:<ol style="margin:6px 0 0 18px;padding:0"><li>Tap the <b>Share</b> button in Safari (the square with an arrow).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>YALO CRM from the new icon</b> (not from Safari) and come back to this page.</li></ol><div class="oq-sub" style="margin-top:6px">Needs iOS 16.4 or newer.</div></div>`,
      blocked: `<div class="oq-warn" style="display:block"><b>Notifications are blocked for this app.</b> Allow them, then come back:<br>• <b>Android:</b> tap the lock icon by the address, then Permissions, then Notifications, then Allow.<br>• <b>iPhone:</b> Settings, then Notifications, then YALO CRM, then Allow Notifications.</div>`,
      unsupported: `<div class="oq-warn" style="display:block"><b>This browser cannot receive notifications.</b> Use Chrome on Android, or the Home Screen app on iPhone.</div>`
    }[p.need] || '';
    const devs = srv && srv.devices ? srv.devices : [];
    const fresh = srv && srv.lastTick ? (Date.now() - new Date(srv.lastTick) < 3 * 3600000) : false;
    const check = !srv ? (state.serverErr ? `<div class="oq-warn">⚠ ${esc(state.serverErr)}</div>` : '<div class="oq-sub">Checking the server…</div>')
      : `<div class="oq-sub">Server check: ${srv.lastTick ? `<b>${esc(ago(srv.lastTick))}</b>` : '<b>not seen yet</b>'}${srv.lastSend ? ` · last notification sent ${esc(ago(srv.lastSend))}` : ''}</div>${srv.lastTick && !fresh ? '<div class="oq-warn">⚠ The server has not checked for a while. Notifications will wait until it does (the GitHub “Push tick” workflow wakes it every 5 minutes).</div>' : ''}${!srv.lastTick && devs.length ? '<div class="oq-sub">The first check can take up to 5 minutes after setup.</div>' : ''}`;
    root.innerHTML = `<div class="sf-card" style="margin-bottom:18px"><h4 style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>🔔 Notifications, even when the app is closed</span>${chip}</h4>
      <div class="oq-sub" style="margin-bottom:10px">Tasks, your morning summary and send-batch reminders arrive on your phone like any other app. They can come up to about 5 minutes after their time.</div>
      ${steps}
      <div class="oq-acts" style="margin:10px 0">${p.need === 'install' || p.need === 'unsupported' || (here && !state.busy) ? '' : `<button class="btn btn-g" style="min-height:46px;flex:1" onclick="PUSH.enable()" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Turning on…' : '🔔 Turn on for this phone'}</button>`}
        ${here ? `<button class="btn btn-ghost" style="min-height:46px" onclick="PUSH.test()">Send me a test</button><button class="btn btn-ghost" style="min-height:46px" onclick="PUSH.disable()">Turn off here</button>` : ''}</div>
      <label style="display:flex;gap:10px;align-items:center;padding:8px 0;font-size:14px"><input type="checkbox" ${pr.tasks ? 'checked' : ''} onchange="PUSH.pref('tasks',this.checked)"> Task reminders (at the time you set)</label>
      <label style="display:flex;gap:10px;align-items:center;padding:8px 0;font-size:14px"><input type="checkbox" ${pr.morning ? 'checked' : ''} onchange="PUSH.pref('morning',this.checked)"> Morning summary at <input class="fi" type="time" value="${esc(pr.morningTime)}" style="width:120px;padding:6px 8px" onchange="PUSH.pref('morningTime',this.value)"></label>
      <label style="display:flex;gap:10px;align-items:center;padding:8px 0;font-size:14px"><input type="checkbox" ${pr.batches ? 'checked' : ''} onchange="PUSH.pref('batches',this.checked)"> Send-batch reminders (from your daily sending plan)</label>
      <div class="sf-sec">Your phones</div>
      ${devs.length ? devs.map(d => `<div class="sf-row" style="cursor:default"><div class="sf-txt"><div class="sf-name">${esc(d.label)}${d.endpoint === mine ? ' <span class="oq-tag">this phone</span>' : ''}</div><div class="sf-why">Added ${esc(ago(d.added) || '')}</div></div><button class="btn btn-ghost btn-sm" style="min-height:40px" onclick="PUSH.remove('${esc(d.endpoint)}')">Remove</button></div>`).join('') : '<div class="oq-sub">None yet. Turn it on here, and on your other phone too.</div>'}
      <div class="sf-sec">Next up</div>
      ${srv && srv.upcoming && srv.upcoming.length ? srv.upcoming.map(u => `<div class="oq-sub">• ${esc(u.title)} <span style="opacity:.7">(${esc(whenText(u.at))})</span></div>`).join('') : '<div class="oq-sub">Nothing scheduled yet.</div>'}
      <div style="margin-top:10px">${check}</div></div>`;
  }

  /* ---------------------------------------------------------------- hook into the app */
  const API_PUBLIC = window.PUSH = {
    enable, disable, test, sync, render, openFrom, remove: removeDevice, refreshServer,
    async pref(k, v) { try { await savePrefs({ [k]: v }); await sync(true); await refreshServer(); render(); } catch (e) { warn(e.message); } },
    state: () => state
  };
  function setup() {
    const st = $('tab-settings'); if (st && !$('push-settings')) { const d = document.createElement('div'); d.id = 'push-settings'; const first = $('sales-settings'); first ? first.after(d) : st.prepend(d); }
    // the bell panel's "Turn on device alerts" button now turns on real notifications
    window.enablePush = function () { return enable().then(r => { if (typeof updatePushBtn === 'function') updatePushBtn(); if (r && r.need === 'install') { showTab('settings'); } return r; }); };
  }
  function hook() {
    setup(); render();
    const _showTab = window.showTab;
    window.showTab = function (t) { _showTab(t); if (t === 'settings') { render(); refreshServer().then(render); } };
    const _renderAll = window.renderAll; window.renderAll = function () { _renderAll(); syncSoon(); };
    // Tasks change without the app redrawing, so listen to them directly: a finished or moved task must reach the server.
    const wrapReminders = () => { const FB = window.FB; if (!FB || FB.__pushWrapped) return; FB.__pushWrapped = true; const lr = FB.listenReminders.bind(FB); FB.listenReminders = cb => lr(data => { cb(data); syncSoon(); }); };
    if (window.FB) wrapReminders(); window.addEventListener('firebase-ready', wrapReminders);
    const _load = window.loadSettingsUI; window.loadSettingsUI = function () { _load(); const f = document.activeElement; if (!(f && $('push-settings') && $('push-settings').contains(f))) render(); syncSoon(); };
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'yalo-open') openFrom(e.data.search); });
    if (location.search && PC.route(location.search)) { openFrom(location.search); try { history.replaceState({}, '', location.pathname); } catch (e) { /* ignore */ } }
    setTimeout(() => { keepFresh(); }, 6000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { syncSoon(); keepFresh(); } });
    setInterval(() => sync(false), 10 * 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
