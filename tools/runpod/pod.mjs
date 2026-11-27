// RunPod pod lifecycle + the agent client, adapted from ctalau/lego-shorts (tools/lib/pod.mjs) for Blender renders.
// State of the running pod: .runpod/pod.json (git-ignored). Cost ledger: costs/runpod.jsonl (git-ignored).
// Needs RUNPOD_KEY (or RUNPOD_API_KEY) in the env or .env.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs();
const STATE_DIR = path.join(ROOT, '.runpod');
const STATE = path.join(STATE_DIR, 'pod.json');
// The Playwright image has Node (for the agent), Chromium and Python; usually cached on RunPod hosts.
export const IMAGE = args.image || 'mcr.microsoft.com/playwright:v1.63.0-noble';
export const BLENDER = '4.5.9';
export const IDLE_MIN = 20;
export const MAX_PRICE = parseFloat(args['max-price'] || '0.30');
const CLOUDS = { community: ['COMMUNITY'], secure: ['SECURE'], all: ['COMMUNITY', 'SECURE'] }[args.cloud || 'all'] || ['COMMUNITY', 'SECURE'];

// GPU choice: --gpu-types "A,B" (in that order), else every GPU up to --max-price $/h in the community and secure
// cloud, the ones RunPod reports in stock first, then the cheapest. Tesla V100 hosts are slow (old CPUs): skipped.
export async function gpuCandidates() {
  const d = await gql(`{ gpuTypes { id communityCloud secureCloud communityPrice securePrice
    c: lowestPrice(input: { gpuCount: 1, secureCloud: false }) { stockStatus }
    s: lowestPrice(input: { gpuCount: 1, secureCloud: true }) { stockStatus } } }`);
  const want = args['gpu-types'] ? args['gpu-types'].split(',').map((x) => x.trim()) : null;
  const skip = new RegExp(args.exclude || 'V100', 'i');
  const rank = { High: 0, Medium: 1, Low: 2 };
  const out = [];
  for (const g of d.gpuTypes) {
    if (want ? !want.includes(g.id) : skip.test(g.id)) continue;
    for (const cloud of CLOUDS) {
      const sec = cloud === 'SECURE';
      const price = sec ? g.securePrice : g.communityPrice;
      if (!(sec ? g.secureCloud : g.communityCloud) || !price || price > MAX_PRICE) continue;
      out.push({ id: g.id, cloud, price, stock: (sec ? g.s : g.c)?.stockStatus || null, order: want ? want.indexOf(g.id) : 0 });
    }
  }
  return out.sort((a, b) => a.order - b.order || (rank[a.stock] ?? 9) - (rank[b.stock] ?? 9) || a.price - b.price);
}

// Runs on the pod while we upload: FFmpeg, Python with Pillow and NumPy, the DejaVu fonts, the libraries Blender's
// EGL/GL backend needs, and Blender itself (the version that wrote the episode .blend).
const SETUP = [
  'set -e',
  'export DEBIAN_FRONTEND=noninteractive',
  't0=$(date +%s)',
  'apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg python3 python3-pil python3-numpy fonts-dejavu-core \\',
  '  libegl1 libgl1 libxkbcommon0 libsm6 libxi6 libxxf86vm1 libxfixes3 libxrender1 xz-utils curl ca-certificates >/dev/null',
  'echo "packages installed in $(( $(date +%s) - t0 ))s"',
  `curl -sSL https://download.blender.org/release/Blender${BLENDER.split('.').slice(0, 2).join('.')}/blender-${BLENDER}-linux-x64.tar.xz | tar xJ -C /opt`,
  `ln -sf /opt/blender-${BLENDER}-linux-x64/blender /usr/local/bin/blender`,
  'echo "blender installed in $(( $(date +%s) - t0 ))s: $(blender --version | head -1)"',
  'nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || true',
  'echo "vcpus: $(nproc)  ram: $(free -g | awk \'/Mem/{print $2}\')G"',
].join('\n');

