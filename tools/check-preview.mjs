import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { DEFAULT_EPISODE_ID, episode } from '../studio/episode.mjs';

const args = process.argv.slice(2);
const address = args.find((arg) => !arg.startsWith('--')) || 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_BIN && { executablePath: process.env.CHROMIUM_BIN }),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  const errors = [];
  const mp4Requests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.mp4')) mp4Requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(address);
  await page.waitForFunction(() => document.querySelectorAll('#library-items article').length === 4);
  assert.equal(await page.locator('#episode-select').inputValue(), DEFAULT_EPISODE_ID);
  await page.getByRole('heading', { name: episode.title, exact: true }).waitFor();
  assert.equal(await page.locator('canvas#episode-picture').count(), 1);
  const workshopLinks = await page.locator('#ateliere a.workshop').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const href of ['/palme/', '/volum/', '/volum/?test=episod', '/comparatie-maini/', '/articulatii/?set=gesturi',
    '/articulatii/', '/asamblare/', '/inspectie/', '/#cadru-2']) {
    assert.ok(workshopLinks.includes(href), `Lipsește atelierul ${href} de pe prima pagină`);
  }
  const timeline = await (await page.request.get(new URL(`/episodes/${DEFAULT_EPISODE_ID}/timeline.json`, address).href)).json();
  const lastChapterTime = (timeline.beats.at(-1).start - 1) / timeline.fps;
  for (const pathname of [`/episodes/${DEFAULT_EPISODE_ID}/film.mp4`, '/media/painea_care_poate_sa_astepte.mp4', '/assets/film/index.json']) {
    assert.equal((await page.request.get(new URL(pathname, address).href)).status(), 404);
  }
  await page.waitForFunction(
    (duration) => Math.abs(document.querySelector('#episode')?.duration - duration) < 0.05,
    episode.duration,
  );
  await page.waitForFunction(() => document.querySelector('#episode-picture').dataset.frame === '1' &&
    !document.querySelector('#seek').disabled);
  assert.equal(await page.locator('#episode').evaluate((media) => media.tagName), 'AUDIO');
  assert.equal(Number(await page.locator('#seek').getAttribute('max')), episode.duration);
  await page.getByRole('button', { name: 'Înainte 5 secunde', exact: true }).click();
  await page.waitForFunction(() => {
    const video = document.querySelector('#episode');
    return video.paused && !video.seeking && video.currentTime === 5 &&
      document.querySelector('#episode-picture').dataset.frame === '121';
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
    lastChapterTime,
  );
  const markedTime = await videoTime();
  await page.getByRole('button', { name: 'Marchează o observație' }).click();
  assert.equal(await page.locator('#note').evaluate((note) => document.activeElement === note), true);
  assert.equal(await page.locator('#episode').evaluate((video) => video.paused), true);
  await page.locator('#note').fill('Test automat atelier: redare, derulare și note.');
  await page.getByRole('button', { name: 'Salvează', exact: true }).click();
  await page.locator('#notes li').waitFor();
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem(`cleopa-observatii-v1:${id}`)), episode.id);
  assert.equal(stored.length, 1);
  assert.ok(Math.abs(stored[0].time - markedTime) < 0.055);
  await page.reload();
  await page.locator('#notes li').waitFor();
  await page.getByRole('button', { name: 'Înainte 5 secunde', exact: true }).click();
  await page.locator('.note-seek').click();
  await page.waitForFunction((time) => Math.abs(document.querySelector('#episode').currentTime - time) < 0.05, markedTime);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-notes').click()]);
  assert.match(download.suggestedFilename(), /^observatii-.*\.md$/);
  await page.getByRole('button', { name: /^Șterge observația/ }).click();
  assert.equal(await page.locator('#notes li').count(), 0);
  assert.equal(await page.locator('#download-notes').isDisabled(), true);
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
  const demo = '002-semnul-crucii';
  await page.locator('#episode-select').selectOption(demo);
  await page.waitForURL(new URL(`/?ep=${demo}`, address).href);
  await page.getByRole('heading', { name: 'Semnul crucii', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('#episode-picture').dataset.frame === '1' &&
    !document.querySelector('#seek').disabled);
  assert.equal(await page.locator('#chapters button').count(), 4);
  assert.equal(await page.locator('#cadru-2').isVisible(), false);
  assert.equal(await page.locator('#notes li').count(), 0);
  await page.getByRole('button', { name: 'Redă filmul' }).click();
  await page.waitForFunction(() => Number(document.querySelector('#episode-picture').dataset.frame) > 5);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  await page.goto(new URL(`/motor/?ep=${demo}`, address).href);
  assert.equal(page.url(), new URL(`/?ep=${demo}`, address).href);
  await page.goto(new URL(`/episoade/${episode.id}/#cadru-2`, address).href);
  assert.equal(page.url(), new URL('/#cadru-2', address).href);
  await yard.locator('#yard-landscape').waitFor({ state: 'visible' });
  await page.goto(new URL('/inspectie/', address).href);
  await page.getByRole('heading', { name: 'Inspector de scenă' }).waitFor();
  await page.waitForFunction(() => {
    return Number(document.querySelector('#shot').dataset.frame) > 1353;
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
  assert.equal(await page.locator('#overlay line').count(), 20);
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
  const canvas = page.getByRole('img', { name: 'Scenă 2.5D recompusă cu personajele și recuzita Cleopa' });
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Number(document.querySelector('#assembly-time').value) > 0.3);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
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
  for (const asset of ['paine', 'costica']) {
    assert.equal(loadedProps.filter((url) => url.endsWith(`/${asset}.glb`)).length, 1);
  }
  await page.getByRole('checkbox', { name: 'Tata', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  const withBook = await canvas.screenshot();
  await page.getByRole('checkbox', { name: 'Cartea lui Mihai' }).uncheck();
  assert.ok(!(await canvas.screenshot()).equals(withBook), 'Cartea trebuie să poată fi ascunsă');
  for (const checkbox of await page.locator('#instance-list input').all()) {
    if ((await checkbox.locator('..').textContent()).trim() !== 'Mihai') await checkbox.uncheck();
  }
  await assemblyTime.press('Home');
  const rest = await canvas.screenshot();
  await assemblyTime.evaluate((slider) => {
    slider.value = '2.5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.ok(!(await canvas.screenshot()).equals(rest), 'Rigul lui Mihai trebuie să se miște și în izolare');
  await assemblyTime.press('Home');
  assert.ok((await canvas.screenshot()).equals(rest), 'Un salt înapoi trebuie să refacă poza inițială');
  for (const label of ['Cadru PNG', 'Scena JSON']) {
    const link = await page.getByRole('link', { name: label, exact: true }).getAttribute('href');
    const status = await page.evaluate(async (href) => (await fetch(href, { method: 'HEAD' })).status, link);
    assert.equal(status, 200);
  }
  await page.getByRole('link', { name: 'Testează articulațiile Mamei' }).click();
  await page.getByRole('heading', { name: 'Articulațiile Mamei' }).waitFor();
  const tests = page.getByLabel('Test de articulație');
  const stressCanvas = page.getByRole('img', { name: 'Mama, cu rig animat în Three.js' });
  for (const id of ['mama-palma', 'mama-cot', 'mama-umar']) {
    await tests.selectOption(id);
    await assemblyTime.waitFor();
    // The chosen test starts by itself.
    await page.waitForFunction((clip) => document.querySelector('#clip-source').href.endsWith(`/${clip}.json`) &&
      document.querySelector('#assembly-play').textContent === 'Pauză' &&
      Number(document.querySelector('#assembly-time').value) > 0.2, id);
    assert.equal(await tests.inputValue(), id);
    const sheet = await page.getByRole('link', { name: 'Foaie de cadre' }).getAttribute('href');
    assert.equal(sheet, `/articulatii/foi/${id.slice(5)}.webp`);
    assert.equal(await page.evaluate(async (href) => (await fetch(href, { method: 'HEAD' })).status, sheet), 200);
    const initial = await stressCanvas.screenshot();
    await assemblyTime.evaluate((slider) => {
      slider.value = '2';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.ok(!(await stressCanvas.screenshot()).equals(initial), id);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.getByRole('link', { name: 'Șapte gesturi' }).click();
  await page.getByRole('heading', { name: 'Gesturile Mamei' }).waitFor();
  const gestures = page.getByRole('combobox', { name: 'Gest', exact: true });
  const actions = ['cruce', 'cana', 'ras', 'cearta', 'paine', 'batic', 'traista'];
  assert.equal(await gestures.locator('option').count(), actions.length);
  for (const id of actions) {
    await gestures.selectOption(`mama-${id}`);
    await assemblyTime.waitFor();
    const sheet = await page.getByRole('link', { name: 'Foaie de cadre' }).getAttribute('href');
    assert.equal(await page.evaluate(async (href) => (await fetch(href, { method: 'HEAD' })).status, sheet), 200);
    assert.match(await page.getByRole('link', { name: 'Rigul în Blender' }).getAttribute('href'),
      new RegExp(`mama-gest-${id}\\.blend$`));
    const initial = await stressCanvas.screenshot();
    await assemblyTime.evaluate((slider) => {
      slider.value = '2.2';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.ok(!(await stressCanvas.screenshot()).equals(initial), id);
  }
  await page.getByRole('link', { name: 'Compară 3D și 2D' }).click();
  await page.getByRole('heading', { name: 'Două variante pentru mâini' }).waitFor();
  const compareFrame = page.getByRole('slider', { name: 'Cadru comun' });
  const panels = page.locator('.comparison-panel canvas');
  await compareFrame.waitFor();
  assert.equal(await gestures.locator('option').count(), actions.length);
  for (const id of actions) {
    await gestures.selectOption(`mama-${id}`);
    await compareFrame.waitFor();
    // The gesture starts by itself; both panels always show the same frame.
    await page.waitForFunction((clip) => new URL(location.href).searchParams.get('clip') === clip &&
      document.querySelector('#compare-play').textContent === 'Pauză' &&
      Number(document.querySelector('#frame').value) > 3, `mama-${id}`);
    const shown = await panels.evaluateAll((items) => items.map((c) => c.dataset.frame));
    assert.equal(shown[0], shown[1]);
    const projections = await page.evaluate(async () => Promise.all(['3d','2d'].map(async (mode) => {
      const url = document.querySelector(`#projection-${mode}`).href;
      const sheet = document.querySelector(`#sheet-${mode}`).href;
      const [data, preview] = await Promise.all([fetch(url), fetch(sheet, { method: 'HEAD' })]);
      return { data: await data.json(), preview: preview.status };
    })));
    for (const { data, preview } of projections) {
      assert.equal(preview, 200);
      assert.equal(data.frames.length, 73);
      assert.equal(data.frames.at(-1).frame, 145);
      const { width, aspect } = data.viewport;
      const length = (a, b) => Math.hypot((a[0]-b[0])*width, (a[1]-b[1])*width/aspect, a[2]-b[2]);
      for (const side of ['R','L']) {
        // Reference: the 3D arm's true segment lengths at rest.
        const s = projections[0].data.frames[0].arms[side];
        for (const { arms } of data.frames) {
          const p = arms[side];
          // 3D segments keep their length; the 2D drawing may shorten towards the lens, never grow.
          for (const [label, a, b] of [['braț', 'umar', 'cot'], ['antebraț', 'cot', 'incheietura']]) {
            const change = length(p[a], p[b]) - length(s[a], s[b]);
            assert.ok(data.mode === '3d' ? Math.abs(change) < .001 : change < .001, `${id} ${data.mode} ${side} ${label}`);
          }
        }
      }
    }
    assert.ok(projections[0].data.frames.some(({ arms }) => Object.values(arms)
      .some(({ umar, incheietura }) => Math.abs(umar[2] - incheietura[2]) > .2)), id);
    await compareFrame.press('End');
    assert.deepEqual(await panels.evaluateAll((items) => items.map((c) => c.dataset.frame)), ['145', '145']);
  }
  await page.getByRole('button', { name: 'Cadrul anterior' }).click();
  assert.deepEqual(await panels.evaluateAll((items) => items.map((c) => c.dataset.frame)), ['144', '144']);
  const front = await panels.first().screenshot();
  await page.getByRole('slider', { name: 'Unghiul camerei' }).press('End');
  assert.ok(!(await panels.first().screenshot()).equals(front), 'Unghiul camerei trebuie să schimbe proiecția');
  // Playback from the next-to-last frame loops back to the start.
  await page.getByRole('button', { name: 'Redă', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('#frame').value) < 30);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  const beforeCompare = await Promise.all([panels.first().screenshot(), panels.last().screenshot()]);
  await compareFrame.evaluate((slider) => {
    slider.value = '72';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const [index, initial] of beforeCompare.entries()) {
    assert.ok(!(await panels.nth(index).screenshot()).equals(initial), 'Derularea trebuie să redeseneze ambele variante');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.goto(new URL('/volum/', address).href);
  await page.getByRole('heading', { name: 'Corp volumetric' }).waitFor();
  const volumCanvas = page.locator('#volum-canvas');
  await page.waitForFunction(() => document.querySelector('#volum-canvas').dataset.test === 'mers-spre-camera' &&
    Number(document.querySelector('#volum-canvas').dataset.time) > 0.3, null, { timeout: 60000 });
  assert.equal(await page.locator('#test-picker button').count(), 9);
  await page.getByRole('button', { name: 'Brațele deasupra capului' }).click();
  await page.waitForFunction(() => document.querySelector('#volum-canvas').dataset.test === 'brate-sus' &&
    Number(document.querySelector('#volum-canvas').dataset.time) > 4);
  // The five-second test starts over by itself.
  await page.waitForFunction(() => Number(document.querySelector('#volum-canvas').dataset.time) < 1, null, { timeout: 20000 });
  assert.ok(await page.locator('#test-report li').count() > 0);
  const sheet = await page.getByRole('link', { name: 'Foaie de cadre' }).getAttribute('href');
  assert.equal(await page.evaluate(async (href) => (await fetch(href, { method: 'HEAD' })).status, sheet), 200);
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  const paused = await volumCanvas.getAttribute('data-time');
  await page.waitForTimeout(300);
  assert.equal(await volumCanvas.getAttribute('data-time'), paused);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.goto(new URL('/palme/?test=cruce', address).href);
  await page.getByRole('heading', { name: 'Palme 2.5D: test de stres' }).waitFor();
  const palmCanvases = page.locator('.palm-panel canvas');
  assert.equal(await palmCanvases.count(), 3);
  await page.waitForFunction(() => [...document.querySelectorAll('.palm-panel canvas')].every((c) => c.dataset.test === 'cruce' &&
    Number(c.dataset.frame) > 3), null, { timeout: 20000 });
  await page.getByRole('button', { name: 'Pauză', exact: true }).click();
  const palmBefore = await palmCanvases.last().screenshot();
  await page.locator('#frame').evaluate((slider) => {
    slider.value = String(Number(slider.value) > 40 ? 10 : 70);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.ok(!(await palmCanvases.last().screenshot()).equals(palmBefore), 'Derularea trebuie să redeseneze palmele');
  await page.waitForFunction(() => document.body.dataset.report === 'gata', null, { timeout: 120000 });
  assert.equal(await page.locator('#report-rows tr').count(), 6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errors, []);
  assert.deepEqual(mp4Requests, []);
  console.log('PREVIEW_OK', address);
} finally {
  await browser.close();
}
