// Verificarea rapidă a playerului Three.js de pe pagina principală.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [address = 'http://127.0.0.1:4173', episode] = process.argv.slice(2);
const url = new URL('/', address);
if (episode) url.searchParams.set('ep', episode);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_BIN && { executablePath: process.env.CHROMIUM_BIN }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const paths = [];
  const errors = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url.href);
  await page.waitForFunction(() => document.querySelector('#episode-picture').dataset.frame === '1' &&
    !document.querySelector('#seek').disabled, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Înainte 5 secunde', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#episode-picture').dataset.frame === '121');
  await page.getByRole('button', { name: 'Redă filmul' }).click();
  await page.waitForFunction(() => Number(document.querySelector('#episode-picture').dataset.frame) > 127);
  assert.ok(paths.some((file) => file.endsWith('.glb')));
  assert.ok(paths.every((file) => !file.endsWith('.mp4') && !file.startsWith('/assets/film/')));
  assert.deepEqual(errors, []);
  console.log('PLAYER_OK', url.href);
} finally {
  await browser.close();
}
