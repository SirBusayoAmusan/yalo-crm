// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const YO = require('../outreach-core.js');

const D = 86400000;
const T0 = new Date('2026-11-10T09:00:00Z');
const mkLead = (o = {}) => ({
  id: 'L' + Math.random().toString(36).slice(2, 6), company: 'Acme Ltd', sector: '', hq: '', size: '', website: 'acme.com',
  value: 0, stage: 'New', createdAt: T0.toISOString(), notes: '', contactedAt: null,
  contacts: [{ name: 'Jane Doe', title: 'CFO', email: 'jane@acme.com', phone: '', linkedin: '' }],
  emails: Array.from({ length: 7 }, () => ({ status: 'draft', subject: '', body: '' })), ...o
});
const tpl = type => Array.from({ length: 7 }, (_, i) => ({ label: type + ' ' + (i + 1), subject: 'Hi [FNAME] re [CONAME] ' + (i + 1), body: 'Hello [FNAME], rent is [LEASE] at [CONAME]' }));

test('parseCsv: quotes, commas, newlines, BOM, semicolons', () => {
  const rows = YO.parseCsv('﻿Name,Company\r\n"Doe, Jane","Acme ""Big"" Ltd"\r\n\r\nBob,"Multi\nline"\r\n');
  assert.deepEqual(rows, [['Name', 'Company'], ['Doe, Jane', 'Acme "Big" Ltd'], ['Bob', 'Multi\nline']]);
  assert.deepEqual(YO.parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(YO.parseCsv(''), []);
});

test('detectMapping maps common ContactOut-style headers', () => {
  const m = YO.detectMapping(['First Name', 'Last Name', 'Work Email', 'Personal Email', 'Mobile', 'Job Title', 'Company Name', 'Company Domain', 'LinkedIn URL', 'Country']);
  assert.equal(m.first, 0); assert.equal(m.last, 1); assert.equal(m.email, 2); assert.equal(m.email2, 3);
  assert.equal(m.phone, 4); assert.equal(m.title, 5); assert.equal(m.company, 6); assert.equal(m.website, 7);
  assert.equal(m.linkedin, 8); assert.equal(m.location, 9);
});

test('clean strips tags, quotes and control characters', () => {
  assert.equal(YO.clean('<img src=x onerror=alert(1)> "Bob"\u0000'), "img src=x onerror=alert(1) 'Bob'");
  assert.equal(YO.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('import: new company + person, sequence started', () => {
  const r = YO.buildImport([{ first: 'Ada', last: 'Obi', email: 'ADA@Zed.com', company: 'Zed Nigeria Limited', title: 'HR Director', phone: '08012345678' }], [], { now: T0, startSequences: true, fileName: 'a.csv', uid: () => 'N1' });
  assert.equal(r.stats.newLeads, 1); assert.equal(r.stats.started, 1);
  const l = r.changed[0];
  assert.equal(l.id, 'N1'); assert.equal(l.stage, 'New'); assert.equal(l.source, 'CSV Import');
  assert.equal(l.contacts[0].email, 'ada@zed.com'); assert.equal(l.contacts[0].src.file, 'a.csv');
  assert.equal(l.contacts[0].seq.active, true); assert.equal(l.contacts[0].seq.steps.length, 7);
  assert.equal(l.emails.length, 7);
});

test('import: matches by email, then LinkedIn, then name+company; updates instead of duplicating', () => {
  const lead = mkLead({ contacts: [{ name: 'Jane Doe', title: '', email: 'jane@acme.com', phone: '', linkedin: 'https://www.linkedin.com/in/janedoe/' }, { name: 'Bob Ray', title: '', email: '', phone: '', linkedin: '' }] });
  const r = YO.buildImport([
    { name: 'Jane D.', email: 'jane@acme.com', phone: '0801', title: 'CFO' },                      // email match
    { name: 'Jane Doe', linkedin: 'linkedin.com/in/janedoe?utm=1', phone: '0802' },                 // linkedin match
    { name: 'Bob Ray', company: 'ACME', email: 'bob@acme.com' }                                     // name+company match
  ], [lead], { now: T0 });
  assert.equal(r.stats.newLeads, 0); assert.equal(r.stats.addedPeople, 0);
  const l = r.changed[0];
  assert.equal(l.contacts.length, 2);
  assert.equal(l.contacts[0].title, 'CFO'); assert.equal(l.contacts[0].phone, '0802');
  assert.equal(l.contacts[1].email, 'bob@acme.com');
  assert.equal(lead.contacts[1].email, '', 'original lead object must not be mutated');
});

test('import: person added to an existing company (name variants match)', () => {
  const lead = mkLead();
  const r = YO.buildImport([{ name: 'Sam New', email: 'sam@acme.com', company: 'Acme Limited' }], [lead], { now: T0, startSequences: true });
  assert.equal(r.stats.newLeads, 0); assert.equal(r.stats.addedPeople, 1);
  assert.equal(r.changed[0].contacts.length, 2);
  assert.equal(r.changed[0].contacts[1].seq.active, true);
});

test('import: do-not-contact blocks new rows and existing flagged contacts; deleted leads are not matched', () => {
  const lead = mkLead(); lead.contacts[0].dnc = true;
  const gone = mkLead({ company: 'Ghost Co', _deleted: true, contacts: [{ name: 'G', email: 'g@ghost.com' }] });
  const r = YO.buildImport([
    { name: 'Jane Doe', email: 'jane@acme.com' },
    { name: 'No Way', email: 'x@y.com', company: 'Y' },
    { name: 'G', email: 'g@ghost.com', company: 'Ghost Co' }
  ], [lead, gone], { now: T0, dnc: new Set(['x@y.com']), uid: () => 'NEW' });
  assert.equal(r.stats.blocked, 2); assert.equal(r.stats.newLeads, 1);
  assert.equal(r.changed.length, 1); assert.equal(r.changed[0].id, 'NEW');
});

test('import: duplicate rows in one file merge into one person', () => {
  const r = YO.buildImport([
    { name: 'Dup One', email: 'd@dup.com', company: 'Dup Co' },
    { name: 'Dup One', email: 'd@dup.com', company: 'Dup Co', phone: '0803' }
  ], [], { now: T0, uid: (() => { let i = 0; return () => 'U' + ++i; })() });
  assert.equal(r.changed.length, 1); assert.equal(r.changed[0].contacts.length, 1); assert.equal(r.changed[0].contacts[0].phone, '0803');
});

test('import: rows with no company are skipped; empty rows skipped; no-email counted', () => {
  const r = YO.buildImport([{ name: 'Lonely' }, {}, { name: 'NoMail', company: 'Zed' }], [], { now: T0 });
  assert.equal(r.stats.skipped, 2); assert.equal(r.stats.noEmail, 1); assert.equal(r.stats.newLeads, 1);
});

test('startSequence: legacy primary contact with saved AI copy keeps that copy', () => {
  const lead = mkLead(); lead.emails[0] = { status: 'draft', subject: 'Saved subj', body: 'Saved body' };
  assert.equal(YO.startSequence(lead, 0, T0), 'started');
  assert.ok(lead.contactedAt); assert.equal(lead.contacts[0].seq, undefined);
  assert.equal(YO.seqState(lead, 0).kind, 'legacy');
  const rs = YO.renderStep(lead, 0, 0, tpl); assert.equal(rs.source, 'step'); assert.equal(rs.subject, 'Saved subj'); assert.equal(rs.body, 'Saved body');
  assert.equal(YO.startSequence(lead, 0, T0), 'already');
});

test('startSequence: refuses without email or when do-not-contact', () => {
  const a = mkLead(); a.contacts[0].email = '';
  assert.equal(YO.startSequence(a, 0, T0), 'no_email');
  const b = mkLead(); b.contacts[0].dnc = true;
  assert.equal(YO.startSequence(b, 0, T0), 'dnc');
});

test('queue: first email due immediately; next due = gap after SENT, not after start', () => {
  const lead = mkLead(); YO.startSequence(lead, 0, T0);
  let q = YO.buildQueue([lead], T0);
  assert.equal(q.length, 1); assert.equal(q[0].idx, 0); assert.equal(q[0].when, 'today');
  // sent 3 days late
  const sent = new Date(T0.getTime() + 3 * D);
  const res = YO.markSent(lead, 0, 0, sent);
  assert.equal(lead.stage, 'Contacted');
  assert.equal(res.nextDue.getTime(), sent.getTime() + 2 * D);        // gap[1] = 2 days
  assert.equal(YO.buildQueue([lead], new Date(sent.getTime() + 1 * D))[0].when, 'upcoming');
  assert.equal(YO.buildQueue([lead], new Date(sent.getTime() + 2 * D))[0].when, 'today');
  q = YO.buildQueue([lead], new Date(sent.getTime() + 5 * D));
  assert.equal(q[0].idx, 1); assert.equal(q[0].when, 'overdue');
  // gaps follow 0,2,6,13,20,29,44 => 2,4,7,7,9,15
  assert.deepEqual(YO.GAPS, [0, 2, 4, 7, 7, 9, 15]);
});

test('queue: sorted overdue, today, upcoming; includes no-email contacts flagged', () => {
  const a = mkLead({ company: 'A' }); YO.startSequence(a, 0, new Date(T0 - 5 * D));
  const b = mkLead({ company: 'B' }); YO.startSequence(b, 0, T0);
  const c = mkLead({ company: 'C' }); YO.startSequence(c, 0, new Date(T0.getTime() + 3 * D));
  const d = mkLead({ company: 'D', contactedAt: T0.toISOString() }); d.contacts[0].email = '';
  const q = YO.buildQueue([c, b, d, a], T0);
  assert.deepEqual(q.map(x => x.lead.company), ['A', 'B', 'D', 'C']);
  assert.equal(q[2].noEmail, true);
});

test('stop rules: replied, stage, DNC, paused, complete, deleted', () => {
  const mk = () => { const l = mkLead(); YO.startSequence(l, 0, T0); return l; };
  let l = mk(); YO.markSent(l, 0, 0, T0); YO.markReplied(l, 0, T0);
  assert.equal(l.stage, 'Replied'); assert.equal(YO.buildQueue([l], T0).length, 0);
  for (const stage of ['Meeting Set', 'Proposal Sent', 'Closed', 'Lost']) { l = mk(); l.stage = stage; assert.equal(YO.buildQueue([l], T0).length, 0, stage); }
  l = mk(); YO.setDnc(l, 0, true, T0); assert.equal(YO.buildQueue([l], T0).length, 0);
  YO.setDnc(l, 0, false); assert.equal(YO.buildQueue([l], T0).length, 1);
  l = mk(); YO.setPaused(l, 0, true); assert.equal(YO.buildQueue([l], T0).length, 0);
  l = mk(); l._deleted = true; assert.equal(YO.buildQueue([l], T0).length, 0);
  l = mk(); for (let i = 0; i < 7; i++) YO.markSent(l, 0, i, new Date(T0.getTime() + i * 10 * D));
  assert.equal(YO.buildQueue([l], new Date(T0.getTime() + 999 * D)).length, 0);
});

test('stage-based stop applies to every contact at the company', () => {
  const l = mkLead(); l.contacts.push({ name: 'Second Person', email: 's@acme.com' });
  YO.startSequence(l, 0, T0); YO.startSequence(l, 1, T0);
  assert.equal(YO.buildQueue([l], T0).length, 2);
  YO.markSent(l, 0, 0, T0); YO.markReplied(l, 0, T0);
  assert.equal(YO.buildQueue([l], T0).length, 0);
});

test('legacy lead (old model) still shows in queue and is advanced via lead.emails', () => {
  const l = mkLead({ contactedAt: new Date(T0 - 3 * D).toISOString() });
  l.emails[0].status = 'sent'; l.emails[0].sentAt = new Date(T0 - 3 * D).toISOString();
  const q = YO.buildQueue([l], T0);
  assert.equal(q.length, 1); assert.equal(q[0].kind, 'legacy'); assert.equal(q[0].idx, 1); assert.equal(q[0].when, 'overdue');
  YO.markSent(l, 0, 1, T0);
  assert.equal(l.emails[1].status, 'sent');
});

test('legacy lead with no contacts still queues (as no-email) and does not crash', () => {
  const l = mkLead({ contacts: [], contactedAt: new Date(T0 - 1 * D).toISOString() });
  const q = YO.buildQueue([l], T0);
  assert.equal(q.length, 1); assert.equal(q[0].noEmail, true);
});

test('renderStep: merge tokens, auto type, edits override template', () => {
  const l = mkLead({ sector: 'HR & Consulting', lease: 12000000 }); YO.startSequence(l, 0, T0);
  const r = YO.renderStep(l, 0, 0, tpl);
  assert.equal(r.type, 'employer'); assert.equal(r.subject, 'Hi Jane re Acme Ltd 1'); assert.equal(r.body, 'Hello Jane, rent is 12M at Acme Ltd');
  assert.equal(YO.leftoverTokens(r.body).length, 0);
  const l2 = mkLead(); YO.startSequence(l2, 0, T0);
  assert.deepEqual(YO.leftoverTokens(YO.renderStep(l2, 0, 0, tpl).body), ['[LEASE]']);
  YO.editStep(l2, 0, 0, { subject: 'Custom <b>', body: 'My <script>x</script> text' });
  const e = YO.renderStep(l2, 0, 0, tpl);
  assert.equal(e.source, 'step'); assert.ok(!e.body.includes('<')); assert.equal(e.subject, 'Custom b');
});

test('footer: sender line + opt-out, no duplicate signature', () => {
  const f = YO.addFooter('Hi\n\nBusayo Amusan\nYALO', { name: 'Busayo Amusan', company: 'YALO Technologies' });
  assert.ok(f.includes("reply STOP")); assert.equal((f.match(/Busayo Amusan/g) || []).length, 1);
  assert.ok(YO.addFooter('Hi', { name: 'Busayo Amusan', company: 'YALO' }).includes('Busayo Amusan | YALO'));
  assert.ok(YO.addFooter('Hi', {}).includes('reply STOP'));
});

test('links: mailto, gmail, WhatsApp number normalisation', () => {
  assert.equal(YO.mailto('a@b.com', 'S&T', 'x y\nz'), 'mailto:a%40b.com?subject=S%26T&body=x%20y%0Az');
  assert.ok(YO.gmail('a@b.com', 's', 'b').startsWith('https://mail.google.com/mail/?view=cm'));
  assert.equal(YO.waNumber('0801 234 5678'), '2348012345678');
  assert.equal(YO.waNumber('+44 7700 900123'), '447700900123');
  assert.equal(YO.waNumber('0044 7700 900123'), '447700900123');
  assert.equal(YO.waNumber('2348012345678'), '2348012345678');
  assert.equal(YO.waLink('', 'hi'), '');
});

test('fmtLease', () => { assert.equal(YO.fmtLease(12000000), '12M'); assert.equal(YO.fmtLease(2500000), '2.5M'); assert.equal(YO.fmtLease(750000), '750K'); assert.equal(YO.fmtLease(''), ''); });

test('weekStats counts sent/replies from activity log and replies to handle', () => {
  const l1 = mkLead({ stage: 'Replied' }), l2 = mkLead({ stage: 'Meeting Set' });
  const acts = [
    { type: 'email', desc: 'Sent email 1 (X) to Jane', ts: new Date(T0 - D).toISOString() },
    { type: 'email', desc: 'Email 2 (Y) marked sent', ts: new Date(T0 - 2 * D).toISOString() },
    { type: 'email', desc: 'Reply received from Jane (email 1)', ts: new Date(T0 - D).toISOString() },
    { type: 'email', desc: 'Sent email 1 (X) to Old', ts: new Date(T0 - 20 * D).toISOString() }
  ];
  const s = YO.weekStats(acts, [l1, l2], T0);
  assert.equal(s.sent, 2); assert.equal(s.replies, 1); assert.equal(s.meetings, 1); assert.equal(s.repliesToHandle.length, 1);
});

test('index.html script tags carry the same build version as the code (cache-busting)', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('outreach-core.js?v=' + YO.VERSION));
  assert.ok(html.includes('outreach.js?v=' + YO.VERSION));
});
