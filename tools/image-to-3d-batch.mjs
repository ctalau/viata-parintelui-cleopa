// Many objects → textured 3D models in ONE pod run: Nano Banana paints turntable views of each object (front | left /
// back | right) on a flat chroma GREEN (no floor, no shadow: a white background left soft grey shadows that Hunyuan built as a
// white pedestal), each view is keyed out here (tools/lib/cutout.py --green: transparent, centred), and Hunyuan3D-2mv builds
// the shape from the four views, then the paint model bakes the texture. The resolution follows the object's size:
//   small  (a loaf, a salt bowl):           octree 256, 8 000 faces, 512 px texture
//   medium (a sack, a basket, a trough):    octree 320, 15 000 faces, 1024 px texture
//   large  (a table, a shelf, a building):  octree 380, 30 000 faces, 2048 px texture
// Sheets are 1K (512 px views) — enough for Hunyuan; --hires = 2K sheets (only for detailed buildings).
//
//   node tools/image-to-3d-batch.mjs objects.json [--only a,b] [--sheets-only] [--reuse] [--keep] [--grid] [--hires]
// objects.json: [{ "name": "pitarie-sac", "size": "medium", "prompt": "a cute chunky toy-like burlap flour sack …" }, …]
//   --grid         4 objects in ONE picture (a 4×4 grid at 2K: a row per object, the columns front/left/back/right): a
//                  quarter of the image calls; check the views sheet — the views of an object agree a little less often
//   --sheets-only  only the pictures (LOOK at <batch>_views.jpg), then run again with --reuse for the 3D
//   --reuse        keep the views on disk;  --recut [jpg]  repaint old white-background sheets on green (one more image call)
// Output: assets/3d/<name>.glb + <name>_green.jpg (or <names>_grid.jpg) + <name>_{front,left,back,right}.png (the cut-out RGBA views),
// and assets/3d/<batch>_views.jpg (every cut-out view on a blue ground, to look at before the pod runs).
// Rules for the prompts (film 051): "a cute chunky toy-like …, glossy plastic toy style"; thin or flat things (a broom, a seal,
// a sieve) don't survive Hunyuan — make them procedurally; a doorway / an oven mouth comes out painted shut — plan the cut
// and an interior (blender/props/bakery.py `_ai_oven_body`).
// Pod: a community pod with a broken GPU is detected at once and dropped; one python process per object (a crash loses one).
// Needs OPENROUTER_API_KEY and RUNPOD_KEY. Licence: Tencent Hunyuan non-commercial.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { ROOT, parseArgs } from './lib/common.mjs';
import { image } from './lib/openrouter.mjs';

const args = parseArgs();
const listFile = args._?.[0] || process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!listFile) throw new Error('give objects.json');
let jobs = JSON.parse(fs.readFileSync(listFile, 'utf8'));
if (args.only) { const o = String(args.only).split(','); jobs = jobs.filter((j) => o.includes(j.name)); }
const SIZES = {
  small: { sheet: '1K', octree: 256, faces: 8000, tex: 512 },
  medium: { sheet: '1K', octree: 320, faces: 15000, tex: 1024 },
  large: { sheet: '1K', octree: 380, faces: 30000, tex: 2048 },
};
const outDir = path.join(ROOT, 'assets/3d');
fs.mkdirSync(outDir, { recursive: true });
const MODEL = 'google/gemini-3.1-flash-image';
const VIEWS = ['front', 'left', 'back', 'right'];
const vfile = (n, v) => path.join(outDir, `${n}_${v}.png`);
const sheetSize = (j) => (args.hires ? '2K' : SIZES[j.size || 'medium'].sheet);
const GREEN = 'The whole background is ONE flat, uniform pure chroma green (#00FF00): no floor, no ground plane, no table, no plinth, no pedestal, no base plate, no shadows, no reflections — only the object, sharp-edged, floating on the flat green. Soft even studio lighting. No text, no letters, no labels anywhere.';
const TURN = 'the same camera height (slightly above, about 15 degrees) and distance for every view, orthographic-style product photos; FRONT view, LEFT side view (the object turned 90 degrees so we see its left side), BACK view (seen from behind), RIGHT side view; the views must be perfectly consistent with each other, as if a turntable had been photographed';

