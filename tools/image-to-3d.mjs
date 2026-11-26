// Prompt/image → textured 3D model (GLB): OpenRouter Nano Banana + Hunyuan3D-2 on a cheap 24 GB RunPod community GPU, with the cost.
//   node tools/image-to-3d.mjs --prompt "a freshly baked round rustic bread loaf" --name bread
//   node tools/image-to-3d.mjs --image donkey.png --name donkey                      (skip the image step)
// Options:
//   --multiview     ONE Nano Banana image = a 2x2 sheet (front | left / back | right) of the same object, split into 4 views and
//                   fed to Hunyuan3D-2mv (multiview shape model); the texture is baked from the front view. With --image, that
//                   picture is the reference of the sheet (the same object, drawn from the other sides).
//   --hires         2048x2048 sheet (1024 px views) instead of 1024x1024 (512 px views): more detail for complex objects
//   --texviews      with --multiview: bake the texture from front+left+back (all views go to the paint model) instead of the front view only
//   --reuse         with --multiview: reuse assets/3d/<name>_{front,left,back,right}.png if they exist (no new sheet, saves ~$0.07-0.10)
//   --faces N       reduce the mesh to N faces before texturing (default: none; 20000 is plenty for a toy / prop)
//   --tex N         downscale the baked texture to N px and store it as JPEG (default: 2048 PNG)   [--faces 20000 --tex 1024: ~1 MB]
//   --gpus "A,B"    RunPod GPU names (default: community A5000, A4500, 3090, 4090);  --wait N  retry N min when none is in stock (10)
//   --keep          keep the pod after the run (it stops itself after 30 min idle); reused by the next call → no setup, no weights download
// Output: assets/3d/<name>.glb (+ <name>.png, and <name>_{front,left,back,right}.png with --multiview).
// Needs OPENROUTER_API_KEY (for the picture) and RUNPOD_KEY. Measured: A5000 community ≈ $0.16/h, 4090 ≈ $0.34/h; setup ≈ 2-12 min,
// first object ≈ 10 min (15 GB of weights), next ones ≈ 4 min; peak VRAM 15.7 GB (24 GB card needed).
// Hunyuan3D-2 weights are not gated; licence: Tencent Hunyuan non-commercial community licence.
// (TRELLIS.2 builds on the same pod but needs the gated facebook/dinov3-vitl16 + briaai/RMBG-2.0; InstantMesh: see the log of the comparison.)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { ROOT, parseArgs } from './lib/common.mjs';
import { image } from './lib/openrouter.mjs';

const args = parseArgs();
const name = args.name || 'model';
const mv = !!args.multiview;
const outDir = path.join(ROOT, 'assets/3d');
fs.mkdirSync(outDir, { recursive: true });
// pod.mjs reads its GPU choice from argv; community cloud only (security is not a concern here), cheapest 24 GB cards first
process.argv.push('--gpu-types', args.gpus || 'NVIDIA RTX A5000,NVIDIA RTX A4500,NVIDIA GeForce RTX 3090,NVIDIA GeForce RTX 4090', '--cloud', 'community', '--max-price', '0.6');
const P = await import('./lib/pod.mjs');
const MODEL = 'google/gemini-3.1-flash-image';
const VIEWS = ['front', 'left', 'back', 'right'];   // sheet order: top-left, top-right, bottom-left, bottom-right

// 1. the pictures (the models remove the background themselves: plain white, one object)
const png = path.join(outDir, `${name}.png`);
const files = [];   // what goes to the pod
if (!mv) {
  if (args.image) fs.copyFileSync(args.image, png);
  else {
    if (!args.prompt) throw new Error('give --prompt "…" or --image file.png');
    fs.writeFileSync(png, await image({ model: MODEL, aspect: '1:1', prompt: `${args.prompt}. A single object, centered, three-quarter view, soft even studio lighting, plain pure white background, no text, no other objects. Product photo, high detail.` }));
  }
  files.push(png);
} else if (args.reuse && VIEWS.every((v) => fs.existsSync(path.join(outDir, `${name}_${v}.png`)))) {
  VIEWS.forEach((v) => files.push(path.join(outDir, `${name}_${v}.png`)));
  console.log('reusing the views on disk');
} else {
  const what = args.prompt || 'the object in the reference picture (exactly the same object: same shape, proportions, colours and details)';
  const sheet = path.join(outDir, `${name}_sheet.png`);
  const refs = args.image ? [args.image] : [];
  fs.writeFileSync(sheet, await image({ model: MODEL, aspect: '1:1', size: args.hires ? '2K' : '1K', refs,
    prompt: `A 2x2 grid in ONE square image, four equal square cells with no borders and no text, each cell showing the same single object, ${what}, on a plain pure white background, object centered and the same size and scale in every cell, same camera height and distance, soft even studio lighting, orthographic-style product photos. Top-left: FRONT view. Top-right: LEFT side view (the object turned 90° so we see its left side). Bottom-left: BACK view (seen from behind). Bottom-right: RIGHT side view. The four views must be perfectly consistent with each other, as if a turntable had been photographed.` }));
  const { width } = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'json', sheet]).stdout).streams[0];
  const h = width / 2;
  VIEWS.forEach((v, i) => {
    const f = path.join(outDir, `${name}_${v}.png`);
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', sheet, '-vf', `crop=${h}:${h}:${(i % 2) * h}:${Math.floor(i / 2) * h}`, f]);
    files.push(f);
  });
  console.log(`sheet ${width}x${width} → 4 views of ${h}px`);
}
console.log('images:', files.map((f) => path.relative(ROOT, f)).join(', '));

