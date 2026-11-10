// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const YO = require('../outreach-core.js');
const YS = require('../sales-core.js');
const D = 86400000, T0 = new Date('2026-11-10T09:00:00Z');

const mkLead = (o = {}) => ({ id: 'L' + Math.random().toString(36).slice(2, 6), company: 'Acme Ltd', brand: 'yalo', sector: '', stage: 'New', createdAt: T0.toISOString(), notes: '', contactedAt: null, value: 0,
  contacts: [{ name: 'Jane Doe', title: 'CFO', email: 'jane@acme.com', phone: '0801' }], emails: Array.from({ length: 7 }, () => ({ status: 'draft', subject: '', body: '' })), ...o });
const brands = YS.mergeBrands({});
const ctxFor = (b, extra) => ({ brand: brands[b], sender: { name: 'Busayo Amusan', title: 'Partnerships', company: brands[b].name }, ...extra });
const tf = type => YS.templatesFor(type);

test('brands: defaults, overrides, brandOf, filter', () => {
  assert.deepEqual(Object.keys(brands), ['yalo', 'clearpath']);
  assert.ok(brands.yalo.proof.length === 2); assert.deepEqual(brands.clearpath.proof, []);
  const m = YS.mergeBrands({ yalo: { price: 'N1', proof: 'Only one' }, ghost: { x: 1 } });
  assert.equal(m.yalo.price, 'N1'); assert.deepEqual(m.yalo.proof, ['Only one']); assert.equal(m.ghost, undefined);
  assert.equal(YS.brandOf({}), 'yalo'); assert.equal(YS.brandOf({ brand: 'clearpath' }), 'clearpath'); assert.equal(YS.brandOf({ brand: 'weird' }), 'yalo');
  const ls = [mkLead(), mkLead({ brand: 'clearpath' }), mkLead({ brand: undefined })];
  assert.equal(YS.filterByBrand(ls, 'yalo').length, 2); assert.equal(YS.filterByBrand(ls, 'clearpath').length, 1); assert.equal(YS.filterByBrand(ls, 'all').length, 3);
  assert.deepEqual(YS.missingFacts(brands.clearpath).sort(), ['price', 'proof'].sort());
});

test('sequences: shape, spacing and channels', () => {
  const y = YS.SEQUENCES['yalo-lease'], s = YS.SEQUENCES['yalo-staff'], c = YS.SEQUENCES['clearpath-creator'];
  assert.equal(y.steps.length, 7); assert.deepEqual(YS.gapsOf(y.steps), [0, 2, 4, 7, 7, 9, 15]);   // the CRM cadence 0,2,6,13,20,29,44
  assert.deepEqual(YS.gapsOf(s.steps), [0, 2, 4, 7, 7, 9, 15]);
  assert.equal(c.steps.length, 6); assert.deepEqual(c.steps.map(x => x.channel), ['comment', 'dm', 'email', 'dm', 'email', 'dm']);
  assert.deepEqual(YS.seqIdsForBrand('yalo').sort(), ['yalo-lease', 'yalo-staff']);
  assert.ok(y.steps.every(x => x.channel === 'email'));
});

test('sequences obey the playbook rules: no em dashes, no links, short, no AI slop, no stray tokens', () => {
  const allowed = new Set(['first_name', 'company', 'title', 'sender_name', 'sender_title', 'sender_company', 'proof', 'proof2', 'hook', 'lease_phrase', 'marketplace', 'offer', 'brand']);
  for (const [id, seq] of Object.entries(YS.SEQUENCES)) {
    seq.steps.forEach((st, i) => {
      const where = `${id} step ${i + 1}`, text = (st.subject || '') + '\n' + st.body;
      assert.ok(!/[—–]/.test(text), where + ': dash');
      assert.ok(!/https?:\/\/|www\./i.test(text), where + ': link');
      assert.ok(!/\bRe:/i.test(st.subject || ''), where + ': fake Re:');
      const h = YS.humanize(text); assert.equal(h.text, text.trim(), where + ': contains words the human filter would change');
      (text.match(/\{([a-z_0-9]+)\}/g) || []).forEach(t => assert.ok(allowed.has(t.slice(1, -1)), where + ': unknown token ' + t));
      if (st.channel === 'email') { const sentences = st.body.split(/(?<=[.?!])\s+/).filter(Boolean).length; assert.ok(sentences <= 9 && st.body.length < 700, where + ': too long'); assert.ok(st.subject.length > 0, where + ': needs a subject'); }
      if (st.channel === 'dm') assert.ok(st.body.length < 480, where + ': DM too long');
      if (st.channel !== 'comment') assert.ok(/[?]|reply|say so|okay if|what does your availability/i.test(st.body), where + ': no ask');
    });
  }
});

