// The review tools (still / review / beats / check / poster — and so `produce`) on a RunPod GPU instead of the CPU
// renderer of this container (SwiftShader: 3–6 s per frame, a review sheet took > 5 min; on a GPU ~20 ms per frame).
// Default when RUNPOD_KEY is set; `--local` (or LEGO_LOCAL=1) keeps everything here.
//
// One pod is kept between calls (state in .runpod/pod.json), so the staging loop pays the pod start (~30–60 s) once;
// it terminates ITSELF after IDLE_MIN minutes without use (tools/runpod/agent.mjs). `npm run runpod -- down` stops it now.
// Each call: upload the film (and the code, only when it changed), run the tool there with --gpu, download the film's
// stills/ (and poster.jpg), print the tool's own output. Cost goes to costs/runpod.jsonl like every pod.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, resolveVideoDir, parseArgs } from './common.mjs';

const args = parseArgs();
import { hasKey, loadState, saveState, up, down, push, pullTree, exec, agent, waitSetup, fmt, now, IDLE_MIN } from './pod.mjs';

export const useRemote = (a) => !a.local && !a.gpu && !process.env.LEGO_LOCAL && !process.env.LEGO_ON_POD && hasKey();

async function lock() {
  const f = path.join(ROOT, '.runpod', 'lock');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); return () => fs.rmSync(f, { force: true }); } catch {}
    const pid = +fs.readFileSync(f, 'utf8');
    try { process.kill(pid, 0); } catch { fs.rmSync(f, { force: true }); continue; } // stale lock
    if (i === 0) console.log('waiting for another RunPod call to finish…');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** a running pod (the kept one if it still answers, else a new one) */
async function pod() {
  let st = loadState();
  if (st) {
    let h = null;
    try { h = await agent(st, '/health', { timeout: 15000 }); } catch {}
    if (h?.ok) return st;
    console.log(`RunPod: pod ${st.id} is gone (stopped itself when idle) — starting a new one`);
    await down({ gone: true }).catch((e) => console.log('  cleanup: ' + e.message));
  }
  const t0 = now();
  st = await up(new Set(), { minVcpu: 8 }); // the checks are CPU work: 8 vCPU when there are (else 4)
  st.what = 'review tools'; st.idleMin = parseFloat(args['idle-min'] || IDLE_MIN); saveState(st);
  await waitSetup(st);
  console.log(`RunPod: pod ready in ${fmt(now() - t0)}`);
  return st;
}

/**
 * Run `node tools/<tool> <argv>` on the pod with --gpu and bring back the film's stills/ (+ poster.jpg).
 * stdinText: what the tool would read on stdin (review feedback). Returns the remote exit code.
 */
export async function runRemote(tool, argv, { stdinText = '', poster = false } = {}) {
  const unlock = await lock();
  const T0 = now();
  try {
    // the film folder: the first argument that resolves to one; files given as arguments are sent as stdin (review)
    let dir = null; const rest = [];
    for (const a of argv) {
      if (a === '--runpod') continue;
      if (!a.startsWith('--') && fs.existsSync(a) && fs.statSync(a).isFile() && !a.endsWith('video.json')) { stdinText += '\n' + fs.readFileSync(a, 'utf8'); continue; }
      if (!dir && !a.startsWith('--') && !/^[\d.,]+$/.test(a)) { try { dir = resolveVideoDir(a); rest.push(path.relative(ROOT, dir)); continue; } catch {} }
      rest.push(a);
    }
    if (!dir) { // review can find the film in the pasted text
      const m = /videos\/(\d{3}-[\w-]+)|film\s+(\d{3}-[\w-]+)|\/(\d{3}-[\w-]+)\/?\s/i.exec(stdinText || '');
      if (m) dir = resolveVideoDir(m[1] || m[2] || m[3]);
    }
    if (!dir) throw new Error('runRemote: no film folder in the arguments');
    const rel = path.relative(ROOT, dir);
    const st = await pod();
    await push(st, [dir], { smart: true });
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const input = stdinText.trim() ? `echo ${Buffer.from(stdinText).toString('base64')} | base64 -d | ` : '';
    const cmd = `cd /work/repo && export LEGO_ON_POD=1 && ${input}node tools/${tool} ${rest.map(q).join(' ')} --gpu`;
    let code = 0;
    const t0 = now();
    const h0 = await agent(st, '/health', { timeout: 15000 }).catch(() => ({}));
    const since = h0.now ? h0.now / 1000 - 2 : null; // the pod's own clock
    try { await exec(st, cmd); } catch (e) { code = 1; console.log(`(on the pod: ${e.message})`); }
    const t1 = now();
    const keep = [`${rel}/stills`, ...(poster ? [`${rel}/poster.jpg`] : [])];
    // only what this run wrote (an older agent ignores `since` and sends everything — same result, a bit slower)
    const n = await pullTree(st, keep, { since });
    st.lastUsed = now(); saveState(st);
    console.log(`RunPod: ${tool} ran ${fmt(t1 - t0)} on ${st.gpu.replace('NVIDIA ', '')}, ${fmt(now() - T0)} in all (${(n / 1e6).toFixed(1)} MB back). ` +
      `Pod kept for the next call; it stops itself after ${st.idleMin || IDLE_MIN} min idle (\`npm run runpod -- down\` = now).`);
    return code;
  } finally { unlock(); }
}

/**
 * `record.mjs --check` of several films on the pod in ONE call (tools/publish.mjs): the films go up once, the checks run in
 * parallel (the pod's cores shared between them), the outputs come back as text. Returns { [film id]: { code, out } }.
 */
export async function checksRemote(dirs) {
  const unlock = await lock();
  const T0 = now();
  try {
    const st = await pod();
    await push(st, dirs, { smart: true });
    const rels = dirs.map((d) => path.relative(ROOT, d)), ids = dirs.map((d) => path.basename(d));
    const W = `$(node --input-type=module -e "import { cpuCount } from './tools/lib/common.mjs'; console.log(Math.max(2, Math.floor((cpuCount() - 1) / ${dirs.length})))")`;
    const cmd = [`cd /work/repo && export LEGO_ON_POD=1 && rm -rf /work/.chk && mkdir -p /work/.chk && W=${W} && echo "checks: ${dirs.length} film(s) in parallel, $W workers each"`,
      ...rels.map((r, i) => `(node tools/record.mjs --check '${r}' --gpu --check-workers $W > /work/.chk/${ids[i]}.log 2>&1; echo $? > /work/.chk/${ids[i]}.code) &`),
      'wait'].join('\n');
    const t0 = now();
    await exec(st, cmd);
    const t1 = now();
    const res = {};
    for (const id of ids) {
      const get = async (f) => { const r = await agent(st, `/file?path=/work/.chk/${f}`, { raw: true, timeout: 60000 }); return r.ok ? r.text() : ''; };
      res[id] = { out: await get(`${id}.log`), code: parseInt(await get(`${id}.code`)) };
      if (Number.isNaN(res[id].code)) res[id].code = 1;
    }
    st.lastUsed = now(); saveState(st);
    console.log(`RunPod: checks of ${ids.length} film(s) ran ${fmt(t1 - t0)} on ${st.gpu.replace('NVIDIA ', '')}, ${fmt(now() - T0)} in all.`);
    return res;
  } finally { unlock(); }
}
