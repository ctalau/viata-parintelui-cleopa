import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startPreview } from './studio-preview.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string', default: '1280' },
    out: { type: 'string', default: fileURLToPath(new URL('../studio/asamblare/renders/', import.meta.url)) },
    still: { type: 'boolean' },
  },
});
const [id] = positionals;
const width = Number(values.width);
const height = width * 9 / 16;
if (positionals.length !== 1 || !/^[a-z0-9-]+$/.test(id) ||
    !Number.isInteger(width) || width < 32 || width % 32 !== 0) {
  throw new Error('Utilizare: npm run render:scene -- NUME [--width 1280] [--out CALE] [--still]. Lățimea trebuie să fie multiplu de 32.');
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

} finally {
  await browser?.close();
  server?.close();
  await rm(temp, { recursive: true, force: true });
}
