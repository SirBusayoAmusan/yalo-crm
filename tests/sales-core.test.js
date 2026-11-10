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

/* ===================== template editor, plan, tasks, screens ===================== */
const resetSeq = () => YS.setCustomSequences({});
test('custom sequences: override a built-in, add a new one, reject bad ones, reset', () => {
  resetSeq();
  const base = YS.baseSequence('yalo-lease'); assert.equal(base.steps.length, 7);
  const edited = JSON.parse(JSON.stringify(base)); edited.steps[0].subject = 'My own subject'; edited.name = 'My CFO emails';
  const id2 = YS.newSequenceId('yalo', YS.SEQUENCES); assert.match(id2, /^custom-yalo-/);
  const added = { brand: 'clearpath', name: 'Quick DM', steps: [{ day: 0, channel: 'dm', label: 'Hi', body: 'Hi {first_name}, loved {hook}. Do you capture leads from your videos?' }] };
  const ids = YS.setCustomSequences({ 'yalo-lease': edited, [id2]: added, 'bad id!': added, 'custom-yalo-bad': { brand: 'yalo', name: 'x', steps: [{ day: 0, channel: 'email', label: 'a', subject: '', body: '' }] } });
  assert.deepEqual(ids.sort(), ['yalo-lease', id2].sort());
  assert.equal(YS.SEQUENCES['yalo-lease'].steps[0].subject, 'My own subject'); assert.ok(YS.isEdited('yalo-lease')); assert.ok(YS.isBuiltIn('yalo-lease')); assert.ok(!YS.isBuiltIn(id2));
  assert.equal(YS.SEQUENCES[id2].brand, 'clearpath'); assert.ok(YS.seqIdsForBrand('clearpath').includes(id2));
  assert.equal(YS.SEQUENCES['yalo-staff'].steps.length, 7, 'untouched built-ins stay');
  assert.equal(YS.SEQUENCES['custom-yalo-bad'], undefined);
  const meta = YS.sequenceMeta(mkLead(), { title: 'CFO' }, id2); assert.equal(meta.n, 1);
  YS.setCustomSequences({}); assert.equal(YS.SEQUENCES['yalo-lease'].steps[0].subject, YS.baseSequence('yalo-lease').steps[0].subject); assert.equal(YS.SEQUENCES[id2], undefined);
});

test('sequence sanitising and validation', () => {
  const s = YS.sanitizeSequence({ brand: 'nope', name: '  <b>X</b> ', steps: [{ day: '3', channel: 'fax', label: '', subject: ' Hi ', body: 'a<script>b' }, { day: -4, channel: 'dm', body: 'ok' }] }, 'clearpath');
  assert.equal(s.brand, 'clearpath'); assert.equal(s.name, 'bX/b'); assert.equal(s.steps[0].channel, 'email'); assert.equal(s.steps[0].day, 3); assert.equal(s.steps[0].label, 'Step 1'); assert.ok(!/</.test(s.steps[0].body));
  assert.equal(s.steps[1].day, 0);
  const errs = YS.validateSequence(s); assert.ok(errs.some(e => /comes before/.test(e)), errs.join('|'));
  assert.ok(YS.validateSequence({ steps: [] })[0].match(/at least one step/));
  assert.equal(YS.sanitizeSequence({ steps: Array.from({ length: 30 }, () => ({ day: 1, body: 'x', subject: 's' })) }).steps.length, 12);
});

