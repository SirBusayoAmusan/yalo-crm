/* YALO CRM — outreach UI: Email Queue, CSV import, per-person sequences, home-screen additions.
 * Loads after the main inline script (shares its globals: leads, settings, activities, window.FB, toast, uid, addAct ...).
 * All pure logic lives in outreach-core.js (window.YO). */
(function () {
  'use strict';
  const YO = window.YO;
  if (!YO) { console.warn('outreach-core.js missing'); return; }
  const $ = id => document.getElementById(id);
  const esc = YO.esc;
  const live = () => leads.filter(l => !l._deleted);
  const sender = () => ({ name: settings.name, company: settings.company });
  const fmtDay = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const fullName = c => (c && c.name) || 'this person';

  function templatesFor(type) {
    const arr = type === 'employer' ? (typeof EMPLOYER_SCRIPTS !== 'undefined' ? EMPLOYER_SCRIPTS : []) : (typeof OFFICE_SCRIPTS !== 'undefined' ? OFFICE_SCRIPTS : []);
    return arr.map(s => ({ label: s.label, subject: s.subject, body: s.body }));
  }
  function composed(lead, ci, idx) {
    const r = YO.renderStep(lead, ci, idx, templatesFor);
    return { label: r.label, subject: r.subject, body: YO.addFooter(r.body, sender()), source: r.source, type: r.type };
  }
  const findLead = id => leads.find(x => x.id === id);
  async function save(lead) { await window.FB.saveLead(lead); }
  function warn(msg) { toast(msg, 'var(--red)'); }

  /* ---------- do-not-contact list (kept in settings so it survives deleting a lead) ---------- */
  const settingsLoaded = () => settings && Object.keys(settings).length > 0;
  async function persistDnc(email, flag) {
    email = YO.normEmail(email);
    if (!email || !settingsLoaded()) return;
    const set = new Set((settings.dncEmails || []).map(x => String(x).toLowerCase()));
    flag ? set.add(email) : set.delete(email);
    await window.FB.saveSettings({ ...settings, dncEmails: [...set] });
  }
  function dncSet() {
    const s = new Set((settings.dncEmails || []).map(x => String(x).toLowerCase()));
    leads.forEach(l => (l.contacts || []).forEach(c => { if (c.dnc && YO.normEmail(c.email)) s.add(YO.normEmail(c.email)); }));
    return s;
  }

  /* ---------- one-time DOM setup ---------- */
  function setup() {
    if ($('tab-outreach')) return;
    const style = document.createElement('style');
    style.textContent = `
      .oq-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px}
      .oq-card.od{border-color:var(--red);background:#fff8f8}
      .oq-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .oq-who{flex:1;min-width:180px}.oq-name{font-weight:800;font-size:14px}.oq-sub{font-size:12px;color:var(--muted);margin-top:2px}
      .oq-tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:var(--gll);color:var(--gd)}
      .oq-tag.r{background:#fee2e2;color:#b91c1c}.oq-tag.a{background:#fef3c7;color:#92400e}
      .oq-prev{font-size:12px;color:var(--muted);margin:10px 0;line-height:1.5;white-space:pre-wrap}
      .oq-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .oq-acts a.btn{text-decoration:none;display:inline-flex;align-items:center}
      .oq-h{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:22px 0 10px}
      .oq-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}
      .oq-stat{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px 14px;min-width:0}
      .oq-stat b{display:block;font-size:20px}.oq-stat span{font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
      .oq-primary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
      .oq-primary .btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:40px}
      .oq-primary .oq-go{grid-column:1 / -1}
      .oq-more{margin-top:8px}
      .oq-more summary{cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);list-style:none;padding:8px 0;min-height:36px;display:flex;align-items:center}
      .oq-more summary::-webkit-details-marker{display:none}
      .oq-more summary::after{content:' ▾';margin-left:4px}
      .oq-more[open] summary::after{content:' ▴'}
      .oq-more-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .oq-more-grid .btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:40px;white-space:nowrap}
      .imp-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
      .imp-row:last-child{border-bottom:none}
      .imp-act{flex:0 0 auto;min-width:58px;text-align:center;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 6px;border-radius:6px;background:var(--gll);color:var(--gd)}
      .imp-act.skip,.imp-act.blocked{background:#fee2e2;color:#b91c1c}.imp-act.same{background:#f1f5f9;color:var(--muted)}
      .imp-txt{min-width:0;flex:1;word-break:break-word}
      .imp-foot{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;position:sticky;bottom:-20px;background:#fff;padding:12px 0 4px;margin-top:8px;border-top:1px solid var(--border)}
      .oq-ver{font-size:11px;color:var(--muted);text-align:center;margin:24px 0 8px}
      @media(max-width:768px){
        #tab-outreach{padding-bottom:96px}
        .oq-strip{gap:6px}
        .oq-stat{padding:10px 4px;text-align:center}
        .oq-stat b{font-size:19px}
        .oq-stat span{display:block;font-size:9px;letter-spacing:.02em;line-height:1.25;margin-top:2px}
        .oq-card{padding:12px}
        .oq-who{min-width:0;flex-basis:100%}
        .oq-primary .btn,.oq-more-grid .btn,.oq-acts .btn{min-height:46px;font-size:13px}
        .oq-chip{min-height:40px}
        #tab-outreach input,#tab-outreach textarea,#lead-mo input,#lead-mo textarea,#lead-mo select,#imp-mo input,#imp-mo textarea,#imp-mo select{font-size:16px}
        #imp-mo{align-items:flex-end}
        #imp-mo .cm{width:100vw;max-width:100vw;border-radius:16px 16px 0 0;max-height:94vh;padding:18px 16px 12px}
        .imp-foot{flex-direction:column-reverse;gap:8px}
        .imp-foot .btn{width:100%;min-height:46px}
        .imp-foot>div{display:flex;flex-direction:column-reverse;gap:8px;width:100%}
      }
      .oq-warn{font-size:12px;background:#fef3c7;color:#92400e;border-radius:8px;padding:8px 10px;margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .oq-chips{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:12px;padding-bottom:4px}
      .oq-chip{padding:6px 12px;border-radius:20px;border:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;background:#fff;font-family:inherit;white-space:nowrap;flex:0 0 auto}
      .oq-chip.active{background:var(--g);color:#fff;border-color:var(--g)}
      .imp-pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--gll);margin-right:4px}
      #imp-mo .cm{width:min(640px,96vw)}`;
    document.head.appendChild(style);

    // sidebar item (after Leads) + More sheet item
    const leadsNi = document.querySelector('.ni[data-tab="leads"]');
    if (leadsNi) {
      const ni = document.createElement('div');
      ni.className = 'ni'; ni.dataset.tab = 'outreach'; ni.setAttribute('onclick', "showTab('outreach')");
      ni.innerHTML = '<span style="font-size:17px">📬</span><span id="oq-nav-label">Email Queue</span>';
      leadsNi.after(ni);
    }
    // tab
    const tab = document.createElement('div');
    tab.className = 'content'; tab.id = 'tab-outreach'; tab.style.display = 'none';
    tab.innerHTML = '<div id="oq-body"></div>';
    const leadsTab = $('tab-leads');
    (leadsTab ? leadsTab.after(tab) : document.body.appendChild(tab));
    if (typeof TABS !== 'undefined' && !TABS.includes('outreach')) TABS.push('outreach');

    // Import button on Leads toolbar
    const tb = document.querySelector('#tab-leads .ltoolbar');
    if (tb) { const b = document.createElement('button'); b.className = 'btn btn-ghost btn-sm'; b.textContent = '⬆ Import CSV'; b.setAttribute('onclick', 'OUT.openImport()'); tb.appendChild(b); }

    // import modal
    const mo = document.createElement('div');
    mo.className = 'cmo'; mo.id = 'imp-mo';
    mo.innerHTML = `<div class="cm">
      <div class="cmtitle">Import leads from CSV</div>
      <div class="cmsub">From your ContactOut export. People already in the CRM are matched (email, then LinkedIn, then name + company) and updated, not duplicated.</div>
      <div id="imp-body"></div>
    </div>`;
    document.body.appendChild(mo);
  }

  /* ====================================================================
     EMAIL QUEUE TAB
     ==================================================================== */
  function cardHtml(item) {
    const { lead, ci, idx, when, due, noEmail } = item;
    const c = (lead.contacts || [])[ci] || {};
    const f = composed(lead, ci, idx);
    const left = YO.leftoverTokens(f.subject + ' ' + f.body);
    const tag = when === 'overdue' ? `<span class="oq-tag r">⚠ ${Math.max(1, Math.round((Date.now() - due) / 86400000))}d overdue</span>`
      : when === 'today' ? '<span class="oq-tag a">Due today</span>' : `<span class="oq-tag">Due ${fmtDay(due)}</span>`;
    const lid = esc(lead.id);
    const to = YO.normEmail(c.email);
    let actions;
    if (when === 'upcoming') actions = `<button class="btn btn-ghost btn-sm" onclick="OUT.open('${lid}',${ci})">Open</button>`;
    else if (noEmail) actions = `<div class="oq-sub" style="margin-bottom:8px">No email address yet.</div><button class="btn btn-ghost btn-sm" onclick="OUT.open('${lid}',${ci},'overview')">Add email</button>`;
    else actions = `<div class="oq-primary">
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(YO.gmail(to, f.subject, f.body))}">✉ Gmail</a>
        <a class="btn btn-ghost btn-sm" href="${esc(YO.mailto(to, f.subject, f.body))}">📱 Mail app</a>
        <button class="btn btn-g btn-sm oq-go" onclick="OUT.sent('${lid}',${ci},${idx})">✓ I sent it</button></div>`;
    const more = [];
    if (when !== 'upcoming' && !noEmail) more.push(`<button class="btn btn-ghost btn-sm" onclick="OUT.copy('${lid}',${ci},${idx})">📋 Copy</button>`, `<button class="btn btn-ghost btn-sm" onclick="OUT.open('${lid}',${ci})">✏️ Edit</button>`);
    if (c.phone && when !== 'upcoming') {
      more.push(`<a class="btn btn-ghost btn-sm" href="tel:${esc(c.phone)}">📞 Call</a>`);
      const wa = YO.waLink(c.phone, ''); if (wa) more.push(`<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(wa)}">💬 WhatsApp</a>`);
    }
    if (c && c.name && when !== 'upcoming' && !noEmail) {
      more.push(`<button class="btn btn-ghost btn-sm" onclick="OUT.replied('${lid}',${ci})">↩ They replied</button>`);
      more.push(`<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="OUT.dnc('${lid}',${ci})">⛔ Don't contact</button>`);
    }
    const moreBox = more.length ? `<details class="oq-more"><summary>More</summary><div class="oq-more-grid">${more.join('')}</div></details>` : '';
    const leaseBox = left.includes('[LEASE]') && when !== 'upcoming' ? `
      <div class="oq-warn">⚠ This email needs the company's annual rent.
        <input class="fi" id="lease-${lid}" type="number" placeholder="e.g. 12000000" style="width:150px;padding:6px 10px">
        <button class="btn btn-g btn-sm" onclick="OUT.setLease('${lid}')">Save</button></div>` : '';
    const otherLeft = left.filter(t => t !== '[LEASE]');
    const otherWarn = otherLeft.length && when !== 'upcoming' ? `<div class="oq-warn">⚠ Fill in ${esc(otherLeft.join(', '))} before sending (use ✏️ Edit).</div>` : '';
    return `<div class="oq-card ${when === 'overdue' ? 'od' : ''}">
      <div class="oq-top">
        <div class="oq-who">
          <div class="oq-name">${esc(c.name || '(no contact yet)')}${c.title ? ` <span style="font-weight:500;color:var(--muted)">· ${esc(c.title)}</span>` : ''}</div>
          <div class="oq-sub"><a onclick="OUT.open('${lid}',${ci},'overview')" style="cursor:pointer;color:var(--g)">${esc(lead.company)}</a> · Email ${idx + 1} of ${YO.STEPS}: ${esc(f.label)}${to ? ' · ' + esc(to) : ''}</div>
        </div>${tag}
      </div>
      ${when !== 'upcoming' && !noEmail ? `<div class="oq-prev"><b>${esc(f.subject)}</b>\n${esc(f.body.split('\n').slice(0, 4).join('\n'))}…</div>` : ''}
      ${leaseBox}${otherWarn}
      ${actions}${moreBox}
    </div>`;
  }

  function renderQueue() {
    const root = $('oq-body'); if (!root) return;
    const q = YO.buildQueue(live(), new Date());
    const due = q.filter(x => x.when === 'overdue'), today = q.filter(x => x.when === 'today'), up = q.filter(x => x.when === 'upcoming');
    const ws = YO.weekStats(activities, leads, new Date());
    const stat = (n, l) => `<div class="oq-stat"><b>${n}</b><span>${l}</span></div>`;
    const cap = (arr, n) => arr.slice(0, n).map(cardHtml).join('') + (arr.length > n ? `<div class="oq-sub" style="margin:6px 0 12px">+ ${arr.length - n} more. Clear these first.</div>` : '');
    root.innerHTML = `
      <div class="sec-head" style="margin-top:0"><h3>Email Queue</h3><a onclick="OUT.openImport()">⬆ Import CSV</a></div>
      <div class="oq-strip">${stat(due.length, 'Overdue')}${stat(today.length, 'Due today')}${stat(ws.sent, 'Sent 7d')}${stat(ws.replies, 'Replies 7d')}${stat(ws.meetings, 'Meetings')}</div>
      ${due.length ? `<div class="oq-h" style="color:var(--red)">Overdue (${due.length})</div>${cap(due, 25)}` : ''}
      ${today.length ? `<div class="oq-h">Due today (${today.length})</div>${cap(today, 25)}` : ''}
      ${!due.length && !today.length ? `<div class="card" style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Nothing due. 🎉<br>${up.length ? `${up.length} more coming up.` : 'Import a CSV or start a sequence on a lead to fill the queue.'}</div>` : ''}
      ${ws.repliesToHandle.length ? `<div class="oq-h">Replies to handle (${ws.repliesToHandle.length})</div>${ws.repliesToHandle.map(l => {
        const c = (l.contacts || [])[0] || {};
        return `<div class="oq-card"><div class="oq-top"><div class="oq-who"><div class="oq-name">${esc(l.company)}</div><div class="oq-sub">${esc(c.name || '')}${c.email ? ' · ' + esc(c.email) : ''}</div></div>
          <button class="btn btn-ghost btn-sm" onclick="OUT.open('${esc(l.id)}',0,'overview')">Open</button>
          <button class="btn btn-g btn-sm" onclick="changeStage('${esc(l.id)}','Meeting Set')">📅 Meeting set</button></div></div>`;
      }).join('')}` : ''}
      ${up.length ? `<div class="oq-h">Coming up (${up.length})</div>${up.slice(0, 15).map(cardHtml).join('')}${up.length > 15 ? `<div class="oq-sub">+ ${up.length - 15} more</div>` : ''}` : ''}
      <div class="oq-ver">Outreach build ${esc(YO.VERSION)}</div>`;
  }

  function refreshNavBadge() {
    const el = $('oq-nav-label'); if (!el) return;
    const n = YO.buildQueue(live(), new Date()).filter(x => x.when !== 'upcoming').length;
    el.textContent = n ? `Email Queue (${n})` : 'Email Queue';
    const bn = $('bn-outreach'); if (bn && bn.lastChild) bn.lastChild.textContent = n ? `Queue ${n}` : 'Queue';
  }

  /* ====================================================================
     ACTIONS (queue + drawer)
     ==================================================================== */
  const OUT = window.OUT = {
    editing: null,

    open(leadId, ci, tab) {
      openLead(leadId);          // resets the selected person and edit state
      outCi = ci || 0;
      setDTab(tab || 'emails');
    },
    async copy(leadId, ci, idx) {
      const l = findLead(leadId); if (!l) return;
      const f = composed(l, ci, idx);
      try { await navigator.clipboard.writeText('Subject: ' + f.subject + '\n\n' + f.body); toast('Copied'); }
      catch (e) { warn('Could not copy. Long-press the text instead.'); }
    },
    async sent(leadId, ci, idx) {
      const l = findLead(leadId); if (!l) return;
      const f = composed(l, ci, idx);
      const left = YO.leftoverTokens(f.subject + ' ' + f.body);
      if (left.length && !confirm('This email still contains ' + left.join(', ') + '. Mark as sent anyway?')) return;
      const c = (l.contacts || [])[ci];
      const res = YO.markSent(l, ci, idx, new Date(), { subject: f.subject, body: f.body });
      if (!res) { warn('No running sequence for this person.'); return; }
      await save(l);
      await addAct({ leadId: l.id, type: 'email', company: l.company, desc: `Sent email ${idx + 1} (${f.label}) to ${fullName(c)}` });
      toast(res.complete ? 'Sent. Sequence complete 🎉' : `Sent ✓ Next email due ${fmtDay(res.nextDue)}`);
      OUT.refresh();
    },
    async replied(leadId, ci) {
      const l = findLead(leadId); if (!l) return;
      const c = (l.contacts || [])[ci];
      const res = YO.markReplied(l, ci, new Date());
      if (!res) return;
      await save(l);
      await addAct({ leadId: l.id, type: 'email', company: l.company, desc: `Reply received from ${fullName(c)} (email ${res.idx + 1})` });
      toast('Reply logged. Sequence stopped.');
      OUT.refresh();
    },
    async dnc(leadId, ci) {
      const l = findLead(leadId); if (!l) return;
      const c = (l.contacts || [])[ci]; if (!c) return;
      const on = !c.dnc;
      if (on && !confirm(`Mark ${fullName(c)} as do-not-contact?\nNo more emails will be queued, even if they appear in a future import.`)) return;
      YO.setDnc(l, ci, on, new Date());
      await save(l);
      await persistDnc(c.email, on);
      await addAct({ leadId: l.id, type: 'note', company: l.company, desc: `${on ? 'Marked do-not-contact' : 'Removed do-not-contact'}: ${fullName(c)}` });
      toast(on ? 'Marked do-not-contact' : 'Do-not-contact removed');
      OUT.refresh();
    },
    async start(leadId, ci) {
      const l = findLead(leadId); if (!l) return;
      const sel = $('seq-type'); const type = sel && sel.value ? sel.value : null;
      const r = YO.startSequence(l, ci, new Date(), type);
      if (r === 'no_email') return warn('Add an email address for this person first.');
      if (r === 'dnc') return warn('This person is marked do-not-contact.');
      await save(l);
      await addAct({ leadId: l.id, type: 'email', company: l.company, desc: `Email sequence started for ${fullName((l.contacts || [])[ci])}` });
      toast('Sequence started. First email is due now.');
      OUT.refresh();
    },
    async pause(leadId, ci, flag) {
      const l = findLead(leadId); if (!l) return;
      if (!YO.setPaused(l, ci, flag)) return warn('Only sequences started in the new queue can be paused.');
      await save(l); toast(flag ? 'Paused' : 'Resumed'); OUT.refresh();
    },
    async setType(leadId, ci, type) {
      const l = findLead(leadId); const c = l && (l.contacts || [])[ci]; if (!c || !c.seq) return;
      c.seq.type = type || null; await save(l); OUT.refresh();
    },
    async setLease(leadId) {
      const l = findLead(leadId); if (!l) return;
      const el = $('lease-' + leadId) || $('lease-drawer');
      const v = parseInt(el && el.value, 10);
      if (!v || v < 0) return warn('Enter the annual rent in naira, e.g. 12000000');
      l.lease = v; await save(l); toast('Rent saved'); OUT.refresh();
    },
    edit(idx) { OUT.editing = idx; renderEmailsTab(); },
    cancelEdit() { OUT.editing = null; renderEmailsTab(); },
    async saveEdit(leadId, ci, idx) {
      const l = findLead(leadId); if (!l) return;
      if (!YO.editStep(l, ci, idx, { subject: $('ed-subj').value, body: $('ed-body').value })) return warn('Could not save.');
      await save(l); OUT.editing = null; toast('Email saved'); renderEmailsTab();
    },
    async logCall(leadId, ci, outcome) {
      const l = findLead(leadId); if (!l) return;
      const c = (l.contacts || [])[ci];
      await addAct({ leadId: l.id, type: 'call', company: l.company, desc: `Call to ${fullName(c)}: ${outcome}` });
      toast('Call logged');
      if (curTab === 'outreach') renderQueue();
    },
    select(ci) { outCi = ci; OUT.editing = null; renderEmailsTab(); },
    refresh() {
      if (curTab === 'outreach') renderQueue();
      if (curTab === 'dashboard') renderDash();
      const mo = $('lead-mo');
      if (mo && mo.classList.contains('open') && curDTab === 'emails') renderEmailsTab();
      refreshNavBadge();
    },
    openImport() { setup(); impReset(); $('imp-mo').classList.add('open'); },
    closeImport() { $('imp-mo').classList.remove('open'); }
  };
  let outCi = 0;

  /* ====================================================================
     DRAWER: Emails tab (per person)
     ==================================================================== */
  function renderEmailsTab() {
    const l = findLead(curLeadId); const el = $('d-content'); if (!l || !el) return;
    const contacts = l.contacts || [];
    if (outCi >= Math.max(contacts.length, 1)) outCi = 0;
    const c = contacts[outCi];
    const lid = esc(l.id);
    const chips = contacts.length > 1 ? `<div class="oq-chips">${contacts.map((x, i) => `<button class="oq-chip ${i === outCi ? 'active' : ''}" onclick="OUT.select(${i})">${esc(x.name || 'Person ' + (i + 1))}${x.dnc ? ' ⛔' : ''}</button>`).join('')}</div>` : '';
    const st = YO.seqState(l, outCi);
    const to = c && YO.normEmail(c.email);
    let head = '';
    if (c) {
      const links = [];
      if (c.phone) {
        links.push(`<a class="btn btn-ghost btn-sm" href="tel:${esc(c.phone)}" style="text-decoration:none;display:inline-flex;align-items:center">📞 Call</a>`);
        const wa = YO.waLink(c.phone, ''); if (wa) links.push(`<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(wa)}" style="text-decoration:none;display:inline-flex;align-items:center">💬 WhatsApp</a>`);
        links.push(`<details class="oq-more" style="margin:0;flex-basis:100%"><summary>Log a call</summary><div class="oq-more-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${['Answered', 'No answer', 'Voicemail'].map(o => `<button class="btn btn-ghost btn-sm" onclick="OUT.logCall('${lid}',${outCi},'${o.toLowerCase()}')">${o}</button>`).join('')}</div></details>`);
      }
      head = `<div style="background:var(--gll);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-weight:800;font-size:14px">${esc(c.name || 'Unknown')}${c.dnc ? ' <span class="oq-tag r">⛔ Do not contact</span>' : ''}</div>
        <div class="oq-sub">${esc(c.title || '')}${c.title && to ? ' · ' : ''}${to ? esc(to) : '<span style="color:var(--red)">no email yet</span>'}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
        ${c.src && c.src.file ? `<div class="oq-sub">Imported from ${esc(c.src.file)} · ${fmtDay(c.src.at)}</div>` : ''}
        ${links.length ? `<div class="oq-acts" style="margin-top:8px">${links.join('')}</div>` : ''}
      </div>`;
    }
    if (!st) {
      el.innerHTML = chips + head + (c ? `
        <div class="card" style="padding:16px">
          <div style="font-weight:700;margin-bottom:6px">No email sequence running for ${esc(fullName(c))}</div>
          <div class="oq-sub" style="margin-bottom:12px">${to ? 'Start the 7-email sequence. The first email is due straight away, then each next email is timed from when you tap “I sent it”.' : 'Add an email address (Overview → Edit) to start a sequence.'}</div>
          ${to && !c.dnc ? `<div class="oq-acts"><select class="fsel" id="seq-type"><option value="">Auto (${YO.autoType(l) === 'employer' ? 'employer pitch' : 'office-lease pitch'})</option><option value="office">Office-lease pitch</option><option value="employer">Employer pitch</option></select>
          <button class="btn btn-g btn-sm" onclick="OUT.start('${lid}',${outCi})">▶ Start sequence</button></div>` : ''}
        </div>
        ${c ? `<div class="oq-acts" style="margin-top:12px"><button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="OUT.dnc('${lid}',${outCi})">${c.dnc ? 'Remove do-not-contact' : "⛔ Don't contact"}</button></div>` : ''}` : '<div class="oq-sub">No contacts on this lead yet. Add one on the Overview tab.</div>');
      return;
    }
    const reason = YO.stopReason(l, outCi, st);
    const nxt = YO.nextIdx(st.steps);
    const due = YO.dueDate(st);
    const sentCount = st.steps.filter(s => s && ['sent', 'opened', 'replied'].includes(s.status)).length;
    const lastSent = st.steps.reduce((a, s, i) => (s && ['sent', 'opened', 'replied'].includes(s.status) ? i : a), -1);
    const type = (c && c.seq && c.seq.type) || l.seqType || YO.autoType(l);
    const status = reason ? `<span class="oq-tag ${reason === 'Replied' || reason === 'Sequence complete' ? '' : 'a'}">${esc(reason)}</span>`
      : `Next: email ${nxt + 1} — ${esc(composed(l, outCi, nxt).label)} · due ${fmtDay(due)}`;
    const bars = st.steps.map(s => `<div style="flex:1;height:6px;border-radius:3px;background:${s.status === 'replied' ? 'var(--g)' : s.status === 'opened' ? 'var(--amber)' : s.status === 'sent' ? 'var(--blue)' : 'var(--border)'}"></div>`).join('');
    const controls = `<div class="oq-acts" style="margin:10px 0 14px">
      ${c && c.seq ? `<select class="fsel" onchange="OUT.setType('${lid}',${outCi},this.value)"><option value="" ${!c.seq.type ? 'selected' : ''}>Auto</option><option value="office" ${c.seq.type === 'office' ? 'selected' : ''}>Office-lease pitch</option><option value="employer" ${c.seq.type === 'employer' ? 'selected' : ''}>Employer pitch</option></select>` : ''}
      ${c && c.seq && !c.dnc && !(c.seq.stopped) ? `<button class="btn btn-ghost btn-sm" onclick="OUT.pause('${lid}',${outCi},${c.seq.paused ? 'false' : 'true'})">${c.seq.paused ? '▶ Resume' : '⏸ Pause'}</button>` : ''}
      ${c ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="OUT.dnc('${lid}',${outCi})">${c.dnc ? 'Remove do-not-contact' : "⛔ Don't contact"}</button>` : ''}
      <input class="fi" id="lease-drawer" type="number" placeholder="Annual rent (N)" value="${l.lease || ''}" style="width:150px;padding:6px 10px" onchange="OUT.setLease('${lid}')">
    </div>`;
    const cards = st.steps.map((s, i) => {
      const f = composed(l, outCi, i);
      const isNext = i === nxt && !reason;
      const stt = s.status || 'draft';
      const left = YO.leftoverTokens(f.subject + ' ' + f.body);
      const editing = OUT.editing === i;
      let dueLbl = '';
      if (stt === 'draft' && i === nxt && due) {
        const d = Math.ceil((due - new Date()) / 86400000);
        dueLbl = d < 0 ? `<span style="color:var(--red);font-size:11px;font-weight:600">⚠ ${-d}d overdue</span>` : d === 0 ? '<span style="color:var(--amber);font-size:11px;font-weight:600">Due today</span>' : `<span style="color:var(--muted);font-size:11px">Due ${fmtDay(due)}</span>`;
      }
      let acts = '', moreActs = [];
      if (isNext && to) {
        acts = `<div class="oq-primary">
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(YO.gmail(to, f.subject, f.body))}">✉ Gmail</a>
          <a class="btn btn-ghost btn-sm" href="${esc(YO.mailto(to, f.subject, f.body))}">📱 Mail app</a>
          <button class="btn btn-g btn-sm oq-go" onclick="OUT.sent('${lid}',${outCi},${i})">✓ I sent it</button></div>`;
        moreActs.push(`<button class="btn btn-ghost btn-sm" onclick="OUT.copy('${lid}',${outCi},${i})">📋 Copy</button>`);
      }
      if (i === lastSent && !reason && stt !== 'replied') moreActs.push(`<button class="btn btn-ghost btn-sm" onclick="OUT.replied('${lid}',${outCi})">↩ They replied</button>`);
      if (stt === 'draft') moreActs.push(`<button class="btn btn-ghost btn-sm" onclick="OUT.edit(${i})">✏️ Edit</button>`);
      if (moreActs.length) acts += `<details class="oq-more"><summary>More</summary><div class="oq-more-grid">${moreActs.join('')}</div></details>`;
      const body = editing ? `
        <input class="fi" id="ed-subj" value="${esc(f.subject)}" style="margin-bottom:8px">
        <textarea class="narea" id="ed-body" style="min-height:220px">${esc(YO.renderStep(l, outCi, i, templatesFor).body)}</textarea>
        <div class="oq-acts" style="margin-top:8px"><button class="btn btn-g btn-sm" onclick="OUT.saveEdit('${lid}',${outCi},${i})">Save</button><button class="btn btn-ghost btn-sm" onclick="OUT.cancelEdit()">Cancel</button></div>`
        : `<details><summary style="font-size:12px;cursor:pointer;color:var(--muted)">${esc(f.subject)}</summary><div class="oq-prev">${esc(f.body)}</div></details>`;
      return `<div style="border:1.5px solid ${isNext ? 'var(--g)' : 'var(--border)'};border-radius:10px;padding:12px;margin-bottom:8px;background:${isNext ? 'var(--gll)' : '#fff'}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:26px;height:26px;border-radius:7px;background:${stt === 'draft' ? 'var(--border)' : 'var(--g)'};color:${stt === 'draft' ? 'var(--muted)' : '#fff'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
          <div style="flex:1"><div style="font-size:13px;font-weight:700">${esc(f.label)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Day ${YO.EDAYS[i]}${dueLbl ? ' · ' : ''}${dueLbl}${s.sentAt ? ` · Sent ${fmtDay(s.sentAt)}` : ''}${f.source === 'step' && stt === 'draft' ? ' · edited' : ''}</div></div>
          <span class="badge b-${esc(stt)}">${esc(stt)}</span>
        </div>
        ${left.length && isNext ? `<div class="oq-warn">⚠ Still contains ${esc(left.join(', '))}. ${left.includes('[LEASE]') ? 'Enter the annual rent above, or ' : ''}use ✏️ Edit.</div>` : ''}
        ${body}
        ${acts}
      </div>`;
    }).join('');
    el.innerHTML = chips + head + `
      <div style="background:var(--gll);border-radius:10px;padding:14px;border:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px">Sequence progress · ${type === 'employer' ? 'employer pitch' : 'office-lease pitch'}</div>
        <div style="display:flex;gap:3px;margin-bottom:8px">${bars}</div>
        <div style="font-size:12px;color:var(--muted)">${sentCount}/${YO.STEPS} sent · ${status}</div>
      </div>${controls}${cards}`;
  }

  /* ====================================================================
     CSV IMPORT
     ==================================================================== */
  let imp = null;
  function impReset() { imp = { rows: null, headers: [], mapping: {}, name: '', start: true, text: '', mapOpen: null }; renderImport(); }

  function impLoad(text, name) {
    const rows = YO.parseCsv(text);
    if (rows.length < 2) { warn('That file has no data rows.'); return; }
    if (rows.length > 2001) { warn('Max 2,000 rows at a time. Split the file and import in parts.'); return; }
    imp.headers = rows[0].map(h => YO.clean(h, 80));
    imp.rows = rows.slice(1);
    imp.mapping = YO.detectMapping(imp.headers);
    imp.name = name || 'pasted.csv';
    renderImport();
  }

  function impCompute() {
    const mapped = YO.applyMapping(imp.rows, imp.mapping);
    return YO.buildImport(mapped, leads, { now: new Date(), startSequences: imp.start, fileName: imp.name, dnc: dncSet(), owner: settings.name || 'Unassigned' });
  }

  function renderImport() {
    const root = $('imp-body'); if (!root) return;
    if (!imp.rows) {
      root.innerHTML = `
        <div class="fg"><label class="fl">CSV file</label><input type="file" id="imp-file" accept=".csv,.txt,text/csv" class="fi"></div>
        <div class="fg"><label class="fl">…or paste CSV text (include the header row)</label><textarea class="narea" id="imp-text" style="min-height:110px" placeholder="First Name,Last Name,Work Email,Company,Job Title..."></textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" onclick="OUT.closeImport()">Cancel</button><button class="btn btn-g" onclick="OUT.impPaste()">Read pasted text</button></div>`;
      const f = $('imp-file');
      if (f) f.onchange = () => { const file = f.files[0]; if (!file) return; if (file.size > 3e6) return warn('File too large (3 MB max).'); const r = new FileReader(); r.onload = () => impLoad(String(r.result), file.name); r.readAsText(file); };
      return;
    }
    const res = impCompute();
    const s = res.stats;
    const opt = i => `<option value="">— none —</option>` + imp.headers.map((h, k) => `<option value="${k}" ${String(imp.mapping[i]) === String(k) ? 'selected' : ''}>${esc(h || 'Column ' + (k + 1))}</option>`).join('');
    const warns = [];
    if (imp.mapping.email == null) warns.push('No email column found: people will be added without emails.');
    if (imp.mapping.company == null && imp.mapping.website == null) warns.push('No company column found: new people can’t be filed under a company, so they’ll be skipped.');
    if (imp.mapping.name == null && imp.mapping.first == null) warns.push('No name column found.');
    const needFix = imp.mapping.email == null || (imp.mapping.company == null && imp.mapping.website == null) || (imp.mapping.name == null && imp.mapping.first == null);
    const matched = Object.keys(imp.mapping).length;
    const pill = (n, t) => n ? `<span class="imp-pill">${n} ${t}</span>` : '';
    root.innerHTML = `
      <div class="oq-sub" style="margin-bottom:10px"><b>${esc(imp.name)}</b> · ${imp.rows.length} rows</div>
      <details class="oq-more" ${(imp.mapOpen === null ? needFix : imp.mapOpen) ? 'open' : ''} ontoggle="OUT.impMapOpen(this.open)" style="margin:0 0 6px">
        <summary>${needFix ? '⚠ Check the columns' : '✓ Columns matched'} <span style="font-weight:500">(${matched} of ${Object.keys(YO.FIELD_LABELS).length} fields found, tap to change)</span></summary>
        <div class="g2" style="gap:8px 14px;margin-top:6px">${Object.keys(YO.FIELD_LABELS).map(k => `<div><label class="fl">${esc(YO.FIELD_LABELS[k])}</label><select class="fsel" style="width:100%" onchange="OUT.impMap('${k}',this.value)">${opt(k)}</select></div>`).join('')}</div>
      </details>
      ${warns.map(w => `<div class="oq-warn">⚠ ${esc(w)}</div>`).join('')}
      <label style="display:flex;gap:8px;align-items:center;margin:14px 0;font-size:13px"><input type="checkbox" ${imp.start ? 'checked' : ''} onchange="OUT.impStart(this.checked)"> Start the email sequence for imported people who have an email (first email due today)</label>
      <div style="background:var(--gll);border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="font-weight:800;margin-bottom:6px">What will happen</div>
        ${pill(s.newLeads, 'new companies')}${pill(s.addedPeople, 'people added')}${pill(s.updatedPeople, 'people updated')}${pill(s.unchanged, 'unchanged')}${pill(s.started, 'sequences started')}${pill(s.noEmail, 'without email')}${pill(s.blocked, 'blocked (do not contact)')}${pill(s.skipped, 'skipped')}${pill(s.duplicates, 'repeat rows merged')}
        <div style="margin-top:8px">${res.preview.slice(0, 8).map(p => `<div class="imp-row"><span class="imp-act ${esc(p.action)}">${esc(p.action)}</span><div class="imp-txt"><b>${esc(p.who)}</b>${p.company ? ' · ' + esc(p.company) : ''}<div class="oq-sub">Row ${p.row}: ${esc(p.note)}</div></div></div>`).join('')}</div>
        ${res.preview.length > 8 ? `<div class="oq-sub" style="margin-top:6px">…and ${res.preview.length - 8} more rows</div>` : ''}
      </div>
      <div class="imp-foot">
        <button class="btn btn-ghost" onclick="OUT.impBack()">← Another file</button>
        <div><button class="btn btn-ghost" onclick="OUT.closeImport()">Cancel</button>
        <button class="btn btn-g" id="imp-go" ${res.changed.length ? '' : 'disabled'} onclick="OUT.impRun()">Import ${res.changed.length} lead${res.changed.length === 1 ? '' : 's'}</button></div>
      </div>`;
  }
  Object.assign(OUT, {
    impPaste() { const t = ($('imp-text') || {}).value || ''; if (!t.trim()) return warn('Paste the CSV text first.'); impLoad(t, 'pasted.csv'); },
    impMap(field, v) { if (v === '') delete imp.mapping[field]; else imp.mapping[field] = Number(v); renderImport(); },
    impStart(v) { imp.start = !!v; renderImport(); },
    impMapOpen(open) { imp.mapOpen = !!open; },
    impBack() { impReset(); },
    async impRun() {
      const btn = $('imp-go'); if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
      const res = impCompute();
      // The CRM raises a "new lead" notification and an auto WhatsApp reminder for every unseen lead id,
      // and it prunes its seen-list on every update. So register each id just before ITS save, not up front.
      let done = 0, failed = 0;
      for (const l of res.changed) {
        if (typeof knownLeadIds !== 'undefined' && knownLeadIds) knownLeadIds.add(l.id);
        try { await window.FB.saveLead(l); done++; } catch (e) { failed++; console.warn('import save failed', e); }
        if (btn) btn.textContent = `Importing… ${done + failed}/${res.changed.length}`;
      }
      const s = res.stats;
      await addAct({ leadId: '', type: 'lead', company: 'CSV import', desc: `Imported ${imp.name}: ${s.newLeads} new companies, ${s.addedPeople} people added, ${s.updatedPeople} updated, ${s.started} sequences started` });
      OUT.closeImport();
      toast(failed ? `Imported ${done}, ${failed} failed. Check your connection and re-import (it won't duplicate).` : `Imported ${done} lead${done === 1 ? '' : 's'} ✓`, failed ? 'var(--red)' : undefined);
      showTab('outreach');
    }
  });

  /* ====================================================================
     HOME SCREEN additions (Today panel, attention count, weekly strip)
     ==================================================================== */
  function patchDash() {
    const now = new Date();
    const q = YO.buildQueue(live(), now).filter(x => x.when !== 'upcoming');
    const od = q.filter(x => x.when === 'overdue').length;
    const blockedLeads = live().filter(l => l.blocker && l.blocker !== '');
    const ws = YO.weekStats(activities, leads, now);

    const m = document.querySelector('#metrics .mc:nth-child(4)');
    if (m) m.innerHTML = `<div class="mc-label">${od > 0 || blockedLeads.length > 0 ? 'Needs attention' : 'All on track'}</div><div class="mc-val ${od > 0 || blockedLeads.length > 0 ? 'r' : 'g'}">${od + blockedLeads.length}</div><div class="mc-sub">${od} overdue · ${blockedLeads.length} blocked</div>`;

    const wrap = $('today-wrap'); if (!wrap) return;
    let strip = $('oq-dash-strip');
    if (!strip) { strip = document.createElement('div'); strip.id = 'oq-dash-strip'; wrap.parentNode.insertBefore(strip, wrap); }
    strip.innerHTML = `<div class="oq-strip">
      <div class="oq-stat" style="cursor:pointer" onclick="showTab('outreach')"><b>${q.length}</b><span>To send</span></div>
      <div class="oq-stat"><b>${ws.sent}</b><span>Sent 7d</span></div>
      <div class="oq-stat"><b>${ws.replies}</b><span>Replies 7d</span></div>
      <div class="oq-stat"><b>${ws.meetings}</b><span>Meetings</span></div>
      <div class="oq-stat"><b>${ws.inSeq}</b><span>In sequence</span></div></div>`;

    const items = [
      ...q.map(x => ({ t: x.when === 'overdue' ? 'overdue' : 'due', lead: x.lead, txt: `Email ${x.idx + 1} — ${esc(composed(x.lead, x.ci, x.idx).label)}${((x.lead.contacts || [])[x.ci] || {}).name ? ' · ' + esc(x.lead.contacts[x.ci].name) : ''}${x.noEmail ? ' · add email' : ''}` })),
      ...ws.repliesToHandle.map(l => ({ t: 'reply', lead: l, txt: '💬 Replied. Needs your response' })),
      ...blockedLeads.map(l => ({ t: 'blocked', lead: l, txt: `⚠ ${esc(l.blocker)}` }))
    ];
    wrap.innerHTML = items.length ? `
      <div class="today">
        <div class="today-title">Today's Actions (${items.length})</div>
        ${items.slice(0, 8).map(x => `
          <div class="ti" onclick="OUT.open('${esc(x.lead.id)}',0,'${x.t === 'blocked' || x.t === 'reply' ? 'overview' : 'emails'}')">
            <div class="tdot ${x.t === 'overdue' || x.t === 'blocked' ? 'r' : 'a'}"></div>
            <div style="flex:1;font-size:13px"><strong>${esc(x.lead.company)}</strong> &middot; ${x.txt}${x.lead.owner ? ` <span style="color:rgba(255,255,255,.45);font-size:11px">&middot; ${esc(x.lead.owner)}</span>` : ''}</div>
            <span class="ttag ${x.t === 'overdue' || x.t === 'blocked' ? 'r' : 'a'}">${x.t === 'overdue' ? 'Overdue' : x.t === 'blocked' ? 'Blocked' : x.t === 'reply' ? 'Reply' : 'Due today'}</span>
          </div>`).join('')}
        ${items.length > 8 ? `<div class="ti" onclick="showTab('outreach')"><div style="flex:1;font-size:13px">View all ${items.length} in Email Queue →</div></div>` : ''}
      </div>` : '';
  }

  /* ====================================================================
     Hook into the existing app (wrap, don't rewrite)
     ==================================================================== */
  function hook() {
    setup();
    const _showTab = window.showTab;
    window.showTab = function (t) {
      _showTab(t);
      if (t === 'outreach') { $('page-title').textContent = 'Email Queue'; renderQueue(); }
    };
    const _renderAll = window.renderAll;
    window.renderAll = function () { _renderAll(); if (curTab === 'outreach') renderQueue(); refreshNavBadge(); };
    const _setDTab = window.setDTab;
    window.setDTab = function (t) { _setDTab(t); if (t === 'emails') renderEmailsTab(); };
    const _openLead = window.openLead;
    window.openLead = function (id) { _openLead(id); outCi = 0; OUT.editing = null; };
    const _renderDash = window.renderDash;
    window.renderDash = function () { _renderDash(); try { patchDash(); } catch (e) { console.warn('dash patch', e); } };
    refreshNavBadge();
    // Keep "due today" fresh while the app stays open across midnight.
    setInterval(() => { if (curTab === 'outreach') renderQueue(); refreshNavBadge(); }, 5 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
