/* YALO CRM: the calm look. Loads last. It restyles the app (white cards on soft grey, one accent colour, system font, line icons)
 * and tidies the busiest screens so each one shows only what you need now. Nothing is removed: the detail is one tap away.
 * Pure presentation: no data, no saving, no network. If this file failed to load, the app would still work, just busier. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CSS = `
  :root{--bg:#f2f2f7;--border:rgba(60,60,67,.14);--shadow:none;--muted:#8e8e93;--text:#1c1c1e;--radius:16px;--hero:var(--g)}
  body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);letter-spacing:-.011em}
  body input,body select,body textarea,body button{font-family:inherit}

  /* surfaces: white on grey, no borders or shadows */
  body .card,body .sf-card,body .cc,body .mc,body .oq-card,body .rem-card,body .sset,body .flist,body .tw{box-shadow:none;border:none;border-radius:16px}
  body .oq-card.od,body .rem-card.overdue{border:1px solid rgba(255,59,48,.35);background:#fff}
  body .rem-card.due{border:1px solid rgba(255,149,0,.4);background:#fff}
  body .mc:hover{transform:none;box-shadow:none}
  body .btn{border-radius:12px;font-weight:600;letter-spacing:0}
  body .btn-g{background:var(--g);box-shadow:none}
  body .btn-g:hover{background:var(--gd);transform:none}
  body .btn-ghost{background:rgba(118,118,128,.12);border:none;color:var(--text)}
  body .btn-ghost:hover{background:rgba(118,118,128,.2)}

  /* top bar */
  body .topbar{background:rgba(242,242,247,.86);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-bottom:none;height:56px}
  body .page-title{font-size:22px;font-weight:700;letter-spacing:-.025em}
  body .bell{border:none;background:transparent;width:38px;height:38px;font-size:19px}
  body .bell:hover{background:rgba(118,118,128,.12);border:none}
  body .tb-actions .btn-g{font-size:0;width:34px;height:34px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
  body .tb-actions .btn-g::before{content:"+";font-size:24px;font-weight:400;line-height:1;margin-top:-2px;color:#fff}

  /* company switch: an iOS segmented control */
  body .brand-bar{max-width:440px;margin:2px 14px 8px;padding:2px;gap:0;background:rgba(118,118,128,.12);border:none;border-radius:10px;overflow:hidden}
  body .bb-btn{max-width:none;min-height:32px;padding:5px 8px;border:none;border-radius:8px;background:transparent;color:var(--text);font-weight:500;font-size:13px}
  body .bb-btn.on{background:#fff!important;color:var(--text)!important;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.14)}

  /* bottom bar */
  body .bottom-nav{background:rgba(249,249,249,.9);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-top:.5px solid rgba(60,60,67,.25);height:calc(56px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom)}
  body .bn-item{color:#8e8e93;font-size:10px;font-weight:500;text-transform:none;letter-spacing:0;gap:2px;padding:6px 2px 4px}
  body .bn-item.active{color:var(--g)}
  body .bn-item span:first-child{font-size:0;line-height:0;display:block}
  body .bn-item svg{width:24px;height:24px;display:block;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  body #bn-scan,body #bn-reminders{display:none!important}
  @media(max-width:768px){body .main{padding-bottom:calc(76px + env(safe-area-inset-bottom))}}

  /* computer: light sidebar */
  body .sidebar{background:#fff;border-right:.5px solid var(--border)}
  body .logo{border-bottom:none}
  body .logo-tag,body .sync-txt{color:var(--muted)}
  body .ni{color:#3c3c43;border-left:none;border-radius:10px;margin:1px 10px;padding:9px 12px}
  body .ni:hover{background:rgba(118,118,128,.1);color:var(--text)}
  body .ni.active{background:rgba(79,91,213,.12);color:var(--g);font-weight:600}
  body .sfooter{border-top:.5px solid var(--border)}


  /* ===== MOTION =====
   * One direction (things rise into place), every move caused by something you did, nothing loops while you wait.
   * Entrances are under half a second and the whole stagger is under 0.4s. No bounce or elastic, only a slight overshoot on sheets. */
  :root{--ease:cubic-bezier(.22,1,.36,1);--spring:cubic-bezier(.22,1.18,.36,1)}
  @keyframes calmIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes calmBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes calmPop{0%{transform:scale(.82)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
  @keyframes calmSheet{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
  .calm-enter>*{animation:calmIn .44s var(--ease) both}
  .calm-enter>*:nth-child(2){animation-delay:40ms}.calm-enter>*:nth-child(3){animation-delay:80ms}.calm-enter>*:nth-child(4){animation-delay:120ms}.calm-enter>*:nth-child(5){animation-delay:160ms}.calm-enter>*:nth-child(6){animation-delay:200ms}.calm-enter>*:nth-child(n+7){animation-delay:240ms}
  .calm-enter .ws-pbar i{transform-origin:left;animation:calmBar .8s var(--ease) .15s both}
  .calm-enter .sf-prog i,.calm-enter .sbar-fill{transform-origin:left;animation:calmBar .8s var(--ease) .2s both}
  body .btn,body .bn-item,body .sf-row,body .oq-card,body .rem-card,body .sheet-item,body .ni,body .bb-btn,body .wn-cell,body .wn-home,body .wn-next,body .hero-btn{transition:transform .22s var(--ease),background-color .25s,opacity .2s,box-shadow .25s}
  body .btn:active,body .sheet-item:active,body .bb-btn:active{transform:scale(.97)}
  body .bn-item:active{transform:scale(.9)}
  body .sf-row:active,body .oq-card:active,body .wn-cell:active,body .wn-home:active,body .wn-next:active,body #table-view tr:active{transform:scale(.985)}
  body .bn-item.active svg{animation:calmPop .4s var(--ease)}
  body .sheet-ov.open .sheet{animation:calmSheet .46s var(--spring)}
  body .cmo.open .cm{animation:calmSheet .46s var(--spring)}
  body .cmo{transition:opacity .3s var(--ease)}body .cm{transition:transform .46s var(--spring)}
  body details[open]>*:not(summary){animation:calmIn .36s var(--ease)}
  body .toast{pointer-events:none;left:50%;right:auto;bottom:calc(76px + env(safe-area-inset-bottom));max-width:min(92vw,440px);text-align:center;border-radius:14px;border-left:none;background:rgba(28,28,30,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);transform:translate(-50%,24px) scale(.96);transition:transform .45s var(--spring),opacity .25s var(--ease)}
  body .toast.show{transform:translate(-50%,0) scale(1)}
  @media(min-width:769px){body .toast{bottom:28px}}
  .calm-tick{font-variant-numeric:tabular-nums}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}

  /* HOME */
  #tab-dashboard .hero,#tab-dashboard .qa-grid,#tab-dashboard #metrics,#tab-dashboard #today-wrap{display:none!important}
  body #tab-dashboard{max-width:820px;width:100%;margin-left:auto;margin-right:auto}
  #calm-head{padding:4px 2px 14px}
  #calm-head .calm-date{font-size:13px;color:var(--muted);font-weight:500}
  #calm-head .calm-hello{font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.15;margin-top:2px}
  #calm-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#fff;border-radius:16px;margin-bottom:14px}
  #calm-stats>div{padding:14px 14px;min-width:0;border-right:.5px solid var(--border)}
  #calm-stats>div:last-child{border-right:none}
  #calm-stats b{display:block;font-size:20px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #calm-stats span{font-size:12px;color:var(--muted)}
  #tab-dashboard .sf-card{padding:16px;margin-bottom:14px}
  #tab-dashboard .sf-card h4{font-size:13px;font-weight:600;color:var(--muted);margin:0 0 6px}
  #ws-home-plan .sf-card h4{font-size:15px;color:var(--text);font-weight:600}
  body .ws-pbar{height:4px;margin:10px 0 12px;background:rgba(118,118,128,.16)}
  body .ws-batches{gap:0;margin:0 0 12px}
  body .ws-batch{border:none;background:none;padding:0;font-size:12px;color:var(--muted)}
  body .ws-batch b{font-size:15px;font-weight:600}
  body .ws-batch.now{background:none}body .ws-batch.now,body .ws-batch.now b{color:var(--g)}
  #ws-home-plan .btn-g,#sf-plan-slot .btn-g{min-height:48px;border-radius:12px;font-size:15px}
  #sf-next .sf-row{align-items:center;padding:12px 0}
  #sf-next .sf-row:nth-child(n+5){display:none}
  body .sf-chip{background:transparent!important;padding:0;width:58px;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--muted)}
  body .sf-chip.reply,body .sf-chip.call{color:#ff3b30}body .sf-chip.send{color:#ff9500}
  body .sf-name{font-size:15px;font-weight:600}
  body .sf-why{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  body .sf-txt{min-width:0;flex:1}
  body .sf-num{background:rgba(118,118,128,.08)}

  details.calm-more>summary,details.calm-warns>summary{list-style:none;cursor:pointer}
  details.calm-more>summary::-webkit-details-marker,details.calm-warns>summary::-webkit-details-marker{display:none}
  details.calm-more>summary{display:flex;align-items:center;justify-content:space-between;padding:14px 4px;color:var(--g);font-weight:600;font-size:15px}
  details.calm-more>summary::after{content:"›";font-size:22px;line-height:1;transform:rotate(90deg);transition:transform .2s}
  details.calm-more[open]>summary::after{transform:rotate(-90deg)}
  details.calm-more .charts-row,details.calm-more .bot-row{margin-bottom:14px}
  details.calm-warns{margin:6px 0 10px}
  details.calm-warns>summary{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#b25e00;font-weight:600}
  details.calm-warns>summary::before{content:"!";width:16px;height:16px;border-radius:50%;background:#ff9500;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
  body details.calm-warns .oq-warn{background:none;padding:6px 0 0;margin:0;color:#6b4a00;font-size:13px;border-radius:0}

  /* QUEUE */
  body .oq-strip{display:flex;flex-wrap:wrap;gap:2px 14px;margin:0 0 12px;padding:0 2px}
  body .oq-stat{background:none;border:none;padding:0;display:flex;gap:5px;align-items:baseline;white-space:nowrap;border-radius:0}
  body .oq-stat b{display:inline;font-size:14px}
  body .oq-stat span{text-transform:none;letter-spacing:0;font-size:13px;font-weight:500}
  body .oq-h{font-size:13px;font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted);margin:16px 2px 8px}
  body .oq-prev,body .oq-ver{display:none}
  body .oq-tag{border-radius:8px}

  /* LEADS on a phone: name, stage, contact, value */
  @media(max-width:768px){
    body #table-view tr{border:none;box-shadow:none;border-radius:16px;padding:14px 16px;cursor:pointer;row-gap:3px}
    body #table-view td:nth-child(2),body #table-view td:nth-child(5),body #table-view td:nth-child(7),body #table-view td:nth-child(8){display:none!important}
    body #table-view td:nth-child(3){grid-column:1;grid-row:2;font-size:13px}
    body #table-view td:nth-child(3) div:nth-child(2){display:none}
    body #table-view td:nth-child(6){grid-column:2;grid-row:2;justify-self:end;font-size:15px;color:var(--text)}
  }
  body .badge{border-radius:8px}
  body[data-tab="dashboard"] .page-title{visibility:hidden}
  body .bell svg{width:22px;height:22px;fill:none;stroke:var(--text);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  #sf-next .sf-row:nth-child(4){border-bottom:none}
  `;

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v10h4.5v-6h4v6h4.5V10"/></svg>',
    leads: '<svg viewBox="0 0 24 24"><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21M14 9.5h4.5A1.5 1.5 0 0 1 20 11v10M2.5 21h19M8 8h2M8 12h2M8 16h2"/></svg>',
    outreach: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/></svg>',
    tasks: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/></svg>',
    more: '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>'
  };
  function icons() {
    Object.keys(ICONS).forEach(k => { const b = $('bn-' + k), s = b && b.querySelector('span'); if (s && s.dataset.calm !== '1') { s.innerHTML = ICONS[k]; s.dataset.calm = '1'; } });
    const add = document.querySelector('.tb-actions .btn-g'); if (add) add.setAttribute('aria-label', 'Add lead');
    const bell = $('bell-btn');
    if (bell) { bell.setAttribute('aria-label', 'Notifications'); if (!bell.querySelector('svg')) { const t = bell.firstChild; if (t && t.nodeType === 3) t.textContent = ''; bell.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9zM10 19a2 2 0 0 0 4 0"/></svg>'); } }
  }

  function groupWarns() {
    ['ws-home-plan', 'sf-plan-slot'].forEach(id => {
      const root = $(id); if (!root) return;
      const ws = [...root.querySelectorAll('.oq-warn')].filter(w => !w.closest('.calm-warns')); if (!ws.length) return;
      const byParent = new Map(); ws.forEach(w => { if (!byParent.has(w.parentNode)) byParent.set(w.parentNode, []); byParent.get(w.parentNode).push(w); });
      byParent.forEach(arr => {
        const d = document.createElement('details'); d.className = 'calm-warns';
        const s = document.createElement('summary'); s.textContent = arr.length + (arr.length > 1 ? ' heads-ups' : ' heads-up'); d.appendChild(s);
        arr[0].before(d); arr.forEach(w => d.appendChild(w));
      });
    });
  }

  function homeLayout() {
    const tab = $('tab-dashboard'); if (!tab) return;
    let head = $('calm-head'); if (!head) { head = document.createElement('div'); head.id = 'calm-head'; tab.prepend(head); }
    const name = ($('hero-greet-name') || {}).textContent || '', first = name.trim().split(/\s+/)[0] || '';
    const greet = (($('hero-greet-time') || {}).textContent || 'Hello').replace(/[,\s]+$/, '');
    head.innerHTML = `<div class="calm-date">${esc(new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }))}</div><div class="calm-hello">${esc(greet)}${first && first !== 'YALO' ? ', ' + esc(first) : ''}</div>`;

    const sub = ($('hero-sub') || {}).textContent || '', m = /(\d+)\s+leads?\s*·\s*(\d+)\s+active/.exec(sub);
    const likely = document.querySelector('#sf-dash .sf-num b');
    let stats = $('calm-stats'); if (!stats) { stats = document.createElement('div'); stats.id = 'calm-stats'; }
    stats.innerHTML = `<div><b>${esc(($('hero-pipeline') || {}).textContent || '—')}</b><span>Pipeline</span></div><div><b>${m ? m[2] : '—'}</b><span>Active deals</span></div><div><b>${esc(likely ? likely.textContent : '—')}</b><span>Likely to close</span></div>`;

    let more = $('calm-more');
    if (!more) {
      more = document.createElement('details'); more.id = 'calm-more'; more.className = 'calm-more';
      more.innerHTML = '<summary>Forecast, charts and activity</summary>';
      more.addEventListener('toggle', () => { if (more.open) setTimeout(() => { try { if (typeof actChart !== 'undefined' && actChart) actChart.resize(); if (typeof srcChart !== 'undefined' && srcChart) srcChart.resize(); } catch (e) { } }, 60); });
    }
    const lb = $('leaderboard'), lbCard = lb && lb.closest('.card');
    [$('sf-dash'), $('oq-dash-strip'), tab.querySelector('.charts-row'), tab.querySelector('.bot-row'), lbCard].forEach(n => { if (n && n.parentNode !== more) more.appendChild(n); });
    [head, stats, $('ws-home-plan'), $('sf-next'), $('wn-home'), more].forEach(n => { if (n && n.parentNode === tab && n === tab.lastElementChild) return; if (n) tab.appendChild(n); });
  }

  // tap anywhere on a lead card (not only its name)
  document.addEventListener('click', e => {
    const tr = e.target.closest && e.target.closest('#table-view tr'); if (!tr || e.target.closest('button,a,input,select')) return;
    const n = tr.querySelector('.co-name'), mm = n && /openLead\('([^']+)'\)/.exec(n.getAttribute('onclick') || '');
    if (mm && typeof window.openLead === 'function') window.openLead(mm[1]);
  });


  // numbers count up when a screen is entered (once, from the screen change, not on every refresh)
  function tick(el) {
    if (!el || el.dataset.ticked === el.textContent) return; const txt = el.textContent, m = /(\d[\d,]*\.?\d*)/.exec(txt); if (!m) return;
    const to = parseFloat(m[1].replace(/,/g, '')), dec = (m[1].split('.')[1] || '').length, pre = txt.slice(0, m.index), post = txt.slice(m.index + m[1].length);
    if (!isFinite(to) || to === 0 || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    el.classList.add('calm-tick'); const t0 = performance.now(), dur = 700;
    (function step(t) { const k = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + post; if (k < 1) requestAnimationFrame(step); else { el.textContent = txt; el.dataset.ticked = txt; } })(t0);
  }
  let enterTimer = null;
  function enter(t) {
    const el = $('tab-' + t); if (!el) return; el.classList.remove('calm-enter'); void el.offsetWidth; el.classList.add('calm-enter');
    clearTimeout(enterTimer); enterTimer = setTimeout(() => el.classList.remove('calm-enter'), 900);
    if (t === 'dashboard') el.querySelectorAll('#calm-stats b').forEach(b => { delete b.dataset.ticked; tick(b); });
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.oq-go'); if (b && navigator.vibrate) { try { navigator.vibrate(10); } catch (x) { } } });

  function hook() {
    const st = document.createElement('style'); st.id = 'calm-css'; st.textContent = CSS; document.head.appendChild(st);
    icons();
    const _showTab = window.showTab;
    window.showTab = function (t) { document.body.dataset.tab = t; _showTab(t); enter(t); };
    document.body.dataset.tab = (typeof curTab !== 'undefined' && curTab) || 'dashboard';
    const _renderDash = window.renderDash;
    window.renderDash = function () { _renderDash(); try { homeLayout(); icons(); groupWarns(); } catch (e) { console.warn('calm home', e); } };
    let queued = false;
    const root = document.querySelector('.main') || document.body;
    new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try { groupWarns(); icons(); } catch (e) { } }); }).observe(root, { childList: true, subtree: true });
    try { if (typeof curTab !== 'undefined' && curTab === 'dashboard' && $('hero-greet-name')) { homeLayout(); groupWarns(); } } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