export function key() {
  let k = process.env.RUNPOD_KEY || process.env.RUNPOD_API_KEY;
  const envf = path.join(ROOT, '.env');
  if (!k && fs.existsSync(envf)) k = /RUNPOD_(?:API_)?KEY\s*=\s*(.+)/.exec(fs.readFileSync(envf, 'utf8'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!k) throw new Error('RUNPOD_KEY is not set (env var or .env).');
  return k;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => Date.now() / 1000;
export const fmt = (s) => (s >= 90 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${s.toFixed(0)}s`);
export const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null);
export const saveState = (s) => { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); };

// RunPod REST v2; the body is built with the v1 field names and translated here.
const REST = process.env.RUNPOD_REST || 'https://api.runpod.io/v2';
const toV2 = (b) => ({ name: b.name, image: b.imageName, cloud: b.cloudType, disk: b.containerDiskInGb, ports: b.ports, env: b.env,
  cmd: b.dockerStartCmd, gpu: { id: b.gpuTypeIds[0], count: b.gpuCount || 1, minRamPerGpu: b.minRAMPerGPU, minVcpuCountPerGpu: b.minVCPUPerGPU } });
export async function rest(method, p, body) {
  const r = await fetch(`${REST}${p}`, { method, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' }, body: body && JSON.stringify(toV2(body)) });
  const t = await r.text();
  if (!r.ok) throw new Error(`RunPod ${method} ${p} → ${r.status}: ${t.slice(0, 400)}`);
  const j = t ? JSON.parse(t) : {};
  if (j.id) { j.costPerHr ??= j.cost; j.desiredStatus ??= j.status; j.gpuTypeId ??= j.gpu?.id; }
  return j;
}
export async function gql(query) {
  const r = await fetch('https://api.runpod.io/graphql', { method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  const d = await r.json();
  if (d.errors) throw new Error(JSON.stringify(d.errors).slice(0, 400));
  return d.data;
}
export const balance = async () => (await gql('{ myself { clientBalance } }')).myself.clientBalance;

// ---- agent HTTP client: every request has a timeout, a request through the RunPod proxy can hang forever ----
export async function agent(st, p, opts = {}) {
  const r = await fetch(`https://${st.id}-8000.proxy.runpod.net${p}`, { ...opts, signal: AbortSignal.timeout(opts.timeout || 30000),
    headers: { 'x-token': st.token, ...(opts.headers || {}) } });
  if (opts.raw) return r;
  const t = await r.text();
  try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, error: t.slice(0, 200) }; }
}
export async function exec(st, command, { quiet = false, id } = {}) {
  if (!id) ({ id } = await agent(st, '/exec', { method: 'POST', body: command }));
  let from = 0;
  for (;;) {
    let j;
    try { j = await agent(st, `/job?id=${id}&from=${from}`); } catch { await sleep(2000); continue; }
    if (j.status !== 200) { await sleep(2000); continue; }
    if (j.log && !quiet) process.stdout.write(j.log);
    from = j.size;
    if (!j.running) {
      if (j.code !== 0) throw new Error(`remote command failed (exit ${j.code}): ${command.slice(0, 160)}`);
      return j;
    }
    await sleep(1500);
  }
}

