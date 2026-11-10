/* YALO CRM: Wins. Milestone stickers, weekly / monthly / yearly reviews you can share (LinkedIn, X, Stories, a post), and your commission.
 * Works out everything from your leads and activity (see wins-core.js). Share images are drawn on a canvas on this device: nothing is uploaded.
 * Loads after workspace.js and shares its globals. */
(function () {
  'use strict';
  const WN = window.WN, YS = window.YS, YO = window.YO, S = window.SALES;
  if (!WN || !YS || !YO || !S) { console.warn('wins.js needs the sales files'); return; }
  const U = S.util, $ = id => document.getElementById(id), esc = YO.esc;
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } } };
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const settingsLoaded = () => typeof settings !== 'undefined' && settings && Object.keys(settings).length > 0;
  const ui = { kind: LS.get('yalo_wins_kind') || 'month', offset: 0, fmt: LS.get('yalo_wins_fmt') || 'story', allStickers: false };
  const BRAND = { yalo: 'YALO', clearpath: 'Clearpath QR', all: 'YALO × Clearpath QR' };
  const brand = () => U.activeBrand() || 'all';
  const opts = () => WN.optsOf(typeof settings !== 'undefined' ? settings : {});
  const who = () => (($('hero-greet-name') || {}).textContent || '').trim();
  const nowFn = () => (window.__WINS_NOW ? new Date(window.__WINS_NOW) : new Date());
  const ms = () => WN.milestones(S.allLeads(), S.allActs(), typeof settings !== 'undefined' ? settings : {}, nowFn());
  const rv = (o) => WN.review(S.allLeads(), S.allActs(), typeof settings !== 'undefined' ? settings : {}, Object.assign({ now: nowFn(), brand: brand(), kind: ui.kind, offset: ui.offset }, o || {}));
  const fmtInt = n => Math.round(n).toLocaleString('en-US');
  const longDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const delta = (v, unit) => v == null ? '<span class="wn-dl new">new</span>' : v === 0 ? '' : `<span class="wn-dl ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v)}${unit == null ? '%' : unit}</span>`;

  /* ------------------------------------------------------------------ look of the stickers (used on screen and on the share images) */
  const TONES = { indigo: ['#a5b4fc', '#4f46e5'], violet: ['#d8b4fe', '#7c3aed'], teal: ['#5eead4', '#0d9488'], orange: ['#fdba74', '#ea580c'], gold: ['#fde68a', '#d97706'] };
  const THEMES = {
    yalo: { bg1: '#0e0f2e', bg2: '#33207a', a: '#6366f1', b: '#a78bfa', c: '#22d3ee' },
    clearpath: { bg1: '#04211f', bg2: '#0c5a4f', a: '#14b8a6', b: '#a3e635', c: '#22d3ee' },
    all: { bg1: '#0b0b1c', bg2: '#35154f', a: '#6366f1', b: '#f472b6', c: '#fbbf24' }
  };

  /* ================================================================== SHARE ART (canvas) */
  const FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const FORMATS = { story: { w: 1080, h: 1920, label: 'Story', hint: 'Instagram, WhatsApp, LinkedIn stories' }, post: { w: 1080, h: 1350, label: 'Post', hint: 'LinkedIn, Instagram, X' }, square: { w: 1080, h: 1080, label: 'Square', hint: 'Anywhere' } };
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  function text(c, str, x, y, o) {
    o = o || {}; c.save(); c.font = `${o.weight || 600} ${o.size || 40}px ${FONT}`; c.fillStyle = o.color || '#fff'; c.globalAlpha = o.alpha == null ? 1 : o.alpha; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
    if (o.spacing && 'letterSpacing' in c) c.letterSpacing = o.spacing + 'px';
    let s = String(str), size = o.size || 40;
    if (o.max) while (c.measureText(s).width > o.max && size > 14) { size -= 2; c.font = `${o.weight || 600} ${size}px ${FONT}`; }
    c.fillText(s, x, y); c.restore();
  }
  function background(c, W, H, T, i) {
    const g = c.createLinearGradient(0, 0, W * .6, H); g.addColorStop(0, T.bg1); g.addColorStop(1, T.bg2); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const blob = (x, y, r, col, a) => { const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.globalAlpha = a; c.fillStyle = rg; c.fillRect(0, 0, W, H); c.restore(); };
    const sets = [[.85, .1, .75, T.a, .55, .05, .95, .7, T.b, .38], [.1, .2, .8, T.b, .4, .95, .85, .8, T.a, .5], [.9, .55, .7, T.c, .3, .1, .9, .8, T.a, .5], [.2, .1, .7, T.a, .5, .85, .75, .7, T.b, .4], [.8, .15, .8, T.b, .45, .15, .85, .75, T.c, .3]][i % 5];
    blob(W * sets[0], H * sets[1], W * sets[2], sets[3], sets[4]); blob(W * sets[5], H * sets[6], W * sets[7], sets[8], sets[9]);
    c.save(); c.globalAlpha = .045; c.fillStyle = '#fff'; for (let x = 54; x < W; x += 54) for (let y = 54; y < H; y += 54) { c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); } c.restore();
  }
  function chrome(c, W, H, T, o) {
    const top = H > 1700 ? 170 : 96, bot = H > 1700 ? 160 : 84;
    text(c, o.brandName.toUpperCase(), 72, top, { size: 32, weight: 800, align: 'left', spacing: 4, alpha: .92 });
    text(c, o.sub, W - 72, top, { size: 30, weight: 500, align: 'right', alpha: .6 });
    if (o.name) text(c, o.name, 72, H - bot, { size: 30, weight: 600, align: 'left', alpha: .85, max: 520 });
    text(c, 'Built with YALO CRM', W - 72, H - bot, { size: 28, weight: 500, align: 'right', alpha: .5 });
  }
  const pill = (c, x, y, str, o) => { c.save(); c.font = `700 ${o.size || 34}px ${FONT}`; const w = c.measureText(str).width + 56, h = (o.size || 34) + 34; rr(c, x - w / 2, y - h / 2, w, h, h / 2); c.fillStyle = o.bg || 'rgba(255,255,255,.14)'; c.fill(); c.restore(); text(c, str, x, y + 1, { size: o.size || 34, weight: 700, color: o.color || '#fff' }); };

  function sticker(c, cx, cy, r, m, o) {
    o = o || {}; const tone = TONES[m.tone] || TONES.indigo, locked = !m.done && !o.force;
    c.save();
    if (!locked) { const glow = c.createRadialGradient(cx, cy, r * .6, cx, cy, r * 1.5); glow.addColorStop(0, tone[0] + '88'); glow.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = glow; c.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2); }
    // ring
    const ring = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r); ring.addColorStop(0, locked ? '#6b7280' : tone[0]); ring.addColorStop(1, locked ? '#374151' : tone[1]);
    c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fillStyle = ring; c.fill();
    const inner = c.createLinearGradient(cx, cy - r, cx, cy + r); inner.addColorStop(0, locked ? '#2b2f3a' : '#232043'); inner.addColorStop(1, locked ? '#171a22' : '#0b0a1f');
    c.beginPath(); c.arc(cx, cy, r * .86, 0, 7); c.fillStyle = inner; c.fill();
    // soft highlight
    const hl = c.createLinearGradient(cx, cy - r, cx, cy); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath(); c.arc(cx, cy, r * .86, Math.PI * 1.08, Math.PI * 1.92); c.lineTo(cx, cy); c.fillStyle = hl; c.fill();
    if (locked && m.progress > 0) { c.beginPath(); c.arc(cx, cy, r * .93, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.progress); c.strokeStyle = tone[0]; c.lineWidth = r * .09; c.lineCap = 'round'; c.stroke(); }
    c.globalAlpha = locked ? .35 : 1; c.font = `${Math.round(r * .9)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(m.icon, cx, cy + r * .04);
    c.restore();
  }

  // every slide is drawn in a 1080-wide design space, centred, then scaled to fit the shape of the picture
  function slideCanvas(i, data, o) {
    const F = FORMATS[o.fmt], W = F.w, H = F.h, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const T = THEMES[data.brand] || THEMES.all; background(c, W, H, T, i);
    chrome(c, W, H, T, { brandName: BRAND[data.brand] || BRAND.all, sub: data.range.sub, name: o.name });
    const s = Math.min(1, H / 1300), cy = H / 2 + (H > 1700 ? 10 : 0);
    c.save(); c.translate(W / 2, cy); c.scale(s, s);
    SLIDES[i](c, data, T, o);
    c.restore(); return cv;
  }

  const SLIDES = [
    // 1 the headline number
    (c, d) => {
      text(c, d.range.kind === 'year' ? `Your ${d.range.label}` : d.range.kind === 'month' ? `Your ${d.range.label}` : d.range.label, 0, -400, { size: 54, weight: 700, alpha: .75 });
      text(c, fmtInt(d.sent), 0, -170, { size: 360, weight: 800, max: 900, spacing: -8 });
      text(c, d.sent === 1 ? 'message sent' : 'messages sent', 0, 70, { size: 60, weight: 600, alpha: .9 });
      const v = d.vs.sent, lbl = v == null ? 'a fresh start' : v === 0 ? 'same as last time' : `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}% vs ${d.range.kind === 'week' ? 'last week' : d.range.kind === 'month' ? 'last month' : 'last year'}`;
      pill(c, 0, 190, lbl, { bg: v == null || v === 0 ? 'rgba(255,255,255,.14)' : v > 0 ? 'rgba(52,211,153,.28)' : 'rgba(248,113,113,.28)' });
      [[d.replies, 'replies'], [d.meetings, 'meetings'], [d.deals, d.deals === 1 ? 'deal' : 'deals']].forEach((x, k) => { const px = (k - 1) * 330; text(c, fmtInt(x[0]), px, 380, { size: 120, weight: 800 }); text(c, x[1], px, 470, { size: 38, weight: 600, alpha: .7 }); });
    },
    // 2 from send to signed
    (c, d, T) => {
      text(c, 'From send to signed', 0, -470, { size: 74, weight: 800, max: 900 });
      const rows = [['Sent', d.sent], ['Replies', d.replies], ['Meetings', d.meetings], ['Deals won', d.deals]], max = Math.max(1, d.sent, d.replies, d.meetings, d.deals);
      rows.forEach((r, k) => {
        const y = -300 + k * 190, w = Math.max(70, 920 * r[1] / max) - 20;
        text(c, r[0], -480, y - 58, { size: 38, weight: 600, align: 'left', alpha: .75 });
        rr(c, -480, y - 30, 960, 74, 37); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill();
        const g = c.createLinearGradient(-480, 0, 280, 0); g.addColorStop(0, T.a); g.addColorStop(1, T.b); rr(c, -480, y - 30, w + 20, 74, 37); c.fillStyle = g; c.fill();
        text(c, fmtInt(r[1]), 460, y + 7, { size: 54, weight: 800, align: 'right' });
      });
      pill(c, 0, 520, `${d.replyRate}% reply rate`, { size: 40, bg: 'rgba(255,255,255,.16)' });
    },
    // 3 rhythm
    (c, d, T) => {
      text(c, d.range.kind === 'year' ? 'Month by month' : 'Your rhythm', 0, -470, { size: 74, weight: 800 });
      const bars = d.bars, max = Math.max(1, ...bars.map(b => b.n)), n = bars.length, gap = n > 14 ? 6 : 14, bw = (960 - gap * (n - 1)) / n, base = 120, hmax = 460;
      bars.forEach((b, k) => {
        const h = Math.max(8, hmax * b.n / max), x = -480 + k * (bw + gap), top = b.n === max && b.n > 0;
        const g = c.createLinearGradient(0, base - h, 0, base); g.addColorStop(0, top ? T.c : T.b); g.addColorStop(1, T.a); rr(c, x, base - h, bw, h, Math.min(16, bw / 2)); c.fillStyle = b.n ? g : 'rgba(255,255,255,.12)'; c.fill();
        if (n <= 12) text(c, b.label, x + bw / 2, base + 46, { size: 28, weight: 600, alpha: .65 });
      });
      if (d.bestDay) text(c, `Best day: ${shortDate(d.bestDay.key.replace(/-/g, '/'))} · ${d.bestDay.n} sent`, 0, 300, { size: 46, weight: 700 });
      text(c, d.streak > 1 ? `Longest streak: ${d.streak} days in a row` : 'Showing up counts', 0, 380, { size: 40, weight: 600, alpha: .75 });
    },
    // 4 money (if you chose to show it) or deals
    (c, d, T, o) => {
      if (o.showMoney && d.brand !== 'clearpath') {
        text(c, 'Commission earned', 0, -330, { size: 64, weight: 700, alpha: .85 });
        text(c, WN.money(d.commission), 0, -80, { size: 260, weight: 800, max: 900, spacing: -6 });
        text(c, `${d.rate}% of ${WN.money(d.closedValueYalo)} closed`, 0, 150, { size: 46, weight: 600, alpha: .8 });
        if (d.base > 0) { text(c, `+ ${WN.money(d.base)} fee  =  ${WN.money(d.total)}`, 0, 250, { size: 48, weight: 800 }); }
        pill(c, 0, d.base > 0 ? 370 : 300, `${d.yaloDeals} YALO ${d.yaloDeals === 1 ? 'deal' : 'deals'}`, { size: 40 });
      } else {
        text(c, d.brand === 'clearpath' ? 'Creators on board' : 'Deals closed', 0, -330, { size: 64, weight: 700, alpha: .85 });
        text(c, fmtInt(d.deals), 0, -60, { size: 380, weight: 800, spacing: -8 });
        text(c, d.deals === 1 ? 'new win' : 'new wins', 0, 170, { size: 56, weight: 600, alpha: .85 });
        if (o.showNames && d.topDeal) pill(c, 0, 290, `Top win: ${d.topDeal.lead.company}`, { size: 38 });
      }
    },
    // 5 milestones
    (c, d, T, o) => {
      const list = d.milestones.slice(0, 4), many = list.length;
      if (!many) {
        text(c, 'Next milestone', 0, -440, { size: 74, weight: 800 });
        if (d.next) { sticker(c, 0, -90, 230, d.next); text(c, d.next.title, 0, 220, { size: 64, weight: 800, max: 880 }); text(c, `${fmtInt(d.next.actual)} of ${fmtInt(d.next.target)}`.replace(/(\d)(?=(\d{3})+$)/g, '$1'), 0, 300, { size: 46, weight: 600, alpha: .75 }); }
        return;
      }
      text(c, many === 1 ? 'Milestone unlocked' : 'Milestones unlocked', 0, -470, { size: 74, weight: 800, max: 940 });
      if (many === 1) { sticker(c, 0, -80, 250, list[0]); text(c, list[0].title, 0, 260, { size: 70, weight: 800, max: 900 }); text(c, list[0].sub, 0, 345, { size: 42, weight: 500, alpha: .75, max: 900 }); return; }
      list.forEach((m, k) => { const col = k % 2, row = Math.floor(k / 2), x = (col - .5) * 480, y = -260 + row * 480; sticker(c, x, y, 140, m); text(c, m.title, x, y + 200, { size: 40, weight: 700, max: 440 }); });
    }
  ];

  async function drawAll(fmt, d) {
    const o = { fmt, name: who(), showMoney: !!opts().showMoney, showNames: !!opts().showNames }, out = [];
    const data = Object.assign({}, d, { next: WN.nextUp(WN.forBrand(ms(), d.brand)), closedValueYalo: d.yaloClosedValue });
    for (let i = 0; i < SLIDES.length; i++) {
      const cv = slideCanvas(i, data, o); const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      out.push({ blob, url: URL.createObjectURL(blob), name: `${(BRAND[d.brand] || 'yalo').toLowerCase().replace(/[^a-z]+/g, '-')}-${d.range.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i + 1}.png` });
    }
    return out;
  }
  async function stickerImage(m, fmt) {
    const F = FORMATS[fmt], cv = document.createElement('canvas'); cv.width = F.w; cv.height = F.h; const c = cv.getContext('2d'), T = THEMES[m.brand === 'all' ? 'all' : m.brand] || THEMES.all, W = F.w, H = F.h;
    background(c, W, H, T, 2); chrome(c, W, H, T, { brandName: BRAND[m.brand === 'all' ? 'all' : m.brand], sub: 'Milestone unlocked', name: who() });
    const s = Math.min(1, H / 1300); c.save(); c.translate(W / 2, H / 2); c.scale(s, s);
    sticker(c, 0, -120, 290, m); text(c, m.title, 0, 270, { size: 84, weight: 800, max: 920 }); text(c, m.sub, 0, 360, { size: 44, weight: 500, alpha: .75, max: 900 });
    const bits = [m.at ? longDate(m.at) : '', opts().showNames && m.company ? m.company : ''].filter(Boolean).join('  ·  '); if (bits) pill(c, 0, 470, bits, { size: 36 });
    c.restore(); const blob = await new Promise(r => cv.toBlob(r, 'image/png')); return { blob, url: URL.createObjectURL(blob), name: `milestone-${m.id}.png` };
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  async function shareBlob(blob, name, msg) {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: msg }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; } }
    download(blob, name); return 'saved';
  }
  const captionFor = d => {
    const o = opts(), bits = [`${d.range.sub}: ${fmtInt(d.sent)} messages sent, ${d.replies} replies, ${d.meetings} meetings, ${d.deals} ${d.deals === 1 ? 'deal' : 'deals'} won.`];
    if (o.showMoney && d.brand !== 'clearpath' && d.commission > 0) bits.push(`Commission earned: ${WN.money(d.commission)}.`);
    return bits.join(' ');
  };

  /* ================================================================== REVIEW VIEWER (story style) */
  const view = { data: null, slides: [], i: 0, timer: null, busy: false };
  const AUTO_MS = 6500;
  async function openReview() {
    ensureDom(); const d = rv();
    if (d.empty) { toast('Nothing to review in this period yet'); return; }
    view.data = d; view.i = 0; $('wn-viewer').classList.add('open'); document.body.classList.add('wn-lock'); paintViewer(true); await renderSlides();
  }
  async function renderSlides() {
    if (view.busy) return; view.busy = true; stopTimer(); const img = $('wn-v-img'); img.classList.add('loading');
    view.slides.forEach(s => URL.revokeObjectURL(s.url));
    try { view.slides = await drawAll(ui.fmt, view.data); } catch (e) { console.warn('review art', e); toast('Could not draw the review on this device', 'var(--red)'); view.busy = false; return closeReview(); }
    view.busy = false; showSlide(Math.min(view.i, view.slides.length - 1), 0);
  }
  function showSlide(i, dir) {
    view.i = i; const s = view.slides[i]; if (!s) return; const img = $('wn-v-img');
    img.classList.remove('loading'); img.classList.remove('in-l', 'in-r'); void img.offsetWidth; img.src = s.url; img.dataset.i = i;
    if (!reduced() && dir) img.classList.add(dir > 0 ? 'in-l' : 'in-r');
    paintViewer(false); startTimer();
  }
  function startTimer() {
    stopTimer(); const segs = document.querySelectorAll('#wn-segs i'); segs.forEach((s, k) => { s.style.animation = 'none'; s.style.width = k < view.i ? '100%' : '0'; });
    const cur = segs[view.i]; if (!cur || reduced() || view.i >= view.slides.length - 1) { if (cur) cur.style.width = '100%'; return; }
    void cur.offsetWidth; cur.style.animation = `wnseg ${AUTO_MS}ms linear forwards`; view.timer = setTimeout(() => next(), AUTO_MS);
  }
  function stopTimer() { clearTimeout(view.timer); view.timer = null; }
  const pauseTimer = on => { const cur = document.querySelectorAll('#wn-segs i')[view.i]; if (!cur) return; if (on) { stopTimer(); cur.style.animationPlayState = 'paused'; view.paused = true; } else if (view.paused) { view.paused = false; startTimer(); } };
  function next() { if (view.i < view.slides.length - 1) showSlide(view.i + 1, 1); else stopTimer(); }
  function prev() { if (view.i > 0) showSlide(view.i - 1, -1); else startTimer(); }
  function closeReview() { stopTimer(); const v = $('wn-viewer'); if (v) v.classList.remove('open'); document.body.classList.remove('wn-lock'); view.slides.forEach(s => URL.revokeObjectURL(s.url)); view.slides = []; }
  function paintViewer(first) {
    const n = SLIDES.length;
    if (first || !$('wn-segs').children.length) $('wn-segs').innerHTML = Array.from({ length: n }, () => '<span><i></i></span>').join('');
    document.querySelectorAll('.wn-fmt button').forEach(b => b.classList.toggle('on', b.dataset.f === ui.fmt));
    const o = opts(); $('wn-v-money').checked = !!o.showMoney; $('wn-v-names').checked = !!o.showNames; $('wn-v-moneyrow').style.display = brand() === 'clearpath' ? 'none' : '';
  }
  async function shareCurrent(all) {
    const list = all ? view.slides : [view.slides[view.i]]; if (!list[0]) return; stopTimer();
    if (all) { list.forEach((s, k) => setTimeout(() => download(s.blob, s.name), k * 350)); toast(`Saved ${list.length} images`); return; }
    const r = await shareBlob(list[0].blob, list[0].name, captionFor(view.data)); if (r === 'saved') toast('Image saved. Post it anywhere ✓'); else if (r === 'shared') toast('Shared ✓');
  }
  async function setFmt(f) { if (!FORMATS[f] || f === ui.fmt) return; ui.fmt = f; LS.set('yalo_wins_fmt', f); paintViewer(false); await renderSlides(); }
  async function setShare(k, v) { await saveWins({ [k]: !!v }); await renderSlides(); }

  /* ================================================================== SETTINGS for wins */
  async function saveWins(patch) {
    if (!settingsLoaded()) { toast('Settings are still loading. Try again in a moment.', 'var(--red)'); return; }
    const wins = Object.assign({}, WN.optsOf(settings), patch); settings = Object.assign({}, settings, { wins }); try { await window.FB.saveSettings(settings); } catch (e) { toast('Could not save', 'var(--red)'); }
    if (typeof curTab !== 'undefined' && curTab === 'wins') renderWins(true, false, true);
  }
  let saveTimer = null;
  const setNum = (k, el) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveWins({ [k]: Number(el.value) || 0 }), 600); };

  /* ================================================================== WINS SCREEN */
  const badge = (m, size) => {
    const tone = TONES[m.tone] || TONES.indigo, p = Math.round(m.progress * 100);
    return `<div class="wn-badge ${m.done ? 'done' : 'locked'}" style="--s:${size || 84}px;--t1:${tone[0]};--t2:${tone[1]};--p:${p}%"><i></i><b>${m.icon}</b></div>`;
  };
  function countUps(root) {
    root.querySelectorAll('[data-count]').forEach(el => {
      const to = Number(el.dataset.count) || 0, kind = el.dataset.kind, f = v => kind === 'money' ? WN.money(v) : fmtInt(v);
      if (reduced() || to === 0) { el.textContent = f(to); return; }
      const t0 = performance.now(), dur = 750; el.textContent = f(0);
      const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = f(to * e); if (k < 1) requestAnimationFrame(step); else el.textContent = f(to); };
      requestAnimationFrame(step);
    });
  }
  function renderWins(keepScroll, animate, partial) {
    const root = $('tab-wins'); if (!root) return;
    const b = brand(), d = rv(), o = opts(), all = WN.forBrand(ms(), b), won = all.filter(m => m.done).sort((x, y) => y.at - x.at), nxt = WN.nextUp(all);
    const kinds = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
    const money = b !== 'clearpath';
    const maxBar = Math.max(1, ...d.bars.map(x => x.n));
    const hero = money
      ? `<div class="wn-k">Commission earned</div><div class="wn-big" data-count="${Math.round(d.commission)}" data-kind="money">${WN.money(d.commission)}</div>
         <div class="wn-sub">${o.rate}% of ${WN.money(d.yaloClosedValue)} closed${d.yaloDeals ? ` · ${d.yaloDeals} YALO ${d.yaloDeals === 1 ? 'deal' : 'deals'}` : ''}</div>
         ${o.base > 0 ? `<div class="wn-line"><span>Monthly fee</span><b>${WN.money(o.base)}</b></div><div class="wn-line tot"><span>Total this ${ui.kind}</span><b>${WN.money(d.total)}</b></div>` : ''}
         ${d.potentialCommission > 0 ? `<div class="wn-line soft"><span>Still in play (open YALO deals)</span><b>${WN.money(d.potentialCommission)}</b></div>` : ''}`
      : `<div class="wn-k">Creators on board</div><div class="wn-big" data-count="${d.deals}">${d.deals}</div><div class="wn-sub">${d.deals === 1 ? 'creator' : 'creators'} signed ${ui.kind === 'year' ? 'this year' : 'in this ' + ui.kind}</div>`;
    const html = `
      <div id="wn-top"><div class="wn-seg" role="tablist">${kinds.map(([k, l]) => `<button class="${ui.kind === k ? 'on' : ''}" onclick="WINS.kind('${k}')">${l}</button>`).join('')}</div>
      <div class="wn-nav"><button aria-label="Earlier" onclick="WINS.step(-1)">‹</button><div><b>${esc(d.range.label)}</b><span>${esc(d.range.sub)}</span></div><button aria-label="Later" onclick="WINS.step(1)" ${ui.offset >= 0 ? 'disabled' : ''}>›</button></div>
      <div class="sf-card wn-hero">${hero}
        <div class="wn-stats">
          <div><b data-count="${d.sent}">${d.sent}</b><span>Sent</span>${delta(d.vs.sent)}</div>
          <div><b data-count="${d.replies}">${d.replies}</b><span>Replies</span><em>${d.replyRate}%</em></div>
          <div><b data-count="${d.meetings}">${d.meetings}</b><span>Meetings</span></div>
          <div><b data-count="${d.deals}">${d.deals}</b><span>${d.deals === 1 ? 'Deal' : 'Deals'}</span>${d.vs.deals ? delta(d.vs.deals, '') : ''}</div>
        </div>
        <div class="wn-bars" aria-hidden="true">${d.bars.map((x, k) => `<i class="${x.n ? '' : 'z'}" style="--h:${Math.max(4, Math.round(x.n / maxBar * 100))}%;--d:${Math.min(k, 30) * 14}ms" title="${esc(x.label)}: ${x.n}"></i>`).join('')}</div>
        <button class="btn btn-g wn-share" ${d.empty ? 'disabled' : ''} onclick="WINS.review()">Share my ${esc(ui.kind === 'week' ? 'week' : ui.kind === 'month' ? d.range.label : d.range.label)}</button>
        ${d.empty ? '<div class="wn-note">Nothing in this period yet. Send an email and it starts filling.</div>' : ''}
      </div>
      ${nxt ? `<div class="sf-card wn-next" onclick="WINS.open('${nxt.id}')">${badge(nxt, 56)}<div class="wn-nx"><span>Next milestone</span><b>${esc(nxt.title)}</b><div class="wn-prog"><i style="width:${Math.round(nxt.progress * 100)}%"></i></div><em>${fmtInt(nxt.actual)} of ${fmtInt(nxt.target)}</em></div></div>` : ''}
      </div><div class="wn-h">Milestones <span>${won.length} of ${all.length}</span></div>
      <div class="wn-grid">${(() => { const list = [...won, ...all.filter(m => !m.done).sort((x, y) => y.progress - x.progress)]; return ui.allStickers ? list : list.slice(0, Math.max(6, won.length + 3)); })().map((m, k) => `<button class="wn-cell ${m.done ? 'done' : ''}" style="--i:${Math.min(k, 14)}" onclick="WINS.open('${m.id}')">${badge(m)}<b>${esc(m.title)}</b><span>${m.done ? shortDate(m.at) : fmtInt(m.actual) + ' / ' + fmtInt(m.target)}</span></button>`).join('')}</div>
      ${all.length > Math.max(6, won.length + 3) ? `<button class="btn btn-ghost wn-all" onclick="WINS.toggleAll()">${ui.allStickers ? 'Show fewer' : `Show all ${all.length} milestones`}</button>` : ''}
      <details class="wn-set"><summary>Commission and sharing</summary>
        <div class="wn-row"><label>YALO commission, % of each closed deal</label><input class="fi" type="number" min="0" max="100" step="0.1" value="${o.rate}" oninput="WINS.num('rate',this)"></div>
        <div class="wn-row"><label>Monthly fee (₦, optional)</label><input class="fi" type="number" min="0" step="1000" value="${o.base || ''}" placeholder="0" oninput="WINS.num('base',this)"></div>
        <div class="oq-sub">A deal counts in the month you moved it to Closed. Clearpath QR deals do not earn this commission.</div>
        <label class="wn-chk"><input type="checkbox" ${o.showMoney ? 'checked' : ''} onchange="WINS.share('showMoney',this.checked)"> Show ₦ amounts on shared images</label>
        <label class="wn-chk"><input type="checkbox" ${o.showNames ? 'checked' : ''} onchange="WINS.share('showNames',this.checked)"> Show client and creator names on shared images</label>
        <div class="oq-sub">Both are off by default, so a post never leaks a deal size or a client by accident.</div>
      </details>`;
    if (partial && $('wn-top')) { const t = document.createElement('div'); t.innerHTML = html; $('wn-top').innerHTML = t.querySelector('#wn-top').innerHTML; return; }
    root.innerHTML = html;
    if (animate) { root.querySelector('.wn-hero').classList.add('wn-in'); countUps(root); }
    if (!keepScroll) window.scrollTo({ top: 0 });
  }

  /* ================================================================== CELEBRATION / single sticker */
  let confettiOn = false;
  function confetti(x, y) {
    if (reduced() || confettiOn) return; confettiOn = true;
    const cv = $('wn-confetti'), c = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.display = 'block'; c.scale(dpr, dpr);
    const cols = ['#a5b4fc', '#c4b5fd', '#5eead4', '#fde68a', '#fdba74', '#f9a8d4'], P = Array.from({ length: 90 }, () => { const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 6 + Math.random() * 11; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, col: cols[(Math.random() * cols.length) | 0], life: 0 }; });
    const t0 = performance.now(); (function frame(t) {
      const k = (t - t0) / 1900; c.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += .32; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.rot += p.vr; c.save(); c.globalAlpha = Math.max(0, 1 - k * k); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); c.restore(); });
      if (k < 1) requestAnimationFrame(frame); else { cv.style.display = 'none'; confettiOn = false; }
    })(t0);
  }
  let popOpen = false;
  function openSticker(id, celebrate) {
    ensureDom(); const m = (typeof id === 'string' ? ms().find(x => x.id === id) : id); if (!m) return;
    if (!m.done && !celebrate) { toast(`${m.title}: ${fmtInt(m.actual)} of ${fmtInt(m.target)}`); return; }
    popOpen = true; const pop = $('wn-pop'); pop.dataset.id = m.id;
    pop.querySelector('.wn-pop-card').innerHTML = `<div class="wn-pop-k">${celebrate ? 'Milestone unlocked' : m.done ? 'Milestone' : 'In progress'}</div>${badge(m, 150)}<h3>${esc(m.title)}</h3><p>${esc(m.sub)}</p>
      <div class="wn-pop-meta">${m.done && m.at ? esc(longDate(m.at)) : ''}${m.done && m.company && opts().showNames ? ' · ' + esc(m.company) : ''}</div>
      <div class="wn-pop-fmt">${Object.keys(FORMATS).map(f => `<button class="${ui.fmt === f ? 'on' : ''}" onclick="WINS.popFmt('${f}')">${FORMATS[f].label}</button>`).join('')}</div>
      <div class="oq-acts"><button class="btn btn-g" style="min-height:48px;flex:1" onclick="WINS.shareSticker()">Share this</button><button class="btn btn-ghost" style="min-height:48px" onclick="WINS.popClose()">${celebrate ? 'Nice' : 'Close'}</button></div>`;
    pop.classList.add('open');
    if (celebrate) setTimeout(() => { const r = pop.querySelector('.wn-badge').getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2); if (navigator.vibrate) try { navigator.vibrate([12, 40, 18]); } catch (e) { } }, reduced() ? 0 : 380);
  }
  function popClose() { const p = $('wn-pop'); if (p) p.classList.remove('open'); popOpen = false; }
  async function shareSticker() { const id = $('wn-pop').dataset.id, m = ms().find(x => x.id === id); if (!m) return; const img = await stickerImage(m, ui.fmt); const r = await shareBlob(img.blob, img.name, `${m.title}${m.at ? ' · ' + longDate(m.at) : ''}`); URL.revokeObjectURL(img.url); if (r === 'saved') toast('Image saved. Post it anywhere ✓'); }

  // New wins only: won in the last two days and not seen on this phone yet. (Old wins never pop up, so a slow load cannot cause a false party.)
  let checkTimer = null;
  function checkNewWins() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      try {
        if (window.__WINS_NO_POP || !document.body.classList.contains('authed') || document.visibilityState !== 'visible') return;
        // never interrupt Send mode, a sheet or the review: try again in a few seconds
        if (document.querySelector('.cmo.open,.mo.open,.sheet-ov.open,.wn-viewer.open')) { checkNewWins(); return; }
        let seen = []; try { seen = JSON.parse(LS.get('yalo_wins_seen') || '[]'); } catch (e) { }
        const fresh = WN.fresh(ms(), nowFn(), 48).filter(m => !seen.includes(m.id)); if (!fresh.length) return;
        LS.set('yalo_wins_seen', JSON.stringify(seen.concat(fresh.map(m => m.id)).slice(-200)));
        // one popup for the biggest win (gold first, then the newest); the rest wait in Wins
        const rank = { gold: 4, violet: 3, teal: 2, orange: 1, indigo: 0 }; fresh.sort((a, b) => (rank[b.tone] - rank[a.tone]) || (b.at - a.at));
        if (!popOpen) { openSticker(fresh[0], true); if (fresh.length > 1) setTimeout(() => toast(`${fresh.length - 1} more milestone${fresh.length > 2 ? 's' : ''} unlocked. See them in Wins`), 2600); }
      } catch (e) { console.warn('wins check', e); }
    }, 2500);
  }

  /* ================================================================== HOME CARD */
  function homeCard() {
    const tab = $('tab-dashboard'); if (!tab) return;
    let box = $('wn-home'); if (!box) { box = document.createElement('div'); box.id = 'wn-home'; tab.appendChild(box); }
    const b = brand(), all = WN.forBrand(ms(), b), last = all.filter(m => m.done).sort((x, y) => y.at - x.at)[0], nxt = WN.nextUp(all), month = rv({ kind: 'month', offset: 0 });
    const m = last && nowFn() - last.at < 14 * 86400000 ? last : nxt || last; if (!m) { box.innerHTML = ''; return; }
    const right = b !== 'clearpath' && month.commission > 0 ? `<div class="wn-hr"><b>${WN.money(month.commission)}</b><span>commission, ${esc(month.range.label)}</span></div>` : `<div class="wn-hr"><b>${month.sent}</b><span>sent, ${esc(month.range.label)}</span></div>`;
    box.innerHTML = `<div class="sf-card wn-home" onclick="showTab('wins')">${badge(m, 48)}<div class="wn-hm"><span>${m.done ? 'Latest win' : 'Next milestone'}</span><b>${esc(m.title)}</b>${m.done ? '' : `<em>${fmtInt(m.actual)} of ${fmtInt(m.target)}</em>`}</div>${right}<i class="wn-chev">›</i></div>`;
  }

  /* ================================================================== DOM + styles */
  let built = false;
  function ensureDom() {
    if (built && $('wn-viewer')) return;
    const v = document.createElement('div'); v.id = 'wn-viewer'; v.className = 'wn-viewer';
    v.innerHTML = `<div class="wn-v-top"><div class="wn-segs" id="wn-segs"></div><button class="wn-x" aria-label="Close" onclick="WINS.closeReview()">✕</button></div>
      <div class="wn-v-stage" id="wn-stage"><img id="wn-v-img" alt="Your review"><div class="wn-tap l" onclick="WINS.prev()"></div><div class="wn-tap r" onclick="WINS.next()"></div></div>
      <div class="wn-v-bar"><div class="wn-fmt">${Object.keys(FORMATS).map(f => `<button data-f="${f}" onclick="WINS.fmt('${f}')">${FORMATS[f].label}</button>`).join('')}</div>
        <div class="wn-v-opts"><label id="wn-v-moneyrow"><input type="checkbox" id="wn-v-money" onchange="WINS.share('showMoney',this.checked,true)"> Show ₦</label><label><input type="checkbox" id="wn-v-names" onchange="WINS.share('showNames',this.checked,true)"> Show names</label></div>
        <div class="oq-acts"><button class="btn btn-g" style="min-height:50px;flex:1" onclick="WINS.shareNow()">Share</button><button class="btn btn-ghost" style="min-height:50px" onclick="WINS.saveAll()">Save all</button></div></div>`;
    document.body.appendChild(v);
    const st = $('wn-stage'); ['pointerdown'].forEach(e => st.addEventListener(e, () => pauseTimer(true))); ['pointerup', 'pointercancel', 'pointerleave'].forEach(e => st.addEventListener(e, () => pauseTimer(false)));
    let sx = null; st.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true }); st.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) dx < 0 ? next() : prev(); });
    document.addEventListener('keydown', e => { if (!v.classList.contains('open')) return; if (e.key === 'Escape') closeReview(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); });
    const pop = document.createElement('div'); pop.id = 'wn-pop'; pop.className = 'wn-pop'; pop.innerHTML = '<div class="wn-pop-card"></div>'; pop.addEventListener('click', e => { if (e.target === pop) popClose(); }); document.body.appendChild(pop);
    const cf = document.createElement('canvas'); cf.id = 'wn-confetti'; cf.className = 'wn-confetti'; document.body.appendChild(cf);
    built = true;
  }
  const CSS = `
  #tab-wins{max-width:820px;margin-left:auto;margin-right:auto;width:100%}
  .wn-seg{display:flex;gap:0;padding:2px;background:rgba(118,118,128,.12);border-radius:10px;max-width:360px;margin:0 auto 12px}
  .wn-seg button{flex:1;border:none;background:transparent;border-radius:8px;min-height:32px;font-size:13px;font-weight:500;color:var(--text);cursor:pointer;transition:background .25s,box-shadow .25s}
  .wn-seg button.on{background:#fff;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.14)}
  .wn-nav{display:flex;align-items:center;justify-content:space-between;margin:2px 0 12px}
  .wn-nav div{text-align:center}.wn-nav b{display:block;font-size:24px;letter-spacing:-.02em}.wn-nav span{font-size:13px;color:var(--muted)}
  .wn-nav button{width:44px;height:44px;border:none;background:transparent;font-size:30px;color:var(--g);cursor:pointer;border-radius:50%}.wn-nav button:disabled{opacity:.25}
  .wn-hero{padding:20px 18px 18px!important}
  .wn-k{font-size:13px;color:var(--muted);font-weight:600}
  .wn-big{font-size:54px;font-weight:800;letter-spacing:-.035em;line-height:1.05;margin:2px 0 2px;font-variant-numeric:tabular-nums}
  .wn-sub{font-size:14px;color:var(--muted);margin-bottom:6px}
  .wn-line{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;border-top:.5px solid var(--border)}.wn-line.tot b{font-size:16px}.wn-line.soft{color:var(--muted)}
  .wn-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:14px 0 4px;padding-top:14px;border-top:.5px solid var(--border)}
  .wn-stats>div{min-width:0}.wn-stats b{display:block;font-size:24px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.wn-stats span{font-size:12px;color:var(--muted)}.wn-stats em{display:block;font-style:normal;font-size:11px;color:var(--muted)}
  .wn-dl{display:inline-block;margin-left:4px;font-size:11px;font-weight:700}.wn-dl.up{color:#16a34a}.wn-dl.down{color:#dc2626}.wn-dl.new{color:var(--muted);font-weight:600}
  .wn-bars{display:flex;align-items:flex-end;gap:3px;height:56px;margin:14px 0 14px}
  .wn-bars i.z{background:rgba(118,118,128,.22)}
  .wn-v-bar .btn-ghost{background:rgba(255,255,255,.14);color:#fff}
  .wn-bars i{flex:1;height:var(--h);min-height:3px;border-radius:3px;background:linear-gradient(var(--g),#8b5cf6);opacity:.9;transform-origin:bottom}
  .wn-in .wn-bars i{animation:wnbar .55s cubic-bezier(.22,1,.36,1) both;animation-delay:var(--d)}
  @keyframes wnbar{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:.9}}
  .wn-share{width:100%;min-height:50px;font-size:15px}.wn-note{font-size:12px;color:var(--muted);margin-top:8px;text-align:center}
  .wn-next{display:flex;gap:14px;align-items:center;cursor:pointer;padding:14px 16px!important}
  .wn-nx{flex:1;min-width:0}.wn-nx span{font-size:12px;color:var(--muted);font-weight:600}.wn-nx b{display:block;font-size:16px}.wn-nx em{font-style:normal;font-size:12px;color:var(--muted)}
  .wn-prog{height:4px;border-radius:2px;background:rgba(118,118,128,.16);margin:6px 0 4px;overflow:hidden}.wn-prog i{display:block;height:100%;background:var(--g);border-radius:2px;transition:width .8s cubic-bezier(.22,1,.36,1)}
  .wn-h{display:flex;justify-content:space-between;align-items:baseline;font-size:20px;font-weight:700;letter-spacing:-.02em;margin:18px 2px 10px}.wn-h span{font-size:13px;font-weight:500;color:var(--muted)}
  .wn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  @media(min-width:700px){.wn-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
  .wn-cell{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px 12px;background:#fff;border:none;border-radius:16px;cursor:pointer;font-family:inherit;color:var(--text);text-align:center;min-width:0}
  .wn-cell b{font-size:12.5px;line-height:1.25;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.wn-cell span{font-size:11px;color:var(--muted)}
  .wn-cell:not(.done) b{color:var(--muted)}
  .wn-badge{--s:84px;width:var(--s);height:var(--s);border-radius:50%;position:relative;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,var(--t1),var(--t2));box-shadow:0 6px 18px color-mix(in srgb,var(--t2) 38%,transparent)}
  .wn-badge i{position:absolute;inset:7%;border-radius:50%;background:linear-gradient(#232043,#0b0a1f)}
  .wn-badge i::after{content:"";position:absolute;inset:0;border-radius:50%;background:linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,0) 52%)}
  .wn-badge b{position:relative;font-size:calc(var(--s) * .44);line-height:1}
  .wn-badge.locked{background:conic-gradient(var(--t1) var(--p),rgba(118,118,128,.28) 0);box-shadow:none}.wn-badge.locked i{background:linear-gradient(#2b2f3a,#171a22)}.wn-badge.locked b{opacity:.32;filter:grayscale(1)}
  .wn-all{width:100%;margin-top:10px;min-height:44px}
  .wn-set{margin:16px 0 8px;background:#fff;border-radius:16px;padding:0 16px}.wn-set summary{list-style:none;cursor:pointer;padding:14px 0;color:var(--g);font-weight:600}.wn-set summary::-webkit-details-marker{display:none}
  .wn-set[open]{padding-bottom:14px}.wn-row{margin:8px 0}.wn-row label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:4px}
  .wn-chk{display:flex;gap:10px;align-items:center;padding:8px 0;font-size:14px}
  .wn-home{display:flex;align-items:center;gap:12px;cursor:pointer;padding:12px 14px!important;margin-bottom:14px}
  .wn-hm{flex:1;min-width:0}.wn-hm span{font-size:12px;color:var(--muted);font-weight:600}.wn-hm b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wn-hm em{font-style:normal;font-size:12px;color:var(--muted)}
  .wn-hr{text-align:right}.wn-hr b{display:block;font-size:16px;font-variant-numeric:tabular-nums}.wn-hr span{font-size:11px;color:var(--muted)}.wn-chev{font-style:normal;font-size:22px;color:var(--muted)}

  .wn-lock{overflow:hidden}
  .wn-viewer{position:fixed;inset:0;z-index:600;background:#07070f;display:flex;flex-direction:column;opacity:0;pointer-events:none;transform:translateY(24px);transition:opacity .32s cubic-bezier(.22,1,.36,1),transform .32s cubic-bezier(.22,1,.36,1)}
  .wn-viewer.open{opacity:1;pointer-events:auto;transform:none}
  .wn-v-top{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 12px) 14px 8px}
  .wn-segs{flex:1;display:flex;gap:5px}.wn-segs span{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.22);overflow:hidden}.wn-segs i{display:block;height:100%;width:0;background:#fff}
  @keyframes wnseg{from{width:0}to{width:100%}}
  .wn-x{width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;font-size:15px;cursor:pointer}
  .wn-v-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:6px 14px;touch-action:pan-y}
  #wn-v-img{max-width:100%;max-height:100%;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.55);user-select:none;-webkit-user-drag:none;-webkit-touch-callout:none;transition:opacity .2s}
  #wn-v-img.loading{opacity:.15}
  #wn-v-img.in-l{animation:wninl .42s cubic-bezier(.22,1,.36,1)}#wn-v-img.in-r{animation:wninr .42s cubic-bezier(.22,1,.36,1)}
  @keyframes wninl{from{opacity:0;transform:translateX(36px) scale(.985)}to{opacity:1;transform:none}}@keyframes wninr{from{opacity:0;transform:translateX(-36px) scale(.985)}to{opacity:1;transform:none}}
  .wn-tap{position:absolute;top:0;bottom:0;width:40%;z-index:2}.wn-tap.l{left:0}.wn-tap.r{right:0}
  .wn-v-bar{padding:10px 16px calc(env(safe-area-inset-bottom) + 14px);color:#fff}
  .wn-fmt{display:flex;gap:6px;justify-content:center;margin-bottom:8px}.wn-fmt button{border:none;background:rgba(255,255,255,.12);color:#fff;border-radius:16px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .25s,color .25s}.wn-fmt button.on{background:#fff;color:#111}
  .wn-v-opts{display:flex;gap:18px;justify-content:center;font-size:13px;margin-bottom:10px;color:rgba(255,255,255,.85)}.wn-v-opts label{display:flex;gap:6px;align-items:center;cursor:pointer}
  .wn-pop{position:fixed;inset:0;z-index:650;background:rgba(0,0,0,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .3s}
  .wn-pop.open{opacity:1;pointer-events:auto}
  .wn-pop-card{width:100%;max-width:440px;background:#fff;border-radius:24px 24px 0 0;padding:24px 22px calc(env(safe-area-inset-bottom) + 22px);text-align:center;transform:translateY(60px);transition:transform .5s cubic-bezier(.22,1.2,.36,1)}
  .wn-pop.open .wn-pop-card{transform:none}
  @media(min-width:600px){.wn-pop{align-items:center}.wn-pop-card{border-radius:24px}}
  .wn-pop-k{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
  .wn-pop .wn-badge{margin:0 auto 14px}.wn-pop.open .wn-badge.done{animation:wnpop .7s cubic-bezier(.22,1.3,.36,1) .12s both}
  @keyframes wnpop{from{transform:scale(.4) rotate(-14deg);opacity:0}to{transform:none;opacity:1}}
  .wn-pop h3{font-size:24px;letter-spacing:-.02em;margin:0 0 4px}.wn-pop p{color:var(--muted);font-size:14px;margin:0 0 6px}.wn-pop-meta{font-size:13px;color:var(--muted);min-height:18px;margin-bottom:12px}
  .wn-pop-fmt{display:flex;gap:6px;justify-content:center;margin-bottom:14px}.wn-pop-fmt button{border:none;background:rgba(118,118,128,.12);border-radius:16px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer}.wn-pop-fmt button.on{background:var(--text);color:#fff}
  .wn-confetti{position:fixed;inset:0;width:100vw;height:100vh;z-index:700;pointer-events:none;display:none}
  @media(prefers-reduced-motion:reduce){.wn-viewer,.wn-pop,.wn-pop-card{transition:none}.wn-in .wn-bars i,.wn-pop.open .wn-badge.done,#wn-v-img.in-l,#wn-v-img.in-r{animation:none}}
  `;

  /* ================================================================== hook into the app */
  window.WINS = {
    kind(k) { ui.kind = k; ui.offset = 0; LS.set('yalo_wins_kind', k); renderWins(true, true); },
    step(n) { ui.offset = Math.min(0, ui.offset + n); renderWins(true, true); },
    review: openReview, closeReview, next, prev, fmt: setFmt, shareNow: () => shareCurrent(false), saveAll: () => shareCurrent(true),
    share(k, v, inViewer) { return inViewer ? setShare(k, v) : saveWins({ [k]: !!v }); }, num: setNum,
    open: id => openSticker(id), popClose, shareSticker, toggleAll() { ui.allStickers = !ui.allStickers; renderWins(true, false); },
    async popFmt(f) { ui.fmt = f; LS.set('yalo_wins_fmt', f); const id = $('wn-pop').dataset.id; document.querySelectorAll('.wn-pop-fmt button').forEach(b => b.classList.toggle('on', b.textContent === FORMATS[f].label)); void id; },
    render: renderWins, milestones: ms, review$: rv
  };
  function setup() {
    const st = document.createElement('style'); st.id = 'wins-css'; st.textContent = CSS; document.head.appendChild(st);
    const anchor = $('tab-tasks') || $('tab-outreach') || $('tab-leads');
    const d = document.createElement('div'); d.className = 'content'; d.id = 'tab-wins'; d.style.display = 'none'; anchor.after(d); if (typeof TABS !== 'undefined' && !TABS.includes('wins')) TABS.push('wins');
    const ni = document.createElement('div'); ni.className = 'ni'; ni.dataset.tab = 'wins'; ni.setAttribute('onclick', "showTab('wins')"); ni.innerHTML = '<span style="font-size:17px">🏆</span><span>Wins</span>';
    const tq = document.querySelector('.ni[data-tab="tasks"]'); (tq || document.querySelector('.ni[data-tab="dashboard"]')).after(ni);
    const grid = document.querySelector('#more-sheet .sheet-grid'); if (grid) { const b = document.createElement('button'); b.className = 'sheet-item'; b.setAttribute('onclick', "moreGo('wins')"); b.innerHTML = '<span>🏆</span>Wins'; grid.prepend(b); }
  }
  function hook() {
    setup();
    const _showTab = window.showTab;
    window.showTab = function (t) { _showTab(t); if (t === 'wins') { $('page-title').textContent = 'Wins'; ui.offset = 0; renderWins(false, true); } };
    const _renderDash = window.renderDash;
    window.renderDash = function () { _renderDash(); try { homeCard(); } catch (e) { console.warn('wins home', e); } };
    const _renderAll = window.renderAll;
    window.renderAll = function () { _renderAll(); try { if (typeof curTab !== 'undefined' && curTab === 'wins' && !document.activeElement.closest('.wn-set')) renderWins(true); checkNewWins(); } catch (e) { console.warn('wins', e); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
