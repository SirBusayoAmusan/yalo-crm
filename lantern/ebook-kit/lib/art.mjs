// Generative dreamy scenes as SVG. artSvg(theme, w, h, seed) -> svg string. Pure code illustrations (no photos).
export const themes = ['dawn', 'night', 'harbor', 'meadow', 'mist', 'ember', 'river', 'lantern'];
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const P = {
  dawn:    { sky: ['#5f5a9e', '#c07aa6', '#f0a9a0', '#fbd9b4'], hills: ['#b7a0c4', '#8f7fb0', '#6a6399', '#443f75'], sun: '#fff0c8', glow: '#ffd7a0', ground: '#2e2b57' },
  night:   { sky: ['#0b0f2b', '#1e2457', '#4a3f85', '#8a6aa5'], hills: ['#3d3a77', '#2b2a5c', '#1c1c44', '#101230'], sun: '#fff6d8', glow: '#f3d9a0', ground: '#0a0b22' },
  harbor:  { sky: ['#27325f', '#5c5b97', '#d98aa0', '#f6c79b'], hills: ['#6f6aa0', '#4c4a80', '#2f2f5e'], sun: '#ffe6b8', glow: '#ffc890', ground: '#1d2145' },
  meadow:  { sky: ['#a9c7d9', '#d6dff0', '#f4e6df', '#fbe8c8'], hills: ['#c9d3a6', '#a7bf89', '#7ea36f', '#5c8760'], sun: '#fff7da', glow: '#ffe8b0', ground: '#456e52' },
  mist:    { sky: ['#8b9bb4', '#b5bfd0', '#d6dbe3', '#eceae8'], hills: ['#a9b3c4', '#8793a9', '#5f6d86', '#3b4863'], sun: '#ffffff', glow: '#ffffff', ground: '#2c3a53' },
  ember:   { sky: ['#14101f', '#3b1b33', '#7a3140', '#c4663a'], hills: ['#4b2335', '#33192b', '#22121f', '#150c17'], sun: '#ffd9a0', glow: '#ff9a55', ground: '#0e0811' },
  river:   { sky: ['#6e7fb0', '#a9a3c6', '#eab9b4', '#fde0b8'], hills: ['#9aa3c4', '#7a85ab', '#58648e', '#3b4570'], sun: '#fff0c8', glow: '#ffd9a0', ground: '#2a3157' },
  lantern: { sky: ['#0a0d28', '#1a1f52', '#3a3678', '#6d5a9e'], hills: ['#2e2d63', '#1f1f4b', '#14153a', '#0b0c26'], sun: '#fff0c0', glow: '#ffd27a', ground: '#07081d' },
};
function ridge(r, w, y, amp, color, op = 1, rough = 3) {
  const f = [], ph = [], n = rough + 2;
  for (let i = 0; i < n; i++) { f.push((0.6 + r() * (i + 1) * 1.1) * Math.PI * 2 / w); ph.push(r() * 6.28); }
  let d = `M0 ${y}`; const step = Math.max(8, w / 160);
  for (let x = 0; x <= w + step; x += step) { let v = 0; for (let i = 0; i < n; i++) v += Math.sin(x * f[i] + ph[i]) * amp / (i + 1) ** 1.25; d += ` L${x.toFixed(1)} ${(y + v).toFixed(1)}`; }
  return `<path d="${d} L${w} 9999 L0 9999 Z" fill="${color}" opacity="${op}"/>`;
}
function stars(r, w, h, n, maxY) { let s = ''; for (let i = 0; i < n; i++) { const x = r() * w, y = r() * maxY, rad = 0.5 + r() * 1.7; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#fff" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`; } return s; }
function trees(r, w, y, n, color, hmin, hmax) { let s = ''; for (let i = 0; i < n; i++) { const x = r() * w, h = hmin + r() * (hmax - hmin), bw = h * 0.28; s += `<path d="M${x} ${y - h} L${x - bw} ${y} L${x + bw} ${y} Z" fill="${color}"/>`; } return s; }
function mistBand(w, y, h, op) { return `<rect x="0" y="${y}" width="${w}" height="${h}" fill="url(#mist)" opacity="${op}"/>`; }
function lantern(x, y, s, glow) {
  return `<circle cx="${x}" cy="${y}" r="${150 * s}" fill="url(#lg)"/><g transform="translate(${x} ${y}) scale(${s})"><line x1="0" y1="-120" x2="0" y2="-62" stroke="#0b0c26" stroke-width="3"/><path d="M-22 -62 H22 L18 -50 H-18 Z" fill="#0b0c26"/><path d="M-18 -50 Q-30 0 -18 40 H18 Q30 0 18 -50 Z" fill="${glow}" opacity=".92"/><ellipse cx="0" cy="-6" rx="9" ry="22" fill="#fff8e0"/><path d="M-18 40 H18 L22 50 H-22 Z" fill="#0b0c26"/></g>`;
}
export function artSvg(theme, w, h, seed = 7) {
  const p = P[theme] || P.dawn, r = rng(seed * 977 + theme.length * 31), hor = h * (theme === 'harbor' || theme === 'river' ? 0.58 : 0.64);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${p.sky.map((c, i) => `<stop offset="${(i / (p.sky.length - 1) * 100).toFixed(0)}%" stop-color="${c}"/>`).join('')}</linearGradient>
<radialGradient id="sg"><stop offset="0%" stop-color="${p.glow}" stop-opacity=".95"/><stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
<radialGradient id="lg"><stop offset="0%" stop-color="${p.glow}" stop-opacity=".75"/><stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity=".9"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .09 0"/></filter></defs>`;
  o += `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  const night = ['night', 'lantern', 'ember'].includes(theme);
  if (night) o += stars(r, w, h, Math.round(w * h / 9000), hor * 0.85);
  const sx = theme === 'lantern' ? w * 0.24 : w * (0.28 + r() * 0.44), sy = hor - h * (night ? 0.38 : 0.12 + r() * 0.1), sr = h * (night ? 0.06 : 0.075);
  o += `<circle cx="${sx}" cy="${sy}" r="${sr * 5}" fill="url(#sg)"/>`;
  if (theme === 'night' || theme === 'lantern') o += `<mask id="mm"><rect width="${w}" height="${h}" fill="#fff"/><circle cx="${sx + sr * 0.5}" cy="${sy - sr * 0.12}" r="${sr * 0.92}" fill="#000"/></mask><circle cx="${sx}" cy="${sy}" r="${sr}" fill="${p.sun}" mask="url(#mm)"/>`;
  else if (theme !== 'mist') o += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${p.sun}" opacity=".95"/>`;
  // soft clouds
  if (!night) for (let i = 0; i < 4; i++) { const cx = r() * w, cy = h * (0.12 + r() * 0.3); o += `<ellipse cx="${cx}" cy="${cy}" rx="${w * (0.07 + r() * 0.08)}" ry="${h * 0.025}" fill="#fff" opacity="${(0.15 + r() * 0.2).toFixed(2)}"/>`; }
  // hills
  p.hills.forEach((c, i) => { const y = hor + i * h * 0.075 - (i === 0 ? h * 0.1 : 0); o += ridge(r, w, y, h * (0.07 - i * 0.008), c, 1, 3 + i); if (theme === 'mist' || (i < 2 && theme !== 'ember')) o += mistBand(w, y - h * 0.05, h * 0.16, 0.5 - i * 0.12); });
  if (theme === 'mist') { o += trees(r, w, hor + h * 0.2, Math.round(w / 40), p.hills[3], h * 0.1, h * 0.28); o += mistBand(w, hor - h * 0.05, h * 0.25, 0.55); o += trees(r, w, hor + h * 0.3, Math.round(w / 50), p.ground, h * 0.16, h * 0.34); }
  if (theme === 'dawn' || theme === 'meadow') o += trees(r, w, hor + h * 0.3, Math.round(w / 90), p.ground, h * 0.06, h * 0.16);
  if (theme === 'harbor' || theme === 'river') { // water with reflection streaks
    const wy = hor + h * 0.12; o += `<rect x="0" y="${wy}" width="${w}" height="${h - wy}" fill="${p.hills[1]}" opacity=".55"/>`;
    for (let i = 0; i < 40; i++) { const y = wy + r() * (h - wy), x = sx + (r() - .5) * w * 0.35 * (1 + (y - wy) / h), l = 20 + r() * 120; o += `<rect x="${x - l / 2}" y="${y}" width="${l}" height="1.6" fill="${p.glow}" opacity="${(0.15 + r() * 0.4).toFixed(2)}"/>`; }
    if (theme === 'harbor') for (let i = 0; i < 3; i++) { const bx = w * (0.15 + r() * 0.7), by = wy + h * 0.03 + i * h * 0.05; o += `<path d="M${bx - 38} ${by} H${bx + 38} L${bx + 28} ${by + 12} H${bx - 28} Z" fill="${p.ground}"/><line x1="${bx}" y1="${by}" x2="${bx}" y2="${by - 44}" stroke="${p.ground}" stroke-width="2"/><path d="M${bx} ${by - 44} L${bx + 22} ${by - 8} H${bx} Z" fill="${p.ground}"/>`; }
    if (theme === 'river') o += `<path d="M${w * 0.4} ${h} C${w * 0.46} ${h * 0.82} ${w * 0.62} ${h * 0.78} ${w * 0.55} ${wy} L${w * 0.5} ${wy} C${w * 0.52} ${h * 0.78} ${w * 0.36} ${h * 0.84} ${w * 0.25} ${h} Z" fill="${p.glow}" opacity=".35"/>`;
  }
  if (theme === 'meadow') for (let i = 0; i < 220; i++) { const x = r() * w, y = hor + h * 0.12 + r() * (h * 0.3); o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.2 + r() * 2.2).toFixed(1)}" fill="${['#fff', '#f4b6c2', '#ffe08a', '#d7b8f0'][i % 4]}" opacity=".8"/>`; }
  if (theme === 'ember') { o += `<ellipse cx="${w * 0.5}" cy="${h * 0.92}" rx="${w * 0.25}" ry="${h * 0.2}" fill="url(#sg)"/>`; for (let i = 0; i < 160; i++) { const x = w * 0.5 + (r() - .5) * w * 0.4, y = h * (0.15 + r() * 0.8); o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.8 + r() * 2.4).toFixed(1)}" fill="${['#ffd9a0', '#ff9a55', '#ffe9c8'][i % 3]}" opacity="${(0.25 + r() * 0.7).toFixed(2)}"/>`; } }
  if (theme === 'lantern') { o += trees(r, w, h, Math.round(w / 60), p.ground, h * 0.2, h * 0.5); o += lantern(w * 0.62, h * 0.52, h / 520, p.glow); for (let i = 0; i < 40; i++) { const x = w * 0.62 + (r() - .5) * w * 0.4, y = h * 0.52 + (r() - .5) * h * 0.5; o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.2 + r() * 2.4).toFixed(1)}" fill="${p.glow}" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`; } }
  if (theme === 'night') { o += trees(r, w, h, Math.round(w / 70), p.ground, h * 0.1, h * 0.28); o += lantern(w * 0.22, h * 0.8, h / 900, p.glow); }
  o += `<rect width="${w}" height="${h}" filter="url(#grain)"/></svg>`;
  return o;
}