test('rendering: a filled brand profile leaves no placeholders (YALO), Clearpath needs the hook', () => {
  for (const type of ['yalo-lease', 'yalo-staff']) {
    const lead = mkLead(); YO.startSequence(lead, 0, T0, type, YS.sequenceMeta(lead, lead.contacts[0], type));
    for (let i = 0; i < 7; i++) {
      const r = YO.renderStep(lead, 0, i, tf, ctxFor('yalo'));
      assert.deepEqual(YO.leftoverTokens(r.subject + ' ' + r.body), [], `${type} step ${i + 1}`);
      assert.ok(r.body.includes('Jane'), `${type} personalised ${i + 1}`);
    }
  }
  const lead = mkLead({ brand: 'clearpath', company: 'Tech Tom', contacts: [{ name: 'Tom Ray', title: 'creator', email: 'tom@x.com' }] });
  YO.startSequence(lead, 0, T0, 'clearpath-creator', YS.sequenceMeta(lead, lead.contacts[0]));
  let r = YO.renderStep(lead, 0, 1, tf, ctxFor('clearpath'));
  assert.deepEqual(YO.leftoverTokens(r.body), ['[HOOK]'], 'hook must be supplied before a DM is sent');
  assert.equal(r.channel, 'dm');
  lead.hook = 'how I got my first 1,000 subs';
  r = YO.renderStep(lead, 0, 1, tf, ctxFor('clearpath'));
  assert.deepEqual(YO.leftoverTokens(r.body), []); assert.ok(r.body.includes('how I got my first 1,000 subs'));
  r = YO.renderStep(lead, 0, 2, tf, ctxFor('clearpath'));
  assert.ok(r.body.includes('Busayo Amusan') && r.body.includes('Clearpath QR') && r.body.includes('QR code on screen'));
  assert.equal(r.channel, 'email');
});

test('lease phrase: uses the number when known, a plain phrase when not', () => {
  const lead = mkLead(); YO.startSequence(lead, 0, T0, 'yalo-lease', YS.sequenceMeta(lead, lead.contacts[0]));
  assert.ok(YO.renderStep(lead, 0, 1, tf, ctxFor('yalo')).body.includes('pays a large sum in rent'));
  lead.lease = 12000000;
  assert.ok(YO.renderStep(lead, 0, 1, tf, ctxFor('yalo')).body.includes('pays about N12M in rent'));
});

test('proof only comes from the profile; an empty profile leaves a visible token', () => {
  const lead = mkLead(); YO.startSequence(lead, 0, T0, 'yalo-lease', YS.sequenceMeta(lead, lead.contacts[0]));
  const empty = Object.assign({}, brands.yalo, { proof: [] });
  const r = YO.renderStep(lead, 0, 5, tf, { brand: empty, sender: {} });
  assert.ok(YO.leftoverTokens(r.body).includes('[PROOF]'));
});

test('auto sequence by job title and brand', () => {
  const L = t => ({ lead: mkLead(), c: { title: t } });
  const pick = (t, b) => YS.autoSeqType(Object.assign(mkLead(), { brand: b || 'yalo' }), { title: t });
  assert.equal(pick('Chief Financial Officer'), 'yalo-lease'); assert.equal(pick('Founder & CEO'), 'yalo-lease'); assert.equal(pick('Managing Director'), 'yalo-lease');
  assert.equal(pick('HR Director'), 'yalo-staff'); assert.equal(pick('Head of People'), 'yalo-staff'); assert.equal(pick('COO'), 'yalo-staff');
  assert.equal(pick(''), 'yalo-lease'); assert.equal(pick('anything', 'clearpath'), 'clearpath-creator');
});