// 1. the sheets (4 at a time) and the cut-outs
async function sheetOf(j) {
  const S = SIZES[j.size || 'medium'];
  if (args.reuse && VIEWS.every((v) => fs.existsSync(vfile(j.name, v)))) return;
  if (args.recut && fs.existsSync(path.join(outDir, `${j.name}_sheet.${args.recut === "jpg" ? "jpg" : "png"}`))) { await greenOf(j, path.join(outDir, `${j.name}_sheet.${args.recut === "jpg" ? "jpg" : "png"}`)); splitCut(j); return; }
  const g = path.join(outDir, `${j.name}_green.png`);
  fs.writeFileSync(g, await image({ model: MODEL, aspect: '1:1', size: sheetSize(j),
    prompt: `A 2x2 grid in ONE square image, four equal square cells with no borders, no lines and no text, each cell showing the same single object: ${j.prompt}. The object centered and the same size and scale in every cell, filling about 75% of the cell, ${TURN}. Top-left: FRONT view. Top-right: LEFT side view. Bottom-left: BACK view. Bottom-right: RIGHT side view. ${GREEN}` }));
  splitCut(j);
}
// --grid: 4 objects in one 2K picture, a row per object (front, left, back, right)
async function gridOf(group) {
  const g = path.join(outDir, `${group.map((j) => j.name).join('+')}_grid.png`);
  const rows = group.map((j, k) => `Row ${k + 1}: ${j.prompt}.`).join(' ');
  fs.writeFileSync(g, await image({ model: MODEL, aspect: '1:1', size: '2K',
    prompt: `A 4x4 grid in ONE square image, sixteen equal square cells with no borders, no lines and no text. Each ROW shows ONE single object, the four cells of the row being its FRONT, LEFT side, BACK and RIGHT side views (left to right), ${TURN}. Each object centered, filling about 70% of its cell, the same size in its four cells. ${rows} ${GREEN}` }));
  const { width } = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'json', g]).stdout).streams[0];
  const c = width / 4;
  group.forEach((j, r) => VIEWS.forEach((v, k) => {
    const raw = path.join('/tmp', `i23d-${j.name}-${v}.png`);
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', g, '-vf', `crop=${c - 6}:${c - 6}:${k * c + 3}:${r * c + 3}`, raw]);
    const res = spawnSync('python3', ['-I', path.join(ROOT, 'tools/lib/cutout.py'), raw, vfile(j.name, v), '--green'], { encoding: 'utf8' });
    if (res.status) throw new Error(`cutout ${j.name} ${v}: ${res.stderr}`);
  }));
  console.log(`grid ${width}px → ${group.map((j) => j.name).join(', ')}`);
}
// the cut-out pass, also by Nano Banana: the same sheet on a flat chroma green, with no shadow, floor, plinth or label
// (a white-background flood fill kept the soft grey shadows under the objects: Hunyuan built them as a white pedestal)
async function greenOf(j, sheet) {
  const g = path.join(outDir, `${j.name}_green.png`);
  fs.writeFileSync(g, await image({ model: MODEL, aspect: '1:1', size: sheetSize(j), refs: [sheet],
    prompt: 'Cut out the objects of this picture: return EXACTLY the same picture (the same 2x2 grid, the same four views, the same objects with the same shapes, colours, sizes and positions), but the whole background replaced by one flat, uniform pure chroma green (#00FF00). Remove completely every shadow, reflection, floor, ground plane, plinth, pedestal, base plate and any text or label: only the objects themselves stay, sharp-edged, on the flat green. Do not add anything.' }));
}
function splitCut(j) {
  const sheet = path.join(outDir, `${j.name}_green.png`);
  const { width } = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'json', sheet]).stdout).streams[0];
  const h = width / 2;
  for (const [i, v] of VIEWS.entries()) {
    const raw = path.join('/tmp', `i23d-${j.name}-${v}.png`);
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', sheet, '-vf', `crop=${h - 8}:${h - 8}:${(i % 2) * h + 4}:${Math.floor(i / 2) * h + 4}`, raw]);
    const r = spawnSync('python3', ['-I', path.join(ROOT, 'tools/lib/cutout.py'), raw, vfile(j.name, v), '--green'], { encoding: 'utf8' });
    if (r.status) throw new Error(`cutout ${j.name} ${v}: ${r.stderr}`);
  }
  console.log(`${j.name}: sheet ${width}px → 4 cut-out views`);
}
const todo = jobs.filter((j) => !(args.reuse && VIEWS.every((v) => fs.existsSync(vfile(j.name, v)))));
const queue = [];
if (args.grid && !args.recut) for (let i = 0; i < todo.length; i += 4) queue.push(() => gridOf(todo.slice(i, i + 4)));
else for (const j of todo) queue.push(() => sheetOf(j));
await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) await queue.shift()(); }));
// the green sheets are kept as JPEG (the provenance of each model), the intermediate PNGs go
for (const f of fs.readdirSync(outDir)) if (/_(green|grid)\.png$/.test(f)) {
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(outDir, f), '-q:v', '3', path.join(outDir, f.replace(/\.png$/, '.jpg'))]);
  fs.rmSync(path.join(outDir, f));
}

