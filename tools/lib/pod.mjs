// RunPod pod lifecycle + the tiny agent client, shared by tools/runpod.mjs (MP4 renders) and tools/lib/remote.mjs
// (the review tools — still / review / beats / check / poster — on a GPU instead of the CPU renderer).
// State of the running pod: .runpod/pod.json (git-ignored). Needs RUNPOD_KEY (or RUNPOD_API_KEY) in the env or .env.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs, ROOT } from './common.mjs';
import { bundlePaths, RENDER_FILES } from './bundle.mjs';

const args = parseArgs();
const STATE_DIR = path.join(ROOT, '.runpod');
const STATE = path.join(STATE_DIR, 'pod.json');
export const IMAGE = args.image || 'mcr.microsoft.com/playwright:v1.63.0-noble';
// GPU choice: --gpu-types "A,B" (in that order), else every GPU up to --max-price $/h (default 0.30) in the community
// cloud AND the secure cloud (--cloud community|secure|all, default all): the ones RunPod reports in stock first, then the
// cheapest. Community stock is often empty for hours; secure A4000/A4500 ($0.25/h) are the reliable fallback.
// --wait N: keep retrying for N minutes (a round every 2 min) when nothing is available.
export const IDLE_MIN = 20;
export const MAX_PRICE = parseFloat(args['max-price'] || '0.30');
const CLOUDS = { community: ['COMMUNITY'], secure: ['SECURE'], all: ['COMMUNITY', 'SECURE'] }[args.cloud || 'all'] || ['COMMUNITY', 'SECURE'];
export async function gpuCandidates() {
  const d = await gql(`{ gpuTypes { id communityCloud secureCloud communityPrice securePrice
    c: lowestPrice(input: { gpuCount: 1, secureCloud: false }) { stockStatus }
    s: lowestPrice(input: { gpuCount: 1, secureCloud: true }) { stockStatus } } }`);
  const want = args['gpu-types'] ? args['gpu-types'].split(',').map((x) => x.trim()) : null;
  // Tesla V100 hosts were 3.5x slower than an RTX 3070 (old CPUs: JPEG + x264 are CPU work) — skip unless asked
  const skip = new RegExp(args.exclude || 'V100', 'i');
  const rank = { High: 0, Medium: 1, Low: 2 };
  const out = [];
  for (const g of d.gpuTypes) {
    if (want ? !want.includes(g.id) : skip.test(g.id)) continue;
    for (const cloud of CLOUDS) {
      const sec = cloud === 'SECURE';
      const price = sec ? g.securePrice : g.communityPrice;
      if (!(sec ? g.secureCloud : g.communityCloud) || !price || price > MAX_PRICE) continue;
      const stock = (sec ? g.s : g.c)?.stockStatus || null;
      out.push({ id: g.id, cloud, price, stock, order: want ? want.indexOf(g.id) : 0 });
    }
  }
  return out.sort((a, b) => a.order - b.order || (rank[a.stock] ?? 9) - (rank[b.stock] ?? 9) || a.price - b.price);
}
const SETUP = [
  'set -e',
  'export DEBIAN_FRONTEND=noninteractive',
  't0=$(date +%s)',
  'apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg >/dev/null',
  'echo "ffmpeg installed in $(( $(date +%s) - t0 ))s"',
  'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -g -s --no-audit --no-fund playwright@1.63.0 >/dev/null',
  'echo "playwright installed in $(( $(date +%s) - t0 ))s"',
  'nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || true',
  'echo "vcpus: $(nproc)  ram: $(free -g | awk \'/Mem/{print $2}\')G"',
].join('\n');

export function hasKey() { try { return !!key(); } catch { return false; } }
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

// RunPod REST v2 (https://api.runpod.io/v2, docs.runpod.io); v1 (rest.runpod.io) is deprecated and gone from DNS.
// The callers use the old v1 field names: toV2 / the response mapping below translate them.
const REST = process.env.RUNPOD_REST || 'https://api.runpod.io/v2';
const toV2 = (b) => ({ name: b.name, image: b.imageName, cloud: b.cloudType, disk: b.containerDiskInGb, ports: b.ports, env: b.env,
  cmd: b.dockerStartCmd, gpu: { id: b.gpuTypeIds[0], count: b.gpuCount || 1, minRamPerGpu: b.minRAMPerGPU, minVcpuCountPerGpu: b.minVCPUPerGPU } });
