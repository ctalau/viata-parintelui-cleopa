// Render a volumetric test, or the whole test episode, from the /volum/ page to MP4.
// npm run render:volum -- [episod|ID-test] [--width 960] [--fps 24]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rename } from 'node:fs/promises';
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
    width: { type: 'string', default: '960' },
    fps: { type: 'string', default: '24' },
    out: { type: 'string', default: fileURLToPath(new URL('../studio/volum/renders/', import.meta.url)) },
  },
});
const id = positionals[0] ?? 'episod';
const width = Number(values.width);
const height = width * 9 / 16;
const fps = Number(values.fps);
if (!/^[a-z0-9-]+$/.test(id) || !Number.isInteger(width) || width % 32 !== 0 || !Number.isInteger(fps) || fps < 1) {
  throw new Error('Utilizare: npm run render:volum -- [episod|ID] [--width 960] [--fps 24]. Lățimea e multiplu de 32.');
}
const output = path.resolve(values.out);
await mkdir(output, { recursive: true });
const started = performance.now();
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
  await page.goto(`http://127.0.0.1:${server.address().port}/volum/?test=${id}&export`);
  await page.waitForFunction(() => window.captureVolum, null, { timeout: 60000 });
  const duration = await page.evaluate(() => window.captureVolum.duration);
  const count = Math.ceil(duration * fps);
  const video = path.join(output, `.${id}.mp4`);
  const encoder = spawn('ffmpeg', [
    '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-threads', '3', '-preset', 'medium', '-crf', '27',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const finished = once(encoder, 'close');
  async function* frames() {
    for (let index = 0; index < count; index++) {
      const png = await page.evaluate(({ at, width, height }) => window.captureVolum.png(at, width, height),
        { at: index / fps, width, height });
      yield Buffer.from(png, 'base64');
    }
  }
  const [, [code]] = await Promise.all([pipeline(Readable.from(frames()), encoder.stdin), finished]);
  if (code !== 0) throw new Error(`FFmpeg s-a oprit cu codul ${code}.`);
  await rename(video, path.join(output, `${id}.mp4`));
  console.log(`MP4 ${width}×${height} · ${count} cadre · ${((performance.now() - started) / 1000).toFixed(1)} s`);
} finally {
  await browser?.close();
  server?.close();
}
