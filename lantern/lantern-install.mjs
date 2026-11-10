#!/usr/bin/env node
// The Lantern Hours: skills installer (Windows, Mac, Linux). Downloads skills from their creators and installs them.
// Usage: node lantern-install.mjs [--only-own] [--local-repos DIR] [--no-network]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const here = import.meta.dirname;
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const HOME = os.homedir();
const L = path.join(HOME, 'Lantern');
const REPOS = opt('--local-repos') || path.join(L, 'repos');
const BIN = path.join(L, 'bin');
const KIT = path.join(L, 'ebook-kit');
const SK = path.join(HOME, '.claude', 'skills');
const LOG = path.join(L, 'install.log');
const win = process.platform === 'win32';
fs.mkdirSync(L, { recursive: true }); fs.mkdirSync(BIN, { recursive: true }); fs.mkdirSync(SK, { recursive: true });
const log = (m) => { console.log(m); try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} };
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: 'utf8', ...o });
const cpDir = (a, b) => { fs.rmSync(b, { recursive: true, force: true }); fs.cpSync(a, b, { recursive: true, filter: s => !s.includes(`${path.sep}.git${path.sep}`) && !s.endsWith(`${path.sep}.git`) }); };

const manifest = JSON.parse(fs.readFileSync(path.join(here, 'skills-manifest.json'), 'utf8'));
const imagesMap = JSON.parse(fs.readFileSync(path.join(here, 'images-map.json'), 'utf8'));

// ---------- 1. get the creators' repos (only the folders we need) ----------
function ensureRepo(name, url, paths) {
  const dir = path.join(REPOS, name);
  if (fs.existsSync(path.join(dir, '.git')) && !opt('--local-repos')) { run('git', ['-C', dir, 'pull', '--ff-only', '-q']); }
  if (fs.existsSync(dir)) return dir;
  if (flag('--no-network')) return null;
  fs.mkdirSync(REPOS, { recursive: true });
  for (let i = 1; i <= 4; i++) {
    fs.rmSync(dir, { recursive: true, force: true });
    let r = run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '-q', url, dir]);
    if (r.status === 0) r = run('git', ['-C', dir, 'sparse-checkout', 'set', ...paths]);
    if (r.status === 0 && fs.existsSync(dir)) { log(`downloaded ${name}`); return dir; }
    log(`retry ${i} for ${name}: ${(r.stderr || '').trim().slice(0, 120)}`);
  }
  log(`COULD NOT download ${name}; skills from it were skipped. Run the installer again later.`);
  return null;
}
function retag(text, name, tag) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return `---\nname: ${name}\ndescription: ${tag} ${name}\n---\n\n` + text;
  const out = [];
  for (const l of m[1].split(/\r?\n/)) {
    if (/^name:/.test(l)) { out.push(`name: ${name}`); continue; }
    if (/^description:/.test(l)) {
      const v = l.replace(/^description:\s*/, '');
      if (/^[>|][+-]?$/.test(v)) { out.push(l); out.push(`  ${tag}`); }
      else if (/^"/.test(v)) out.push(`description: "${tag} ${v.slice(1)}`);
      else if (/^'/.test(v)) out.push(`description: '${tag} ${v.slice(1)}`);
      else out.push(`description: "${tag} ${v.replace(/"/g, '\\"')}"`);
      continue;
    }
    out.push(l);
  }
  return text.replace(m[0], `---\n${out.join('\n')}\n---`);
}

let installed = 0, skipped = [];
if (!flag('--only-own')) {
  const byRepo = {};
  for (const s of manifest.skills) (byRepo[s.repo] ||= { url: s.url, items: [] }).items.push(s);
  for (const [repo, g] of Object.entries(byRepo)) {
    const dir = ensureRepo(repo, g.url, [...new Set(g.items.map(i => i.src))]);
    for (const s of g.items) {
      const from = dir && path.join(dir, s.src);
      if (!from || !fs.existsSync(path.join(from, 'SKILL.md'))) { skipped.push(s.name); continue; }
      const to = path.join(SK, s.name); cpDir(from, to);
      const f = path.join(to, 'SKILL.md'); fs.writeFileSync(f, retag(fs.readFileSync(f, 'utf8'), s.name, s.tag)); installed++;
    }
  }
  // Sellbird playbooks wrapper (notes copied from the creator's own download onto your machine)
  const sb = path.join(REPOS, 'sellbird', 'skills');
  if (fs.existsSync(sb)) {
    const to = path.join(SK, 'sales-sellbird-playbooks'); fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(sb).filter(f => f.endsWith('.md') && f !== 'README.md')) fs.copyFileSync(path.join(sb, f), path.join(to, f));
    fs.writeFileSync(path.join(to, 'SKILL.md'), `---\nname: sales-sellbird-playbooks\ndescription: "[SALES] B2B sales playbooks (methodology, prospecting, lead qualification, email frameworks, LinkedIn outreach, objection handling, offer strategy, signals). Use when writing outreach, qualifying leads, or planning how to sell."\n---\n\n# Sellbird sales playbooks\n\nRead only the playbook file(s) in this folder that match the task, then apply them:\n\n- sales_methodology.md - overall selling approach\n- prospecting_tactics.md - finding and approaching prospects\n- lead_qualification.md - deciding who is worth pursuing\n- email_frameworks.md - cold email structures\n- linkedin_outreach.md - LinkedIn messaging\n- objection_handling.md - answering pushback\n- offer_strategy.md - shaping the offer\n- account_navigation.md - multi-stakeholder deals\n- selling_to_startups.md - startup buyers\n- signal_playbook.md - buying-signal triggers\n`);
    installed++;
  } else skipped.push('sales-sellbird-playbooks');
}

