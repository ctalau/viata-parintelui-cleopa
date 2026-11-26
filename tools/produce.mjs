// Everything after the staging, in ONE command (fewer agent turns):
//   npm run produce -- videos/<id> [--done] [--no-stills] [--no-music] [--force-music] [--force]  (--force: render even with blocking timeline lints)
//
//   1. validate (Hints)
//   2. in parallel:  voices (retries failed lines, prunes old wavs) → transcription --check
//                    music (only if audio/music.mp3 is missing, or --force-music)
//   3. full stills with the real timings + runtime checks   (skip with --no-stills)
//   4. poster.jpg  ·  5. site build (dist/)  ·  6. session spend
//   → one short report: what to re-voice, check warnings, files to LOOK AT (contact sheet, poster).
//   --done: if everything is clean, also deletes the film's story from todo/ (still look at the stills before committing!).
// The full output of every step is in videos/<id>/stills/produce.log (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, parseArgs, resolveVideoDir } from './lib/common.mjs';
import { blocking } from './lib/checkgate.mjs';

const args = parseArgs();
const dir = resolveVideoDir(args._[0]);
const rel = path.relative(ROOT, dir);
const id = path.basename(dir);
fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
const logPath = path.join(dir, 'stills', 'produce.log');
fs.writeFileSync(logPath, '');
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const step = (s) => console.log(`[${secs()}] ${s}`);

// run a tool, log everything, return { code, out }
function tool(name, argv) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'tools', name), ...argv], { cwd: ROOT, env: process.env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      fs.appendFileSync(logPath, `\n===== ${name} ${argv.join(' ')} (exit ${code})\n${out}`);
      resolve({ code, out });
    });
  });
}
const grab = (out, re) => out.split('\n').filter((l) => re.test(l));

const report = { hints: [], revoice: [], glitches: 0, voiceErrors: [], music: '', checks: [], site: [], duration: '' };

// 1. validate
step('validate');
const v = await tool('validate.mjs', [rel]);
if (v.code) { console.log(v.out); process.exit(1); }
report.hints = grab(v.out, /^\s+(Hint|·|-)/).slice(0, 12);
// the timeline lints that the renderer's checks would fail anyway (head snaps, a walk into a line, a door through someone,
// a look at the ground, someone walking through the set): stop here, in seconds, instead of after a 5-minute render (film 050
// needed four produce rounds for these). --force renders anyway.
const lintStop = grab(v.out, /·\s+(staging (snap|look-low|late-walk|door|set):|motion:.*back to the camera)/);
// (only for a film not yet on YouTube: the published ones passed the gate and are not to be re-staged — AGENTS.md rule 14)
if (lintStop.length && !args.force && !fs.existsSync(path.join(dir, 'youtube.json'))) {
  console.log('\n✗ the timeline already shows problems the render checks would report — fix them first (npm run validate), or --force:');
  for (const l of lintStop) console.log('  ' + l.trim());
  process.exit(1);
}

// 2. voices ∥ music
step('voices + music (in parallel)');
const voices = (async () => {
  let r;
  for (let i = 0; i < 3; i++) {                       // the TTS sometimes fails a line: voice only the missing ones again
    r = await tool('voice.mjs', [rel, '--prune']);
    if (!r.code && !/\(\d*[1-9]\d* missing\)/.test(r.out)) break;
  }
  report.voiceErrors = grab(r.out, /✗/);
  const c = await tool('voice.mjs', [rel, '--check']);
  report.checkRan = !c.code || /⚠|·|✓/.test(c.out);
  // keep the ⚠ blocks (3 lines each), count the · glitches
  const L = c.out.split('\n');
  L.forEach((l, i) => { if (/^\s+⚠ /.test(l)) report.revoice.push(L.slice(i, i + 3).join('\n')); });
  report.glitches = L.filter((l) => /^\s+· /.test(l)).length;
  report.duration = (grab(c.out, /Total duration/)[0] || '').trim();
})();
const musicJob = (async () => {
  const mp3 = path.join(dir, 'audio', 'music.mp3');
  if (args['no-music']) { report.music = 'skipped (--no-music)'; return; }
  if (fs.existsSync(mp3) && !args['force-music']) { report.music = 'exists ✓'; return; }
  for (let i = 0; i < 2; i++) {
    const r = await tool('music.mjs', [rel, ...(args['force-music'] ? ['--force'] : [])]);
    if (!r.code) { report.music = (grab(r.out, /Saved/)[0] || 'made ✓').trim(); return; }
    report.music = `✗ failed: ${r.out.trim().split('\n').pop()}`;
  }
})();
await Promise.all([voices, musicJob]);