test('custom sequence length and gaps drive the queue (6-step creator sequence)', () => {
  const lead = mkLead({ brand: 'clearpath' }); const meta = YS.sequenceMeta(lead, lead.contacts[0]);
  assert.equal(YO.startSequence(lead, 0, T0, meta.type, meta), 'started');
  const seq = lead.contacts[0].seq; assert.equal(seq.steps.length, 6); assert.deepEqual(seq.gaps, [0, 2, 3, 4, 5, 10]);
  YO.markSent(lead, 0, 0, T0);
  assert.equal(YO.dueDate(YO.seqState(lead, 0)).getTime(), T0.getTime() + 2 * D);
  YO.markSent(lead, 0, 1, new Date(T0.getTime() + 2 * D));
  assert.equal(YO.dueDate(YO.seqState(lead, 0)).getTime(), T0.getTime() + 5 * D);
  for (let i = 2; i < 6; i++) YO.markSent(lead, 0, i, new Date(T0.getTime() + (i + 3) * D));
  assert.equal(YO.buildQueue([lead], new Date(T0.getTime() + 99 * D)).length, 0, 'sequence ends after its own last step');
});

test('import starts the right sequence per brand and title, stamps the brand and keeps the social link', () => {
  const rows = [{ name: 'Ada Obi', email: 'ada@zed.com', company: 'Zed Ltd', title: 'CFO' }, { name: 'Bayo Ade', email: 'bayo@zed.com', company: 'Zed Ltd', title: 'HR Director' }];
  const r = YO.buildImport(rows, [], { now: T0, startSequences: true, brand: 'yalo', sequenceMeta: (l, ci) => YS.sequenceMeta(l, l.contacts[ci]) });
  const l = r.changed[0]; assert.equal(l.brand, 'yalo');
  assert.equal(l.contacts[0].seq.type, 'yalo-lease'); assert.equal(l.contacts[1].seq.type, 'yalo-staff');
  const r2 = YO.buildImport([{ name: 'Tom', email: 't@x.com', company: 'Tom Tech', social: 'https://youtube.com/@tom' }], [], { now: T0, startSequences: true, brand: 'clearpath', sequenceMeta: (l2, ci) => YS.sequenceMeta(l2, l2.contacts[ci]) });
  assert.equal(r2.changed[0].brand, 'clearpath'); assert.equal(r2.changed[0].contacts[0].seq.type, 'clearpath-creator'); assert.equal(r2.changed[0].contacts[0].social, 'https://youtube.com/@tom');
  assert.equal(YO.detectMapping(['Name', 'Email', 'Company', 'YouTube URL']).social, 3);
});

test('objection library: every entry answers for both brands, no dashes, DNC for removals', () => {
  for (const o of YS.OBJECTIONS) {
    for (const b of ['yalo', 'clearpath']) {
      if (!o.reply[b] && !o.reply.default) continue;
      const txt = YS.objectionReply(o, b, brands[b]);
      assert.ok(txt.length > 20, o.id + ' ' + b); assert.ok(!/[—–]/.test(txt), o.id + ' dash'); assert.ok(!/\{[a-z]+\}/.test(txt), o.id + ' unresolved');
      assert.equal(YS.humanize(txt).text, txt, o.id + ' slop');
    }
    assert.ok(o.means.length > 20);
  }
  assert.ok(YS.OBJECTIONS.find(o => o.id === 'remove').dnc);
  assert.ok(YS.objectionsFor('clearpath').every(o => o.reply.clearpath || o.reply.default));
  assert.ok(!YS.objectionsFor('clearpath').some(o => o.id === 'staff-uptake'));
  assert.ok(YS.objectionsFor('yalo', 'rejection').length >= 4);
  assert.ok(YS.objectionReply(YS.OBJECTIONS.find(o => o.id === 'trust'), 'yalo', brands.yalo).includes('163 businesses'));
  const noGuarantee = YS.objectionReply(YS.OBJECTIONS.find(o => o.id === 'guarantee'), 'yalo', brands.yalo);
  assert.ok(/straight about what we can and cannot promise/.test(noGuarantee), 'never invents a guarantee');
});