// a contact sheet of the cut-outs (on grey, so the transparency shows)
const contact = path.join(outDir, `${path.basename(listFile, '.json')}_views.jpg`);
{
  const py = `import sys
from PIL import Image
names = sys.argv[2:]; T = 220
out = Image.new('RGB', (T * 4, T * len(names)), (52, 84, 130))
for r, n in enumerate(names):
    for c, v in enumerate(('front', 'left', 'back', 'right')):
        im = Image.open(f'${outDir}/{n}_{v}.png').convert('RGBA').resize((T, T))
        out.paste(im, (c * T, r * T), im)
out.save(sys.argv[1], quality=85)`;
  spawnSync('python3', ['-I', '-c', py, contact, ...jobs.map((j) => j.name)], { stdio: 'inherit' });
  console.log('views:', path.relative(ROOT, contact));
}
if (args['sheets-only']) process.exit(0);

// 2. a pod (as tools/image-to-3d.mjs)
process.argv.push('--gpu-types', args.gpus || 'NVIDIA RTX A5000,NVIDIA RTX A4500,NVIDIA GeForce RTX 3090,NVIDIA RTX A6000,NVIDIA GeForce RTX 4090', '--cloud', 'community', '--max-price', '0.6');
const P = await import('./lib/pod.mjs');
let st = P.loadState();
if (st && (st.what !== 'image-to-3d' || !(await P.agent(st, '/health', { timeout: 15000 }).catch(() => null))?.ok)) { await P.down({ gone: st.what === 'image-to-3d' }); st = null; }
if (!st) {
  const token = crypto.randomBytes(18).toString('hex');
  const agentB64 = fs.readFileSync(path.join(ROOT, 'tools/runpod/agent.mjs')).toString('base64');
  const startCmd = 'mkdir -p /work && echo "$AGENT_JS" | base64 -d > /work/agent.mjs && (command -v node >/dev/null || (apt-get update -qq && apt-get install -y -qq xz-utils curl >/dev/null; curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1)) && exec node /work/agent.mjs';
  const body = { name: 'image-to-3d', imageName: 'runpod/pytorch:0.7.0-cu1241-torch260-ubuntu2204', cloudType: 'COMMUNITY', computeType: 'GPU', gpuCount: 1,
    containerDiskInGb: 80, volumeInGb: 0, ports: ['8000/http'], supportPublicIp: false, minRAMPerGPU: 24, minVCPUPerGPU: 4,
    env: { AGENT_TOKEN: token, AGENT_JS: agentB64, AGENT_IDLE_MIN: '30', NVIDIA_DRIVER_CAPABILITIES: 'all' }, dockerStartCmd: ['bash', '-c', startCmd] };
  let pod, cand;
  const deadline = P.now() + 60 * parseFloat(args.wait || '10');
  while (!pod) {
    for (const c of await P.gpuCandidates()) {
      try { pod = await P.rest('POST', '/pods', { ...body, cloudType: c.cloud, gpuTypeIds: [c.id] }); cand = c; break; } catch (e) { console.log('no', c.id, c.cloud); }
    }
    if (pod) break;
    if (P.now() > deadline) throw new Error('no community 24 GB GPU in stock — retry later or pass --wait N / --gpus');
    console.log('nothing in stock, retrying in 60 s'); await P.sleep(60000);
  }
  st = { id: pod.id, token, created: P.now(), gpu: cand.id, cloud: cand.cloud, costPerHr: pod.costPerHr ?? cand.price, what: 'image-to-3d', idleMin: 30 };
  P.saveState(st);
  console.log(`pod ${st.id} (${st.gpu}, ${st.cloud.toLowerCase()}, $${st.costPerHr}/h)`);
  while (!(await P.agent(st, '/health', { timeout: 10000 }).catch(() => null))?.ok) await P.sleep(5000);
}
const sh = (cmd) => P.exec(st, cmd);
const up = async (local, dir) => {
  const t = spawnSync('tar', ['czf', '-', '-C', path.dirname(local), path.basename(local)], { maxBuffer: 1e9 });
  const r = await P.agent(st, `/upload?dir=${dir}`, { method: 'PUT', body: t.stdout, headers: { 'content-type': 'application/gzip' }, timeout: 120000 });
  if (!r.ok) throw new Error('upload failed');
};
// some community pods come with a broken GPU ("CUDA unknown error"): find out at once, drop the pod, say so
if (!(await sh('python -c "import torch; assert torch.cuda.is_available()"').then(() => true, () => false))) {
  await P.down(); throw new Error('this pod has no working GPU (CUDA error) — terminated; run again (another card)');
}
const ready = await sh('python -c "import hy3dgen, custom_rasterizer, mesh_processor" 2>/dev/null').then(() => true, () => false);
if (!ready) await sh(`set -e
printf '#!/bin/sh\\nexec python -m pip "$@"\\n' > /usr/local/bin/pip && chmod +x /usr/local/bin/pip
apt-get install -y -qq libopengl0 libglu1-mesa libegl1 >/dev/null 2>&1
cd /work && rm -rf Hunyuan3D-2 && git clone -q https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git && cd Hunyuan3D-2
export MAX_JOBS=8
pip install -q -r requirements.txt && pip install -q -e . hf_transfer "transformers==4.50.3" "diffusers==0.32.2" "huggingface_hub<1.0" "tokenizers>=0.21,<0.22"
(cd hy3dgen/texgen/custom_rasterizer && python setup.py install >/dev/null 2>&1)
(cd hy3dgen/texgen/differentiable_renderer && python setup.py install >/dev/null 2>&1)
python -c "import torch,custom_rasterizer,mesh_processor;print('setup ok',torch.__version__)"`);