// 3. stills + checks (with the real timings)
if (!args['no-stills']) {
  step('stills + checks');
  const s = await tool('record.mjs', ['--stills', rel, '--with-poster']);
  report.checks = grab(s.out, /^checks:|⚠ \[/);
  if (s.code && !report.checks.length) report.checks = ['✗ stills failed — see produce.log'];
} else {
  step('checks');
  const s = await tool('record.mjs', ['--check', rel]);
  report.checks = grab(s.out, /^checks:|⚠ \[/);
}

// the introspection step: every beat as a row of frames (tools/beats.mjs) — the agent READS every sheet (AGENTS.md)
if (!args['no-stills']) {
  step('beat sheets');
  const bs = await tool('beats.mjs', [rel, ...(args['all-beats'] ? [] : ['--changed'])]); // only the scenes changed since the last sheets
  report.beats = grab(bs.out, /beats-\d+\.jpg/).map((l) => l.trim());
}

// 4. poster  5. site
step('poster + site');
const po = await tool('record.mjs', ['--poster', rel]);
const site = await tool('site.mjs', []);
report.site = [...grab(site.out, /⚠|Site built/), ...(po.code ? ['✗ poster failed — see produce.log'] : [])];
const sp = await tool('spend.mjs', []);

// ---------- report ----------
const clean = !report.revoice.length && !report.voiceErrors.length && !/✗/.test(report.music)
  && (report.checks.some((l) => /no problems found/.test(l)) || (report.checks.some((l) => /⚠/.test(l)) && !blocking(report.checks.join('\n')).length)) && !report.site.some((l) => /⚠|✗/.test(l));
const say = (s = '') => console.log(s);
say(`\n== ${id}  (${secs()})`);
say(`  ${report.duration}`);
if (report.hints.length) say('  hints:\n' + report.hints.map((h) => '    ' + h.trim()).join('\n'));
say(`  voices: ${report.voiceErrors.length ? report.voiceErrors.join('; ') : 'all voiced ✓'}`);
say(`  voice check: ${report.checkRan === false ? '✗ did not run — see produce.log' : `${report.revoice.length} to re-voice (⚠)${report.revoice.length ? ' — listed below' : ' ✓'}, ${report.glitches} transcription glitch(es) (· ignore)`}`);
for (const b of report.revoice) say(b);
say(`  music: ${report.music}`);
for (const l of report.checks) say(`  ${l.trim()}`);
for (const l of report.site) say(`  ${l.trim()}`);
say(`  LOOK AT (one image: every still labelled, the stills of the check warnings, the poster): ${rel}/stills/contact.jpg`);
{ const d = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8')); if (d.poster && typeof d.poster === 'object') say(`  LOOK AT the composed poster: ${rel}/poster.jpg`); }
if (report.beats && !report.beats.length) say('  beat sheets: no scene changed since the last ones (--all-beats to redo every sheet)');
if (report.beats?.length) say(`  READ every beat sheet against AGENTS.md rule 17 (nothing pops, states change through actions, words are seen…) — ${report.beats.length} sheets: ${report.beats[0]} … ${report.beats[report.beats.length - 1]}`);
say(`  log: ${path.relative(ROOT, logPath)}`);

if (args.done) {
  // the story file may carry another number than the film (todo/033-x.md → videos/032-x): match by the slug
  const slug = id.replace(/^\d+-/, '');
  const todo = [path.join(ROOT, 'todo', `${id}.md`), ...fs.readdirSync(path.join(ROOT, 'todo')).filter((f) => f.replace(/^\d+-/, '') === `${slug}.md`).map((f) => path.join(ROOT, 'todo', f))].find((f) => fs.existsSync(f)) || '';
  if (!clean) say('  --done: not clean, todo/ story kept');
  else if (todo && fs.existsSync(todo)) { fs.unlinkSync(todo); say(`  --done: deleted todo/${path.basename(todo)}`); }
}
say(clean ? '\n  ✓ ready to commit (after looking at the pictures)' : '\n  ✗ not ready — fix the items above');
say('\n' + sp.out.split('\n').filter((l) => l.trim() && !l.startsWith('>')).join('\n'));
process.exitCode = clean ? 0 : 1;