test('playbook checks: good and bad email, DM and comment', () => {
  const good = { channel: 'email', subject: 'Rent at Acme', body: 'Hi {first_name},\n\nMost businesses pay a year of rent upfront. YALO pays the landlord and you repay monthly.\n\nIs this on your radar?' };
  assert.ok(YS.lintStep(good, 0).every(x => x.ok), JSON.stringify(YS.lintStep(good, 0).filter(x => !x.ok)));
  const bad = { channel: 'email', subject: 'RE: Amazing opportunity!!!', body: 'Hi, we leverage a robust, seamless platform — see https://x.com and https://y.com. Is it good? Want a call? Ready? ' + 'More text. '.repeat(30) };
  const fails = YS.lintStep(bad, 0).filter(x => !x.ok).map(x => x.text).join(' | ');
  for (const re of [/Subject/, /Too long/, /Only one main question|More than two/, /links/i, /long dashes|Replace long/, /machine-written/i, /name/i]) assert.match(fails, re);
  assert.ok(YS.lintStep({ channel: 'dm', body: 'Hi {first_name}, saw {hook}. Do you capture leads? https://x.com' }, 1).some(x => !x.ok && /link/i.test(x.text)));
  assert.ok(YS.lintStep({ channel: 'comment', body: 'Great video, sign up for my offer today' }, 0).some(x => !x.ok && /pitch/i.test(x.text)));
  assert.ok(YS.lintStep({ channel: 'email', subject: 's', body: 'Hi {first_name}, {nonsense} here? ' }, 1).some(x => !x.ok && /\{nonsense\}/.test(x.text)));
});

test('preview renders a step against a sample person and the brand facts', () => {
  const r = YS.renderSample({ channel: 'email', label: 'x', subject: 'Rent at {company}', body: 'Hi {first_name}, {proof} Ask {sender_name}?' }, 'yalo', brands.yalo, { name: 'Busayo' });
  assert.equal(r.subject, 'Rent at Acme Ltd'); assert.match(r.body, /Hi Jane, YALO works with 163 businesses/); assert.match(r.body, /Busayo/);
  const c = YS.renderSample({ channel: 'dm', label: 'x', subject: '', body: 'Loved {hook}' }, 'clearpath', brands.clearpath, {});
  assert.match(c.body, /how he edits in one hour/); assert.equal(c.channel, 'dm');
});

test('what is working: replies per step and per sequence', () => {
  const mk = (type, statuses) => { const l = mkLead(); l.contacts[0].seq = { active: true, type, steps: statuses.map(s => ({ status: s })) }; return l; };
  const st = YS.seqStats([mk('yalo-lease', ['sent', 'sent', 'replied', 'draft']), mk('yalo-lease', ['sent', 'draft', 'draft', 'draft']), mk('clearpath-creator', ['replied'])]);
  assert.equal(st['yalo-lease'].sent, 4); assert.equal(st['yalo-lease'].replied, 1); assert.deepEqual(st['yalo-lease'].steps.map(s => s.sent), [2, 1, 1, 0]); assert.equal(st['yalo-lease'].steps[2].replied, 1);
  assert.equal(st['clearpath-creator'].replied, 1);
  const legacy = mkLead({ contactedAt: T0.toISOString() }); legacy.emails[0].status = 'sent'; assert.equal(YS.seqStats([legacy])['office'].sent, 1);
});

