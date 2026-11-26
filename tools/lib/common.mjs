// Shared helpers for the Node tools.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { ROOT } from '../serve.mjs';
import { compile } from '../../lib/engine/timeline.js';
import { compile3, setNames } from '../../lib/engine3/timeline3.js';

export { ROOT };

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
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

/** Accepts "videos/001-x", "001-x", "001" or a path to video.json. Returns absolute folder. */
export function resolveVideoDir(arg) {
  if (!arg) throw new Error('Specify a video folder, e.g. videos/001-strugurele-lui-macarie');
  let p = arg.endsWith('video.json') ? path.dirname(arg) : arg;
  const cands = [path.resolve(p), path.join(ROOT, p), path.join(ROOT, 'videos', p)];
  for (const c of cands) if (fs.existsSync(path.join(c, 'video.json'))) return c;
  const vids = fs.existsSync(path.join(ROOT, 'videos')) ? fs.readdirSync(path.join(ROOT, 'videos')) : [];
  const m = vids.find((v) => v.startsWith(arg));
  if (m) return path.join(ROOT, 'videos', m);
  throw new Error(`No video.json found for "${arg}"`);
}

export function loadVideo(dir) {
  const desc = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const mf = path.join(dir, 'audio', 'lines.json');
  const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
  return { desc, manifest, timeline: desc.style === 'blender' ? compile3(desc, manifest, blenderMetas(desc)) : compile(desc, manifest) };
}

/** set / character metadata of a "style": "blender" film (assets/sets/<name>.json, assets/characters/monk.json) */
export function blenderMetas(desc) {
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };
  const setMetas = {};
  for (const n of setNames(desc)) { const m = rd(`assets/sets/${n}.json`); if (m) setMetas[n] = m; }
  return { setMetas, charMeta: rd('assets/characters/monk.json') };
}

/** Chromium flags: --gpu = the real GPU (ANGLE on EGL; --gl vulkan), else SwiftShader (CPU, works in any container) */
export function browserArgs(args = {}) {
  const GL = { egl: ['--use-gl=angle', '--use-angle=gl-egl'], vulkan: ['--use-angle=vulkan', '--enable-features=Vulkan'], default: ['--use-angle=default'] };
  return args.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', ...(GL[args.gl || 'egl'] || GL.egl)]
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
}

/** CPUs this process may really use (a container's cgroup quota, not the host's core count) */
export function cpuCount() {
  let n = os.availableParallelism?.() ?? os.cpus().length;
  const rd = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
  let q = null, p = null;
  const v2 = rd('/sys/fs/cgroup/cpu.max'); // cgroup v2: "<quota> <period>" / "max <period>"
  if (v2) [q, p] = v2.split(/\s+/); else { q = rd('/sys/fs/cgroup/cpu/cpu.cfs_quota_us') ?? rd('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us'); p = rd('/sys/fs/cgroup/cpu/cpu.cfs_period_us') ?? rd('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us'); }
  if (q && q !== 'max' && +q > 0 && +p > 0) n = Math.min(n, Math.max(1, Math.round(+q / +p)));
  return n;
}

/** The runtime checks of a film, split over several pages (browser tabs = separate processes) by time: the checks of a
 *  blender film are CPU-heavy (collision tests at 10–20 Hz + 30 fps jump test) — ~2 min on one core. Other styles run
 *  in one page. openPage() must return a ready page of the film. */
export async function parallelChecks(openPage, tl, { workers } = {}) {
  const n = tl.style === 'blender' ? Math.max(1, Math.min(8, workers || cpuCount() - 1 || 1)) : 1;
  if (n === 1) { const p = await openPage(); try { return await p.evaluate(() => window.__studio.check()); } finally { await p.close(); } }
  // cut the film where the scenes end when possible, so most problems stay in one piece
  const cuts = [0];
  for (let i = 1; i < n; i++) {
    const t = (tl.duration * i) / n;
    const sc = tl.scenes.find((s) => Math.abs(s.end - t) < tl.duration / n / 3);
    cuts.push(sc ? sc.end : t);
  }
  cuts.push(tl.duration + 1);
  const parts = await Promise.all(cuts.slice(0, -1).map(async (a, i) => {
    const p = await openPage();
    try { return await p.evaluate(([from, to]) => window.__studio.check({ from, to }), [a, cuts[i + 1]]); } finally { await p.close(); }
  }));
  // join a problem cut in two at a boundary
  const out = [];
  for (const w of parts.flat().sort((x, y) => (x.t0 ?? x.t) - (y.t0 ?? y.t))) {
    const prev = w.key && out.findLast((o) => o.key === w.key);
    if (prev && (w.t0 ?? w.t) - (prev.t1 ?? prev.t) < 0.35) { prev.t1 = Math.max(prev.t1 ?? prev.t, w.t1 ?? w.t); continue; }
    out.push(w);
  }
  return out;
}

export function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  return createRequire(path.join(g, 'noop.js'))('playwright');
}

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.stdio || ['ignore', 'inherit', 'inherit'], ...opts });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited with ${c}`))));
  });
}

/** An env var, or the same name in the repo's .env file (never committed). */
export function env(name) {
  if (process.env[name]) return process.env[name];
  const envf = path.join(ROOT, '.env');
  if (!fs.existsSync(envf)) return undefined;
  const m = new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm').exec(fs.readFileSync(envf, 'utf8'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

export function apiKey() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) {
    const envf = path.join(ROOT, '.env');
    if (fs.existsSync(envf)) {
      const m = /OPENROUTER_API_KEY\s*=\s*(.+)/.exec(fs.readFileSync(envf, 'utf8'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
    throw new Error('OPENROUTER_API_KEY is not set (env var or .env file).');
  }
  return k;
}
