/* YALO CRM: wins. Milestones (first deal, first partner, first creator...), weekly / monthly / yearly reviews, and your commission.
 * Pure logic (no DOM, no network), usable in the browser (window.WN) and in Node. Everything is worked out from your leads and activity log,
 * so nothing extra is saved and nothing can drift out of date. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sales-core.js'));
  else root.WN = factory(root.YS);
})(typeof self !== 'undefined' ? self : this, function (YS) {
  'use strict';
  const DAY = 86400000;
  const DEFAULTS = { rate: 1, base: 0, showMoney: false, showNames: false };      // rate is in percent: YALO pays you 1% of every closed deal
  const optsOf = s => { const w = Object.assign({}, DEFAULTS, (s && s.wins) || {}); w.rate = Math.min(100, Math.max(0, Number(w.rate) || 0)); w.base = Math.max(0, Number(w.base) || 0); return w; };
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const brandOf = l => YS.brandOf(l);
  const EXEC = /\b(ceo|cfo|coo|cto|md|founder|co-?founder|owner|president|director|chief|managing|head of finance|vp)\b/i;
  const PARTNER = /partner|landlord|property|real estate|estate|realt|agency|housing|developer|facilit/i;

  /* ------------------------------------------------------------------ events: what happened, and when */
  function events(leads, acts) {
    const byId = {}; (leads || []).forEach(l => { if (l && !l._deleted) byId[l.id] = l; });
    const ev = { sent: [], replies: [], meetings: [], proposals: [], closes: [], calls: [] };
    const seenReply = new Set();
    (acts || []).forEach(a => {
      const l = byId[a.leadId]; if (!l || !a.ts) return; const ts = new Date(a.ts); if (isNaN(ts)) return; const d = String(a.desc || '');
      const row = { ts, lead: l, brand: brandOf(l) };
      if (a.type === 'email' && /^Sent /.test(d)) ev.sent.push(row);
      else if (a.type === 'call') ev.calls.push(row);
      if ((a.type === 'email' && /^Reply received/.test(d)) || (a.type === 'status' && /-> Replied$/.test(d))) { const k = l.id + '|' + dayKey(ts); if (!seenReply.has(k)) { seenReply.add(k); ev.replies.push(row); } }
      if (a.type === 'meeting' || (a.type === 'status' && /-> Meeting Set$/.test(d))) ev.meetings.push(row);
      if (a.type === 'status' && /-> Proposal Sent$/.test(d)) ev.proposals.push(row);
    });
    // a deal counts once, when it was last moved to Closed, and only while it is still Closed
    const lastClose = {};
    (acts || []).forEach(a => { if (a.type === 'status' && /-> Closed$/.test(String(a.desc || '')) && byId[a.leadId] && byId[a.leadId].stage === 'Closed') { const t = new Date(a.ts); if (!isNaN(t) && (!lastClose[a.leadId] || t > lastClose[a.leadId])) lastClose[a.leadId] = t; } });
    Object.keys(lastClose).forEach(id => { const l = byId[id]; ev.closes.push({ ts: lastClose[id], lead: l, brand: brandOf(l), value: Number(l.value) || 0 }); });
    Object.keys(ev).forEach(k => ev[k].sort((a, b) => a.ts - b.ts));
    return ev;
  }

  /* ------------------------------------------------------------------ the numbers behind each milestone */
  function series(ev, o) {
    const rate = o.rate / 100, isPartner = l => PARTNER.test([l.sector, l.company, l.notes].join(' '));
    const only = (arr, b) => arr.filter(x => x.brand === b);
    const yClose = only(ev.closes, 'yalo'), cClose = only(ev.closes, 'clearpath');
    const cum = (arr, f) => { let t = 0; return arr.map(x => { t += f(x); return { ts: x.ts, lead: x.lead, total: t }; }); };
    return {
      sent: ev.sent, replies: ev.replies, meetings: ev.meetings, proposals: ev.proposals, closes: ev.closes,
      yalo_closes: yClose, partner_closes: yClose.filter(x => isPartner(x.lead)), exec_replies: only(ev.replies, 'yalo').filter(x => (x.lead.contacts || []).some(c => EXEC.test(c.title || ''))),
      cp_replies: only(ev.replies, 'clearpath'), cp_closes: cClose, cp_sent: only(ev.sent, 'clearpath'),
      yalo_value: cum(yClose, x => x.value), yalo_commission: cum(yClose, x => x.value * rate)
    };
  }
  function streakDates(ev) {
    const days = [...new Set(ev.sent.map(x => dayKey(x.ts)))].sort(), out = []; let run = 0, prev = null;
    days.forEach(k => { const d = startOfDay(k.replace(/-/g, '/')); run = prev && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1; prev = d; out.push({ run, ts: new Date(d.getTime() + 12 * 3600000), key: k }); });
    return out;
  }
  function bigDays(ev) { const m = {}; ev.sent.forEach(x => { const k = dayKey(x.ts); m[k] = (m[k] || 0) + 1; }); return Object.keys(m).sort().map(k => ({ n: m[k], ts: new Date(k.replace(/-/g, '/') + ' 12:00') })); }

  /* ------------------------------------------------------------------ milestones */
  // metric: which series; target: how many (or how much) it takes. brand: where it shows.
  const M = (id, brand, metric, target, icon, title, sub, tone) => ({ id, brand, metric, target, icon, title, sub, tone: tone || 'indigo' });
  const MILESTONES = [
    M('first-send', 'all', 'sent', 1, '📨', 'First email out', 'The first message is the hardest', 'indigo'),
    M('sent-10', 'all', 'sent', 10, '✉️', '10 sent', 'Momentum', 'indigo'),
    M('sent-50', 'all', 'sent', 50, '⚡', '50 sent', 'Warmed up', 'indigo'),
    M('sent-100', 'all', 'sent', 100, '💯', 'The hundred', '100 messages sent', 'violet'),
    M('sent-500', 'all', 'sent', 500, '🚀', '500 club', '500 messages sent', 'violet'),
    M('sent-1000', 'all', 'sent', 1000, '🌋', '1,000 sent', 'Serious volume', 'gold'),
    M('first-reply', 'all', 'replies', 1, '💬', 'First reply', 'Someone answered', 'teal'),
    M('replies-10', 'all', 'replies', 10, '🗣️', '10 conversations', 'People want to talk', 'teal'),
    M('first-meeting', 'all', 'meetings', 1, '📅', 'First meeting booked', 'A real conversation is on the calendar', 'teal'),
    M('first-proposal', 'all', 'proposals', 1, '📑', 'First proposal out', 'You put a number on the table', 'violet'),
    M('first-close', 'all', 'closes', 1, '🏆', 'First deal won', 'Proof it works', 'gold'),
    M('streak-3', 'all', 'streak', 3, '🔥', '3-day streak', 'Three days running', 'orange'),
    M('streak-7', 'all', 'streak', 7, '🔥', 'Week streak', 'Seven days running', 'orange'),
    M('streak-14', 'all', 'streak', 14, '🔥', 'Fortnight streak', 'Two weeks without a gap', 'orange'),
    M('streak-30', 'all', 'streak', 30, '🔥', '30-day streak', 'A month of showing up', 'gold'),
    M('bigday-50', 'all', 'bigday', 50, '📣', '50 in a day', 'A big sending day', 'violet'),
    M('bigday-100', 'all', 'bigday', 100, '🎯', 'The 100 day', '100 sent in a single day', 'gold'),

    M('yalo-exec', 'yalo', 'exec_replies', 1, '🎯', 'First executive replied', 'A CEO, CFO or owner answered', 'teal'),
    M('yalo-first-deal', 'yalo', 'yalo_closes', 1, '🔑', 'First YALO deal secured', 'Rent financing, signed', 'gold'),
    M('yalo-partner', 'yalo', 'partner_closes', 1, '🤝', 'First partner closed', 'A property partner is on board', 'gold'),
    M('yalo-deals-3', 'yalo', 'yalo_closes', 3, '🥉', 'Three YALO deals', 'It is repeatable', 'orange'),
    M('yalo-deals-10', 'yalo', 'yalo_closes', 10, '🥇', 'Ten YALO deals', 'A real book of business', 'gold'),
    M('yalo-value-1m', 'yalo', 'yalo_value', 1e6, '💰', '₦1M closed', 'First million in deals', 'indigo'),
    M('yalo-value-10m', 'yalo', 'yalo_value', 1e7, '💎', '₦10M closed', 'Ten million in deals', 'violet'),
    M('yalo-value-50m', 'yalo', 'yalo_value', 5e7, '🏦', '₦50M closed', 'Fifty million in deals', 'violet'),
    M('yalo-value-100m', 'yalo', 'yalo_value', 1e8, '👑', '₦100M club', 'One hundred million in deals', 'gold'),
    M('yalo-comm-first', 'yalo', 'yalo_commission', 1, '💸', 'First commission earned', 'Your 1% starts paying', 'gold'),
    M('yalo-comm-100k', 'yalo', 'yalo_commission', 1e5, '💵', '₦100k commission', 'Earned so far', 'indigo'),
    M('yalo-comm-500k', 'yalo', 'yalo_commission', 5e5, '💶', '₦500k commission', 'Earned so far', 'violet'),
    M('yalo-comm-1m', 'yalo', 'yalo_commission', 1e6, '🪙', '₦1M commission', 'Earned so far', 'gold'),

    M('cp-first-reply', 'clearpath', 'cp_replies', 1, '🎬', 'First creator replied', 'A YouTuber answered', 'teal'),
    M('cp-first-creator', 'clearpath', 'cp_closes', 1, '▶️', 'First creator on board', 'Lead capture is live on a channel', 'gold'),
    M('cp-creators-5', 'clearpath', 'cp_closes', 5, '📺', '5 creators', 'A small network', 'orange'),
    M('cp-creators-10', 'clearpath', 'cp_closes', 10, '📺', '10 creators', 'Word is spreading', 'violet'),
    M('cp-creators-25', 'clearpath', 'cp_closes', 25, '🌟', '25 creators', 'A real community', 'violet'),
    M('cp-creators-50', 'clearpath', 'cp_closes', 50, '🏅', '50 creators', 'A platform in the making', 'gold'),
    M('cp-reach-100', 'clearpath', 'cp_sent', 100, '📡', '100 creators contacted', 'Reached out to a hundred channels', 'indigo')
  ];

  // Each milestone with progress, whether it is won, when, and which deal it was.
  function milestones(leads, acts, settings, now) {
    now = now || new Date(); const o = optsOf(settings), ev = events(leads, acts), S = series(ev, o);
    const streaks = streakDates(ev), days = bigDays(ev), maxStreak = streaks.reduce((m, x) => Math.max(m, x.run), 0);
    // the current streak only counts if you sent today or yesterday
    const last = streaks[streaks.length - 1], live = last && (startOfDay(now) - startOfDay(last.ts.getTime())) / DAY <= 1 ? last.run : 0;
    const bestDay = days.reduce((m, x) => Math.max(m, x.n), 0);
    return MILESTONES.map(m => {
      let have = 0, at = null, who = null, amount = null;
      if (m.metric === 'streak') { have = maxStreak; const hit = streaks.find(x => x.run >= m.target); if (hit) at = hit.ts; }
      else if (m.metric === 'bigday') { have = bestDay; const hit = days.find(x => x.n >= m.target); if (hit) at = hit.ts; }
      else {
        const s = S[m.metric] || [], money = /value|commission/.test(m.metric);
        if (money) { have = s.length ? s[s.length - 1].total : 0; const hit = s.find(x => x.total >= m.target); if (hit) { at = hit.ts; who = hit.lead; amount = hit.total; } }
        else { have = s.length; const hit = s[m.target - 1]; if (hit) { at = hit.ts; who = hit.lead; if (hit.value) amount = hit.value; } }
      }
      const done = have >= m.target;
      return Object.assign({}, m, { have: Math.min(have, m.target), actual: have, done, at: done ? at : null, company: done && who ? who.company : '', amount, progress: Math.min(1, have / m.target), live: m.metric === 'streak' ? live : undefined });
    });
  }
  const forBrand = (list, brand) => (!brand || brand === 'all') ? list : list.filter(m => m.brand === 'all' || m.brand === brand);
  const nextUp = list => list.filter(m => !m.done && m.progress > 0).sort((a, b) => b.progress - a.progress)[0] || list.filter(m => !m.done)[0] || null;

  /* ------------------------------------------------------------------ periods: week, month, year */
  function range(kind, now, offset) {
    now = now || new Date(); offset = offset || 0; let from, to, label, sub;
    if (kind === 'week') { const d = startOfDay(now); const dow = (d.getDay() + 6) % 7; from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + offset * 7); to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7); const e = new Date(to - DAY); label = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : 'Week of ' + from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); sub = from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' – ' + e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
    else if (kind === 'year') { from = new Date(now.getFullYear() + offset, 0, 1); to = new Date(now.getFullYear() + offset + 1, 0, 1); label = String(from.getFullYear()); sub = 'Year in review'; }
    else { from = new Date(now.getFullYear(), now.getMonth() + offset, 1); to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1); label = from.toLocaleDateString('en-GB', { month: 'long' }); sub = from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
    return { kind, from, to, label, sub, offset, current: now >= from && now < to };
  }
  const inR = (r, ts) => ts >= r.from && ts < r.to;

  function review(leads, acts, settings, o) {
    o = o || {}; const now = o.now || new Date(), brand = o.brand || 'all', opts = optsOf(settings), kind = o.kind || 'week';
    const r = range(kind, now, o.offset || 0), prev = range(kind, now, (o.offset || 0) - 1);
    const live = (leads || []).filter(l => l && !l._deleted), ev = events(leads, acts);
    const pick = arr => brand === 'all' ? arr : arr.filter(x => x.brand === brand);
    const count = (key, rg) => pick(ev[key]).filter(x => inR(rg, x.ts)).length;
    const sent = count('sent', r), psent = count('sent', prev), replies = count('replies', r), meetings = count('meetings', r), proposals = count('proposals', r);
    const closes = pick(ev.closes).filter(x => inR(r, x.ts)), pcloses = pick(ev.closes).filter(x => inR(prev, x.ts));
    const yClosed = ev.closes.filter(x => x.brand === 'yalo' && inR(r, x.ts)), pyClosed = ev.closes.filter(x => x.brand === 'yalo' && inR(prev, x.ts));
    const closedValue = closes.reduce((s, x) => s + x.value, 0), commission = yClosed.reduce((s, x) => s + x.value * opts.rate / 100, 0), pcommission = pyClosed.reduce((s, x) => s + x.value * opts.rate / 100, 0);
    // bars: one per day (week, month) or per month (year)
    const sends = pick(ev.sent).filter(x => inR(r, x.ts)), bars = [];
    if (kind === 'year') for (let m = 0; m < 12; m++) bars.push({ label: new Date(r.from.getFullYear(), m, 1).toLocaleDateString('en', { month: 'short' }), n: sends.filter(x => x.ts.getMonth() === m).length });
    else for (let t = r.from.getTime(); t < r.to.getTime(); t += DAY) { const d = new Date(t); bars.push({ label: d.toLocaleDateString('en', kind === 'week' ? { weekday: 'short' } : { day: 'numeric' }), n: sends.filter(x => dayKey(x.ts) === dayKey(d)).length }); }
    const perDay = {}; sends.forEach(x => { const k = dayKey(x.ts); perDay[k] = (perDay[k] || 0) + 1; });
    const bestKey = Object.keys(perDay).sort((a, b) => perDay[b] - perDay[a] || (a < b ? -1 : 1))[0];
    const keys = Object.keys(perDay).sort(); let run = 0, best = 0, pv = null; keys.forEach(k => { const d = startOfDay(k.replace(/-/g, '/')); run = pv && Math.round((d - pv) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); pv = d; });
    const top = closes.slice().sort((a, b) => b.value - a.value)[0] || null;
    const open = live.filter(l => !['Closed', 'Lost'].includes(l.stage) && (brand === 'all' || brandOf(l) === brand));
    const openYalo = live.filter(l => !['Closed', 'Lost'].includes(l.stage) && brandOf(l) === 'yalo').reduce((s, l) => s + (Number(l.value) || 0), 0);
    const won = milestones(leads, acts, settings, now).filter(m => m.done && m.at && inR(r, m.at) && (brand === 'all' || m.brand === 'all' || m.brand === brand));
    const pct = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? null : 0);
    return {
      range: r, brand, kind, sent, replies, meetings, proposals, deals: closes.length, closedValue, yaloClosedValue: yClosed.reduce((t, x) => t + x.value, 0), commission, base: opts.base, total: opts.base + commission, rate: opts.rate,
      replyRate: sent ? Math.round(replies / sent * 1000) / 10 : 0, bars, bestDay: bestKey ? { key: bestKey, n: perDay[bestKey] } : null, streak: best, topDeal: top,
      openValue: open.reduce((s, l) => s + (Number(l.value) || 0), 0), potentialCommission: openYalo * opts.rate / 100, milestones: won,
      vs: { sent: pct(sent, psent), deals: closes.length - pcloses.length, commission: pct(commission, pcommission) },
      yaloDeals: yClosed.length, empty: !sent && !replies && !meetings && !closes.length
    };
  }

  /* ------------------------------------------------------------------ small helpers for display */
  function money(n) { n = Math.round(Number(n) || 0); const a = Math.abs(n), t = (x, u) => { const v = x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1'); return '₦' + v + u; }; return a >= 1e9 ? t(n / 1e9, 'B') : a >= 1e6 ? t(n / 1e6, 'M') : a >= 1e4 ? t(n / 1e3, 'k') : '₦' + n.toLocaleString('en-US'); }
  // The newest wins (won within `hours`), for the celebration. Old wins never pop up, so a slow load cannot cause a false party.
  function fresh(list, now, hours) { now = now || new Date(); return list.filter(m => m.done && m.at && now - m.at >= 0 && now - m.at <= (hours || 48) * 3600000); }

  return { DEFAULTS, optsOf, MILESTONES, events, milestones, forBrand, nextUp, range, review, money, fresh, dayKey };
});