export async function rest(method, p, body) {
  const r = await fetch(`${REST}${p}`, { method, headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' }, body: body && JSON.stringify(toV2(body)) });
  const t = await r.text();
  if (!r.ok) throw new Error(`RunPod ${method} ${p} → ${r.status}: ${t.slice(0, 400)}`);
  const j = t ? JSON.parse(t) : {};
  if (j.id) { j.costPerHr ??= j.cost; j.desiredStatus ??= j.status; j.gpuTypeId ??= j.gpu?.id; }
  return j;
}
export async function gql(query) {
  const r = await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: { Authorization: `Bearer ${key()}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  const d = await r.json();
  if (d.errors) throw new Error(JSON.stringify(d.errors).slice(0, 400));
  return d.data;
}
export const balance = async () => (await gql('{ myself { clientBalance } }')).myself.clientBalance;

// ---- agent HTTP client -------------------------------------------------------------------
function agentUrl(st, p) { return `https://${st.id}-8000.proxy.runpod.net${p}`; }
export async function agent(st, p, opts = {}) {
  // every request has a timeout: a request through the RunPod proxy can hang forever otherwise
  const r = await fetch(agentUrl(st, p), { ...opts, signal: AbortSignal.timeout(opts.timeout || 30000), headers: { 'x-token': st.token, ...(opts.headers || {}) } });
  if (opts.raw) return r;
  const t = await r.text();
  try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, error: t.slice(0, 200) }; }
}
export async function exec(st, command, { quiet = false, id } = {}) {
  if (!id) ({ id } = await agent(st, '/exec', { method: 'POST', body: command }));
  let from = 0;
  for (;;) {
    let j;
    try { j = await agent(st, `/job?id=${id}&from=${from}`); } catch (e) { await sleep(2000); continue; }
    if (j.status !== 200) { await sleep(2000); continue; }
    if (j.log && !quiet) process.stdout.write(j.log);
    from = j.size;
    if (!j.running) {
      if (j.code !== 0) throw new Error(`remote command failed (exit ${j.code}): ${command.slice(0, 120)}`);
      return j;
    }
    await sleep(1500);
  }
}

// ---- pod lifecycle ---------------------------------------------------------------------
export async function up(bad = new Set(), { minVcpu = 4 } = {}) {
  const old = loadState();
  if (old) { console.log(`Pod ${old.id} already in .runpod/pod.json (run "down" first).`); return old; }
  const token = crypto.randomBytes(18).toString('hex');
  const agentB64 = fs.readFileSync(path.join(ROOT, 'tools/runpod/agent.mjs')).toString('base64');
  const t0 = now();
  const bal0 = await balance();
  const body = {
    name: 'lego-shorts-render',
    imageName: IMAGE,
    cloudType: 'COMMUNITY',
    computeType: 'GPU',
    gpuCount: 1,
    containerDiskInGb: 15,
    volumeInGb: 0,
    ports: ['8000/http'],
    supportPublicIp: false,
    minVCPUPerGPU: parseInt(args['min-vcpu'] || '4'),
    minRAMPerGPU: parseInt(args['min-ram'] || '4'),
    env: {
      AGENT_TOKEN: token,
      AGENT_JS: agentB64,
      AGENT_SETUP: Buffer.from(SETUP).toString('base64'),
      AGENT_IDLE_MIN: String(args['idle-min'] || IDLE_MIN),  // the pod terminates itself when nobody used it for that long
      NVIDIA_DRIVER_CAPABILITIES: 'all',  // graphics (EGL/Vulkan) + video (NVENC), not only compute
    },
    dockerStartCmd: ['bash', '-c', 'mkdir -p /work && echo "$AGENT_JS" | base64 -d > /work/agent.mjs && exec node /work/agent.mjs'],
  };
  // try the GPU types one by one (in stock first, then cheapest); stock changes by the minute, so retry for --wait minutes
  let pod, cand;
  const vcpus = [...new Set([parseInt(args['min-vcpu'] || minVcpu), 4, 2])].sort((a, b) => b - a);
  const deadline = t0 + 60 * parseFloat(args.wait || '0');
  for (let round = 1; !pod; round++) {
    const cands = (await gpuCandidates()).filter((c) => !bad.has(c.cloud + c.id));
    if (!cands.length) throw new Error(`no GPU type at ≤ $${MAX_PRICE}/h (raise --max-price or change --gpu-types)`);
    if (round === 1) console.log(`GPU candidates ≤ $${MAX_PRICE}/h: ${cands.map((c) => `${c.id.replace('NVIDIA ', '')} ${c.cloud.toLowerCase()} $${c.price}${c.stock ? ` [${c.stock}]` : ''}`).join(', ')}`);
    outer: for (const minV of vcpus) for (const c of cands) {
      try {
        pod = await rest('POST', '/pods', { ...body, cloudType: c.cloud, gpuTypeIds: [c.id], minVCPUPerGPU: minV });
        cand = c; console.log(`Got ${c.id} (${c.cloud.toLowerCase()} cloud, $${c.price}/h, min ${minV} vCPU)`); break outer;
      } catch (e) {
        if (!/no instances|not available|insufficient|no longer any instances|could not find/i.test(e.message)) throw e;
        if (round === 1) console.log(`  no ${c.id} (${c.cloud.toLowerCase()}) with ≥${minV} vCPU available`);
      }
    }
    if (pod) break;
    if (now() + 120 > deadline) throw new Error(`no GPU ≤ $${MAX_PRICE}/h available${args.wait ? ` after ${args.wait} min` : ''} — try again later, or pass --wait N / --max-price / --gpu-types`);
    console.log(`  round ${round}: nothing available, retrying in 2 min (until ${new Date(deadline * 1000).toISOString().slice(11, 16)} UTC)`);
    await sleep(120000);
  }
  const st = { id: pod.id, token, created: now(), bal0, gpu: pod.machine?.gpuTypeId || pod.gpuTypeId || cand.id, cloud: cand.cloud,
    costPerHr: pod.costPerHr ?? pod.adjustedCostPerHr ?? cand.price };
  saveState(st);
  // never run a pod billed above the cap (RunPod may place us on a pricier host than the list price)
  if (st.costPerHr > MAX_PRICE + 1e-9) { await down(); throw new Error(`pod billed $${st.costPerHr}/h > --max-price ${MAX_PRICE} — terminated`); }
  console.log(`Pod ${st.id} created (${st.gpu}, $${st.costPerHr}/h)  [${fmt(now() - t0)}]`);
  // wait for the image pull + agent. A pod that never comes up (host stuck pulling the image) is terminated and
  // another GPU type is tried; any other failure also terminates it, so a pod is never left running (and billed).
  const wait = parseFloat(args['pod-timeout'] || '420');
  try {
    for (;;) {
      let h;
      try { h = await agent(st, '/health', { timeout: 10000 }); } catch {}
      if (h?.ok) break;
      if (now() - st.created > wait) throw Object.assign(new Error(`pod did not come up in ${Math.round(wait / 60)} min`), { stuck: true });
      await sleep(4000);
    }
  } catch (e) {
    console.log(`${e.message} (${st.gpu}, ${st.cloud}) — terminating the pod`);
    await down().catch((e2) => console.log('down failed: ' + e2.message));
    if (!e.stuck || bad.size >= 6) throw e;
    bad.add(cand.cloud + cand.id);
    console.log(`Trying another GPU type (${bad.size} skipped so far)`);
    return up(bad, { minVcpu });
  }
  st.ready = now();
  saveState(st);
  console.log(`Agent up after ${fmt(st.ready - st.created)} (image pull + container start)`);
  return st;
}
export async function podInfo(st) {
  const p = await rest('GET', `/pods/${st.id}`);
  return { gpu: p.machine?.gpuTypeId || p.gpu?.id || p.gpuTypeId || '?', costPerHr: p.costPerHr ?? p.adjustedCostPerHr, status: p.desiredStatus, vcpu: p.vcpuCount, mem: p.memoryInGb, raw: p };
}
export async function down({ gone = false } = {}) {
  const st = loadState();
  if (!st) { console.log('No pod in .runpod/pod.json'); return; }
  try { await rest('DELETE', `/pods/${st.id}`); } catch (e) { if (!/404|not found/i.test(e.message)) throw e; }
  fs.rmSync(STATE);
  // a pod that terminated itself when idle: billed until its last use + the idle time
  const secs = gone && st.lastUsed ? Math.min(now(), st.lastUsed + 60 * (st.idleMin || IDLE_MIN) + 60) - st.created : now() - st.created;
  const est = (secs / 3600) * (st.costPerHr || 0);
  console.log(`Pod ${st.id} terminated after ${fmt(secs)} → ≈ $${est.toFixed(4)} at $${st.costPerHr}/h`);
  // cost ledger (git-ignored, local): read by `npm run spend`
  fs.mkdirSync(path.join(ROOT, 'costs'), { recursive: true });
  fs.appendFileSync(path.join(ROOT, 'costs', 'runpod.jsonl'), JSON.stringify({ date: new Date(st.created * 1000).toISOString(), pod: st.id, gpu: st.gpu,
    costPerHr: st.costPerHr, secs: Math.round(secs), est: +est.toFixed(5), what: st.what || 'manual' }) + '\n');
  return { secs, est };
}

// ---- code upload -------------------------------------------------------------------------
function tarball(videoDirs, { filmsOnly = false, check = videoDirs } = {}) {
  // bundlePaths(check) throws when a film references a file outside the bundle — checked even when only code goes up
  return bundlePaths(check).then(() => filmsOnly ? videoDirs.map((d) => path.relative(ROOT, d)) : [...RENDER_FILES, ...videoDirs.map((d) => path.relative(ROOT, d))]).then((list) => new Promise((res, rej) => {
    const p = spawn('tar', ['czf', '-', '--exclude=out', '--exclude=stills', '--exclude=_sample_*', ...list], { cwd: ROOT });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('exit', (c) => (c === 0 ? res(Buffer.concat(chunks)) : rej(new Error('tar failed'))));
  }));
}
/** a cheap fingerprint of the code part of the bundle (paths, sizes, mtimes): unchanged → only the films are uploaded */
export function codeSignature() {
  const h = crypto.createHash('sha1');
  const walk = (p) => { const s = fs.statSync(p); if (s.isDirectory()) { for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); } else h.update(`${p}:${s.size}:${s.mtimeMs}\n`); };
  for (const p of RENDER_FILES) if (fs.existsSync(path.join(ROOT, p))) walk(path.join(ROOT, p));
  return h.digest('hex');
}
// The RunPod proxy is slow per request (≈ 20–250 KB/s) and a long PUT often stalls until its timeout (a 10 MB film took
// 3–9 min in the YouTube workflow): the tarball goes up in 2 MB pieces, 8 at a time, each retried on its own.
const CHUNK = 2 << 20, PARALLEL = 8;
async function sendTar(st, buf, dir = '/work/repo') {
  const id = crypto.randomBytes(6).toString('hex'), n = Math.max(1, Math.ceil(buf.length / CHUNK));
  let next = 0, err = null, old = false;
  const worker = async () => {
    while (next < n && !err && !old) {
      const i = next++, body = buf.subarray(i * CHUNK, (i + 1) * CHUNK);
      for (let a = 0; ; a++) {
        const r = await agent(st, `/chunk?id=${id}&i=${i}`, { method: 'PUT', body, timeout: 120000, headers: { 'content-type': 'application/octet-stream' } }).catch((e) => ({ error: e.message }));
        if (r.ok) break;
        if (r.status === 404 && r.error === 'not found') { old = true; return; } // an agent from before the chunked upload
        if (a >= 6) { err = `chunk ${i}/${n}: ${JSON.stringify(r)}`; return; }
        await sleep(2000 * (a + 1));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, n) }, worker));
  if (old) return sendWhole(st, buf, dir);
  if (err) throw new Error('upload failed: ' + err);
  let r;
  for (let a = 0; a < 5; a++) {
    r = await agent(st, `/untar?id=${id}&n=${n}&dir=${encodeURIComponent(dir)}`, { method: 'POST', timeout: 300000 }).catch((e) => ({ error: e.message }));
    if (r.ok || r.status === 409 || r.status === 500) break;
    await sleep(3000 * (a + 1));
  }
  if (!r.ok) throw new Error('upload failed (untar): ' + JSON.stringify(r));
}
async function sendWhole(st, buf, dir) {
  // the RunPod proxy sometimes answers 404 / 5xx for a few seconds after the pod came up: retry
  let r;
  for (let i = 0; i < 5; i++) {
    r = await agent(st, `/upload?dir=${encodeURIComponent(dir)}`, { method: 'PUT', body: buf, timeout: 300000, headers: { 'content-type': 'application/gzip' } }).catch((e) => ({ error: e.message }));
    if (r.ok) break;
    await sleep(3000 * (i + 1));
  }
  if (!r.ok) throw new Error('upload failed: ' + JSON.stringify(r));
}
/** a cheap fingerprint of a film folder (paths, sizes, mtimes; not out/ or stills/) */
function filmSignature(dir) {
  const h = crypto.createHash('sha1');
  const walk = (p) => { const s = fs.statSync(p); if (s.isDirectory()) { for (const f of fs.readdirSync(p).sort()) if (!['out', 'stills'].includes(f)) walk(path.join(p, f)); } else h.update(`${p}:${s.size}:${s.mtimeMs}\n`); };
  walk(dir);
  return h.digest('hex');
}
/**
 * Upload the code + these films to /work/repo. smart: only what is not on this pod yet (the code when it changed, the films
 * that changed since they were sent) — a batch that runs the checks and then renders on the same pod sends everything once.
 */
