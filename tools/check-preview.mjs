import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const address = args.find((arg) => !arg.startsWith('--')) || 'http://127.0.0.1:4173';
const writeFeedback = args.includes('--write-feedback');
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_BIN && { executablePath: process.env.CHROMIUM_BIN }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const feedback = [];
  if (!writeFeedback) {
    await page.route('**/api/feedback', async (route) => {
      feedback.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: 'browser-check' } });
    });
  }
  await page.goto(address);
  await page.waitForFunction(() => document.querySelector('#episode')?.duration > 87);
  await page.waitForFunction(() => document.querySelectorAll('#library-items article').length === 4);
  await page.getByRole('button', { name: 'Redă filmul' }).click();
  await page.waitForFunction(() => document.querySelector('#episode').currentTime > 0.25);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  await page.locator('.chapters summary').click();
  assert.equal(await page.locator('#chapters button').count(), 10);
  await page.getByRole('button', { name: /Tata în prag/ }).click();
  await page.waitForFunction(() => document.querySelector('#episode').currentTime > 65);
  const videoTime = () => page.locator('#episode').evaluate((video) => video.currentTime);
  for (const [label, offset] of [
    ['Înainte 5 secunde', 5], ['Înapoi 0,5 secunde', -0.5],
    ['Înainte 0,5 secunde', 0.5], ['Înapoi 5 secunde', -5],
  ]) {
    const lastTime = await videoTime();
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.ok(Math.abs(await videoTime() - (lastTime + offset)) < 0.055, label);
  }
  const markedTime = await videoTime();
  await page.getByRole('button', { name: 'Marchează o observație' }).click();
  assert.equal(await page.locator('#note').evaluate((note) => document.activeElement === note), true);
  assert.equal(await page.locator('#episode').evaluate((video) => video.paused), true);
  await page.getByRole('button', { name: 'Înainte 5 secunde', exact: true }).click();
  await page.locator('#note').fill('Test automat atelier: redare, derulare și feedback.');
  const [post] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/feedback')),
    page.getByRole('button', { name: 'Trimite observația' }).click(),
  ]);
  assert.equal(post.status(), 201, await post.text());
  await page.getByText('Mulțumim! Observația a fost salvată.').waitFor();
  if (!writeFeedback) {
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0].episode, 'painea-care-poate-sa-astepte');
    assert.ok(Math.abs(feedback[0].time - markedTime) < 0.055);
  }
  assert.equal(await page.locator('#episode').evaluate((video) => video.textTracks.length), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.getByRole('link', { name: /demonstrația cu monahi/ }).click();
  await page.waitForFunction(() => Number(document.querySelector('#seek')?.max) > 1);
  await page.locator('#play').click();
  await page.waitForFunction(() => Number(document.querySelector('#seek').value) > 0.25);
  assert.deepEqual(errors, []);
  console.log('PREVIEW_OK', address, writeFeedback ? 'cu feedback salvat' : 'cu răspuns de test pentru formular');
} finally {
  await browser.close();
}
