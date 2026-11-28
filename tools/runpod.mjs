// RunPod CLI pentru probele Blender de referință, adaptat din ctalau/lego-shorts.
//
//   npm run runpod -- gpus                              # GPU prices ≤ --max-price, in stock first
//   npm run runpod -- render --to 241 [--workers 6] [--keep]   # cadre PNG pe pod
//   npm run runpod -- up | status | down                # manual control (state in .runpod/pod.json)
//   npm run runpod -- push <path…>                      # upload paths (relative to the repo) to /work/repo
//   npm run runpod -- exec "nvidia-smi"                 # run a command on the pod, stream its log
//   npm run runpod -- pull <remote> <local>
//   npm run runpod -- spend                             # RunPod spend recorded in costs/runpod.jsonl
//
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, up, down, push, pull, exec, waitSetup, agent, podInfo, gpuCandidates, balance,
  loadState, saveState, fmt, now } from './runpod/pod.mjs';

const args = parseArgs();
const cmd = args._[0];
const EPISODE = args.episode || 'experiments/cleopa-painea';
const SCENE = args.scene || 'scenes/painea_care_poate_sa_astepte.blend';
const UPLOAD = [SCENE, 'scripts', 'audio', 'timeline.json', 'scenariu.json', 'fonts'].map((p) => `${EPISODE}/${p}`);

// Workbench draws with OpenGL: render a tiny frame, then print the renderer Blender got (NVIDIA, not llvmpipe).
const GL_PROBE = ["import bpy, gpu", "s = bpy.context.scene", "s.render.engine = 'BLENDER_WORKBENCH'",
  "s.render.resolution_x = s.render.resolution_y = 32", "s.render.filepath = '/tmp/probe.png'",
  "bpy.ops.render.render(write_still=True)",
  "print('GL renderer:', gpu.platform.renderer_get(), '·', gpu.platform.vendor_get())"].join('; ');

/** contiguous ranges of drawn (odd) frames, one per Blender worker */
function ranges(end, workers, to) {
  const last = Math.min(end, to || end);
  const drawn = [];
  for (let f = 1; f <= last; f += 2) drawn.push(f);
  const size = Math.ceil(drawn.length / workers);
  const out = [];
  for (let i = 0; i < drawn.length; i += size) out.push([drawn[i], drawn[Math.min(drawn.length, i + size) - 1]]);
  return out;
}

async function render() {
  const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, EPISODE, 'timeline.json'), 'utf8'));
  const workers = Number(args.workers || '6');
  const to = Number(args.to);
  if (!Number.isSafeInteger(to) || to < 1 || !Number.isSafeInteger(workers) || workers < 1) {
    throw new Error('Utilizare: npm run runpod -- render --to CADRU [--workers N] [--keep]');
  }
  const parts = ranges(timeline.end, workers, to);
  const T = { start: now() };
  const st = await up();
  st.what = `render ${path.basename(EPISODE)} to ${to}`;
  saveState(st);
  T.ready = now();
  let ok = false;
  try {
    await push(st, UPLOAD);
    await waitSetup(st);
    T.setup = now();
    const dir = `/work/repo/${EPISODE}`;
    const blender = parts.map(([s, e], i) =>
      `blender -b ${SCENE} -o //../renders/frames/frame_#### -F PNG -s ${s} -e ${e} -a > /work/w${i}.log 2>&1 &`).join('\n');
    const script = [
      'set -e',
      `cd ${dir}`,
      'nvidia-smi -L',
      // Workbench must render on the GPU: print the GL renderer Blender gets in background mode
      `blender -b --factory-startup --python-expr "${GL_PROBE}" 2>&1 | grep 'GL renderer'`,
      'mkdir -p renders/frames && rm -f renders/frames/*.png',
      't0=$(date +%s)',
      blender,
      'wait',
      'echo "frames: $(ls renders/frames | wc -l) in $(( $(date +%s) - t0 ))s"',
    ].join('\n');
    const t0 = now();
    console.log(`-- render: ${parts.length} Blender workers ${parts.map(([s, e]) => `${s}–${e}`).join(', ')}`);
    await exec(st, script);
    T.render = now() - t0;
    ok = true;
  } finally {
    if (!args.keep || !ok) {
      const d = await down();
      const bal1 = await balance().catch(() => null);
      console.log('\n==== RunPod report ====');
      console.log(`GPU:            ${st.gpu} @ $${st.costPerHr}/h (${(st.cloud || 'community').toLowerCase()} cloud)`);
      console.log(`pod start:      ${fmt(T.ready - T.start)}  (create + image pull + agent)`);
      if (T.setup) console.log(`setup:          ${fmt(T.setup - T.ready)}  (upload + ffmpeg/python/blender install)`);
      if (T.render) console.log(`render:         ${fmt(T.render)}  (${parts.length} Blender workers)`);
      console.log(`total billed:   ${fmt(d.secs)}  ≈ $${d.est.toFixed(4)}`);
      if (bal1 != null) console.log(`balance:        $${st.bal0.toFixed(4)} → $${bal1.toFixed(4)} (billing may lag a few minutes)`);
    } else console.log(`Pod kept running: ${st.id} — remember "npm run runpod -- down"`);
  }
}

function spend() {
  const f = path.join(ROOT, 'costs', 'runpod.jsonl');
  const rows = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  for (const r of rows) console.log(`${r.date.slice(0, 16)}  ${r.gpu.padEnd(28)} ${fmt(r.secs).padStart(7)}  $${r.est.toFixed(4)}  ${r.what}`);
  console.log(`RunPod: $${rows.reduce((s, r) => s + r.est, 0).toFixed(4)} (${rows.length} pods, estimated from the billed time)`);
}

if (cmd === 'gpus') {
  for (const c of await gpuCandidates()) console.log(`$${c.price.toFixed(3)}/h  ${c.cloud.padEnd(9)} ${(c.stock || '-').padEnd(6)} ${c.id}`);
} else if (cmd === 'up') { const st = await up(); await waitSetup(st); }
else if (cmd === 'down') await down();
else if (cmd === 'status') {
  const st = loadState();
  if (!st) console.log('no pod');
  else console.log({ ...st, token: '…', ...(await podInfo(st)), health: await agent(st, '/health').catch((e) => String(e)) });
} else if (cmd === 'push') await push(loadState(), args._.slice(1));
else if (cmd === 'exec') await exec(loadState(), args._.slice(1).join(' '));
else if (cmd === 'pull') await pull(loadState(), args._[1], path.resolve(args._[2] || path.basename(args._[1])));
else if (cmd === 'render') await render();
else if (cmd === 'spend') spend();
else console.log('usage: npm run runpod -- gpus|render|up|status|push|exec|pull|down|spend …');
