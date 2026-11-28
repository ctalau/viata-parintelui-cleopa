// Cadre din motorul Three.js: node tools/engine/stills.mjs <episod> <cadre…> [--out dir] [--w 1280]
// Cadrele sunt numere de cadru (24 fps, cadrul 1 = 0 s); rezultă <dir>/f<NNNN>.png și foaie.jpg.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { serve, ROOT } from './serve.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, w: { type: 'string', default: '1280' } } });
const [episode, ...list] = positionals;
const frames = list.flatMap((a) => a.split(',')).flatMap((item) => {
  const m = /^(\d+)-(\d+)(?::(\d+))?$/.exec(item);
  if (!m) return [Number(item)];
  const out = []; for (let f = +m[1]; f <= +m[2]; f += +(m[3] ?? 4)) out.push(f); return out;
});
const out = values.out ?? path.join(ROOT, 'episodes', episode, 'renders', 'stills');
await mkdir(out, { recursive: true });
const server = await serve();
const browser = await chromium.launch({ ...(existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && console.error(m.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/engine/still.html?ep=${episode}&w=${values.w}`);
  await page.waitForFunction(() => window.gata, null, { timeout: 120000 });
  for (const f of frames) {
    const url = await page.evaluate((t) => window.frameAt(t), (f - 1) / 24);
    await writeFile(path.join(out, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('cadre', frames.length, '→', out);
} finally { await browser.close(); server.close(); }