// 2. a pod: CUDA 12.4 devel + torch 2.6 (python 3.10); the agent needs node, which this image lacks
let st = P.loadState();
if (st && !(await P.agent(st, '/health', { timeout: 15000 }).catch(() => null))?.ok) { await P.down({ gone: true }); st = null; }
if (!st) {
  const token = crypto.randomBytes(18).toString('hex');
  const agentB64 = fs.readFileSync(path.join(ROOT, 'tools/runpod/agent.mjs')).toString('base64');
  const startCmd = 'mkdir -p /work && echo "$AGENT_JS" | base64 -d > /work/agent.mjs && (command -v node >/dev/null || (apt-get update -qq && apt-get install -y -qq xz-utils curl >/dev/null; curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1)) && exec node /work/agent.mjs';
  const body = { name: 'image-to-3d', imageName: 'runpod/pytorch:0.7.0-cu1241-torch260-ubuntu2204', cloudType: 'COMMUNITY', computeType: 'GPU', gpuCount: 1,
    containerDiskInGb: 80, volumeInGb: 0, ports: ['8000/http'], supportPublicIp: false, minRAMPerGPU: 24, minVCPUPerGPU: 4,   // 80 GB: the weights are ~30 GB (+15 GB for the mv shape model)
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

// 3. one-time setup per pod (every fix below was needed: wrong pip, new transformers, Xet/hf_transfer errors, pymeshlab libs)
const ready = await sh('python -c "import hy3dgen, custom_rasterizer, mesh_processor" 2>/dev/null').then(() => true, () => false);
if (!ready) await sh(`set -e
printf '#!/bin/sh\\nexec python -m pip "$@"\\n' > /usr/local/bin/pip && chmod +x /usr/local/bin/pip   # the image's pip belongs to python 3.13, torch lives in 3.10
apt-get install -y -qq libopengl0 libglu1-mesa libegl1 >/dev/null 2>&1                           # pymeshlab
cd /work && rm -rf Hunyuan3D-2 && git clone -q https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git && cd Hunyuan3D-2
export MAX_JOBS=8
pip install -q -r requirements.txt && pip install -q -e . hf_transfer "transformers==4.50.3" "diffusers==0.32.2" "huggingface_hub<1.0" "tokenizers>=0.21,<0.22"  # transformers 5.x breaks the DINOv2 weights
(cd hy3dgen/texgen/custom_rasterizer && python setup.py install >/dev/null 2>&1)
(cd hy3dgen/texgen/differentiable_renderer && python setup.py install >/dev/null 2>&1)
python -c "import torch,custom_rasterizer,mesh_processor;print('setup ok',torch.__version__)"`);

// 4. generate: [multiview] shape (DiT, 50 steps, octree 380) → optional face reduction → texture (delight + multiview diffusion + bake) → optional JPEG
const py = `import io, json, sys, time, torch
from PIL import Image
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline
c = json.loads(sys.argv[1]); n = c['name']; t0 = time.time()
shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv', subfolder='hunyuan3d-dit-v2-mv') if c['mv'] else Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2')
paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2')
rembg = BackgroundRemover()
load = lambda p: rembg(Image.open(p).convert('RGB'))
if c['mv']:
    imgs = {v: load(f'/work/{n}_{v}.png') for v in c['views']}
    front = imgs['front']; shape_in = imgs
else:
    front = shape_in = load(f'/work/{n}.png')
mesh = shape(image=shape_in, num_inference_steps=50, octree_resolution=380, num_chunks=20000, generator=torch.manual_seed(12345))[0]
print('shape', round(time.time() - t0), 's', len(mesh.faces), 'faces', flush=True)
if c['faces']: mesh = FaceReducer()(mesh, max_facenum=c['faces'])
mesh = paint(mesh, image=[imgs['front'], imgs['left'], imgs['back']] if c['mv'] and c['texviews'] else front)
if c['tex']:
    m = mesh.visual.material
    src = getattr(m, 'baseColorTexture', None) or m.image   # SimpleMaterial has .image, PBRMaterial .baseColorTexture
    b = io.BytesIO(); src.convert('RGB').resize((c['tex'], c['tex']), Image.LANCZOS).save(b, 'JPEG', quality=85, optimize=True)
    new = Image.open(io.BytesIO(b.getvalue()))   # keeps .format == 'JPEG': trimesh then writes image/jpeg
    if hasattr(m, 'baseColorTexture'): m.baseColorTexture = new
    m.image = new
mesh.export(f'/work/{n}.glb')
print('done', round(time.time() - t0), 's,', len(mesh.faces), 'faces, peak GB', round(torch.cuda.max_memory_allocated() / 1e9, 1))
`;
fs.mkdirSync('/tmp/i23d', { recursive: true });
fs.writeFileSync('/tmp/i23d/gen3d.py', py);
for (const f of files) await up(f, '/work');
await up('/tmp/i23d/gen3d.py', '/work');
const cfg = JSON.stringify({ name, mv, texviews: !!args.texviews, views: VIEWS, faces: +args.faces || 0, tex: +args.tex || 0 });
await sh(`export HF_HUB_DISABLE_XET=1 HF_HUB_ENABLE_HF_TRANSFER=0 PYTHONPATH=/work/Hunyuan3D-2; cd /work/Hunyuan3D-2 && rm -f /work/${name}.glb && python /work/gen3d.py '${cfg}' 2>&1 | grep -E "^(shape|done)|Error|error"; test -f /work/${name}.glb`);
await P.pull(st, `/work/${name}.glb`, path.join(outDir, `${name}.glb`));

// 5. stop the pod (unless --keep) and report the cost
if (args.keep) console.log(`pod kept (stops itself after 30 min idle, $${st.costPerHr}/h)`);
else { const r = await P.down(); console.log(`RunPod: ≈ $${r.est.toFixed(2)}`); }
