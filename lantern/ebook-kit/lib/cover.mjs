// Renders the front cover (and optional KDP wrap) with real typography. Usage: node lib/cover.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const KIT = path.resolve(import.meta.dirname, '..');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const base = process.env.LOCALAPPDATA + '/Microsoft/WinGet/Packages';
const ffm = (() => { for (const d of fs.readdirSync(base).filter(d => d.startsWith('Gyan.FFmpeg'))) { const v = fs.readdirSync(base + '/' + d).find(x => x.startsWith('ffmpeg-')); if (v) return `${base}/${d}/${v}/bin/ffmpeg.exe`; } return 'ffmpeg'; })();
const fonts = pathToFileURL(path.join(KIT, 'fonts')).href;
const FF = `@font-face{font-family:"Cormorant";font-weight:500;font-style:italic;src:url("${fonts}/cormorant-garamond-latin-500-italic.woff2")}@font-face{font-family:"Cormorant";font-weight:400;font-style:italic;src:url("${fonts}/cormorant-garamond-latin-400-italic.woff2")}@font-face{font-family:"Cormorant";font-weight:600;font-style:normal;src:url("${fonts}/cormorant-garamond-latin-600-normal.woff2")}@font-face{font-family:"EBG";font-style:italic;src:url("${fonts}/eb-garamond-latin-400-italic.woff2")}`;
const tmp = path.join(process.env.TEMP, 'cover-render'); fs.mkdirSync(tmp, { recursive: true });
function shot(html, w, h, out) {
  const f = path.join(tmp, path.basename(out) + '.html'), png = f + '.png';
  fs.writeFileSync(f, html);
  spawnSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=8000', `--window-size=${w},${h}`, `--screenshot=${png}`, `--user-data-dir=${path.join(tmp, 'prof')}`, pathToFileURL(f).href]);
  spawnSync(ffm, ['-loglevel', 'error', '-y', '-i', png, '-q:v', '2', out]);
}
const art = pathToFileURL(path.join(KIT, 'art', 'lantern-tall.jpg')).href;
export function frontCover(w, h, out) {
  const u = w / 1600;
  const html = `<!doctype html><meta charset="utf-8"><style>${FF}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0a0d28}
.c{position:relative;width:${w}px;height:${h}px;background:url("${art}") center/cover;color:#fff;text-align:center}
.v{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,30,.62) 0%,rgba(8,8,30,.05) 38%,rgba(8,8,30,.05) 62%,rgba(6,6,24,.7) 100%)}
.k{position:absolute;top:${150 * u}px;left:0;right:0;font:600 ${34 * u}px Cormorant;letter-spacing:${.42 * 34 * u}px;text-transform:uppercase;opacity:.92}
.t{position:absolute;top:${215 * u}px;left:0;right:0;font:500 italic ${230 * u}px/${.92 * 230 * u}px Cormorant;text-shadow:0 ${4 * u}px ${60 * u}px rgba(0,0,0,.55);padding:0 ${80 * u}px}
.s{position:absolute;top:${735 * u}px;left:${150 * u}px;right:${150 * u}px;font:italic ${48 * u}px/${1.32 * 48 * u}px EBG;opacity:.95;text-shadow:0 ${2 * u}px ${24 * u}px rgba(0,0,0,.6)}
.a{position:absolute;bottom:${130 * u}px;left:0;right:0;font:600 ${40 * u}px Cormorant;letter-spacing:${.38 * 40 * u}px;text-transform:uppercase}
.a::before{content:"";display:block;width:${150 * u}px;height:${2 * u}px;background:rgba(255,255,255,.65);margin:0 auto ${34 * u}px}</style>
<div class="c"><div class="v"></div><div class="k">A story-guide for makers</div><div class="t">The Lantern Hours</div><div class="s">Build a business, an audience and a sales system with Claude, one quiet skill at a time</div><div class="a">Clearpath Creators</div></div>`;
  shot(html, w, h, out);
}
if (process.argv[1] && process.argv[1].endsWith('cover.mjs')) {
  fs.mkdirSync(path.join(KIT, 'books', 'lantern-hours', 'output'), { recursive: true });
  const out = path.join(KIT, 'books', 'lantern-hours', 'output', 'cover-front-1600x2560.jpg');
  frontCover(1600, 2560, out); console.log(out);
}
