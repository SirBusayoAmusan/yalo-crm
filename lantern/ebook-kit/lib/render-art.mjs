// node lib/render-art.mjs  -> renders all art themes to art/<theme>.jpg (banner 2560x1000) and art/<theme>-tall.jpg (1600x2560)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { artSvg, themes } from './art.mjs';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'art'); fs.mkdirSync(out, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const ffm = fs.readdirSync(process.env.LOCALAPPDATA + '/Microsoft/WinGet/Packages').filter(d => d.startsWith('Gyan.FFmpeg')).map(d => { const base = process.env.LOCALAPPDATA + '/Microsoft/WinGet/Packages/' + d; const v = fs.readdirSync(base).find(x => x.startsWith('ffmpeg-')); return v ? `${base}/${v}/bin/ffmpeg.exe` : null; }).find(Boolean);
const tmp = path.join(process.env.TEMP, 'art-render'); fs.mkdirSync(tmp, { recursive: true });
export function render(theme, w, h, name, seed = 7) {
  const html = path.join(tmp, name + '.html'), png = path.join(tmp, name + '.png');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}svg{display:block}</style>${artSvg(theme, w, h, seed)}`);
  spawnSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, `--screenshot=${png}`, `--user-data-dir=${path.join(tmp, 'prof')}`, 'file:///' + html.replace(/\\/g, '/')], { encoding: 'utf8' });
  const jpg = path.join(out, name + '.jpg');
  spawnSync(ffm, ['-loglevel', 'error', '-y', '-i', png, '-q:v', '3', jpg]);
  return jpg;
}
if (process.argv[1] && process.argv[1].endsWith('render-art.mjs')) {
  const only = process.argv[2];
  for (const t of themes) if (!only || only === t) { console.log(render(t, 2560, 1000, t, 11), render(t, 1600, 2560, t + '-tall', 5)); }
}
