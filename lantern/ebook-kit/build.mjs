// Usage: node build.mjs <path-to-book-folder>   (folder contains book.html)
// Makes <folder>/book.pdf using Edge or Chrome in headless mode. No internet needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] || '.');
const html = path.join(dir, 'book.html');
if (!fs.existsSync(html)) { console.error('book.html not found in', dir); process.exit(1); }
const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = browsers.find(fs.existsSync);
if (!exe) { console.error('Edge or Chrome not found'); process.exit(1); }
const out = path.join(dir, 'book.pdf');
const r = spawnSync(exe, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--allow-file-access-from-files', '--virtual-time-budget=20000',
  `--user-data-dir=${path.join(process.env.TEMP || dir, 'ebook-kit-profile')}`,
  `--print-to-pdf=${out}`, pathToFileURL(html).href,
], { encoding: 'utf8' });
if (!fs.existsSync(out)) { console.error('PDF not created', r.stderr); process.exit(1); }
console.log('Created', out, (fs.statSync(out).size / 1024 / 1024).toFixed(1) + ' MB');
