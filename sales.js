/* YALO CRM: sales UI. Brand switch, Settings (brands + AI), objection and rejection helper, call mode,
 * offer builder, "do this next" and forecast cards, AI personalise (Groq).
 * Loads after outreach.js and shares its globals. Pure logic is in sales-core.js (window.YS). */
(function () {
  'use strict';
  const YO = window.YO, YS = window.YS;
  if (!YO || !YS) { console.warn('sales-core.js missing'); return; }
  const $ = id => document.getElementById(id);
  const esc = YO.esc;
  const live = () => leads.filter(l => !l._deleted);
  const findLead = id => leads.find(x => x.id === id);
  const warn = m => toast(m, 'var(--red)');
  const fmtDay = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const settingsLoaded = () => settings && Object.keys(settings).length > 0;
  const store = { allLeads: [], allActs: [] };

  /* ============================================================ brands */
  const KEY = 'yalo_brand';
  let activeBrand = 'yalo';
  try { const b = localStorage.getItem(KEY); if (b === 'all' || YS.BRAND_IDS.includes(b)) activeBrand = b; } catch (e) { /* storage blocked: default */ }
  const profiles = () => YS.mergeBrands(settings && settings.brands);
  const profileFor = lead => profiles()[YS.brandOf(lead)];
  const activeBrandOrDefault = () => activeBrand === 'all' ? 'yalo' : activeBrand;
  const brandLeads = () => YS.filterByBrand(store.allLeads, activeBrand);
  function brandActs() {
    if (activeBrand === 'all') return store.allActs;
    const ids = new Set(brandLeads().map(l => l.id));
    return store.allActs.filter(a => !a.leadId || ids.has(a.leadId));
  }
  function setBrand(b) {
    activeBrand = b;
    try { localStorage.setItem(KEY, b); } catch (e) { /* ignore */ }
    leads = brandLeads(); activities = brandActs();
    renderBrandBar(); renderAll();
    if (curTab === 'dashboard') renderDash();
    toast(b === 'all' ? 'Showing both companies' : 'Switched to ' + profiles()[b].name);
  }
  function renderBrandBar() {
    const bar = $('brand-bar'); if (!bar) return;
    const p = profiles();
    const btn = (id, label, color) => `<button class="bb-btn ${activeBrand === id ? 'on' : ''}" ${activeBrand === id && color ? `style="background:${color};border-color:${color}"` : ''} onclick="SALES.setBrand('${id}')">${esc(label)}</button>`;
    bar.innerHTML = btn('yalo', p.yalo.name, p.yalo.color) + btn('clearpath', p.clearpath.name, p.clearpath.color) + btn('all', 'Both', '#334155');
  }
  function wrapFB() {
    const FB = window.FB; if (!FB || FB.__sales) return; FB.__sales = true;
    const ll = FB.listenLeads.bind(FB), la = FB.listenActivities.bind(FB);
    FB.listenLeads = cb => ll(data => { store.allLeads = data; cb(brandLeads()); });
    FB.listenActivities = cb => la(data => { store.allActs = data; cb(brandActs()); });
    // The CRM raises "new lead" notifications from the list it is given. Always give it ALL leads, so switching brand never looks like new leads arriving.
    const dn = window.detectNewLeads; window.detectNewLeads = function () { return dn(store.allLeads); };
  }

  /* ============================================================ small helpers */
  async function createTask(lead, ci, t) {
    const c = (lead.contacts || [])[ci] || {};
    await window.FB.saveReminder({ id: uid(), leadId: lead.id, company: lead.company, contactName: c.name || '', phone: c.phone || '', note: t.note, when: t.when, done: false, fired: false, auto: true, source: 'outcome', createdAt: new Date().toISOString() });
  }
  const copyText = async (txt, ok) => { try { await navigator.clipboard.writeText(txt); toast(ok || 'Copied'); } catch (e) { warn('Could not copy. Long-press the text to copy it.'); } };
  const sender = lead => ({ name: settings.name, title: settings.title, company: YS.brandOf(lead) === 'clearpath' ? 'Clearpath QR' : (settings.company || 'YALO') });
  const hasKey = () => !!(settings && String(settings.groqKey || '').trim());
  function needKey() { toast('Add your free Groq key in Settings (Companies and AI) to use ✨ AI', 'var(--red)'); }
  async function ai(kind, ctx) {
    if (!hasKey()) { needKey(); throw new Error('no key'); }
    const p = YS.promptFor(kind, ctx);
    const raw = await YS.groqChat({ key: settings.groqKey.trim(), model: settings.groqModel || 'llama-3.3-70b-versatile', system: p.system, user: p.user, temperature: p.temperature, max_tokens: p.max_tokens });
    return YS.cleanAi(raw);
  }
  const histText = lead => activities.filter(a => a.leadId === lead.id).slice(0, 6).map(a => `${fmtDay(a.ts)}: ${a.desc}`).join('\n');

  /* ============================================================ one-time DOM setup */
  function setup() {
    if ($('brand-bar')) return;
    const style = document.createElement('style');
    style.textContent = `
      .brand-bar{display:flex;gap:6px;padding:8px 14px;background:#fff;border-bottom:1px solid var(--border);overflow-x:auto}
      .bb-btn{flex:1 1 0;max-width:200px;min-width:0;white-space:nowrap;padding:8px 12px;border-radius:20px;border:1px solid var(--border);background:#fff;color:var(--muted);font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;min-height:38px}
      .bb-btn.on{color:#fff}
      .sf-card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:var(--shadow)}
      .sf-card h4{margin:0 0 10px;font-size:14px}
      .sf-row{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer}
      .sf-row:last-child{border-bottom:none}
      .sf-chip{flex:0 0 auto;font-size:11px;font-weight:800;padding:4px 10px;border-radius:20px;background:var(--gll);color:var(--gd);text-transform:uppercase;letter-spacing:.03em}
      .sf-chip.reply,.sf-chip.call{background:#fee2e2;color:#b91c1c}.sf-chip.send{background:#fef3c7;color:#92400e}
      .sf-txt{min-width:0;flex:1}.sf-name{font-weight:800;font-size:14px}.sf-why{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.4}
      .sf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .sf-num{background:var(--gll);border-radius:12px;padding:10px;text-align:center;min-width:0}.sf-num b{display:block;font-size:17px}.sf-num span{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em}
      .sf-bar{display:flex;align-items:center;gap:8px;font-size:12px;margin:6px 0}.sf-bar i{display:block;height:8px;border-radius:4px;background:var(--g);min-width:2px}.sf-bar span{flex:0 0 96px;color:var(--muted)}.sf-bar em{font-style:normal;color:var(--muted);flex:0 0 auto}
      .sf-quote{background:var(--gll);border-radius:10px;padding:12px;font-size:13px;line-height:1.55;white-space:pre-wrap;margin:8px 0}
      .sf-sec{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:14px 0 6px}
      .sf-det{border:1px solid var(--border);border-radius:12px;background:#fff;margin-bottom:10px;overflow:hidden}
      .sf-det>summary{list-style:none;cursor:pointer;padding:14px;font-weight:700;font-size:14px;display:flex;justify-content:space-between;gap:8px;min-height:48px;align-items:center}
      .sf-det>summary::-webkit-details-marker{display:none}.sf-det>summary::after{content:'▾';color:var(--muted)}.sf-det[open]>summary::after{content:'▴'}
      .sf-det>div{padding:0 14px 14px}
      .sf-btns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
      .sf-btns .btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
      .sf-out{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
      .sf-out .btn{min-height:54px;font-size:13px;white-space:normal;line-height:1.2}
      .sf-seg{display:flex;gap:6px;margin:0 0 12px}.sf-seg button{flex:1;min-height:42px;border-radius:12px;border:1px solid var(--border);background:#fff;font-weight:700;font-size:13px;font-family:inherit;color:var(--muted);cursor:pointer}.sf-seg button.on{background:var(--g);color:#fff;border-color:var(--g)}
      .sf-need{font-size:11px;color:#92400e;background:#fef3c7;border-radius:8px;padding:2px 8px;margin-left:6px;font-weight:700}
      .sheet-mo{align-items:flex-end}.sheet-mo .cm{width:min(680px,96vw);max-height:92vh}
      .sf-tbl label.fl{margin-top:10px}
      @media(max-width:768px){
        .brand-bar{padding:8px 12px}
        .sheet-mo .cm{width:100vw;max-width:100vw;border-radius:16px 16px 0 0;max-height:94vh;padding:18px 16px 14px}
        #tab-objections,#tab-offer{padding-bottom:96px}
        #tab-objections input,#tab-objections textarea,#tab-objections select,#tab-offer input,#tab-offer textarea,#tab-offer select,.sheet-mo input,.sheet-mo textarea,.sheet-mo select,#sales-settings input,#sales-settings textarea,#sales-settings select{font-size:16px}
        .sf-btns .btn{min-height:46px}.sf-out .btn{min-height:58px}
        .sf-grid{gap:6px}.sf-num b{font-size:15px}
      }`;
    document.head.appendChild(style);

    const top = document.querySelector('.topbar');
    if (top) { const bar = document.createElement('div'); bar.id = 'brand-bar'; bar.className = 'brand-bar'; top.after(bar); }

    // nav: sidebar + More sheet
    const q = document.querySelector('.ni[data-tab="outreach"]');
    if (q) {
      [['objections', '🛡️', 'Objections'], ['offer', '🎁', 'Offer builder']].reverse().forEach(([id, ic, label]) => {
        const ni = document.createElement('div'); ni.className = 'ni'; ni.dataset.tab = id; ni.setAttribute('onclick', `showTab('${id}')`);
        ni.innerHTML = `<span style="font-size:17px">${ic}</span><span>${label}</span>`; q.after(ni);
      });
    }
    const grid = document.querySelector('#more-sheet .sheet-grid');
    if (grid) [['objections', '🛡️', 'Objections'], ['offer', '🎁', 'Offer']].reverse().forEach(([id, ic, label]) => {
      const b = document.createElement('button'); b.className = 'sheet-item'; b.setAttribute('onclick', `moreGo('${id}')`); b.innerHTML = `<span>${ic}</span>${label}`; grid.prepend(b);
    });

    // tabs
    const anchor = $('tab-outreach') || $('tab-leads');
    ['offer', 'objections'].forEach(id => { const d = document.createElement('div'); d.className = 'content'; d.id = 'tab-' + id; d.style.display = 'none'; anchor.after(d); if (typeof TABS !== 'undefined' && !TABS.includes(id)) TABS.push(id); });

    // sheets
    ['call', 'ai'].forEach(id => { const m = document.createElement('div'); m.className = 'cmo sheet-mo'; m.id = id + '-mo'; m.innerHTML = '<div class="cm"><div id="' + id + '-body"></div></div>'; document.body.appendChild(m); });

    // Settings panel (top of the Settings tab)
    const st = $('tab-settings');
    if (st) { const d = document.createElement('div'); d.id = 'sales-settings'; st.prepend(d); }
  }

  /* ============================================================ SETTINGS: brands + AI */
  let models = null;
  function renderSettingsPanel() {
    const root = $('sales-settings'); if (!root) return;
    const p = profiles(), w = Object.assign({}, YS.DEFAULT_WEIGHTS, (settings && settings.stageWeights) || {});
    const field = (id, f, v) => {
      const val = Array.isArray(v) ? v.join('\n') : (v || '');
      return `<label class="fl">${esc(f.label)}</label>${f.long ? `<textarea class="fi" id="${id}" rows="${f.list ? 3 : 3}" style="min-height:74px">${esc(val)}</textarea>` : `<input class="fi" id="${id}" value="${esc(val)}">`}<div class="oq-sub" style="margin:3px 0 0">${esc(f.help)}</div>`;
    };
    root.innerHTML = `<div class="sf-card" style="margin-bottom:18px">
      <h4>Companies and AI</h4>
      <div class="oq-sub" style="margin-bottom:10px">Everything the emails, DMs, objection replies and AI use comes from here. The AI only uses facts you write below.</div>
      <label class="fl">Groq API key (free)</label>
      <input class="fi" id="sf-groq" type="password" placeholder="gsk_..." value="${esc((settings && settings.groqKey) || '')}" autocomplete="off">
      <div class="oq-sub" style="margin:3px 0 8px">Get one free at console.groq.com. Stored only in your own CRM settings.</div>
      <label class="fl">AI model</label>
      <div class="oq-acts"><select class="fsel" id="sf-model" style="flex:1;min-width:180px">${((models || [(settings && settings.groqModel) || 'llama-3.3-70b-versatile']).map(m => `<option ${m === ((settings && settings.groqModel) || 'llama-3.3-70b-versatile') ? 'selected' : ''}>${esc(m)}</option>`)).join('')}</select>
      <button class="btn btn-ghost btn-sm" onclick="SALES.loadModels()">Load models</button></div>
      <div id="sf-model-msg" class="oq-sub" style="margin-top:4px"></div>
      ${YS.BRAND_IDS.map(id => {
        const b = p[id], miss = YS.missingFacts(b);
        return `<details class="sf-det" style="margin-top:12px" ${miss.length && id === 'clearpath' ? 'open' : ''}><summary><span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${b.color};margin-right:8px"></span>${esc(b.name)}${miss.length ? `<span class="sf-need">add: ${esc(miss.join(', '))}</span>` : ''}</span></summary><div class="sf-tbl">
          ${YS.BRAND_FIELDS.map(f => field('sfb-' + id + '-' + f.key, f, b[f.key])).join('')}
          <div class="oq-acts" style="margin-top:12px"><button class="btn btn-ghost btn-sm" onclick="SALES.resetBrand('${id}')">Reset to defaults</button></div></div></details>`;
      }).join('')}
      <details class="sf-det"><summary>Chance of closing by stage (for the forecast)</summary><div>
        <div class="g2" style="gap:8px 14px">${YS.STAGE_ORDER.filter(s => !['Closed', 'Lost'].includes(s)).map(s => `<div><label class="fl">${esc(s)} %</label><input class="fi" type="number" min="0" max="100" id="sfw-${s.replace(/\s/g, '')}" value="${Math.round((w[s] || 0) * 100)}"></div>`).join('')}</div></div></details>
      <button class="btn btn-g" style="width:100%;min-height:46px;margin-top:12px" onclick="SALES.saveSettingsPanel()">Save companies and AI</button>
    </div>`;
  }
  const SALESAPI = window.SALES = {
    setBrand, profileFor, activeBrandOrDefault,
    // shared with workspace.js (templates, tasks, daily plan)
    anyLead: id => store.allLeads.find(l => l.id === id),
    // a tapped notification may be for the other company: switch to it so the lead can be opened
    setBrandFor: lead => { const b = YS.brandOf(lead); if (activeBrand !== 'all' && activeBrand !== b) setBrand(b); }, allLeads: () => store.allLeads, allActs: () => store.allActs,
    util: { ai, createTask, copyText, openSheet, closeSheet, profiles, sender, hasKey, needKey, aiBlock: text => aiBlock(text), activeBrand: () => activeBrand },
    async loadModels() {
      const key = ($('sf-groq') || {}).value || ''; const msg = $('sf-model-msg');
      if (!key.trim()) return warn('Paste your Groq key first.');
      msg.textContent = 'Loading…';
      try { models = await YS.groqModels(key.trim()); msg.textContent = models.length + ' models found.'; const cur = ($('sf-model') || {}).value; renderSettingsPanel(); const sel = $('sf-model'); if (sel && models.includes(cur)) sel.value = cur; $('sf-groq').value = key; $('sf-model-msg').textContent = models.length + ' models found.'; }
      catch (e) { msg.textContent = '⚠ ' + e.message; }
    },
    resetBrand(id) {
      if (!confirm('Reset ' + YS.DEFAULT_BRANDS[id].name + ' to the built-in facts? Your edits for it will be lost after you save.')) return;
      const d = YS.DEFAULT_BRANDS[id];
      YS.BRAND_FIELDS.forEach(f => { const el = $('sfb-' + id + '-' + f.key); if (el) el.value = Array.isArray(d[f.key]) ? d[f.key].join('\n') : (d[f.key] || ''); });
      toast('Reset. Tap Save to keep it.');
    },
    async saveSettingsPanel() {
      if (!settingsLoaded()) return warn('Settings are still loading. Try again in a moment.');
      const brands = {};
      YS.BRAND_IDS.forEach(id => {
        const o = {};
        YS.BRAND_FIELDS.forEach(f => { const el = $('sfb-' + id + '-' + f.key); if (!el) return; const v = el.value; o[f.key] = f.list ? v.split('\n').map(x => YO.clean(x, 400)).filter(Boolean) : (f.long ? String(v).replace(/[<>]/g, '').trim().slice(0, 1500) : YO.clean(v, 400)); });
        brands[id] = o;
      });
      const weights = {};
      YS.STAGE_ORDER.filter(s => !['Closed', 'Lost'].includes(s)).forEach(s => { const el = $('sfw-' + s.replace(/\s/g, '')); if (el && el.value !== '') weights[s] = Math.min(1, Math.max(0, Number(el.value) / 100)); });
      const next = Object.assign({}, settings, { groqKey: ($('sf-groq').value || '').trim(), groqModel: ($('sf-model') || {}).value || 'llama-3.3-70b-versatile', brands, stageWeights: weights });
      await window.FB.saveSettings(next);
      toast('Saved ✓');
    }
  };

  /* ============================================================ AI sheet (personalise, call prep, scripts, offers) */
  function openSheet(id, html) { setup(); $(id + '-body').innerHTML = html; $(id + '-mo').classList.add('open'); }
  function closeSheet(id) { const m = $(id + '-mo'); if (m) m.classList.remove('open'); }
  const aiState = { text: '', ctx: null };
  Object.assign(SALESAPI, {
    closeAi() { closeSheet('ai'); },
    personalise(leadId, ci, idx) {
      const l = findLead(leadId); if (!l) return;
      const c = (l.contacts || [])[ci] || {};
      const r = YO.renderStep(l, ci, idx, tplFor, { brand: profileFor(l), sender: sender(l) });
      aiState.ctx = { leadId, ci, idx, channel: r.channel, draft: (r.subject ? 'Subject: ' + r.subject + '\n\n' : '') + r.body };
      openSheet('ai', `<div class="cmtitle">✨ Personalise</div>
        <div class="cmsub">${esc(c.name || l.company)} · ${esc(r.label)} (${esc(YS.channelLabel(r.channel))}). The AI rewrites the draft using only the facts in your company profile and this lead.</div>
        <div class="sf-sec">Draft</div><div class="sf-quote">${esc(aiState.ctx.draft)}</div>
        <label class="fl">Anything to add? (optional)</label><textarea class="fi" id="ai-extra" style="min-height:60px" placeholder="${r.channel === 'email' ? 'e.g. mention their new office, keep it shorter' : 'e.g. refer to their last video about X'}"></textarea>
        <div id="ai-out"></div>
        <div class="imp-foot"><div style="display:flex;gap:8px;flex:1;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" onclick="SALES.closeAi()">Close</button><button class="btn btn-g" id="ai-go" onclick="SALES.runPersonalise()">✨ Rewrite it</button></div></div>`);
    },
    async runPersonalise() {
      const s = aiState.ctx, l = findLead(s.leadId); if (!l) return;
      const btn = $('ai-go'); btn.disabled = true; btn.textContent = 'Writing…';
      try {
        const out = await ai('personalise', { brand: profileFor(l), lead: l, contact: (l.contacts || [])[s.ci], sender: sender(l), draft: s.draft, channel: s.channel, instruction: ($('ai-extra') || {}).value });
        aiState.text = out.text;
        const m = s.channel === 'email' ? out.text.match(/^Subject:\s*(.+)\n+([\s\S]*)$/i) : null;
        const subj = m ? m[1].trim() : '', body = m ? m[2].trim() : out.text;
        aiState.subject = subj; aiState.body = body;
        const left = YO.leftoverTokens(subj + ' ' + body);
        $('ai-out').innerHTML = `<div class="sf-sec">Result (you can edit it)</div>
          ${s.channel === 'email' ? `<input class="fi" id="ai-subj" value="${esc(subj)}" style="margin-bottom:8px">` : ''}
          <textarea class="fi" id="ai-text" style="min-height:170px">${esc(body)}</textarea>
          ${left.length ? `<div class="oq-warn">⚠ Still contains ${esc(left.join(', '))}. Fix it before using this.</div>` : ''}
          ${out.flags.length ? `<div class="oq-warn">Heads up: ${esc(out.flags.map(f => f.name).join('; '))}. Reword if it sounds stiff.</div>` : ''}
          <div class="oq-acts" style="margin-top:8px"><button class="btn btn-g" style="min-height:46px;flex:1" onclick="SALES.useAi()">✓ Use this version</button><button class="btn btn-ghost" style="min-height:46px" onclick="SALES.copyAi()">📋 Copy</button></div>`;
      } catch (e) { if (e.message !== 'no key') warn(e.message); }
      btn.disabled = false; btn.textContent = '✨ Rewrite again';
    },
    copyAi() { copyText((aiState.ctx.channel === 'email' ? 'Subject: ' + ($('ai-subj') || {}).value + '\n\n' : '') + ($('ai-text') || {}).value); },
    async useAi() {
      const s = aiState.ctx, l = findLead(s.leadId); if (!l) return;
      const body = ($('ai-text') || {}).value || '', subj = ($('ai-subj') || {}).value || '';
      if (!YO.editStep(l, s.ci, s.idx, { subject: subj, body })) return warn('Could not save this step.');
      await window.FB.saveLead(l);
      closeSheet('ai'); toast('Saved to this step ✓');
      if (window.OUT) OUT.refresh();
    }
  });
  function tplFor(type) {
    const legacy = { office: typeof OFFICE_SCRIPTS !== 'undefined' ? OFFICE_SCRIPTS : [], employer: typeof EMPLOYER_SCRIPTS !== 'undefined' ? EMPLOYER_SCRIPTS : [] };
    return YS.templatesFor(type, legacy);
  }

  /* ============================================================ OBJECTIONS + REJECTIONS */
  const obj = { group: 'objection', leadId: '', ci: 0, results: {} };
  function renderObjections() {
    const root = $('tab-objections'); if (!root) return;
    const b = activeBrandOrDefault(), p = profiles()[b];
    const lead = findLead(obj.leadId);
    const list = YS.objectionsFor(b, obj.group);
    root.innerHTML = `
      <div class="sec-head" style="margin-top:0"><h3>Objections and rejections</h3></div>
      <div class="oq-sub" style="margin:-6px 0 12px">What to say when ${esc(p.name)} prospects push back. Based on your closing playbook: acknowledge, associate, ask. Never argue, never discount.</div>
      <div class="sf-seg"><button class="${obj.group === 'objection' ? 'on' : ''}" onclick="SALES.objGroup('objection')">Objections</button><button class="${obj.group === 'rejection' ? 'on' : ''}" onclick="SALES.objGroup('rejection')">Rejections</button></div>
      <label class="fl">For which lead? (optional, lets you tailor and create the follow-up)</label>
      <select class="fsel" id="obj-lead" style="width:100%;margin-bottom:12px" onchange="SALES.objLead(this.value)"><option value="">No lead selected</option>
        ${live().map(l => `<option value="${esc(l.id)}" ${l.id === obj.leadId ? 'selected' : ''}>${esc(l.company)}${l.contacts && l.contacts[0] ? ' · ' + esc(l.contacts[0].name || '') : ''}</option>`).join('')}</select>
      ${list.map(o => {
        const reply = YS.objectionReply(o, b, p);
        const res = obj.results[o.id];
        return `<details class="sf-det" ${res ? 'open' : ''}><summary>${esc(o.title)}</summary><div>
          <div class="sf-sec" style="margin-top:0">What it usually means</div><div class="oq-sub">${esc(o.means)}</div>
          <div class="sf-sec">Say this</div><div class="sf-quote">${esc(reply)}</div>
          ${o.ask ? `<div class="oq-sub">Then ask: <b>${esc(o.ask)}</b></div>` : ''}
          <div class="sf-btns">
            <button class="btn btn-ghost btn-sm" onclick="SALES.objCopy('${o.id}')">📋 Copy</button>
            <button class="btn btn-ghost btn-sm" onclick="SALES.objAi('${o.id}')">✨ Tailor with AI</button>
            ${lead && o.next ? `<button class="btn btn-ghost btn-sm" onclick="SALES.objTask('${o.id}')">＋ Follow-up task</button>` : ''}
            ${lead && o.dnc ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="SALES.objDnc()">⛔ Mark do-not-contact</button>` : ''}
          </div>
          <div id="obj-ai-${o.id}">${res ? aiBlock(res) : ''}</div></div></details>`;
      }).join('')}`;
  }
  function aiBlock(text) {
    return `<div class="sf-sec">AI version</div><div class="sf-quote">${esc(text)}</div><div class="oq-acts"><button class="btn btn-ghost btn-sm" onclick="SALES.copyBlock(this)">📋 Copy</button></div>`;
  }
  Object.assign(SALESAPI, {
    objGroup(g) { obj.group = g; renderObjections(); },
    objLead(id) { obj.leadId = id; renderObjections(); },
    objCopy(id) { const o = YS.OBJECTIONS.find(x => x.id === id); copyText(YS.objectionReply(o, activeBrandOrDefault(), profiles()[activeBrandOrDefault()])); },
    copyBlock(btn) { const q = btn.closest('div').previousElementSibling; copyText(q ? q.innerText : ''); },
    async objAi(id) {
      const o = YS.OBJECTIONS.find(x => x.id === id), l = findLead(obj.leadId);
      if (!l) return warn('Pick a lead first so the AI can tailor it.');
      const b = YS.brandOf(l), box = $('obj-ai-' + id); box.innerHTML = '<div class="oq-sub" style="margin-top:8px">Writing…</div>';
      try {
        const out = await ai('objection', { brand: profiles()[b], lead: l, contact: (l.contacts || [])[obj.ci], objection: o.title.replace(/^"|"$/g, ''), standard: YS.objectionReply(o, b, profiles()[b]) });
        obj.results[id] = out.text; box.innerHTML = aiBlock(out.text);
      } catch (e) { box.innerHTML = ''; if (e.message !== 'no key') warn(e.message); }
    },
    async objTask(id) {
      const o = YS.OBJECTIONS.find(x => x.id === id), l = findLead(obj.leadId); if (!l) return;
      const t = YS.taskForObjection(o, l, obj.ci, new Date()); if (!t) return;
      await createTask(l, obj.ci, t);
      await addAct({ leadId: l.id, type: 'note', company: l.company, desc: `Objection: ${o.title.replace(/"/g, '')}. Follow-up set.` });
      toast('Task created for ' + new Date(t.when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    },
    async objDnc() { const l = findLead(obj.leadId); if (l && window.OUT) OUT.dnc(l.id, obj.ci); }
  });

  /* ============================================================ OFFER BUILDER */
  const VE = [
    { k: 'dream', label: 'Dream outcome', tip: 'Raise it: describe the result in the buyer\'s words (cash kept in the business, leads in hand), not your features.' },
    { k: 'likely', label: 'Likelihood they will get it', tip: 'Raise it with real proof: named customers, real numbers, a clear step by step, a guarantee you can honour.' },
    { k: 'time', label: 'How long until the result', tip: 'Shrink it: show a first win quickly (first lease paid, first lead captured), and say how soon.' },
    { k: 'effort', label: 'Effort and sacrifice', tip: 'Shrink it: you handle the paperwork, the setup, the chasing. Make saying yes take one step.' }
  ];
  const offerState = { s: { dream: 6, likely: 5, time: 5, effort: 5 }, out: '' };
  function renderOffer() {
    const root = $('tab-offer'); if (!root) return;
    const b = activeBrandOrDefault(), p = profiles()[b], s = offerState.s;
    const weakest = VE.slice().sort((a, c) => (s[a.k] - s[c.k]) || (VE.indexOf(c) - VE.indexOf(a)))[0];
    const score = ((s.dream * s.likely) / Math.max(1, s.time * s.effort)).toFixed(1);
    root.innerHTML = `
      <div class="sec-head" style="margin-top:0"><h3>Offer builder</h3></div>
      <div class="oq-sub" style="margin:-6px 0 12px">For ${esc(p.name)}. From your offer and growth playbooks: a strong offer makes saying no feel silly. Score your current offer honestly, fix the weakest part, then let the AI draft a better one.</div>
      <div class="sf-card"><h4>1. Score your offer today (1 to 10)</h4>
        ${VE.map(v => `<label class="fl" style="display:flex;justify-content:space-between"><span>${esc(v.label)}</span><b id="ve-${v.k}-n">${s[v.k]}</b></label><input type="range" min="1" max="10" value="${s[v.k]}" style="width:100%;margin-bottom:8px" oninput="SALES.veSet('${v.k}',this.value)">`).join('')}
        <div class="sf-quote" id="ve-out"><b>Weakest part: ${esc(weakest.label)}.</b> ${esc(weakest.tip)}\nValue score: ${score} (higher is better: outcome and likelihood up, time and effort down).</div></div>
      <div class="sf-card"><h4>2. Draft a better offer with AI</h4>
        <label class="fl">Who is it for?</label><textarea class="fi" id="of-avatar" style="min-height:60px">${esc(p.audience)}</textarea>
        <label class="fl">The problem they feel (in their words)</label><textarea class="fi" id="of-pain" style="min-height:60px" placeholder="e.g. a big upfront rent cheque ties up cash we need for growth"></textarea>
        <label class="fl">What we sell today</label><textarea class="fi" id="of-product" style="min-height:74px">${esc(p.offer)}</textarea>
        <label class="fl">What we can deliver and afford (guarantees, extras, limits)</label><textarea class="fi" id="of-limits" style="min-height:60px" placeholder="Only things you can truly honour"></textarea>
        <button class="btn btn-g" id="of-go" style="width:100%;min-height:46px;margin-top:12px" onclick="SALES.offerAi()">✨ Build my offer</button>
        <div id="of-out">${offerState.out ? aiBlock(offerState.out) : ''}</div></div>`;
  }
  Object.assign(SALESAPI, {
    veSet(k, v) {
      offerState.s[k] = Number(v); $('ve-' + k + '-n').textContent = v;
      const s = offerState.s, weakest = VE.slice().sort((a, c) => (s[a.k] - s[c.k]) || (VE.indexOf(c) - VE.indexOf(a)))[0];
      $('ve-out').innerHTML = `<b>Weakest part: ${esc(weakest.label)}.</b> ${esc(weakest.tip)}\nValue score: ${((s.dream * s.likely) / Math.max(1, s.time * s.effort)).toFixed(1)} (higher is better: outcome and likelihood up, time and effort down).`;
    },
    async offerAi() {
      const b = activeBrandOrDefault(), p = profiles()[b], btn = $('of-go');
      btn.disabled = true; btn.textContent = 'Building…';
      try {
        const out = await ai('offer', { brand: p, avatar: $('of-avatar').value, pain: $('of-pain').value, product: $('of-product').value, limits: $('of-limits').value });
        offerState.out = out.text; $('of-out').innerHTML = aiBlock(out.text);
      } catch (e) { if (e.message !== 'no key') warn(e.message); }
      btn.disabled = false; btn.textContent = '✨ Build it again';
    }
  });

  /* ============================================================ CALL MODE */
  const call = { leadId: '', ci: 0, obj: '', meet: false };
  const OPEN_OBJ = ['price', 'info', 'not-now', 'board', 'already', 'need', 'trust'];
  function leadTouches(l) {
    const acts = activities.filter(a => a.leadId === l.id);
    return acts.length ? acts[0] : null;
  }
  function briefHtml(l, c) {
    const now = new Date();
    const last = leadTouches(l), quiet = last ? Math.floor((now - new Date(last.ts)) / 86400000) : null;
    const st = YO.seqState(l, call.ci);
    let seq = 'No sequence running.';
    if (st) { const reason = YO.stopReason(l, call.ci, st), n = YO.nextIdx(st.steps), d = YO.dueDate(st); seq = reason ? `Sequence: ${reason}.` : `Sequence: step ${n + 1} of ${st.steps.length} due ${fmtDay(d)}.`; }
    const tasks = reminders.filter(r => r.leadId === l.id && !r.done).sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 3);
    const acts = activities.filter(a => a.leadId === l.id).slice(0, 4);
    return `<div class="oq-sub" style="line-height:1.6"><b>${esc(l.stage)}</b>${l.value ? ' · ' + esc(fmt(l.value)) : ''}${l.sector ? ' · ' + esc(l.sector) : ''}${l.hq ? ' · ' + esc(l.hq) : ''}<br>
      Last touch: ${quiet == null ? 'never' : quiet === 0 ? 'today' : quiet + ' days ago'}. ${esc(seq)}${l.hook ? `<br>Why now: ${esc(l.hook)}` : ''}${l.notes ? `<br>Notes: ${esc(String(l.notes).slice(-300))}` : ''}</div>
      ${tasks.length ? `<div class="sf-sec">Open tasks</div>${tasks.map(t => `<div class="oq-sub">• ${esc(t.note)} (${fmtDay(t.when)})</div>`).join('')}` : ''}
      ${acts.length ? `<div class="sf-sec">Recent</div>${acts.map(a => `<div class="oq-sub">• ${esc(a.desc)} (${ago(a.ts)})</div>`).join('')}` : ''}
      <div class="sf-btns"><button class="btn btn-ghost btn-sm" onclick="SALES.callAi('callprep')">✨ AI call prep</button><button class="btn btn-ghost btn-sm" onclick="SALES.callAi('script')">✨ AI script</button></div><div id="call-ai"></div>`;
  }
  function scriptHtml(l, c, p) {
    const first = YO.firstName(c.name), who = settings.name || 'I', proof = (p.proof || [])[0] || '';
    const promise = (p.offer || '').split(/(?<=[.!?])\s/)[0] || p.oneLiner;
    const q = YS.BRAND_IDS.includes(YS.brandOf(l)) && YS.brandOf(l) === 'clearpath'
      ? ['What made you take this call today?', 'How do you capture leads from your videos at the moment, and what is it costing you?', 'What have you tried before, and what was missing?', 'Who else is involved in decisions about your channel?', 'If we found a fit, when would you want to try it on a video?']
      : ['What made you take this call today? And why is that important now?', `How does ${l.company} handle rent today, and what does that cost the business?`, 'What have you tried before, and what was missing?', 'Who else is involved in deciding this?', 'If we found a fit, when would you want to start?'];
    return `<div class="sf-sec" style="margin-top:0">Open (proof, promise, plan: 20 seconds)</div>
      <div class="sf-quote">Hi ${esc(first)}, it's ${esc(who)} from ${esc(p.name)}. ${esc(proof)} ${esc(promise)} Here is how I would like to use the next few minutes: I ask a few questions, we see if it is a fit, and either way you leave with something useful. Does that work?</div>
      <div class="sf-sec">Find out why they are here</div><div class="sf-quote">${q.map((x, i) => `${i + 1}. ${esc(x)}`).join('\n')}</div>
      <div class="sf-sec">The pitch (under 2 minutes, tied to what they said)</div><div class="sf-quote">${esc(p.offer)}</div>
      <div class="sf-sec">Ask, then stay quiet</div><div class="sf-quote">Based on what you have told me, would you like to see how this would work for ${esc(l.company)}?</div>
      <div class="sf-sec">Book the next step before you hang up</div><div class="sf-quote">Let's put 15 minutes in the diary. Would Thursday at 10:00 or Friday at 15:00 suit you better?</div>`;
  }
  function objQuick(b, p) {
    const ids = OPEN_OBJ.filter(id => { const o = YS.OBJECTIONS.find(x => x.id === id); return o && (o.reply[b] || o.reply.default); });
    const sel = YS.OBJECTIONS.find(o => o.id === call.obj);
    return `<div class="oq-chips" style="flex-wrap:wrap">${ids.map(id => { const o = YS.OBJECTIONS.find(x => x.id === id); return `<button class="oq-chip ${call.obj === id ? 'active' : ''}" onclick="SALES.callObj('${id}')">${esc(o.title.replace(/"/g, ''))}</button>`; }).join('')}</div>
      ${sel ? `<div class="sf-quote">${esc(YS.objectionReply(sel, b, p))}</div><div class="oq-sub">Then ask: <b>${esc(sel.ask || '')}</b></div>` : '<div class="oq-sub">Tap what they said.</div>'}`;
  }
  function renderCall() {
    const l = findLead(call.leadId); if (!l) return;
    const c = (l.contacts || [])[call.ci] || {}, b = YS.brandOf(l), p = profiles()[b];
    const links = [];
    if (c.phone) { links.push(`<a class="btn btn-g" style="min-height:46px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center" href="tel:${esc(c.phone)}">📞 Call ${esc(c.phone)}</a>`); const wa = YO.waLink(c.phone, ''); if (wa) links.push(`<a class="btn btn-ghost" style="min-height:46px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center" target="_blank" rel="noopener" href="${esc(wa)}">💬 WhatsApp</a>`); }
    else links.push('<div class="oq-warn">No phone number on this person yet. Add one in the lead.</div>');
    const meet = call.meet ? `<div class="sf-card" style="margin-top:10px"><label class="fl">When is the meeting?</label><input class="fi" id="call-meet" type="datetime-local"><div class="oq-acts" style="margin-top:8px"><button class="btn btn-g" style="min-height:46px;flex:1" onclick="SALES.callMeeting()">Save meeting and reminders</button><button class="btn btn-ghost" style="min-height:46px" onclick="SALES.callMeetCancel()">Cancel</button></div></div>` : '';
    $('call-body').innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="cmtitle" style="margin:0">${esc(c.name || l.company)}</div><div class="cmsub" style="margin:2px 0 0">${esc(c.title || '')}${c.title ? ' at ' : ''}${esc(l.company)} · <span style="color:${p.color};font-weight:700">${esc(p.name)}</span></div></div><button class="mx" onclick="SALES.callClose()">✕</button></div>
      <div class="oq-acts" style="margin:12px 0 4px">${links.join('')}</div>
      <details class="sf-det" open style="margin-top:12px"><summary>1. Brief</summary><div>${briefHtml(l, c)}</div></details>
      <details class="sf-det"><summary>2. Script</summary><div>${scriptHtml(l, c, p)}</div></details>
      <details class="sf-det"><summary>3. They push back</summary><div>${objQuick(b, p)}</div></details>
      <details class="sf-det"><summary>4. Notes</summary><div><textarea class="fi" id="call-note" style="min-height:90px" placeholder="What did they say? Names, numbers, dates."></textarea><button class="btn btn-ghost" style="margin-top:8px;min-height:44px;width:100%" onclick="SALES.callNote()">Save note</button></div></details>
      <div class="sf-sec">5. How did it go?</div>
      <div class="sf-out">${YS.OUTCOMES.map(o => `<button class="btn btn-ghost" onclick="SALES.callOutcome('${o.id}')">${o.icon}<br>${esc(o.label)}</button>`).join('')}</div>${meet}
      <div class="oq-sub" style="margin-top:10px">Each outcome updates the stage and creates your next follow-up task for you.</div>`;
  }
  Object.assign(SALESAPI, {
    call(leadId, ci) {
      setup(); const l = findLead(leadId); if (!l) return;
      call.leadId = leadId; call.ci = ci || 0; call.obj = ''; call.meet = false; renderCall(); $('call-mo').classList.add('open');
      if (window.closeDrawer) closeDrawer();
    },
    callClose() { closeSheet('call'); },
    callObj(id) { call.obj = id; const d = $('call-body').querySelectorAll('details'); const open = [...d].map(x => x.open); renderCall(); $('call-body').querySelectorAll('details').forEach((x, i) => { x.open = open[i]; }); },
    callMeetCancel() { call.meet = false; renderCall(); },
    async callAi(kind) {
      const l = findLead(call.leadId), box = $('call-ai'); if (!l) return;
      box.innerHTML = '<div class="oq-sub" style="margin-top:8px">Writing…</div>';
      try {
        const out = await ai(kind, { brand: profileFor(l), lead: l, contact: (l.contacts || [])[call.ci], history: histText(l) });
        box.innerHTML = aiBlock(out.text);
      } catch (e) { box.innerHTML = ''; if (e.message !== 'no key') warn(e.message); }
    },
    async callNote() {
      const l = findLead(call.leadId), el = $('call-note'); if (!l || !el || !el.value.trim()) return warn('Write the note first.');
      const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      l.notes = (l.notes ? l.notes + '\n' : '') + `[${stamp}] ${YO.clean(el.value, 1200)}`;
      await window.FB.saveLead(l); await addAct({ leadId: l.id, type: 'note', company: l.company, desc: 'Call note saved' });
      toast('Note saved ✓'); el.value = '';
    },
    async callOutcome(id) {
      const o = YS.OUTCOMES.find(x => x.id === id); if (!o) return;
      if (o.needsDate) { call.meet = true; renderCall(); const el = $('call-meet'); if (el) el.focus(); return; }
      await doOutcome(id, null);
    },
    async callMeeting() {
      const v = ($('call-meet') || {}).value; if (!v) return warn('Choose the meeting date and time.');
      const at = new Date(v); if (isNaN(at) || at < new Date()) return warn('Pick a time in the future.');
      await doOutcome('meeting', at);
    }
  });
  async function doOutcome(id, meetingAt) {
    const l = findLead(call.leadId); if (!l) return;
    const c = (l.contacts || [])[call.ci] || {};
    if (id === 'dnc' && !confirm(`Mark ${c.name || 'this person'} as do-not-contact? No more messages will be queued, even if they appear in a future import.`)) return;
    const res = YS.applyOutcome(l, call.ci, id, new Date(), { meetingAt });
    if (!res) return;
    await window.FB.saveLead(l);
    await addAct({ leadId: l.id, type: 'call', company: l.company, desc: res.activity });
    if (res.stageChanged) await addAct({ leadId: l.id, type: 'status', company: l.company, desc: `Stage: ${res.stageChanged[0]} -> ${res.stageChanged[1]}` });
    for (const t of res.tasks) await createTask(l, call.ci, t);
    if (res.dnc && window.OUT && OUT.persistDnc) await OUT.persistDnc(c.email, true);
    closeSheet('call');
    const when = res.tasks[0] ? ` Next: ${res.tasks[0].note} (${fmtDay(res.tasks[0].when)}).` : '';
    toast('Logged ✓' + when);
    if (window.OUT) OUT.refresh();
    if (curTab === 'dashboard') renderDash();
  }

  /* ============================================================ HOME: do this next + forecast */
  function dashCards() {
    const wrap = $('today-wrap'); if (!wrap) return;
    let box = $('sf-dash'); if (!box) { box = document.createElement('div'); box.id = 'sf-dash'; ($('oq-dash-strip') || wrap).before(box); }
    // "Do this next" goes right under the greeting, above the stat tiles: it is the first thing to look at.
    let top = $('sf-next'); if (!top) { top = document.createElement('div'); top.id = 'sf-next'; const m = $('metrics'); (m || box).before(top); }
    const now = new Date();
    const next = YS.nextActions(live(), { now, activities, reminders }, 5);
    const f = YS.forecast(live(), activities, now, settings && settings.stageWeights);
    const money = n => n == null ? '—' : fmt(n);
    const pct = n => n == null ? '—' : Math.round(n * 100) + '%';
    const max = Math.max(1, ...Object.values(f.byStage).map(x => x.value));
    const stages = YS.STAGE_ORDER.filter(s => !['Closed', 'Lost'].includes(s));
    top.innerHTML = `<div class="sf-card"><h4>Do this next</h4>
        ${next.length ? next.map(x => `<div class="sf-row" onclick="${x.action === 'send' ? `OUT.open('${esc(x.lead.id)}',0,'emails')` : `SALES.call('${esc(x.lead.id)}',0)`}">
          <span class="sf-chip ${x.action}">${esc(YS.ACTION_LABEL[x.action])}</span>
          <div class="sf-txt"><div class="sf-name">${esc(x.lead.company)}${x.lead.contacts && x.lead.contacts[0] && x.lead.contacts[0].name ? ' <span style="font-weight:500;color:var(--muted)">· ' + esc(x.lead.contacts[0].name) + '</span>' : ''}</div><div class="sf-why">${esc(x.reasons.slice(0, 3).join(' · '))}</div></div></div>`).join('')
          : '<div class="oq-sub">Nothing urgent. Import leads or start a sequence to fill this list.</div>'}
      </div>`;
    box.innerHTML = `
      <div class="sf-card"><h4>Forecast ${activeBrand === 'all' ? '(both companies)' : ''}</h4>
        <div class="sf-grid"><div class="sf-num"><b>${money(f.weighted)}</b><span>Likely to close</span></div><div class="sf-num"><b>${money(f.openValue)}</b><span>Open pipeline</span></div><div class="sf-num"><b>${pct(f.winRate)}</b><span>Win rate</span></div></div>
        <div class="sf-grid"><div class="sf-num"><b>${money(f.closedValue)}</b><span>Closed</span></div><div class="sf-num"><b>${money(f.avgDeal)}</b><span>Average deal</span></div><div class="sf-num"><b>${f.avgDaysToClose == null ? '—' : f.avgDaysToClose + 'd'}</b><span>Days to close</span></div></div>
        ${stages.map(s => `<div class="sf-bar"><span>${esc(s)}</span><i style="width:${Math.max(2, Math.round(f.byStage[s].value / max * 100))}%"></i><em>${f.byStage[s].count} · ${money(f.byStage[s].value)}</em></div>`).join('')}
        ${f.stuck.length ? `<div class="sf-sec">Stuck: no contact for 2 weeks or more</div>${f.stuck.slice(0, 3).map(x => `<div class="sf-row" onclick="SALES.call('${esc(x.lead.id)}',0)"><span class="sf-chip call">${x.quiet}d</span><div class="sf-txt"><div class="sf-name">${esc(x.lead.company)}</div><div class="sf-why">${esc(x.lead.stage)}${x.lead.value ? ' · ' + esc(fmt(x.lead.value)) : ''}</div></div></div>`).join('')}` : ''}
        <div class="oq-sub" style="margin-top:8px">“Likely to close” weighs each deal by the chance for its stage. Change the odds in Settings.</div>
      </div>`;
  }

  /* ============================================================ hook into the app */
  function hook() {
    setup(); renderBrandBar(); renderSettingsPanel();
    if (window.FB) wrapFB(); window.addEventListener('firebase-ready', wrapFB);
    const _showTab = window.showTab;
    window.showTab = function (t) {
      _showTab(t);
      if (t === 'objections') { $('page-title').textContent = 'Objections'; renderObjections(); }
      if (t === 'offer') { $('page-title').textContent = 'Offer builder'; renderOffer(); }
      if (t === 'settings') renderSettingsPanel();
    };
    const _renderDash = window.renderDash;
    window.renderDash = function () { _renderDash(); try { dashCards(); } catch (e) { console.warn('dash cards', e); } };
    const _load = window.loadSettingsUI;
    window.loadSettingsUI = function () { _load(); const open = document.activeElement && $('sales-settings') && $('sales-settings').contains(document.activeElement); if (!open) renderSettingsPanel(); renderBrandBar(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
