// Start of a "make the next film" session — one command instead of exploring the repo:
//   npm run next            → installs missing deps, marks the session spend, validates ONLY the latest film,
//                             prints the next film number + its story from todo/, the look of the previous films
//                             (sets / palettes / skies, from their video.json) and which docs to read.
//   npm run next -- --all   → the look table for every film (default: the last 10)
//   npm run next -- --style … --brief → the same, but docs as a table of contents (line ranges), the model film as one line
//                             per scene, and only the sets of that style (≈ 6× shorter)
//   npm run next -- --style lego|blocky|2d|pateric|blender → ALSO everything needed to write the film, so nothing else has to
//                             be read: the descriptor docs of that style, the latest film of that style (compact, one line
//                             per beat) and the anchors / buildings of that style's sets
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, parseArgs } from './lib/common.mjs';

const args = parseArgs();
const say = (s = '') => console.log(s);
const head = (s) => say(`\n== ${s}`);

// ---------- 1. dependencies (fast when already installed) ----------
head('Setup');
if (!fs.existsSync(path.join(ROOT, 'node_modules/three'))) {
  say('  installing npm deps…');
  execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: ROOT, stdio: 'inherit' });
}
say('  ✓ npm deps');
const req = createRequire(import.meta.url);
let pw = false;
try { req.resolve('playwright'); pw = true; } catch {
  try { req.resolve(path.join(execSync('npm root -g').toString().trim(), 'playwright')); pw = true; } catch { /* missing */ }
}
say(pw ? '  ✓ playwright' : '  ✗ playwright missing — run scripts/install.sh (needed by still / check / poster)');
let ff = true; try { execSync('ffmpeg -version', { stdio: 'ignore' }); } catch { ff = false; }
say(ff ? '  ✓ ffmpeg' : '  ✗ ffmpeg missing — run scripts/install.sh');
const hasKey = (k) => !!process.env[k] || (fs.existsSync(path.join(ROOT, '.env')) && fs.readFileSync(path.join(ROOT, '.env'), 'utf8').includes(k));
say(hasKey('OPENROUTER_API_KEY') ? '  ✓ OPENROUTER_API_KEY' : '  ✗ OPENROUTER_API_KEY not set (voices / music)');
spawnSync('node', ['tools/spend.mjs', '--mark'], { cwd: ROOT, stdio: 'ignore' });
say('  ✓ session spend marked (npm run spend at the end of every answer)');

// ---------- 2. films ----------
const films = fs.readdirSync(path.join(ROOT, 'videos')).filter((d) => /^\d{3}-/.test(d) && fs.existsSync(path.join(ROOT, 'videos', d, 'video.json'))).sort();
const latest = films[films.length - 1];
const readDesc = (d) => JSON.parse(fs.readFileSync(path.join(ROOT, 'videos', d, 'video.json'), 'utf8'));

// validate only the latest film (smoke test of the toolchain; old films are not touched — rule 14)
head(`Latest film: ${latest}`);
const v = spawnSync('node', ['tools/validate.mjs', `videos/${latest}`], { cwd: ROOT, encoding: 'utf8' });
const vOut = (v.stdout + v.stderr).trim().split('\n');
say('  ' + vOut[0]);
if (v.status !== 0) say(vOut.slice(1).map((l) => '  ' + l).join('\n'));
const ld = path.join(ROOT, 'videos', latest);
const missing = [];
if (/without audio/.test(vOut[0])) missing.push('voices');
if (readDesc(latest).music !== false && !fs.existsSync(path.join(ld, 'audio/music.mp3'))) missing.push('music');
if (!fs.existsSync(path.join(ld, 'poster.jpg'))) missing.push('poster.jpg');
if (missing.length) say(`  ⚠ NOT FINISHED (missing: ${missing.join(', ')}) — finish this film before starting a new one.`);
else say('  ✓ finished (voices, music, poster)');

// ---------- 3. next film + its story ----------
const maxN = Math.max(...films.map((d) => parseInt(d, 10)));
const nextN = maxN + 1;
const todoDir = path.join(ROOT, 'todo');
const todos = fs.existsSync(todoDir) ? fs.readdirSync(todoDir).filter((f) => /^\d{3}-.*\.md$/.test(f)).sort() : [];
const taken = new Set(films.map((d) => d.replace(/^\d{3}-/, '')));
const stale = todos.filter((f) => parseInt(f, 10) <= maxN || taken.has(f.replace(/^\d{3}-/, '').replace(/\.md$/, '')));
const pick = todos.find((f) => parseInt(f, 10) === nextN) || todos.find((f) => parseInt(f, 10) > maxN) || todos[0];
head(`Next film: ${String(nextN).padStart(3, '0')}`);
if (stale.length) say(`  ⚠ todo/ files with a number ≤ ${maxN} or an existing film's slug (fix them: delete if converted, else renumber to the end): ${stale.join(', ')}`);
if (!pick) say('  todo/ is empty — ask the user for a story.');
else {
  const id = `${String(nextN).padStart(3, '0')}-${pick.replace(/^\d{3}-/, '').replace(/\.md$/, '')}`;
  say(`  story: todo/${pick}   →   folder: videos/${id}/   (${todos.length} stories left in todo/)`);
  say('');
  say(fs.readFileSync(path.join(todoDir, pick), 'utf8').trim().split('\n').map((l) => '  │ ' + l).join('\n'));
}

