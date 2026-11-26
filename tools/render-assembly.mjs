import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startPreview } from './studio-preview.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string', default: '1280' },
    fps: { type: 'string', default: '24' },
    out: { type: 'string', default: fileURLToPath(new URL('../studio/asamblare/renders/', import.meta.url)) },
    still: { type: 'boolean' },
  },
});
const [id] = positionals;
const width = Number(values.width);
const height = width * 9 / 16;
const fps = Number(values.fps);
if (positionals.length !== 1 || !/^[a-z0-9-]+$/.test(id) ||
    !Number.isInteger(width) || width < 32 || width % 32 !== 0 ||
    !Number.isInteger(fps) || fps < 1) {
  throw new Error('Utilizare: npm run render:scene -- NUME [--width 1280] [--fps 24] [--out CALE] [--still]. Lățimea trebuie să fie multiplu de 32.');
}

const started = performance.now();
const elapsed = () => ((performance.now() - started) / 1000).toFixed(2);
const output = path.resolve(values.out);
await mkdir(output, { recursive: true });
const temp = await mkdtemp(path.join(output, '.render-'));
let browser;
let server;
try {
  server = await startPreview(0);
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_BIN && { executablePath: process.env.CHROMIUM_BIN }),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/asamblare/?clip=${id}&export`);
  await page.waitForFunction(() => window.captureClip, { }, { timeout: 15000 });
  const clip = await page.evaluate(() => ({ id: window.captureClip.id, duration: window.captureClip.duration }));
  if (clip.id !== id) throw new Error(`Clip necunoscut: ${id}`);

  async function capture(time) {
    const png = await page.evaluate(({ time, width, height }) => {
      return window.captureClip.png(time, width, height);
    }, { time, width, height });
    return Buffer.from(png, 'base64');
  }

  const frame = path.join(temp, `${id}.png`);
  await writeFile(frame, await capture(clip.duration / 2));
  await rename(frame, path.join(output, `${id}.png`));
  console.log(`PNG ${width}×${height} · ${elapsed()} s cu inițializare`);

  if (!values.still) {
    const count = Math.ceil(clip.duration * fps);
    const video = path.join(temp, `${id}.mp4`);
    const encoder = spawn('ffmpeg', [
      '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0',
      '-an', '-c:v', 'libx264', '-threads', '3', '-preset', 'fast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
    ], { stdio: ['pipe', 'ignore', 'inherit'] });
    const finished = once(encoder, 'close');
    async function* frames() {
      for (let index = 0; index < count; index++) yield await capture(index / fps);
    }
    const [, [code]] = await Promise.all([pipeline(Readable.from(frames()), encoder.stdin), finished]);
    if (code !== 0) throw new Error(`FFmpeg s-a oprit cu codul ${code}.`);
    await rename(video, path.join(output, `${id}.mp4`));
    console.log(`MP4 ${width}×${height} · ${count} cadre · ${fps} fps · ${elapsed()} s total cu codificare`);
  }
} finally {
  await browser?.close();
  server?.close();
  await rm(temp, { recursive: true, force: true });
}
