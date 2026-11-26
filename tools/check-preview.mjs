import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { episode } from '../studio/episode.mjs';

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
  const catalogResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/catalog.json');
  await page.goto(address);
  const { chapters: expectedChapters } = await (await catalogResponse).json();
  await page.waitForFunction(
    (duration) => Math.abs(document.querySelector('#episode')?.duration - duration) < 0.05,
    episode.duration,
  );
  await page.waitForFunction(() => document.querySelectorAll('#library-items article').length === 4);
  assert.equal(Number(await page.locator('#seek').getAttribute('max')), episode.duration);
  await page.getByRole('button', { name: 'Înainte 5 secunde', exact: true }).click();
  await page.waitForFunction(() => {
    const video = document.querySelector('#episode');
    return video.paused && !video.seeking && video.readyState >= 2 && !video.hasAttribute('poster') && video.currentTime === 5;
  });
  await page.getByRole('button', { name: 'Redă filmul' }).click();
  await page.waitForFunction(() => document.querySelector('#episode').currentTime > 5.25);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  await page.locator('.chapters summary').click();
  const chapters = page.locator('#chapters button');
  assert.equal(await chapters.count(), episode.chapterNames.length);
  assert.ok((await chapters.last().textContent()).endsWith(episode.chapterNames.at(-1)));
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
  await chapters.last().click();
  await page.waitForFunction(
    (time) => Math.abs(document.querySelector('#episode').currentTime - time) < 0.05,
    expectedChapters.at(-1).time,
  );
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
  await page.getByRole('link', { name: 'Editează straturile cadrului 2' }).click();
  const yard = page.locator('#cadru-2');
  await yard.locator('.yard-stage img').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('.yard-stage img')]
    .every((image) => image.naturalWidth === 1280));
  await yard.locator('[name="landscape-x"]').press('ArrowRight');
  await yard.locator('[name="fence-y"]').press('ArrowDown');
  await yard.locator('[name="fence-visible"]').uncheck();
  await yard.locator('#yard-fence').waitFor({ state: 'hidden' });
  await page.reload();
  await yard.locator('[name="landscape-x"]').waitFor({ state: 'visible' });
  assert.equal(await yard.locator('[name="landscape-x"]').inputValue(), '1');
  assert.equal(await yard.locator('[name="fence-y"]').inputValue(), '-1');
  assert.equal(await yard.locator('[name="fence-visible"]').isChecked(), false);
  await yard.getByRole('button', { name: 'Resetează straturile' }).click();
  await yard.locator('#yard-fence').waitFor({ state: 'visible' });
  assert.equal(await yard.locator('[name="landscape-x"]').inputValue(), '0');
  assert.equal(await yard.locator('[name="fence-y"]').inputValue(), '0');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.getByRole('link', { name: 'Inspector de scenă', exact: true }).click();
  await page.getByRole('heading', { name: 'Inspector de scenă' }).waitFor();
  await page.waitForFunction(() => {
    const video = document.querySelector('#shot');
    return video?.readyState >= 2 && !video.seeking && video.currentTime > 50;
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }
  const frame = page.locator('#frame');
  const mesh = page.locator('#overlay path');
  const shape = await mesh.getAttribute('d');
  const start = Number(await frame.getAttribute('min'));
  await frame.press('Home');
  await page.waitForFunction((value) => Number(document.querySelector('#frame').value) === value, start);
  assert.notEqual(await mesh.getAttribute('d'), shape);
  await page.getByLabel('Mărește zona brațului').check();
  assert.equal(await page.locator('.stage.zoomed').count(), 1);
  await page.getByRole('button', { name: 'Redă scena' }).click();
  await page.waitForFunction((value) => Number(document.querySelector('#frame').value) > value, start + 4);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  await page.getByRole('button', { name: 'Rig', exact: true }).click();
  await page.getByRole('button', { name: 'Mihai', exact: true }).click();
  await page.getByLabel('Os', { exact: true }).selectOption({ label: 'hand.L' });
  assert.match(await page.locator('#bone-parent').textContent(), /forearm\.L/);
  assert.equal(await page.locator('#overlay line').count(), 18);
  await page.getByRole('button', { name: 'Straturi', exact: true }).click();
  await page.getByRole('button', { name: 'Pâine și vase', exact: true }).click();
  await page.waitForFunction(() => {
    const image = document.querySelector('#layer-preview');
    return image?.complete && image.naturalWidth === 768 && !image.hidden;
  });
  await page.getByText(/Obiecte în cadru/).click();
  await page.getByText(/Round scored bread/).waitFor();
  assert.equal(await page.locator('#shot').isVisible(), false);
  await page.getByRole('button', { name: 'Cadrul întreg', exact: true }).click();
  assert.equal(await page.locator('#shot').isVisible(), true);
  const loadedProps = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) loadedProps.push(new URL(request.url()).pathname);
  });
  await page.getByText('Ce rol au .blend, Python, SVG și Three.js', { exact: true }).click();
  await page.getByRole('link', { name: 'Asamblează scene în Three.js' }).click();
  await page.getByRole('heading', { name: 'Asamblare de scene' }).waitFor();
  const assemblyTime = page.getByRole('slider', { name: 'Momentul din clip' });
  await assemblyTime.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  const canvas = page.getByRole('img', { name: 'Scenă 2.5D recompusă din recuzita Cleopa' });
  await canvas.scrollIntoViewIfNeeded();
  const before = await canvas.screenshot();
  await assemblyTime.press('End');
  assert.equal(await assemblyTime.inputValue(), '4');
  assert.ok(!(await canvas.screenshot()).equals(before), 'Talerul și pâinea trebuie să se miște în cadru');
  await page.getByRole('button', { name: 'Redă clipul' }).click();
  await page.waitForFunction(() => Number(document.querySelector('#assembly-time').value) < 3.5);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  await page.getByRole('slider', { name: 'Unghiul camerei' }).press('End');
  assert.equal(await page.locator('#angle-readout').textContent(), '42°');
  await page.getByRole('button', { name: 'De plecare la școală' }).click();
  await page.getByRole('checkbox', { name: 'Cartea lui Mihai' }).waitFor();
  assert.equal(loadedProps.filter((url) => url.endsWith('/paine.glb')).length, 1);
  const withBook = await canvas.screenshot();
  await page.getByRole('checkbox', { name: 'Cartea lui Mihai' }).uncheck();
  assert.ok(!(await canvas.screenshot()).equals(withBook), 'Cartea trebuie să poată fi ascunsă');
  for (const label of ['Cadru PNG', 'Clip MP4', 'Scena JSON']) {
    const link = await page.getByRole('link', { name: label, exact: true }).getAttribute('href');
    const status = await page.evaluate(async (href) => (await fetch(href, { method: 'HEAD' })).status, link);
    assert.equal(status, 200);
  }
  assert.deepEqual(errors, []);
  console.log('PREVIEW_OK', address, writeFeedback ? 'cu feedback salvat' : 'cu răspuns de test pentru formular');
} finally {
  await browser.close();
}
