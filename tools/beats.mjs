// The introspection step (AGENTS.md "Look at every beat"): every beat of the film as a row of frames from its first to its
// last moment, with its line and its actions written above — so one can READ the film beat by beat and catch what a
// single still per beat hides: someone visible for one frame, a basket full before anyone picked, a gesture before the
// walk ends, a line whose action never shows.
//   npm run beats -- videos/<id>                 → stills/beats-01.jpg, beats-02.jpg … (2–4 beats per sheet)
//   npm run beats -- videos/<id> --scene a,b     only these scenes
//   npm run beats -- videos/<id> --changed       only the scenes changed since the last sheets (scene json, its lines'
//                                                audio, characters, set GLB, engine code) — what `produce` runs
// A beat row = 5 frames: start, ¼, ½, ¾, end (the first beat of a scene starts at the scene's first frame, so what is on
// screen during the fade-in shows too). Busy beats (walks, gives, shows, several actions) take the room of two.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { serve } from './serve.mjs';
import { parseArgs, resolveVideoDir, loadVideo, loadPlaywright, ROOT, browserArgs } from './lib/common.mjs';
import { useRemote, runRemote } from './lib/remote.mjs';
import { composeSheet, saveDataURL, mmss } from './lib/sheet.mjs';

const args = parseArgs();
// on a RunPod GPU when RUNPOD_KEY is set (tools/lib/remote.mjs); --local keeps it here
const dir = resolveVideoDir(args._[0]);
const rel = path.relative(ROOT, dir);
const { timeline: tl } = loadVideo(dir);
const outDir = path.join(dir, 'stills');
fs.mkdirSync(outDir, { recursive: true });
// --changed: a hash per scene of everything that changes its pictures; unchanged scenes keep the sheets already read
const stateFile = path.join(outDir, 'beats-state.json');
const { desc } = loadVideo(dir);
const hashOf = (() => {
  const H = (x) => crypto.createHash('sha1').update(x).digest('hex').slice(0, 16);
  const code = H(['lib/engine3', 'lib/engine'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.js$/.test(f) && !/check|lint/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, d, f)))).join(''));
  const lines = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'audio/lines.json'), 'utf8')); } catch { return {}; } })();
  return (sid) => {
    const sc = desc.scenes.find((x) => x.id === sid) || {};
    const glb = path.join(ROOT, 'assets/sets', (sc.set?.type || '') + '.glb');
    const g = fs.existsSync(glb) ? fs.statSync(glb).size + ':' + fs.statSync(glb).mtimeMs : '';
    const voices = tl.speeches.filter((sp) => sp.scene === sid).map((sp) => sp.key + ':' + (lines[sp.key]?.duration ?? '')).join('|');
    return H(JSON.stringify(sc) + JSON.stringify(desc.characters) + voices + g + code);
  };
})();
const state = (() => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } })();
let keep = args.scene ? new Set(String(args.scene).split(',')) : null;
if (args.changed) {
  keep = new Set(tl.scenes.map((s) => s.id).filter((id) => state[id] !== hashOf(id)));
  if (!keep.size) { console.log('no scene changed since the last beat sheets — nothing new to read'); process.exit(0); }
  console.log(`changed scenes: ${[...keep].join(', ')} (the others keep the sheets already read)`);
}
if (useRemote(args)) {
  // on the pod: only the chosen scenes; the state of what was read stays here
  const rest = process.argv.slice(2).filter((a, i, A) => a !== '--changed' && a !== '--scene' && A[i - 1] !== '--scene');
  const code = await runRemote('beats.mjs', [...rest, ...(keep ? ['--scene', [...keep].join(',')] : [])]);
  if (!code) { for (const sc of tl.scenes) if (!keep || keep.has(sc.id)) state[sc.id] = hashOf(sc.id); fs.writeFileSync(stateFile, JSON.stringify(state, null, 1)); }
  process.exit(code);
}
for (const f of fs.readdirSync(outDir)) if (/^beats-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(outDir, f));
const short = (a) => Object.entries(a).filter(([k]) => !['wait', 'speed', 'style', 'distance', 'duration', 'hand'].includes(k))
  .map(([k, v]) => (k === 'at' ? `+${+(+v).toFixed(2)}s` : `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)).join(' ');
const rows = [];
for (const sc of tl.scenes) {
  if (keep && !keep.has(sc.id)) continue;
  for (const b of sc.beats) {
    const t0 = b.index === 0 ? sc.start + 0.03 : b.start + 0.03, t1 = b.end - 0.05;
    const acts = [].concat(b.def.do || []);
    const busy = acts.length >= 3 || acts.some((a) => a.walk || a.give || a.show !== undefined || a.bend !== undefined || a.put || a.hug);
    const line = b.speech ? `${b.speech.speaker}: „${b.speech.text}”` : (b.card ? `[card ${b.card.title}]` : '(no line)');
    const title = `${sc.id}#${b.index}  ${mmss(t0)}–${mmss(t1)}  ${line}${acts.length ? '   ▸ ' + acts.map(short).join(' | ') : ''}`;
    const tiles = [0, 0.25, 0.5, 0.75, 1].map((k) => { const t = t0 + (t1 - t0) * k; return { t, label: mmss(t) }; });
    rows.push({ weight: busy ? 2 : 1, section: { title, titleH: 52, titleSize: 17, cols: 5, tiles } });
  }
}
const sheets = [];
let cur = [], w = 0;
for (const r of rows) {
  if (cur.length && w + r.weight > 4) { sheets.push(cur); cur = []; w = 0; }
  cur.push(r.section); w += r.weight;
}
if (cur.length) sheets.push(cur);

const { chromium } = loadPlaywright();
const { server, port } = await serve(0);
const browser = await chromium.launch({ args: browserArgs(args) });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`http://127.0.0.1:${port}/lib/engine/render.html?video=${rel}&scale=0.5&quality=draft`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const files = [];
  for (const [i, secs] of sheets.entries()) {
    const f = path.join(outDir, `beats-${String(i + 1).padStart(2, '0')}.jpg`);
    await saveDataURL(fs, f, await composeSheet(page, secs, { width: 1640 }));
    files.push(path.relative(ROOT, f));
    process.stdout.write(`\r sheet ${i + 1}/${sheets.length}`);
  }
  console.log(`\n${rows.length} beats on ${files.length} sheets — READ EVERY ONE against the consistency rule (AGENTS.md "Look at every beat"):`);
  for (const f of files) console.log('  ' + f);
  for (const sc of tl.scenes) if (!keep || keep.has(sc.id)) state[sc.id] = hashOf(sc.id);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));
} finally { await browser.close(); server.close(); }