test('call outcomes: stage rules, tasks, pause, dnc, meeting reminders', () => {
  const mk = () => { const l = mkLead({ stage: 'Contacted' }); YO.startSequence(l, 0, T0, 'yalo-lease', YS.sequenceMeta(l, l.contacts[0])); return l; };
  let l = mk(); let r = YS.applyOutcome(l, 0, 'interested', T0);
  assert.equal(l.stage, 'Replied'); assert.equal(r.tasks.length, 1); assert.equal(new Date(r.tasks[0].when) - T0, D); assert.match(r.tasks[0].note, /Jane Doe/);
  l = mk(); l.stage = 'Meeting Set'; YS.applyOutcome(l, 0, 'interested', T0); assert.equal(l.stage, 'Meeting Set', 'never move a deal backwards');
  l = mk(); const at = new Date(T0.getTime() + 3 * D);
  r = YS.applyOutcome(l, 0, 'meeting', T0, { meetingAt: at }); assert.equal(l.stage, 'Meeting Set');
  assert.deepEqual(r.tasks.map(t => new Date(at) - new Date(t.when)), [24 * 3600000, 3600000]);
  r = YS.applyOutcome(mk(), 0, 'meeting', T0); assert.equal(r.tasks.length, 0, 'no date, no meeting reminders');
  l = mk(); r = YS.applyOutcome(l, 0, 'not_now', T0); assert.ok(r.paused && l.contacts[0].seq.paused); assert.equal(new Date(r.tasks[0].when) - T0, 90 * D);
  l = mk(); r = YS.applyOutcome(l, 0, 'not_interested', T0); assert.equal(l.stage, 'Lost'); assert.equal(l.lossReason, 'Not interested'); assert.equal(YO.buildQueue([l], T0).length, 0);
  l = mk(); r = YS.applyOutcome(l, 0, 'dnc', T0); assert.ok(r.dnc && l.contacts[0].dnc && l.stage === 'Lost');
  l = mk(); r = YS.applyOutcome(l, 0, 'no_answer', T0); assert.equal(l.stage, 'Contacted'); assert.equal(new Date(r.tasks[0].when) - T0, D);
  r = YS.applyOutcome(mk(), 0, 'send_info', T0); assert.equal(r.tasks.length, 2);
  assert.equal(YS.applyOutcome(mk(), 0, 'nope', T0), null);
  const o = YS.OBJECTIONS.find(x => x.id === 'info'); const t = YS.taskForObjection(o, mk(), 0, T0); assert.equal(new Date(t.when) - T0, 2 * 3600000); assert.equal(YS.taskForObjection(YS.OBJECTIONS.find(x => x.id === 'remove'), mk(), 0, T0), null);
});