// ---------- 4. the look of the previous films (rule 12: give the new one its own) ----------
head('Look of the previous films (pick a set/palette/sky combination that differs)');
const rows = [];
const used = new Map();
for (const d of films) {
  const desc = readDesc(d);
  const sets = new Map(), skies = new Set(), props = new Set();
  for (const sc of desc.scenes || []) {
    const s = typeof sc.set === 'string' ? { type: sc.set } : sc.set || {};
    const k = `${s.type}${s.palette ? ' ' + s.palette : ''}`;
    if (!sets.has(k)) sets.set(k, new Set());
    for (const x of [s.cells != null ? `cells ${s.cells}` : '', s.church ? 'church' : '', s.road === false ? 'no road' : '', s.dome ? `dome ${s.dome}` : '', s.roofs ? `roofs ${s.roofs}` : '', s.varied ? 'varied' : '']) if (x) sets.get(k).add(x);
    if (sc.sky) skies.add(sc.sky);
    for (const p of Object.values(sc.props || {})) props.add(p.type);
  }
  for (const k of sets.keys()) { const [t, p] = k.split(' '); const key = `${t}:${p || 'default'}`; used.set(key, (used.get(key) || 0) + 1); }
  const eng = [desc.engine === '2d' ? '2D' : desc.style === 'blocky' ? 'blocky' : desc.style === 'blender' ? 'blender' : 'LEGO', desc.style && desc.engine === '2d' ? desc.style : ''].filter(Boolean).join(' ');
  rows.push(`  ${d.slice(0, 3)} ${eng.padEnd(10)} ${[...sets].map(([k, x]) => k + (x.size ? ` (${[...x].join(', ')})` : '')).join('; ')} | ${[...skies].join(', ')} | ${[...props].join(', ')}`);
}
say((args.all ? rows : rows.slice(-10)).join('\n'));
// faces of the 2D pateric films (AGENTS.md rule 16: don't give the monks the same faces film after film)
const faceRows = [];
for (const d of films) {
  const desc = readDesc(d);
  if (desc.engine !== '2d' || desc.style !== 'pateric') continue;
  const f = Object.entries(desc.characters || {}).filter(([, c]) => c.look).map(([id, c]) => {
    const L = c.look, keys = ['faceShape', 'eyes', 'brows', 'nose', 'beardStyle'].map((k) => L[k]).filter(Boolean);
    return `${id}: ${L.beard || 'short'} beard${keys.length ? ' ' + keys.join('/') : ' (reference face)'}`;
  });
  faceRows.push(`  ${d.slice(0, 3)} ${f.join(' · ')}`);
}
if (faceRows.length) say('\n  faces of the pateric films (vary them — rule 16):\n' + faceRows.slice(-4).join('\n'));
try {
  const S = await import('../lib/components/sets.js');
  const offer = [['desert-lavra', S.LAVRA_PALETTES], ['desert-road', S.DESERT_PALETTES], ['nile-bank', S.NILE_PALETTES]];
  say('\n  palettes (× films that used them):');
  for (const [type, P] of offer) if (P) say(`    ${type.padEnd(13)} ` + Object.keys(P).map((p) => `${p}×${[...used].filter(([k]) => k === `${type}:${p}` || (p === Object.keys(P)[0] && k === `${type}:default`)).reduce((a, [, n]) => a + n, 0)}`).join('  '));
  say(`    other sets: ${Object.keys(S.SETS).filter((t) => !offer.some(([o]) => o === t)).join(', ')}; 2D: lavra2d, hermitage2d`);
} catch (e) { say('  (palettes: ' + e.message + ')'); }