test('daily plan: 30/30/30/10 spacing, safe limits for two mailboxes, warm-up, overrides', () => {
  assert.deepEqual(YS.splitTarget([30, 30, 30, 10], 100), [30, 30, 30, 10]); assert.deepEqual(YS.splitTarget([30, 30, 30, 10], 50), [15, 15, 15, 5]);
  assert.equal(YS.splitTarget([30, 30, 30, 10], 37).reduce((a, b) => a + b, 0), 37);
  const cfg = YS.planConfig({ plan: { mailboxes: ['A@x.com', 'b@y.com', 'junk'] } });
  assert.deepEqual(cfg.mailboxes, ['a@x.com', 'b@y.com']); assert.equal(cfg.target, 100); assert.deepEqual(cfg.split, [30, 30, 30, 10]);
  const noon = new Date(2026, 10, 10, 12, 0), early = new Date(2026, 10, 10, 8, 0), late = new Date(2026, 10, 10, 17, 0);
  const sendQ = n => Array.from({ length: n }, () => ({ when: 'today', noEmail: false }));
  assert.equal(YS.rampCap(cfg, [], noon), 10, 'fresh mailboxes start at 10 a day each');
  const old = [{ type: 'email', desc: 'Sent email 1 (x) to A', ts: new Date(2026, 9, 1).toISOString() }];
  assert.equal(YS.rampCap(cfg, old, noon), 25, 'after five weeks they are at the cap');
  let s = YS.planStatus(cfg, old, sendQ(200), noon);
  assert.equal(s.safe, 50); assert.equal(s.target, 50, 'two mailboxes cap a 100 target at 50'); assert.equal(s.rawTarget, 100); assert.match(s.warnings[0], /only safe for about 50/);
  assert.deepEqual(s.batches.map(b => b.target), [15, 15, 15, 5]); assert.equal(s.current, 1); assert.equal(s.dueNow, 30);
  s = YS.planStatus(Object.assign({}, cfg, { overrideCap: true }), old, sendQ(200), noon);
  assert.equal(s.target, 100); assert.deepEqual(s.batches.map(b => b.target), [30, 30, 30, 10]); assert.equal(s.dueNow, 60); assert.match(s.warnings.join(' '), /Over the safe limit/);
  assert.equal(YS.planStatus(cfg, old, sendQ(200), early).dueNow, 0, 'nothing is due before the first batch'); assert.equal(YS.planStatus(Object.assign({}, cfg, { overrideCap: true }), old, sendQ(200), new Date(2026, 10, 10, 15, 0)).dueNow, 90); assert.equal(YS.planStatus(Object.assign({}, cfg, { overrideCap: true }), old, sendQ(200), late).dueNow, 100);
  const sentToday = Array.from({ length: 20 }, (_, i) => ({ type: 'email', desc: 'Sent email 1 (x) to P' + i, ts: new Date(2026, 10, 10, 9, i).toISOString(), mailbox: i % 2 ? 'b@y.com' : 'a@x.com' }));
  s = YS.planStatus(cfg, old.concat(sentToday), sendQ(10), noon);
  assert.equal(s.sent, 20); assert.equal(s.dueNow, 10, 'released by now minus sent, never more than ready'); assert.deepEqual(s.perMailbox.map(m => m.sent), [10, 10]); assert.match(s.warnings.join(' '), /Only 10 emails are ready/);
  assert.equal(YS.sentOn([{ type: 'email', desc: 'Sent DM 2 (x)', ts: noon.toISOString() }], noon).length, 0, 'only emails count toward the daily plan');
  assert.equal(YS.planStatus(YS.planConfig({ plan: { mailboxes: [] } }), [], [], noon).warnings.some(w => /Add your sending mailboxes/.test(w)), true);
  const full = YS.planStatus(cfg, old.concat(Array.from({ length: 50 }, (_, i) => ({ type: 'email', desc: 'Sent email 1 (x) to P', ts: new Date(2026, 10, 10, 9, 1).toISOString(), mailbox: i % 2 ? 'b@y.com' : 'a@x.com' }))), sendQ(10), late);
  assert.ok(full.done); assert.match(full.warnings.join(' '), /reached its limit/);
});

test('each person keeps one mailbox: picker balances and remembers', () => {
  const l = mkLead(); l.contacts[0].seq = { active: true, steps: [], mailbox: 'a@x.com' };
  const pick = YS.mailboxPicker(['a@x.com', 'b@y.com'], [l]); assert.deepEqual([pick(), pick(), pick(), pick()], ['b@y.com', 'a@x.com', 'b@y.com', 'a@x.com']);
  assert.equal(YS.mailboxPicker([], [])(), null);
  const lead = mkLead(); const meta = Object.assign(YS.sequenceMeta(lead, lead.contacts[0]), { mailbox: 'b@y.com' });
  YO.startSequence(lead, 0, T0, meta.type, meta); assert.equal(lead.contacts[0].seq.mailbox, 'b@y.com');
  assert.match(YO.gmail('t@x.com', 's', 'b', 'a@x.com'), /authuser=a%40x\.com&to=t%40x\.com/); assert.ok(!/authuser/.test(YO.gmail('t@x.com', 's', 'b')));
});

