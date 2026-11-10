const test = require('node:test'); const assert = require('node:assert/strict');
const WN = require('../wins-core.js');
const NOW = new Date(2026, 10, 12, 15, 0, 0); // Thu 12 Nov 2026, 15:00 local
const at = (d, h) => new Date(2026, 10, d, h || 10).toISOString();
const lead = (id, o) => Object.assign({ id, company: 'Co ' + id, brand: 'yalo', stage: 'Contacted', value: 0, contacts: [{ name: 'P ' + id, title: 'CFO' }], createdAt: at(1) }, o);
const sent = (leadId, d, h) => ({ leadId, type: 'email', desc: 'Sent email 1 (Intro) to X', ts: at(d, h) });
const stage = (leadId, to, d, h) => ({ leadId, type: 'status', desc: 'Stage: Contacted -> ' + to, ts: at(d, h) });

test('commission is 1% of each YALO deal in the month it closed', () => {
  const leads = [lead('a', { stage: 'Closed', value: 8000000 }), lead('b', { stage: 'Closed', value: 2000000 }), lead('c', { brand: 'clearpath', stage: 'Closed', value: 5000000 })];
  const acts = [stage('a', 'Closed', 5), stage('b', 'Closed', 10), stage('c', 'Closed', 11)];
  const r = WN.review(leads, acts, {}, { kind: 'month', now: NOW });
  assert.equal(r.commission, 100000, 'only YALO deals pay the 1%');
  assert.equal(r.yaloDeals, 2); assert.equal(r.deals, 3); assert.equal(r.closedValue, 15000000);
  assert.equal(r.total, 100000);
});
test('rate and base fee are settings', () => {
  const leads = [lead('a', { stage: 'Closed', value: 10000000 })]; const acts = [stage('a', 'Closed', 5)];
  const r = WN.review(leads, acts, { wins: { rate: 2.5, base: 50000 } }, { kind: 'month', now: NOW });
  assert.equal(r.commission, 250000); assert.equal(r.total, 300000);
  assert.equal(WN.optsOf({ wins: { rate: 'x', base: -5 } }).rate, 0); assert.equal(WN.optsOf({}).rate, 1);
});
test('a deal that is no longer Closed earns nothing; reopened deals count once at the last close', () => {
  const leads = [lead('a', { stage: 'Lost', value: 9e6 }), lead('b', { stage: 'Closed', value: 4e6 })];
  const acts = [stage('a', 'Closed', 3), stage('a', 'Lost', 4), stage('b', 'Closed', 2), stage('b', 'Closed', 9)];
  const r = WN.review(leads, acts, {}, { kind: 'month', now: NOW });
  assert.equal(r.yaloDeals, 1); assert.equal(r.commission, 40000);
});
test('first-deal, partner, first creator and commission milestones carry their date and company', () => {
  const leads = [lead('a', { company: 'Prime Estates', sector: 'Real estate', stage: 'Closed', value: 20e6 }), lead('v', { brand: 'clearpath', company: 'Tech Tom', stage: 'Closed' }), lead('w', { brand: 'clearpath', company: 'Vlog Val', stage: 'Replied' })];
  const acts = [stage('a', 'Closed', 6, 9), stage('v', 'Closed', 8, 9), stage('w', 'Replied', 7, 9)];
  const m = Object.fromEntries(WN.milestones(leads, acts, {}, NOW).map(x => [x.id, x]));
  assert.ok(m['yalo-first-deal'].done); assert.equal(m['yalo-first-deal'].company, 'Prime Estates'); assert.equal(m['yalo-first-deal'].at.getDate(), 6);
  assert.ok(m['yalo-partner'].done, 'real estate sector is a partner');
  assert.ok(m['yalo-value-10m'].done && !m['yalo-value-50m'].done); assert.ok(m['yalo-comm-100k'].done && !m['yalo-comm-500k'].done);
  assert.ok(m['cp-first-creator'].done); assert.equal(m['cp-first-creator'].company, 'Tech Tom'); assert.ok(m['cp-first-reply'].done);
  assert.ok(!m['cp-creators-5'].done); assert.equal(m['cp-creators-5'].have, 1); assert.equal(m['cp-creators-5'].progress, 0.2);
  assert.ok(m['first-close'].done && m['first-close'].at.getDate() === 6);
});
test('a non-partner deal is a deal but not a partner', () => {
  const leads = [lead('a', { company: 'Zed Logistics', sector: 'Logistics', stage: 'Closed', value: 3e6 })]; const acts = [stage('a', 'Closed', 3)];
  const m = Object.fromEntries(WN.milestones(leads, acts, {}, NOW).map(x => [x.id, x]));
  assert.ok(m['yalo-first-deal'].done); assert.ok(!m['yalo-partner'].done);
});
test('send counts, streaks and the 100 day', () => {
  const leads = [lead('a')]; const acts = [];
  for (let d = 5; d <= 11; d++) acts.push(sent('a', d, 9));                 // 7 days running
  for (let i = 0; i < 100; i++) acts.push(sent('a', 3, 8 + (i % 8)));        // a 100 day on the 3rd
  const m = Object.fromEntries(WN.milestones(leads, acts, {}, NOW).map(x => [x.id, x]));
  assert.ok(m['streak-7'].done && !m['streak-14'].done); assert.ok(m['bigday-100'].done && m['bigday-100'].at.getDate() === 3);
  assert.ok(m['sent-100'].done); assert.equal(m['sent-100'].actual, 107);
  assert.equal(m['streak-7'].live, 7, 'sent yesterday: the streak is still alive');
  const r = WN.review(leads, acts, {}, { kind: 'week', now: NOW });          // Mon 9 – Sun 15
  assert.equal(r.sent, 3); assert.equal(r.bars.length, 7); assert.equal(r.bars[0].n, 1); assert.equal(r.streak, 3);
});
test('week, month and year ranges', () => {
  const w = WN.range('week', NOW, 0); assert.equal(w.from.getDay(), 1); assert.equal(w.from.getDate(), 9); assert.equal(w.to.getDate(), 16); assert.ok(w.current);
  assert.equal(WN.range('week', NOW, -1).from.getDate(), 2);
  const m = WN.range('month', NOW, -1); assert.equal(m.from.getMonth(), 9); assert.equal(m.label, 'October'); assert.ok(!m.current);
  const y = WN.range('year', NOW, 0); assert.equal(y.label, '2026'); assert.equal(WN.range('month', new Date(2026, 0, 15), -1).from.getFullYear(), 2025);
});
test('brand view only counts that company; the comparison with the last period works', () => {
  const leads = [lead('a'), lead('c', { brand: 'clearpath' })];
  const acts = [sent('a', 10), sent('a', 11), sent('c', 10), sent('a', 3)];
  assert.equal(WN.review(leads, acts, {}, { kind: 'week', now: NOW, brand: 'yalo' }).sent, 2);
  assert.equal(WN.review(leads, acts, {}, { kind: 'week', now: NOW, brand: 'clearpath' }).sent, 1);
  const all = WN.review(leads, acts, {}, { kind: 'week', now: NOW }); assert.equal(all.sent, 3); assert.equal(all.vs.sent, 200);
});
test('only fresh wins can celebrate, so a slow load never throws a false party', () => {
  const leads = [lead('a', { stage: 'Closed', value: 1e6 })]; const old = [stage('a', 'Closed', 1)], recent = [stage('a', 'Closed', 12, 9)];
  assert.equal(WN.fresh(WN.milestones(leads, old, {}, NOW), NOW, 48).length, 0);
  assert.ok(WN.fresh(WN.milestones(leads, recent, {}, NOW), NOW, 48).some(m => m.id === 'yalo-first-deal'));
});
test('nextUp picks the closest unfinished milestone; forBrand hides the other company', () => {
  const leads = [lead('a')]; const acts = []; for (let i = 0; i < 40; i++) acts.push(sent('a', 11, 8 + (i % 8)));
  const all = WN.milestones(leads, acts, {}, NOW); assert.equal(WN.nextUp(all).id, 'sent-50');
  assert.ok(!WN.forBrand(all, 'yalo').some(m => m.brand === 'clearpath')); assert.ok(WN.forBrand(all, 'clearpath').every(m => m.brand !== 'yalo'));
});
test('money formats for naira', () => {
  assert.equal(WN.money(0), '₦0'); assert.equal(WN.money(1500), '₦1,500'); assert.equal(WN.money(100000), '₦100k'); assert.equal(WN.money(8000000), '₦8M'); assert.equal(WN.money(8250000), '₦8.25M'); assert.equal(WN.money(1.2e9), '₦1.2B');
});
test('empty data is calm', () => { const r = WN.review([], [], {}, { kind: 'month', now: NOW }); assert.ok(r.empty); assert.equal(r.commission, 0); assert.equal(WN.milestones([], [], {}, NOW).filter(m => m.done).length, 0); });