// ---------- 4b. the consistency rule, BEFORE writing anything: the film must be right the first time ----------
try {
  const rule = /^17\. \*\*[\s\S]*?(?=\n## )/m.exec(fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'))?.[0];
  if (rule) {
    head('Write it right the first time — AGENTS.md rules 17–18 (logic of every beat + the story itself; the beat sheets only confirm)');
    say(rule.replace(/^17\. /, '').split('\n').map((l) => '  ' + l.trim()).join('\n'));
  }
} catch {}

// ---------- 5. what to read (or, with --style, print it all) ----------
const STYLES = {
  lego: { docs: ['DESCRIPTOR.md', 'DESCRIPTOR-lego.md'], is: (d) => d.engine !== '2d' && d.style !== 'blocky' },
  blocky: { docs: ['DESCRIPTOR.md', 'DESCRIPTOR-lego.md', 'DESCRIPTOR-blocky.md'], is: (d) => d.engine !== '2d' && d.style === 'blocky' },
  '2d': { docs: ['DESCRIPTOR.md', 'DESCRIPTOR-2d.md'], is: (d) => d.engine === '2d' && d.style !== 'pateric' },
  pateric: { docs: ['DESCRIPTOR.md', 'DESCRIPTOR-2d.md', 'DESCRIPTOR-pateric.md'], is: (d) => d.engine === '2d' && d.style === 'pateric' },
  blender: { docs: ['DESCRIPTOR.md', 'DESCRIPTOR-blender.md'], is: (d) => d.engine !== '2d' && d.style === 'blender' },
};
const style = typeof args.style === 'string' ? args.style.toLowerCase() : null;
if (!style || !STYLES[style]) {
  head('Read next (only what the chosen style needs)');
  say('  /plan-video skill (workflow + past issues), then ONE command prints the rest (docs, model film, set anchors):');
  say('    npm run next -- --style lego | blocky | 2d | pateric | blender');
  if (style) say(`  ✗ unknown style "${style}"`);
} else {
  const S = STYLES[style];
  const brief = !!args.brief;
  for (const f of S.docs) {
    const txt = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8').trim();
    if (!brief) { head(`docs/${f}`); say(txt); continue; }
    // --brief: only the table of contents, with the line ranges to read (sed -n a,bp docs/f) when a section is needed
    head(`docs/${f} — contents (read a section with: sed -n A,Bp docs/${f})`);
    const L = txt.split('\n'), hs = [];
    L.forEach((l, i) => { if (/^#{2,3} /.test(l) || /^\* `[a-z0-9-]+` \(skies/.test(l)) hs.push([i + 1, l.replace(/^\* /, '  set ').slice(0, 110)]); });
    hs.forEach(([n, l], i) => say(`  ${n}-${(hs[i + 1]?.[0] ?? L.length + 1) - 1}  ${l}`));
  }
  const model = [...films].reverse().find((d) => S.is(readDesc(d)));
  if (model) {
    const d = readDesc(model);
    head(`Model film (latest ${style}): videos/${model}/video.json — compact, one line per beat`);
    const { scenes, characters, ...top } = d;
    say('top: ' + JSON.stringify(top));
    say('characters:'); for (const [k, c] of Object.entries(characters || {})) say(`  ${k}: ${JSON.stringify(c)}`);
    for (const sc of scenes || []) {
      const { beats, ...rest } = sc;
      if (brief) { say(`scene ${sc.id} · ${JSON.stringify(sc.set)} · ${sc.sky} · ${(beats || []).length} beats · cast ${Object.keys(sc.cast || {}).join(',')}`); continue; }
      say(`scene ${JSON.stringify(rest)}`);
      for (const b of beats || []) say(`  ${JSON.stringify(b)}`);
    }
    if (brief) say(`  (full beats: npm run next -- --style ${style}, or node -e on videos/${model}/video.json for one scene)`);
  }
  head(`Anchors of the ${style} sets ([x, z] studs; heading° — 0 faces +z, the camera side) and buildings [x, z, w, d]`);
  try {
    const { getLayout } = await import('../lib/components/layouts.js');
    const twoD = style === '2d' || style === 'pateric';
    if (style === 'blender') for (const f of fs.readdirSync(path.join(ROOT, 'assets/sets')).filter((f) => f.endsWith('.json'))) {
      const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sets', f), 'utf8'));
      const an = Object.entries(J.anchors || {}).map(([k, a]) => `${k}[${(a.pos || a).slice?.(0, 3).map((v) => +(+v).toFixed(1)).join(',')}]`);
      say(`  ${f.replace('.json', '')} (GLB): ${an.join('  ')}`);
    }
    const SETS = brief && style === 'blender' ? [] : twoD ? [{ type: 'lavra2d', cells: 2 }, { type: 'lavra2d', cells: 3 }, { type: 'lavra2d', cells: 4 }, { type: 'hermitage2d' }]
      : ['desert-lavra', 'desert-road', 'egypt-village', 'nile-bank', 'wheat-field', 'desert-hermitage', 'cave-hermitage'].map((type) => ({ type }));
    for (const def of SETS) {
      let L; try { L = getLayout(def); } catch { continue; }
      const an = Object.entries(L.anchors || {}).map(([k, a]) => `${k}[${a.pos.map((v) => +v.toFixed(1)).join(',')}]${a.h ? ' ' + Math.round(a.h * 180 / Math.PI) + '°' : ''}`);
      say(`  ${def.type}${def.cells ? ' cells ' + def.cells : ''}: ${an.join('  ')}`);
      const boxes = [...(L.cells || []), ...(L.church ? [{ name: 'church', ...L.church }] : []), ...(L.rocks || [])].filter((c) => c.w);
      if (boxes.length) say(`    buildings: ${boxes.map((c) => `${c.name || 'church'}[${c.x},${c.z},${c.w},${c.d}]`).join('  ')}`);
    }
  } catch (e) { say('  (anchors: ' + e.message + ')'); }
}
