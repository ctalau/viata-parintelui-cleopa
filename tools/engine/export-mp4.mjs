// Filmul MP4 randat de același motor Three.js ca playerul (lib/engine/stage.js), în Chromium.
//   node tools/engine/export-mp4.mjs <episod> [--from 1] [--to N] [--w 1280] [--out film.mp4] [--frames-only]
// Cadența desenelor vine din descriptor, ca în player. Fiecare cadru se scrie ca
// JPEG, apoi FFmpeg codează copia compactă (768 × 432, sub 5 MB, două treceri) cu pista audio.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { ROOT, serve } from './serve.mjs';
import { drawingFrame } from '../../lib/engine/tracks.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  from: { type: 'string', default: '1' }, to: { type: 'string' }, w: { type: 'string', default: '1280' },
  out: { type: 'string' }, 'frames-only': { type: 'boolean' }, work: { type: 'string' }, jobs: { type: 'string', default: '1' },
} });
const [id] = positionals;
const dir = path.join(ROOT, 'episodes', id);
const episode = JSON.parse(await readFile(path.join(dir, 'episode.json'), 'utf8'));
const first = Number(values.from), last = Number(values.to ?? episode.frames);
const work = values.work ?? path.join(dir, 'renders', 'frames');
await mkdir(work, { recursive: true });
const started = performance.now();
const jobs = Number(values.jobs);
if (jobs > 1) {
  // Mai multe procese Chromium pe intervale de cadre; fiecare cadru se calculează independent.
  const size = Math.ceil((last - first + 1) / jobs);
  await Promise.all(Array.from({ length: jobs }, (_, i) => new Promise((resolve, reject) => {
    const from = first + i * size, to = Math.min(last, from + size - 1);
    const child = spawn(process.execPath, [process.argv[1], id, '--from', String(from), '--to', String(to), '--w', values.w,
      '--work', work, '--frames-only'], { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('close', (code) => (code ? reject(new Error(`job ${i}: ${code}`)) : resolve()));
  })));
  console.log(`CADRE ${last - first + 1} cu ${jobs} procese în ${((performance.now() - started) / 1000).toFixed(1)} s`);
}
const server = jobs > 1 ? null : await serve();
let drawings = 0;
if (jobs === 1) {
const browser = await chromium.launch({ ...(existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/engine/still.html?ep=${id}&w=${values.w}`);
  await page.waitForFunction(() => window.gata, null, { timeout: 180000 });
  let previous = null;
  for (let f = first; f <= last; f++) {
    const file = path.join(work, `frame_${String(f).padStart(4, '0')}.jpg`);
    const drawing = drawingFrame(episode, f);
    await rm(file, { force: true });
    if (drawing === previous?.drawing) { await link(previous.file, file); continue; }
    const url = await page.evaluate((t) => window.frameAt(t, 'image/jpeg'), (drawing - 1) / episode.fps);
    await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
    previous = { drawing, file };
    drawings++;
    if (drawings % 100 === 0) console.log(`desen ${drawings} · cadrul ${f}/${last} · ${((performance.now() - started) / 1000).toFixed(0)} s`);
  }
} finally { await browser.close(); server.close(); }
console.log(`DESENE ${drawings} (${last - first + 1} cadre) în ${((performance.now() - started) / 1000).toFixed(1)} s`);
}
if (values['frames-only']) process.exit(0);

const out = values.out ?? path.join(dir, 'renders', `${id}.mp4`);
const duration = (last - first + 1) / episode.fps;
// Sub 5 MB cu tot cu sunetul; un film scurt nu are nevoie de mai mult de 1,5 Mbit/s.
const bitrate = Math.min(1500, Math.floor(4_700_000 * 8 / duration / 1000 - 64));
const input = ['-framerate', String(episode.fps), '-start_number', String(first), '-i', path.join(work, 'frame_%04d.jpg')];
const options = ['-vf', 'scale=768:432:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${bitrate}k`, '-pix_fmt', 'yuv420p',
  '-passlogfile', path.join(work, 'x264')];
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg'); };
ffmpeg([...input, ...options, '-pass', '1', '-an', '-f', 'null', '-']);
const audio = path.join(dir, episode.audio.mix);
ffmpeg([...input, '-ss', String((first - 1) / episode.fps), '-i', audio, '-map', '0:v', '-map', '1:a:0', ...options, '-pass', '2',
  '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out]);
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height,r_frame_rate,channels', '-of', 'json', out]);
console.log('MP4_OK', out, probe.stdout.toString().replace(/\s+/g, ' '));
