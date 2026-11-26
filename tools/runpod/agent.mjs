// Tiny HTTP agent that runs inside a RunPod pod (started by tools/runpod.mjs).
// No dependencies (Node built-ins only). Every request needs the header `x-token: $AGENT_TOKEN`.
//   GET  /health                 → { ok, uptime, setup }
//   PUT  /upload?dir=/work       → body is a .tar.gz, extracted into dir
//   PUT  /chunk?id=X&i=N, POST /untar?id=X&n=N&dir=/work → the same .tar.gz sent in pieces, in parallel
//   POST /exec                   → body is a bash command; returns { id } (runs in the background)
//   GET  /job?id=ID&from=N       → { running, code, size, log } (log from byte N)
//   GET  /file?path=/work/x.mp4  → streams the file
//   GET  /tar?dir=/work/repo&p=a&p=b[&since=S] → streams a .tar.gz of those paths (relative to dir; missing ones skipped)
// Idle shutdown: with AGENT_IDLE_MIN set, the pod terminates ITSELF after that many minutes with no request and no job
// running (RunPod gives every pod a key scoped to that pod only: RUNPOD_API_KEY + RUNPOD_POD_ID), so a pod kept for
// the review tools is never forgotten and billed for hours.
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const TOKEN = process.env.AGENT_TOKEN;
const PORT = parseInt(process.env.AGENT_PORT || '8000');
const JOBS = '/work/.jobs';
fs.mkdirSync(JOBS, { recursive: true });
const jobs = new Map();
let n = 0;

function startJob(cmd, id = `j${++n}`) {
  const log = `${JOBS}/${id}.log`;
  const fd = fs.openSync(log, 'a');
  const p = spawn('bash', ['-lc', cmd], { cwd: '/work', stdio: ['ignore', fd, fd] });
  const job = { id, running: true, code: null, log, t0: Date.now() };
  p.on('exit', (c) => { job.running = false; job.code = c; job.t1 = Date.now(); fs.closeSync(fd); });
  jobs.set(id, job);
  return job;
}
// optional setup command passed by the launcher (installs ffmpeg etc. while we upload the code)
if (process.env.AGENT_SETUP) startJob(Buffer.from(process.env.AGENT_SETUP, 'base64').toString(), 'setup');

let lastSeen = Date.now();
const IDLE = parseFloat(process.env.AGENT_IDLE_MIN || '0') * 60000;
if (IDLE > 0) setInterval(async () => {
  if ([...jobs.values()].some((j) => j.running && j.id !== 'setup') || Date.now() - lastSeen < IDLE) return;
  const id = process.env.RUNPOD_POD_ID, key = process.env.RUNPOD_API_KEY;
  console.log(`idle for ${Math.round((Date.now() - lastSeen) / 60000)} min: terminating pod ${id}`);
  if (!id || !key) return console.log('no RUNPOD_POD_ID / RUNPOD_API_KEY: cannot terminate myself');
  try {
    const r = await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: `mutation { podTerminate(input: { podId: "${id}" }) }` }) });
    console.log('terminate:', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.log('terminate failed:', e.message); }
}, 30000);

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.headers['x-token'] !== TOKEN) return json(res, 401, { error: 'bad token' });
  lastSeen = Date.now();
  try {
    if (u.pathname === '/health') {
      const s = jobs.get('setup');
      return json(res, 200, { ok: true, now: Date.now(), uptime: process.uptime(), setup: s ? { running: s.running, code: s.code } : null });
    }
    if (u.pathname === '/upload' && req.method === 'PUT') {
      const dir = u.searchParams.get('dir') || '/work';
      fs.mkdirSync(dir, { recursive: true });
      const tar = spawn('tar', ['xzf', '-', '-C', dir], { stdio: ['pipe', 'ignore', 'pipe'] });
      let err = '';
      tar.stderr.on('data', (d) => (err += d));
      req.pipe(tar.stdin);
      tar.on('exit', (c) => json(res, c === 0 ? 200 : 500, { ok: c === 0, err }));
      return;
    }
    // chunked upload (the RunPod proxy is slow and stalls on one long request): PUT /chunk?id=X&i=N (raw bytes), then
    // POST /untar?id=X&n=N&dir=D joins the N chunks and extracts them
    if (u.pathname === '/chunk' && req.method === 'PUT') {
      const id = (u.searchParams.get('id') || '').replace(/[^\w-]/g, ''), i = parseInt(u.searchParams.get('i'));
      fs.mkdirSync(`/work/.up/${id}`, { recursive: true });
      const f = `/work/.up/${id}/${i}`, out = fs.createWriteStream(f + '.part');
      req.pipe(out);
      out.on('finish', () => { fs.renameSync(f + '.part', f); json(res, 200, { ok: true, size: fs.statSync(f).size }); });
      out.on('error', (e) => json(res, 500, { error: String(e) }));
      return;
    }
    if (u.pathname === '/untar' && req.method === 'POST') {
      const id = (u.searchParams.get('id') || '').replace(/[^\w-]/g, ''), n = parseInt(u.searchParams.get('n'));
      const dir = u.searchParams.get('dir') || '/work', up = `/work/.up/${id}`;
      const missing = []; for (let i = 0; i < n; i++) if (!fs.existsSync(`${up}/${i}`)) missing.push(i);
      if (missing.length) return json(res, 409, { ok: false, missing });
      fs.mkdirSync(dir, { recursive: true });
      const parts = Array.from({ length: n }, (_, i) => `'${up}/${i}'`).join(' ');
      const tar = spawn('bash', ['-c', `cat ${parts} | tar xzf - -C '${dir}' && rm -rf '${up}'`], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      tar.stderr.on('data', (d) => (err += d));
      tar.on('exit', (c) => json(res, c === 0 ? 200 : 500, { ok: c === 0, err }));
      return;
    }
    if (u.pathname === '/exec' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => { const j = startJob(body); json(res, 200, { id: j.id }); });
      return;
    }
    if (u.pathname === '/job') {
      const j = jobs.get(u.searchParams.get('id'));
      if (!j) return json(res, 404, { error: 'no such job' });
      const from = parseInt(u.searchParams.get('from') || '0');
      const size = fs.statSync(j.log).size;
      const fd = fs.openSync(j.log, 'r');
      const len = Math.max(0, Math.min(size - from, 1 << 20));
      const buf = Buffer.alloc(len);
      if (len) fs.readSync(fd, buf, 0, len, from);
      fs.closeSync(fd);
      return json(res, 200, { running: j.running, code: j.code, size: from + len, log: buf.toString(), secs: ((j.t1 || Date.now()) - j.t0) / 1000 });
    }
    if (u.pathname === '/tar') {
      const dir = u.searchParams.get('dir') || '/work';
      const ps = u.searchParams.getAll('p').filter((x) => fs.existsSync(`${dir}/${x}`));
      res.writeHead(200, { 'content-type': 'application/gzip' });
      if (!ps.length) return res.end();
      // since=<epoch s>: only what changed since then (the stills of THIS run, not every older one)
      const since = u.searchParams.get('since');
      const tar = spawn('tar', ['czf', '-', '-C', dir, ...(since ? [`--newer-mtime=@${since}`] : []), ...ps], { stdio: ['ignore', 'pipe', 'ignore'] });
      tar.stdout.pipe(res);
      return;
    }
    if (u.pathname === '/file') {
      const p = u.searchParams.get('path');
      const st = fs.statSync(p);
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': st.size });
      fs.createReadStream(p).pipe(res);
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: String(e) }); }
}).listen(PORT, '0.0.0.0', () => console.log('agent on', PORT));
