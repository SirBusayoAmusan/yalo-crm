/* YALO CRM: what should buzz your phone, and when. Pure logic (no DOM, no network), usable in the browser (window.PC) and in Node.
 * The app builds this list from your tasks, sequences and sending plan, and uploads it to the push server, which sends each
 * item at its time even when the app is closed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./outreach-core.js'), require('./sales-core.js'));
  else root.PC = factory(root.YO, root.YS);
})(typeof self !== 'undefined' ? self : this, function (YO, YS) {
  'use strict';
  const MIN = 60000, DAY = 86400000;
  const DEFAULT_PREFS = { on: false, tasks: true, morning: true, morningTime: '08:30', batches: true, followups: true };
  const prefsOf = s => Object.assign({}, DEFAULT_PREFS, (s && s.push) || {});
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const atTime = (day, hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); const d = new Date(day); d.setHours(h || 0, m || 0, 0, 0); return d; };
  const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const startOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

  function channelOf(lead, ci, idx) {
    const c = (lead.contacts || [])[ci] || {};
    const type = (c.seq && c.seq.type) || lead.seqType || YS.autoSeqType(lead, c);
    const t = (YS.templatesFor(type, {}) || [])[idx];
    return (t && t.channel) || 'email';
  }

  // What is waiting each day for the next `days` days (day 0 = today, including everything overdue).
  function workByDay(o) {
    const now = o.now, days = o.days || 8, leads = (o.leads || []).filter(l => l && !l._deleted);
    const queue = YO.buildQueue(leads, now);
    const rows = Array.from({ length: days }, (_, d) => ({ day: startOf(new Date(startOf(now).getTime() + d * DAY + 12 * 3600000)), emails: 0, messages: 0, tasks: 0, replies: 0 }));
    queue.forEach(q => {
      if (q.noEmail && channelOf(q.lead, q.ci, q.idx) === 'email') return;
      const idx = q.when === 'upcoming' ? Math.floor((startOf(q.due) - startOf(now)) / DAY) : 0;
      if (idx < 0 || idx >= days) return;
      rows[idx][channelOf(q.lead, q.ci, q.idx) === 'email' ? 'emails' : 'messages']++;
    });
    (o.reminders || []).filter(r => r && !r.done && r.when).forEach(r => {
      const idx = Math.max(0, Math.floor((startOf(new Date(r.when)) - startOf(now)) / DAY)); if (idx < days) rows[idx].tasks++;
    });
    rows[0].replies = leads.filter(l => l.stage === 'Replied').length;
    return rows;
  }

  function buildSchedule(o) {
    const now = o.now || new Date(), prefs = prefsOf(o.settings), items = [], days = o.days || 8;
    const rows = workByDay({ now, leads: o.leads, reminders: o.reminders, days });

    if (prefs.tasks) (o.reminders || []).filter(r => r && !r.done && r.when).forEach(r => {
      const at = new Date(r.when); if (isNaN(at) || at < now - 10 * MIN || at > now.getTime() + 60 * DAY) return;
      items.push({ id: 'r:' + r.id, at: at.toISOString(), title: '⏰ ' + clip(r.note, 70), body: clip([r.company, r.contactName].filter(Boolean).join(' · ') || 'Follow-up due', 150), url: r.leadId ? `/?lead=${encodeURIComponent(r.leadId)}&tab=overview` : '/?go=tasks' });
    });

    if (prefs.morning) rows.forEach((row, d) => {
      const n = row.emails + row.messages + row.tasks + row.replies; if (!n) return;
      const at = atTime(row.day, prefs.morningTime); if (at <= now) return;
      const parts = [row.emails && `📬 ${row.emails} email${row.emails > 1 ? 's' : ''}`, row.messages && `💬 ${row.messages} message${row.messages > 1 ? 's' : ''}`, row.tasks && `✅ ${row.tasks} task${row.tasks > 1 ? 's' : ''}`, row.replies && `↩ ${row.replies} repl${row.replies > 1 ? 'ies' : 'y'} waiting`].filter(Boolean);
      items.push({ id: 'm:' + dayKey(row.day), at: at.toISOString(), title: `Good morning. ${n} to do today`, body: parts.join(' · '), url: '/?go=queue' });
    });

    if (prefs.batches) {
      const cfg = YS.planConfig(o.settings), st = YS.planStatus(cfg, o.activities || [], [], now), targets = YS.splitTarget(cfg.split, st.target);
      rows.forEach((row, d) => {
        let left = row.emails; if (!left) return;
        cfg.times.forEach((t, i) => {
          const at = atTime(row.day, t), n = Math.min(targets[i], left); left -= n;
          if (at <= now || n <= 0) return;
          items.push({ id: `b:${dayKey(row.day)}:${i}`, at: at.toISOString(), title: `📬 Batch ${i + 1} of 4: send ${n}`, body: 'Open Send mode. This part of the day\'s emails is ready.', url: '/?go=send' });
        });
      });
    }

    // Automatic follow-up prompts: the moment each next step falls due (it is timed from when you tapped "I sent it").
    // Steps due in the same hour share one notification. A prompt is skipped when a batch or morning reminder is already
    // buzzing within 25 minutes, so you are never pinged twice for the same thing.
    if (prefs.followups) {
      const near = items.filter(i => /^[bm]:/.test(i.id)).map(i => new Date(i.at).getTime());
      const groups = {};
      YO.buildQueue((o.leads || []).filter(l => l && !l._deleted), now).forEach(q => {
        if (!q.due || (q.noEmail && channelOf(q.lead, q.ci, q.idx) === 'email')) return;
        const due = new Date(q.due); if (isNaN(due) || due <= now || due > now.getTime() + 14 * DAY) return;
        if (q.idx === 0) return;                                     // first steps are covered by the plan; follow-ups are the ones that need a prompt
        const key = due.getFullYear() + '-' + pad(due.getMonth() + 1) + '-' + pad(due.getDate()) + 'T' + pad(due.getHours());
        (groups[key] = groups[key] || []).push({ q, due });
      });
      Object.keys(groups).forEach(key => {
        const g = groups[key].sort((a, b) => a.due - b.due), at = g[0].due.getTime();
        if (near.some(t => Math.abs(t - at) <= 25 * MIN)) return;
        const one = g[0].q, who = x => { const c = (x.q.lead.contacts || [])[x.q.ci] || {}; return `${c.name || x.q.lead.company}${c.name && x.q.lead.company ? ' (' + clip(x.q.lead.company, 24) + ')' : ''}`; };
        items.push({ id: 'f:' + key, at: g[0].due.toISOString(), title: g.length === 1 ? `📬 Follow-up due: ${clip(who(g[0]), 60)}` : `📬 ${g.length} follow-ups due now`,
          body: clip(g.slice(0, 3).map(x => `Email ${x.q.idx + 1} · ${who(x)}`).join(', ') + (g.length > 3 ? ` +${g.length - 3} more` : ''), 150),
          url: g.length === 1 ? `/?lead=${encodeURIComponent(one.lead.id)}&tab=emails` : '/?go=queue' });
      });
    }
    return items.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 380);
  }

  // Where a tapped notification should land. Returns an action or null.
  function route(search) {
    const p = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    if (p.get('lead')) return { type: 'lead', id: p.get('lead'), tab: ['overview', 'emails', 'activity', 'notes'].includes(p.get('tab')) ? p.get('tab') : 'overview' };
    const go = p.get('go');
    if (go === 'tasks') return { type: 'tab', tab: 'tasks' };
    if (go === 'queue') return { type: 'tab', tab: 'outreach' };
    if (go === 'send') return { type: 'send' };
    return null;
  }

  // Which device and browser is this? (decides what to tell the user)
  function platform(env) {
    const ua = (env && env.ua) || '', touch = (env && env.maxTouchPoints) || 0, plat = (env && env.platform) || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (plat === 'MacIntel' && touch > 1);
    const standalone = !!(env && env.standalone);
    const supported = !!(env && env.hasSW && env.hasPush && env.hasNotification);
    let need = null;
    if (ios && !standalone) need = 'install';           // iPhone only allows push for apps added to the Home Screen
    else if (!supported) need = 'unsupported';
    else if (env && env.permission === 'denied') need = 'blocked';
    const label = ios ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android phone' : /Mac|Windows|Linux/.test(ua) ? 'Computer' : 'This device';
    return { ios, standalone, supported, need, label };
  }
  const urlBase64ToBytes = b64 => { const pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };

  return { DEFAULT_PREFS, prefsOf, workByDay, buildSchedule, route, platform, urlBase64ToBytes, dayKey, channelOf };
});
