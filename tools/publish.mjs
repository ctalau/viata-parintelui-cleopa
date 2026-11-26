// Batch: render several films on ONE RunPod GPU pod, then upload them to YouTube.
//
//   npm run publish -- --pending                  # every film that is not on YouTube yet
//   npm run publish -- --pending --changed        # + films changed since their upload (uploads a NEW video)
//   npm run publish -- videos/006-x videos/007-y  # these films
//   options: --dry-run (list + metadata, no pod, no upload)  --no-render (use the existing out/<id>.mp4)
//            --no-compare (skip the MP4-vs-preview check)  --privacy private|unlisted|public  --publish-at next-noon|<ISO> (scheduled: private until then)  --ignore-checks  --keep-mp4  + any `runpod render` option (--max-price …)
//
// Steps: 1) local gate per film: every line voiced, music present, `record.mjs --check` clean
//        2) `tools/runpod.mjs render <all films>` (one pod, terminated at the end; cost in costs/runpod.jsonl)
//        3) ffprobe each MP4 (duration ≈ timeline), compare its frames with the preview (tools/compare.mjs) 4) upload (tools/youtube.mjs) → videos/<id>/youtube.json
// The MP4s are not committed (videos/*/out/ is git-ignored): YouTube is where the rendered films live.
// Commit the youtube.json files afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { parseArgs, resolveVideoDir, loadVideo, ROOT } from './lib/common.mjs';
import { upload, accessToken, ytInfo, sourceHash, metadata } from './youtube.mjs';
import { blocking, warningLines, MINOR_DEPTH, APPROVED_PROP_DEPTH } from './lib/checkgate.mjs';

const args = parseArgs();
const node = (script, a, opts = {}) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [path.join(ROOT, 'tools', script), ...a], { cwd: ROOT, stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  let out = ''; p.stdout?.on('data', (d) => { out += d; process.stdout.write(d); });
  p.on('exit', (c) => (c === 0 ? res(out) : rej(Object.assign(new Error(`${script} exited with ${c}`), { out }))));
});

// ---- 1. which films
let dirs;
if (args.pending) {
  dirs = fs.readdirSync(path.join(ROOT, 'videos')).filter((v) => !v.startsWith('_') && fs.existsSync(path.join(ROOT, 'videos', v, 'video.json')))
    .map((v) => path.join(ROOT, 'videos', v))
    .filter((d) => { const y = ytInfo(d); return !y || (args.changed && y.source !== sourceHash(d)); });
} else dirs = args._.map(resolveVideoDir);
if (!dirs.length) { console.log(args.pending ? 'Nothing to publish: every film is on YouTube and unchanged.' : 'usage: npm run publish -- --pending | videos/<id> …'); process.exit(0); }
const force = !!args.changed;

console.log(`Films (${dirs.length}):`);
const problems = [];
for (const d of dirs) {
  const id = path.basename(d);
  const { desc, timeline: tl } = loadVideo(d);
  const y = ytInfo(d);
  console.log(`  ${id}  ${tl.duration.toFixed(1)} s  ${y ? `(on YouTube ${y.url}, changed → new upload)` : '(new)'}`);
  if (tl.missingAudio) problems.push(`${id}: ${tl.missingAudio} lines without audio (npm run voice -- videos/${id})`);
  if (desc.music !== false && !fs.existsSync(path.join(d, 'audio', 'music.mp3'))) problems.push(`${id}: no music (npm run music -- videos/${id})`);
  if (args['dry-run']) console.log('   ' + JSON.stringify(metadata(desc, args.privacy || 'private').snippet.title));
}
if (problems.length) { console.error('\nNot ready:\n  ' + problems.join('\n  ')); process.exit(1); }
if (args['dry-run']) process.exit(0);

// fail early on missing YouTube credentials, before paying for a pod (this token is only a probe: an access
// token lives 1 h and checks + render + compare of a batch take longer — a fresh one is fetched before the upload)
await accessToken();

