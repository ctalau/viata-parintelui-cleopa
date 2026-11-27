// Cadrele intermediare ale comparației mâinilor (3D stânga, 2D dreapta), din pagina /comparatie-maini/.
//   node tools/frames-hands.mjs cruce [pas] [primul] [ultimul] [ieșire.png]
// Foaia de cadre a unei variante, la cadrele alese (webp, ca în atelier):
//   node tools/frames-hands.mjs cruce --sheet 3d 1,24,38 studio/comparatie-maini/foi/cruce.webp
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreview } from './studio-preview.mjs';

const args = process.argv.slice(2);
const slug = args[0] ?? 'cruce';
const sheet = args[1] === '--sheet' ? { mode: args[2], frames: args[3].split(',').map(Number), out: args[4] } : null;
const [step = '4', first = '1', last = '145', out = `/tmp/maini-${slug}.png`] = sheet ? [] : args.slice(1);
const server = await startPreview(0);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/comparatie-maini/?clip=mama-${slug}`);
  await page.waitForSelector('#timeline:not([hidden])', { timeout: 120000 });
  const frames = [];
  if (!sheet) for (let f = Number(first); f <= Number(last); f += Number(step)) frames.push(f);
  const data = await page.evaluate(async ({ frames, sheet }) => {
    const slider = document.getElementById('frame');
    const a = document.getElementById('model-3d'), b = document.getElementById('model-2d');
    const show = (f) => { slider.value = f; slider.dispatchEvent(new Event('input')); };
    const c = document.createElement('canvas');
    const p = c.getContext('2d');
    if (sheet) {
      const source = sheet.mode === '3d' ? a : b, w = 400, h = 225, gap = 12, cols = 5;
      c.width = cols * (w + gap) + gap; c.height = Math.ceil(sheet.frames.length / cols) * (h + 38) + gap;
      p.fillStyle = '#261e18'; p.fillRect(0, 0, c.width, c.height);
      p.font = '15px sans-serif'; p.fillStyle = '#efe4d2';
      sheet.frames.forEach((f, i) => {
        show(f);
        const x = gap + (i % cols) * (w + gap), y = gap + Math.floor(i / cols) * (h + 38);
        p.drawImage(source, x, y, w, h);
        p.fillText(`Three.js · cadru ${f} · ${((f - 1) / 24).toFixed(2)} s`, x, y + h + 22);
      });
      return c.toDataURL('image/webp', .86);
    }
    const w = 240, h = Math.round(w * .78), cols = 5;
    c.width = cols * (2 * w + 14); c.height = Math.ceil(frames.length / cols) * (h + 18);
    p.fillStyle = '#111'; p.fillRect(0, 0, c.width, c.height);
    p.font = '13px sans-serif'; p.fillStyle = '#fff';
    frames.forEach((f, i) => {
      show(f);
      const x = (i % cols) * (2 * w + 14), y = Math.floor(i / cols) * (h + 18);
      for (const [k, cv] of [[0, a], [1, b]]) {
        p.drawImage(cv, cv.width * .25, 0, cv.width * .5, cv.width * .5 * .78, x + k * (w + 2), y, w, h);
      }
      p.fillText(`${f}`, x + 3, y + h + 14);
    });
    return c.toDataURL('image/png');
  }, { frames, sheet });
  const file = sheet ? sheet.out : out;
  await writeFile(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log(file);
} finally { await browser.close(); server.close(); }
