import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startPreview } from './studio-preview.mjs';
import { episode } from '../studio/episode.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'foaie-cadre.png' },
    columns: { type: 'string', default: '3' },
    source: { type: 'string', default: 'three' },
    width: { type: 'string', default: '384' },
  },
});
const [clip, ...items] = positionals;
const frames = items.flatMap((arg) => arg.split(',')).map(Number);
const columns = Number(values.columns);
const width = Number(values.width);
const source = values.source;
if (!/^[a-z0-9-]+$/.test(clip ?? '') || !frames.length || frames.length > 48 ||
    frames.some((frame) => !Number.isSafeInteger(frame) || frame < 1) ||
    !Number.isInteger(columns) || columns < 1 || columns > 8 ||
    !Number.isInteger(width) || width < 160 || width > 960 || width % 16 !== 0 ||
    !['three', 'blender', 'ambele'].includes(source) || (source !== 'three' && clip !== 'episod')) {
  throw new Error('Utilizare: npm run sheet -- episod 1 1485 2879 [--source three|blender|ambele] [--out foaie.png]. Pentru un clip de atelier, înlocuiește episod cu ID-ul clipului.');
}
const height = width*9/16;
const server = await startPreview(0);
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_BIN && { executablePath: process.env.CHROMIUM_BIN }),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base + (clip === 'episod' ? '/?export' : `/asamblare/?clip=${clip}&export`));
  await page.waitForFunction((isEpisode) => isEpisode ? window.captureEpisode : window.captureClip, clip === 'episod');
  const media = await page.evaluate(({ clip, frames, columns, width, height, source, file }) => {
    async function sheet() {
      const film = clip === 'episod' ? window.captureEpisode : window.captureClip;
      if (clip !== 'episod' && film.id !== clip) throw new Error(`Clip necunoscut: ${clip}`);
      const fps = film.fps ?? 24;
      const end = film.end ?? Math.ceil(film.duration*fps);
      if (frames.some((frame) => frame > end)) throw new Error(`Ultimul cadru disponibil este ${end}.`);
      const count = source === 'ambele' ? 2 : 1;
      const gutter = 10;
      const cellWidth = width*count + (count-1)*gutter;
      const cellHeight = height + 35;
      const cols = Math.min(columns, frames.length);
      const canvas = document.createElement('canvas');
      canvas.width = cols * (cellWidth+gutter) + gutter;
      canvas.height = Math.ceil(frames.length/cols) * (cellHeight+gutter) + gutter;
      const pen = canvas.getContext('2d');
      pen.fillStyle = '#261e18';
      pen.fillRect(0,0,canvas.width,canvas.height);

      function event(element, name) {
        return new Promise((resolve, reject) => {
          const error = () => reject(new Error('Referința MP4 nu a putut fi citită.'));
          element.addEventListener('error', error, { once: true });
          element.addEventListener(name, () => {
            element.removeEventListener('error', error);
            resolve();
          }, { once: true });
        });
      }

      let reference;
      if (source !== 'three') {
        reference = document.createElement('video');
        reference.muted = true;
        reference.preload = 'auto';
        const ready = event(reference, 'loadeddata');
        reference.src = '/media/' + file;
        await ready;
      }

      for (const [index, frame] of frames.entries()) {
        const x = gutter + index%cols * (cellWidth+gutter);
        const y = gutter + Math.floor(index/cols) * (cellHeight+gutter);
        let nextX = x;
        const time = (frame-1)/fps;
        pen.font = '14px system-ui';
        pen.fillStyle = '#fae5bf';
        if (source !== 'blender') {
          const data = await (clip === 'episod' ? film.png(frame,width,height) : film.png(time,width,height));
          const image = new Image();
          image.src = data.startsWith('data:') ? data : 'data:image/png;base64,' + data;
          await image.decode();
          pen.drawImage(image, x, y, width, height);
          pen.fillText(`Three.js · cadru ${frame} · ${time.toFixed(2)} s`, x, y+height+21);
          nextX += width+gutter;
        }
        if (reference) {
          const ready = event(reference, 'seeked');
          reference.currentTime = time+.25/fps;
          await ready;
          const left = source === 'ambele' ? nextX : x;
          pen.drawImage(reference, left, y, width, height);
          pen.fillText(`Blender MP4 · cadru ${frame}`, left, y+height+21);
        }
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }
    return sheet();
  }, { clip, frames, columns, width, height, source, file: episode.file });
  const output = resolve(values.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(media, 'base64'));
  console.log(output);
} finally {
  await browser?.close();
  server.close();
}