test('do this next: ranks replies, overdue and quiet deals; skips closed, lost and do-not-contact', () => {
  const replied = mkLead({ company: 'Replied Co', stage: 'Replied', value: 5e6 });
  const overdue = mkLead({ company: 'Overdue Co', stage: 'Contacted' }); YO.startSequence(overdue, 0, new Date(T0 - 6 * D)); 
  const quiet = mkLead({ company: 'Quiet Co', stage: 'Meeting Set', contactedAt: new Date(T0 - 12 * D).toISOString(), value: 8e6 });
  const fresh = mkLead({ company: 'Fresh Co', stage: 'New', contacts: [{ name: 'X', title: 'Intern', email: '' }] });
  const closed = mkLead({ stage: 'Closed' }), lost = mkLead({ stage: 'Lost' }), dnc = mkLead({ company: 'DNC Co', stage: 'Contacted' }); dnc.contacts[0].dnc = true;
  const out = YS.nextActions([fresh, quiet, overdue, closed, replied, lost, dnc], { now: T0, activities: [] }, 5);
  assert.deepEqual(out.map(x => x.lead.company).slice(0, 2).sort(), ['Quiet Co', 'Replied Co'].sort());
  assert.ok(!out.some(x => ['DNC Co'].includes(x.lead.company)) && out.length === 4);
  const rep = out.find(x => x.lead.company === 'Replied Co'); assert.equal(rep.action, 'reply'); assert.ok(rep.reasons.some(r => /Replied/.test(r)));
  const od = out.find(x => x.lead.company === 'Overdue Co'); assert.ok(od.reasons.some(r => /overdue/.test(r)));
  assert.ok(out.find(x => x.lead.company === 'Quiet Co').reasons.some(r => /No contact for 12 days/.test(r)));
  assert.equal(YS.nextActions([replied, quiet, overdue, fresh], { now: T0 }, 2).length, 2);
});

test('forecast: weighted pipeline, win rate, average deal, stuck deals', () => {
  const mk = (stage, value, extra) => mkLead({ stage, value, ...extra });
  const leads = [mk('New', 1e6), mk('Replied', 4e6), mk('Meeting Set', 10e6), mk('Proposal Sent', 10e6), mk('Closed', 6e6), mk('Closed', 2e6), mk('Lost', 9e6),
    mk('Contacted', 3e6, { contactedAt: new Date(T0 - 20 * D).toISOString() })];
  const f = YS.forecast(leads, [], T0);
  assert.equal(f.weighted, 1e6 * .05 + 4e6 * .25 + 10e6 * .5 + 10e6 * .7 + 3e6 * .1);
  assert.equal(f.openCount, 5); assert.equal(f.closedValue, 8e6); assert.equal(f.avgDeal, 4e6); assert.equal(f.winRate, 2 / 3);
  assert.equal(f.byStage['Meeting Set'].weighted, 5e6); assert.equal(f.stuck.length, 1); assert.equal(f.stuck[0].lead.stage, 'Contacted');
  assert.equal(YS.forecast([], [], T0).winRate, null);
  assert.equal(YS.forecast(leads, [], T0, { 'Meeting Set': 1 }).byStage['Meeting Set'].weighted, 10e6);
  const closed = mkLead({ stage: 'Closed', value: 1, createdAt: new Date(T0 - 30 * D).toISOString() });
  const f2 = YS.forecast([closed], [{ leadId: closed.id, type: 'status', desc: 'Stage: Proposal Sent -> Closed', ts: T0.toISOString() }], T0);
  assert.equal(f2.avgDaysToClose, 30);
});

test('human filter: dashes, stock words, invisible characters, URLs and emails untouched, structural flags', () => {
  const dirty = 'We will delve into this — a robust, seamless way to leverage it.​ See https://example.com/a—b and a@b.com. It’s not just a tool, it’s a movement.';
  const h = YS.humanize(dirty);
  assert.ok(!/[—​]/.test(h.text.replace('a—b', ''))); assert.ok(h.text.includes('https://example.com/a—b')); assert.ok(h.text.includes('a@b.com'));
  assert.ok(!/delve|robust|seamless|leverage/i.test(h.text)); assert.ok(h.changed);
  assert.ok(h.flags.some(f => f.id === 'not-just'), 'structural tell is flagged, not rewritten');
  assert.equal(YS.humanize('Plain and simple.').changed, false);
  assert.equal(YS.humanize('Leverage this.').text, 'Use this.');
  assert.equal(YS.cleanAi('```\n"Hello there"\n```').text, 'Hello there');
});