// ---- pod lifecycle -------------------------------------------------------------------------
export async function up(bad = new Set()) {
  const old = loadState();
  if (old) { console.log(`Pod ${old.id} already in .runpod/pod.json (run "down" first).`); return old; }
  const token = crypto.randomBytes(18).toString('hex');
  const agentB64 = fs.readFileSync(path.join(ROOT, 'tools/runpod/agent.mjs')).toString('base64');
  const t0 = now();
  const bal0 = await balance();
  const body = {
    name: 'cleopa-render', imageName: IMAGE, cloudType: 'COMMUNITY', computeType: 'GPU', gpuCount: 1,
    containerDiskInGb: parseInt(args.disk || '30'), volumeInGb: 0, ports: ['8000/http'], supportPublicIp: false,
    minVCPUPerGPU: parseInt(args['min-vcpu'] || '8'), minRAMPerGPU: parseInt(args['min-ram'] || '8'),
    env: {
      AGENT_TOKEN: token, AGENT_JS: agentB64, AGENT_SETUP: Buffer.from(SETUP).toString('base64'),
      AGENT_IDLE_MIN: String(args['idle-min'] || IDLE_MIN), // the pod terminates itself when unused for that long
      NVIDIA_DRIVER_CAPABILITIES: 'all', // graphics (EGL) for Blender's Workbench, not only compute
    },
    dockerStartCmd: ['bash', '-c', 'mkdir -p /work && echo "$AGENT_JS" | base64 -d > /work/agent.mjs && exec node /work/agent.mjs'],
  };
  let pod, cand;
  const vcpus = [...new Set([parseInt(args['min-vcpu'] || '8'), 4, 2])].sort((a, b) => b - a);
  const deadline = t0 + 60 * parseFloat(args.wait || '0');
  for (let round = 1; !pod; round += 1) {
    const cands = (await gpuCandidates()).filter((c) => !bad.has(c.cloud + c.id));
    if (!cands.length) throw new Error(`no GPU type at ≤ $${MAX_PRICE}/h (raise --max-price or change --gpu-types)`);
    if (round === 1) console.log(`GPU candidates ≤ $${MAX_PRICE}/h: ${cands.map((c) => `${c.id.replace('NVIDIA ', '')} ${c.cloud.toLowerCase()} $${c.price}${c.stock ? ` [${c.stock}]` : ''}`).join(', ')}`);
    outer: for (const minV of vcpus) for (const c of cands) {
      try {
        pod = await rest('POST', '/pods', { ...body, cloudType: c.cloud, gpuTypeIds: [c.id], minVCPUPerGPU: minV });
        cand = c; console.log(`Got ${c.id} (${c.cloud.toLowerCase()} cloud, $${c.price}/h, min ${minV} vCPU)`); break outer;
      } catch (e) {
        if (!/no instances|not available|insufficient|no longer any instances|could not find/i.test(e.message)) throw e;
      }
    }
    if (pod) break;
    if (now() + 120 > deadline) throw new Error(`no GPU ≤ $${MAX_PRICE}/h available — try later, or pass --wait N / --max-price / --gpu-types`);
    console.log(`  round ${round}: nothing available, retrying in 2 min`);
    await sleep(120000);
  }
  const st = { id: pod.id, token, created: now(), bal0, gpu: pod.machine?.gpuTypeId || pod.gpuTypeId || cand.id, cloud: cand.cloud,
    costPerHr: pod.costPerHr ?? pod.adjustedCostPerHr ?? cand.price };
  saveState(st);
  if (st.costPerHr > MAX_PRICE + 1e-9) { await down(); throw new Error(`pod billed $${st.costPerHr}/h > --max-price ${MAX_PRICE} — terminated`); }
  console.log(`Pod ${st.id} created (${st.gpu}, $${st.costPerHr}/h)  [${fmt(now() - t0)}]`);
  // A pod that never comes up (host stuck pulling the image) is terminated and another GPU type is tried.
  const wait = parseFloat(args['pod-timeout'] || '420');
  try {
    for (;;) {
      let h;
      try { h = await agent(st, '/health', { timeout: 10000 }); } catch { /* not up yet */ }
      if (h?.ok) break;
      if (now() - st.created > wait) throw Object.assign(new Error(`pod did not come up in ${Math.round(wait / 60)} min`), { stuck: true });
      await sleep(4000);
    }
  } catch (e) {
    console.log(`${e.message} (${st.gpu}, ${st.cloud}) — terminating the pod`);
    await down().catch((e2) => console.log(`down failed: ${e2.message}`));
    if (!e.stuck || bad.size >= 6) throw e;
    bad.add(cand.cloud + cand.id);
    return up(bad);
  }
  st.ready = now();
  saveState(st);
  console.log(`Agent up after ${fmt(st.ready - st.created)} (image pull + container start)`);
  return st;
}
export async function podInfo(st) {
  const p = await rest('GET', `/pods/${st.id}`);
  return { gpu: p.machine?.gpuTypeId || p.gpu?.id || p.gpuTypeId || '?', costPerHr: p.costPerHr ?? p.adjustedCostPerHr, status: p.desiredStatus };
}
export async function down() {
  const st = loadState();
  if (!st) { console.log('No pod in .runpod/pod.json'); return { secs: 0, est: 0 }; }
  try { await rest('DELETE', `/pods/${st.id}`); } catch (e) { if (!/404|not found/i.test(e.message)) throw e; }
  fs.rmSync(STATE);
  const secs = now() - st.created;
  const est = (secs / 3600) * (st.costPerHr || 0);
  console.log(`Pod ${st.id} terminated after ${fmt(secs)} → ≈ $${est.toFixed(4)} at $${st.costPerHr}/h`);
  fs.mkdirSync(path.join(ROOT, 'costs'), { recursive: true });
  fs.appendFileSync(path.join(ROOT, 'costs', 'runpod.jsonl'), `${JSON.stringify({ date: new Date(st.created * 1000).toISOString(), pod: st.id,
    gpu: st.gpu, costPerHr: st.costPerHr, secs: Math.round(secs), est: +est.toFixed(5), what: st.what || 'manual' })}\n`);
  return { secs, est };
}

