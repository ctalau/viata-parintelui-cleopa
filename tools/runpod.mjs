// Render films on a cheap RunPod GPU pod (community cloud), driven from here over HTTPS.
//
//   node tools/runpod.mjs gpus                         # community GPU prices
//   node tools/runpod.mjs render videos/004-x [--draft] [--keep] [--workers 6] [--gpu-types "NVIDIA RTX A2000,..."]
//   node tools/runpod.mjs up | status | down           # manual control of the pod (state in .runpod/pod.json)
//   node tools/runpod.mjs push videos/004-x            # upload code + one film
//   node tools/runpod.mjs exec "nvidia-smi"            # run a command on the pod, stream its log
//   node tools/runpod.mjs pull /work/videos/x/out/y.mp4 local.mp4
//
// How it works: the pod runs the official Playwright image (node + Chromium + deps). Its start command
// writes tools/runpod/agent.mjs (passed base64 in an env var) and runs it on port 8000, exposed through
// https://<podId>-8000.proxy.runpod.net. We upload a tarball of the repo, run tools/record.mjs --gpu
// there, download the MP4 and terminate the pod. Every step is timed; the cost is printed at the end.
// Needs RUNPOD_KEY (or RUNPOD_API_KEY) in the env or .env.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, resolveVideoDir, ROOT } from './lib/common.mjs';
import { up, down, push, pull, exec, waitSetup, agent, podInfo, gpuCandidates, balance, loadState, saveState, fmt, now } from './lib/pod.mjs';

const args = parseArgs();
const cmd = args._[0];
// ---- all in one ------------------------------------------------------------------------
async function render() {
  // one pod for one or more films: `render videos/004-x videos/005-y` pays the pod start + setup only once
  const dirs = args._.slice(1).map(resolveVideoDir);
  if (!dirs.length) throw new Error('usage: render videos/<id> [videos/<id2> …]');
  const T = { start: now(), films: [] };
  const st = await up();
  st.what = `${args.draft ? 'draft' : 'render'} ${dirs.map((d) => path.basename(d).slice(0, 3)).join('+')}`; saveState(st);
  T.ready = now();
  let ok = false;
  try {
    await push(st, dirs, { smart: true }); // a pod kept from the checks (publish.mjs) already has the code + films
    await waitSetup(st);
    T.setup = now();
    // measured on an RTX A4500 / 16 vCPU: 6 pages in 3 browsers, x264 veryfast crf 21 ≈ 100 fps at 1920x1080
    // (x264 "medium" was the bottleneck at ~65 fps; nvenc is a bit faster but gives ~30% bigger files)
    // --no-check: the runtime checks are a local gate (publish.mjs runs them before paying for a pod); on the pod they took 5 min of CPU
    const recArgs = ['--gpu', '--no-check', '--workers', String(args.workers || 6), '--browsers', String(args.browsers || 3),
      '--preset', String(args.preset || 'veryfast'), '--crf', String(args.crf || (args.draft ? 23 : 21))];
    if (args.draft) recArgs.push('--draft');
    for (const k of ['from', 'to', 'scale', 'quality', 'encoder', 'gl']) if (args[k]) recArgs.push(`--${k}`, String(args[k]));
    if (args['no-audio']) recArgs.push('--no-audio');
    for (const dir of dirs) {
      const rel = path.relative(ROOT, dir), id = path.basename(dir);
      const t0 = now();
      console.log(`-- render: record.mjs ${rel} ${recArgs.join(' ')}`);
      await exec(st, `cd /work/repo && nvidia-smi -L && node tools/record.mjs ${rel} ${recArgs.join(' ')} --out /work/${id}.mp4`);
      const t1 = now();
      const local = (dirs.length === 1 && args.out) || path.join(dir, 'out', args.draft ? 'draft.mp4' : `${id}.mp4`);
      await pull(st, `/work/${id}.mp4`, local);
      T.films.push({ id, render: t1 - t0, pull: now() - t1, size: fs.statSync(local).size });
    }
    ok = true;
  } finally {
    if (!args.keep || !ok) {
      const d = await down();
      T.end = now();
      const bal1 = await balance().catch(() => null);
      console.log('\n==== RunPod report ====');
      console.log(`GPU:            ${st.gpu} @ $${st.costPerHr}/h (${(st.cloud || 'community').toLowerCase()} cloud)`);
      console.log(`pod start:      ${fmt(T.ready - T.start)}  (create + image pull + agent)`);
      if (T.setup) console.log(`setup:          ${fmt(T.setup - T.ready)}  (upload code + ffmpeg/playwright install)`);
      for (const f of T.films) console.log(`render ${f.id.slice(0, 3)}:     ${fmt(f.render)} (+ download ${fmt(f.pull)}, ${(f.size / 1e6).toFixed(1)} MB)`);
      console.log(`total billed:   ${fmt(d.secs)}  ≈ $${d.est.toFixed(4)}`);
      if (bal1 != null) console.log(`balance:        $${st.bal0.toFixed(4)} → $${bal1.toFixed(4)} (billing may lag a few minutes)`);
    } else console.log(`Pod kept running: ${st.id} — remember "node tools/runpod.mjs down"`);
  }
}

// ---- main ------------------------------------------------------------------------------
if (cmd === 'gpus') {
  for (const c of await gpuCandidates()) console.log(`$${c.price.toFixed(3)}/h  ${c.cloud.padEnd(9)} ${(c.stock || '-').padEnd(6)} ${c.id}`);
} else if (cmd === 'up') { const st = await up(); await waitSetup(st); }
else if (cmd === 'down') await down();
else if (cmd === 'status') { const st = loadState(); if (!st) console.log('no pod'); else console.log({ ...st, token: '…', ...(await podInfo(st)), raw: undefined, health: await agent(st, '/health').catch((e) => String(e)) }); }
else if (cmd === 'push') await push(loadState(), args._.slice(1).map(resolveVideoDir));
else if (cmd === 'exec') await exec(loadState(), args._.slice(1).join(' '));
else if (cmd === 'pull') await pull(loadState(), args._[1], path.resolve(args._[2] || path.basename(args._[1])));
else if (cmd === 'render') await render();
else console.log('usage: node tools/runpod.mjs gpus|up|status|push|exec|pull|down|render …');