test('AI prompts carry the brand facts and the rules, and never invent a price', () => {
  const lead = mkLead({ notes: 'Met at expo', hook: 'their new Lagos office' });
  const p = YS.promptFor('personalise', { brand: brands.yalo, lead, contact: lead.contacts[0], sender: { name: 'Busayo', title: 'Partnerships' }, draft: 'Hi Jane, rent.', channel: 'email' });
  assert.match(p.system, /Use ONLY the facts supplied/); assert.match(p.system, /163 businesses/); assert.match(p.system, /Price: not stated\. Never quote a price/); assert.match(p.system, /Subject:/);
  assert.match(p.user, /Jane Doe, CFO/); assert.match(p.user, /their new Lagos office/); assert.match(p.user, /Hi Jane, rent\./);
  const dm = YS.promptFor('personalise', { brand: brands.clearpath, lead: mkLead({ brand: 'clearpath' }), contact: {}, sender: {}, draft: 'x', channel: 'dm' });
  assert.match(dm.system, /2 to 4 sentences, no link/); assert.match(dm.system, /Proof: none supplied/);
  const o = YS.promptFor('objection', { brand: brands.yalo, lead, contact: lead.contacts[0], objection: 'too expensive', standard: 'std' });
  assert.match(o.system, /Acknowledge/); assert.match(o.system, /SPOKEN:/); assert.match(o.user, /too expensive/);
  assert.match(YS.promptFor('callprep', { brand: brands.yalo, lead, contact: lead.contacts[0] }).system, /FIVE DISCOVERY QUESTIONS/);
  assert.match(YS.promptFor('offer', { brand: brands.yalo, avatar: 'CFO', pain: 'cash', product: 'x', limits: 'y' }).system, /VALUE EQUATION SCORES/);
  const priced = Object.assign({}, brands.yalo, { price: 'From N50k a month' });
  assert.match(YS.promptFor('script', { brand: priced, lead, contact: {} }).system, /Price: From N50k a month/);
});

test('Groq client: request shape, error messages, model list filter', async () => {
  let seen; const ok = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Hello' } }] }) }; };
  const t = await YS.groqChat({ key: 'gsk_x', model: 'm1', system: 's', user: 'u', temperature: 0.4, max_tokens: 50 }, ok);
  assert.equal(t, 'Hello'); assert.equal(seen.url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal(seen.init.headers.Authorization, 'Bearer gsk_x');
  const body = JSON.parse(seen.init.body); assert.equal(body.model, 'm1'); assert.equal(body.messages[0].role, 'system'); assert.equal(body.max_tokens, 50);
  const bad = s => async () => ({ ok: false, status: s, json: async () => ({ error: { message: 'nope' } }) });
  await assert.rejects(YS.groqChat({ key: 'k' }, bad(401)), /did not accept the key/); await assert.rejects(YS.groqChat({ key: 'k' }, bad(429)), /rate limiting/);
  await assert.rejects(YS.groqChat({ key: 'k' }, bad(400)), /Groq: nope/); await assert.rejects(YS.groqChat({ key: 'k' }, bad(500)), /Groq error 500/);
  await assert.rejects(YS.groqChat({ key: 'k' }, async () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) })), /returned nothing/);
  const ms = await YS.groqModels('k', async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }, { id: 'meta-llama/llama-guard-4-12b' }, { id: 'openai/gpt-oss-120b' }] }) }));
  assert.deepEqual(ms, ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
});

test('structural tell checks do not misfire: no template step is flagged, real tells are', () => {
  for (const [id, seq] of Object.entries(YS.SEQUENCES)) seq.steps.forEach((st, i) => {
    const f = YS.humanize((st.subject ? st.subject + '\n' : '') + st.body).flags;
    assert.deepEqual(f.map(x => x.id), [], `${id} step ${i + 1} is flagged: ${f.map(x => x.name).join('; ')}`);
  });
  assert.deepEqual(YS.humanize('Hi Ife,\n\nThe rent is due in March. Worth a chat?').flags, []);
  assert.ok(YS.humanize('BUY NOW TODAY please').flags.some(f => f.id === 'caps-shout'));
  assert.ok(YS.humanize('We help in three ways. Fast, cheap, and good.').flags.some(f => f.id === 'triad'));
  assert.ok(YS.humanize('Great idea \u{1F680}').flags.some(f => f.id === 'rocket'));
});