// ---- upload / download ------------------------------------------------------------------------
function tarball(paths) {
  for (const p of paths) if (!fs.existsSync(path.join(ROOT, p))) throw new Error(`missing ${p}`);
  return new Promise((res, rej) => {
    const p = spawn('tar', ['czf', '-', '--exclude=renders/frames', '--exclude=__pycache__', ...paths], { cwd: ROOT });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('exit', (c) => (c === 0 ? res(Buffer.concat(chunks)) : rej(new Error('tar failed'))));
  });
}
// The RunPod proxy is slow per request and a long PUT often stalls: the tarball goes up in 2 MB pieces, 8 at a time.
const CHUNK = 2 << 20, PARALLEL = 8;
export async function push(st, paths, dir = '/work/repo') {
  const t0 = now();
  const buf = await tarball(paths);
  const id = crypto.randomBytes(6).toString('hex'), n = Math.max(1, Math.ceil(buf.length / CHUNK));
  let next = 0, err = null;
  const worker = async () => {
    while (next < n && !err) {
      const i = next++, body = buf.subarray(i * CHUNK, (i + 1) * CHUNK);
      for (let a = 0; ; a += 1) {
        const r = await agent(st, `/chunk?id=${id}&i=${i}`, { method: 'PUT', body, timeout: 120000, headers: { 'content-type': 'application/octet-stream' } }).catch((e) => ({ error: e.message }));
        if (r.ok) break;
        if (a >= 6) { err = `chunk ${i}/${n}: ${JSON.stringify(r)}`; return; }
        await sleep(2000 * (a + 1));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, n) }, worker));
  if (err) throw new Error(`upload failed: ${err}`);
  let r;
  for (let a = 0; a < 5; a += 1) {
    r = await agent(st, `/untar?id=${id}&n=${n}&dir=${encodeURIComponent(dir)}`, { method: 'POST', timeout: 300000 }).catch((e) => ({ error: e.message }));
    if (r.ok || r.status === 409 || r.status === 500) break;
    await sleep(3000 * (a + 1));
  }
  if (!r.ok) throw new Error(`upload failed (untar): ${JSON.stringify(r)}`);
  console.log(`Uploaded ${paths.length} path(s) (${(buf.length / 1e6).toFixed(1)} MB) in ${fmt(now() - t0)}`);
}
/** download paths (relative to /work/repo) as one tar.gz and unpack them into the repo here */
export async function pullTree(st, rels) {
  const t0 = now();
  const q = rels.map((p) => `p=${encodeURIComponent(p)}`).join('&');
  const r = await agent(st, `/tar?dir=/work/repo&${q}`, { raw: true, timeout: 600000 });
  if (!r.ok) throw new Error(`download ${rels.join(', ')}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length) {
    await new Promise((res, rej) => { const t = spawn('tar', ['xzf', '-', '-C', ROOT], { stdio: ['pipe', 'inherit', 'inherit'] }); t.on('exit', (c) => (c ? rej(new Error('tar x failed')) : res())); t.stdin.end(buf); });
  }
  console.log(`Downloaded ${rels.join(', ')} (${(buf.length / 1e6).toFixed(1)} MB) in ${fmt(now() - t0)}`);
  return buf.length;
}
export async function pull(st, remote, local) {
  const r = await agent(st, `/file?path=${encodeURIComponent(remote)}`, { raw: true, timeout: 600000 });
  if (!r.ok) throw new Error(`download ${remote}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, buf);
  console.log(`Downloaded ${local} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
export async function waitSetup(st) {
  const t0 = now();
  console.log('-- setup on the pod (ffmpeg, python, blender):');
  await exec(st, '', { id: 'setup' });
  console.log(`Setup finished (+${fmt(now() - t0)} waiting here)`);
}
