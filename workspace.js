/* YALO CRM: workspace. Template editor, Tasks, the daily sending plan with Send mode, the reply sheet,
 * which screens are shown, and a backup download. Loads after sales.js and shares its globals. */
(function () {
  'use strict';
  const YO = window.YO, YS = window.YS, S = window.SALES;
  if (!YO || !YS || !S || !S.util) { console.warn('workspace.js needs sales.js'); return; }
  const U = S.util;
  const $ = id => document.getElementById(id);
  const esc = YO.esc;
  const warn = m => toast(m, 'var(--red)');
  const settingsLoaded = () => settings && Object.keys(settings).length > 0;
  const fmtDay = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const fmtTime = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const live = () => leads.filter(l => !l._deleted);
  const allLive = () => S.allLeads().filter(l => !l._deleted);
  const lineBreaks = s => esc(s).replace(/\n/g, '<br>');
  const save = l => window.FB.saveLead(l);
  const mbox = c => (c && ((c.seq && c.seq.mailbox) || c.mailbox)) || '';
  const W = window.WS = {};

  /* ============================================================ setup (DOM, nav) */
  function setup() {
    if ($('tab-tasks')) return;
    const style = document.createElement('style');
    style.textContent = `
      .ws-task{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start}
      .ws-task.od{border-color:var(--red);background:#fff8f8}.ws-task.done{opacity:.6}
      .ws-ic{font-size:20px;flex:0 0 auto;line-height:1.2}.ws-body{flex:1;min-width:0}
      .ws-note{font-weight:700;font-size:14px;line-height:1.35;word-break:break-word}.ws-meta{font-size:12px;color:var(--muted);margin-top:3px}
      .ws-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ws-act .btn{min-height:40px;display:inline-flex;align-items:center;justify-content:center}
      .ws-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}.ws-chips button{border:1px solid var(--border);background:#fff;border-radius:16px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;min-height:34px}
      .ws-chips button.tok{background:var(--gll);color:var(--gd);border-color:transparent}
      .ws-lint{font-size:12px;line-height:1.5;margin:8px 0}.ws-lint div{display:flex;gap:6px}.ws-lint .ok{color:#15803d}.ws-lint .no{color:#b45309;font-weight:600}
      .ws-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .ws-pbar{height:10px;border-radius:5px;background:var(--border);overflow:hidden;margin:8px 0}.ws-pbar i{display:block;height:100%;background:var(--g)}
      .ws-batches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:10px 0}
      .ws-batch{border:1px solid var(--border);border-radius:10px;padding:8px 4px;text-align:center;font-size:11px;color:var(--muted)}.ws-batch b{display:block;font-size:15px;color:var(--text)}
      .ws-batch.now{border-color:var(--g);background:var(--gll)}.ws-batch.past b{color:#15803d}
      .ws-sendcard{border:2px solid var(--g);border-radius:14px;padding:14px;margin:10px 0;background:var(--gll)}
      .ws-pulse{animation:wsp 1.2s ease-in-out infinite}@keyframes wsp{50%{box-shadow:0 0 0 6px rgba(79,70,229,.25)}}
      @media(max-width:768px){#tab-tasks,#tab-templates{padding-bottom:96px}.ws-act .btn,.ws-chips button{min-height:46px}#ws-settings input,#ws-settings textarea,#ws-settings select,#tab-templates input,#tab-templates textarea,#tab-templates select,.sheet-mo input,.sheet-mo textarea,.sheet-mo select{font-size:16px}.ws-grid2{grid-template-columns:1fr 1fr}}`;
    document.head.appendChild(style);
    const anchor = $('tab-outreach') || $('tab-leads');
    ['templates', 'tasks'].forEach(id => { const d = document.createElement('div'); d.className = 'content'; d.id = 'tab-' + id; d.style.display = 'none'; anchor.after(d); if (typeof TABS !== 'undefined' && !TABS.includes(id)) TABS.push(id); });
    ['send', 'reply', 'task'].forEach(id => { if ($(id + '-mo')) return; const m = document.createElement('div'); m.className = 'cmo sheet-mo'; m.id = id + '-mo'; m.innerHTML = '<div class="cm"><div id="' + id + '-body"></div></div>'; document.body.appendChild(m); });
    // sidebar: Tasks and Templates right after the Email Queue
    const q = document.querySelector('.ni[data-tab="outreach"]');
    if (q) [['tasks', '✅', 'Tasks'], ['templates', '✍️', 'Templates']].reverse().forEach(([id, ic, label]) => {
      const ni = document.createElement('div'); ni.className = 'ni'; ni.dataset.tab = id; ni.setAttribute('onclick', `showTab('${id}')`); ni.innerHTML = `<span style="font-size:17px">${ic}</span><span id="ws-nav-${id}">${label}</span>`; q.after(ni);
    });
    const grid = document.querySelector('#more-sheet .sheet-grid');
    if (grid) [['tasks', '✅', 'Tasks'], ['templates', '✍️', 'Templates']].reverse().forEach(([id, ic, label]) => { const b = document.createElement('button'); b.className = 'sheet-item'; b.setAttribute('onclick', `moreGo('${id}')`); b.innerHTML = `<span>${ic}</span>${label}`; grid.prepend(b); });
    // bottom bar: Tasks before More
    const more = $('bn-more');
    if (more && !$('bn-tasks')) { const b = document.createElement('button'); b.className = 'bn-item'; b.id = 'bn-tasks'; b.setAttribute('onclick', "showTab('tasks')"); b.innerHTML = '<span>✅</span>Tasks'; more.before(b); }
    const st = $('tab-settings'); if (st && !$('ws-settings')) { const d = document.createElement('div'); d.id = 'ws-settings'; const first = $('sales-settings'); first ? first.after(d) : st.prepend(d); }
  }

  /* ============================================================ SCREENS: what is shown */
  function applyScreens() {
    const hidden = YS.hiddenScreens(settings);
    YS.SCREENS.forEach(sc => {
      const off = hidden.includes(sc.id);
      document.querySelectorAll(`.ni[data-tab="${sc.id}"],#bn-${sc.id},[onclick*="showTab('${sc.id}')"],[onclick*="moreGo('${sc.id}')"]`).forEach(el => {
        if (el.classList.contains('content')) return;
        el.style.display = off ? 'none' : '';
      });
    });
    // Home: the greeting button and the four quick tiles point at screens that are useful
    const solid = document.querySelector('.hero-actions .hero-btn.solid');
    if (solid) { if (hidden.includes('scan')) { solid.textContent = '📬 Today\'s queue'; solid.setAttribute('onclick', "showTab('outreach')"); } else { solid.textContent = '📸 Scan a Card'; solid.setAttribute('onclick', "showTab('scan')"); } solid.style.display = ''; }
    const qa = document.querySelector('.qa-grid');
    if (qa) {
      const tiles = [['outreach', '📬', 'Queue'], ['tasks', '✅', 'Tasks'], ['templates', '✍️', 'Templates'], ['objections', '🛡️', 'Objections']];
      qa.innerHTML = tiles.map(([id, ic, lb]) => `<button class="qa" onclick="showTab('${id}')"><div class="qa-ic">${ic}</div><div class="qa-lb">${lb}</div></button>`).join('');
    }
    if (typeof curTab !== 'undefined' && hidden.includes(curTab)) showTab('dashboard');
  }

  /* ============================================================ TASKS */
  const taskUi = { view: 'todo' };
  const leadsById = () => { const m = {}; S.allLeads().forEach(l => { m[l.id] = l; }); return m; };
  function buckets() { return YS.taskBuckets(reminders, leadsById(), new Date(), U.activeBrand()); }
  function dueLabel(t, now) {
    const d = new Date(t.when); const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (t.done) return 'Done';
    if (days > 0) return `<span style="color:var(--red);font-weight:700">${days}d overdue</span>`;
    if (days === 0) return `Today ${fmtTime(d)}`;
    return `${fmtDay(d)} ${fmtTime(d)}`;
  }
  function taskCard(t, kind) {
    const l = t.lead, now = new Date(), lid = l ? esc(l.id) : '', c = l && (l.contacts || [])[0];
    const acts = [];
    if (kind !== 'done') {
      acts.push(`<button class="btn btn-g btn-sm" onclick="WS.taskDone('${esc(t.id)}')">✓ Done</button>`);
      acts.push(`<button class="btn btn-ghost btn-sm" onclick="WS.taskSnooze('${esc(t.id)}',1)">⏰ Tomorrow</button>`);
      if (l) acts.push(`<button class="btn btn-ghost btn-sm" onclick="SALES.call('${lid}',0)">📞 Call mode</button>`);
    } else acts.push(`<button class="btn btn-ghost btn-sm" onclick="WS.taskUndo('${esc(t.id)}')">↩ Undo</button>`);
    const more = [];
    if (l) more.push(`<button class="btn btn-ghost btn-sm" onclick="OUT.open('${lid}',0,'overview')">Open lead</button>`);
    if (kind !== 'done') { more.push(`<button class="btn btn-ghost btn-sm" onclick="WS.taskSnooze('${esc(t.id)}',3)">+3 days</button>`, `<button class="btn btn-ghost btn-sm" onclick="WS.taskSnooze('${esc(t.id)}',7)">+1 week</button>`); }
    more.push(`<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="WS.taskDelete('${esc(t.id)}')">🗑 Delete</button>`);
    return `<div class="ws-task ${kind === 'overdue' ? 'od' : ''} ${kind === 'done' ? 'done' : ''}"><div class="ws-ic">${YS.taskIcon(t.note)}</div><div class="ws-body">
      <div class="ws-note">${esc(t.note)}</div>
      <div class="ws-meta">${dueLabel(t, now)}${l ? ' · ' + esc(l.company) : t.company ? ' · ' + esc(t.company) : ''}${c && c.name ? ' · ' + esc(c.name) : ''}</div>
      <div class="ws-act">${acts.join('')}</div>
      <details class="oq-more" style="margin-top:2px"><summary>More</summary><div class="oq-more-grid">${more.join('')}</div></details></div></div>`;
  }
  function renderTasks() {
    const root = $('tab-tasks'); if (!root) return;
    const b = buckets(), todo = b.overdue.length + b.today.length;
    const seg = (id, label, n) => `<button class="${taskUi.view === id ? 'on' : ''}" onclick="WS.taskView('${id}')">${label}${n ? ' ' + n : ''}</button>`;
    let body = '';
    if (taskUi.view === 'todo') {
      body = (b.overdue.length ? `<div class="oq-h" style="color:var(--red)">Overdue (${b.overdue.length})</div>${b.overdue.map(t => taskCard(t, 'overdue')).join('')}` : '') +
        (b.today.length ? `<div class="oq-h">Today (${b.today.length})</div>${b.today.map(t => taskCard(t, 'today')).join('')}` : '') +
        (!todo ? `<div class="card" style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Nothing to do right now. 🎉<br>${b.upcoming.length ? b.upcoming.length + ' coming up.' : 'Tasks appear here when you log a call or a reply.'}</div>` : '');
    } else if (taskUi.view === 'upcoming') body = b.upcoming.length ? b.upcoming.map(t => taskCard(t, 'upcoming')).join('') : '<div class="oq-sub">Nothing scheduled.</div>';
    else body = b.done.length ? b.done.slice(0, 40).map(t => taskCard(t, 'done')).join('') : '<div class="oq-sub">Nothing completed yet.</div>';
    root.innerHTML = `<div class="sec-head" style="margin-top:0"><h3>Tasks</h3><a onclick="WS.taskNew()">＋ New task</a></div>
      <div class="oq-sub" style="margin:-6px 0 12px">Created for you after every call, reply and objection, so nothing is forgotten.</div>
      <div class="sf-seg">${seg('todo', 'To do', todo)}${seg('upcoming', 'Upcoming', b.upcoming.length)}${seg('done', 'Done', 0)}</div>${body}`;
    refreshBadges();
  }
  function refreshBadges() {
    const b = buckets(), n = b.overdue.length + b.today.length;
    const bn = $('bn-tasks'); if (bn && bn.lastChild) bn.lastChild.textContent = n ? 'Tasks ' + n : 'Tasks';
    const sn = $('ws-nav-tasks'); if (sn) sn.textContent = n ? `Tasks (${n})` : 'Tasks';
  }
  const taskById = id => reminders.find(r => r.id === id);
  Object.assign(W, {
    taskView(v) { taskUi.view = v; renderTasks(); },
    async taskDone(id) { const r = taskById(id); if (!r) return; await window.FB.saveReminder(Object.assign({}, r, { done: true, doneAt: new Date().toISOString() })); toast('Done ✓'); },
    async taskUndo(id) { const r = taskById(id); if (!r) return; await window.FB.saveReminder(Object.assign({}, r, { done: false })); },
    async taskSnooze(id, days) { const r = taskById(id); if (!r) return; const when = new Date(); when.setDate(when.getDate() + days); when.setHours(9, 0, 0, 0); await window.FB.saveReminder(Object.assign({}, r, { when: when.toISOString(), fired: false, pushed: false })); toast('Moved to ' + fmtDay(when)); },
    async taskDelete(id) { if (!confirm('Delete this task?')) return; await window.FB.deleteReminder(id); toast('Deleted'); },
    taskNew() {
      const opts = live().map(l => `<option value="${esc(l.id)}">${esc(l.company)}${l.contacts && l.contacts[0] && l.contacts[0].name ? ' · ' + esc(l.contacts[0].name) : ''}</option>`).join('');
      U.openSheet('task', `<div class="cmtitle">New task</div><div class="cmsub">Something you need to do for a lead.</div>
        <label class="fl">Lead (optional)</label><select class="fsel" id="nt-lead" style="width:100%"><option value="">No lead</option>${opts}</select>
        <label class="fl" style="margin-top:12px">What to do</label><input class="fi" id="nt-note" placeholder="e.g. Call back about the lease renewal">
        <label class="fl" style="margin-top:12px">When</label>
        <div class="ws-chips">${[['In 1 hour', 'h1'], ['Today 5pm', 't17'], ['Tomorrow 9am', 'd1'], ['In 3 days', 'd3'], ['Next Monday', 'mon']].map(([l, k]) => `<button onclick="WS.ntWhen('${k}')">${l}</button>`).join('')}</div>
        <input class="fi" id="nt-when" type="datetime-local">
        <div class="imp-foot"><div style="display:flex;gap:8px;flex:1;justify-content:flex-end"><button class="btn btn-ghost" onclick="SALES.util.closeSheet('task')">Cancel</button><button class="btn btn-g" onclick="WS.ntSave()">Save task</button></div></div>`);
      W.ntWhen('d1');
    },
    ntWhen(k) {
      const d = new Date(); if (k === 'h1') d.setHours(d.getHours() + 1); else if (k === 't17') d.setHours(17, 0, 0, 0); else if (k === 'd1') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); } else if (k === 'd3') { d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); } else { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0); }
      const p = n => String(n).padStart(2, '0'); $('nt-when').value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    },
    async ntSave() {
      const note = YO.clean($('nt-note').value, 300), v = $('nt-when').value; if (!note) return warn('Write what needs doing.'); if (!v) return warn('Choose when.');
      const l = S.anyLead($('nt-lead').value), c = l && (l.contacts || [])[0] || {};
      await window.FB.saveReminder({ id: uid(), leadId: l ? l.id : null, company: l ? l.company : '', contactName: c.name || '', phone: c.phone || '', note, when: new Date(v).toISOString(), done: false, fired: false, createdAt: new Date().toISOString(), source: 'manual' });
      U.closeSheet('task'); toast('Task saved ✓');
    }
  });

  /* ============================================================ REPLY SHEET (what did they say?) */
  const rep = { leadId: '', ci: 0, meet: false };
  const REPLY_IDS = ['interested', 'send_info', 'meeting', 'not_now', 'wrong_person', 'ooo', 'not_interested', 'dnc'];
  Object.assign(S, {
    replySheet(leadId, ci) {
      setup(); const l = S.anyLead(leadId); if (!l) return; rep.leadId = leadId; rep.ci = ci || 0; rep.meet = false; renderReply(); $('reply-mo').classList.add('open');
    }
  });
  function renderReply() {
    const l = S.anyLead(rep.leadId); if (!l) return; const c = (l.contacts || [])[rep.ci] || {};
    const outs = REPLY_IDS.map(id => YS.OUTCOMES.find(o => o.id === id)).filter(Boolean);
    U.openSheet('reply', `<div style="display:flex;justify-content:space-between;gap:10px"><div><div class="cmtitle" style="margin:0">They replied</div><div class="cmsub" style="margin:2px 0 0">${esc(c.name || l.company)} at ${esc(l.company)}. What did they say?</div></div><button class="mx" onclick="SALES.util.closeSheet('reply')">✕</button></div>
      <div class="sf-out">${outs.map(o => `<button class="btn btn-ghost" onclick="WS.replyPick('${o.id}')">${o.icon}<br>${esc(o.id === 'ooo' ? 'Out of office' : o.label)}</button>`).join('')}</div>
      ${rep.meet ? `<div class="sf-card" style="margin-top:10px"><label class="fl">When is the meeting?</label><input class="fi" id="rep-meet" type="datetime-local"><div class="oq-acts" style="margin-top:8px"><button class="btn btn-g" style="min-height:46px;flex:1" onclick="WS.replyMeeting()">Save meeting and reminders</button></div></div>` : ''}
      <div class="oq-sub" style="margin-top:10px">This stops the rest of the sequence, moves the lead to the right stage and creates your next task.</div>`);
  }
  async function doReply(id, meetingAt) {
    const l = S.anyLead(rep.leadId); if (!l) return; const ci = rep.ci, c = (l.contacts || [])[ci] || {};
    if (id === 'dnc' && !confirm(`Mark ${c.name || 'this person'} as do-not-contact? No more messages will be queued, even if they appear in a future import.`)) return;
    const now = new Date(); let n = 0;
    if (id !== 'ooo') { const r = YO.markReplied(l, ci, now); if (r) n = r.idx + 1; }
    const res = YS.applyOutcome(l, ci, id, now, { via: 'email', meetingAt }); if (!res) return;
    await save(l);
    if (id !== 'ooo' && n) await addAct({ leadId: l.id, type: 'email', company: l.company, desc: `Reply received from ${c.name || 'this person'} (email ${n})` });
    await addAct({ leadId: l.id, type: 'note', company: l.company, desc: res.activity });
    if (res.stageChanged) await addAct({ leadId: l.id, type: 'status', company: l.company, desc: `Stage: ${res.stageChanged[0]} -> ${res.stageChanged[1]}` });
    for (const t of res.tasks) await U.createTask(l, ci, t);
    if (res.dnc && window.OUT && OUT.persistDnc) await OUT.persistDnc(c.email, true);
    U.closeSheet('reply'); toast('Reply logged ✓' + (res.tasks[0] ? ` Next: ${res.tasks[0].note}` : ''));
    if (window.OUT) OUT.refresh();
  }
  Object.assign(W, {
    async replyPick(id) { const o = YS.OUTCOMES.find(x => x.id === id); if (o && o.needsDate) { rep.meet = true; renderReply(); return; } await doReply(id, null); },
    async replyMeeting() { const v = ($('rep-meet') || {}).value; if (!v) return warn('Choose the meeting date and time.'); const at = new Date(v); if (isNaN(at) || at < new Date()) return warn('Pick a time in the future.'); await doReply('meeting', at); }
  });

  /* ============================================================ TEMPLATES (editor) */
  const tpl = { id: null, draft: null, open: 0, dirty: false, isNew: false };
  const CHLAB = { email: '✉ Email', dm: '💬 DM', comment: '🗨 Comment' };
  function seqRows() {
    const b = U.activeBrand(); const ids = Object.keys(YS.SEQUENCES).filter(id => b === 'all' || YS.SEQUENCES[id].brand === b);
    return ids.sort((a, c) => (YS.SEQUENCES[a].brand === YS.SEQUENCES[c].brand ? 0 : YS.SEQUENCES[a].brand < YS.SEQUENCES[c].brand ? 1 : -1) || a.localeCompare(c));
  }
  function renderTemplates() {
    const root = $('tab-templates'); if (!root) return;
    if (tpl.draft) return renderEditor();
    const stats = YS.seqStats(S.allLeads());
    const cards = seqRows().map(id => {
      const s = YS.SEQUENCES[id], st = stats[id], p = U.profiles()[s.brand], days = s.steps.length ? s.steps[s.steps.length - 1].day : 0;
      const rate = st && st.sent ? Math.round(st.replied / st.sent * 100) : null;
      return `<div class="sf-card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><div class="sf-name">${esc(s.name)}</div><div class="sf-why">${esc(s.audience || '')}</div></div><span class="sf-chip" style="background:${p.color};color:#fff">${esc(p.name)}</span></div>
        <div class="oq-sub" style="margin-top:8px">${s.steps.length} steps over ${days} days · ${[...new Set(s.steps.map(x => (CHLAB[x.channel] || '')))].join(' ')}${s.custom ? ' · <b>edited</b>' : ''}</div>
        <div class="oq-sub">${st && st.sent ? `Sent ${st.sent} · replies ${st.replied}${rate != null ? ` (${rate}%)` : ''}` : 'Not used yet'}</div>
        <div class="sf-btns"><button class="btn btn-g btn-sm" onclick="WS.tplEdit('${esc(id)}')">✏️ Edit</button><button class="btn btn-ghost btn-sm" onclick="WS.tplDup('${esc(id)}')">⧉ Duplicate</button></div></div>`;
    }).join('');
    root.innerHTML = `<div class="sec-head" style="margin-top:0"><h3>Templates</h3><a onclick="WS.tplNew()">＋ New sequence</a></div>
      <div class="oq-sub" style="margin:-6px 0 12px">The messages each person receives. Edit the wording, the timing and the channel of any step. Changes apply to messages not yet sent. Test one change at a time and watch the reply numbers.</div>${cards || '<div class="oq-sub">No sequences for this company.</div>'}`;
  }
  const stepStats = (id, i) => { const st = YS.seqStats(S.allLeads())[id]; return st && st.steps[i] && st.steps[i].sent ? `Sent ${st.steps[i].sent} · replies ${st.steps[i].replied}` : ''; };
  function chipsFor(i) { return YS.TOKENS.map(([k]) => `<button class="tok" onclick="WS.tplToken(${i},'${k}')">{${k}}</button>`).join(''); }
  function lintHtml(step, i) { return YS.lintStep(step, i).map(x => `<div class="${x.ok ? 'ok' : 'no'}"><span>${x.ok ? '✓' : '⚠'}</span><span>${esc(x.text)}</span></div>`).join(''); }
  function previewHtml(step) {
    const p = U.profiles()[tpl.draft.brand], who = tpl.draft.brand === 'clearpath' ? 'Tom at Tech Tom' : 'Jane (CFO) at Acme Ltd';
    try { const r = YS.renderSample(step, tpl.draft.brand, p, U.sender({ brand: tpl.draft.brand })); return `<div class="oq-sub">Preview, as ${esc(who)} would see it:</div><div class="sf-quote">${r.subject ? '<b>' + esc(r.subject) + '</b>\n\n' : ''}${esc(r.body)}</div>`; } catch (e) { return ''; }
  }
  function stepHtml(s, i) {
    const n = tpl.draft.steps.length, id = tpl.id;
    return `<details class="sf-det" id="tpl-step-${i}" ${tpl.open === i ? 'open' : ''} ontoggle="if(this.open)WS.tplOpen(${i})"><summary><span>Step ${i + 1} · day ${s.day} · ${CHLAB[s.channel]}<span style="font-weight:500;color:var(--muted)"> · ${esc(s.label)}</span></span></summary><div>
      ${stepStats(id, i) ? `<div class="oq-sub">${esc(stepStats(id, i))}</div>` : ''}
      <div class="ws-grid2"><div><label class="fl">Channel</label><select class="fsel" style="width:100%" onchange="WS.tplSet(${i},'channel',this.value,true)">${YS.CHANNELS.map(c => `<option value="${c}" ${s.channel === c ? 'selected' : ''}>${CHLAB[c]}</option>`).join('')}</select></div>
        <div><label class="fl">Day (from the first step)</label><input class="fi" type="number" min="0" max="365" value="${s.day}" oninput="WS.tplSet(${i},'day',this.value)"></div></div>
      <label class="fl" style="margin-top:10px">Name of this step</label><input class="fi" value="${esc(s.label)}" oninput="WS.tplSet(${i},'label',this.value)">
      ${s.channel === 'email' ? `<label class="fl" style="margin-top:10px">Subject</label><input class="fi" value="${esc(s.subject)}" oninput="WS.tplSet(${i},'subject',this.value)">` : ''}
      <label class="fl" style="margin-top:10px">${s.channel === 'email' ? 'Message' : s.channel === 'dm' ? 'Direct message' : 'Comment (guidance)'}</label>
      <textarea class="fi" id="tpl-body-${i}" style="min-height:170px" oninput="WS.tplSet(${i},'body',this.value)">${esc(s.body)}</textarea>
      <div class="oq-sub" style="margin-top:6px">Tap to insert a placeholder:</div><div class="ws-chips">${chipsFor(i)}</div>
      <div id="tpl-prev-${i}">${previewHtml(s)}</div>
      <div class="sf-sec">Playbook checklist</div><div class="ws-lint" id="tpl-lint-${i}">${lintHtml(s, i)}</div>
      <div id="tpl-ai-${i}"></div>
      <div class="sf-btns"><button class="btn btn-ghost btn-sm" onclick="WS.tplAi(${i})">✨ Improve with AI</button><button class="btn btn-ghost btn-sm" onclick="WS.tplMove(${i},-1)" ${i === 0 ? 'disabled' : ''}>↑ Move up</button><button class="btn btn-ghost btn-sm" onclick="WS.tplMove(${i},1)" ${i === n - 1 ? 'disabled' : ''}>↓ Move down</button><button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="WS.tplDel(${i})">🗑 Remove step</button></div></div></details>`;
  }
  function renderEditor() {
    const root = $('tab-templates'), d = tpl.draft, id = tpl.id, p = U.profiles()[d.brand];
    const builtIn = YS.isBuiltIn(id), edited = YS.isEdited(id);
    root.innerHTML = `<div class="sec-head" style="margin-top:0"><h3>${tpl.isNew ? 'New sequence' : 'Edit sequence'}</h3><a onclick="WS.tplBack()">← Back</a></div>
      <div class="sf-card"><label class="fl">Name</label><input class="fi" value="${esc(d.name)}" oninput="WS.tplMeta('name',this.value)">
        <label class="fl" style="margin-top:10px">Who it is for</label><input class="fi" value="${esc(d.audience || '')}" oninput="WS.tplMeta('audience',this.value)">
        <div class="oq-sub" style="margin-top:8px">Company: <b>${esc(p.name)}</b>. Each person who starts this sequence keeps the number of steps it had when they started. Edit the wording freely.</div></div>
      ${d.steps.map((s, i) => stepHtml(s, i)).join('')}
      <button class="btn btn-ghost" style="width:100%;min-height:46px;margin-bottom:12px" onclick="WS.tplAdd()">＋ Add a step</button>
      <div id="tpl-errs"></div>
      <button class="btn btn-g" style="width:100%;min-height:50px" onclick="WS.tplSave()">Save sequence</button>
      <div class="sf-btns"><button class="btn btn-ghost btn-sm" onclick="WS.tplTest()">✉ Send step 1 to myself</button>${builtIn && edited ? `<button class="btn btn-ghost btn-sm" onclick="WS.tplReset()">↺ Back to the original</button>` : ''}${!builtIn ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="WS.tplRemove()">🗑 Delete sequence</button>` : ''}</div>`;
  }
  function panel(i) { const s = tpl.draft.steps[i]; if (!s) return; const a = $('tpl-prev-' + i), b = $('tpl-lint-' + i); if (a) a.innerHTML = previewHtml(s); if (b) b.innerHTML = lintHtml(s, i); const sm = document.querySelector(`#tpl-step-${i} summary span`); if (sm) sm.innerHTML = `Step ${i + 1} · day ${s.day} · ${CHLAB[s.channel]}<span style="font-weight:500;color:var(--muted)"> · ${esc(s.label)}</span>`; }
  Object.assign(W, {
    tplEdit(id) { const s = YS.SEQUENCES[id]; if (!s) return; tpl.id = id; tpl.draft = JSON.parse(JSON.stringify({ brand: s.brand, name: s.name, audience: s.audience, steps: s.steps })); tpl.open = 0; tpl.isNew = false; renderTemplates(); window.scrollTo(0, 0); },
    tplDup(id) { const s = YS.SEQUENCES[id]; if (!s) return; tpl.id = YS.newSequenceId(s.brand); tpl.draft = JSON.parse(JSON.stringify({ brand: s.brand, name: s.name + ' (copy)', audience: s.audience, steps: s.steps })); tpl.open = 0; tpl.isNew = true; renderTemplates(); window.scrollTo(0, 0); },
    tplNew() { const b = U.activeBrand() === 'all' ? 'yalo' : U.activeBrand(); tpl.id = YS.newSequenceId(b); tpl.draft = { brand: b, name: 'My sequence', audience: '', steps: [{ day: 0, channel: 'email', label: 'First email', subject: '', body: 'Hi {first_name},\n\n\n\nIs this on your radar?' }] }; tpl.open = 0; tpl.isNew = true; renderTemplates(); },
    tplBack() { if (tpl.dirty && !confirm('Leave without saving your changes?')) return; tpl.draft = null; tpl.dirty = false; renderTemplates(); },
    tplOpen(i) { tpl.open = i; },
    tplMeta(k, v) { tpl.draft[k] = v; tpl.dirty = true; },
    tplSet(i, k, v, rerender) { const s = tpl.draft.steps[i]; s[k] = k === 'day' ? Math.max(0, parseInt(v, 10) || 0) : v; tpl.dirty = true; if (rerender) { tpl.open = i; renderEditor(); } else panel(i); },
    tplToken(i, k) { const el = $('tpl-body-' + i), s = tpl.draft.steps[i]; const a = el.selectionStart == null ? el.value.length : el.selectionStart, b = el.selectionEnd == null ? a : el.selectionEnd; const pre = el.value.slice(0, a), sp = pre && !/[\s("']$/.test(pre) ? ' ' : ''; s.body = pre + sp + '{' + k + '}' + el.value.slice(b); el.value = s.body; el.focus(); const pos = a + sp.length + k.length + 2; el.setSelectionRange(pos, pos); tpl.dirty = true; panel(i); },
    tplAdd() { const st = tpl.draft.steps, last = st[st.length - 1] || { day: 0, channel: 'email' }; if (st.length >= 12) return warn('Twelve steps is the most.'); st.push({ day: last.day + 3, channel: last.channel, label: 'Step ' + (st.length + 1), subject: '', body: 'Hi {first_name},\n\n' }); tpl.open = st.length - 1; tpl.dirty = true; renderEditor(); },
    tplDel(i) { if (tpl.draft.steps.length <= 1) return warn('A sequence needs at least one step.'); if (!confirm('Remove step ' + (i + 1) + '?')) return; tpl.draft.steps.splice(i, 1); tpl.open = Math.max(0, i - 1); tpl.dirty = true; renderEditor(); },
    tplMove(i, d) { const st = tpl.draft.steps, j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; const day = st[i].day; st[i].day = st[j].day; st[j].day = day; /* the timing stays with the slot */ tpl.open = j; tpl.dirty = true; renderEditor(); },
    async tplSave() {
      if (!settingsLoaded()) return warn('Settings are still loading. Try again in a moment.');
      const clean = YS.sanitizeSequence(tpl.draft, tpl.draft.brand); const errs = YS.validateSequence(clean);
      if (errs.length) { $('tpl-errs').innerHTML = errs.map(e => `<div class="oq-warn">⚠ ${esc(e)}</div>`).join(''); return; }
      if (YS.isBuiltIn(tpl.id)) clean.base = tpl.id;
      const custom = Object.assign({}, settings.customSequences || {}, { [tpl.id]: clean });
      await window.FB.saveSettings(Object.assign({}, settings, { customSequences: custom }));
      YS.setCustomSequences(custom); tpl.dirty = false; tpl.draft = null; toast('Saved ✓ New wording applies to messages not yet sent.'); renderTemplates();
    },
    async tplReset() { if (!confirm('Go back to the original wording for this sequence?')) return; const custom = Object.assign({}, settings.customSequences || {}); delete custom[tpl.id]; await window.FB.saveSettings(Object.assign({}, settings, { customSequences: custom })); YS.setCustomSequences(custom); tpl.dirty = false; tpl.draft = null; toast('Back to the original'); renderTemplates(); },
    async tplRemove() {
      const used = allLive().some(l => (l.contacts || []).some(c => c.seq && c.seq.type === tpl.id)); if (used && !confirm('People are using this sequence. Their remaining steps will fall back to a default. Delete anyway?')) return; if (!used && !confirm('Delete this sequence?')) return;
      const custom = Object.assign({}, settings.customSequences || {}); delete custom[tpl.id]; await window.FB.saveSettings(Object.assign({}, settings, { customSequences: custom })); YS.setCustomSequences(custom); tpl.dirty = false; tpl.draft = null; toast('Deleted'); renderTemplates();
    },
    tplTest() {
      const to = YO.normEmail(settings.email); if (!to) return warn('Add your own email address in Settings (My details) first.');
      const s = tpl.draft.steps[0], p = U.profiles()[tpl.draft.brand], r = YS.renderSample(s, tpl.draft.brand, p, U.sender({ brand: tpl.draft.brand }));
      window.open(YO.gmail(to, r.subject || 'Test message', YO.addFooter(r.body, U.sender({ brand: tpl.draft.brand }))), '_blank', 'noopener');
    },
    async tplAi(i) {
      const s = tpl.draft.steps[i], box = $('tpl-ai-' + i); box.innerHTML = '<div class="oq-sub">Writing…</div>';
      try {
        const out = await U.ai('template', { brand: U.profiles()[tpl.draft.brand], channel: s.channel, audience: tpl.draft.audience, label: s.label, subject: s.subject, draft: s.body });
        const why = (out.text.match(/\nWHY:\s*([\s\S]*)$/i) || [])[1] || ''; const main = out.text.replace(/\n+WHY:[\s\S]*$/i, '').trim();
        const m = s.channel === 'email' ? main.match(/^Subject:\s*(.+)\n+([\s\S]*)$/i) : null; W._ai = { i, subject: m ? m[1].trim() : s.subject, body: m ? m[2].trim() : main };
        box.innerHTML = `<div class="sf-sec">Suggested version</div><div class="sf-quote">${W._ai.subject && s.channel === 'email' ? '<b>' + esc(W._ai.subject) + '</b>\n\n' : ''}${esc(W._ai.body)}</div>${why ? `<div class="oq-sub">${esc(why.trim())}</div>` : ''}<div class="oq-acts" style="margin-top:8px"><button class="btn btn-g btn-sm" style="min-height:44px" onclick="WS.tplAiUse()">Use this version</button><button class="btn btn-ghost btn-sm" style="min-height:44px" onclick="document.getElementById('tpl-ai-${i}').innerHTML=''">Dismiss</button></div>`;
      } catch (e) { box.innerHTML = ''; if (e.message !== 'no key') warn(e.message); }
    },
    tplAiUse() { const a = W._ai; if (!a) return; const s = tpl.draft.steps[a.i]; if (s.channel === 'email') s.subject = a.subject; s.body = a.body; tpl.dirty = true; tpl.open = a.i; renderEditor(); toast('Applied. Save to keep it.'); }
  });

  /* ============================================================ DAILY SENDING PLAN + SEND MODE */
  const planCfg = () => YS.planConfig(settings);
  const allQueue = () => YO.buildQueue(allLive(), new Date());
  function planStatus() { return YS.planStatus(planCfg(), S.allActs(), allQueue(), new Date()); }
  function planCard(compact) {
    const cfg = planCfg(), p = planStatus(), pct = Math.min(100, Math.round(p.sent / Math.max(1, p.target) * 100));
    const next = p.nextBatch && p.dueNow === 0 && !p.done ? `Next batch at ${p.nextBatch.time}` : '';
    return `<div class="sf-card"><h4 style="display:flex;justify-content:space-between;align-items:center"><span>Today's sending</span><span style="font-weight:600;font-size:13px">${p.sent} of ${p.target}</span></h4>
      <div class="ws-pbar"><i style="width:${pct}%"></i></div>
      <div class="ws-batches">${p.batches.map((b, i) => `<div class="ws-batch ${i === p.current ? 'now' : ''} ${p.sent >= b.cum ? 'past' : ''}"><b>${b.target}</b>${esc(b.time)}</div>`).join('')}</div>
      ${compact ? '' : `<div class="oq-sub">${p.perMailbox.map(m => `${m.email ? esc(m.email) : 'Your mailbox'}: ${m.sent}/${m.cap}`).join(' · ')}</div>`}
      ${p.warnings.slice(0, compact ? 1 : 4).map(w => `<div class="oq-warn">⚠ ${esc(w)}</div>`).join('')}
      <div class="oq-acts" style="margin-top:8px"><button class="btn btn-g" style="min-height:46px;flex:1" onclick="WS.sendOpen()" ${p.available ? '' : 'disabled'}>${p.done ? '✓ Today is done' : p.dueNow ? `▶ Start sending (${p.dueNow} ready now)` : p.available ? '▶ Open Send mode' : 'Nothing ready to send'}</button></div>
      ${next ? `<div class="oq-sub" style="margin-top:6px">${next}. You can still send ahead.</div>` : ''}</div>`;
  }
  S.afterQueue = function () { const slot = $('sf-plan-slot'); if (slot) slot.innerHTML = planCard(false); };
  S.seqMeta = function (lead, contact, type) { const m = YS.sequenceMeta(lead, contact, type); const cfg = planCfg(); if (cfg.mailboxes.length) { const pick = YS.mailboxPicker(cfg.mailboxes, S.allLeads()); m.mailbox = pick(); } return m; };
  S.importMeta = function () { const cfg = planCfg(); const pick = cfg.mailboxes.length ? YS.mailboxPicker(cfg.mailboxes, S.allLeads()) : null; return (l, ci) => { const m = YS.sequenceMeta(l, l.contacts[ci]); if (pick) m.mailbox = pick(); return m; }; };

  // Everyone with a running sequence gets one mailbox, so follow-ups always come from the same address.
  async function assignMissingMailboxes() {
    const cfg = planCfg(); if (!cfg.mailboxes.length) return 0;
    const pick = YS.mailboxPicker(cfg.mailboxes, S.allLeads()); let n = 0;
    for (const l of allLive()) {
      let changed = false;
      (l.contacts || []).forEach((c, ci) => {
        const st = YO.seqState(l, ci); if (!st || YO.stopReason(l, ci, st) || mbox(c)) return;
        if (st.kind === 'contact') c.seq.mailbox = pick(); else c.mailbox = pick(); changed = true;
      });
      if (changed) { await save(l); n++; }
    }
    return n;
  }
  // ---- Send mode ----
  const send = { skipped: new Set(), ahead: false, pending: false, lastAt: 0, timer: null };
  function sendItems() {
    const st = planStatus();
    return allQueue().filter(q => q.when !== 'upcoming' && !q.noEmail && !send.skipped.has(q.lead.id + ':' + q.ci)).filter(q => {
      const c = (q.lead.contacts || [])[q.ci] || {};
      const r = YO.renderStep(q.lead, q.ci, q.idx, t => YS.templatesFor(t, legacyTpl()), { brand: U.profiles()[YS.brandOf(q.lead)], sender: U.sender(q.lead) });
      if (r.channel !== 'email') return false;                                   // DMs and comments are sent from the queue
      if (YO.leftoverTokens(r.subject + ' ' + r.body).length) return false;      // never send a placeholder
      const m = st.perMailbox.find(x => x.email === mbox(c));
      if (m && m.sent >= m.cap) return false;                                    // that mailbox is done for today
      return true;
    });
  }
  const legacyTpl = () => ({ office: typeof OFFICE_SCRIPTS !== 'undefined' ? OFFICE_SCRIPTS : [], employer: typeof EMPLOYER_SCRIPTS !== 'undefined' ? EMPLOYER_SCRIPTS : [] });
  function composeFor(q) {
    const r = YO.renderStep(q.lead, q.ci, q.idx, t => YS.templatesFor(t, legacyTpl()), { brand: U.profiles()[YS.brandOf(q.lead)], sender: U.sender(q.lead) });
    return { subject: r.subject, body: YO.addFooter(r.body, U.sender(q.lead)), label: r.label };
  }
  function renderSend() {
    const cfg = planCfg(), p = planStatus(), items = sendItems(), q = items[0];
    const gapLeft = Math.max(0, Math.ceil(cfg.minGapMin * 60 - (Date.now() - send.lastAt) / 1000));
    const onPace = p.dueNow <= 0 && !send.ahead;
    let main = '';
    if (!q) main = `<div class="sf-card" style="text-align:center">${p.done ? '🎉 Today\'s target is done.' : 'Nothing else is ready to send right now.'}<div class="oq-sub" style="margin-top:6px">Emails that still contain a placeholder or whose mailbox hit today's limit are skipped. Check the queue for them.</div></div>`;
    else if (onPace && !p.done) main = `<div class="sf-card" style="text-align:center"><b>You are on pace.</b><div class="oq-sub" style="margin:6px 0 10px">Next batch${p.nextBatch ? ' at ' + esc(p.nextBatch.time) : ''}. Spacing the day protects your address.</div><button class="btn btn-ghost" style="min-height:46px" onclick="WS.sendAhead()">Send ahead anyway</button></div>`;
    else {
      const c = (q.lead.contacts || [])[q.ci] || {}, f = composeFor(q), to = YO.normEmail(c.email), box = mbox(c);
      main = `<div class="ws-sendcard"><div style="font-weight:800">${esc(c.name || q.lead.company)}${c.title ? ` <span style="font-weight:500;color:var(--muted)">· ${esc(c.title)}</span>` : ''}</div>
        <div class="oq-sub">${esc(q.lead.company)} · ${esc(f.label)} · ${esc(to)}${box ? '<br>From <b>' + esc(box) + '</b>' : ''}</div>
        <div class="sf-quote" style="max-height:160px;overflow:auto"><b>${esc(f.subject)}</b>\n\n${esc(f.body)}</div>
        <div class="oq-primary"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" onclick="WS.sendOpened()" href="${esc(YO.gmail(to, f.subject, f.body, box))}">✉ Open Gmail</a><a class="btn btn-ghost btn-sm" onclick="WS.sendOpened()" href="${esc(YO.mailto(to, f.subject, f.body))}">📱 Mail app</a>
          <button class="btn btn-g oq-go ${send.pending ? 'ws-pulse' : ''}" ${gapLeft ? 'disabled' : ''} onclick="WS.sendDone('${esc(q.lead.id)}',${q.ci},${q.idx})">${gapLeft ? `Wait ${Math.floor(gapLeft / 60)}:${String(gapLeft % 60).padStart(2, '0')} before the next one` : '✓ I sent it, next one'}</button></div>
        <div class="oq-acts" style="margin-top:8px">${gapLeft ? `<button class="btn btn-ghost btn-sm" style="min-height:44px" onclick="WS.sendGapSkip()">Send now anyway</button>` : ''}<button class="btn btn-ghost btn-sm" style="min-height:44px" onclick="WS.sendSkip('${esc(q.lead.id)}',${q.ci})">Skip for now</button><button class="btn btn-ghost btn-sm" style="min-height:44px" onclick="WS.sendEdit('${esc(q.lead.id)}',${q.ci})">✏️ Edit</button><button class="btn btn-ghost btn-sm" style="min-height:44px" onclick="SALES.personalise('${esc(q.lead.id)}',${q.ci},${q.idx})">✨ Personalise</button></div></div>`;
    }
    U.openSheet('send', `<div style="display:flex;justify-content:space-between;gap:10px"><div><div class="cmtitle" style="margin:0">Send mode</div><div class="cmsub" style="margin:2px 0 0">${p.sent} of ${p.target} sent today · ${items.length} ready</div></div><button class="mx" onclick="WS.sendClose()">✕</button></div>
      <div class="ws-pbar"><i style="width:${Math.min(100, Math.round(p.sent / Math.max(1, p.target) * 100))}%"></i></div>${main}
      ${p.warnings.slice(0, 2).map(w => `<div class="oq-warn">⚠ ${esc(w)}</div>`).join('')}
      <div class="oq-sub">Tap Open Gmail, press Send there, come back and tap the green button. Each person is always emailed from the same mailbox.</div>`);
    clearInterval(send.timer);
    if (gapLeft && q) send.timer = setInterval(() => { if (!$('send-mo').classList.contains('open')) return clearInterval(send.timer); renderSend(); }, 1000);
  }
  Object.assign(W, {
    async sendOpen() { setup(); send.skipped = new Set(); send.ahead = false; send.pending = false; await assignMissingMailboxes(); renderSend(); $('send-mo').classList.add('open'); },
    sendClose() { clearInterval(send.timer); U.closeSheet('send'); if (window.OUT) OUT.refresh(); },
    sendAhead() { send.ahead = true; renderSend(); },
    sendOpened() { send.pending = true; setTimeout(renderSend, 300); },
    sendGapSkip() { send.lastAt = 0; renderSend(); },
    sendSkip(id, ci) { send.skipped.add(id + ':' + ci); send.pending = false; renderSend(); },
    sendEdit(id, ci) { W.sendClose(); OUT.open(id, ci); },
    async sendDone(id, ci, idx) { send.pending = false; await OUT.sent(id, ci, idx); send.lastAt = Date.now(); renderSend(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && send.pending && $('send-mo') && $('send-mo').classList.contains('open')) { renderSend(); toast('Welcome back. Tap the green button if you sent it.'); } });

  /* ============================================================ SETTINGS: screens, daily plan, backup */
  function renderWsSettings() {
    const root = $('ws-settings'); if (!root) return;
    const cfg = planCfg(), hidden = YS.hiddenScreens(settings), p = YS.planStatus(cfg, S.allActs(), [], new Date());
    root.innerHTML = `<div class="sf-card" style="margin-bottom:18px"><h4>Daily sending plan</h4>
      <div class="oq-sub" style="margin-bottom:8px">Cold outreach spaced through the day so no mailbox gets flagged. Your mailboxes' safe limit right now: about <b>${p.safe} a day</b> (${p.perBox} each${cfg.skipRamp ? '' : ', warming up'}).</div>
      <div class="ws-grid2"><div><label class="fl">Emails per day</label><input class="fi" type="number" id="pl-target" min="1" max="500" value="${cfg.target}"></div>
        <div><label class="fl">Safe per mailbox</label><input class="fi" type="number" id="pl-cap" min="5" max="60" value="${cfg.capPerMailbox}"></div></div>
      <label class="fl" style="margin-top:10px">Batches (how many in each part of the day)</label>
      <div class="ws-grid2" style="grid-template-columns:repeat(4,minmax(0,1fr))">${cfg.split.map((n, i) => `<input class="fi" type="number" id="pl-split-${i}" min="0" value="${n}">`).join('')}</div>
      <label class="fl" style="margin-top:10px">Batch start times</label>
      <div class="ws-grid2" style="grid-template-columns:repeat(4,minmax(0,1fr))">${cfg.times.map((t, i) => `<input class="fi" type="time" id="pl-time-${i}" value="${esc(t.padStart(5, '0'))}">`).join('')}</div>
      <label class="fl" style="margin-top:10px">Your sending mailboxes (one per line)</label>
      <textarea class="fi" id="pl-boxes" style="min-height:70px" placeholder="you@yourdomain.com\nyou2@otherdomain.com">${esc(cfg.mailboxes.join('\n'))}</textarea>
      <div class="oq-sub" style="margin:3px 0 0">Each person is assigned one mailbox and always hears from it. Gmail opens that account.</div>
      <label class="fl" style="margin-top:10px">Minutes between emails</label><input class="fi" type="number" id="pl-gap" min="0" max="30" value="${cfg.minGapMin}">
      <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" id="pl-ramp" ${cfg.skipRamp ? 'checked' : ''}> These mailboxes are already warmed up (skip the 10 a day start)</label>
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px"><input type="checkbox" id="pl-over" ${cfg.overrideCap ? 'checked' : ''}> Use my full target even if it is above the safe limit (risky)</label></div>
    <div class="sf-card" style="margin-bottom:18px"><h4>Screens</h4><div class="oq-sub" style="margin-bottom:8px">Untick anything you do not use. It only hides it, nothing is deleted.</div>
      ${YS.SCREENS.map(sc => `<label style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px"><input type="checkbox" id="sc-${sc.id}" ${hidden.includes(sc.id) ? '' : 'checked'} style="margin-top:3px"><span><b>${esc(sc.label)}</b><br><span class="oq-sub">${esc(sc.note)}</span></span></label>`).join('')}</div>
    <div class="sf-card" style="margin-bottom:18px"><h4>Backup</h4><div class="oq-sub" style="margin-bottom:8px">Download everything (leads, activity, tasks, settings without your keys) as one file.</div><button class="btn btn-ghost" style="min-height:46px" onclick="WS.backup()">⬇ Download a backup</button></div>
    <button class="btn btn-g" style="width:100%;min-height:46px;margin-bottom:18px" onclick="WS.saveWs()">Save plan and screens</button>`;
  }
  Object.assign(W, {
    async saveWs() {
      if (!settingsLoaded()) return warn('Settings are still loading. Try again in a moment.');
      const num = (id, d) => { const v = Number(($(id) || {}).value); return isNaN(v) ? d : v; };
      const plan = { target: num('pl-target', 100), capPerMailbox: num('pl-cap', 25), split: [0, 1, 2, 3].map(i => num('pl-split-' + i, 0)), times: [0, 1, 2, 3].map(i => ($('pl-time-' + i) || {}).value || '09:00'),
        mailboxes: ($('pl-boxes').value || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean), minGapMin: num('pl-gap', 2), skipRamp: $('pl-ramp').checked, overrideCap: $('pl-over').checked };
      const bad = plan.mailboxes.filter(x => !YO.normEmail(x)); if (bad.length) return warn('Not a valid email: ' + bad[0]);
      const hiddenScreens = YS.SCREENS.filter(sc => !$('sc-' + sc.id).checked).map(sc => sc.id);
      await window.FB.saveSettings(Object.assign({}, settings, { plan, hiddenScreens }));
      settings = Object.assign({}, settings, { plan, hiddenScreens });
      const n = await assignMissingMailboxes(); toast('Saved ✓' + (n ? ` ${n} people assigned to a mailbox` : ''));
    },
    backup() {
      const strip = Object.assign({}, settings); delete strip.groqKey; delete strip.apiKey;
      const data = { exportedAt: new Date().toISOString(), note: 'YALO CRM backup. API keys are not included.', leads: S.allLeads(), activities: S.allActs(), reminders, settings: strip };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `yalo-crm-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Backup downloaded');
    }
  });

  /* ============================================================ Home: plan card */
  function homePlan() {
    const wrap = $('today-wrap'); if (!wrap) return;
    let box = $('ws-home-plan'); if (!box) { box = document.createElement('div'); box.id = 'ws-home-plan'; const next = $('sf-next'); (next || wrap).before(box); }
    box.innerHTML = planCard(true);
  }

  /* ============================================================ hook into the app */
  function hook() {
    setup(); renderWsSettings(); applyScreens(); renderTasks(); refreshBadges();
    YS.setCustomSequences(settings && settings.customSequences);
    const _showTab = window.showTab;
    window.showTab = function (t) {
      _showTab(t);
      if (t === 'tasks') { $('page-title').textContent = 'Tasks'; renderTasks(); }
      if (t === 'templates') { $('page-title').textContent = 'Templates'; renderTemplates(); }
      if (t === 'settings') renderWsSettings();
    };
    const _renderDash = window.renderDash;
    window.renderDash = function () { _renderDash(); try { homePlan(); } catch (e) { console.warn('home plan', e); } };
    const _renderAll = window.renderAll;
    window.renderAll = function () { _renderAll(); if (typeof curTab !== 'undefined' && curTab === 'tasks') renderTasks(); refreshBadges(); };
    const _load = window.loadSettingsUI;
    window.loadSettingsUI = function () {
      YS.setCustomSequences(settings && settings.customSequences); _load(); applyScreens();
      const f = document.activeElement; if (!(f && $('ws-settings') && $('ws-settings').contains(f))) renderWsSettings();
      if (typeof curTab !== 'undefined' && curTab === 'templates' && !tpl.draft) renderTemplates();
    };
    // reminders arrive after startup: keep Tasks and its badge fresh
    setInterval(() => { refreshBadges(); if (typeof curTab !== 'undefined' && curTab === 'tasks') renderTasks(); }, 60000);
    const _r = window.checkDueReminders; if (_r) window.checkDueReminders = function () { _r(); refreshBadges(); if (typeof curTab !== 'undefined' && curTab === 'tasks') renderTasks(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
