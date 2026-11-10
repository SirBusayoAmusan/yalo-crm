#!/usr/bin/env node
// Enrich a CSV of leads with emails from the ContactOut API.
// Usage: node contactout-enrich.mjs --in leads.csv --out enriched.csv [--max 25] [--include-phone] [--dry-run]
// Input columns (header row required): full_name, company, company_domain, title, linkedin_url
// Key: CONTACTOUT_API_KEY environment variable (never stored in files).
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const inFile = opt('--in'), outFile = opt('--out', 'enriched.csv');
const max = Number(opt('--max', 25)), dry = flag('--dry-run'), phone = flag('--include-phone');
if (!inFile) { console.error('Usage: node contactout-enrich.mjs --in leads.csv --out enriched.csv [--max 25] [--include-phone] [--dry-run]'); process.exit(2); }
const KEY = process.env.CONTACTOUT_API_KEY;
if (!dry && !KEY) { console.error('Set CONTACTOUT_API_KEY in the environment first.'); process.exit(2); }

function parseCsv(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; if (r.some(x => x !== '')) rows.push(r); r = []; }
    else f += c;
  }
  if (f !== '' || r.length) { r.push(f); if (r.some(x => x !== '')) rows.push(r); }
  return rows;
}
const esc = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

const [head, ...body] = parseCsv(fs.readFileSync(inFile, 'utf8'));
if (!head) { console.error('Empty input file.'); process.exit(2); }
const h = head.map(x => x.trim().toLowerCase());
const leads = body.map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));

const plan = leads.slice(0, max).map(l => ({
  lead: l,
  mode: l.linkedin_url ? 'profile' : (l.full_name && (l.company || l.company_domain) ? 'enrich' : 'skip'),
}));
const calls = plan.filter(p => p.mode !== 'skip').length;
console.log(`${leads.length} leads in file; processing ${plan.length} (limit --max ${max}).`);
console.log(`API calls: ${calls} (${plan.filter(p => p.mode === 'profile').length} by LinkedIn URL, ${plan.filter(p => p.mode === 'enrich').length} by name+company, ${plan.filter(p => p.mode === 'skip').length} skipped: missing data).`);
console.log(`Worst case credits: up to ${calls} email credits${phone ? ` + ${calls} phone credits` : ''}, plus search credits for name+company lookups.`);
if (dry) { console.log('Dry run: nothing sent.'); process.exit(0); }

const BASE = 'https://api.contactout.com';
const hdr = { token: KEY, Accept: 'application/json', 'Content-Type': 'application/json' };
// Pull emails out of an unknown response shape: any string containing '@' under a key containing 'email'.
function emails(o, key = '', out = []) {
  if (typeof o === 'string') { if (/email/i.test(key) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o)) out.push({ email: o, type: /work/i.test(key) ? 'work' : /personal/i.test(key) ? 'personal' : 'unknown' }); }
  else if (Array.isArray(o)) o.forEach(x => emails(x, key, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) emails(v, key + '.' + k, out);
  return out;
}
async function call(p) {
  const l = p.lead;
  let res;
  if (p.mode === 'profile') {
    const u = new URL(BASE + '/v1/people/linkedin'); u.searchParams.set('profile', l.linkedin_url); if (phone) u.searchParams.set('include_phone', 'true');
    res = await fetch(u, { headers: hdr });
  } else {
    const b = { full_name: l.full_name, include: ['work_email', ...(phone ? ['phone'] : [])] };
    if (l.company) b.company = [l.company]; if (l.company_domain) b.company_domain = [l.company_domain]; if (l.title) b.job_title = l.title;
    res = await fetch(BASE + '/v1/people/enrich', { method: 'POST', headers: hdr, body: JSON.stringify(b) });
  }
  return res;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cols = ['full_name', 'title', 'company', 'company_domain', 'linkedin_url', 'email', 'email_type', 'source', 'status'];
const out = [cols.join(',')];
let found = 0, none = 0, errs = 0;
for (const p of plan) {
  const l = p.lead; let email = '', type = '', status = '';
  if (p.mode === 'skip') status = 'skipped_missing_data';
  else {
    try {
      const res = await call(p);
      if (res.status === 401 || res.status === 403) { console.error(`Auth error ${res.status}: check the API key and that your plan includes API access. Stopping.`); break; }
      if (res.status === 429) { console.error('Rate limited (429). Stopping; try again later.'); status = 'rate_limited'; errs++; out.push(cols.map(c => esc(c === 'status' ? status : l[c] ?? '')).join(',')); break; }
      if (res.status === 404) { status = 'no_profile'; none++; }
      else if (!res.ok) { status = `error_${res.status}`; errs++; }
      else {
        const e = emails(await res.json());
        const pick = e.find(x => x.type === 'work') || e[0];
        if (pick) { email = pick.email; type = pick.type; status = 'found'; found++; } else { status = 'no_email'; none++; }
      }
    } catch (e) { status = 'error_network'; errs++; }
    await sleep(1100); // stay under 60 requests/minute
  }
  out.push([l.full_name, l.title, l.company, l.company_domain, l.linkedin_url, email, type, p.mode === 'skip' ? '' : 'contactout', status].map(esc).join(','));
}
fs.writeFileSync(outFile, out.join('\n') + '\n');
console.log(`Done. found ${found}, no email ${none}, errors ${errs}. Wrote ${outFile}. This file contains personal data: do not commit or share it.`);