// ---------- 2. skills written for the book ----------
const own = path.join(here, 'own-skills');
for (const n of fs.readdirSync(own)) { cpDir(path.join(own, n), path.join(SK, n)); installed++; }

// ---------- 3. Google Maps program ----------
const exeName = win ? 'gmaps-scraper.exe' : 'gmaps-scraper';
const exe = path.join(BIN, exeName);
async function getMapsProgram() {
  if (fs.existsSync(exe) || flag('--no-network') || flag('--only-own')) return fs.existsSync(exe);
  const key = win ? 'windows-amd64' : process.platform === 'darwin' ? 'darwin-amd64' : 'linux-amd64';
  try {
    const rel = await (await fetch('https://api.github.com/repos/gosom/google-maps-scraper/releases/latest', { headers: { 'User-Agent': 'lantern-installer' } })).json();
    const asset = (rel.assets || []).find(a => a.name.includes(key));
    if (!asset) { log('No Google Maps program published for this system; skipping.'); return false; }
    log(`Downloading ${asset.name} (${(asset.size / 1048576).toFixed(0)} MB) from github.com/gosom/google-maps-scraper ...`);
    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'lantern-installer' } });
    fs.writeFileSync(exe, Buffer.from(await res.arrayBuffer())); if (!win) fs.chmodSync(exe, 0o755);
    return true;
  } catch (e) { log('Could not download the Google Maps program: ' + e.message); return false; }
}
const SKONLY = flag('--skills-only');
const haveExe = SKONLY ? false : await getMapsProgram();
const gm = path.join(SK, 'sales-google-maps-scraper', 'SKILL.md');
if (fs.existsSync(gm) && !fs.readFileSync(gm, 'utf8').includes('NO-DOCKER OVERRIDE')) {
  fs.appendFileSync(gm, `\n\n## NO-DOCKER OVERRIDE (this computer)\nDocker is not installed here. Ignore the Docker steps above and run the program directly:\n\n\`${exe} -input queries.txt -results results.csv -depth 1 -email -exit-on-inactivity 3m\`\n\n- queries.txt: one search per line, for example \`dentists in Lagos\`\n- Save queries and results in the user's work folder, not inside another project.\n- Start with -depth 1 for a small test, then raise it. Explain progress in simple terms; the user is a beginner.\n- Only collect public business details, respect the source's terms and privacy law.\n`);
}

// ---------- 4. ebook kit ----------
cpDir(path.join(here, 'ebook-kit'), KIT); fs.mkdirSync(path.join(KIT, 'images'), { recursive: true });
if (!flag('--only-own') && !SKONLY) {
  const imgRepo = ensureRepo('images', 'https://github.com/ServiceStack/images.git', ['hero']);
  if (imgRepo) { let n = 0; for (const [name, orig] of Object.entries(imagesMap)) { const src = path.join(imgRepo, 'hero', orig); if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(KIT, 'images', name)); n++; } } log(`ebook kit photos: ${n}`); fs.copyFileSync(path.join(here, 'ebook-kit', 'CATALOG.md'), path.join(KIT, 'images', 'CATALOG.md')); }
  if (!flag('--no-network')) { const r = run('node', [path.join(KIT, 'lib', 'render-art.mjs')]); log(r.status === 0 ? 'ebook kit artwork rendered' : 'artwork not rendered (needs Edge or Chrome and FFmpeg); the book skill still works with photos'); }
}
const ds = path.join(SK, 'design-dreamy-ebook', 'SKILL.md');
if (fs.existsSync(ds)) {
  let t = fs.readFileSync(ds, 'utf8');
  t = t.split('C:\\\\Users\\\\busay\\\\yalo-tools\\\\ebook-kit').join(KIT.replace(/\\/g, '\\\\')).split('C:\\Users\\busay\\yalo-tools\\ebook-kit').join(KIT).split('C:\\Users\\busay\\yalo-tools\\pyenv').join(path.join(L, 'pyenv')).split('C:\\Users\\busay\\.claude\\skills').join(SK);
  fs.writeFileSync(ds, t);
}

// ---------- summary ----------
log(`\nInstalled ${installed} skills into ${SK}`);
if (skipped.length) log(`Skipped (download failed): ${skipped.join(', ')}. Run the installer again to retry.`);
log(haveExe ? `Google Maps program: ${exe}` : 'Google Maps program: not installed');
log(`Ebook kit: ${KIT}`);
log('Next: quit the Claude app completely, open it again, open the Code tab and type /');
