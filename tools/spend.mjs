// What did THIS session spend? OpenRouter (voices, music, transcription checks) and RunPod (renders).
//
//   npm run spend                 # spend since the start of this session (what goes at the end of every answer)
//   npm run spend -- --mark       # remember "now" as the session start (the SessionStart hook does this; no-op if set)
//   npm run spend -- --mark --force   # restart the counter
//   npm run spend -- --all        # + the history: this month on OpenRouter, every RunPod pod ever (costs/runpod.jsonl)
//
// OpenRouter has no per-session number, so we snapshot the key's lifetime `usage` (GET /api/v1/key) at session start
// in .cache/openrouter-session.json (git-ignored, dies with the container) and report the difference.
// RunPod: costs/runpod.jsonl (git-ignored, local to the container: no merge conflicts between branches) — pods started after the session mark, with the real billed amount when
// RunPod already has it (billing lags a few minutes; never less than our estimate).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, apiKey, env, ROOT } from './lib/common.mjs';

const args = parseArgs();
const usd = (x) => (x == null ? '?' : `$${x.toFixed(x < 1 ? 4 : 2)}`);
const MARK = path.join(ROOT, '.cache', 'openrouter-session.json');

async function orKey() {
  const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${apiKey()}` }, signal: AbortSignal.timeout(15000) });
  return (await r.json()).data;
}

if (args.mark) {
  if (fs.existsSync(MARK) && !args.force) process.exit(0);
  let usage = null;
  try { usage = (await orKey()).usage; } catch (e) { if (!args.quiet) console.error('OpenRouter: ' + e.message); }
  fs.mkdirSync(path.dirname(MARK), { recursive: true });
  fs.writeFileSync(MARK, JSON.stringify({ usage, date: new Date().toISOString() }));
  if (!args.quiet) console.log(`Session spend counter started (${new Date().toISOString()})`);
  process.exit(0);
}

let mark = fs.existsSync(MARK) ? JSON.parse(fs.readFileSync(MARK, 'utf8')) : null;
const lines = [];

// ---- OpenRouter
try {
  const k = await orKey();
  if (!mark || mark.usage == null) {
    mark = { usage: k.usage, date: mark?.date || new Date().toISOString() };
    fs.mkdirSync(path.dirname(MARK), { recursive: true });
    fs.writeFileSync(MARK, JSON.stringify(mark));
    lines.push(`OpenRouter (sesiunea asta): $0.0000 — contorul pornește acum (nu exista un punct de start)`);
  } else {
    lines.push(`OpenRouter: ${(Math.max(0, k.usage - mark.usage)).toFixed(2)}$`);   // AGENTS.md rule 13: the last line of every answer
  }
  if (args.all) lines.push(`OpenRouter (istoric): ${usd(k.usage_monthly)} luna asta cu această cheie, ${usd(k.usage)} de la crearea cheii (limită ${usd(k.limit)})`);
} catch (e) { lines.push(`OpenRouter: ? (${e.message})`); }

// ---- RunPod
const ledgerF = path.join(ROOT, 'costs', 'runpod.jsonl');
const ledger = fs.existsSync(ledgerF) ? fs.readFileSync(ledgerF, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const session = ledger.filter((e) => mark && e.date >= mark.date);
const billed = {};
const rk = env('RUNPOD_KEY') || env('RUNPOD_API_KEY');
const wanted = args.all ? ledger : session;
if (rk && wanted.length) {
  try {
    const start = wanted.map((e) => e.date).sort()[0].slice(0, 10) + 'T00:00:00Z';
    const r = await fetch(`https://rest.runpod.io/v1/billing/pods?bucketSize=day&grouping=podId&startTime=${start}`, { headers: { Authorization: `Bearer ${rk}` }, signal: AbortSignal.timeout(15000) });
    for (const b of await r.json()) billed[b.podId] = (billed[b.podId] || 0) + b.amount;
  } catch {}
}
const real = (e) => Math.max(billed[e.pod] || 0, e.est || 0);
const sum = (l) => l.reduce((s, e) => s + real(e), 0);
if (session.length) lines.push(`RunPod: ${sum(session).toFixed(2)}$`);
if (args.all) lines.push(`RunPod (istoric):     ${usd(sum(ledger))} pentru lego-shorts (${ledger.length} poduri)`);
console.log(lines.join('\n'));
