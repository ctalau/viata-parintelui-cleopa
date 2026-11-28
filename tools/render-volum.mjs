// Cadru PNG din atelierul volumetric.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startPreview } from './studio-preview.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string', default: '960' },
    out: { type: 'string', default: fileURLToPath(new URL('../studio/volum/renders/', import.meta.url)) },
  },
});
const id = positionals[0] ?? 'episod';
const width = Number(values.width);
const height = width * 9 / 16;
if (!/^[a-z0-9-]+$/.test(id) || !Number.isInteger(width) || width % 32 !== 0 || width < 32) {
  throw new Error('Utilizare: npm run render:volum -- [episod|ID] [--width 960]. Lățimea e multiplu de 32.');
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
  const png = await page.evaluate(({ time, width, height }) => window.captureVolum.png(time, width, height),
    { time: duration / 2, width, height });
  const file = path.join(output, `${id}.png`);
  await writeFile(file, Buffer.from(png, 'base64'));
  console.log(`PNG ${width}×${height} · ${((performance.now() - started) / 1000).toFixed(1)} s · ${file}`);
} finally {
  await browser?.close();
  server?.close();
}