if (!args['ignore-checks']) {
  // on RunPod (RUNPOD_KEY): every film uploaded once and checked in parallel in ONE call; the render below reuses that pod
  const { useRemote, checksRemote } = await import('./lib/remote.mjs');
  const remote = useRemote(args) ? (console.log(`\n-- checks on RunPod: ${dirs.map((d) => path.basename(d)).join(' ')}`), await checksRemote(dirs)) : null;
  for (const d of dirs) {
    const id = path.basename(d);
    console.log(`\n-- checks ${id}`);
    let out;
    if (remote) {
      ({ out } = remote[id]); process.stdout.write(out);
      if (remote[id].code) { problems.push(`${id}: npm run check failed on the pod (exit ${remote[id].code})`); continue; }
    } else out = await node('record.mjs', ['--check', path.relative(ROOT, d)], { capture: true });
    const bad = blocking(out, { cuts: false }), minor = warningLines(out).length - bad.length;
    if (minor) console.log(`   ${minor} minor contact(s) ≤ ${MINOR_DEPTH} (held props ≤ ${APPROVED_PROP_DEPTH}) / jump cut(s) of an approved film — not blocking`);
    if (bad.length || !/no problems found|⚠/.test(out)) problems.push(`${id}: npm run check reports problems (fix them, or pass --ignore-checks)${bad.length ? ':\n    ' + bad.map((l) => l.trim()).join('\n    ') : ''}`);
  }
  if (problems.length) { console.error('\nChecks failed:\n  ' + problems.join('\n  ')); process.exit(1); }
}

// ---- 2. render (one pod for all)
const mp4 = (d) => path.join(d, 'out', `${path.basename(d)}.mp4`);
if (!args['no-render']) {
  const pass = [];
  for (const k of ['max-price', 'gpu-types', 'exclude', 'cloud', 'wait', 'workers', 'browsers', 'crf', 'preset', 'encoder', 'gl']) if (args[k]) pass.push(`--${k}`, String(args[k]));
  console.log(`\n-- render on RunPod: ${dirs.map((d) => path.basename(d)).join(' ')}`);
  await node('runpod.mjs', ['render', ...dirs.map((d) => path.relative(ROOT, d)), ...pass]);
}

// ---- 3. sanity check of the files
for (const d of dirs) {
  const f = mp4(d), id = path.basename(d);
  if (!fs.existsSync(f)) { problems.push(`${id}: ${path.relative(ROOT, f)} missing`); continue; }
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  const want = loadVideo(d).timeline.duration;
  if (!(Math.abs(dur - want) < 1.5)) problems.push(`${id}: MP4 is ${dur.toFixed(1)} s, timeline says ${want.toFixed(1)} s`);
}
if (problems.length) { console.error('\nRender problems:\n  ' + problems.join('\n  ')); process.exit(1); }

// ---- 3b. the MP4 must look like the preview the reviewers approved (a file missing on the pod, a GPU-only artefact):
// frames of the MP4 vs the local engine; a film that differs is NOT uploaded (the others are). --no-compare to skip.
const bad = new Set();
if (!args['no-compare']) {
  const { compareVideo } = await import('./compare.mjs');
  for (const d of dirs) {
    console.log(`\n-- compare ${path.basename(d)}: MP4 vs preview`);
    const r = await compareVideo(d, mp4(d));
    if (!r.ok) { bad.add(d); problems.push(`${path.basename(d)}: the MP4 differs from the preview at ${r.worst.map((w) => w.t.toFixed(1) + 's').join(', ')} — see ${path.relative(ROOT, r.sheet)}; not uploaded`); }
  }
}

// ---- 4. upload
console.log('\n-- upload to YouTube');
const done = [];
let token = await accessToken(), tokenAt = Date.now();
for (const d of dirs.filter((x) => !bad.has(x))) {
  try {
    if (Date.now() - tokenAt > 40 * 60e3) { token = await accessToken(); tokenAt = Date.now(); } // long uploads: stay under the 1 h expiry
    const info = await upload(d, { privacy: args.privacy, publishAt: args['publish-at'], force, token });
    if (info) done.push(`${path.basename(d)}  ${info.url}  (${info.publishAt ? 'public at ' + info.publishAt : info.privacy})`);
    if (info && !args['keep-mp4']) fs.rmSync(mp4(d));
  } catch (e) { problems.push(e.message); }
}
console.log('\nPublished:\n  ' + (done.join('\n  ') || '—'));
if (problems.length) { console.error('Failed:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('\nCommit the videos/*/youtube.json files (and costs/runpod.jsonl).');