// 3. one python process for the whole batch: the models load once; the views are already cut out (RGBA), no rembg
const py = `import io, json, sys, time, torch, os
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline
jobs = [c for c in json.load(open('/work/jobs.json')) if c['name'] == sys.argv[1]]
shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv', subfolder='hunyuan3d-dit-v2-mv')
paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2')
def rgba(p):
    im = Image.open(p).convert('RGBA')
    return im
for c in jobs:
    n = c['name']; t0 = time.time()
    try:
        imgs = {v: rgba(f'/work/{n}_{v}.png') for v in ('front', 'left', 'back', 'right')}
        mesh = shape(image=imgs, num_inference_steps=50, octree_resolution=c['octree'], num_chunks=20000, generator=torch.manual_seed(12345))[0]
        mesh = FaceReducer()(mesh, max_facenum=c['faces'])
        front = Image.alpha_composite(Image.new('RGBA', imgs['front'].size, (255, 255, 255, 255)), imgs['front']).convert('RGB')
        mesh = paint(mesh, image=front)
        m = mesh.visual.material
        src = getattr(m, 'baseColorTexture', None) or m.image
        b = io.BytesIO(); src.convert('RGB').resize((c['tex'], c['tex']), Image.LANCZOS).save(b, 'JPEG', quality=88, optimize=True)
        new = Image.open(io.BytesIO(b.getvalue()))
        if hasattr(m, 'baseColorTexture'): m.baseColorTexture = new
        m.image = new
        mesh.export(f'/work/{n}.glb')
        print('done', n, round(time.time() - t0), 's,', len(mesh.faces), 'faces', flush=True)
    except Exception as e:
        print('FAILED', n, repr(e)[:300], flush=True)
        torch.cuda.empty_cache()
`;
fs.mkdirSync('/tmp/i23d', { recursive: true });
fs.writeFileSync('/tmp/i23d/gen3d_batch.py', py);
fs.writeFileSync('/tmp/i23d/jobs.json', JSON.stringify(jobs.map((j) => ({ name: j.name, ...SIZES[j.size || 'medium'] }))));
for (const j of jobs) for (const v of VIEWS) await up(vfile(j.name, v), '/work');
await up('/tmp/i23d/gen3d_batch.py', '/work');
await up('/tmp/i23d/jobs.json', '/work');
// one python process per object: a crash (it happened: the process died silently after the first model) loses one model, not the batch
const names = jobs.map((j) => j.name).join(' ');
await sh(`export HF_HUB_DISABLE_XET=1 HF_HUB_ENABLE_HF_TRANSFER=0 PYTHONPATH=/work/Hunyuan3D-2; cd /work/Hunyuan3D-2; for n in ${names}; do if [ -f /work/$n.glb ]; then echo "done $n (on the pod already)"; continue; fi; python /work/gen3d_batch.py $n > /work/$n.log 2>&1; grep -E "^(done|FAILED)" /work/$n.log || { echo "FAILED $n (exit $?)"; grep -vE "it/s|s/it" /work/$n.log | tail -6; }; done; true`);
let ok = 0;
for (const j of jobs) {
  try { await P.pull(st, `/work/${j.name}.glb`, path.join(outDir, `${j.name}.glb`)); ok++; } catch (e) { console.log('missing', j.name); }
}
console.log(`${ok}/${jobs.length} models in assets/3d`);
if (args.keep) console.log(`pod kept (stops itself after 30 min idle, $${st.costPerHr}/h)`);
else { const r = await P.down(); console.log(`RunPod: ≈ $${r.est.toFixed(2)}`); }
