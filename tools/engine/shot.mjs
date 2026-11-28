// Captură dintr-o pagină a motorului: node tools/engine/shot.mjs <cale.html?...> <ieșire.png>
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const [page_, out] = process.argv.slice(2);
const server = await serve();
const browser = await chromium.launch({ ...(existsSync('/opt/pw-browsers/chromium') && { executablePath: '/opt/pw-browsers/chromium' }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/${page_}`);
  await page.waitForFunction(() => window.gata, null, { timeout: 60000 });
  await writeFile(out, await page.locator('canvas').first().screenshot());
  console.log('scris', out);
} finally { await browser.close(); server.close(); }
