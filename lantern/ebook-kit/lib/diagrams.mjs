// Diagram generator for The Lantern Hours. Each diagram returns inline SVG (viewBox 440 wide).
const C = { paper:'#fbf6ee', ink:'#2b2433', soft:'#6b6275', rose:'#b4627a', gold:'#b98d45', dusk:'#3a3f6b', mist:'#e9e2ee', line:'#cfc6d6', teal:'#4f7f86', cream:'#f3ead9' };
const W = 440;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const T = (x, y, s, o = {}) => {
  const { size = 11, anchor = 'start', fill = C.ink, weight = 400, italic = false, font = 'EBG' } = o;
  const fam = font === 'C' ? "Cormorant, 'EB Garamond', Georgia, serif" : font === 'H' ? "Hand, cursive" : font === 'S' ? "Sans, Arial, sans-serif" : "EBG, Georgia, serif";
  return `<text x="${x}" y="${y}" font-family="${fam}" font-size="${size}" font-weight="${weight}" ${italic ? 'font-style="italic"' : ''} fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
};
const lines = (x, y, arr, o = {}, lh = 1.28) => arr.map((s, i) => T(x, y + i * (o.size || 11) * lh, s, o)).join('');
const wrap = (s, n) => { const w = String(s).split(/\s+/); const out = []; let l = ''; for (const x of w) { if ((l + ' ' + x).trim().length > n) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); } if (l) out.push(l); return out; };
const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 8}" fill="${o.fill || C.paper}" stroke="${o.stroke || C.line}" stroke-width="${o.sw || 1}" ${o.dash ? 'stroke-dasharray="4 3"' : ''}/>`;
const arrow = (x1, y1, x2, y2, col = C.gold) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.4" marker-end="url(#ah)"/>`;
const svg = (h, inner, label) => `<svg class="dg" viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.gold}"/></marker><radialGradient id="glow"><stop offset="0%" stop-color="${C.gold}" stop-opacity=".55"/><stop offset="100%" stop-color="${C.gold}" stop-opacity="0"/></radialGradient></defs>${inner}</svg>`;

// ---------- generic helpers ----------
function flow(nodes, { accent = C.dusk, top = 8, nodeH = 50, gap = 20, numbered = true } = {}) {
  let y = top, out = '';
  nodes.forEach((n, i) => {
    out += R(30, y, W - 60, nodeH, { fill: i % 2 ? C.cream : C.mist, stroke: C.line });
    if (numbered) out += `<circle cx="54" cy="${y + nodeH / 2}" r="12" fill="${accent}"/>` + T(54, y + nodeH / 2 + 4, i + 1, { size: 12, anchor: 'middle', fill: '#fff', font: 'S' });
    out += T(78, y + (n.s ? 21 : 29), n.t, { size: 14.5, font: 'C', italic: true, weight: 500, fill: accent });
    if (n.s) out += T(78, y + 38, n.s, { size: 10.5, fill: C.soft });
    if (n.tag) out += T(W - 40, y + nodeH / 2 + 3, n.tag, { size: 9.5, anchor: 'end', fill: C.rose, font: 'S' });
    if (i < nodes.length - 1) out += arrow(W / 2, y + nodeH, W / 2, y + nodeH + gap - 2);
    y += nodeH + gap;
  });
  return { h: y - gap + top, out };
}
function funnel(stages, { top = 8, rowH = 46, gap = 4, accent = C.dusk } = {}) {
  let out = '', y = top; const n = stages.length;
  stages.forEach((s, i) => {
    const w1 = 380 - i * (260 / n), w2 = 380 - (i + 1) * (260 / n);
    const x1 = (W - w1) / 2, x2 = (W - w2) / 2;
    const col = [C.dusk, '#4a4f80', '#6a5f91', C.rose, '#c98a6a', C.gold][i % 6];
    out += `<path d="M${x1} ${y} L${x1 + w1} ${y} L${x2 + w2} ${y + rowH} L${x2} ${y + rowH} Z" fill="${col}" opacity=".92"/>`;
    out += T(W / 2, y + (s.s ? 20 : 28), s.t, { size: 14, anchor: 'middle', fill: '#fff', font: 'C', italic: true, weight: 600 });
    if (s.s) out += T(W / 2, y + 35, s.s, { size: 9.5, anchor: 'middle', fill: '#fff', font: 'S' });
    y += rowH + gap;
  });
  return { h: y + top, out };
}
function ring(nodes, centerLines) {
  const cx = W / 2, cy = 150, r = 105; let out = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.line}" stroke-width="1.2" stroke-dasharray="3 4"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="48" fill="url(#glow)"/>`;
  out += lines(cx, cy - 2, centerLines, { size: 13, anchor: 'middle', font: 'C', italic: true, fill: C.dusk, weight: 600 }, 1.2);
  nodes.forEach((n, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / nodes.length, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    out += `<circle cx="${x}" cy="${y}" r="26" fill="${i % 2 ? C.cream : C.mist}" stroke="${C.gold}" stroke-width="1.2"/>`;
    const ls = wrap(n, 9); out += lines(x, y - (ls.length - 1) * 4 + 3, ls, { size: 9.5, anchor: 'middle', font: 'S', fill: C.ink }, 1.15);
  });
  return { h: 300, out };
}
const D = {};
const reg = (id, label, caption, build) => { D[id] = { id, label, caption, build }; };

// ---------- D01 ----------
reg('D01', 'The Lantern Method: Offer, People, Rhythm', 'The Lantern Method: three small lights that burn together.', () => {
  const items = [['The Offer', 'what you promise,', 'to whom, for what price', C.rose, 80], ['The People', 'who needs it, and', 'how they come to trust you', C.gold, 220], ['The Rhythm', 'a small weekly routine', 'that keeps both lights lit', C.dusk, 360]];
  let o = '';
  items.forEach(([t, a, b, col, x]) => {
    o += `<circle cx="${x}" cy="80" r="68" fill="url(#glow)"/>`;
    o += `<path d="M${x - 22} 95 Q${x - 26} 60 ${x} 38 Q${x + 26} 60 ${x + 22} 95 Z" fill="${col}" opacity=".9"/><rect x="${x - 26}" y="95" width="52" height="8" rx="3" fill="${C.ink}"/><rect x="${x - 22}" y="35" width="44" height="6" rx="3" fill="${C.ink}"/><path d="M${x - 10} 35 Q${x} 18 ${x + 10} 35" stroke="${C.ink}" fill="none" stroke-width="2"/>`;
    o += `<ellipse cx="${x}" cy="72" rx="8" ry="13" fill="#fff6d8"/>`;
    o += T(x, 134, t, { size: 17, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: col });
    o += T(x, 151, a, { size: 10.5, anchor: 'middle', fill: C.soft }) + T(x, 164, b, { size: 10.5, anchor: 'middle', fill: C.soft });
  });
  o += `<path d="M60 195 H380" stroke="${C.gold}" stroke-width="1" stroke-dasharray="2 5"/>` + T(W / 2, 220, 'A steady light, three times over.', { size: 13, anchor: 'middle', font: 'C', italic: true, fill: C.dusk });
  return svg(235, o, D.D01.label);
});
// ---------- D02 ----------
reg('D02', 'How a skill works: you type, the skill guides, Claude delivers', 'How a skill works: you ask, the skill guides, Claude delivers.', () => {
  let o = R(10, 40, 120, 110, { fill: C.mist }) + T(70, 60, 'You type', { size: 13, anchor: 'middle', font: 'C', italic: true, fill: C.rose, weight: 600 });
  o += R(20, 72, 100, 30, { fill: '#fff', stroke: C.line, rx: 4 }) + T(70, 91, '/yt-script', { size: 11, anchor: 'middle', font: 'S', fill: C.dusk });
  o += lines(70, 120, ['plus your topic', 'in plain words'], { size: 10, anchor: 'middle', fill: C.soft });
  o += arrow(132, 95, 158, 95);
  o += `<path d="M160 52 H188 L196 62 H278 V150 H160 Z" fill="${C.cream}" stroke="${C.gold}" stroke-width="1.3"/>` + T(219, 82, 'The skill', { size: 13, anchor: 'middle', font: 'C', italic: true, fill: C.dusk, weight: 600 });
  o += lines(219, 100, ['a folder of', 'instructions,', 'templates and rules'], { size: 10, anchor: 'middle', fill: C.soft });
  o += T(219, 143, 'SKILL.md', { size: 9, anchor: 'middle', font: 'S', fill: C.gold });
  o += arrow(280, 95, 306, 95);
  o += R(308, 40, 122, 110, { fill: C.mist }) + T(369, 60, 'Claude delivers', { size: 13, anchor: 'middle', font: 'C', italic: true, fill: C.rose, weight: 600 });
  o += lines(369, 82, ['hook options', 'the full script', 'notes to check'], { size: 10.5, anchor: 'middle' });
  o += T(W / 2, 185, 'You decide what stays. Claude drafts; you add your stories and check the facts.', { size: 11, anchor: 'middle', italic: true, fill: C.soft });
  return svg(200, o, D.D02.label);
});
// ---------- D03 ----------
reg('D03', 'Prompt anatomy: Role, Goal, Context, Format', 'A prompt that works has four parts. You do not need all four every time.', () => {
  const rows = [['Role', 'Who Claude should be', 'Act as a patient YouTube coach for beginners.', C.rose], ['Goal', 'What you want made', 'Write a 6-minute script that explains fractions.', C.gold], ['Context', 'Your real details', 'Viewers are 11 to 13. I teach in a calm, funny voice.', C.dusk], ['Format', 'The shape of the answer', 'Give 3 hook options, then the full script with timings.', C.teal]];
  let o = '';
  rows.forEach(([a, b, c, col], i) => { const y = 10 + i * 62; o += R(10, y, 78, 50, { fill: col, stroke: col }) + T(49, y + 30, a, { size: 15, anchor: 'middle', fill: '#fff', font: 'C', italic: true, weight: 600 }); o += R(94, y, 336, 50, { fill: C.cream, stroke: C.line }) + T(106, y + 20, b, { size: 10, fill: C.soft, font: 'S' }) + T(106, y + 38, '“' + c + '”', { size: 11.5, italic: true }); });
  return svg(262, o, D.D03.label);
});
// ---------- flows ----------
const flowDiagram = (id, label, cap, nodes, opt) => reg(id, label, cap, () => { const f = flow(nodes, opt); return svg(f.h + 8, f.out, label); });
flowDiagram('D04', 'Install map', 'Six steps from nothing to a working skills menu.', [{ t: 'Install the Claude desktop app', s: 'Sign in with your Claude Pro account' }, { t: 'Open the Code tab', s: 'This is where skills live' }, { t: 'Make a work folder', s: 'For example Documents\\Lantern-Work' }, { t: 'Run the Lantern installer', s: 'It adds the free tools and every skill' }, { t: 'Restart the Claude app', s: 'So it can see the new skills' }, { t: 'Type / and look', s: 'The menu lists your skills by group' }]);
flowDiagram('D05', 'Idea test funnel', 'Each test is cheaper than the next. Only strong ideas reach the last one.', [{ t: 'Your idea', s: 'One sentence' }, { t: 'The board', s: 'Would a sharp panel fund it?', tag: '/founder-board' }, { t: 'The competitors', s: 'Is there a gap you can own?', tag: '/founder-competitors' }, { t: 'The simulated buyers', s: 'A guess, never proof', tag: '/founder-consumer' }, { t: 'Price and offer', s: 'Do the numbers work?', tag: '/founder-pricing' }, { t: 'Real people, real money', s: 'The only test that counts', tag: 'Chapter 5' }], { nodeH: 46, gap: 16 });
reg('D06', 'Value equation', 'The value equation: raise the top, lower the bottom.', () => {
  let o = '';
  o += R(60, 10, 320, 70, { fill: C.mist }) + T(220, 36, 'Dream outcome', { size: 17, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.rose }) + T(220, 54, '×', { size: 14, anchor: 'middle', fill: C.gold }) + T(220, 72, 'Belief it will work for you', { size: 17, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.rose });
  o += `<line x1="40" y1="95" x2="400" y2="95" stroke="${C.dusk}" stroke-width="2"/>`;
  o += R(60, 110, 320, 70, { fill: C.cream }) + T(220, 136, 'Time it takes', { size: 17, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.dusk }) + T(220, 154, '×', { size: 14, anchor: 'middle', fill: C.gold }) + T(220, 172, 'Effort and sacrifice', { size: 17, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.dusk });
  o += T(30, 52, '↑', { size: 28, fill: C.rose, font: 'S' }) + T(30, 150, '↓', { size: 28, fill: C.dusk, font: 'S' });
  o += T(W / 2, 205, 'Value = the top divided by the bottom. A method popularised by Alex Hormozi.', { size: 10.5, anchor: 'middle', italic: true, fill: C.soft });
  return svg(220, o, D.D06.label);
});
reg('D07', 'Offer stack', 'An offer is built like a tower: promise at the base, honesty at the top.', () => {
  const L = [['Name it clearly', 'One memorable name', C.gold], ['Real deadline', 'Only if it is true', '#c98a6a'], ['A guarantee you can afford', 'Risk moves to you, kindly', C.rose], ['Bonuses that cost you little', 'But feel valuable to them', '#6a5f91'], ['Answers to each obstacle', 'Every worry gets a fix', '#4a4f80'], ['The core promise', 'The result they want', C.dusk]];
  let o = '', y = 8;
  L.forEach(([a, b, col], i) => { const w = 380 - (L.length - 1 - i) * 24; o += R((W - w) / 2, y, w, 40, { fill: col, stroke: col, rx: 6 }) + T(W / 2, y + 18, a, { size: 14, anchor: 'middle', fill: '#fff', font: 'C', italic: true, weight: 600 }) + T(W / 2, y + 32, b, { size: 9.5, anchor: 'middle', fill: '#fff', font: 'S' }); y += 46; });
  return svg(y + 4, o, D.D07.label);
});
reg('D08', 'Launch test timeline', 'A two-week test with a stop rule decided in advance.', () => {
  const ms = [['Day 1', 'Talk to 10 people', 40], ['Day 3', 'Waitlist page live', 120], ['Day 5', 'Real price offered', 200], ['Day 10', 'Count the yeses', 290], ['Day 14', 'Go, adjust or stop', 385]];
  let o = `<line x1="30" y1="90" x2="410" y2="90" stroke="${C.dusk}" stroke-width="2"/>`;
  ms.forEach(([d, t, x], i) => { const up = i % 2 === 0; o += `<circle cx="${x}" cy="90" r="7" fill="${i === 4 ? C.rose : C.gold}"/>`; o += `<line x1="${x}" y1="90" x2="${x}" y2="${up ? 62 : 118}" stroke="${C.line}"/>`; o += T(x, up ? 46 : 134, d, { size: 14, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.dusk }) + T(x, up ? 58 : 148, t, { size: 9.5, anchor: 'middle', fill: C.soft }); });
  o += R(40, 170, 360, 46, { fill: C.cream, dash: true }) + T(W / 2, 190, 'Write your stop rule first:', { size: 12, anchor: 'middle', font: 'C', italic: true, fill: C.rose, weight: 600 }) + T(W / 2, 206, '“If fewer than ___ people pay, I change the offer or stop.”', { size: 10.5, anchor: 'middle', italic: true });
  return svg(230, o, D.D08.label);
});
flowDiagram('D09', 'Lead pipeline', 'From a blank page to a booked conversation.', [{ t: 'Describe the ideal customer', s: 'One industry, one size, one role' }, { t: 'Find them', s: 'Maps search, directories, your own contacts', tag: 'Ch. 6' }, { t: 'Clean the list', s: 'Remove poor fits and bad addresses' }, { t: 'Write the message', s: 'Short, plain, one small ask', tag: 'Ch. 7' }, { t: 'Send a small batch first', s: '10 to 20, then read the replies' }, { t: 'Reply, then book the call', s: 'Yes, objection or no: each has a next step', tag: 'Ch. 8' }], { nodeH: 46, gap: 14 });
reg('D10', 'Cold email anatomy', 'A cold email has three short parts and one small ask.', () => {
  let o = R(10, 8, 270, 300, { fill: '#fff', stroke: C.line, rx: 6 }) + T(20, 28, 'Subject: a question about your shop', { size: 10.5, font: 'S', fill: C.dusk });
  o += `<line x1="10" y1="38" x2="280" y2="38" stroke="${C.line}"/>`;
  o += lines(20, 58, ['Hi Amara,', '', 'I noticed you added a second location', 'this spring. Congratulations.', '', 'I help small shops keep their books', 'tidy so month-end takes an hour, not', 'a weekend. Last month I did that for', 'a bakery of your size.', '', 'Would 15 minutes next week suit you?', '', 'Kofi, Clearview Books', 'Reply "stop" and I will not write again.'], { size: 10.5 }, 1.45);
  const ann = [['1', 'A real observation', 58, 80], ['2', 'Their problem + your result', 120, 150], ['3', 'One small ask', 175, 190], ['✦', 'Honest opt-out', 262, 270]];
  ann.forEach(([n, t, y1, y2]) => { o += `<path d="M284 ${y1 - 6} Q296 ${y1 - 6} 296 ${(y1 + y2) / 2} Q296 ${y2} 284 ${y2}" fill="none" stroke="${C.gold}" stroke-width="1.2"/>`; o += `<circle cx="312" cy="${(y1 + y2) / 2 - 3}" r="9" fill="${C.rose}"/>` + T(312, (y1 + y2) / 2 + 1, n, { size: 10, anchor: 'middle', fill: '#fff', font: 'S' }) + lines(326, (y1 + y2) / 2 - 7, wrap(t, 14), { size: 10, fill: C.soft }, 1.2); });
  return svg(318, o, D.D10.label);
});
reg('D11', 'Follow-up timeline', 'Most replies come from follow-ups. Teachers differ on timing, so test.', () => {
  const ms = [['Day 0', 'First email', 36], ['Day 2', 'A short nudge', 120], ['Day 4', '“Your thoughts?”', 204], ['Day 7', 'Kind goodbye', 288], ['Month 3+', 'Rest, then retry', 390]];
  let o = `<line x1="24" y1="70" x2="416" y2="70" stroke="${C.dusk}" stroke-width="2"/>`;
  ms.forEach(([d, t, x], i) => { o += `<circle cx="${x}" cy="70" r="8" fill="${i === 4 ? C.line : C.gold}"/>` + T(x, 46, d, { size: 14, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.dusk }) + T(x, 100, t, { size: 10, anchor: 'middle', fill: C.soft }); });
  o += R(20, 125, 400, 50, { fill: C.cream, dash: true }) + T(W / 2, 145, 'Always reply in the same thread. Never re-pitch.', { size: 12, anchor: 'middle', font: 'C', italic: true, fill: C.rose, weight: 600 }) + T(W / 2, 163, 'A slower pattern (3 to 5 emails over 2 to 3 weeks) is also taught. Try both.', { size: 10, anchor: 'middle', fill: C.soft });
  return svg(190, o, D.D11.label);
});
reg('D12', 'Sales call map: CLOSER', 'The CLOSER path: six steps, with obstacles cleared before the price.', () => {
  const S = [['C', 'Clarify', 'why are they here today?'], ['L', 'Label', 'say the problem back'], ['O', 'Overview', 'what they tried and what it cost'], ['S', 'Sell the destination', 'about three minutes, no feature dump'], ['E', 'Explain away concerns', 'clear obstacles, then the price'], ['R', 'Reinforce', 'after yes: next steps, warm welcome']];
  let o = '';
  S.forEach(([l, a, b], i) => { const x = 20 + i * 12, y = 12 + (5 - i) * 0, w = 400 - i * 12; const yy = 10 + i * 52; o += R(x, yy, w, 44, { fill: i % 2 ? C.cream : C.mist }) + `<circle cx="${x + 24}" cy="${yy + 22}" r="15" fill="${[C.dusk, '#4a4f80', '#6a5f91', C.rose, '#c98a6a', C.gold][i]}"/>` + T(x + 24, yy + 28, l, { size: 17, anchor: 'middle', fill: '#fff', font: 'C', weight: 600 }) + T(x + 50, yy + 20, a, { size: 14, font: 'C', italic: true, weight: 600, fill: C.dusk }) + T(x + 50, yy + 35, b, { size: 10, fill: C.soft }); });
  o += T(W / 2, 336, 'Method popularised by Alex Hormozi; explained here in our own words.', { size: 9.5, anchor: 'middle', italic: true, fill: C.soft });
  return svg(346, o, D.D12.label);
});
reg('D13', 'The 3A reframe', 'The 3A reframe: what to say right after anything that is not a yes.', () => {
  const A = [['Acknowledge', 'Say their point back', '“So timing is on your mind.”', C.rose], ['Associate', 'Link it to something good', '“Serious buyers ask that.”', C.gold], ['Ask', 'Question that moves forward', '“What would make it feel right?”', C.dusk]];
  let o = '';
  A.forEach(([a, b, c, col], i) => { const x = 10 + i * 144; o += R(x, 14, 132, 150, { fill: C.cream, stroke: col, sw: 1.6, rx: 10 }) + `<circle cx="${x + 66}" cy="48" r="22" fill="${col}"/>` + T(x + 66, 55, i + 1, { size: 20, anchor: 'middle', fill: '#fff', font: 'C', weight: 600 }) + T(x + 66, 90, a, { size: 15, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: col }) + lines(x + 66, 106, wrap(b, 20), { size: 10, anchor: 'middle', fill: C.soft }) + lines(x + 66, 132, wrap(c, 22), { size: 10.5, anchor: 'middle', italic: true }, 1.25); if (i < 2) o += arrow(x + 134, 90, x + 142, 90); });
  o += T(W / 2, 192, 'Never argue. If you win the argument you lose the sale.', { size: 12, anchor: 'middle', font: 'C', italic: true, fill: C.dusk });
  return svg(206, o, D.D13.label);
});
reg('D14', 'Newsletter anatomy', 'The one-minute newsletter: same shape every time, new idea inside.', () => {
  let o = R(10, 8, 280, 310, { fill: '#fff', rx: 6 });
  const parts = [['Series name #12: one-line promise', 'Subject', 22], ['Preview line that adds curiosity', 'Preview', 48], ['A quote, stat or sharp line', 'Opener', 78], ['One problem. One fix. One tactic to try today, with a real example.', 'Body', 114], ['If you are a beginner, start here. If you are scaling, go there.', 'Call to action', 188], ['P.S. A bonus tip, a second link or a small joke.', 'P.S.', 236], ['Business name, address, unsubscribe link', 'Footer', 276]];
  parts.forEach(([t, l, y]) => { const ls = wrap(t, 38); o += lines(20, y + 10, ls, { size: 10.5 }, 1.3); o += `<line x1="10" y1="${y - 6}" x2="290" y2="${y - 6}" stroke="${C.line}" stroke-dasharray="2 3"/>`; o += T(300, y + 10, l, { size: 11, font: 'C', italic: true, weight: 600, fill: C.rose }); });
  o += T(300, 140, 'about 200 words', { size: 9.5, fill: C.soft, font: 'S' });
  return svg(328, o, D.D14.label);
});
reg('D15', 'Seven-day challenge', 'A seven-day challenge: give first, then offer, on a real deadline.', () => {
  const d = ['Invite', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Offer', 'Last call'];
  let o = '';
  d.forEach((t, i) => { const x = 14 + i * 52, h = 30 + i * 8, col = i >= 6 ? C.rose : i === 0 ? C.gold : C.dusk; o += R(x, 150 - h, 44, h, { fill: col, stroke: col, rx: 4 }) + T(x + 22, 168, t, { size: 9, anchor: 'middle', font: 'S', fill: C.soft }); });
  o += T(30, 30, 'free lessons, small wins', { size: 12, font: 'C', italic: true, fill: C.dusk, weight: 600 }) + T(310, 30, 'the ask arrives', { size: 12, font: 'C', italic: true, fill: C.rose, weight: 600 });
  o += T(W / 2, 192, 'Test on 10 to 15 percent of your list before you send to everyone.', { size: 10.5, anchor: 'middle', italic: true, fill: C.soft });
  return svg(206, o, D.D15.label);
});
reg('D16', 'Content flywheel', 'One idea, six shapes. What people reply to becomes the next idea.', () => { const r = ring(['Long video', 'Shorts', 'Reels and TikTok', 'Carousel', 'Newsletter', 'Replies and ideas'], ['One idea', 'one promise']); return svg(r.h, r.out, D.D16.label); });
reg('D17', 'Retention curve (illustrative)', 'An illustrative retention curve: the early drop is normal; the shape is what you study.', () => {
  const pts = [[40, 30], [58, 90], [90, 118], [150, 128], [200, 132], [215, 118], [240, 128], [300, 138], [360, 150], [400, 162]];
  let o = `<line x1="40" y1="20" x2="40" y2="190" stroke="${C.line}"/><line x1="40" y1="190" x2="410" y2="190" stroke="${C.line}"/>`;
  o += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')}" fill="none" stroke="${C.dusk}" stroke-width="2.2"/><path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')} L400 190 L40 190 Z" fill="${C.dusk}" opacity=".08"/>`;
  o += T(10, 30, '100%', { size: 9, font: 'S', fill: C.soft }) + T(14, 193, '0', { size: 9, font: 'S', fill: C.soft }) + T(40, 206, 'start', { size: 9, font: 'S', fill: C.soft }) + T(380, 206, '10:00', { size: 9, font: 'S', fill: C.soft });
  o += `<circle cx="58" cy="90" r="4" fill="${C.rose}"/>` + T(70, 78, 'First 15 seconds: the hook decides', { size: 10, fill: C.rose, italic: true });
  o += `<circle cx="215" cy="118" r="4" fill="${C.gold}"/>` + T(160, 108, 'A re-hook lifts it again', { size: 10, fill: C.gold, italic: true });
  o += T(W / 2, 224, 'Shape for teaching only, not real data. Your own numbers live in YouTube Studio.', { size: 9.5, anchor: 'middle', italic: true, fill: C.soft });
  return svg(236, o, D.D17.label);
});
reg('D18', 'The first fifteen seconds', 'The first fifteen seconds: promise, proof, plan.', () => {
  const seg = [['0 to 3 s', 'Promise', 'A pattern break and what they will get', C.rose, 60], ['3 to 8 s', 'Proof', 'Why you can say it, or what is at stake', C.gold, 110], ['8 to 15 s', 'Plan', 'What happens next, so they stay', C.dusk, 140]];
  let o = '', x = 24; const k = 1.22;
  seg.forEach(([t, a, b, col, w]) => { const sw = w * k - 6; o += R(x, 30, sw, 52, { fill: col, stroke: col, rx: 6 }) + T(x + sw / 2, 52, a, { size: 15, anchor: 'middle', fill: '#fff', font: 'C', italic: true, weight: 600 }) + T(x + sw / 2, 72, t, { size: 9.5, anchor: 'middle', fill: '#fff', font: 'S' }); o += lines(x + 4, 104, wrap(b, Math.max(14, Math.round(sw / 6.2))), { size: 10, fill: C.soft }, 1.25); x += w * k; });
  return svg(150, o, D.D18.label);
});
reg('D19', 'Carousel structure', 'A carousel is a short story told one swipe at a time.', () => {
  const sl = [['1', 'Cover', 'A hook worth the swipe'], ['2', 'The problem', 'Say it in their words'], ['3', 'Step 1', 'One idea per slide'], ['4', 'Step 2', 'Keep it visual'], ['5', 'Step 3', 'Short, scannable'], ['6', 'Proof', 'A small, real result'], ['7', 'Recap', 'The three takeaways'], ['8', 'Next step', 'One clear ask']];
  let o = '';
  sl.forEach(([n, a, b], i) => { const x = 10 + (i % 4) * 107, y = 8 + Math.floor(i / 4) * 142; o += R(x, y, 98, 130, { fill: i === 0 ? C.dusk : i === 7 ? C.rose : C.cream, stroke: C.line, rx: 8 }) + T(x + 49, y + 40, a, { size: 14, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: i === 0 || i === 7 ? '#fff' : C.dusk }) + lines(x + 49, y + 62, wrap(b, 15), { size: 9.5, anchor: 'middle', fill: i === 0 || i === 7 ? '#fff' : C.soft }) + T(x + 49, y + 118, n, { size: 9, anchor: 'middle', font: 'S', fill: i === 0 || i === 7 ? '#fff' : C.gold }); });
  return svg(296, o, D.D19.label);
});
reg('D20', 'Weekly rhythm', 'A week with room to breathe: five working days, one light day, one rest.', () => {
  const days = [['Mon', 'Plan', '/yt-plan /ig-plan'], ['Tue', 'Write', 'scripts, captions'], ['Wed', 'Make', 'record, render'], ['Thu', 'Publish', 'post, then engage'], ['Fri', 'Sell', 'outreach, calls'], ['Sat', 'Light', 'replies only'], ['Sun', 'Rest', '10-minute review']];
  let o = '';
  days.forEach(([d, t, s], i) => { const x = 8 + i * 61, col = [C.dusk, C.rose, C.rose, C.gold, '#c98a6a', C.teal, C.line][i]; o += R(x, 10, 56, 150, { fill: C.cream, stroke: C.line, rx: 8 }) + `<rect x="${x}" y="10" width="56" height="30" rx="8" fill="${col}"/>` + T(x + 28, 30, d, { size: 12, anchor: 'middle', fill: i === 6 ? C.ink : '#fff', font: 'S' }) + T(x + 28, 70, t, { size: 14, anchor: 'middle', font: 'C', italic: true, weight: 600, fill: C.dusk }) + lines(x + 28, 92, wrap(s, 9), { size: 9, anchor: 'middle', fill: C.soft }, 1.2); });
  o += T(W / 2, 184, 'Sixty to ninety minutes on most days beats one exhausting Saturday.', { size: 10.5, anchor: 'middle', italic: true, fill: C.soft });
  return svg(198, o, D.D20.label);
});
const recipe = (id, label, cap, nodes) => flowDiagram(id, label, cap, nodes, { nodeH: 44, gap: 14 });
recipe('D21', 'Recipe: idea to launch', 'Recipe 1: from idea to launch.', [{ t: 'Test the idea', tag: '/founder-board' }, { t: 'Map the competitors', tag: '/founder-competitors' }, { t: 'Ask the simulated buyers', tag: '/founder-consumer' }, { t: 'Set the price', tag: '/founder-pricing' }, { t: 'Build the offer', tag: '/founder-offer' }, { t: 'Plan the real test', tag: '/founder-launch' }]);
recipe('D22', 'Recipe: lead to close', 'Recipe 2: from a list to a closed sale.', [{ t: 'Find the businesses', tag: '/sales-google-maps-scraper' }, { t: 'Write the outreach', tag: '/sales-cold-email-playbook' }, { t: 'Prepare the conversation', tag: '/sales-closing-playbook' }, { t: 'Answer objections', tag: '/sales-closing-playbook' }, { t: 'Follow up kindly', tag: '/sales-closing-playbook' }]);
recipe('D23', 'Recipe: content week', 'Recipe 3: one video becomes a week of posts.', [{ t: 'Write the long video', tag: '/yt-script' }, { t: 'Add chapters', tag: '/yt-chapters' }, { t: 'Cut the shorts', tag: '/yt-shorts' }, { t: 'Repurpose for Instagram', tag: '/ig-repurpose' }, { t: 'Write the captions', tag: '/ig-caption' }, { t: 'Make it sound human', tag: '/ig-human' }]);
recipe('D24', 'Recipe: newsletter to challenge', 'Recipe 4: from a small list to a seven-day challenge.', [{ t: 'Plan the newsletter', tag: '/sales-email-marketing-playbook' }, { t: 'Write four issues', tag: '/sales-email-marketing-playbook' }, { t: 'Design the challenge', tag: '/sales-email-marketing-playbook' }, { t: 'Promote on Instagram', tag: '/ig-carousel' }, { t: 'Send, then review', tag: '/sales-email-marketing-playbook' }]);
recipe('D25', 'Recipe: competitor to SEO to content', 'Recipe 5: from a competitor to a content plan.', [{ t: 'Study one competitor', tag: '/seo-competitor-analysis' }, { t: 'Find the keywords', tag: '/seo-keyword-research' }, { t: 'Group them by intent', tag: '/seo-keyword-clustering' }, { t: 'Plan the month', tag: '/yt-plan' }, { t: 'Make the first piece', tag: '/yt-script' }]);
recipe('D26', 'Recipe: reel to DM to sale', 'Recipe 6: from a reel to a conversation to a sale.', [{ t: 'See what works now', tag: '/ig-viral' }, { t: 'Write your reel', tag: '/ig-reel' }, { t: 'Comment like a person', tag: '/ig-comment' }, { t: 'Reply by message', tag: '/ig-dm' }, { t: 'Close with care', tag: '/sales-closing-playbook' }]);
reg('D27', 'Metrics funnel', 'Fix the weakest step first, never the loudest number.', () => { const f = funnel([{ t: 'Seen', s: 'views, opens, sends' }, { t: 'Engaged', s: 'clicks, replies, saves' }, { t: 'Talked', s: 'real conversations' }, { t: 'Offered', s: 'a price was said out loud' }, { t: 'Paid', s: 'money arrived' }]); return svg(f.h, f.out, D.D27.label); });
reg('D28', 'Skill families map', 'Your toolkit by family. Each tag appears at the start of a skill’s description.', () => {
  const B = [['SALES', 35, 'founder-, seo-, sales-', C.rose, 120, 90], ['VIDEO / YOUTUBE', 49, 'yt-, video-', C.dusk, 290, 110], ['INSTAGRAM', 13, 'ig-', C.gold, 90, 220], ['DEV', 13, 'dev-', C.teal, 235, 238], ['DESIGN', 2, 'design-', '#6a5f91', 360, 232]];
  let o = '';
  B.forEach(([n, c, p, col, x, y]) => { const r = 24 + Math.sqrt(c) * 6.6; o += `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity=".9"/>` + T(x, y - 3, n, { size: r > 40 ? 12 : 9.5, anchor: 'middle', fill: '#fff', font: 'C', italic: true, weight: 600 }) + T(x, y + 12, c + ' skills', { size: 9, anchor: 'middle', fill: '#fff', font: 'S' }) + T(x, y + r + 13, p, { size: 9, anchor: 'middle', fill: C.soft, font: 'S' }); });
  return svg(300, o, D.D28.label);
});
export const diagramIds = Object.keys(D);
export const diagram = (id) => D[id] ? { svg: D[id].build(), caption: D[id].caption } : null;
export const colors = C;