export async function push(st, videoDirs, { smart = false } = {}) {
  const t0 = now();
  const sig = smart ? codeSignature() : null;
  const code = !smart || st.codeSig !== sig;
  const sigs = Object.fromEntries(videoDirs.map((d) => [path.relative(ROOT, d), filmSignature(d)]));
  const films = smart ? videoDirs.filter((d) => st.films?.[path.relative(ROOT, d)] !== sigs[path.relative(ROOT, d)]) : videoDirs;
  if (!code && !films.length) { console.log('Code + film(s) already on the pod'); return; }
  const buf = await tarball(films, { filmsOnly: !code, check: videoDirs });
  await sendTar(st, buf);
  st.codeSig = codeSignature(); st.films = { ...(st.films || {}), ...Object.fromEntries(films.map((d) => [path.relative(ROOT, d), sigs[path.relative(ROOT, d)]])) };
  saveState(st);
  const what = [code && 'code', films.length && films.map((d) => path.basename(d).slice(0, 3)).join('+')].filter(Boolean).join(' + film ');
  console.log(`Uploaded ${what} (${(buf.length / 1e6).toFixed(1)} MB) in ${fmt(now() - t0)}`);
}
/** download paths (relative to /work/repo) as one tar.gz and unpack them into the repo here */
export async function pullTree(st, rels, { since } = {}) {
  const q = rels.map((p) => `p=${encodeURIComponent(p)}`).join('&') + (since ? `&since=${Math.floor(since)}` : '');
  const r = await agent(st, `/tar?dir=/work/repo&${q}`, { raw: true, timeout: 600000 });
  if (!r.ok) throw new Error(`download ${rels.join(', ')}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) return 0;
  await new Promise((res, rej) => { const t = spawn('tar', ['xzf', '-', '-C', ROOT], { stdio: ['pipe', 'inherit', 'inherit'] }); t.on('exit', (c) => (c ? rej(new Error('tar x failed')) : res())); t.stdin.end(buf); });
  return buf.length;
}
export async function pull(st, remote, local) {
  const t0 = now();
  const r = await agent(st, `/file?path=${encodeURIComponent(remote)}`, { raw: true, timeout: 600000 });
  if (!r.ok) throw new Error(`download ${remote}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, buf);
  console.log(`Downloaded ${path.relative(ROOT, local)} (${(buf.length / 1e6).toFixed(1)} MB) in ${fmt(now() - t0)}`);
}
export async function waitSetup(st) {
  const t0 = now();
  console.log('-- setup on the pod (ffmpeg, playwright):');
  await exec(st, '', { id: 'setup' });
  console.log(`Setup finished (+${fmt(now() - t0)} waiting here)`);
}
