// The publish gate — exactly what the YouTube publish workflow runs before it renders, so a film that passes here passes there.
//
//   npm run gate -- videos/043-x      # these films (also a film already on YouTube, to re-publish it on purpose) — an agent
//                                     # runs this for the film it edits before ending a turn; it must end with "gate passed"
//   npm run gate                      # every film that main would publish (no youtube.json yet, voiced, music) — the workflow
//   npm run gate -- --list            # only print the pending film ids (the workflow's `plan` step uses this)
//   options: --no-test (skip `npm test`)
//
// Films already on YouTube (videos/<id>/youtube.json) are NOT pending, even when their video.json changed after the upload:
// they are published and approved, so later library / engine changes that make `npm run check` flag them must not block
// the new films. Re-publish one on purpose with the workflow's `videos` input (workflow_dispatch) or `npm run publish`.
// Steps: 1) `npm test` 2) per film: every line voiced, music present, `record.mjs --check` without blocking warnings
// (tools/lib/checkgate.mjs, { cuts: false } as in tools/publish.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs, resolveVideoDir, loadVideo, ROOT } from './lib/common.mjs';
import { ytInfo } from './youtube.mjs';
import { blocking, warningLines, MINOR_DEPTH, APPROVED_PROP_DEPTH } from './lib/checkgate.mjs';

/** why a film can't be published yet (null = ready) */
export function notReady(dir) {
  const { desc, timeline } = loadVideo(dir);
  if (timeline.missingAudio) return `${timeline.missingAudio} lines without audio`;
  const missingSound = timeline.sounds.find(({ file }) => !fs.existsSync(path.join(dir, 'audio', file)));
  if (missingSound) return `missing audio/${missingSound.file}`;
  if (desc.music !== false && !fs.existsSync(path.join(dir, 'audio/music.mp3'))) return 'no music';
  return null;
}

/** films main publishes on its own: not on YouTube yet and ready. `log(msg, level)` explains each decision. */
export function pendingFilms(log = () => {}) {
  const ids = [], published = [];
  for (const v of fs.readdirSync(path.join(ROOT, 'videos')).sort()) {
    const d = path.join(ROOT, 'videos', v);
    if (v.startsWith('_') || !fs.existsSync(path.join(d, 'video.json'))) continue;
    if (ytInfo(d)) { published.push(v); continue; }
    const why = notReady(d);
    if (why) { log(`${v}: ${why} — not published yet`, 'warning'); continue; }
    ids.push(v); log(`${v}: NEW → publish`);
  }
  log(`${published.length} film(s) already on YouTube — not checked, not re-published`);
  return ids;
}

const run = (cmd, a, capture) => new Promise((res) => {
  const p = spawn(cmd, a, { cwd: ROOT, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  let out = ''; p.stdout?.on('data', (d) => { out += d; process.stdout.write(d); });
  p.on('exit', (code) => res({ code, out }));
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  const gh = !!process.env.GITHUB_ACTIONS;
  const log = (m, level) => console.log(level && gh ? `::${level}::${m}` : m);

  if (args.list) {
    const ids = pendingFilms(log);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ids=${JSON.stringify(ids)}\n`);
    else console.log(JSON.stringify(ids));
    process.exit(0);
  }

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) { console.error('✗ node_modules missing — run `npm ci` (or `npm run next`) first'); process.exit(1); }
  const dirs = args._.length ? args._.map(resolveVideoDir) : pendingFilms(log).map((v) => path.join(ROOT, 'videos', v));
  const problems = [];
  if (!args['no-test']) {
    console.log('\n-- npm test');
    const t = await run('npm', ['test', '--silent'], false);
    if (t.code) problems.push('npm test fails');
  }
  for (const d of dirs) {
    const id = path.basename(d);
    const why = notReady(d);
    if (why) { problems.push(`${id}: ${why}`); continue; }
    console.log(`\n-- checks ${id}`);
    const { out } = await run(process.execPath, [path.join(ROOT, 'tools/record.mjs'), '--check', path.relative(ROOT, d)], true);
    const bad = blocking(out, { cuts: false }), minor = warningLines(out).length - bad.length;
    if (minor) console.log(`   ${minor} minor contact(s) ≤ ${MINOR_DEPTH} (held props ≤ ${APPROVED_PROP_DEPTH}) / jump cut(s) — not blocking`);
    if (bad.length || !/no problems found|⚠/.test(out)) problems.push(`${id}: npm run check reports problems${bad.length ? ':\n    ' + bad.map((l) => l.trim()).join('\n    ') : ''}`);
  }
  if (!dirs.length) console.log('\nNo film to publish (every ready film is already on YouTube).');
  if (problems.length) { console.error('\n✗ gate FAILED — main would not publish:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`\n✓ gate passed: ${dirs.map((d) => path.basename(d)).join(' ') || '(no films)'}`);
}