test('tasks: overdue, today, upcoming, done; brand filter; icons', () => {
  const y = mkLead({ id: 'Y', brand: 'yalo' }), c = mkLead({ id: 'C', brand: 'clearpath' });
  const now = new Date(2026, 10, 10, 12, 0), d = (days, h = 10) => new Date(2026, 10, 10 + days, h, 0).toISOString();
  const tasks = [{ id: 1, leadId: 'Y', when: d(-2), note: 'Call Jane' }, { id: 2, leadId: 'Y', when: d(0, 16), note: 'Send info' }, { id: 3, leadId: 'C', when: d(1), note: 'x' }, { id: 4, leadId: 'Y', when: d(-1), note: 'old', done: true }, { id: 5, leadId: 'Y', when: d(0, 8), note: 'earlier today' }];
  const b = YS.taskBuckets(tasks, { Y: y, C: c }, now, 'all');
  assert.deepEqual(b.overdue.map(t => t.id), [1]); assert.deepEqual(b.today.map(t => t.id), [5, 2]); assert.deepEqual(b.upcoming.map(t => t.id), [3]); assert.deepEqual(b.done.map(t => t.id), [4]);
  assert.deepEqual(YS.taskBuckets(tasks, { Y: y, C: c }, now, 'clearpath').upcoming.map(t => t.id), [3]); assert.equal(YS.taskBuckets(tasks, { Y: y, C: c }, now, 'clearpath').overdue.length, 0);
  assert.equal(YS.taskIcon('Call Jane'), '📞'); assert.equal(YS.taskIcon('Send info'), '✉️'); assert.equal(YS.taskIcon('Confirm meeting'), '📅'); assert.equal(YS.taskIcon('Other'), '✅');
});

test('which screens are shown: unnecessary ones hidden, key-based ones follow the key', () => {
  assert.deepEqual(YS.hiddenScreens({}).sort(), ['generator', 'reminders', 'scan', 'scripts', 'warplan']);
  assert.deepEqual(YS.hiddenScreens({ apiKey: 'sk-x' }).sort(), ['reminders', 'scripts', 'warplan']);
  assert.deepEqual(YS.hiddenScreens({ hiddenScreens: ['trash', 'bogus'] }), ['trash']); assert.deepEqual(YS.hiddenScreens({ hiddenScreens: [] }), []);
});

test('replies: email reply outcomes wording, out of office, call-only outcomes', () => {
  const l = mkLead({ stage: 'Contacted' }); YO.startSequence(l, 0, T0, 'yalo-lease', YS.sequenceMeta(l, l.contacts[0]));
  const r = YS.applyOutcome(l, 0, 'ooo', T0, { via: 'email' });
  assert.match(r.activity, /^Reply from Jane Doe: out of office/); assert.equal(new Date(r.tasks[0].when) - T0, 7 * D);
  assert.match(YS.applyOutcome(mkLead(), 0, 'interested', T0).activity, /^Call with/);
  assert.ok(YS.OUTCOMES.filter(o => !o.callOnly).every(o => o.id !== 'no_answer' && o.id !== 'voicemail')); assert.ok(YS.OUTCOMES.find(o => o.id === 'ooo').replyOnly);
});

test('AI: template improvement prompt keeps placeholders and facts', () => {
  const p = YS.promptFor('template', { brand: brands.yalo, channel: 'email', audience: 'CFOs', label: 'Step 1', subject: 'Rent', draft: 'Hi {first_name}, {proof}' });
  assert.match(p.system, /Keep every placeholder in curly braces/); assert.match(p.system, /WHY:/); assert.match(p.user, /Hi \{first_name\}/);
});

test('sequences contain no undefined values (the database refuses them)', () => {
  const walk = (o, p) => { if (o === undefined) throw new Error('undefined at ' + p); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p + '.' + k); };
  walk(YS.sanitizeSequence({ brand: 'yalo', name: 'x', steps: [{ day: 0, channel: 'email', label: 'a', subject: 's', body: 'b' }] }), 'seq');
  walk(YS.sanitizeSequence(YS.baseSequence('yalo-lease')), 'dup');
  walk(YS.planConfig({ plan: { mailboxes: ['a@x.com'] } }), 'plan');
});
