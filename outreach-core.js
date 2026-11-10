/* YALO CRM — outreach core (pure logic, no DOM, no Firebase).
 * Works in the browser (window.YO) and in Node (module.exports) so it can be unit tested.
 *
 * Data model (backward compatible with existing leads):
 *   lead.contacts[ci] = { name,title,email,phone,linkedin, dnc?, dncAt?, src?, seq? }
 *   contact.seq       = { active, startedAt, type:null|'office'|'employer', paused?, stopped?, steps:[{status,sentAt?,subject?,body?}] x7 }
 *   Legacy: a lead with no contact.seq and lead.contactedAt set (or any email sent) is a
 *           "legacy" sequence belonging to contacts[0]; its steps are lead.emails.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const EDAYS = [0, 2, 6, 13, 20, 29, 44];                // days from first email (CRM default)
  const GAPS = EDAYS.map((d, i) => (i ? d - EDAYS[i - 1] : 0)); // days after the previous email is SENT
  const STEPS = EDAYS.length;
  const STOP_STAGES = ['Replied', 'Meeting Set', 'Proposal Sent', 'Closed', 'Lost'];
  const SENT_STATES = ['sent', 'opened', 'replied'];

  /* ---------------- text safety ---------------- */
  // Imported text ends up inside HTML templates and attributes: drop angle brackets,
  // swap double quotes, strip control characters.
  function clean(v, max) {
    let s = v == null ? '' : String(v);
    s = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/"/g, "'").replace(/\s+/g, ' ').trim();
    return s.slice(0, max || 300);
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /* ---------------- CSV ---------------- */
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && counts[ch] !== undefined) counts[ch]++; }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let r = [], f = ''; q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"') q = true;
      else if (c === delim) { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        r.push(f); f = '';
        if (r.some(x => x.trim() !== '')) rows.push(r);
        r = [];
      } else f += c;
    }
    if (f !== '' || r.length) { r.push(f); if (r.some(x => x.trim() !== '')) rows.push(r); }
    return rows;
  }

  /* ---------------- column mapping ---------------- */
  const FIELD_LABELS = {
    name: 'Full name', first: 'First name', last: 'Last name', email: 'Email', email2: 'Second email',
    phone: 'Phone', title: 'Job title', company: 'Company', website: 'Website / domain',
    linkedin: 'LinkedIn URL', location: 'Location'
  };
  const SYNONYMS = {
    name: ['name', 'fullname', 'contactname', 'personname', 'prospectname'],
    first: ['firstname', 'first', 'givenname', 'fname'],
    last: ['lastname', 'last', 'surname', 'familyname', 'lname'],
    email: ['workemail', 'businessemail', 'professionalemail', 'email', 'emailaddress', 'primaryemail', 'email1', 'bestemail'],
    email2: ['personalemail', 'secondaryemail', 'email2', 'otheremail', 'alternateemail'],
    phone: ['phone', 'phonenumber', 'mobile', 'mobilephone', 'mobilenumber', 'directphone', 'workphone', 'cell', 'telephone', 'phone1'],
    title: ['jobtitle', 'title', 'position', 'role', 'headline', 'currenttitle'],
    company: ['company', 'companyname', 'organization', 'organisation', 'employer', 'currentcompany', 'account', 'accountname'],
    website: ['website', 'companywebsite', 'domain', 'companydomain', 'companyurl', 'web'],
    linkedin: ['linkedin', 'linkedinurl', 'linkedinprofile', 'profileurl', 'linkedinprofileurl', 'profile', 'liurl', 'url'],
    location: ['location', 'city', 'country', 'region', 'address']
  };
  const normHeader = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // headers -> { field: columnIndex }. First match wins; a column is used once.
  function detectMapping(headers) {
    const map = {}; const used = new Set();
    const hs = headers.map(normHeader);
    // exact synonym match, in synonym-priority order
    for (const field of Object.keys(SYNONYMS)) {
      for (const syn of SYNONYMS[field]) {
        const i = hs.findIndex((h, idx) => h === syn && !used.has(idx));
        if (i >= 0) { map[field] = i; used.add(i); break; }
      }
    }
    return map;
  }
  // rows (arrays) + mapping -> array of {field:value}
  function applyMapping(rows, mapping) {
    return rows.map(r => {
      const o = {};
      for (const [f, i] of Object.entries(mapping)) if (i !== '' && i != null && i >= 0) o[f] = clean(r[i], f === 'linkedin' || f === 'website' ? 500 : 300);
      return o;
    });
  }

  /* ---------------- normalisers ---------------- */
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const normEmail = e => { const s = clean(e).toLowerCase(); return EMAIL_RE.test(s) ? s : ''; };
  const normLinkedin = u => {
    const s = clean(u, 500).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    return /linkedin\.com\/(in|pub)\//.test(s) ? s : '';
  };
  const normDomain = w => clean(w, 500).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
  const LEGAL = new Set(['ltd', 'limited', 'plc', 'inc', 'llc', 'co', 'company', 'corp', 'corporation', 'nig', 'ng', 'gmbh', 'sa']);
  function normCompany(c) {
    const toks = clean(c).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    while (toks.length > 1 && LEGAL.has(toks[toks.length - 1])) toks.pop();
    return toks.join(' ');
  }
  const normName = n => clean(n).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------------- sequence state ---------------- */
  const hasText = lead => (lead.emails || []).some(e => e && (e.body || e.subject));
  const draftSteps = () => Array.from({ length: STEPS }, () => ({ status: 'draft' }));
  const sentIdx = steps => steps.reduce((last, s, i) => (s && SENT_STATES.includes(s.status) ? i : last), -1);

  // Returns { kind:'contact'|'legacy', steps, base:Date|null, c } or null when no sequence is running/started.
  function seqState(lead, ci) {
    const contacts = lead.contacts || [];
    const c = contacts[ci];
    if (c && c.seq && c.seq.active) {
      return { kind: 'contact', steps: c.seq.steps, base: c.seq.startedAt ? new Date(c.seq.startedAt) : null, c };
    }
    if (ci === 0 && !(c && c.seq) && Array.isArray(lead.emails) && lead.emails.length &&
        (lead.contactedAt || lead.emails.some(e => e && SENT_STATES.includes(e.status)))) {
      return { kind: 'legacy', steps: lead.emails, base: lead.contactedAt ? new Date(lead.contactedAt) : null, c: c || null };
    }
    return null;
  }

  function stopReason(lead, ci, st) {
    const c = st.c;
    if (lead._deleted) return 'Deleted';
    if (c && c.dnc) return 'Do not contact';
    if (STOP_STAGES.includes(lead.stage)) return 'Stage: ' + lead.stage;
    if (st.steps.some(s => s && s.status === 'replied')) return 'Replied';
    if (c && c.seq && c.seq.stopped) return 'Stopped';
    if (c && c.seq && c.seq.paused) return 'Paused';
    if (sentIdx(st.steps) >= STEPS - 1) return 'Sequence complete';
    return null;
  }

  function nextIdx(steps) { return sentIdx(steps) + 1; }

  // When is the next email due? (Date) — counted from when the previous one was marked Sent.
  function dueDate(st) {
    const idx = nextIdx(st.steps);
    if (idx >= STEPS) return null;
    if (idx === 0) return st.base || null;
    const prev = st.steps[idx - 1];
    if (prev && prev.sentAt) return new Date(new Date(prev.sentAt).getTime() + GAPS[idx] * DAY);
    return st.base ? new Date(st.base.getTime() + EDAYS[idx] * DAY) : null;
  }

  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  // Every running sequence that still has something to send.
  function buildQueue(leads, now) {
    now = now || new Date();
    const sod = startOfDay(now), eod = endOfDay(now);
    const out = [];
    for (const lead of leads) {
      if (!lead || lead._deleted) continue;
      const n = Math.max((lead.contacts || []).length, 1);
      for (let ci = 0; ci < n; ci++) {
        const st = seqState(lead, ci);
        if (!st) continue;
        if (stopReason(lead, ci, st)) continue;
        const idx = nextIdx(st.steps);
        const due = dueDate(st);
        if (!due) continue;
        const when = due < sod ? 'overdue' : due <= eod ? 'today' : 'upcoming';
        out.push({ lead, ci, idx, due, when, kind: st.kind, noEmail: !(st.c && normEmail(st.c.email)) });
      }
    }
    const rank = { overdue: 0, today: 1, upcoming: 2 };
    out.sort((a, b) => rank[a.when] - rank[b.when] || a.due - b.due);
    return out;
  }

  /* ---------------- mutators (operate on a lead object you already own/cloned) ---------------- */
  function newSeq(now, type) {
    return { active: true, startedAt: new Date(now).toISOString(), type: type || null, steps: draftSteps() };
  }
  // Start a sequence for contacts[ci]. Returns 'started' | 'already' | 'no_email' | 'dnc'.
  function startSequence(lead, ci, now, type) {
    now = now || new Date();
    const c = (lead.contacts || [])[ci];
    if (!c) return 'no_email';
    if (c.dnc) return 'dnc';
    if (!normEmail(c.email)) return 'no_email';
    const st = seqState(lead, ci);
    if (st) return 'already';
    if (c.seq && c.seq.active) return 'already';
    // keep AI/script copy already saved on the lead for the primary contact: run it as the legacy sequence
    if (ci === 0 && !c.seq && hasText(lead)) { lead.contactedAt = new Date(now).toISOString(); return 'started'; }
    c.seq = newSeq(now, type);
    return 'started';
  }

  function markSent(lead, ci, idx, now, final) {
    now = now || new Date();
    const st = seqState(lead, ci);
    if (!st) return null;
    const step = st.steps[idx];
    if (!step) return null;
    step.status = 'sent';
    step.sentAt = new Date(now).toISOString();
    if (final) { step.subject = final.subject || step.subject || ''; step.body = final.body || step.body || ''; }
    if (st.kind === 'legacy' && !lead.contactedAt) lead.contactedAt = step.sentAt;
    if (lead.stage === 'New') lead.stage = 'Contacted';
    if (!lead.contactedAt) lead.contactedAt = step.sentAt;
    return { nextDue: dueDate(st), complete: idx >= STEPS - 1 };
  }

  function markReplied(lead, ci, now) {
    now = now || new Date();
    const st = seqState(lead, ci);
    if (!st) return null;
    let i = sentIdx(st.steps);
    if (i < 0) { i = 0; st.steps[0].sentAt = new Date(now).toISOString(); }
    st.steps[i].status = 'replied';
    st.steps[i].repliedAt = new Date(now).toISOString();
    if (st.c && st.c.seq) st.c.seq.stopped = 'replied';
    if (lead.stage === 'New' || lead.stage === 'Contacted') lead.stage = 'Replied';
    return { idx: i };
  }

  function setDnc(lead, ci, flag, now) {
    const c = (lead.contacts || [])[ci];
    if (!c) return false;
    c.dnc = !!flag;
    c.dncAt = flag ? new Date(now || new Date()).toISOString() : null;
    if (flag && c.seq) c.seq.stopped = 'dnc';
    if (!flag && c.seq && c.seq.stopped === 'dnc') c.seq.stopped = null;
    return true;
  }

  function setPaused(lead, ci, flag) {
    const c = (lead.contacts || [])[ci];
    if (!c || !c.seq) return false;
    c.seq.paused = !!flag;
    return true;
  }

  function editStep(lead, ci, idx, text) {
    const st = seqState(lead, ci);
    if (!st || !st.steps[idx]) return false;
    st.steps[idx].subject = clean(text.subject, 300);
    // bodies keep line breaks and may be long; only strip tags/control chars
    st.steps[idx].body = String(text.body == null ? '' : text.body).replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, 8000);
    return true;
  }

  /* ---------------- email text ---------------- */
  function autoType(lead) {
    const s = String((lead && lead.sector) || '').toLowerCase();
    return s.includes('hr') || s.includes('outsourc') ? 'employer' : 'office';
  }
  const firstName = name => { const t = clean(name).split(' ')[0]; return t || 'there'; };
  function fmtLease(n) {
    n = Number(n); if (!n) return '';
    return n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M' : Math.round(n / 1000) + 'K';
  }
  function fill(text, vars) {
    return String(text || '')
      .replace(/\[FNAME\]/g, vars.fname).replace(/\[CONAME\]/g, vars.company)
      .replace(/\[LEASE\]/g, vars.lease || '[LEASE]')
      .replace(/\{first_name\}/g, vars.fname).replace(/\{company\}/g, vars.company);
  }
  // templatesFor(type) -> array of {label,subject,body}
  function renderStep(lead, ci, idx, templatesFor) {
    const c = (lead.contacts || [])[ci] || {};
    const st = seqState(lead, ci);
    const step = (st && st.steps[idx]) || {};
    const type = (c.seq && c.seq.type) || lead.seqType || autoType(lead);
    const tpl = (templatesFor ? templatesFor(type) : [])[idx] || { label: 'Email ' + (idx + 1), subject: '', body: '' };
    let subject = step.subject, body = step.body, source = 'step';
    if (!(subject || body)) { subject = tpl.subject; body = tpl.body; source = 'template'; }
    const vars = { fname: firstName(c.name), company: clean(lead.company) || 'your company', lease: fmtLease(lead.lease) };
    return { label: tpl.label, subject: fill(subject, vars), body: fill(body, vars), source, type };
  }
  function addFooter(body, sender) {
    const name = clean(sender && sender.name), company = clean(sender && sender.company);
    const lower = String(body).toLowerCase();
    const lines = [];
    if (name && !lower.includes(name.toLowerCase())) lines.push(name + (company ? ' | ' + company : ''));
    else if (!name && company && !lower.includes(company.toLowerCase())) lines.push(company);
    lines.push("If this isn't relevant, just reply STOP and I won't email you again.");
    return String(body).replace(/\s+$/, '') + '\n\n--\n' + lines.join('\n');
  }
  const leftoverTokens = text => (String(text).match(/\[[A-Z][A-Z ]{2,}\]/g) || []);

  /* ---------------- links ---------------- */
  const mailto = (to, subject, body) => 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  const gmail = (to, subject, body) => 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  function waNumber(phone) {
    let d = String(phone || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
    d = d.replace(/\D/g, '');
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0') && d.length === 11) return '234' + d.slice(1); // Nigerian local format
    return d;
  }
  const waLink = (phone, text) => { const n = waNumber(phone); return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : ''; };

  /* ---------------- CSV import (match and update) ---------------- */
  function emptyStats() {
    return { rows: 0, newLeads: 0, addedPeople: 0, updatedPeople: 0, unchanged: 0, started: 0, noEmail: 0, blocked: 0, skipped: 0, duplicates: 0 };
  }
  /* rows: array of {field:value}; leads: existing leads (not mutated); opts:
   *   now, uid(), fileName, startSequences, dnc:Set<string>, owner
   * returns { changed:[lead], stats, preview:[{row,action,who,company,note}] } */
  function buildImport(rows, leads, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const nowIso = new Date(now).toISOString();
    const uid = opts.uid || (() => Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const dnc = opts.dnc || new Set();
    const stats = emptyStats();
    const preview = [];
    const work = new Map();                       // id -> working copy (only leads we touch)
    const changedIds = new Set();
    const live = leads.filter(l => l && !l._deleted);
    const getW = l => { if (!work.has(l.id)) work.set(l.id, JSON.parse(JSON.stringify(l))); return work.get(l.id); };

    // indexes over live leads
    const byEmail = new Map(), byLi = new Map(), byNameCo = new Map(), byCo = new Map(), byDomain = new Map();
    const indexContact = (lead, ci) => {
      const c = lead.contacts[ci];
      const e = normEmail(c.email); if (e) byEmail.set(e, [lead.id, ci]);
      const li = normLinkedin(c.linkedin); if (li) byLi.set(li, [lead.id, ci]);
      if (c.name) byNameCo.set(normName(c.name) + '|' + normCompany(lead.company), [lead.id, ci]);
    };
    const indexLead = lead => {
      byCo.set(normCompany(lead.company), lead.id);
      const d = normDomain(lead.website); if (d) byDomain.set(d, lead.id);
      (lead.contacts || []).forEach((_, ci) => indexContact(lead, ci));
    };
    live.forEach(indexLead);
    const byId = id => work.get(id) || live.find(l => l.id === id);

    rows.forEach((raw, n) => {
      stats.rows++;
      const rowNo = n + 2; // header is row 1
      const name = clean(raw.name || [raw.first, raw.last].filter(Boolean).join(' '));
      const email = normEmail(raw.email) || normEmail(raw.email2);
      const email2 = normEmail(raw.email2);
      const person = { name, email, phone: clean(raw.phone, 60), title: clean(raw.title), linkedin: clean(raw.linkedin, 500), company: clean(raw.company), website: normDomain(raw.website), location: clean(raw.location) };
      const li = normLinkedin(person.linkedin);
      const label = name || email || li || '(blank)';

      if (!name && !email && !li) { stats.skipped++; preview.push({ row: rowNo, action: 'skip', who: label, company: person.company, note: 'Empty row' }); return; }
      if (email && dnc.has(email)) { stats.blocked++; preview.push({ row: rowNo, action: 'blocked', who: label, company: person.company, note: 'On your do-not-contact list' }); return; }

      // 1) find the person
      let hit = (email && byEmail.get(email)) || (li && byLi.get(li)) ||
        (name && person.company && byNameCo.get(normName(name) + '|' + normCompany(person.company))) || null;
      if (hit) {
        const lead0 = byId(hit[0]);
        const original = live.find(l => l.id === hit[0]);
        const c0 = lead0.contacts[hit[1]];
        if (c0.dnc) { stats.blocked++; preview.push({ row: rowNo, action: 'blocked', who: label, company: lead0.company, note: 'Marked do-not-contact' }); return; }
        if (c0.src && c0.src.at === nowIso && c0.src.row !== rowNo) stats.duplicates++; // same person twice in this file
        const lead = original ? getW(original) : lead0;   // lead created earlier in this same import lives only in `work`
        const c = lead.contacts[hit[1]];
        let did = false;
        const upd = (k, v) => { if (v && v !== c[k]) { c[k] = v; did = true; } };
        upd('name', name); upd('title', person.title); upd('phone', person.phone); upd('linkedin', person.linkedin);
        if (email && email !== normEmail(c.email)) { c.email = email; did = true; }
        else if (!c.email && email2) { c.email = email2; did = true; }
        if (!lead.website && person.website) { lead.website = person.website; did = true; }
        if (!lead.hq && person.location) { lead.hq = person.location; did = true; }
        c.src = { file: opts.fileName || '', at: nowIso, row: rowNo };
        let note = did ? 'Updated' : 'No changes';
        if (opts.startSequences) {
          const r = startSequence(lead, hit[1], now);
          if (r === 'started') { stats.started++; note += ', sequence started'; did = true; }
        }
        if (!normEmail(c.email)) stats.noEmail++;
        if (did) { stats.updatedPeople++; changedIds.add(lead.id); } else stats.unchanged++;
        indexContact(lead, hit[1]);
        preview.push({ row: rowNo, action: did ? 'update' : 'same', who: label, company: lead.company, note });
        return;
      }

      // 2) person is new: find the company
      if (!person.company && !person.website) { stats.skipped++; preview.push({ row: rowNo, action: 'skip', who: label, company: '', note: 'No company or website' }); return; }
      const coKey = normCompany(person.company);
      let leadId = (coKey && byCo.get(coKey)) || (person.website && byDomain.get(person.website)) || null;
      const contact = { name: name || email || 'Unknown', title: person.title, email, phone: person.phone, linkedin: person.linkedin, dnc: false, src: { file: opts.fileName || '', at: nowIso, row: rowNo } };
      if (!email) stats.noEmail++;
      let lead;
      if (leadId) {
        lead = getW(live.find(l => l.id === leadId) || work.get(leadId));
        lead.contacts = lead.contacts || [];
        lead.contacts.push(contact);
        if (!lead.website && person.website) lead.website = person.website;
        stats.addedPeople++;
        changedIds.add(lead.id);
      } else {
        lead = {
          id: uid(), company: person.company || person.website, sector: '', hq: person.location, size: '', website: person.website,
          value: 0, blocker: '', disbursed: 0, fit: '', source: 'CSV Import', owner: opts.owner || 'Unassigned',
          stage: 'New', createdAt: nowIso, notes: '', contactedAt: null, contacts: [contact],
          emails: Array.from({ length: STEPS }, () => ({ status: 'draft', subject: '', body: '' }))
        };
        work.set(lead.id, lead);
        stats.newLeads++; stats.addedPeople++;
        changedIds.add(lead.id);
      }
      const ci = lead.contacts.length - 1;
      let note = leadId ? 'Added to existing company' : 'New company';
      if (opts.startSequences) {
        const r = startSequence(lead, ci, now);
        if (r === 'started') { stats.started++; note += ', sequence started'; }
        else if (r === 'no_email') note += ', no email yet';
      }
      indexLead(lead);
      preview.push({ row: rowNo, action: leadId ? 'add' : 'new', who: label, company: lead.company, note });
    });

    return { changed: [...changedIds].map(id => work.get(id)), stats, preview };
  }

  /* ---------------- stats for the home screen ---------------- */
  function weekStats(activities, leads, now) {
    now = now || new Date();
    const since = now.getTime() - 7 * DAY;
    let sent = 0, replies = 0;
    (activities || []).forEach(a => {
      if (a.type !== 'email' || !a.ts || new Date(a.ts).getTime() < since) return;
      const d = String(a.desc || '');
      if (/^Reply |marked replied/i.test(d)) replies++;
      else if (/^Sent |marked sent/i.test(d)) sent++;
    });
    const live = (leads || []).filter(l => !l._deleted);
    const repliesToHandle = live.filter(l => l.stage === 'Replied');
    const meetings = live.filter(l => l.stage === 'Meeting Set').length;
    const inSeq = buildQueue(live, now).length;
    return { sent, replies, meetings, inSeq, repliesToHandle };
  }

  return {
    EDAYS, GAPS, STEPS, STOP_STAGES, FIELD_LABELS,
    clean, esc, parseCsv, detectMapping, applyMapping, normEmail, normLinkedin, normDomain, normCompany, normName,
    seqState, stopReason, nextIdx, dueDate, buildQueue, startSequence, markSent, markReplied, setDnc, setPaused, editStep,
    autoType, firstName, fmtLease, renderStep, addFooter, leftoverTokens, mailto, gmail, waNumber, waLink,
    buildImport, weekStats, draftSteps
  };
});
