#!/usr/bin/env node
// Generated-video shorts (Gemini Omni via OpenRouter /api/v1/videos).
//   node tools/omni.mjs shorts/<id>            generate the missing clips, then concat → shorts/<id>/<id>.mp4
//   node tools/omni.mjs shorts/<id> --force a,b re-generate those clips
//   node tools/omni.mjs shorts/<id> --only a,b  generate only those clips (no concat)
//   node tools/omni.mjs shorts/<id> --concat    only re-join the clips
// shorts/<id>/short.json: { model, size, seed?, clips: [{ id, prompt, duration, model?, size?, first?, last?, firstFrom?, trim? }] }
//   first / last = image path (relative to the short dir) used as first / last frame;
//   firstFrom = id of an earlier clip whose LAST frame becomes this clip's first frame (generated after it).
//   trim = [startSec, endSec] cut applied when joining.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/omni.mjs shorts/<id> [--force a,b] [--concat]'); process.exit(1); }
const args = process.argv.slice(3);
const force = new Set((args[args.indexOf('--force') + 1] || '').split(',').filter(Boolean));
const onlyConcat = args.includes('--concat');
const only = new Set((args.includes('--only') ? args[args.indexOf('--only') + 1] : '').split(',').filter(Boolean));
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'short.json'), 'utf8'));
const clipsDir = path.join(dir, 'clips');
fs.mkdirSync(clipsDir, { recursive: true });

let key = process.env.OPENROUTER_API_KEY;
if (!key && fs.existsSync('.env')) key = (fs.readFileSync('.env', 'utf8').match(/^OPENROUTER_API_KEY=(.*)$/m) || [])[1]?.trim();
const API = 'https://openrouter.ai/api/v1/videos';
const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataUrl = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};
const frame = (file, type) => ({ type: 'image_url', image_url: { url: dataUrl(file) }, frame_type: type });
const out = (id) => path.join(clipsDir, `${id}.mp4`);

function lastFrame(id) {
  const png = path.join(clipsDir, `${id}.last.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', out(id), '-frames:v', '1', '-update', '1', png]);
  return png;
}

async function generate(c) {
  const body = { model: c.model || spec.model, prompt: c.prompt, duration: c.duration, size: c.size || spec.size, generate_audio: true };
  if (spec.seed != null) body.seed = spec.seed;
  const first = c.firstFrom ? lastFrame(c.firstFrom) : c.first && path.join(dir, c.first);
  const frames = [];
  if (first) frames.push(frame(first, 'first_frame'));
  if (c.last) frames.push(frame(path.join(dir, c.last), 'last_frame'));
  if (frames.length) body.frame_images = frames;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const job = await r.json();
    if (!r.ok) { console.error(`✗ ${c.id}: ${r.status} ${JSON.stringify(job).slice(0, 400)}`); if (r.status < 500) throw new Error('bad request'); await sleep(5000); continue; }
    console.log(`… ${c.id}: job ${job.id}`);
    let st = job;
    while (!['completed', 'failed', 'cancelled', 'expired'].includes(st.status)) {
      await sleep(15000);
      const p = await fetch(`${API}/${job.id}`, { headers: H });
      if (p.ok) st = await p.json();
    }
    if (st.status !== 'completed') { console.error(`✗ ${c.id}: ${st.status} ${JSON.stringify(st.error || '').slice(0, 300)}`); continue; }
    const v = await fetch(`${API}/${job.id}/content?index=0`, { headers: { Authorization: H.Authorization } });
    fs.writeFileSync(out(c.id), Buffer.from(await v.arrayBuffer()));
    fs.writeFileSync(path.join(clipsDir, `${c.id}.json`), JSON.stringify({ job: job.id, model: body.model, size: body.size, duration: c.duration, cost: st.usage?.cost, prompt: c.prompt, first: c.firstFrom ? `last frame of ${c.firstFrom}` : c.first, last: c.last }, null, 2) + '\n');
    console.log(`✓ ${c.id}: ${out(c.id)} (${st.usage?.cost ?? '?'}$)`);
    return;
  }
  throw new Error(`${c.id} failed`);
}

if (!onlyConcat) {
  const todo = spec.clips.filter((c) => (!only.size || only.has(c.id)) && (force.has(c.id) || !fs.existsSync(out(c.id))));
  const done = {};
  const run = (c) => (done[c.id] ??= (async () => {
    if (c.firstFrom) { const dep = spec.clips.find((d) => d.id === c.firstFrom); if (todo.includes(dep)) await run(dep); }
    await generate(c);
  })());
  const res = await Promise.allSettled(todo.map(run));
  const bad = res.filter((r) => r.status === 'rejected');
  if (bad.length) { console.error(`${bad.length} clip(s) failed`); process.exit(1); }
  if (only.size) process.exit(0);
}

// Join: normalise every clip to the short's size / 24 fps / stereo 48k, then concat.
const [W, Hh] = (spec.size || '360x640').split('x').map(Number);
const inputs = [], filters = [];
spec.clips.forEach((c, i) => {
  if (c.trim) inputs.push('-ss', String(c.trim[0]), '-to', String(c.trim[1]));
  inputs.push('-i', out(c.id));
  filters.push(`[${i}:v]scale=${W}:${Hh}:force_original_aspect_ratio=decrease,pad=${W}:${Hh}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
});
const n = spec.clips.length;
const fc = filters.join(';') + ';' + spec.clips.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${n}:v=1:a=1[v][a]`;
fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
const final = path.join(dir, 'build', 'omni-joined.mp4'); // preview of the raw clips; the short itself is made by the short's own build script
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final]);
const total = spec.clips.reduce((s, c) => s + (JSON.parse(fs.existsSync(path.join(clipsDir, `${c.id}.json`)) ? fs.readFileSync(path.join(clipsDir, `${c.id}.json`), 'utf8') : '{}').cost || 0), 0);
console.log(`→ ${final}  (clips cost ${total.toFixed(3)}$)`);
